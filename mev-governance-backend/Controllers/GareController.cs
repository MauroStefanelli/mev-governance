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
            fullText = ContractParserService.ExtractFullText(stream, maxChars: 80000);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura PDF: " + ex.Message });
        }

        if (string.IsNullOrWhiteSpace(fullText) || fullText.Length < 100)
            return BadRequest(new { message = "Il PDF non contiene testo leggibile o e' troppo corto." });

        // Comprimi spazi multipli e limita a 6000 char — Capgemini va in 504 con input maggiori
        var compressed = System.Text.RegularExpressions.Regex.Replace(fullText, @"\s{2,}", " ").Trim();
        var snippet = compressed.Length > 6000 ? compressed[..6000] + "\n[...troncato...]" : compressed;

        // Prompt minimalista: Capgemini non regge prompt lunghi
        var instruction = "Sei un esperto di gare d'appalto IT italiane. Analizza il documento e rispondi SOLO con JSON puro (no markdown). " +
            "Estrai i seguenti campi: titolo, sintesi, oggetto, committente, importoBase, scadenza, " +
            "allegatiCitati (array di stringhe con nomi file citati), " +
            "tow (array di oggetti con campi id/descrizione/quantita/unitaMisura/importo/note — i TOW sono Transazioni di Lavoro, cercali ovunque nel documento), " +
            "sezioni (array con numero/titolo/sintesi), " +
            "requisitiTecnici (array di stringhe), " +
            "documentiRichiesti (array con nome/tipo/obbligatorio/dettagli/allegatiRiferimento), " +
            "criteriValutazione (array con criterio/peso), " +
            "proposte con sotto-campi: tecnica (array con sezione/desc/dettagli/allegatiRiferimento), economica (array con voce/gg/tariffa/importo/dettagli), piano (array con milestone/data/durata/owner/stato), " +
            "note. Rispondi ESCLUSIVAMENTE con JSON valido, nessun testo aggiuntivo.";

        var userMessage = $"File: {file.FileName}\n\nTESTO:\n{snippet}";

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
