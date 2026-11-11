using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Controllers;

// Imports the knowledge written in the past by AI assistants (Markdown notes) as PROPOSALS of the rationale: nothing is born confirmed.
// One note per request, so a failure never loses the notes already read. Secrets stop a note before any AI sees it.
[ApiController, Authorize]
[Route("api/configuratore/history-import")]
public class HistoryImportController : BaseController
{
    public const int MaxNoteChars = 60_000;
    public const int MaxBulkDecision = 100;
    public const int PageSize = 50;
    private readonly AppDbContext db;
    private readonly IKnowledgeExtractor extractor;
    public HistoryImportController(AppDbContext db, IKnowledgeExtractor extractor) { this.db = db; this.extractor = extractor; }
    private bool CanWork => User.IsInRole("Admin") || User.IsInRole("Developer") || User.IsInRole("SuperAdmin");
    private bool CanRead => CanWork || User.IsInRole("Bid Manager");
    private (string Username, string FullName)? Who() { var u = User.Identity?.Name; return string.IsNullOrWhiteSpace(u) ? null : (u, User.FindFirstValue("fullName") ?? ""); }

    public static string Sha256Of(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();
    static string Slug(string value) => Regex.Replace(value.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
    public static string BucketFor(string system) => "storico-" + Slug(system);

    public record FileRequest(string? Path, string? FileName, string? Text, string? System, string? Goto, string? Author);
    public record CheckRequest(List<string>? Hashes);
    public record DecideRequest(List<long>? Ids, string? Decision);

    // Which notes were already read, by content: the browser asks before sending anything.
    [HttpPost("check")]
    public async Task<IActionResult> Check(CheckRequest request)
    {
        if (!CanRead || GetAmbienteId() <= 0 || Who() is null) return Forbid();
        var wanted = (request.Hashes ?? new()).Where(h => Regex.IsMatch(h ?? "", "^[0-9a-f]{64}$")).Distinct().Take(2000).ToList();
        var known = await db.KnowledgeImportFiles.AsNoTracking().Where(f => f.AmbienteId == GetAmbienteId() && wanted.Contains(f.Sha256)).Select(f => f.Sha256).ToListAsync();
        return Ok(new { known });
    }

    [HttpPost("file")]
    public async Task<IActionResult> ReadFile(FileRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || Who() is not { } who) return Forbid();
        var text = (request.Text ?? "").Replace("\r\n", "\n");
        var name = (request.FileName ?? "").Trim();
        var system = (request.System ?? "").Trim();
        if (name.Length == 0 || !name.EndsWith(".md", StringComparison.OrdinalIgnoreCase)) return BadRequest(new { message = "Si importano solo note Markdown (.md)." });
        if (text.Trim().Length == 0) return BadRequest(new { message = "La nota è vuota." });
        if (text.Length > MaxNoteChars) return BadRequest(new { message = $"La nota supera {MaxNoteChars} caratteri." });
        if (system.Length == 0 || system.Length > 120) return BadRequest(new { message = "Indica il sistema (massimo 120 caratteri)." });
        var initiative = (request.Goto ?? "").Trim().ToLowerInvariant();
        if (initiative.Length > 0 && !Regex.IsMatch(initiative, @"^[a-z0-9._-]{1,120}$")) return BadRequest(new { message = "GOTO non valido." });
        var environment = GetAmbienteId();

        // The server repeats the secret check: the browser is a convenience, never the guarantee. A note with a hit is NOT read and NOT recorded.
        var hits = SecretScanner.Scan(name, text);
        if (hits.Count > 0)
            return UnprocessableEntity(new { message = "La nota contiene credenziali e non viene letta.", code = "segreti",
                hits = hits.Select(h => new { rule = h.Rule, description = SecretScanner.Describe(h.Rule), line = h.Line }).ToList() });

        var sha = Sha256Of(text);
        if (await db.KnowledgeImportFiles.AnyAsync(f => f.AmbienteId == environment && f.Sha256 == sha)) return Ok(new { outcome = "gia-letto", proposals = 0 });

        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Forbid();
        var user = await db.Users.FindAsync(userId);
        if (user == null || !user.IsActive) return Forbid();

        ExtractionResult? result;
        try { result = await extractor.ExtractAsync(new ExtractionRequest(system, name, text), new AppUserAiSettings(user.AiApiKey, user.AiEndpoint, user.AiModel, user.AiStyle, user.AiAuthMode)); }
        catch (Exception) { return StatusCode(502, new { message = "Il servizio AI non è raggiungibile o la configurazione AI personale non è valida. La nota non è stata segnata come letta: puoi riprovare." }); }
        if (result == null) return StatusCode(502, new { message = "Il servizio AI non ha risposto nel formato richiesto. La nota non è stata segnata come letta: puoi riprovare." });

        var code = initiative.Length > 0 ? initiative : BucketFor(system);
        var label = initiative.Length > 0 ? initiative : "Storico " + system;
        var now = DateTime.UtcNow;
        var existing = await db.RationaleEntries.AsNoTracking().Where(e => e.AmbienteId == environment && e.Goto == code && (e.Status == "proposta" || e.Status == "confermata")).Select(e => e.Text).ToListAsync();
        var created = new List<RationaleEntry>(); var dropped = 0;
        foreach (var entry in result.Entries.Take(RationaleResponse.MaxEntries))
        {
            var kind = (entry.Kind ?? "").Trim().ToLowerInvariant();
            var entryText = (entry.Text ?? "").Trim();
            if (entryText.Length == 0 || !RationaleResponse.Kinds.Contains(kind)) { dropped++; continue; }
            if (entryText.Length > RationaleController.MaxEntryText) entryText = entryText[..RationaleController.MaxEntryText].TrimEnd() + "…";
            if (SecretScanner.Scan("", entryText).Count > 0) { dropped++; continue; }        // the AI must not carry a secret into a proposal
            if (existing.Any(t => string.Equals(t, entryText, StringComparison.OrdinalIgnoreCase)) || created.Any(c => string.Equals(c.Text, entryText, StringComparison.OrdinalIgnoreCase))) { dropped++; continue; }
            created.Add(new RationaleEntry { AmbienteId = environment, Goto = code, GotoLabel = label, SystemKey = system.ToLowerInvariant(), Kind = kind, Text = entryText, Status = "proposta", ByAi = true,
                CreatedBy = who.Username, CreatedByFullName = "Storico AI · " + (string.IsNullOrWhiteSpace(request.Author) ? who.FullName : request.Author!.Trim()), CreatedAt = now,
                SourceFile = (request.Path ?? name).Trim(), SourceSha = sha, SourceAuthor = (request.Author ?? "").Trim(), ImportedBy = who.Username });
        }
        db.RationaleEntries.AddRange(created);
        db.KnowledgeImportFiles.Add(new KnowledgeImportFile { AmbienteId = environment, Sha256 = sha, FileName = name, SourcePath = (request.Path ?? name).Trim(), SourceAuthor = (request.Author ?? "").Trim(), System = system, Goto = code,
            Outcome = created.Count > 0 ? "elaborato" : "senza-voci", Proposals = created.Count, Actor = who.Username, ActorFullName = who.FullName, At = now });
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { return Ok(new { outcome = "gia-letto", proposals = 0 }); }       // a colleague read the same note a moment ago
        return Ok(new { outcome = created.Count > 0 ? "elaborato" : "senza-voci", proposals = created.Count, dropped, @goto = code, model = result.Model });
    }

    static object View(RationaleEntry e) => new { e.Id, @goto = e.Goto, e.GotoLabel, system = e.SystemKey, e.Kind, e.Text, e.SourceFile, e.SourceAuthor, e.CreatedAt, e.Status, e.DecidedBy, e.DecidedByFullName, e.DecidedAt };

    // The proposals that came from the history and still wait for a person, by system.
    [HttpGet("pending")]
    public async Task<IActionResult> Pending([FromQuery] string? system, [FromQuery] long? after)
    {
        if (!CanRead || GetAmbienteId() <= 0 || Who() is null) return Forbid();
        var environment = GetAmbienteId();
        var all = db.RationaleEntries.AsNoTracking().Where(e => e.AmbienteId == environment && e.Status == "proposta" && e.SourceFile != null);
        var bySystem = (await all.GroupBy(e => e.SystemKey).Select(g => new { system = g.Key, count = g.Count() }).ToListAsync()).OrderBy(g => g.system).ToList();
        var query = all;
        var key = (system ?? "").Trim().ToLowerInvariant();
        if (key.Length > 0) query = query.Where(e => e.SystemKey == key);
        if (after is long cursor) query = query.Where(e => e.Id > cursor);
        var page = await query.OrderBy(e => e.Id).Take(PageSize + 1).ToListAsync();
        return Ok(new { entries = page.Take(PageSize).Select(View).ToList(), hasMore = page.Count > PageSize, bySystem, total = bySystem.Sum(g => g.count) });
    }

    // What the history already put into the knowledge, whatever its state: to look at it, search it and filter it. Read-only.
    // Only entries that came from the history (they carry a source file); what people wrote in the app is not listed here.
    [HttpGet("entries")]
    public async Task<IActionResult> Entries([FromQuery] string? status, [FromQuery] string? system, [FromQuery] string? kind, [FromQuery] string? q, [FromQuery] long? before)
    {
        if (!CanRead || GetAmbienteId() <= 0 || Who() is null) return Forbid();
        var state = (status ?? "confermata").Trim().ToLowerInvariant();
        if (state != "confermata" && state != "scartata" && state != "proposta" && state != "revocata") return BadRequest(new { message = "Stato non valido." });
        var environment = GetAmbienteId();
        var inState = db.RationaleEntries.AsNoTracking().Where(e => e.AmbienteId == environment && e.Status == state && e.SourceFile != null);
        // the filters offer only what exists, with how many: counted before the filters are applied
        var systems = (await inState.GroupBy(e => e.SystemKey).Select(g => new { system = g.Key, count = g.Count() }).ToListAsync()).OrderBy(g => g.system).ToList();
        var kinds = (await inState.GroupBy(e => e.Kind).Select(g => new { kind = g.Key, count = g.Count() }).ToListAsync()).OrderBy(g => g.kind).ToList();
        var query = inState;
        var systemKey = (system ?? "").Trim().ToLowerInvariant();
        if (systemKey.Length > 0) query = query.Where(e => e.SystemKey == systemKey);
        var kindKey = (kind ?? "").Trim().ToLowerInvariant();
        if (kindKey.Length > 0) query = query.Where(e => e.Kind == kindKey);
        var term = (q ?? "").Trim().ToLowerInvariant();
        if (term.Length > 200) return BadRequest(new { message = "La ricerca è troppo lunga." });
        if (term.Length > 0) query = query.Where(e => e.Text.ToLower().Contains(term) || (e.SourceFile ?? "").ToLower().Contains(term));
        var matching = await query.CountAsync();
        if (before is long cursor) query = query.Where(e => e.Id < cursor);
        var page = await query.OrderByDescending(e => e.Id).Take(PageSize + 1).ToListAsync();
        return Ok(new { entries = page.Take(PageSize).Select(View).ToList(), hasMore = page.Count > PageSize, matching, total = systems.Sum(g => g.count), systems, kinds, status = state });
    }

    // A person confirms or discards the selected proposals. Only history proposals, only the caller's environment, never more than a page at a time.
    [HttpPost("decide")]
    public async Task<IActionResult> Decide(DecideRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || Who() is not { } who) return Forbid();
        var decision = (request.Decision ?? "").Trim().ToLowerInvariant();
        if (decision != "confermata" && decision != "scartata") return BadRequest(new { message = "Decisione non valida: confermata o scartata." });
        var ids = (request.Ids ?? new()).Distinct().ToList();
        if (ids.Count == 0) return BadRequest(new { message = "Seleziona almeno una voce." });
        if (ids.Count > MaxBulkDecision) return BadRequest(new { message = $"Al massimo {MaxBulkDecision} voci per volta." });
        var rows = await db.RationaleEntries.Where(e => e.AmbienteId == GetAmbienteId() && ids.Contains(e.Id) && e.Status == "proposta" && e.SourceFile != null).ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var row in rows) { row.Status = decision; row.DecidedBy = who.Username; row.DecidedByFullName = who.FullName; row.DecidedAt = now; }
        await db.SaveChangesAsync();
        return Ok(new { decided = rows.Count, skipped = ids.Count - rows.Count });
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        if (!CanRead || GetAmbienteId() <= 0 || Who() is null) return Forbid();
        var environment = GetAmbienteId();
        var files = await db.KnowledgeImportFiles.AsNoTracking().Where(f => f.AmbienteId == environment).ToListAsync();
        var pending = await db.RationaleEntries.AsNoTracking().CountAsync(e => e.AmbienteId == environment && e.Status == "proposta" && e.SourceFile != null);
        var confirmed = await db.RationaleEntries.AsNoTracking().CountAsync(e => e.AmbienteId == environment && e.Status == "confermata" && e.SourceFile != null);
        return Ok(new { filesRead = files.Count, withProposals = files.Count(f => f.Proposals > 0), pending, confirmed, lastAt = files.Count == 0 ? (DateTime?)null : files.Max(f => f.At), canWork = CanWork });
    }
}
