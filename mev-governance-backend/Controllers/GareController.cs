using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Nodes;
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

    private (string? key, string? endpoint, string? model, string? authMode) GetUserAiSettings()
    {
        var userId = User.FindFirst("sub")?.Value
                  ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userId, out var uid)) return (null, null, null, null);
        var setting = _db.UserSettings.FirstOrDefault(s => s.UserId == uid);
        if (setting == null) return (null, null, null, null);
        return (setting.AiApiKey, setting.AiEndpoint, setting.AiModel, setting.AiAuthMode);
    }

    // POST /api/gare/analizza-capitolato
    // Accetta un file PDF multipart e restituisce sintesi AI + sezioni estratte
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

        // Estrae il testo dal PDF
        string fullText;
        try
        {
            using var stream = file.OpenReadStream();
            fullText = ContractParserService.ExtractFullText(stream, maxChars: 60000);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura PDF: " + ex.Message });
        }

        if (string.IsNullOrWhiteSpace(fullText) || fullText.Length < 100)
            return BadRequest(new { message = "Il PDF non contiene testo leggibile o e' troppo corto." });

        // Prepara il contesto per l'AI
        var snippet = fullText.Length > 30000 ? fullText[..30000] + "\n[... testo troncato ...]" : fullText;

        var aiCtx = new JsonObject
        {
            ["task"]        = "bid_document_analysis",
            ["fileName"]    = file.FileName,
            ["textLength"]  = fullText.Length,
            ["instruction"] = @"Analizza questo documento di gara/capitolato tecnico.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido con questa struttura:
{
  ""titolo"": ""titolo ufficiale del documento"",
  ""sintesi"": ""sintesi esecutiva del capitolato in 4-6 frasi: oggetto della gara, committente, ambito tecnologico, requisiti principali"",
  ""oggetto"": ""oggetto specifico della fornitura/servizio"",
  ""committente"": ""nome ente committente"",
  ""importoBase"": ""importo a base d'asta se presente, altrimenti null"",
  ""scadenza"": ""data scadenza presentazione offerte se presente, altrimenti null"",
  ""sezioni"": [
    { ""numero"": ""1"", ""titolo"": ""..."", ""sintesi"": ""sintesi della sezione in 1-2 frasi"" }
  ],
  ""requisitiTecnici"": [""requisito 1"", ""requisito 2""],
  ""documentiRichiesti"": [
    { ""nome"": ""..."", ""tipo"": ""tecnico|economico|amministrativo|legale"", ""obbligatorio"": true }
  ],
  ""criteriValutazione"": [
    { ""criterio"": ""..."", ""peso"": ""xx punti o xx%"" }
  ],
  ""note"": ""eventuali note importanti non categorizzate""
}",
            ["documentText"] = snippet,
        };

        try
        {
            var (userKey, userEndpoint, userModel, userAuthMode) = GetUserAiSettings();
            var globalKey      = _config["OPENAI_API_KEY"] ?? _config["AI_API_KEY"] ?? "";
            var globalEndpoint = _config["OPENAI_API_BASE"] ?? _config["AI_API_BASE"] ?? "";
            var globalModel    = _config["AI_MODEL"] ?? "";

            var apiKey   = !string.IsNullOrWhiteSpace(userKey)      ? userKey      : globalKey;
            var endpoint = !string.IsNullOrWhiteSpace(userEndpoint) ? userEndpoint : globalEndpoint;
            var model    = !string.IsNullOrWhiteSpace(userModel)    ? userModel    : globalModel;
            var authMode = !string.IsNullOrWhiteSpace(userAuthMode) ? userAuthMode : "bearer";

            var (analysis, provider, usedModel, _) = await _ai.AnalyzeAsync(
                apiKey, endpoint, model, authMode, aiCtx.ToJsonString());

            return Ok(new
            {
                ok          = true,
                fileName    = file.FileName,
                textLength  = fullText.Length,
                provider,
                model       = usedModel,
                analysis,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore analisi AI: " + ex.Message });
        }
    }
}
