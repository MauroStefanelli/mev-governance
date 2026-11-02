using System.Text.Json;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MevGovernanceBackend.Controllers;

[ApiController, Authorize]
[Route("api/configuratore/offer-workbook")]
public class OfferWorkbookController : ControllerBase
{
    [HttpPost, RequestSizeLimit(12 * 1024 * 1024)]
    public async Task<IActionResult> Export(IFormFile template, [FromForm] string payload)
    {
        if (!(User.IsInRole("Admin") || User.IsInRole("Developer") || User.IsInRole("SuperAdmin") || User.IsInRole("Bid Manager"))) return Forbid();
        if (template == null || template.Length == 0 || template.Length > 10 * 1024 * 1024 || !template.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Seleziona il template originale XLSX (massimo 10 MB)." });
        try
        {
            var request = JsonSerializer.Deserialize<OfferWorkbookRequest>(payload, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new ArgumentException("Dati mancanti.");
            await using var source = template.OpenReadStream();
            var result = OfferWorkbookExporter.Generate(source, request);
            return File(result, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"Tabella Offerta - {request.Code}.xlsx");
        }
        catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        catch (Exception) { return BadRequest(new { message = "Impossibile elaborare il template. Verifica struttura, formule e formato XLSX originale." }); }
    }
}
