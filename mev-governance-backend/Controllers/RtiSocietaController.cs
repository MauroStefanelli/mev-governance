using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using System.Security.Claims;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/rti-societa")]
[Authorize]
public class RtiSocietaController : BaseController
{
    private readonly AppDbContext _db;

    public RtiSocietaController(AppDbContext db)
    {
        _db = db;
    }

    // Helper: converte una DateTime in UTC (evita errore Npgsql "Kind=Unspecified")
    private static DateTime? ToUtc(DateTime? dt) =>
        dt.HasValue ? DateTime.SpecifyKind(dt.Value, DateTimeKind.Utc) : null;

    // Helper: risolve l'ambienteId effettivo (fallback al primo ambiente se claim == 0)
    private int ResolveAmbienteId()
    {
        var id = GetAmbienteId();
        if (id > 0) return id;
        // Fallback: primo ambiente disponibile nel DB
        var first = _db.Set<MevGovernanceBackend.Models.Ambiente>().OrderBy(a => a.Id).FirstOrDefault();
        return first?.Id ?? 1;
    }

    // GET api/rti-societa — tutte le righe dell'ambiente corrente
    [HttpGet]
    public IActionResult GetAll()
    {
        var ambienteId = GetAmbienteId();
        Console.WriteLine($"[RTI] GetAll ambienteId={ambienteId}");

        IQueryable<RtiSocietaRiga> query = _db.RtiSocietaRighe;

        // Se ambienteId è valido (>0) filtra per ambiente, altrimenti restituisce tutte le righe.
        // AmbienteId==0 avviene quando il claim manca nel token (token emesso prima del campo,
        // o utente senza ambienti associati). In questo caso mostriamo tutte le righe disponibili.
        if (ambienteId > 0)
            query = query.Where(r => r.AmbienteId == ambienteId);

        var righe = query.OrderBy(r => r.Ordine).ThenBy(r => r.Id).ToList();
        Console.WriteLine($"[RTI] Trovate {righe.Count} righe");
        return Ok(righe);
    }

    // POST api/rti-societa — crea una nuova riga
    [HttpPost]
    public IActionResult Create([FromBody] RtiSocietaRigaDto dto)
    {
        var ambienteId = ResolveAmbienteId();
        var maxOrdine = _db.RtiSocietaRighe
            .Where(r => r.AmbienteId == ambienteId)
            .Select(r => (int?)r.Ordine).Max() ?? 0;

        var riga = new RtiSocietaRiga
        {
            AmbienteId      = ambienteId,
            Contratto       = dto.Contratto ?? "",
            Ruolo           = dto.Ruolo ?? "",
            Societa         = dto.Societa ?? "",
            DataInizio      = ToUtc(dto.DataInizio),
            DataApprovazione = ToUtc(dto.DataApprovazione),
            Percentuale     = dto.Percentuale,
            Importo         = dto.Importo,
            Consumato       = dto.Consumato,
            Ordine          = maxOrdine + 1,
        };
        _db.RtiSocietaRighe.Add(riga);
        _db.SaveChanges();
        return Ok(riga);
    }

    // POST api/rti-societa/bulk — importa un array di righe (migrazione da localStorage)
    [HttpPost("bulk")]
    public IActionResult BulkCreate([FromBody] List<RtiSocietaRigaDto> dtos)
    {
        var ambienteId = ResolveAmbienteId();
        // Evita duplicati: se ci sono già righe per questo ambiente, non importa
        if (_db.RtiSocietaRighe.Any(r => r.AmbienteId == ambienteId))
            return Ok(new { skipped = true, message = "Righe già presenti, import ignorato" });

        int ordine = 1;
        var righe = dtos.Select(dto => new RtiSocietaRiga
        {
            AmbienteId       = ambienteId,
            Contratto        = dto.Contratto ?? "",
            Ruolo            = dto.Ruolo ?? "",
            Societa          = dto.Societa ?? "",
            DataInizio       = ToUtc(dto.DataInizio),
            DataApprovazione = ToUtc(dto.DataApprovazione),
            Percentuale      = dto.Percentuale,
            Importo          = dto.Importo,
            Consumato        = dto.Consumato,
            Ordine           = ordine++,
        }).ToList();

        _db.RtiSocietaRighe.AddRange(righe);
        _db.SaveChanges();
        return Ok(righe);
    }

    // PUT api/rti-societa/{id} — aggiorna una riga esistente
    [HttpPut("{id}")]
    public IActionResult Update(int id, [FromBody] RtiSocietaRigaDto dto)
    {
        var ambienteId = ResolveAmbienteId();
        var riga = _db.RtiSocietaRighe.FirstOrDefault(r => r.Id == id && r.AmbienteId == ambienteId);
        if (riga == null) return NotFound();

        riga.Contratto        = dto.Contratto ?? riga.Contratto;
        riga.Ruolo            = dto.Ruolo ?? riga.Ruolo;
        riga.Societa          = dto.Societa ?? riga.Societa;
        riga.DataInizio       = ToUtc(dto.DataInizio);
        riga.DataApprovazione = ToUtc(dto.DataApprovazione);
        riga.Percentuale      = dto.Percentuale;
        riga.Importo          = dto.Importo;
        riga.Consumato        = dto.Consumato;

        _db.SaveChanges();
        return Ok(riga);
    }

    // DELETE api/rti-societa/{id}
    [HttpDelete("{id}")]
    public IActionResult Delete(int id)
    {
        var ambienteId = ResolveAmbienteId();
        var riga = _db.RtiSocietaRighe.FirstOrDefault(r => r.Id == id && r.AmbienteId == ambienteId);
        if (riga == null) return NotFound();
        _db.RtiSocietaRighe.Remove(riga);
        _db.SaveChanges();
        return Ok(new { deleted = id });
    }
}

public class RtiSocietaRigaDto
{
    public string? Contratto { get; set; }
    public string? Ruolo { get; set; }
    public string? Societa { get; set; }
    public DateTime? DataInizio { get; set; }
    public DateTime? DataApprovazione { get; set; }
    public decimal? Percentuale { get; set; }
    public decimal? Importo { get; set; }
    public decimal? Consumato { get; set; }
}
