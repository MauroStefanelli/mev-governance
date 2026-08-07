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
    // Tutti gli utenti autenticati — Struttura: Contratto → Anni → BC → GoTo
    // ============================================================
    [HttpGet]
    [Authorize]
    public IActionResult GetContratti()
    {
        try
        {
            var ambienteId = GetAmbienteId();
            var contratti = _db.Contratti
                .AsNoTracking()
                .Where(c => c.AmbienteId == ambienteId)
                .OrderBy(c => c.RifContratto)
                .ToList();

            var mevItems = _db.MevItems
                .AsNoTracking()
                .Where(m => m.AmbienteId == ambienteId &&
                            m.Contratto != null && m.Contratto != "" &&
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
                                     m.Applicativo,
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
            var ambienteId = GetAmbienteId();
            var contratti = _db.Contratti
                .AsNoTracking()
                .Where(c => c.AmbienteId == ambienteId)
                .OrderBy(c => c.RifContratto)
                .ToList();

            var buoni = _db.BuoniConsegna
                .AsNoTracking()
                .Where(b => b.AmbienteId == ambienteId)
                .OrderBy(b => b.Oda)
                .ToList();

            var mevItems = _db.MevItems
                .AsNoTracking()
                .Where(m => m.AmbienteId == ambienteId && m.Bc != null && m.Bc != "")
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
        var ambienteId = GetAmbienteId();
        return AlignInternal(ambienteId);
    }

    // ============================================================
    // GET /api/contratti/debug-recalc
    // Diagnostica: mostra i dati usati dal RecalcConsumoTow
    // senza modificare nulla nel DB.
    // ============================================================
    [HttpGet("debug-recalc")]
    public IActionResult DebugRecalc()
    {
        var ambienteId = GetAmbienteId();

        var towRows = _db.ConsumoTow
            .Where(t => t.AmbienteId == ambienteId)
            .ToList();

        var mevItems = _db.MevItems
            .AsNoTracking()
            .Where(m => m.AmbienteId == ambienteId)
            .ToList();

        var towQtaSelectors = new Func<MevItem, decimal?>[]
        {
            m => m.Tow021,
            m => m.Tow022,
            m => m.Tow023,
            m => m.Tow024,
            m => m.Tow025,
            m => m.Tow026,
        };

        var towContratti = towRows
            .Where(t => !string.IsNullOrWhiteSpace(t.TowContratto))
            .Select(t => t.TowContratto!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var dettaglio = towContratti.Select(contratto =>
        {
            var towsOrdinati = towRows
                .Where(t => string.Equals(t.TowContratto, contratto, StringComparison.OrdinalIgnoreCase))
                .OrderBy(t => t.Tow, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var mevContratto = mevItems
                .Where(m => string.Equals(m.TipoContratto, contratto, StringComparison.OrdinalIgnoreCase))
                .ToList();

            var statiMev = mevContratto
                .GroupBy(m => m.Stato ?? "(null)")
                .Select(g => new { stato = g.Key, count = g.Count(), sumImporto = g.Sum(m => m.ImportoFornituraScontato) });

            var towCalc = towsOrdinati.Select((towRow, i) =>
            {
                if (i >= towQtaSelectors.Length) return new { tow = towRow.Tow, pos = i + 1, errore = "posizione > 6", mevConQtaPos = 0, mevApprovatiConQtaPos = 0, towApprovatiCalcolato = 0m, valUnitario = towRow.ValoreUnitario };
                var sel = towQtaSelectors[i];
                int conQta    = mevContratto.Count(m => (sel(m) ?? 0) > 0);
                int appQta    = mevContratto.Count(m => m.Stato.Equals("Approvato", StringComparison.OrdinalIgnoreCase) && (sel(m) ?? 0) > 0);
                decimal towApp = mevContratto.Where(m => m.Stato.Equals("Approvato", StringComparison.OrdinalIgnoreCase) && (sel(m) ?? 0) > 0).Sum(m => sel(m) ?? 0);
                return new { tow = towRow.Tow, pos = i + 1, errore = (string?)null, mevConQtaPos = conQta, mevApprovatiConQtaPos = appQta, towApprovatiCalcolato = towApp, valUnitario = towRow.ValoreUnitario };
            }).ToList();

            return new
            {
                contratto,
                mevTotali       = mevContratto.Count,
                mevApprovati    = mevContratto.Count(m => m.Stato.Equals("Approvato", StringComparison.OrdinalIgnoreCase)),
                sumImportoScontato = mevContratto.Where(m => m.Stato.Equals("Approvato", StringComparison.OrdinalIgnoreCase)).Sum(m => m.ImportoFornituraScontato),
                sumOrdinato     = mevContratto.Where(m => m.OrdinatoBdo > 0).Sum(m => m.OrdinatoBdo),
                statiMev,
                towsOrdinati    = towsOrdinati.Select(t => t.Tow).ToList(),
                towCalc
            };
        }).ToList();

        return Ok(new
        {
            ambienteId,
            mevTotali   = mevItems.Count,
            towRowsTotali = towRows.Count,
            tipoContrattoDistinti = mevItems
                .GroupBy(m => m.TipoContratto ?? "(null)")
                .Select(g => new { tipoContratto = g.Key, count = g.Count() })
                .ToList(),
            dettaglio
        });
    }

    // ============================================================
    // POST /api/contratti/recalc-consumo-tow
    // Ricalcola Approvato/Ordinato/Impegnato/Residuo su ConsumoTow
    // direttamente dai dati MevItem presenti nel DB, senza Excel.
    // ============================================================
    [HttpPost("recalc-consumo-tow")]
    public IActionResult RecalcConsumoTowEndpoint()
    {
        try
        {
            var ambienteId = GetAmbienteId();

            // Carica le righe ConsumoTow dal DB (non dal ChangeTracker come in Align)
            var towRows = _db.ConsumoTow
                .Where(t => t.AmbienteId == ambienteId)
                .ToList();

            if (towRows.Count == 0)
                return BadRequest("Nessuna riga ConsumoTow trovata per questo ambiente. Inserisci prima i TOW dalla pagina admin.");

            // Ricalcola (usa la stessa logica di AlignInternal)
            RecalcConsumoTow(ambienteId);
            _db.SaveChanges();

            return Ok(new { message = "Ricalcolo completato", countTow = towRows.Count });
        }
        catch (Exception ex)
        {
            return Problem($"Errore ricalcolo ConsumoTow: {ex.Message}");
        }
    }

    /// <summary>Chiamato anche da MevController durante l'allineamento globale.</summary>
    public IActionResult AlignInternal(int ambienteId)
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

            ImportContratti(ws, contrattoHeaderRow, ambienteId);

            // ── Import tabella BUONI_CONSEGNA ─────────────────────────────────
            var buoniHeaderRow = range.RowsUsed()
                .FirstOrDefault(r =>
                    r.Cells().Any(c =>
                        c.GetString().Trim()
                            .Equals("ODA", StringComparison.OrdinalIgnoreCase)));

            if (buoniHeaderRow != null)
                ImportBuoniConsegna(ws, buoniHeaderRow, ambienteId);

            // ── Import tabella ConsumoTOW ─────────────────────────────────────
            var towHeaderRow = range.RowsUsed()
                .FirstOrDefault(r =>
                    r.Cells().Any(c => c.GetString().Trim().Equals("TOW",          StringComparison.OrdinalIgnoreCase)) &&
                    r.Cells().Any(c => c.GetString().Trim().Equals("Valore Totale",StringComparison.OrdinalIgnoreCase)) &&
                    r.Cells().Any(c => c.GetString().Trim().Equals("Impegnato",    StringComparison.OrdinalIgnoreCase)));

            if (towHeaderRow != null)
            {
                ImportConsumoTow(ws, towHeaderRow, ambienteId);
                Console.WriteLine($"[TOW] Header trovato a riga {towHeaderRow.RowNumber()}");
            }
            else
            {
                Console.WriteLine("[TOW] Header NON trovato nel foglio CONTRATTO");
            }

            // ── Ricalcola valori ConsumoTow da MevItem ────────────────────────
            RecalcConsumoTow(ambienteId);

            _db.SaveChanges();

            return Ok(new
            {
                message          = "Contratti allineati",
                count            = _db.Contratti.Count(c => c.AmbienteId == ambienteId),
                countBuoni       = _db.BuoniConsegna.Count(b => b.AmbienteId == ambienteId),
                countTow         = _db.ConsumoTow.Count(t => t.AmbienteId == ambienteId),
            });
        }
        catch (Exception ex)
        {
            var inner = ex.InnerException?.Message ?? "";
            return Problem($"Errore durante l'allineamento contratti: {ex.Message} | Inner: {inner}");
        }
    }

    // ── Metodo privato: import tabella CONTRATTO ──────────────────────────────
    private void ImportContratti(IXLWorksheet ws, IXLRangeRow headerRow, int ambienteId)
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
            .Where(c => c.AmbienteId == ambienteId)
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
                    AmbienteId    = ambienteId,
                });
            }
        }

        var toRemove = existing.Values.Where(c => !seenRifs.Contains(c.RifContratto)).ToList();
        _db.Contratti.RemoveRange(toRemove);
    }

    // ── Metodo privato: import tabella BUONI_CONSEGNA ─────────────────────────
    private void ImportBuoniConsegna(IXLWorksheet ws, IXLRangeRow headerRow, int ambienteId)
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
            .Where(b => b.AmbienteId == ambienteId)
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
                    AmbienteId   = ambienteId,
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
    [Authorize(Policy = "AdminOrSuper")]
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
            var ambienteId = GetAmbienteId();
            var rows = _db.ConsumoTow.AsNoTracking()
                .Where(t => t.AmbienteId == ambienteId)
                .OrderBy(t => t.Tow).ToList();
            return Ok(rows);
        }
        catch (Exception ex)
        {
            return Problem($"Errore recupero ConsumoTOW: {ex.Message}");
        }
    }

    // ============================================================
    // GET /api/contratti/consumo-tow/prezzi
    // Restituisce la mappa prezzi (TowContratto → Tow → ValoreUnitario + Sconto + IsCatalogo)
    // da qualsiasi ambiente che abbia dati ConsumoTow.
    // Usato come fallback per ambienti nuovi/vuoti che non hanno ancora ConsumoTow caricato.
    // ============================================================
    [HttpGet("consumo-tow/prezzi")]
    public IActionResult GetConsumoTowPrezzi()
    {
        try
        {
            var ambienteId = GetAmbienteId();

            // Prima prova l'ambiente corrente
            var rows = _db.ConsumoTow.AsNoTracking()
                .Where(t => t.AmbienteId == ambienteId && t.TowContratto != null)
                .ToList();

            // Se l'ambiente corrente è vuoto, usa il primo ambiente che ha dati
            if (rows.Count == 0)
            {
                rows = _db.ConsumoTow.AsNoTracking()
                    .Where(t => t.TowContratto != null)
                    .ToList();
            }

            // Costruisce priceMap: { "NomeContratto": { "TOW02.1": { valoreUnitario, sconto, isCatalogo } } }
            var priceMap = rows
                .GroupBy(t => t.TowContratto!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => g.GroupBy(t => t.Tow, StringComparer.OrdinalIgnoreCase)
                          .ToDictionary(
                              tg => tg.Key,
                              tg => new {
                                  valoreUnitario = tg.First().ValoreUnitario,
                                  sconto         = tg.First().Sconto,
                                  isCatalogo     = tg.First().IsCatalogo,
                              })
                );

            return Ok(priceMap);
        }
        catch (Exception ex)
        {
            return Problem($"Errore recupero prezzi ConsumoTOW: {ex.Message}");
        }
    }

    // ============================================================
    // DELETE /api/contratti/consumo-tow/contratto/{nome}
    // Elimina tutte le righe di un contratto (solo Admin)
    // ============================================================
    [HttpDelete("consumo-tow/contratto/{nome}")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult DeleteConsumoTowContratto(string nome)
    {
        var ambienteId = GetAmbienteId();
        var rows = _db.ConsumoTow.Where(r => r.TowContratto == nome && r.AmbienteId == ambienteId).ToList();
        if (rows.Count == 0)
            return NotFound($"Contratto '{nome}' non trovato.");
        _db.ConsumoTow.RemoveRange(rows);
        _db.SaveChanges();
        return Ok(new { deleted = rows.Count, towContratto = nome });
    }

    // ============================================================
    // POST /api/contratti/consumo-tow/figlio
    // Crea un contratto figlio partendo dai TOW del contratto BASE,
    // applicando uno sconto globale e le quantità/importi indicati.
    // ============================================================
    [HttpPost("consumo-tow/figlio")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult CreateConsumoTowFiglio([FromBody] CreateConsumoTowFiglioRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TowContratto))
            return BadRequest("Il nome del contratto è obbligatorio.");
        if (request.Sconto < 0 || request.Sconto > 100)
            return BadRequest("La percentuale di sconto deve essere compresa tra 0 e 100.");

        var ambienteId = GetAmbienteId();

        bool exists = _db.ConsumoTow.Any(r => r.TowContratto == request.TowContratto && r.AmbienteId == ambienteId);
        if (exists)
            return Conflict($"Il contratto '{request.TowContratto}' esiste già.");

        // Legge i TOW del contratto BASE (IsBase = true)
        var baseNome = _db.ConsumoTow
            .Where(r => r.AmbienteId == ambienteId && r.TowContratto != null)
            .Select(r => r.TowContratto!)
            .Distinct()
            .ToList()
            .FirstOrDefault(n => n.StartsWith("BASE", StringComparison.OrdinalIgnoreCase));

        if (baseNome == null)
            return BadRequest("Nessun contratto BASE trovato. Importa prima il contratto BASE.");

        var baseRows = _db.ConsumoTow
            .Where(r => r.TowContratto == baseNome && r.AmbienteId == ambienteId)
            .ToList();

        var newRows = baseRows.Select(b =>
        {
            var scontatoUnitario = b.ValoreUnitario * (1 - request.Sconto / 100m);
            var isCatalogo = request.IsCatalogo.TryGetValue(b.Tow, out var cat) && cat;
            decimal qta, vt;

            if (isCatalogo)
            {
                // Importo fisso a catalogo
                vt  = request.Qta.TryGetValue(b.Tow, out var q) ? q : 0m;
                qta = scontatoUnitario > 0 ? vt / scontatoUnitario : 0m;
            }
            else
            {
                qta = request.Qta.TryGetValue(b.Tow, out var q) ? q : 0m;
                vt  = scontatoUnitario * qta;
            }

            return new ConsumoTow
            {
                Tow            = b.Tow,
                TowContratto   = request.TowContratto,
                ValoreUnitario = scontatoUnitario,
                ValoreTotale   = vt,
                TowApprovati   = qta,
                Sconto         = request.Sconto,
                IsCatalogo     = isCatalogo,
                AmbienteId     = ambienteId,
            };
        }).ToList();

        _db.ConsumoTow.AddRange(newRows);
        _db.SaveChanges();
        return Ok(newRows);
    }

    // ============================================================
    // POST /api/contratti/consumo-tow
    // Crea un nuovo contratto con i TOW TOW02.1 … TOW02.6 (solo Admin)
    // ============================================================
    [HttpPost("consumo-tow")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult CreateConsumoTow([FromBody] CreateConsumoTowRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TowContratto))
            return BadRequest("Il nome del contratto è obbligatorio.");

        var ambienteId = GetAmbienteId();
        bool exists = _db.ConsumoTow.Any(r => r.TowContratto == request.TowContratto && r.AmbienteId == ambienteId);
        if (exists)
            return Conflict($"Il contratto '{request.TowContratto}' esiste già.");

        // Usa i nomi TOW inviati dal frontend (chiavi di ValoriUnitari),
        // con fallback ai nomi default se il dizionario è vuoto.
        var tows = request.ValoriUnitari.Keys.Count > 0
            ? request.ValoriUnitari.Keys.ToArray()
            : new[] { "TOW02.1", "TOW02.2", "TOW02.3", "TOW02.4", "TOW02.5", "TOW02.6" };
        var newRows = tows.Select(t =>
        {
            var vu         = request.ValoriUnitari.TryGetValue(t, out var v)  ? v  : 0m;
            var qta        = request.Qta.TryGetValue(t, out var q)            ? q  : 0m;
            var isCatalogo = request.IsCatalogo.TryGetValue(t, out var cat) && cat;
            return new ConsumoTow
            {
                Tow            = t,
                TowContratto   = request.TowContratto,
                ValoreUnitario = vu,
                ValoreTotale   = vu * qta,
                IsCatalogo     = isCatalogo,
                AmbienteId     = ambienteId,
            };
        }).ToList();

        _db.ConsumoTow.AddRange(newRows);
        _db.SaveChanges();
        return Ok(newRows);
    }

    // ============================================================
    // PUT /api/contratti/consumo-tow/:id
    // Aggiorna una riga ConsumoTow (solo Admin)
    // ============================================================
    [HttpPut("consumo-tow/{id}")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult UpdateConsumoTow(int id, [FromBody] ConsumoTowUpdateDto dto)
    {
        var ambienteId = GetAmbienteId();
        var row = _db.ConsumoTow.FirstOrDefault(r => r.Id == id && r.AmbienteId == ambienteId);
        if (row == null) return NotFound($"Riga ConsumoTow con Id={id} non trovata");

        row.Tow                = dto.Tow;
        row.TowContratto       = dto.TowContratto;
        row.ValoreUnitario     = dto.ValoreUnitario;
        row.ValoreTotale       = dto.ValoreTotale;
        row.Approvato          = dto.Approvato;
        row.OrdinatiRda        = dto.OrdinatiRda;
        row.Impegnato          = dto.Impegnato;
        row.Residuo            = dto.Residuo;
        row.TowApprovati       = dto.TowApprovati;
        row.TowImpegnati       = dto.TowImpegnati;
        row.TowResidui         = dto.TowResidui;
        row.CollaudoApprovato  = dto.CollaudoApprovato;
        row.CollaudoOrdinato   = dto.CollaudoOrdinato;
        row.CollaudoFatturato  = dto.CollaudoFatturato;
        row.Sconto             = dto.Sconto;
        row.IsCatalogo         = dto.IsCatalogo;

        _db.SaveChanges();
        return Ok(row);
    }

    // ── Metodo privato: import tabella ConsumoTOW ─────────────────────────────
    private void ImportConsumoTow(IXLWorksheet ws, IXLRangeRow headerRow, int ambienteId)
    {
        var columnMap = BuildColumnMap(headerRow);
        Console.WriteLine($"[TOW] ColumnMap keys: {string.Join(", ", columnMap.Keys)}");

        // Risolvi i numeri di colonna una volta sola usando FindCol (match normalizzato)
        int colTow               = FindCol(columnMap, "TOW");
        int colContratto         = FindCol(columnMap, "TOW Contratto", "Contratto", "Tipo Contratto", "TowContratto");
        int colValoreUnitario    = FindCol(columnMap, "Valore Unitario", "ValoreUnitario");
        int colValoreTotale      = FindCol(columnMap, "Valore Totale", "ValoreTotale");
        int colApprovato         = FindCol(columnMap, "Approvato");
        int colOrdinatiRda       = FindCol(columnMap, "Ordinati(RDA)", "Ordinati (RDA)", "Ordinati RDA", "OrdinatiRDA", "OrdinatiRda");
        int colImpegnato         = FindCol(columnMap, "Impegnato");
        int colResiduo           = FindCol(columnMap, "Residuo");
        int colTowApprovati      = FindCol(columnMap, "TOW Approvati");
        int colTowImpegnati      = FindCol(columnMap, "TOW Impegnati");
        int colTowResidui        = FindCol(columnMap, "TOW Residui");
        int colCollaudoApprovato = FindCol(columnMap, "CollaudoApprovato", "Collaudo Approvato");
        int colCollaudoOrdinato  = FindCol(columnMap, "CollaudoOrdinato", "Collaudo Ordinato");
        int colCollaudoFatturato = FindCol(columnMap, "CollaudoFatturato", "Collaudo Fatturato");

        

        Console.WriteLine($"[TOW] Colonne: TOW={colTow}, Contratto={colContratto}, OrdinatiRDA={colOrdinatiRda}, Impegnato={colImpegnato}, TOW_Approvati={colTowApprovati}, TOW_Impegnati={colTowImpegnati}, TOW_Residui={colTowResidui}");

        if (colTow == 0) { Console.WriteLine("[TOW] Colonna TOW non trovata, import saltato"); return; }

        string GetStr(IXLRow row, int col) => col > 0 ? row.Cell(col).GetString().Trim() : "";
        decimal GetDec(IXLRow row, int col)
        {
            if (col == 0) return 0;
            row.Cell(col).TryGetValue(out decimal v); return v;
        }

        int headerRowNum = headerRow.RowNumber();
        int lastRowNum   = ws.LastRowUsed()?.RowNumber() ?? headerRowNum;

        // Svuota e ricarica sempre (solo per questo ambiente)
        _db.ConsumoTow.RemoveRange(_db.ConsumoTow.Where(t => t.AmbienteId == ambienteId).ToList());

        int count = 0;
        for (int rn = headerRowNum + 1; rn <= lastRowNum; rn++)
        {
            var row = ws.Row(rn);
            var tow = row.Cell(colTow).GetString().Trim();
            if (string.IsNullOrWhiteSpace(tow)) continue;

            _db.ConsumoTow.Add(new ConsumoTow
            {
                Tow            = tow,
                TowContratto      = GetStr(row, colContratto),
                ValoreUnitario    = GetDec(row, colValoreUnitario),
                ValoreTotale      = GetDec(row, colValoreTotale),
                Approvato         = GetDec(row, colApprovato),
                OrdinatiRda       = GetDec(row, colOrdinatiRda),
                Impegnato         = GetDec(row, colImpegnato),
                Residuo           = GetDec(row, colResiduo),
                TowApprovati      = GetDec(row, colTowApprovati),
                TowImpegnati      = GetDec(row, colTowImpegnati),
                TowResidui        = GetDec(row, colTowResidui),
                CollaudoApprovato = GetDec(row, colCollaudoApprovato),
                CollaudoOrdinato  = GetDec(row, colCollaudoOrdinato),
                CollaudoFatturato = GetDec(row, colCollaudoFatturato),
                AmbienteId        = ambienteId,
            });
            count++;
        }
        Console.WriteLine($"[TOW] Righe importate: {count}");
    }

    // ── Ricalcola Approvato / OrdinatiRda / Impegnato / Residuo su ConsumoTow ──
    // Chiamato dopo ImportConsumoTow, prima di SaveChanges.
    // Usa MevItem (approvato) e MevItem.OrdinatoBdo (ordinato) già in memoria/DB.
    //
    // Logica:
    //   Approvato (TOW pos P) = SUM(MevItem.ImportoFornituraScontato)
    //                           WHERE Stato = "Approvato"
    //                           AND   TipoContratto = towContratto
    //                           AND   il campo TowXXX corrispondente alla posizione P > 0
    //
    //   OrdinatiRda (TOW pos P) = SUM(MevItem.OrdinatoBdo)
    //                             WHERE TipoContratto = towContratto
    //                             AND   TowXXX (pos P) > 0
    //
    //   Impegnato = Approvato - OrdinatiRda
    //   Residuo   = ValoreTotale - Approvato
    //
    // La posizione P è determinata dall'ordinamento alfabetico dei Tow distinti
    // per quel TowContratto (stessa convenzione del frontend: sort() → pos 1..N).
    private void RecalcConsumoTow(int ambienteId)
    {
        // Leggi le righe ConsumoTow: prima dal ChangeTracker (Align appena eseguito),
        // poi — se vuoto — dal DB (chiamata standalone dall'endpoint recalc).
        var towRows = _db.ConsumoTow.Local
            .Where(t => t.AmbienteId == ambienteId)
            .ToList();

        if (towRows.Count == 0)
        {
            towRows = _db.ConsumoTow
                .Where(t => t.AmbienteId == ambienteId)
                .ToList();
        }

        if (towRows.Count == 0) return;

        // Leggi tutti i MevItem dell'ambiente
        var mevItems = _db.MevItems
            .AsNoTracking()
            .Where(m => m.AmbienteId == ambienteId)
            .ToList();

        // ── DIAGNOSTICA ──────────────────────────────────────────────────────
        Console.WriteLine($"[TOW RECALC] Ambiente={ambienteId} | MevItems totali={mevItems.Count}");
        var statoCounts = mevItems.GroupBy(m => m.Stato ?? "(null)").Select(g => $"{g.Key}={g.Count()}");
        Console.WriteLine($"[TOW RECALC] Stati: {string.Join(", ", statoCounts)}");
        var contrattiCounts = mevItems.GroupBy(m => m.TipoContratto ?? "(null)").Select(g => $"{g.Key}={g.Count()}");
        Console.WriteLine($"[TOW RECALC] TipoContratto: {string.Join(", ", contrattiCounts)}");
        var approvati = mevItems.Where(m => m.Stato.Equals("Approvato", StringComparison.OrdinalIgnoreCase)).ToList();
        Console.WriteLine($"[TOW RECALC] Approvati={approvati.Count} | SumImportoScontato={approvati.Sum(m => m.ImportoFornituraScontato):F2} | SumOrdinato={mevItems.Where(m => m.OrdinatoBdo > 0).Sum(m => m.OrdinatoBdo):F2}");
        Console.WriteLine($"[TOW RECALC] TOW non-null: Tow021={mevItems.Count(m => m.Tow021 > 0)}, Tow022={mevItems.Count(m => m.Tow022 > 0)}, Tow023={mevItems.Count(m => m.Tow023 > 0)}, Tow024={mevItems.Count(m => m.Tow024 > 0)}, Tow025={mevItems.Count(m => (m.Tow025 ?? 0) > 0)}, Tow026={mevItems.Count(m => (m.Tow026 ?? 0) > 0)}");
        Console.WriteLine($"[TOW RECALC] ConsumoTow rows={towRows.Count} | TowContratti: {string.Join(", ", towRows.Where(t => !string.IsNullOrWhiteSpace(t.TowContratto)).Select(t => t.TowContratto).Distinct())}");
        // ── FINE DIAGNOSTICA ─────────────────────────────────────────────────

        // Selettori campo quantità su MevItem per POSIZIONE ORDINALE (0-based)
        // Il 1° TOW ordinato alfabeticamente del contratto → Tow021, il 2° → Tow022, ecc.
        var towQtaByPosition = new List<Func<MevItem, decimal?>>
        {
            m => m.Tow021,
            m => m.Tow022,
            m => m.Tow023,
            m => m.Tow024,
            m => m.Tow025,
            m => m.Tow026,
        };

        var towContratti = towRows
            .Where(t => !string.IsNullOrWhiteSpace(t.TowContratto))
            .Select(t => t.TowContratto!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var contratto in towContratti)
        {
            var towsContratto = towRows
                .Where(t => string.Equals(t.TowContratto, contratto, StringComparison.OrdinalIgnoreCase))
                .OrderBy(t => t.Tow, StringComparer.OrdinalIgnoreCase)
                .ToList();

            // MEV filtrati per questo tipo contratto
            var mevContratto = mevItems
                .Where(m => string.Equals(m.TipoContratto, contratto, StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var (towRow, posIdx) in towsContratto.Select((t, i) => (t, i)))
            {
                // Seleziona il selettore corretto per POSIZIONE ORDINALE
                if (posIdx >= towQtaByPosition.Count)
                {
                    Console.WriteLine($"[TOW RECALC] TOW '{towRow.Tow}' posizione {posIdx} fuori range (max {towQtaByPosition.Count - 1}), skip");
                    continue;
                }
                var qtaSelector = towQtaByPosition[posIdx];
                decimal valUnitario = towRow.ValoreUnitario;

                // Approvato = SUM(quantità_TOW × ValoreUnitario) per righe MEV con Stato="Approvato"
                // Se ValoreUnitario = 0 (es. TOW catalogo), usa ImportoFornituraScontato × (qtaTow/TowTotale)
                decimal approvato;

                if (valUnitario > 0)
                {
                    // TOW a tariffa: somma qty × ValoreUnitario per righe MEV Approvate
                    approvato = mevContratto
                        .Where(m => m.Stato.Equals("Approvato", StringComparison.OrdinalIgnoreCase)
                                 && (qtaSelector(m) ?? 0) > 0)
                        .Sum(m => (qtaSelector(m) ?? 0) * valUnitario);
                }
                else
                {
                    // TOW a importo diretto (ValoreUnitario = 0, es. TOW02.5):
                    // il campo memorizza già l'importo in €, somma direttamente.
                    approvato = mevContratto
                        .Where(m => m.Stato.Equals("Approvato", StringComparison.OrdinalIgnoreCase)
                                 && (qtaSelector(m) ?? 0) > 0)
                        .Sum(m => qtaSelector(m) ?? 0);
                }

                // OrdinatiRda: per TOW a tariffa usa proporzione (OrdinatoBdo × qtaTow/TowTotale).
                // Per TOW a importo diretto (ValoreUnitario=0) usa OrdinatoBdo direttamente
                // (il campo è già l'importo totale ordinato per la riga, non da ripartire).
                decimal ordinati;
                if (valUnitario > 0)
                {
                    ordinati = mevContratto
                        .Where(m => (qtaSelector(m) ?? 0) > 0
                                 && (m.TowTotale ?? 0) > 0
                                 && m.OrdinatoBdo > 0)
                        .Sum(m => m.OrdinatoBdo * ((qtaSelector(m) ?? 0) / (m.TowTotale ?? 1)));
                }
                else
                {
                    // TOW diretto: OrdinatoBdo è già l'importo ordinato per questo TOW
                    ordinati = mevContratto
                        .Where(m => (qtaSelector(m) ?? 0) > 0 && m.OrdinatoBdo > 0)
                        .Sum(m => m.OrdinatoBdo);
                }

                // TowApprovati = SUM delle quantità TOW delle righe MEV con Stato="Approvato"
                decimal towApprovati = mevContratto
                    .Where(m => m.Stato.Equals("Approvato", StringComparison.OrdinalIgnoreCase)
                             && (qtaSelector(m) ?? 0) > 0)
                    .Sum(m => qtaSelector(m) ?? 0);

                // Quantità totale del TOW = ValoreTotale / ValoreUnitario (se ValoreUnitario > 0)
                decimal qtaTotale = valUnitario > 0
                    ? towRow.ValoreTotale / valUnitario
                    : 0;

                // TowResidui = quantità totale - quantità approvata
                decimal towResidui = qtaTotale - towApprovati;

                decimal impegnato = approvato - ordinati;
                decimal residuo   = towRow.ValoreTotale - approvato;

                // Aggiorna solo se il calcolo produce valori non nulli
                bool calcolatoHaDati = approvato != 0 || ordinati != 0 || towApprovati != 0;
                if (calcolatoHaDati)
                {
                    towRow.Approvato     = approvato;
                    towRow.OrdinatiRda   = ordinati;
                    towRow.Impegnato     = impegnato;
                    towRow.Residuo       = residuo;
                    towRow.TowApprovati  = towApprovati;
                    towRow.TowResidui    = towResidui;
                    Console.WriteLine($"[TOW RECALC] {contratto}/{towRow.Tow} (VU={valUnitario}) → App={approvato:F2} Ord={ordinati:F2} Imp={impegnato:F2} Res={residuo:F2} | TowApp={towApprovati:F3} QtaTot={qtaTotale:F3} TowRes={towResidui:F3}");
                }
                else
                {
                    Console.WriteLine($"[TOW RECALC] {contratto}/{towRow.Tow} → nessun dato MEV, mantengo valori Excel");
                }
            }
        }
    }

    // ── Helper: costruisce mappa colonne da riga intestazione ─────────────────
    // La mappa contiene SIA il nome originale SIA la versione normalizzata (solo lettere/cifre, lowercase)
    private static Dictionary<string, int> BuildColumnMap(IXLRangeRow headerRow) =>
        headerRow.Cells()
            .Where(c => !string.IsNullOrWhiteSpace(c.GetString()))
            .GroupBy(c => c.GetString().Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Address.ColumnNumber,
                          StringComparer.OrdinalIgnoreCase);

    // Normalizza: minuscolo, rimuove spazi e caratteri non alfanumerici
    private static string NormalizeKey(string s) =>
        new string(s.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());

    // Cerca colonna con matching normalizzato
    private static int FindCol(Dictionary<string, int> map, params string[] candidates)
    {
        // Prima prova match esatto (già case-insensitive nel dizionario)
        foreach (var c in candidates)
            if (map.TryGetValue(c, out var col)) return col;
        // Poi prova match normalizzato
        var normMap = map.ToDictionary(kv => NormalizeKey(kv.Key), kv => kv.Value);
        foreach (var c in candidates)
        {
            var norm = NormalizeKey(c);
            if (normMap.TryGetValue(norm, out var col)) return col;
        }
        return 0;
    }

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

public class ConsumoTowUpdateDto
{
    public string Tow { get; set; } = "";
    public string? TowContratto { get; set; }
    public decimal ValoreUnitario { get; set; }
    public decimal ValoreTotale { get; set; }
    public decimal Approvato { get; set; }
    public decimal OrdinatiRda { get; set; }
    public decimal Impegnato { get; set; }
    public decimal Residuo { get; set; }
    public decimal TowApprovati { get; set; }
    public decimal TowImpegnati { get; set; }
    public decimal TowResidui { get; set; }
    public decimal CollaudoApprovato { get; set; }
    public decimal CollaudoOrdinato { get; set; }
    public decimal CollaudoFatturato { get; set; }
    public decimal Sconto { get; set; }
    public bool IsCatalogo { get; set; }
}

public class CreateConsumoTowRequest
{
    public string TowContratto { get; set; } = "";
    // Chiave = nome TOW (es. "TOW02.1"), Valore = valore unitario €
    public Dictionary<string, decimal> ValoriUnitari { get; set; } = new();
    // Chiave = nome TOW, Valore = quantità TOW
    public Dictionary<string, decimal> Qta { get; set; } = new();
    // Chiave = nome TOW, Valore = flag Catalogo
    public Dictionary<string, bool> IsCatalogo { get; set; } = new();
}

public class CreateConsumoTowFiglioRequest
{
    public string TowContratto { get; set; } = "";
    /// <summary>% sconto globale da applicare al valore BASE</summary>
    public decimal Sconto { get; set; }
    /// <summary>
    /// Chiave = nome TOW.
    /// Per righe non-catalogo: valore = N° TOW (quantità).
    /// Per righe catalogo: valore = importo € totale a catalogo.
    /// </summary>
    public Dictionary<string, decimal> Qta { get; set; } = new();
    /// <summary>Chiave = nome TOW, Valore = true se la voce è a catalogo</summary>
    public Dictionary<string, bool> IsCatalogo { get; set; } = new();
}
