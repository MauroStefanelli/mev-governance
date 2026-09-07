using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/client-permissions")]
[Authorize]
public class ClientPermissionsController : BaseController
{
    private readonly AppDbContext _db;

    public ClientPermissionsController(AppDbContext db)
    {
        _db = db;
    }

    // ── Pagine ───────────────────────────────────────────────────────────────

    // GET /api/client-permissions/pages/{userId}
    // Restituisce le pagine assegnate a un utente
    [HttpGet("pages/{userId}")]
    public IActionResult GetPages(int userId)
    {
        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin"))
            return Forbid();

        var pages = _db.UserPagePermissions
            .Where(p => p.UserId == userId)
            .Select(p => p.PageId)
            .ToList();
        return Ok(pages);
    }

    // GET /api/client-permissions/my-pages
    // Restituisce le pagine assegnate all'utente corrente (usato dal frontend al login)
    [HttpGet("my-pages")]
    public IActionResult GetMyPages()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdClaim, out var userId)) return Unauthorized();

        var pages = _db.UserPagePermissions
            .Where(p => p.UserId == userId)
            .Select(p => p.PageId)
            .ToList();
        return Ok(pages);
    }

    // PUT /api/client-permissions/pages/{userId}
    // Sostituisce integralmente le pagine assegnate a un utente
    [HttpPut("pages/{userId}")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult SetPages(int userId, [FromBody] List<string> pageIds)
    {
        var existing = _db.UserPagePermissions.Where(p => p.UserId == userId).ToList();
        _db.UserPagePermissions.RemoveRange(existing);
        _db.UserPagePermissions.AddRange(pageIds.Select(pid => new UserPagePermission
        {
            UserId = userId,
            PageId = pid,
        }));
        _db.SaveChanges();
        return Ok(pageIds);
    }

    // ── Contratti Client ─────────────────────────────────────────────────────

    // GET /api/client-permissions/contratti/{userId}
    // Restituisce i contratti assegnati a un utente in tutti gli ambienti
    [HttpGet("contratti/{userId}")]
    public IActionResult GetContratti(int userId)
    {
        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin"))
            return Forbid();

        var rows = _db.UserClientContratti
            .Where(r => r.UserId == userId)
            .Select(r => new { r.AmbienteId, r.TowContratto })
            .ToList();
        return Ok(rows);
    }

    // GET /api/client-permissions/my-contratti
    // Restituisce i contratti dell'utente corrente per l'ambiente attivo
    [HttpGet("my-contratti")]
    public IActionResult GetMyContratti()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdClaim, out var userId)) return Unauthorized();
        var ambienteId = GetAmbienteId();

        var contratti = _db.UserClientContratti
            .Where(r => r.UserId == userId && r.AmbienteId == ambienteId)
            .Select(r => r.TowContratto)
            .ToList();
        return Ok(contratti);
    }

    // PUT /api/client-permissions/contratti/{userId}
    // Sostituisce integralmente i contratti assegnati a un utente per un ambiente.
    // Aggiunge/rimuove automaticamente la riga in UserAmbienti in base alla presenza di contratti.
    [HttpPut("contratti/{userId}")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult SetContratti(int userId, [FromBody] SetContrattiRequest request)
    {
        // 1. Sostituisce i contratti Client
        var existing = _db.UserClientContratti
            .Where(r => r.UserId == userId && r.AmbienteId == request.AmbienteId)
            .ToList();
        _db.UserClientContratti.RemoveRange(existing);
        _db.UserClientContratti.AddRange(request.TowContratti.Select(tc => new UserClientContratto
        {
            UserId       = userId,
            AmbienteId   = request.AmbienteId,
            TowContratto = tc,
        }));

        // 2. Sincronizza UserAmbienti: se ha almeno un contratto → assicura sia nell'ambiente;
        //    se non ha più contratti → rimuove dall'ambiente
        var ua = _db.UserAmbienti.FirstOrDefault(x => x.UserId == userId && x.AmbienteId == request.AmbienteId);
        if (request.TowContratti.Count > 0)
        {
            if (ua == null)
                _db.UserAmbienti.Add(new UserAmbiente { UserId = userId, AmbienteId = request.AmbienteId, Ruolo = "Editor" });
        }
        else
        {
            if (ua != null)
                _db.UserAmbienti.Remove(ua);
        }

        _db.SaveChanges();
        return Ok(request.TowContratti);
    }
}

public record SetContrattiRequest(int AmbienteId, List<string> TowContratti);
