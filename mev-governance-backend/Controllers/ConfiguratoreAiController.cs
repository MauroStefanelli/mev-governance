using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MevGovernanceBackend.Services;
using MevGovernanceBackend.Data;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/configuratore/ai")]
[Authorize]
public class ConfiguratoreAiController : ControllerBase
{
    private readonly AiService _ai;
    private readonly AppDbContext _db;

    public ConfiguratoreAiController(AiService ai, AppDbContext db)
    {
        _ai = ai;
        _db = db;
    }

    private bool CanAccess()
    {
        return User.IsInRole("SuperAdmin") || User.IsInRole("Developer");
    }

    // Legge le impostazioni AI personali dell'utente corrente
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

    // ============================================================
    // POST /api/configuratore/ai/analyze
    // Body: contesto completo dell'iniziativa (stesso formato del
    // payload che il Configuratore inviava a /api/ai/analyze).
    // ============================================================
    [HttpPost("analyze")]
    public async Task<IActionResult> Analyze([FromBody] JsonElement context)
    {
        if (!CanAccess()) return Forbid();
        if (context.ValueKind != JsonValueKind.Object || !context.EnumerateObject().Any())
            return BadRequest(new { message = "Contesto non valido" });

        try
        {
            var (key, ep, mdl, sty, auth) = GetUserAiSettings();
            var (analysis, provider, model, usage) = await _ai.AnalyzeAsync(context, key, ep, mdl, sty, auth);
            return Ok(new { analysis, provider, model, usage });
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("API key") || msg.Contains("401") || msg.Contains("403") || msg.Contains("Unauthorized"))
                return StatusCode(401, new { message = "Chiave AI non configurata o non valida. Vai su Profilo → API Key AI e inserisci la tua chiave Capgemini o OpenAI." });
            return StatusCode(500, new { message = msg });
        }
    }

    // ============================================================
    // POST /api/configuratore/ai/development
    // ============================================================
    [HttpPost("development")]
    public async Task<IActionResult> Development([FromBody] JsonElement context)
    {
        if (!CanAccess()) return Forbid();
        if (context.ValueKind != JsonValueKind.Object || !context.EnumerateObject().Any())
            return BadRequest(new { message = "Contesto non valido" });

        try
        {
            var (key, ep, mdl, sty, auth) = GetUserAiSettings();
            var (analysis, provider, model, usage) = await _ai.DevelopmentAsync(context, key, ep, mdl, sty, auth);
            return Ok(new { analysis, provider, model, usage });
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("API key") || msg.Contains("401") || msg.Contains("403") || msg.Contains("Unauthorized"))
                return StatusCode(401, new { message = "Chiave AI non configurata o non valida. Vai su Profilo → API Key AI e inserisci la tua chiave Capgemini o OpenAI." });
            return StatusCode(500, new { message = msg });
        }
    }

    // ============================================================
    // GET /api/configuratore/ai/test — verifica configurazione
    // (potrebbe rivelare l'errore di chiave all'utente finale)
    // ============================================================
    [HttpGet("test")]
    public async Task<IActionResult> Test()
    {
        if (!CanAccess()) return Forbid();
        var (key, ep, mdl, sty, auth) = GetUserAiSettings();
        var (ok, model, error) = await _ai.TestAsync(key, ep, mdl, sty, auth);
        return ok
            ? Ok(new { ok, model })
            : StatusCode(502, new { ok, model, message = error });
    }

    // ============================================================
    // GET /api/configuratore/ai/models — lista modelli disponibili
    // sull'endpoint configurato dall'utente
    // ============================================================
    [HttpGet("models")]
    public async Task<IActionResult> Models()
    {
        if (!CanAccess()) return Forbid();
        var (key, ep, mdl, sty, auth) = GetUserAiSettings();
        var (models, error) = await _ai.ListModelsAsync(key, ep, auth);
        if (error != null)
            return StatusCode(502, new { message = error });
        return Ok(new { models });
    }
}