using System.Security.Claims;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

public static class WorkspaceRegression
{
    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        InitiativeWorkspaceController Controller(string role, int environment = 1) => new(db) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.Name, "analista"), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString())
            }, "test")) } }
        };
        var admin = Controller("Admin");
        check(await Controller("Client").Revisions("GOTO-1") is ForbidResult, "Workspace forbids Client");
        check(await Controller("Admin", 0).Revisions("GOTO-1") is ForbidResult, "Workspace requires an environment");
        var state = new WorkspaceState { Title = "Iniziativa", System = "NPSO", Decisions = new() { new() { Id = "d1", Text = "Usare API", Source = "requisito.md:12", Approve = true } } };
        var result = await admin.Save("GOTO-1", new() { ExpectedVersion = 0, Reason = "Prima analisi", State = state });
        check(result is OkObjectResult, "First revision persisted");
        check(await admin.Save("GOTO-1", new() { ExpectedVersion = 0, Reason = "Stale save", State = state }) is ConflictObjectResult, "Concurrent stale revision rejected");
        var rows = ((OkObjectResult)await admin.Revisions("GOTO-1")).Value as List<InitiativeRevision>;
        check(rows?.Count == 1 && rows[0].Author == "analista", "Server attributes revision author");
        check(rows![0].Payload.Contains("approvedBy\":\"analista"), "Decision approval attributed by server");
        check((((OkObjectResult)await Controller("Admin", 2).Revisions("GOTO-1")).Value as List<InitiativeRevision>)?.Count == 0, "Workspace revisions isolated by environment");
        state.Decisions[0].Text = "Alterazione";
        check(await admin.Save("GOTO-1", new() { ExpectedVersion = 1, Reason = "Rewrite", State = state }) is BadRequestObjectResult, "Approved decisions cannot be rewritten");
        state.Decisions[0].Text = "Usare API";
        check(await admin.Save("GOTO-1", new() { ExpectedVersion = 1, Reason = "Approve", State = state, Approve = true }) is ForbidResult, "Analyst cannot approve final revision");
        var stored = System.Text.Json.JsonSerializer.Deserialize<WorkspaceState>(rows[0].Payload, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;
        check(await Controller("Bid Manager").Save("GOTO-1", new() { ExpectedVersion = 1, Reason = "Revisione verificata", State = stored, Approve = true }) is OkObjectResult, "Bid Manager approves exact saved revision");
        check(await db.InitiativeRevisions.CountAsync(r => r.Goto == "GOTO-1") == 2, "Approval preserves original revision");
        var archive = ((OkObjectResult)await admin.List()).Value as List<InitiativeRevision>;
        check(archive?.Count == 1 && archive[0].Version == 2, "Archive returns only latest revision per initiative");
        check((((OkObjectResult)await Controller("Admin", 2).List()).Value as List<InitiativeRevision>)?.Count == 0, "Archive is isolated by environment");
    }
}
