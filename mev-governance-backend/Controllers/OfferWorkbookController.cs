using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Controllers;

// «Tabella di offerta · Excel HLD». The Excel model is the same for every initiative of a lot, so it is saved once here and every export starts from it.
// Updating it adds a version (the last Keep are kept); a file sent together with an export is used for that export only and is never saved.
[ApiController, Authorize]
[Route("api/configuratore/offer-workbook")]
public class OfferWorkbookController : BaseController
{
    public const int MaxBytes = 10 * 1024 * 1024;
    public const int Keep = 5;
    private readonly AppDbContext db;
    public OfferWorkbookController(AppDbContext db) { this.db = db; }

    private bool CanWork => User.IsInRole("Admin") || User.IsInRole("Developer") || User.IsInRole("SuperAdmin");
    private bool CanUse => CanWork || User.IsInRole("Bid Manager");
    private static string? LotOf(string? lot) { var value = (lot ?? "").Trim(); return value.Length is > 0 and <= 16 && value.All(char.IsLetterOrDigit) ? value : null; }
    private static object View(OfferWorkbookTemplate t) => new { t.Version, t.FileName, t.Size, t.Sha256, t.UploadedBy, t.UploadedByFullName, t.UploadedAt };

    // What is saved for the lot: the version in use and the previous ones.
    [HttpGet("template")]
    public async Task<IActionResult> Status([FromQuery] string lot)
    {
        if (!CanUse || GetAmbienteId() <= 0) return Forbid();
        if (LotOf(lot) is not { } key) return BadRequest(new { message = "Indica il lotto." });
        var versions = await db.OfferWorkbookTemplates.AsNoTracking().Where(t => t.AmbienteId == GetAmbienteId() && t.Lot == key).OrderByDescending(t => t.Version).ToListAsync();
        return Ok(new { lot = key, current = versions.Count > 0 ? View(versions[0]) : null, previous = versions.Skip(1).Select(View) });
    }

