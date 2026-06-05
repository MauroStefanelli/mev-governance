using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/contratti")]
[Authorize]
public class ContrattoController : BaseController
{
    private readonly AppDbContext _db;

    public ContrattoController(AppDbContext db)
    {
        _db = db;
    }

    private static string GetDataDir() =>
        Directory.Exists("/data") ? "/data" : Path.Combine(AppContext.BaseDirectory, "Data");

    // ============================================================
    // GET /api/contratti
    // Restituisce tutti i contratti con le righe MEV collegate
    // ============================================================
    [HttpGet]
    public IActionResult GetContratti()
    {
        try
        {
            var contratti = _db.Contratti
                .AsNoTracking()
                .OrderBy(c => c.RifContratto)
                .ToList();

            var mevItems = _db.MevItems
                .AsNoTracking()
                .Where(m => m.Contratto != null && m.Contratto != "")
                .OrderBy(m => m.ExcelOrder)
                .ToList();

            var result = contratti.Select(c => new
            {
                c.Id,
                c.RifContratto,
                c.TipoContratto,
                c.Data,
                c.ImpLordo,
                c.Sconto,
                c.ImportoNetto,
                c.Ordinato,
                c.DaOrdinare,
                c.Avanzato,
                c.DaAvanzare,
                MevItems = mevItems
                    .Where(m => m.Bc != null &&
                                m.Bc.Equals(c.RifContratto, StringComparison.OrdinalIgnoreCase))
                    .Select(m => new
                    {
                        m.Id,
                        m.ExcelId,
                        m.Bc,
                        m.Contratto,
                        m.AtId,
                        m.OrdinatoBdo,
                        m.AnnoCompetenza,
                        m.Applicativo,
                        m.Descrizione,
                        m.Stato,
                        m.ImportoExcel,
                    })
                    .ToList()
            }).ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            return Problem($"Errore nel recupero contratti: {ex.Message}");
        }
    }

    // ============================================================
    // POST /api/contratti/align
    // Importa il foglio CONTRATTO dal file Excel già caricato
    // ============================================================
    [HttpPost("align")]
    public IActionResult Align()
    {
        try
        {
            var dataDir = GetDataDir();
            var excelPath = Path.Combine(dataDir, "MEV_LAST.xlsx");

            if (!System.IO.File.Exists(excelPath))
                return BadRequest("Nessun file Excel disponibile. Carica prima il file con 'Carica Excel'.");

            using var workbook = new XLWorkbook(excelPath);

            var ws = workbook.Worksheets
                .FirstOrDefault(w =>
                    w.Name.Trim().Equals("CONTRATTO", StringComparison.OrdinalIgnoreCase));

            if (ws == null)
                return BadRequest("Foglio CONTRATTO non trovato nel file Excel.");

            var range = ws.RangeUsed();
            if (range == null)
                return BadRequest("Foglio CONTRATTO vuoto.");

            // Trova la riga di intestazione cercando "RIF. Contratto"
            var headerRow = range.RowsUsed()
                .FirstOrDefault(r =>
                    r.Cells().Any(c =>
                        c.GetString().Trim()
                            .Equals("RIF. Contratto", StringComparison.OrdinalIgnoreCase)));

            if (headerRow == null)
                return BadRequest("Intestazione 'RIF. Contratto' non trovata nel foglio CONTRATTO.");

            var columnMap = headerRow.Cells()
                .Where(c => !string.IsNullOrWhiteSpace(c.GetString()))
                .ToDictionary(
                    c => c.GetString().Trim(),
                    c => c.Address.ColumnNumber,
                    StringComparer.OrdinalIgnoreCase
                );

            var dataRows = ws.RowsUsed()
                .Where(r => r.RowNumber() > headerRow.RowNumber());

            // Svuota e ricarica (upsert su RifContratto)
            var existing = _db.Contratti.ToDictionary(c => c.RifContratto, c => c);
            var seenRifs = new List<string>();

            string GetString(IXLRow row, string col) =>
                columnMap.ContainsKey(col) ? row.Cell(columnMap[col]).GetString().Trim() : "";

            decimal GetDecimal(IXLRow row, string col)
            {
                if (!columnMap.ContainsKey(col)) return 0;
                row.Cell(columnMap[col]).TryGetValue(out decimal v);
                return v;
            }

            foreach (var row in dataRows)
            {
                if (row.CellsUsed().All(c => string.IsNullOrWhiteSpace(c.GetString())))
                    continue;

                var rif = GetString(row, "RIF. Contratto");
                if (string.IsNullOrWhiteSpace(rif)) continue;

                seenRifs.Add(rif);

                if (existing.TryGetValue(rif, out var c))
                {
                    c.TipoContratto = GetString(row, "Tipo Contratto");
                    c.Data          = GetString(row, "Data");
                    c.ImpLordo      = GetDecimal(row, "Imp. Lordo");
                    c.Sconto        = GetDecimal(row, "Sconto");
                    c.ImportoNetto  = GetDecimal(row, "Importo Netto");
                    c.Ordinato      = GetDecimal(row, "Ordinato");
                    c.DaOrdinare    = GetDecimal(row, "Da Ordinare");
                    c.Avanzato      = GetDecimal(row, "Avanzato");
                    c.DaAvanzare    = GetDecimal(row, "Da avanzare");
                }
                else
                {
                    _db.Contratti.Add(new Contratto
                    {
                        RifContratto  = rif,
                        TipoContratto = GetString(row, "Tipo Contratto"),
                        Data          = GetString(row, "Data"),
                        ImpLordo      = GetDecimal(row, "Imp. Lordo"),
                        Sconto        = GetDecimal(row, "Sconto"),
                        ImportoNetto  = GetDecimal(row, "Importo Netto"),
                        Ordinato      = GetDecimal(row, "Ordinato"),
                        DaOrdinare    = GetDecimal(row, "Da Ordinare"),
                        Avanzato      = GetDecimal(row, "Avanzato"),
                        DaAvanzare    = GetDecimal(row, "Da avanzare"),
                    });
                }
            }

            // Rimuove contratti non più presenti
            var toRemove = existing.Values.Where(c => !seenRifs.Contains(c.RifContratto)).ToList();
            _db.Contratti.RemoveRange(toRemove);

            _db.SaveChanges();

            return Ok(new { message = "Contratti allineati", count = _db.Contratti.Count() });
        }
        catch (Exception ex)
        {
            return Problem($"Errore durante l'allineamento contratti: {ex.Message}");
        }
    }
}
