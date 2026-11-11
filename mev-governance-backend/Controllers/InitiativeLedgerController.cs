using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Controllers;

// The history of the initiatives of the active environment: who they are, in which state, what changed and when.
// Everything is scoped to the caller's environment; the identity key is recomputed here, never trusted from the browser.
[ApiController, Authorize]
[Route("api/configuratore/ledger")]
public class InitiativeLedgerController : BaseController
{
    public const int MaxRowsPerImport = 500;
    public const int MaxText = 4000;
    public const int MaxNote = 2000;
    private readonly AppDbContext db;
    public InitiativeLedgerController(AppDbContext db) => this.db = db;
    private bool CanWork => User.IsInRole("Admin") || User.IsInRole("Developer") || User.IsInRole("SuperAdmin");
    private bool CanRead => CanWork || User.IsInRole("Bid Manager");
    private string Actor => User.Identity?.Name ?? "";
    private string ActorFullName => User.FindFirstValue("fullName") ?? "";

    // ---- identity ----
    public static bool IsPlaceholder(string? goto_) { var t = (goto_ ?? "").Trim(); return t.Length == 0 || Regex.IsMatch(t, @"^(tbd|n/?d|da assegnare)$", RegexOptions.IgnoreCase); }
    public static string NormalizePart(string? value)
    {
        var decomposed = (value ?? "").Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in decomposed) if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(char.ToLowerInvariant(c));
        return Regex.Replace(sb.ToString(), @"[^a-z0-9]+", " ").Trim().Replace(' ', '-');
    }
    public static string KeyOf(string? goto_, string? system, string? title) => $"{(IsPlaceholder(goto_) ? "tbd" : NormalizePart(goto_))}|{NormalizePart(system)}|{NormalizePart(title)}";

    static string? Clip(string? value, int max) { var t = (value ?? "").Trim(); return t.Length == 0 ? null : t.Length > max ? t[..max] : t; }

    // Validates one incoming row. Returns an error message, or null and the clean row.
    public static string? Validate(ImportRow r, out LedgerRow clean)
    {
        clean = null!;
        var title = Clip(r.Title, 500); var system = Clip(r.System, 120);
        if (title == null || system == null) return "Titolo e sistema sono obbligatori.";
        if (!LedgerMerge.Statuses.Contains(r.Status ?? "")) return $"Stato non valido: «{r.Status}».";
        DateTime? collaudo = null;
        if (!string.IsNullOrWhiteSpace(r.CollaudoDate))
        {
            if (!DateTime.TryParseExact(r.CollaudoDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)) return $"Data non valida: «{r.CollaudoDate}».";
            collaudo = DateTime.SpecifyKind(parsed.Date, DateTimeKind.Utc);
        }
        var goto_ = IsPlaceholder(r.Goto) ? null : Clip(r.Goto, 60);
        var amounts = r.Amounts == null ? null : JsonSerializer.Serialize(r.Amounts.Where(a => a != null && !double.IsNaN(a.Value) && !double.IsInfinity(a.Value)).Take(10).Select(a => new { text = Clip(a.Text, 40), value = a.Value }));
        if (amounts == "[]") amounts = null;
        clean = new LedgerRow(KeyOf(goto_, system, title), goto_, title, system, Clip(r.PmPoste, 120), r.Status!, Clip(r.Release, 60), Clip(r.PlannedRelease, 60), collaudo, Clip(r.CollaudoText, 120),
            Clip(r.Notes, MaxText), Clip(r.Released, MaxText), Clip(r.Missing, MaxText), amounts);
        return null;
    }

    object View(LedgerInitiative i) => new
    {
        i.Id, i.Key, @goto = i.Goto, gotoPlaceholder = i.Goto == null, i.Title, i.System, i.PmPoste, i.Status, i.Release, i.PlannedRelease,
        collaudoDate = LedgerMerge.Date(i.CollaudoDate), i.CollaudoText, i.Notes, i.Released, i.Missing,
        amounts = string.IsNullOrEmpty(i.AmountsJson) ? new List<JsonElement>() : JsonSerializer.Deserialize<List<JsonElement>>(i.AmountsJson),
        i.Source, i.SourceFile, sourceDate = LedgerMerge.Date(i.SourceDate), i.CreatedAt, i.CreatedBy, i.UpdatedAt, i.UpdatedBy, i.Revision, i.Archived,
    };

    IQueryable<LedgerInitiative> Mine() => db.LedgerInitiatives.Where(i => i.AmbienteId == GetAmbienteId());

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? system, [FromQuery] string? pm, [FromQuery] string? release, [FromQuery] string? q, [FromQuery] bool archived = false)
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        var query = Mine().AsNoTracking().Where(i => i.Archived == archived);
        var all = await query.ToListAsync();
        IEnumerable<LedgerInitiative> filtered = all;
        if (!string.IsNullOrWhiteSpace(status)) filtered = filtered.Where(i => i.Status == status);
        if (!string.IsNullOrWhiteSpace(system)) filtered = filtered.Where(i => string.Equals(i.System, system, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(pm)) filtered = filtered.Where(i => string.Equals(i.PmPoste, pm, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(release)) filtered = filtered.Where(i => string.Equals(i.Release, release, StringComparison.OrdinalIgnoreCase) || string.Equals(i.PlannedRelease, release, StringComparison.OrdinalIgnoreCase));
        var terms = DocumentSearch.Terms(q);
        if (terms.Count > 0)
            filtered = filtered.Where(i => { var hay = DocumentSearch.Normalize($"{i.Goto} {i.Title} {i.System} {i.PmPoste} {i.Release} {i.PlannedRelease} {i.Notes} {i.Released} {i.Missing}"); return terms.All(t => hay.Contains(t)); });
        var rows = filtered.OrderBy(i => Array.IndexOf(LedgerMerge.Statuses, i.Status)).ThenBy(i => i.Goto ?? "~").ThenBy(i => i.System).ThenBy(i => i.Title).ToList();
        var lastImport = await db.LedgerImports.AsNoTracking().Where(i => i.AmbienteId == GetAmbienteId()).OrderByDescending(i => i.Id).FirstOrDefaultAsync();
        return Ok(new
        {
            initiatives = rows.Select(View).ToList(), total = all.Count, shown = rows.Count,
            counts = LedgerMerge.Statuses.ToDictionary(s => s, s => all.Count(i => i.Status == s)),
            systems = all.Select(i => i.System).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(s => s).ToList(),
            pms = all.Select(i => i.PmPoste).Where(p => p != null).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(p => p).ToList(),
            releases = all.SelectMany(i => new[] { i.Release, i.PlannedRelease }).Where(r => r != null).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(r => r).ToList(),
            lastImport = lastImport == null ? null : new { lastImport.FileName, lastImport.At, lastImport.Actor, sourceDate = LedgerMerge.Date(lastImport.SourceDate), lastImport.Rows, lastImport.Created, lastImport.Updated, lastImport.Unchanged },
            canWork = CanWork,
        });
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Detail(long id)
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        var item = await Mine().AsNoTracking().SingleOrDefaultAsync(i => i.Id == id);
        if (item == null) return NotFound();
        var events = await db.LedgerEvents.AsNoTracking().Where(e => e.AmbienteId == GetAmbienteId() && e.InitiativeId == id).OrderByDescending(e => e.Id).ToListAsync();
        return Ok(new
        {
            initiative = View(item),
            events = events.Select(e => new { e.Id, e.Kind, e.Summary, changes = string.IsNullOrEmpty(e.ChangesJson) ? (JsonElement?)null : JsonSerializer.Deserialize<JsonElement>(e.ChangesJson), e.Actor, e.ActorFullName, e.At, e.ImportId }).ToList(),
        });
    }

    // ---- import: preview first, then apply ----
    async Task<ImportPlan> Plan(ImportRequest request)
    {
        var plan = new ImportPlan();
        if (request.Rows == null || request.Rows.Count == 0) { plan.Error = "Il file non contiene iniziative."; return plan; }
        if (request.Rows.Count > MaxRowsPerImport) { plan.Error = $"Troppe righe: massimo {MaxRowsPerImport} per importazione."; return plan; }
        DateTime? fileDate = null;
        if (!string.IsNullOrWhiteSpace(request.SourceDate)) { if (!DateTime.TryParseExact(request.SourceDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) { plan.Error = "Data del file non valida."; return plan; } fileDate = DateTime.SpecifyKind(d.Date, DateTimeKind.Utc); }
        plan.FileDate = fileDate;
        var seen = new HashSet<string>();
        var existing = await Mine().ToListAsync();
        var byKey = existing.ToDictionary(i => i.Key);
        for (var index = 0; index < request.Rows.Count; index++)
        {
            var error = Validate(request.Rows[index], out var clean);
            if (error != null) { plan.Items.Add(new PlanItem { Index = index, Outcome = "scartata", Reason = error, Title = request.Rows[index].Title }); continue; }
            if (!seen.Add(clean.Key)) { plan.Items.Add(new PlanItem { Index = index, Outcome = "scartata", Reason = "Iniziativa ripetuta nel file (stesso GOTO, sistema e titolo).", Title = clean.Title }); continue; }
            if (!byKey.TryGetValue(clean.Key, out var current))
            {
                // A placeholder row can now carry the real GOTO: look for the same system+title without a code.
                var promoted = clean.Goto != null ? existing.FirstOrDefault(i => i.Goto == null && NormalizePart(i.System) == NormalizePart(clean.System) && NormalizePart(i.Title) == NormalizePart(clean.Title)) : null;
                if (promoted != null) { var promotion = LedgerMerge.Changes(promoted, clean); plan.Items.Add(new PlanItem { Index = index, Outcome = promotion.Count > 0 ? "aggiornata" : "invariata", Row = clean, Existing = promoted, Changes = promotion, Promoted = true, Title = clean.Title }); continue; }
                plan.Items.Add(new PlanItem { Index = index, Outcome = "nuova", Row = clean, Title = clean.Title }); continue;
            }
            var changes = LedgerMerge.Changes(current, clean);
            var stale = LedgerMerge.IsStale(current, fileDate);
            if (stale) changes = LedgerMerge.OnlyFillingGaps(changes);
            plan.Items.Add(new PlanItem { Index = index, Outcome = changes.Count == 0 ? "invariata" : "aggiornata", Row = clean, Existing = current, Changes = changes, Stale = stale, Title = clean.Title });
        }
        return plan;
    }

    object PlanView(ImportPlan plan) => new
    {
        created = plan.Items.Count(i => i.Outcome == "nuova"), updated = plan.Items.Count(i => i.Outcome == "aggiornata"), unchanged = plan.Items.Count(i => i.Outcome == "invariata"), skipped = plan.Items.Count(i => i.Outcome == "scartata"),
        items = plan.Items.Select(i => new { i.Index, i.Outcome, i.Title, i.Reason, i.Stale, i.Promoted, @goto = i.Row?.Goto, system = i.Row?.System, summary = i.Outcome == "aggiornata" ? LedgerMerge.Describe(i.Changes) : null,
            changes = i.Outcome == "aggiornata" ? (JsonElement?)JsonSerializer.Deserialize<JsonElement>(LedgerMerge.ToJson(i.Changes)) : null }).ToList(),
    };

    [HttpPost("import/preview")]
    public async Task<IActionResult> Preview(ImportRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0) return Forbid();
        var plan = await Plan(request);
        if (plan.Error != null) return BadRequest(new { message = plan.Error });
        return Ok(PlanView(plan));
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import(ImportRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || string.IsNullOrWhiteSpace(Actor)) return Forbid();
        var plan = await Plan(request);
        if (plan.Error != null) return BadRequest(new { message = plan.Error });
        var now = DateTime.UtcNow;
        var run = new LedgerImport { AmbienteId = GetAmbienteId(), FileName = Clip(request.FileName, 260) ?? "file", Sha256 = Clip(request.Sha256, 64) ?? "", SourceDate = plan.FileDate, Rows = request.Rows!.Count,
            Created = plan.Items.Count(i => i.Outcome == "nuova"), Updated = plan.Items.Count(i => i.Outcome == "aggiornata"), Unchanged = plan.Items.Count(i => i.Outcome == "invariata"), Skipped = plan.Items.Count(i => i.Outcome == "scartata"), Actor = Actor, At = now };
        await using var transaction = await db.Database.BeginTransactionAsync();
        db.LedgerImports.Add(run);
        await db.SaveChangesAsync();
        foreach (var item in plan.Items)
        {
            if (item.Outcome == "nuova")
            {
                var r = item.Row!;
                var created = new LedgerInitiative { AmbienteId = GetAmbienteId(), Key = r.Key, Goto = r.Goto, Title = r.Title, System = r.System, PmPoste = r.PmPoste, Status = r.Status, Release = r.Release, PlannedRelease = r.PlannedRelease,
                    CollaudoDate = r.CollaudoDate, CollaudoText = r.CollaudoText, Notes = r.Notes, Released = r.Released, Missing = r.Missing, AmountsJson = r.AmountsJson, Source = "file", SourceFile = run.FileName, SourceDate = plan.FileDate,
                    CreatedAt = now, CreatedBy = Actor, UpdatedAt = now, UpdatedBy = Actor, Revision = 1 };
                db.LedgerInitiatives.Add(created);
                await db.SaveChangesAsync();
                db.LedgerEvents.Add(new LedgerEvent { AmbienteId = GetAmbienteId(), InitiativeId = created.Id, Kind = "import", Summary = $"Importata da {run.FileName}: {LedgerMerge.StatusLabel(r.Status)}", Actor = Actor, ActorFullName = ActorFullName, At = now, ImportId = run.Id });
            }
            else if (item.Outcome == "aggiornata")
            {
                var target = item.Existing!;
                if (item.Promoted) target.Key = item.Row!.Key; // the real GOTO arrived: the identity now carries it
                LedgerMerge.Apply(target, item.Changes);
                target.Revision++; target.UpdatedAt = now; target.UpdatedBy = Actor; target.Source = "file"; target.SourceFile = run.FileName;
                if (plan.FileDate != null && (target.SourceDate == null || plan.FileDate > target.SourceDate)) target.SourceDate = plan.FileDate;
                var kind = item.Changes.Any(c => c.Field == "status") ? "stato" : "import";
                db.LedgerEvents.Add(new LedgerEvent { AmbienteId = GetAmbienteId(), InitiativeId = target.Id, Kind = kind, Summary = (item.Stale ? "Da file più vecchio (solo campi vuoti): " : "") + LedgerMerge.Describe(item.Changes),
                    ChangesJson = LedgerMerge.ToJson(item.Changes), Actor = Actor, ActorFullName = ActorFullName, At = now, ImportId = run.Id });
            }
        }
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { importId = run.Id, run.Rows, run.Created, run.Updated, run.Unchanged, run.Skipped, report = PlanView(plan) });
    }

    // ---- editing ----
    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, UpdateRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || string.IsNullOrWhiteSpace(Actor)) return Forbid();
        var item = await Mine().SingleOrDefaultAsync(i => i.Id == id);
        if (item == null) return NotFound();
        if (request.ExpectedRevision != item.Revision) return Conflict(new { message = $"Un collega ha modificato l’iniziativa (revisione {item.Revision}). Riaprila per vedere le sue modifiche: le tue non sono state salvate." });
        if (request.Status != null && !LedgerMerge.Statuses.Contains(request.Status)) return BadRequest(new { message = "Stato non valido." });
        // An edit may CLEAR a field on purpose (the user empties it): this is the one place where empty means empty.
        var changes = new List<FieldChange>(); var before = LedgerMerge.Snapshot(item);
        void Take(string field, string? value, bool provided)
        {
            if (!provided) return;
            var to = Clip(value, MaxText);
            if (!string.Equals(before[field], to, StringComparison.Ordinal)) changes.Add(new FieldChange(field, before[field], to));
        }
        Take("goto", IsPlaceholder(request.Goto) ? null : request.Goto, request.GotoProvided); Take("title", request.Title, request.Title != null);
        Take("pmPoste", request.PmPoste, request.PmPosteProvided); Take("status", request.Status, request.Status != null); Take("release", request.Release, request.ReleaseProvided);
        Take("plannedRelease", request.PlannedRelease, request.PlannedReleaseProvided); Take("notes", request.Notes, request.NotesProvided); Take("released", request.Released, request.ReleasedProvided); Take("missing", request.Missing, request.MissingProvided);
        if (changes.Any(c => c.Field == "title" && c.To == null)) return BadRequest(new { message = "Il titolo non può essere vuoto." });
        if (changes.Count == 0) return Ok(new { initiative = View(item), unchanged = true });
        var newKey = KeyOf(changes.Any(c => c.Field == "goto") ? changes.First(c => c.Field == "goto").To : item.Goto, item.System, changes.Any(c => c.Field == "title") ? changes.First(c => c.Field == "title").To : item.Title);
        if (newKey != item.Key && await Mine().AnyAsync(i => i.Key == newKey && i.Id != id)) return Conflict(new { message = "Esiste già un’altra iniziativa con lo stesso GOTO, sistema e titolo." });
        var now = DateTime.UtcNow;
        foreach (var change in changes) LedgerMerge.Apply(item, new[] { change });
        item.Key = newKey; item.Revision++; item.UpdatedAt = now; item.UpdatedBy = Actor; item.Source = "app";
        db.LedgerEvents.Add(new LedgerEvent { AmbienteId = GetAmbienteId(), InitiativeId = id, Kind = changes.Any(c => c.Field == "status") ? "stato" : "modifica", Summary = LedgerMerge.Describe(changes), ChangesJson = LedgerMerge.ToJson(changes), Actor = Actor, ActorFullName = ActorFullName, At = now });
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { return Conflict(new { message = "Un collega ha modificato l’iniziativa nello stesso momento. Riaprila e riprova." }); }
        return Ok(new { initiative = View(item) });
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || string.IsNullOrWhiteSpace(Actor)) return Forbid();
        var row = new ImportRow { Goto = request.Goto, Title = request.Title, System = request.System, PmPoste = request.PmPoste, Status = request.Status ?? "in-analisi", Release = request.Release, PlannedRelease = request.PlannedRelease, Notes = request.Notes };
        var error = Validate(row, out var clean);
        if (error != null) return BadRequest(new { message = error });
        if (await Mine().AnyAsync(i => i.Key == clean.Key)) return Conflict(new { message = "Esiste già questa iniziativa (stesso GOTO, sistema e titolo)." });
        var now = DateTime.UtcNow;
        var item = new LedgerInitiative { AmbienteId = GetAmbienteId(), Key = clean.Key, Goto = clean.Goto, Title = clean.Title, System = clean.System, PmPoste = clean.PmPoste, Status = clean.Status, Release = clean.Release, PlannedRelease = clean.PlannedRelease,
            Notes = clean.Notes, Source = "app", CreatedAt = now, CreatedBy = Actor, UpdatedAt = now, UpdatedBy = Actor };
        db.LedgerInitiatives.Add(item);
        await db.SaveChangesAsync();
        db.LedgerEvents.Add(new LedgerEvent { AmbienteId = GetAmbienteId(), InitiativeId = item.Id, Kind = "creazione", Summary = $"Creata: {LedgerMerge.StatusLabel(clean.Status)}", Actor = Actor, ActorFullName = ActorFullName, At = now });
        await db.SaveChangesAsync();
        return Ok(new { initiative = View(item) });
    }

    // ---- activity log: a note, or something done in the app ----
    [HttpPost("{id:long}/events")]
    public async Task<IActionResult> AddEvent(long id, EventRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || string.IsNullOrWhiteSpace(Actor)) return Forbid();
        var item = await Mine().SingleOrDefaultAsync(i => i.Id == id);
        if (item == null) return NotFound();
        var kind = request.Kind == "attivita" ? "attivita" : "nota";
        var text = Clip(request.Text, MaxNote);
        if (text == null) return BadRequest(new { message = "Scrivi cosa è successo." });
        var now = DateTime.UtcNow;
        db.LedgerEvents.Add(new LedgerEvent { AmbienteId = GetAmbienteId(), InitiativeId = id, Kind = kind, Summary = text, Actor = Actor, ActorFullName = ActorFullName, At = now });
        item.UpdatedAt = now; item.UpdatedBy = Actor;
        await db.SaveChangesAsync();
        return Ok(new { added = true });
    }

    [HttpPost("{id:long}/archive")]
    public async Task<IActionResult> Archive(long id, ArchiveRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || string.IsNullOrWhiteSpace(Actor)) return Forbid();
        var item = await Mine().SingleOrDefaultAsync(i => i.Id == id);
        if (item == null) return NotFound();
        if (item.Archived == request.Archived) return Ok(new { initiative = View(item), unchanged = true });
        item.Archived = request.Archived; item.UpdatedAt = DateTime.UtcNow; item.UpdatedBy = Actor;
        db.LedgerEvents.Add(new LedgerEvent { AmbienteId = GetAmbienteId(), InitiativeId = id, Kind = "modifica", Summary = request.Archived ? "Archiviata (non compare più nell’elenco, la cronologia resta)" : "Ripristinata dall’archivio", Actor = Actor, ActorFullName = ActorFullName, At = DateTime.UtcNow });
        await db.SaveChangesAsync();
        return Ok(new { initiative = View(item) });
    }

    [HttpGet("imports")]
    public async Task<IActionResult> Imports()
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        var runs = await db.LedgerImports.AsNoTracking().Where(i => i.AmbienteId == GetAmbienteId()).OrderByDescending(i => i.Id).Take(30).ToListAsync();
        return Ok(runs.Select(r => new { r.Id, r.FileName, r.At, r.Actor, sourceDate = LedgerMerge.Date(r.SourceDate), r.Rows, r.Created, r.Updated, r.Unchanged, r.Skipped }).ToList());
    }

    // The same Markdown format as the file imported, regenerated from what the app holds: the way to keep the file up to date.
    [HttpGet("export")]
    public async Task<IActionResult> Export()
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        var all = await Mine().AsNoTracking().Where(i => !i.Archived).ToListAsync();
        var lastImport = await db.LedgerImports.AsNoTracking().Where(i => i.AmbienteId == GetAmbienteId()).OrderByDescending(i => i.Id).FirstOrDefaultAsync();
        return Ok(new { markdown = LedgerExport.Markdown(all, DateTime.UtcNow, lastImport?.FileName), fileName = $"STATO_INIZIATIVE_{DateTime.UtcNow:yyyyMMdd}.md", count = all.Count });
    }
}

