using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using System.Security.Claims;
namespace MevGovernanceBackend.Services;

public sealed class ContractAccessFilter : IActionFilter
{
    private readonly AppDbContext db;
    public ContractAccessFilter(AppDbContext db) { this.db = db; }
    public void OnActionExecuting(ActionExecutingContext context)
    {
        if (context.Controller is not BaseController || context.HttpContext.User.IsInRole("SuperAdmin")) return;
        var principal = context.HttpContext.User;
        if (!int.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var userId) ||
            !int.TryParse(principal.FindFirst("ambienteId")?.Value, out var ambienteId) ||
            !db.UserAmbienti.Any(x => x.UserId == userId && x.AmbienteId == ambienteId) ||
            !db.Ambienti.Any(a => a.Id == ambienteId && a.IsActive)) context.Result = new ForbidResult();
    }
    public void OnActionExecuted(ActionExecutedContext context) { }
}
