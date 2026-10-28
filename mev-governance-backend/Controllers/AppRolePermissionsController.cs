using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/app-role-permissions")]
[Authorize]
public class AppRolePermissionsController : BaseController
{
    private readonly AppDbContext _db;

    // ── Definizione delle app configurabili ────────────────────────────────────
    public static readonly AppDef[] KnownApps =
    [
        new("mev",               "MEV"),
        new("mevcap",            "MEV-CAP"),
        new("contratti",         "Contratti TOW"),
        new("contratti_interni", "Contratti Interni"),
        new("chart",             "Grafici"),
        new("reportavanzamenti", "Report Avanzamenti"),
        new("ordini",            "Ordini Consegna"),
        new("consumotow",        "Consumo TOW"),
        new("tools",             "Tools"),
        new("gara",              "Gare"),
        new("configuratore",     "Configuratore"),
    ];

    // Ruoli che partecipano al configuratore (SuperAdmin bypassa sempre)
    private static readonly string[] KnownRoles =
        ["Admin", "Editor", "Client", "Developer", "Bid Manager"];

    public AppRolePermissionsController(AppDbContext db)
    {
        _db = db;
    }

    // ── GET /api/app-role-permissions ─────────────────────────────────────────
    // Restituisce la matrice completa {appId, role, canView, canEdit}.
    // Accessibile da tutti gli autenticati (il frontend decide cosa mostrare).
    [HttpGet]
    public IActionResult GetAll()
    {
        EnsureDefaults();

        var rows = _db.AppRolePermissions.ToList();
        // Completa con eventuali app/ruoli non ancora in DB (ritorna i default in-memory)
        var result = KnownApps.SelectMany(app => KnownRoles.Select(role =>
        {
            var r = rows.FirstOrDefault(x => x.AppId == app.Id && x.Role == role);
            return new
            {
                appId   = app.Id,
                appLabel= app.Label,
                role,
                canView = r?.CanView ?? true,
                canEdit = r?.CanEdit ?? true,
            };
        })).ToList();

        return Ok(result);
    }

    // ── PUT /api/app-role-permissions ─────────────────────────────────────────
    // Salva (upsert) l'intera matrice. Solo Admin/SuperAdmin.
    [HttpPut]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult SaveAll([FromBody] List<AppRolePermissionDto> perms)
    {
        if (perms == null || perms.Count == 0) return BadRequest("empty");

        foreach (var dto in perms)
        {
            var existing = _db.AppRolePermissions
                .FirstOrDefault(x => x.AppId == dto.AppId && x.Role == dto.Role);
            if (existing == null)
            {
                _db.AppRolePermissions.Add(new AppRolePermission
                {
                    AppId   = dto.AppId,
                    Role    = dto.Role,
                    CanView = dto.CanView,
                    CanEdit = dto.CanEdit,
                });
            }
            else
            {
                existing.CanView = dto.CanView;
                existing.CanEdit = dto.CanEdit;
            }
        }
        _db.SaveChanges();
        return Ok(new { saved = true });
    }

    // ── GET /api/app-role-permissions/my ──────────────────────────────────────
    // Restituisce i permessi dell'utente corrente: { appId, canView, canEdit }.
    // Usato dal frontend al login per applicare le guard alle route.
    // SuperAdmin ha sempre tutto canView=true canEdit=true.
    [HttpGet("my")]
    public IActionResult GetMine()
    {
        var userRoles = User.Claims
            .Where(c => c.Type == System.Security.Claims.ClaimTypes.Role)
            .Select(c => c.Value)
            .ToHashSet();

        // SuperAdmin bypassa — vede e modifica tutto
        if (userRoles.Contains("SuperAdmin"))
        {
            var all = KnownApps.Select(a => new { appId = a.Id, canView = true, canEdit = true }).ToList();
            return Ok(all);
        }

        EnsureDefaults();
        var rows = _db.AppRolePermissions.ToList();

        var result = KnownApps.Select(app =>
        {
            // Per ogni app: canView=true se ALMENO UN ruolo dell'utente ha canView=true
            bool canView = false, canEdit = false;
            foreach (var role in userRoles)
            {
                var p = rows.FirstOrDefault(x => x.AppId == app.Id && x.Role == role);
                if (p == null) { canView = true; canEdit = true; break; } // default aperto
                if (p.CanView) canView = true;
                if (p.CanEdit) canEdit = true;
            }
            return new { appId = app.Id, canView, canEdit };
        }).ToList();

        return Ok(result);
    }

    // ── Seed defaults ─────────────────────────────────────────────────────────
    private void EnsureDefaults()
    {
        try
        {
            bool changed = false;
            foreach (var app in KnownApps)
            foreach (var role in KnownRoles)
            {
                if (!_db.AppRolePermissions.Any(x => x.AppId == app.Id && x.Role == role))
                {
                    _db.AppRolePermissions.Add(new AppRolePermission
                    {
                        AppId   = app.Id,
                        Role    = role,
                        CanView = true,
                        CanEdit = true,
                    });
                    changed = true;
                }
            }
            if (changed) _db.SaveChanges();
        }
        catch (Exception ex)
        {
            // Se la tabella non esiste ancora (race condition al primo avvio), logga e continua
            Console.Error.WriteLine($"[AppRolePermissions] EnsureDefaults error: {ex.Message}");
        }
    }
}

public record AppDef(string Id, string Label);
public record AppRolePermissionDto(string AppId, string Role, bool CanView, bool CanEdit);