public class ImportAmount { public string? Text { get; set; } public double Value { get; set; } }
public class ImportRow
{
    public string? Goto { get; set; } public string? Title { get; set; } public string? System { get; set; } public string? PmPoste { get; set; } public string? Status { get; set; }
    public string? Release { get; set; } public string? PlannedRelease { get; set; } public string? CollaudoDate { get; set; } public string? CollaudoText { get; set; } public string? Notes { get; set; }
    public string? Released { get; set; } public string? Missing { get; set; } public List<ImportAmount>? Amounts { get; set; }
}
public record ImportRequest(List<ImportRow>? Rows, string? FileName, string? Sha256, string? SourceDate);
public class UpdateRequest
{
    public int ExpectedRevision { get; set; } public string? Status { get; set; } public string? Title { get; set; }
    public string? Goto { get; set; } public bool GotoProvided { get; set; } public string? PmPoste { get; set; } public bool PmPosteProvided { get; set; } public string? Release { get; set; } public bool ReleaseProvided { get; set; }
    public string? PlannedRelease { get; set; } public bool PlannedReleaseProvided { get; set; } public string? Notes { get; set; } public bool NotesProvided { get; set; } public string? Released { get; set; } public bool ReleasedProvided { get; set; }
    public string? Missing { get; set; } public bool MissingProvided { get; set; }
}
public record CreateRequest(string? Goto, string? Title, string? System, string? PmPoste, string? Status, string? Release, string? PlannedRelease, string? Notes);
public record EventRequest(string? Kind, string? Text);
public record ArchiveRequest(bool Archived);
public class PlanItem { public int Index; public string Outcome = ""; public string? Reason; public string? Title; public LedgerRow? Row; public LedgerInitiative? Existing; public List<FieldChange> Changes = new(); public bool Stale; public bool Promoted; }
public class ImportPlan { public string? Error; public DateTime? FileDate; public List<PlanItem> Items = new(); }
