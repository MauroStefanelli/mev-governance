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
    // Struttura: Contratto → Anni → BC (sommati) → GoTo (dettaglio)
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
                .Where(m => m.Contratto != null && m.Contratto != "" &&
                            m.Bc != null && m.Bc != "")
                .OrderBy(m => m.AnnoCompetenza).ThenBy(m => m.Bc).ThenBy(m => m.ExcelOrder)
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
                // Anni → per ogni anno, lista BC con somme + dettaglio GoTo
                Anni = mevItems
                    .Where(m => m.Contratto != null &&
                                m.Contratto.Equals(c.TipoContratto, StringComparison.OrdinalIgnoreCase))
                    .GroupBy(m => m.AnnoCompetenza)
                    .OrderBy(g => g.Key)
                    .Select(gAnno => new
                    {
                        Anno = gAnno.Key,
                        TotImportoFornitura = gAnno.Sum(m => m.ImportoExcel),
                        TotOrdinatoBdo      = gAnno.Sum(m => m.OrdinatoBdo),
                        TotFatturato        = gAnno.Sum(m => m.Fatturato),
                        // BC sommati per anno
                        BcList = gAnno
                            .GroupBy(m => m.Bc)
                            .OrderBy(g => g.Key)
                            .Select(gBc => new
                            {
                                Bc = gBc.Key,
                                TotImportoFornitura = gBc.Sum(m => m.ImportoExcel),
                                TotOrdinatoBdo      = gBc.Sum(m => m.OrdinatoBdo),
                                TotFatturato        = gBc.Sum(m => m.Fatturato),
                                // Dettaglio GoTo per BC
                                GoToList = gBc
                                    .OrderBy(m => m.GoTo)
                                    .Select(m => new
                                    {
                                        m.GoTo,
                                        m.AnnoCompetenza,
                                        m.ReleaseExcel,
                                        // Importo Fornitura scontato = ImportoExcel * (1 - Sconto/100)
                                        ImportoForniturascontato = c.Sconto > 0
                                            ? m.ImportoExcel * (1 - c.Sconto / 100m)
                                            : m.ImportoExcel,
                                        m.OrdinatoBdo,
                                        m.Fatturato,
                                    })
                                    .ToList()
                            })
                            .ToList()
                    })
                    .ToList()
            }).ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            var inner = ex.InnerException?.Message ?? "";
            return Problem($"Errore nel recupero contratti: {ex.Message} | Inner: {inner}");
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

            // Legge solo le righe della tabella CONTRATTO:
            // scorre riga per riga dopo l'intestazione e si ferma alla prima
            // riga vuota o alla prima riga che contiene una nuova intestazione
            // (altra tabella nel foglio)
            int headerRowNum = headerRow.RowNumber();
            int lastRowNum   = ws.LastRowUsed()?.RowNumber() ?? headerRowNum;
            var dataRowNumbers = new List<int>();
            for (int rn = headerRowNum + 1; rn <= lastRowNum; rn++)
            {
                var r = ws.Row(rn);
                // Fermati se la riga è completamente vuota
                if (!r.CellsUsed().Any()) break;
                // Fermati se la prima cella usata contiene "RIF. Contratto"
                // (intestazione di un'altra tabella)
                if (r.CellsUsed().Any(c =>
                    c.GetString().Trim().Equals("RIF. Contratto", StringComparison.OrdinalIgnoreCase)))
                    break;
                dataRowNumbers.Add(rn);
            }
            var dataRows = dataRowNumbers.Select(rn => ws.Row(rn));

            // Upsert su RifContratto — gestisce duplicati nel DB e nell'Excel
            // In caso di chiavi duplicate nel DB prendiamo l'ultimo record
            var existing = _db.Contratti
                .AsEnumerable()
                .GroupBy(c => c.RifContratto, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Last(), StringComparer.OrdinalIgnoreCase);
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

                // Se questo RIF è già stato visto in questa sessione (duplicato Excel),
                // aggiorna il record già inserito/aggiornato in precedenza
                if (seenRifs.Contains(rif, StringComparer.OrdinalIgnoreCase))
                {
                    if (existing.TryGetValue(rif, out var dup))
                    {
                        dup.ImpLordo     += GetDecimal(row, "Imp. Lordo");
                        dup.Sconto       += GetDecimal(row, "Sconto");
                        dup.ImportoNetto += GetDecimal(row, "Importo Netto");
                        dup.Ordinato     += GetDecimal(row, "Ordinato");
                        dup.DaOrdinare   += GetDecimal(row, "Da Ordinare");
                        dup.Avanzato     += GetDecimal(row, "Avanzato");
                        dup.DaAvanzare   += GetDecimal(row, "Da avanzare");
                    }
                    continue;
                }

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
            var inner = ex.InnerException?.Message ?? "";
            return Problem($"Errore durante l'allineamento contratti: {ex.Message} | Inner: {inner}");
        }
    }
}
