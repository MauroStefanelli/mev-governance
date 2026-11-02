using System.Security.Claims;
using System.Text.Json;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Controllers;

[ApiController, Authorize]
[Route("api/configuratore/workspaces")]
public class InitiativeWorkspaceController : BaseController
{
    private readonly AppDbContext db;
    public InitiativeWorkspaceController(AppDbContext db) => this.db = db;
    private bool CanWork => User.IsInRole("Admin") || User.IsInRole("Developer") || User.IsInRole("SuperAdmin");
    private bool CanRead => CanWork || User.IsInRole("Bid Manager");
    private bool CanApprove => User.IsInRole("Bid Manager") || User.IsInRole("SuperAdmin");
    private IQueryable<InitiativeRevision> Scope => db.InitiativeRevisions.AsNoTracking().Where(r => r.AmbienteId == GetAmbienteId());

    [HttpGet("{code}/revisions")]
    public async Task<IActionResult> Revisions(string code)
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        return Ok(await Scope.Where(r => r.Goto == code).OrderByDescending(r => r.Version).ToListAsync());
    }

    [HttpGet("related")]
    public async Task<IActionResult> Related([FromQuery] string? system, [FromQuery] string? family, [FromQuery] string? exclude)
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        if (string.IsNullOrWhiteSpace(system) && string.IsNullOrWhiteSpace(family)) return Ok(Array.Empty<object>());
        // Latest revision per GOTO, isolated to the user's current environment.
        var latestIds = Scope.GroupBy(r => r.Goto).Select(g => g.Max(r => r.Id));
        var latest = await Scope.Where(r => latestIds.Contains(r.Id) && r.Goto != exclude).ToListAsync();
        var related = latest.Where(r => {
            var state = JsonSerializer.Deserialize<WorkspaceState>(r.Payload, JsonOptions);
            return state != null && ((!string.IsNullOrWhiteSpace(system) && string.Equals(state.System, system.Trim(), StringComparison.OrdinalIgnoreCase))
                || (!string.IsNullOrWhiteSpace(family) && string.Equals(state.Family, family.Trim(), StringComparison.OrdinalIgnoreCase)));
        }).OrderByDescending(r => r.CreatedAt).Take(10);
        return Ok(related);
    }

    internal static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [HttpPost("{code}/revisions")]
    public async Task<IActionResult> Save(string code, SaveWorkspaceRequest request)
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        if (string.IsNullOrWhiteSpace(code) || code.Length > 120 || request.ExpectedVersion < 0
            || string.IsNullOrWhiteSpace(request.Reason) || request.State == null || string.IsNullOrWhiteSpace(request.State.Title))
            return BadRequest(new { message = "GOTO, titolo, versione attesa e motivazione sono obbligatori." });
        var current = await Scope.Where(r => r.Goto == code).OrderByDescending(r => r.Version).FirstOrDefaultAsync();
        if ((current?.Version ?? 0) != request.ExpectedVersion)
            return Conflict(new { message = "Un collega ha salvato una nuova revisione. Confrontala prima di salvare.", version = current?.Version ?? 0 });
        var previous = current == null ? new WorkspaceState() : JsonSerializer.Deserialize<WorkspaceState>(current.Payload, JsonOptions)!;
        var state = request.State;
        if (state == null || state.Decisions == null || state.Decisions.Any(d => string.IsNullOrWhiteSpace(d.Id) || string.IsNullOrWhiteSpace(d.Text)
            || (d.Approve && string.IsNullOrWhiteSpace(d.Source))))
            return BadRequest(new { message = "Ogni decisione richiede identificativo e testo; l’approvazione richiede una fonte." });
        // A supervisor can approve the reviewed revision but cannot silently edit it.
        if (!CanWork && JsonSerializer.Serialize(state, JsonOptions) != JsonSerializer.Serialize(previous, JsonOptions)) return Forbid();
        if (request.Approve && !CanApprove) return Forbid();
        var author = User.Identity?.Name ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
        if (string.IsNullOrWhiteSpace(author)) return Forbid();
        state.ApprovedBy = request.Approve ? author : "";
        state.ApprovedAt = request.Approve ? DateTime.UtcNow : null;
        state.Status = request.Approve ? "Approvata" : "In analisi";
        if (state.Decisions.GroupBy(d => d.Id).Any(g => g.Count() > 1)) return BadRequest(new { message = "Identificativi decisione duplicati." });
        foreach (var decision in state.Decisions)
        {
            var old = previous.Decisions.FirstOrDefault(d => d.Id == decision.Id);
            // Approved decisions are immutable; a changed decision needs a new ID.
            if (old?.ApprovedAt != null && (old.Text != decision.Text || old.Source != decision.Source))
                return BadRequest(new { message = "Una decisione approvata non può essere riscritta: aggiungi una nuova decisione." });
            decision.ApprovedBy = old?.ApprovedBy ?? "";
            decision.ApprovedAt = old?.ApprovedAt;
            if (decision.Approve && decision.ApprovedAt == null)
            {
                if (!CanWork) return Forbid();
                decision.ApprovedBy = author;
                decision.ApprovedAt = DateTime.UtcNow;
            }
            decision.Approve = false;
        }
        if (previous.Decisions.Any(d => d.ApprovedAt != null && !state.Decisions.Any(n => n.Id == d.Id)))
            return BadRequest(new { message = "Le decisioni approvate devono rimanere tracciate." });
        var revision = new InitiativeRevision { AmbienteId = GetAmbienteId(), Goto = code, Version = request.ExpectedVersion + 1,
            Author = author, CreatedAt = DateTime.UtcNow, Reason = request.Reason.Trim(), Payload = JsonSerializer.Serialize(state, JsonOptions) };
        db.InitiativeRevisions.Add(revision);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pg && pg.SqlState == "23505")
        { return Conflict(new { message = "Salvataggio concorrente: ricarica le revisioni e confronta il tuo lavoro." }); }
        return Ok(revision);
    }
}

public class SaveWorkspaceRequest
{
    public int ExpectedVersion { get; set; }
    public string Reason { get; set; } = "";
    public bool Approve { get; set; }
    public WorkspaceState State { get; set; } = new();
}
public class WorkspaceState
{
    public string Title { get; set; } = "";
    public string System { get; set; } = "";
    public string Family { get; set; } = "";
    public string PmPoste { get; set; } = "";
    public string Status { get; set; } = "In analisi";
    public string AsIs { get; set; } = "";
    public string ToBe { get; set; } = "";
    public string Facts { get; set; } = "";
    public string Assumptions { get; set; } = "";
    public string OpenQuestions { get; set; } = "";
    public string Sources { get; set; } = "";
    public string Repositories { get; set; } = "";
    public string Queries { get; set; } = "";
    public string PermanentInstructions { get; set; } = "";
    public string ApprovedBy { get; set; } = "";
    public DateTime? ApprovedAt { get; set; }
    public List<WorkspaceDecision> Decisions { get; set; } = new();
    public JsonElement? Estimate { get; set; }
}
public class WorkspaceDecision
{
    public string Id { get; set; } = "";
    public string Text { get; set; } = "";
    public string Source { get; set; } = "";
    public bool Approve { get; set; }
    public string ApprovedBy { get; set; } = "";
    public DateTime? ApprovedAt { get; set; }
}