    // Adds the model (or a new version of it). The file is checked as for an export, for this lot, BEFORE it is saved: a wrong file never replaces a good one.
    [HttpPost("template"), RequestSizeLimit(MaxBytes + 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file, [FromForm] string lot)
    {
        if (!CanWork || GetAmbienteId() <= 0) return Forbid();
        if (LotOf(lot) is not { } key) return BadRequest(new { message = "Indica il lotto." });
        if (file == null || file.Length == 0 || file.Length > MaxBytes || !file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Scegli il modello originale in formato XLSX (massimo 10 MB)." });
        byte[] content;
        await using (var input = file.OpenReadStream()) { using var memory = new MemoryStream(); await input.CopyToAsync(memory); content = memory.ToArray(); }
        try { OfferWorkbookExporter.ValidateTemplate(new MemoryStream(content), key); }
        catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        var sha = Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
        var environment = GetAmbienteId();
        var versions = await db.OfferWorkbookTemplates.Where(t => t.AmbienteId == environment && t.Lot == key).OrderByDescending(t => t.Version).ToListAsync();
        // The same file as the one in use is not a new version.
        if (versions.Count > 0 && versions[0].Sha256 == sha) return Ok(new { unchanged = true, current = View(versions[0]) });
        var saved = new OfferWorkbookTemplate { AmbienteId = environment, Lot = key, Version = (versions.FirstOrDefault()?.Version ?? 0) + 1, FileName = Path.GetFileName(file.FileName), Size = content.Length,
            Sha256 = sha, UploadedBy = User.Identity?.Name ?? "", UploadedByFullName = User.FindFirstValue("fullName") ?? "", UploadedAt = DateTime.UtcNow, Content = content };
        db.OfferWorkbookTemplates.Add(saved);
        foreach (var old in versions.Skip(Keep - 1)) db.OfferWorkbookTemplates.Remove(old);
        await db.SaveChangesAsync();
        return Ok(new { unchanged = false, current = View(saved) });
    }

    // The saved model as a file (the version in use, or the one asked for).
    [HttpGet("template/file")]
    public async Task<IActionResult> Download([FromQuery] string lot, [FromQuery] int? version)
    {
        if (!CanUse || GetAmbienteId() <= 0) return Forbid();
        if (LotOf(lot) is not { } key) return BadRequest(new { message = "Indica il lotto." });
        var query = db.OfferWorkbookTemplates.AsNoTracking().Where(t => t.AmbienteId == GetAmbienteId() && t.Lot == key);
        var found = version is > 0 ? await query.FirstOrDefaultAsync(t => t.Version == version) : await query.OrderByDescending(t => t.Version).FirstOrDefaultAsync();
        if (found == null) return NotFound(new { message = "Nessun modello salvato per questo lotto." });
        return File(found.Content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", found.FileName);
    }

    // Puts a previous version back in use: it becomes a NEW version (copy), so nothing is lost and the history stays in order.
    [HttpPost("template/restore")]
    public async Task<IActionResult> Restore([FromQuery] string lot, [FromQuery] int version)
    {
        if (!CanWork || GetAmbienteId() <= 0) return Forbid();
        if (LotOf(lot) is not { } key) return BadRequest(new { message = "Indica il lotto." });
        var environment = GetAmbienteId();
        var versions = await db.OfferWorkbookTemplates.Where(t => t.AmbienteId == environment && t.Lot == key).OrderByDescending(t => t.Version).ToListAsync();
        var source = versions.FirstOrDefault(t => t.Version == version);
        if (source == null) return NotFound(new { message = "Versione non trovata (restano solo le ultime " + Keep + ")." });
        if (versions[0].Version == version) return Ok(new { unchanged = true, current = View(versions[0]) });
        var saved = new OfferWorkbookTemplate { AmbienteId = environment, Lot = key, Version = versions[0].Version + 1, FileName = source.FileName, Size = source.Size, Sha256 = source.Sha256,
            UploadedBy = User.Identity?.Name ?? "", UploadedByFullName = User.FindFirstValue("fullName") ?? "", UploadedAt = DateTime.UtcNow, Content = source.Content };
        db.OfferWorkbookTemplates.Add(saved);
        foreach (var old in versions.Skip(Keep - 1)) db.OfferWorkbookTemplates.Remove(old);
        await db.SaveChangesAsync();
        return Ok(new { unchanged = false, current = View(saved) });
    }

    // The export. It starts from the saved model of the lot; a file sent with the request replaces it for this export only (and is not saved).
    [HttpPost, RequestSizeLimit(12 * 1024 * 1024)]
    public async Task<IActionResult> Export(IFormFile? template, [FromForm] string payload)
    {
        if (!CanUse || GetAmbienteId() <= 0) return Forbid();
        OfferWorkbookRequest request;
        try { request = JsonSerializer.Deserialize<OfferWorkbookRequest>(payload, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new ArgumentException("Dati mancanti."); }
        catch (Exception) { return BadRequest(new { message = "Dati dell’iniziativa non validi." }); }
        byte[] model;
        if (template != null && template.Length > 0)
        {
            if (template.Length > MaxBytes || !template.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)) return BadRequest(new { message = "Seleziona il template originale XLSX (massimo 10 MB)." });
            await using var input = template.OpenReadStream(); using var memory = new MemoryStream(); await input.CopyToAsync(memory); model = memory.ToArray();
        }
        else
        {
            var key = LotOf(request.Lot) ?? "";
            var saved = key.Length == 0 ? null : await db.OfferWorkbookTemplates.AsNoTracking().Where(t => t.AmbienteId == GetAmbienteId() && t.Lot == key).OrderByDescending(t => t.Version).FirstOrDefaultAsync();
            if (saved == null) return BadRequest(new { message = $"Nessun modello salvato per il lotto {request.Lot}: caricalo una volta in «Tabella di offerta · Excel HLD», oppure scegli un file per questa sola esportazione." });
            model = saved.Content;
        }
        try
        {
            var result = OfferWorkbookExporter.Generate(new MemoryStream(model), request);
            return File(result, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"Tabella Offerta - {request.Code}.xlsx");
        }
        catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        catch (Exception) { return BadRequest(new { message = "Impossibile elaborare il template. Verifica struttura, formule e formato XLSX originale." }); }
    }
}
