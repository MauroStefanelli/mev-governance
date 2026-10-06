using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MevGovernanceBackend.Services;
using MevGovernanceBackend.Data;

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

        string fullText;
        try
        {
            using var stream = file.OpenReadStream();
            // ExtractRelevantPages: prime 3 pagine + pagine con TOW/requisiti/criteri — max 8000 char
            fullText = ContractParserService.ExtractRelevantPages(stream, maxChars: 8000);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura PDF: " + ex.Message });
        }

        if (string.IsNullOrWhiteSpace(fullText) || fullText.Length < 100)
            return BadRequest(new { message = "Il PDF non contiene testo leggibile o e' troppo corto." });

        var snippet = fullText;

        // Prompt: struttura per lotti
        var instruction = "Sei un esperto di gare d'appalto IT italiane. Analizza il documento e rispondi SOLO con JSON puro (no markdown). " +
            "La struttura ha due livelli: dati generali della gara e poi i lotti. " +
            "Campi generali: titolo, sintesi, oggetto, committente, importoBase, scadenza, allegatiCitati (array stringhe), note. " +
            "Campo lotti: array di oggetti, uno per ogni lotto trovato nel documento. Se non ci sono lotti espliciti crea un unico lotto chiamato 'Gara'. " +
            "Ogni lotto ha: nome (es. 'Lotto 1 - Tracciatura'), descrizione, " +
            "sezioni (array con numero/titolo/sintesi), " +
            "requisitiTecnici (array stringhe), " +
            "tow (array con id/descrizione — i TOW sono Transazioni di Lavoro, cercali ovunque nel documento), " +
            "documentiRichiesti (array con nome/tipo/obbligatorio/dettagli), " +
            "criteriValutazione (array con criterio/peso), " +
            "proposte: { tecnica (array con sezione/desc/dettagli), economica (array con voce/gg/tariffa/importo/dettagli), piano (array con milestone/data/durata/owner/stato) }. " +
            "Rispondi ESCLUSIVAMENTE con JSON valido, nessun testo aggiuntivo.";

        var userMessage = $"File: {file.FileName}\n\nTESTO (pagine rilevanti):\n{snippet}";

        try
        {
            var (key, ep, mdl, sty, auth) = GetUserAiSettings();
            var (analysis, provider, usedModel, usage) = await _ai.AnalyzeWithInstructionsAsync(
                instruction, userMessage, key, ep, mdl, sty, auth);

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
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("API key") || msg.Contains("401") || msg.Contains("403") || msg.Contains("Unauthorized"))
                return StatusCode(401, new { message = "Chiave AI non configurata o non valida. Vai su Profilo → API Key AI e inserisci la tua chiave." });
            return StatusCode(500, new { message = "Errore analisi AI: " + msg });
        }
    }
}
