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
    // Solo Admin — Struttura: Contratto → Anni → BC → GoTo
    // ============================================================
    [HttpGet]
    [Authorize(Roles = "Admin")]
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
                        BcList = gAnno
                            .GroupBy(m => m.Bc)
                            .OrderBy(g => g.Key)
                            .Select(gBc => new
                            {
                                Bc = gBc.Key,
                                TotImportoFornitura = gBc.Sum(m => m.ImportoExcel),
                                TotOrdinatoBdo      = gBc.Sum(m => m.OrdinatoBdo),
                                TotFatturato        = gBc.Sum(m => m.Fatturato),
                                GoToList = gBc
                                    .OrderBy(m => m.GoTo)
                                .Select(m => new
                                {
                                    m.GoTo,
                                    m.AnnoCompetenza,
                                    m.ReleaseExcel,
                                    m.Rda,
                                    m.AtId,
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
    // GET /api/contratti/pubblico
    // Tutti gli utenti autenticati
    // Struttura: Contratto → Anni → ODA (da BUONI_CONSEGNA) → MEV aggregato
    // ============================================================
    [HttpGet("pubblico")]
    public IActionResult GetContrattiPubblico()
    {
        try
        {
            var contratti = _db.Contratti
                .AsNoTracking()
                .OrderBy(c => c.RifContratto)
                .ToList();

            var buoni = _db.BuoniConsegna
                .AsNoTracking()
                .OrderBy(b => b.Oda)
                .ToList();

            var mevItems = _db.MevItems
                .AsNoTracking()
                .Where(m => m.Bc != null && m.Bc != "")
                .ToList();

            var result = contratti.Select(c => new
            {
                c.Id,
                c.TipoContratto,
                c.RifContratto,
                Importo    = c.ImportoNetto,
                c.Ordinato,
                c.DaOrdinare,
                c.Avanzato,
                c.DaAvanzare,
                // ODA collegati a questo contratto via RIF. Contratto
                // raggruppati per Anno Competenza delle righe MEV
                Anni = buoni
                    .Where(b => b.RifContratto != null &&
                                b.RifContratto.Equals(c.RifContratto, StringComparison.OrdinalIgnoreCase))
                    .SelectMany(b =>
                    {
                        // Righe MEV con BC = ODA
                        var mevBc = mevItems
                            .Where(m => m.Bc != null &&
                                        m.Bc.Equals(b.Oda, StringComparison.OrdinalIgnoreCase))
                            .ToList();
                        return mevBc.Select(m => new { Oda = b, Mev = m });
                    })
                    .GroupBy(x => x.Mev.AnnoCompetenza)
                    .OrderBy(g => g.Key)
                    .Select(gAnno => new
                    {
                        Anno = gAnno.Key,
                        // ODA distinti per questo anno con aggregati MEV
                        OdaList = gAnno
                            .GroupBy(x => x.Oda.Oda)
                            .OrderBy(g => g.Key)
                            .Select(gOda => new
                            {
                                Oda            = gOda.Key,
                                Totale         = gOda.Sum(x => x.Mev.ImportoExcel),
                                OrdinatoBdo    = gOda.Sum(x => x.Mev.OrdinatoBdo),
                                Fatturato      = gOda.Sum(x => x.Mev.Fatturato),
                                DaFatturare    = gOda.Sum(x => x.Mev.ImportoExcel) - gOda.Sum(x => x.Mev.Fatturato),
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
            return Problem($"Errore nel recupero contratti pubblici: {ex.Message} | Inner: {inner}");
        }
    }

    // ============================================================
    // POST /api/contratti/align
    // Importa foglio CONTRATTO (tabella CONTRATTO + tabella BUONI_CONSEGNA)
    // ============================================================
    [HttpPost("align")]
    public IActionResult Align()
    {
        try
        {
            var dataDir  = GetDataDir();
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

            // ── Import tabella CONTRATTO ──────────────────────────────────────
            var contrattoHeaderRow = range.RowsUsed()
                .FirstOrDefault(r =>
                    r.Cells().Any(c =>
                        c.GetString().Trim()
                            .Equals("RIF. Contratto", StringComparison.OrdinalIgnoreCase)));

            if (contrattoHeaderRow == null)
                return BadRequest("Intestazione 'RIF. Contratto' non trovata nel foglio CONTRATTO.");

            ImportContratti(ws, contrattoHeaderRow);

            // ── Import tabella BUONI_CONSEGNA ─────────────────────────────────
            // Cerca la riga intestazione con "ODA"
            var buoniHeaderRow = range.RowsUsed()
                .FirstOrDefault(r =>
                    r.Cells().Any(c =>
                        c.GetString().Trim()
                            .Equals("ODA", StringComparison.OrdinalIgnoreCase)));

            if (buoniHeaderRow != null)
                ImportBuoniConsegna(ws, buoniHeaderRow);

            // ── Import tabella ConsumoTOW ─────────────────────────────────────
            // Cerca la riga che ha "Contratto" + "Valore Totale" + "Impegnato" (intestazione univoca ConsumoTOW)
            var towHeaderRow = range.RowsUsed()
                .FirstOrDefault(r =>
                    r.Cells().Any(c => c.GetString().Trim().Equals("Valore Totale", StringComparison.OrdinalIgnoreCase)) &&
                    r.Cells().Any(c => c.GetString().Trim().Equals("Impegnato",     StringComparison.OrdinalIgnoreCase)) &&
                    r.Cells().Any(c => c.GetString().Trim().Equals("Contratto",     StringComparison.OrdinalIgnoreCase)));

            if (towHeaderRow != null)
                ImportConsumoTow(ws, towHeaderRow);

            _db.SaveChanges();

            return Ok(new
            {
                message          = "Contratti allineati",
                count            = _db.Contratti.Count(),
                countBuoni       = _db.BuoniConsegna.Count(),
                countTow         = _db.ConsumoTow.Count(),
            });
        }
        catch (Exception ex)
        {
            var inner = ex.InnerException?.Message ?? "";
            return Problem($"Errore durante l'allineamento contratti: {ex.Message} | Inner: {inner}");
        }
    }

    // ── Metodo privato: import tabella CONTRATTO ──────────────────────────────
    private void ImportContratti(IXLWorksheet ws, IXLRangeRow headerRow)
    {
        var columnMap = BuildColumnMap(headerRow);
        var dataRows  = ReadTableRows(ws, headerRow, "RIF. Contratto");

        string Str(IXLRow row, string col) =>
            columnMap.ContainsKey(col) ? row.Cell(columnMap[col]).GetString().Trim() : "";
        decimal Dec(IXLRow row, string col)
        {
            if (!columnMap.ContainsKey(col)) return 0;
            row.Cell(columnMap[col]).TryGetValue(out decimal v); return v;
        }

        var existing = _db.Contratti
            .AsEnumerable()
            .GroupBy(c => c.RifContratto, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Last(), StringComparer.OrdinalIgnoreCase);
        var seenRifs = new List<string>();

        foreach (var row in dataRows)
        {
            var rif = Str(row, "RIF. Contratto");
            if (string.IsNullOrWhiteSpace(rif)) continue;

            if (seenRifs.Contains(rif, StringComparer.OrdinalIgnoreCase))
            {
                if (existing.TryGetValue(rif, out var dup))
                {
                    dup.ImpLordo     += Dec(row, "Imp. Lordo");
                    dup.Sconto       += Dec(row, "Sconto");
                    dup.ImportoNetto += Dec(row, "Importo Netto");
                    dup.Ordinato     += Dec(row, "Ordinato");
                    dup.DaOrdinare   += Dec(row, "Da Ordinare");
                    dup.Avanzato     += Dec(row, "Avanzato");
                    dup.DaAvanzare   += Dec(row, "Da avanzare");
                }
                continue;
            }
            seenRifs.Add(rif);

            if (existing.TryGetValue(rif, out var c))
            {
                c.TipoContratto = Str(row, "Tipo Contratto");
                c.Data          = Str(row, "Data");
                c.ImpLordo      = Dec(row, "Imp. Lordo");
                c.Sconto        = Dec(row, "Sconto");
                c.ImportoNetto  = Dec(row, "Importo Netto");
                c.Ordinato      = Dec(row, "Ordinato");
                c.DaOrdinare    = Dec(row, "Da Ordinare");
                c.Avanzato      = Dec(row, "Avanzato");
                c.DaAvanzare    = Dec(row, "Da avanzare");
            }
            else
            {
                _db.Contratti.Add(new Contratto
                {
                    RifContratto  = rif,
                    TipoContratto = Str(row, "Tipo Contratto"),
                    Data          = Str(row, "Data"),
                    ImpLordo      = Dec(row, "Imp. Lordo"),
                    Sconto        = Dec(row, "Sconto"),
                    ImportoNetto  = Dec(row, "Importo Netto"),
                    Ordinato      = Dec(row, "Ordinato"),
                    DaOrdinare    = Dec(row, "Da Ordinare"),
                    Avanzato      = Dec(row, "Avanzato"),
                    DaAvanzare    = Dec(row, "Da avanzare"),
                });
            }
        }

        var toRemove = existing.Values.Where(c => !seenRifs.Contains(c.RifContratto)).ToList();
        _db.Contratti.RemoveRange(toRemove);
    }

    // ── Metodo privato: import tabella BUONI_CONSEGNA ─────────────────────────
    private void ImportBuoniConsegna(IXLWorksheet ws, IXLRangeRow headerRow)
    {
        var columnMap = BuildColumnMap(headerRow);
        var dataRows  = ReadTableRows(ws, headerRow, "ODA");

        string Str(IXLRow row, string col) =>
            columnMap.ContainsKey(col) ? row.Cell(columnMap[col]).GetString().Trim() : "";
        decimal Dec(IXLRow row, string col)
        {
            if (!columnMap.ContainsKey(col)) return 0;
            row.Cell(columnMap[col]).TryGetValue(out decimal v); return v;
        }

        var existing = _db.BuoniConsegna
            .AsEnumerable()
            .GroupBy(b => b.Oda, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Last(), StringComparer.OrdinalIgnoreCase);
        var seenOda = new List<string>();

        foreach (var row in dataRows)
        {
            var oda = Str(row, "ODA");
            if (string.IsNullOrWhiteSpace(oda)) continue;
            if (seenOda.Contains(oda, StringComparer.OrdinalIgnoreCase)) continue;
            seenOda.Add(oda);

            if (existing.TryGetValue(oda, out var b))
            {
                b.Contratto   = Str(row, "Contratto");
                b.RifContratto = Str(row, "Rif. Contratto");
                b.Importo     = Dec(row, "Importo");
                b.Avanzato    = Dec(row, "Avanzato");
                b.DaAvanzare  = Dec(row, "Da Avanzare");
            }
            else
            {
                _db.BuoniConsegna.Add(new BuonoConsegna
                {
                    Oda          = oda,
                    Contratto    = Str(row, "Contratto"),
                    RifContratto = Str(row, "Rif. Contratto"),
                    Importo      = Dec(row, "Importo"),
                    Avanzato     = Dec(row, "Avanzato"),
                    DaAvanzare   = Dec(row, "Da Avanzare"),
                });
            }
        }

        var toRemove = existing.Values.Where(b => !seenOda.Contains(b.Oda)).ToList();
        _db.BuoniConsegna.RemoveRange(toRemove);
    }

    // ============================================================
    // GET /api/contratti/debug-tow   — diagnostica temporanea
    // ============================================================
    [HttpGet("debug-tow")]
    [Authorize(Roles = "Admin")]
    public IActionResult DebugTow()
    {
        try
        {
            var dataDir   = GetDataDir();
            var excelPath = Path.Combine(dataDir, "MEV_LAST.xlsx");
            if (!System.IO.File.Exists(excelPath))
                return BadRequest("File Excel non trovato");

            using var workbook = new XLWorkbook(excelPath);
            var ws = workbook.Worksheets
                .FirstOrDefault(w => w.Name.Trim().Equals("CONTRATTO", StringComparison.OrdinalIgnoreCase));
            if (ws == null) return BadRequest("Foglio CONTRATTO non trovato");

            var range = ws.RangeUsed();
            if (range == null) return BadRequest("Foglio vuoto");

            // Elenca tutte le intestazioni trovate (righe con almeno 3 celle non vuote)
            var headers = range.RowsUsed()
                .Select(r => new {
                    RowNum = r.RowNumber(),
                    Cells  = r.Cells()
                                .Where(c => !string.IsNullOrWhiteSpace(c.GetString()))
                                .Select(c => c.GetString().Trim())
                                .ToList()
                })
                .Where(r => r.Cells.Count >= 3)
                .Take(30)
                .ToList();

            var dbCount = _db.ConsumoTow.Count();
            var dbRows  = _db.ConsumoTow.AsNoTracking().Take(10).ToList();

            return Ok(new { dbCount, dbRows, excelHeaders = headers });
        }
        catch (Exception ex)
        {
            return Problem(ex.Message);
        }
    }

    // ============================================================
    // GET /api/contratti/consumo-tow
    // Tutti gli utenti autenticati
    // ============================================================
    [HttpGet("consumo-tow")]
    public IActionResult GetConsumoTow()
    {
        try
        {
            var rows = _db.ConsumoTow.AsNoTracking().OrderBy(t => t.Contratto).ToList();
            return Ok(rows);
        }
        catch (Exception ex)
        {
            return Problem($"Errore recupero ConsumoTOW: {ex.Message}");
        }
    }

    // ── Metodo privato: import tabella ConsumoTOW ─────────────────────────────
    private void ImportConsumoTow(IXLWorksheet ws, IXLRangeRow headerRow)
    {
        var columnMap = BuildColumnMap(headerRow);
        var dataRows  = ReadTableRows(ws, headerRow); // nessuno stopKey: legge fino a riga vuota

        string Str(IXLRow row, string col) =>
            columnMap.ContainsKey(col) ? row.Cell(columnMap[col]).GetString().Trim() : "";
        decimal Dec(IXLRow row, string col)
        {
            if (!columnMap.ContainsKey(col)) return 0;
            row.Cell(columnMap[col]).TryGetValue(out decimal v); return v;
        }

        // Svuota e ricarica sempre
        _db.ConsumoTow.RemoveRange(_db.ConsumoTow.ToList());

        foreach (var row in dataRows)
        {
            var contratto = Str(row, "Contratto");
            if (string.IsNullOrWhiteSpace(contratto)) continue;

            _db.ConsumoTow.Add(new ConsumoTow
            {
                Contratto    = contratto,
                ValoreTotale = Dec(row, "Valore Totale"),
                Approvato    = Dec(row, "Approvato"),
                OrdinatiRda  = Dec(row, "Ordinati (RDA)"),
                Impegnato    = Dec(row, "Impegnato"),
                Residuo      = Dec(row, "Residuo"),
            });
        }
    }

    // ── Helper: costruisce mappa colonne da riga intestazione ─────────────────
    private static Dictionary<string, int> BuildColumnMap(IXLRangeRow headerRow) =>
        headerRow.Cells()
            .Where(c => !string.IsNullOrWhiteSpace(c.GetString()))
            .GroupBy(c => c.GetString().Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Address.ColumnNumber,
                          StringComparer.OrdinalIgnoreCase);

    // ── Helper: legge righe dati fino a riga vuota o nuova intestazione ────────
    private static IEnumerable<IXLRow> ReadTableRows(IXLWorksheet ws, IXLRangeRow headerRow, string? stopKey = null)
    {
        int headerRowNum = headerRow.RowNumber();
        int lastRowNum   = ws.LastRowUsed()?.RowNumber() ?? headerRowNum;
        var rows = new List<IXLRow>();
        for (int rn = headerRowNum + 1; rn <= lastRowNum; rn++)
        {
            var r = ws.Row(rn);
            if (!r.CellsUsed().Any()) break;
            if (stopKey != null && r.CellsUsed().Any(c =>
                c.GetString().Trim().Equals(stopKey, StringComparison.OrdinalIgnoreCase)))
                break;
            rows.Add(r);
        }
        return rows;
    }
}
