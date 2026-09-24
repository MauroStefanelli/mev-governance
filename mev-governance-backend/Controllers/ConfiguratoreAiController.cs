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

    // Legge la API key personale dell'utente corrente (se presente)
    private string? GetUserAiKey()
    {
        var idClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(idClaim, out var userId)) return null;
        var user = _db.Users.Find(userId);
        return string.IsNullOrWhiteSpace(user?.AiApiKey) ? null : user.AiApiKey;
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
            var (analysis, provider, model, usage) = await _ai.AnalyzeAsync(context, GetUserAiKey());
            return Ok(new { analysis, provider, model, usage });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = ex.Message });
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
            var (analysis, provider, model, usage) = await _ai.DevelopmentAsync(context, GetUserAiKey());
            return Ok(new { analysis, provider, model, usage });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = ex.Message });
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
        var (ok, model, error) = await _ai.TestAsync();
        return ok
            ? Ok(new { ok, model })
            : StatusCode(502, new { ok, model, message = error });
    }
}