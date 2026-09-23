using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MevGovernanceBackend.Services;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/configuratore/ai")]
[Authorize]
public class ConfiguratoreAiController : ControllerBase
{
    private readonly AiService _ai;

    public ConfiguratoreAiController(AiService ai)
    {
        _ai = ai;
    }

    private bool CanAccess()
    {
        return User.IsInRole("SuperAdmin") || User.IsInRole("Developer");
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
            var (analysis, provider, model, usage) = await _ai.AnalyzeAsync(context);
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
            var (analysis, provider, model, usage) = await _ai.DevelopmentAsync(context);
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