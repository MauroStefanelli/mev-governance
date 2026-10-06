using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MevGovernanceBackend.Services;
using MevGovernanceBackend.Data;
using System.Text.Json.Nodes;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/gare")]
[Authorize]
public class GareController : ControllerBase
{
    private readonly AiService _ai;
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public GareController(AiService ai, AppDbContext db, IConfiguration config)
    {
        _ai = ai;
        _db = db;
        _config = config;
    }

    private bool CanAccess() =>
        User.IsInRole("SuperAdmin") || User.IsInRole("Bid Manager") ||
        User.IsInRole("Admin")      || User.IsInRole("Developer");

    private (string? key, string? endpoint, string? model, string? style, string? authMode) GetUserAiSettings()
    {
        var idClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(idClaim, out var userId)) return (null, null, null, null, null);
        var user = _db.Users.Find(userId);
        if (user == null) return (null, null, null, null, null);
        return (
            string.IsNullOrWhiteSpace(user.AiApiKey)   ? null : user.AiApiKey,
            string.IsNullOrWhiteSpace(user.AiEndpoint) ? null : user.AiEndpoint,
            string.IsNullOrWhiteSpace(user.AiModel)    ? null : user.AiModel,
            string.IsNullOrWhiteSpace(user.AiStyle)    ? null : user.AiStyle,
            string.IsNullOrWhiteSpace(user.AiAuthMode) ? null : user.AiAuthMode
        );
    }

    [HttpPost("analizza-capitolato")]
    public async Task<IActionResult> AnalizzaCapitolato()
    {
        if (!CanAccess()) return Forbid();

        var form = Request.Form;
        var file = form.Files.GetFile("file");
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Nessun file ricevuto. Invia il PDF come campo 'file'." });

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Sono accettati solo file PDF." });

        // 1) Estrai TOW direttamente dal PDF (parser geometrico, preciso come Gestione Contratti)
        List<TowRow> towRows;
        string fullText;
        try
        {
            using var s1 = file.OpenReadStream();
            towRows = ContractParserService.ExtractTowRows(s1);

            using var s2 = file.OpenReadStream();
            fullText = ContractParserService.ExtractRelevantPages(s2, maxChars: 8000);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura PDF: " + ex.Message });
        }

        if (string.IsNullOrWhiteSpace(fullText) || fullText.Length < 100)
            return BadRequest(new { message = "Il PDF non contiene testo leggibile o e' troppo corto." });

        // 2) Analisi AI per struttura generale + lotti (senza TOW — li iniettiamo noi)
        var instruction = "Sei un esperto di gare d'appalto IT italiane. Analizza il documento e rispondi SOLO con JSON puro (no markdown). " +
            "Campi generali: titolo, sintesi, oggetto, committente, importoBase, scadenza, allegatiCitati (array stringhe), note. " +
            "Campo lotti: array di oggetti, uno per ogni lotto trovato. Se non ci sono lotti espliciti crea un unico lotto chiamato 'Gara'. " +
            "Ogni lotto ha: nome, descrizione, " +
            "sezioni (array con numero/titolo/sintesi — includi TUTTI i livelli es. 1, 1.1, 1.2, 2, 2.1), " +
            "requisitiTecnici (array stringhe), " +
            "documentiRichiesti (array con nome/tipo/obbligatorio/dettagli), " +
            "criteriValutazione (array con criterio/peso), " +
            "proposte: { tecnica (array con sezione/desc/dettagli), economica (array con voce/gg/tariffa/importo/dettagli), piano (array con milestone/data/durata/owner/stato) }. " +
            "NON includere il campo tow: viene estratto automaticamente dal parser PDF. " +
            "Rispondi ESCLUSIVAMENTE con JSON valido, nessun testo aggiuntivo.";

        var userMessage = $"File: {file.FileName}\n\nTESTO:\n{fullText}";

        try
        {
            var (key, ep, mdl, sty, auth) = GetUserAiSettings();
            var (analysis, provider, usedModel, usage) = await _ai.AnalyzeWithInstructionsAsync(
                instruction, userMessage, key, ep, mdl, sty, auth);

            // 3) Inietta i TOW estratti dal parser nei lotti (distribuzione per numero lotto)
            if (analysis.TryGetPropertyValue("lotti", out var lottiNode) && lottiNode is JsonArray lotti)
            {
                // Raggruppa TOW per numero lotto (TOW01.x → lotto 1, TOW02.x → lotto 2, ecc.)
                var towByLot = new System.Collections.Generic.Dictionary<int, System.Collections.Generic.List<TowRow>>();
                foreach (var t in towRows)
                {
                    var m = System.Text.RegularExpressions.Regex.Match(t.Id, @"TOW0?(\d+)\.", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    var lotN = m.Success && int.TryParse(m.Groups[1].Value, out var n) ? n : 0;
                    if (!towByLot.ContainsKey(lotN)) towByLot[lotN] = new();
                    towByLot[lotN].Add(t);
                }

                for (int i = 0; i < lotti.Count; i++)
                {
                    if (lotti[i] is not JsonObject lotto) continue;
                    // Associa i TOW al lotto per indice (lotto 0 → towByLot[1] o [0])
                    var lotKey = towByLot.ContainsKey(i + 1) ? i + 1 : (towByLot.ContainsKey(0) ? 0 : -1);
                    var towList = lotKey >= 0 ? towByLot[lotKey] : towRows; // fallback: tutti i TOW al primo lotto
                    var towArr = new JsonArray();
                    foreach (var t in towList)
                    {
                        var obj = new JsonObject
                        {
                            ["id"]          = t.Id,
                            ["descrizione"] = t.Descrizione,
                        };
                        if (t.Quantita.HasValue)  obj["quantita"]  = t.Quantita.Value;
                        if (t.Importo.HasValue)   obj["importo"]   = t.Importo.Value;
                        towArr.Add(obj);
                    }
                    lotto["tow"] = towArr;
                }
            }
            else if (towRows.Count > 0)
            {
                // Nessun campo lotti nell'analisi: aggiungi tow al livello radice
                var towArr = new JsonArray();
                foreach (var t in towRows)
                {
                    var obj = new JsonObject { ["id"] = t.Id, ["descrizione"] = t.Descrizione };
                    if (t.Quantita.HasValue) obj["quantita"] = t.Quantita.Value;
                    if (t.Importo.HasValue)  obj["importo"]  = t.Importo.Value;
                    towArr.Add(obj);
                }
                analysis["tow"] = towArr;
            }

            return Ok(new
            {
                ok         = true,
                fileName   = file.FileName,
                textLength = fullText.Length,
                towCount   = towRows.Count,
                provider,
                model      = usedModel,
                analysis,
            });
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("API key") || msg.Contains("401") || msg.Contains("403") || msg.Contains("Unauthorized"))
                return StatusCode(401, new { message = "Chiave AI non configurata o non valida. Vai su Profilo → API Key AI e inserisci la tua chiave." });
            return StatusCode(500, new { message = "Errore analisi AI: " + msg });
        }
    }
}
