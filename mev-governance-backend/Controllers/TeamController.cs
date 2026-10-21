using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/team")]
[Authorize]
public class TeamController : BaseController
{
    private readonly AppDbContext _db;

    public TeamController(AppDbContext db)
    {
        _db = db;
    }

    // ── GET /api/team ─────────────────────────────────────────────────────────
    [HttpGet]
    public IActionResult GetAll()
    {
        var ambienteId = GetAmbienteId();
        var items = _db.TeamMembers
            .Where(t => t.AmbienteId == ambienteId)
            .OrderBy(t => t.Risorsa)
            .ToList();
        return Ok(items);
    }

    // ── POST /api/team ────────────────────────────────────────────────────────
    [HttpPost]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult Create([FromBody] TeamMemberRequest req)
    {
        var ambienteId = GetAmbienteId();
        var item = new TeamMember
        {
            AmbienteId      = ambienteId,
            Risorsa         = req.Risorsa ?? "",
            Ambito          = req.Ambito,
            Specialita      = req.Specialita,
            PosteApplication = req.PosteApplication,
            Note            = req.Note,
            RisorsaGrade    = req.RisorsaGrade,
            Grade           = req.Grade,
            Cdc             = req.Cdc,
            Practice        = req.Practice,
            Adrc            = req.Adrc,
            Cor             = req.Cor,
            CorpId          = req.CorpId,
            Email           = req.Email,
        };
        _db.TeamMembers.Add(item);
        _db.SaveChanges();
        return CreatedAtAction(nameof(GetAll), new { }, item);
    }

    // ── PUT /api/team/{id} ────────────────────────────────────────────────────
    [HttpPut("{id}")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult Update(int id, [FromBody] TeamMemberRequest req)
    {
        var ambienteId = GetAmbienteId();
        var item = _db.TeamMembers.FirstOrDefault(t => t.Id == id && t.AmbienteId == ambienteId);
        if (item == null) return NotFound();

        item.Risorsa          = req.Risorsa ?? "";
        item.Ambito           = req.Ambito;
        item.Specialita       = req.Specialita;
        item.PosteApplication = req.PosteApplication;
        item.Note             = req.Note;
        item.RisorsaGrade     = req.RisorsaGrade;
        item.Grade            = req.Grade;
        item.Cdc              = req.Cdc;
        item.Practice         = req.Practice;
        item.Adrc             = req.Adrc;
        item.Cor              = req.Cor;
        item.CorpId           = req.CorpId;
        item.Email            = req.Email;

        _db.SaveChanges();
        return Ok(item);
    }

    // ── DELETE /api/team/{id} ─────────────────────────────────────────────────
    [HttpDelete("{id}")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult Delete(int id)
    {
        var ambienteId = GetAmbienteId();
        var item = _db.TeamMembers.FirstOrDefault(t => t.Id == id && t.AmbienteId == ambienteId);
        if (item == null) return NotFound();
        _db.TeamMembers.Remove(item);
        _db.SaveChanges();
        return NoContent();
    }

    // ── POST /api/team/import ─────────────────────────────────────────────────
    // Importa un array di righe (da Excel sheet TEAM), sostituisce tutto per l'ambiente
    [HttpPost("import")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult Import([FromBody] List<TeamMemberRequest> rows)
    {
        var ambienteId = GetAmbienteId();
        var existing = _db.TeamMembers.Where(t => t.AmbienteId == ambienteId).ToList();
        _db.TeamMembers.RemoveRange(existing);

        foreach (var req in rows)
        {
            _db.TeamMembers.Add(new TeamMember
            {
                AmbienteId       = ambienteId,
                Risorsa          = req.Risorsa ?? "",
                Ambito           = req.Ambito,
                Specialita       = req.Specialita,
                PosteApplication = req.PosteApplication,
                Note             = req.Note,
                RisorsaGrade     = req.RisorsaGrade,
                Grade            = req.Grade,
                Cdc              = req.Cdc,
                Practice         = req.Practice,
                Adrc             = req.Adrc,
                Cor              = req.Cor,
                CorpId           = req.CorpId,
                Email            = req.Email,
            });
        }
        _db.SaveChanges();
        return Ok(new { imported = rows.Count });
    }
}

public class TeamMemberRequest
{
    public string? Risorsa { get; set; }
    public string? Ambito { get; set; }
    public string? Specialita { get; set; }
    public string? PosteApplication { get; set; }
    public string? Note { get; set; }
    public string? RisorsaGrade { get; set; }
    public string? Grade { get; set; }
    public string? Cdc { get; set; }
    public string? Practice { get; set; }
    public string? Adrc { get; set; }
    public string? Cor { get; set; }
    public string? CorpId { get; set; }
    public string? Email { get; set; }
}
