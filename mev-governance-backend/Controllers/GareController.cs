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

    // POST /api/gare/analizza-capitolato
    // Campi form accettati:
    //   file            — PDF capitolato tecnico (obbligatorio)
    //   towFile_1       — PDF/XLSX listino prezzi TOW lotto 1 (opzionale)
    //   towFile_2       — PDF/XLSX listino prezzi TOW lotto 2 (opzionale)
    //   catalogFile_1   — PDF catalogo lotto 1 (opzionale)
    //   catalogFile_2   — PDF catalogo lotto 2 (opzionale)
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

        // 1) Estrai testo + righe TOW dal capitolato (un'unica lettura del file)
        string fullText;
        List<TowRow> towRowsFromCapitolato;
        try
        {
            // Prima passata: testo per l'AI
            using (var s = file.OpenReadStream())
                fullText = ContractParserService.ExtractRelevantPages(s, maxChars: 8000);
            // Seconda passata: estrazione geometrica righe TOW (id+descrizione+quantita)
            using (var s2 = file.OpenReadStream())
                towRowsFromCapitolato = ContractParserService.ExtractTowRows(s2);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura PDF: " + ex.Message });
        }

        if (string.IsNullOrWhiteSpace(fullText) || fullText.Length < 100)
            return BadRequest(new { message = "Il PDF non contiene testo leggibile o e' troppo corto." });

        // 2) Analisi AI per struttura gara + lotti (senza TOW e senza catalogo)
        var instruction = "Sei un esperto di gare d'appalto IT italiane. Analizza il documento e rispondi SOLO con JSON puro (no markdown). " +
            "Campi generali: titolo, sintesi, oggetto, committente, importoBase, scadenza, allegatiCitati (array stringhe), note. " +
            "Campo lotti: array di oggetti, uno per ogni lotto trovato. Se non ci sono lotti espliciti crea un unico lotto chiamato 'Gara'. " +
            "Ogni lotto ha: nome, descrizione, " +
            "sezioni (array con numero/titolo/sintesi — includi TUTTI i livelli es. 1, 1.1, 1.2, 2, 2.1), " +
            "requisitiTecnici (array stringhe), " +
            "documentiRichiesti (array con nome/tipo/obbligatorio/dettagli), " +
            "criteriValutazione (array con criterio/peso), " +
            "proposte: { tecnica (array con sezione/desc/dettagli), economica (array con voce/gg/tariffa/importo/dettagli), piano (array con milestone/data/durata/owner/stato) }. " +
            "Rispondi ESCLUSIVAMENTE con JSON valido, nessun testo aggiuntivo.";

        var userMessage = $"File: {file.FileName}\n\nTESTO:\n{fullText}";

        JsonObject analysis;
        string provider, usedModel;
        try
        {
            var (key, ep, mdl, sty, auth) = GetUserAiSettings();
            JsonObject? usage;
            (analysis, provider, usedModel, usage) = await _ai.AnalyzeWithInstructionsAsync(
                instruction, userMessage, key, ep, mdl, sty, auth);
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("API key") || msg.Contains("401") || msg.Contains("403") || msg.Contains("Unauthorized"))
                return StatusCode(401, new { message = "Chiave AI non configurata o non valida." });
            return StatusCode(500, new { message = "Errore analisi AI: " + msg });
        }

        // 3) Per ogni lotto: leggi towFile_N e catalogFile_N con i parser collaudati
        if (analysis.TryGetPropertyValue("lotti", out var lottiNode) && lottiNode is JsonArray lotti)
        {
            for (int i = 0; i < lotti.Count; i++)
            {
                if (lotti[i] is not JsonObject lotto) continue;
                var lotNum = i + 1;

                // ── TOW: merge descrizioni (dal capitolato) + importi (dal listino prezzi) ──
                var towFile = form.Files.GetFile($"towFile_{lotNum}");

                // Righe TOW del capitolato per questo lotto (filtra per prefisso numerico)
                var towCapitolato = towRowsFromCapitolato
                    .Where(r => {
                        var prefix = r.Id.Length >= 5 ? r.Id.Substring(3, 1) : "";
                        return prefix == lotNum.ToString() || r.Id.StartsWith($"TOW0{lotNum}.", StringComparison.OrdinalIgnoreCase);
                    })
                    .ToDictionary(r => r.Id.ToUpperInvariant(), r => r);

                Dictionary<string, double> towPrices = new();
                string towSource = "";
                if (towFile != null && towFile.Length > 0)
                {
                    try
                    {
                        using var ts = towFile.OpenReadStream();
                        if (towFile.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase) ||
                            towFile.FileName.EndsWith(".xls",  StringComparison.OrdinalIgnoreCase))
                            towPrices = ContractParserService.ParseTowPriceExcel(ts, lotNum);
                        else
                            towPrices = ContractParserService.ParseTowPricePdf(ts, lotNum);
                        towSource = towFile.FileName;
                    }
                    catch { /* ignora errori, procedi senza prezzi */ }
                }

                // Costruisci array tow finale: unione di tutte le chiavi
                var allTowKeys = towCapitolato.Keys
                    .Union(towPrices.Keys.Select(k => k.ToUpperInvariant()))
                    .Distinct()
                    .OrderBy(k => k);

                var towArr = new JsonArray();
                foreach (var key in allTowKeys)
                {
                    towCapitolato.TryGetValue(key, out var row);
                    towPrices.TryGetValue(key, out var price);
                    // Se non trovato in towPrices prova anche senza normalizzazione case
                    if (price == 0)
                        towPrices.TryGetValue(key.ToUpperInvariant(), out price);
                    var node = new JsonObject
                    {
                        ["id"]          = key,
                        ["descrizione"] = row?.Descrizione ?? "",
                        ["quantita"]    = row?.Quantita.HasValue == true ? JsonValue.Create(row.Quantita!.Value) : null,
                        ["importo"]     = price > 0 ? JsonValue.Create(price) : (row?.Importo.HasValue == true ? JsonValue.Create(row.Importo!.Value) : null),
                    };
                    towArr.Add(node);
                }
                if (towArr.Count > 0)
                {
                    lotto["tow"] = towArr;
                    if (!string.IsNullOrEmpty(towSource)) lotto["towSource"] = towSource;
                }

                // ── Catalogo ─────────────────────────────────────────────────
                var catalogFile = form.Files.GetFile($"catalogFile_{lotNum}");
                if (catalogFile != null && catalogFile.Length > 0 &&
                    catalogFile.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        using var cs = catalogFile.OpenReadStream();
                        var entries = ContractParserService.ParseCatalogPdf(cs, lotNum);
                        var catArr = new JsonArray();
                        foreach (var e in entries)
                            catArr.Add(new JsonObject
                            {
                                ["id"]          = e.Id,
                                ["ambito"]       = e.Ambito,
                                ["nome"]         = e.Nome,
                                ["descrizione"]  = e.Descrizione,
                                ["prezziSemplice"]   = e.Prezzi.Realizzazione.Semplice,
                                ["prezziMedio"]      = e.Prezzi.Realizzazione.Medio,
                                ["prezziComplesso"]  = e.Prezzi.Realizzazione.Complesso,
                            });
                        lotto["catalogo"]       = catArr;
                        lotto["catalogoSource"] = catalogFile.FileName;
                    }
                    catch { /* ignora errori parsing catalogo */ }
                }
            }
        }

        return Ok(new
        {
            ok         = true,
            fileName   = file.FileName,
            textLength = fullText.Length,
            provider,
            model      = usedModel,
            analysis,
        });
    }
}
