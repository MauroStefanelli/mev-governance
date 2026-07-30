using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Controllers;

/// <summary>
/// Gestione ambienti (solo SuperAdmin).
/// Endpoint:
///   GET    /api/ambienti                    — lista ambienti
///   POST   /api/ambienti                    — crea ambiente
///   PUT    /api/ambienti/{id}               — modifica ambiente
///   DELETE /api/ambienti/{id}               — disattiva ambiente
///   GET    /api/ambienti/{id}/utenti        — utenti associati
///   POST   /api/ambienti/{id}/utenti        — associa utente
///   DELETE /api/ambienti/{id}/utenti/{uid}  — rimuove associazione
/// </summary>
[ApiController]
[Route("api/ambienti")]
[Authorize]
public class AmbienteController : ControllerBase
{
    private readonly AppDbContext _db;

    public AmbienteController(AppDbContext db) { _db = db; }

    // ----------------------------------------------------------------
    // GET /api/ambienti
    // ----------------------------------------------------------------
    [HttpGet]
    public IActionResult GetAll()
    {
        if (!User.IsInRole("SuperAdmin"))
            return Forbid();

        var list = _db.Ambienti
            .OrderBy(a => a.CodiceContratto)
            .Select(a => new
            {
                a.Id,
                a.CodiceContratto,
                a.Descrizione,
                a.IsActive,
                a.CreatedAt
            })
            .ToList();

        return Ok(list);
    }

    // ----------------------------------------------------------------
    // POST /api/ambienti
    // ----------------------------------------------------------------
    [HttpPost]
    public IActionResult Create([FromBody] AmbienteRequest req)
    {
        if (!User.IsInRole("SuperAdmin"))
            return Forbid();

        if (_db.Ambienti.Any(a => a.CodiceContratto == req.CodiceContratto))
            return BadRequest("Esiste già un ambiente con questo CodiceContratto.");

        var a = new Ambiente
        {
            CodiceContratto = req.CodiceContratto,
            Descrizione     = req.Descrizione,
            IsActive        = true,
            CreatedAt       = DateTime.UtcNow
        };
        _db.Ambienti.Add(a);
        _db.SaveChanges();

        return Ok(new { a.Id, a.CodiceContratto, a.Descrizione, a.IsActive, a.CreatedAt });
    }

    // ----------------------------------------------------------------
    // PUT /api/ambienti/{id}
    // ----------------------------------------------------------------
    [HttpPut("{id}")]
    public IActionResult Update(int id, [FromBody] AmbienteRequest req)
    {
        if (!User.IsInRole("SuperAdmin"))
            return Forbid();

        var a = _db.Ambienti.FirstOrDefault(x => x.Id == id);
        if (a == null) return NotFound();

        a.CodiceContratto = req.CodiceContratto;
        a.Descrizione     = req.Descrizione;
        if (req.IsActive.HasValue) a.IsActive = req.IsActive.Value;

        _db.SaveChanges();
        return Ok(new { a.Id, a.CodiceContratto, a.Descrizione, a.IsActive });
    }

    // ----------------------------------------------------------------
    // DELETE /api/ambienti/{id}  (soft-delete: IsActive = false)
    // ----------------------------------------------------------------
    [HttpDelete("{id}")]
    public IActionResult Deactivate(int id)
    {
        if (!User.IsInRole("SuperAdmin"))
            return Forbid();

        var a = _db.Ambienti.FirstOrDefault(x => x.Id == id);
        if (a == null) return NotFound();

        a.IsActive = false;
        _db.SaveChanges();

        return Ok(new { message = $"Ambiente {a.CodiceContratto} disattivato." });
    }

    // ----------------------------------------------------------------
    // GET /api/ambienti/{id}/utenti
    // ----------------------------------------------------------------
    [HttpGet("{id}/utenti")]
    public IActionResult GetUtenti(int id)
    {
        if (!User.IsInRole("SuperAdmin"))
            return Forbid();

        var result = (from ua in _db.UserAmbienti
                      join u in _db.Users on ua.UserId equals u.Id
                      where ua.AmbienteId == id
                      select new
                      {
                          ua.Id,
                          ua.UserId,
                          u.Username,
                          u.FullName,
                          u.Email,
                          ua.Ruolo
                      }).ToList();

        return Ok(result);
    }

    // ----------------------------------------------------------------
    // POST /api/ambienti/{id}/utenti
    // Body: { "userId": 5, "ruolo": "Editor" }
    // ----------------------------------------------------------------
    [HttpPost("{id}/utenti")]
    public IActionResult AddUtente(int id, [FromBody] UserAmbienteRequest req)
    {
        if (!User.IsInRole("SuperAdmin"))
            return Forbid();

        if (!_db.Ambienti.Any(a => a.Id == id))
            return NotFound("Ambiente non trovato.");

        if (!_db.Users.Any(u => u.Id == req.UserId))
            return NotFound("Utente non trovato.");

        if (_db.UserAmbienti.Any(ua => ua.UserId == req.UserId && ua.AmbienteId == id))
            return BadRequest("L'utente è già associato a questo ambiente.");

        var validRoles = new[] { "Admin", "Editor" };
        if (!validRoles.Contains(req.Ruolo))
            return BadRequest("Ruolo non valido. Valori accettati: Admin, Editor");

        var ua = new UserAmbiente { UserId = req.UserId, AmbienteId = id, Ruolo = req.Ruolo };
        _db.UserAmbienti.Add(ua);
        _db.SaveChanges();

        return Ok(new { ua.Id, ua.UserId, ua.AmbienteId, ua.Ruolo });
    }

    // ----------------------------------------------------------------
    // DELETE /api/ambienti/{id}/utenti/{userId}
    // ----------------------------------------------------------------
    [HttpDelete("{id}/utenti/{userId}")]
    public IActionResult RemoveUtente(int id, int userId)
    {
        if (!User.IsInRole("SuperAdmin"))
            return Forbid();

        var ua = _db.UserAmbienti.FirstOrDefault(x => x.AmbienteId == id && x.UserId == userId);
        if (ua == null) return NotFound();

        _db.UserAmbienti.Remove(ua);
        _db.SaveChanges();

        return Ok(new { message = "Associazione rimossa." });
    }
}

// ----------------------------------------------------------------
// DTOs
// ----------------------------------------------------------------
public record AmbienteRequest(string CodiceContratto, string Descrizione, bool? IsActive = null);
public record UserAmbienteRequest(int UserId, string Ruolo);
