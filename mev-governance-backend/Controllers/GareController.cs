using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
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

        // Prepara il contesto per l'AI come JsonObject → serializza → deserializza come JsonElement
        var snippet = fullText.Length > 30000 ? fullText[..30000] + "\n[... testo troncato ...]" : fullText;

        var aiCtxObj = new JsonObject
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

        // Serializza e rideserializza come JsonElement (firma attesa da AiService)
        var aiCtxJson = aiCtxObj.ToJsonString();
        var aiCtxElement = JsonSerializer.Deserialize<JsonElement>(aiCtxJson);

        try
        {
            var (key, ep, mdl, sty, auth) = GetUserAiSettings();
            var (analysis, provider, usedModel, usage) = await _ai.AnalyzeAsync(aiCtxElement, key, ep, mdl, sty, auth);

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
