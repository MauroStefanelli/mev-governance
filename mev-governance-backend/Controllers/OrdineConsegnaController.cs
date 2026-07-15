using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/tools")]
[Authorize(Roles = "Admin")]
public class OrdineConsegnaController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _pdfParserUrl;

    public OrdineConsegnaController(AppDbContext db, IHttpClientFactory httpClientFactory, IConfiguration config)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _pdfParserUrl = config["PDF_PARSER_URL"] ?? "http://localhost:8765";
    }

    // ============================================================
    // GET /api/tools/ordini
    // ============================================================
    [HttpGet("ordini")]
    public IActionResult GetOrdini()
    {
        var items = _db.OrdiniConsegna
            .AsNoTracking()
            .OrderByDescending(x => x.ImportatoIl)
            .ToList();

        return Ok(items);
    }

    // ============================================================
    // POST /api/tools/upload-pdf  — upload → parser Python → salva su DB
    // ============================================================
    [HttpPost("upload-pdf")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadPdf(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            return BadRequest("Il file deve essere un PDF");

        var username = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";

        try
        {
            // Chiama il microservizio Python per il parsing
            var parseResult = await CallPdfParser(file, "/parse");

            var header = parseResult.GetProperty("header");
            var rows   = parseResult.GetProperty("rows");
            int count  = parseResult.GetProperty("count").GetInt32();

            if (count == 0)
                return BadRequest("Nessun articolo trovato nel PDF. Verificare il formato del documento.");

            string GetH(string key) =>
                header.TryGetProperty(key, out var v) ? v.GetString() ?? "" : "";

            var items = new List<OrdineConsegnaItem>();
            foreach (var r in rows.EnumerateArray())
            {
                string Get(string key) =>
                    r.TryGetProperty(key, out var v) ? v.GetString() ?? "" : "";

                items.Add(new OrdineConsegnaItem
                {
                    NumeroOrdine = GetH("numeroOrdine"),
                    Data         = GetH("data"),
                    DataConsegna = GetH("dataConsegna"),
                    RifContratto = GetH("rifContratto"),
                    Art          = Get("art"),
                    Codice       = Get("codice"),
                    Descrizione  = Get("descrizione"),
                    TipoAtt      = Get("tipoAtt"),
                    Quantita     = Get("quantita"),
                    Um           = Get("um"),
                    PrezzoNetto  = Get("prezzoNetto"),
                    Importo      = Get("importo"),
                    NumeroRda    = Get("numeroRda"),
                    Iniziativa   = Get("iniziativa"),
                    Ap           = Get("ap"),
                    Contratto    = Get("contratto"),
                    NomePdf      = file.FileName,
                    ImportatoIl  = DateTime.UtcNow,
                    ImportatoDA  = username
                });
            }

            _db.OrdiniConsegna.AddRange(items);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                message         = "PDF importato con successo",
                nomePdf         = file.FileName,
                numeroOrdine    = GetH("numeroOrdine"),
                articoliSalvati = items.Count
            });
        }
        catch (Exception ex)
        {
            var inner = ex.InnerException?.Message ?? "";
            var inner2 = ex.InnerException?.InnerException?.Message ?? "";
            return Problem($"Errore durante l'elaborazione del PDF: {ex.Message} | Inner: {inner} | Inner2: {inner2}");
        }
    }

    // ============================================================
    // POST /api/tools/upload-vap  — carica verbale avanzamento PDF e aggiorna OrdiniConsegna
    // ============================================================
    [HttpPost("upload-vap")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadVap(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            return BadRequest("Il file deve essere un PDF");

        var username = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";

        try
        {
            var parseResult = await CallPdfParser(file, "/debug");
            var testo = parseResult.GetProperty("testo").GetString() ?? "";

            if (testo.Length < 10)
                return BadRequest("Impossibile estrarre testo dal PDF. Verificare che non sia scansionato.");

            var (meseAvanzamento, righe) = ParseVap(testo);

            if (righe.Count == 0)
                return BadRequest("Nessuna riga di avanzamento trovata nel PDF. Verificare il formato del verbale.");

            // ── Aggiorna le righe corrispondenti in OrdiniConsegna ──
            // Il campo Art nel DB è zero-padded a 4 cifre (es. "0010")
            // mentre pos dal VAP è stripped (es. "10") — confrontiamo numericamente
            int aggiornati = 0;
            foreach (var (oda, pos, qta, importo, subappalto) in righe)
            {
                List<OrdineConsegnaItem> records;
                if (string.IsNullOrEmpty(pos))
                {
                    records = _db.OrdiniConsegna
                        .Where(r => r.NumeroOrdine == oda)
                        .ToList();
                }
                else
                {
                    // Carica tutte le righe dell'ODA e filtra in memoria confrontando
                    // il valore numerico dell'Art (gestisce "0010" vs "10", "10" vs "10", ecc.)
                    int posInt = int.TryParse(pos, out var p) ? p : -1;
                    records = _db.OrdiniConsegna
                        .Where(r => r.NumeroOrdine == oda)
                        .ToList()
                        .Where(r => int.TryParse(r.Art, out var a) && a == posInt)
                        .ToList();
                }

                foreach (var rec in records)
                {
                    rec.MeseAvanzamento    = meseAvanzamento;
                    rec.QtaAvanzata        = qta;
                    rec.ImportoFatturabile = importo;
                    rec.Subappalto         = subappalto;
                    aggiornati++;
                }
            }

            await _db.SaveChangesAsync();

            // ── Salva il verbale nel registro ──
            _db.VerbaliAvanzamento.Add(new VerbaleAvanzamento
            {
                NomePdf         = file.FileName,
                MeseAvanzamento = meseAvanzamento,
                RigheElaborate  = righe.Count,
                RigheAggiornate = aggiornati,
                CaricatoIl      = DateTime.UtcNow,
                CaricatoDa      = username
            });
            await _db.SaveChangesAsync();

            return Ok(new
            {
                message          = $"Verbale elaborato: {aggiornati} righe aggiornate",
                meseAvanzamento,
                righeElaborate   = righe.Count,
                righeAggiornate  = aggiornati,
                nomePdf          = file.FileName
            });
        }
        catch (Exception ex)
        {
            return Problem($"Errore durante l'elaborazione del verbale: {ex.Message}");
        }
    }

    // ============================================================
    // POST /api/tools/debug-vap  — restituisce testo grezzo + righe parsate dal verbale
    // ============================================================
    [HttpPost("debug-vap")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> DebugVap(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        try
        {
            var parseResult = await CallPdfParser(file, "/debug");
            var testo = parseResult.GetProperty("testo").GetString() ?? "";
            var (mese, righe) = ParseVap(testo);

            return Ok(new
            {
                testo,
                lunghezza       = testo.Length,
                meseAvanzamento = mese,
                righe           = righe.Select(r => new { r.oda, r.pos, r.qta, r.importo, r.subappalto }).ToList()
            });
        }
        catch (Exception ex)
        {
            return Problem($"Errore: {ex.Message}");
        }
    }

    // ============================================================
    // GET /api/tools/verbali
    // ============================================================
    [HttpGet("verbali")]
    public IActionResult GetVerbali()
    {
        var list = _db.VerbaliAvanzamento
            .AsNoTracking()
            .OrderByDescending(x => x.CaricatoIl)
            .ToList();
        return Ok(list);
    }

    // ============================================================
    // DELETE /api/tools/verbali/{id}
    // ============================================================
    [HttpDelete("verbali/{id}")]
    public async Task<IActionResult> DeleteVerbale(int id)
    {
        var item = await _db.VerbaliAvanzamento.FindAsync(id);
        if (item == null) return NotFound();
        _db.VerbaliAvanzamento.Remove(item);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Verbale eliminato" });
    }

    // ============================================================
    // ParseVap — calibrato sul formato reale del verbale Poste Italiane
    //
    // Ogni riga dati è su una singola riga di testo nel formato:
    //   ODA(10)  POS  [...testo libero...]  PREZZO_UNIT €  QTA  IMPORTO_FATT €  SI/NO
    // Esempi reali:
    //   4100689952 10 (vuoto) Canone Presidio Q2 2026 (vuoto) 0,644 € 30000,00 19.329,00 € NO
    //   4100698371 20 143578 Servizio Universale F1 AP-00226 COLLAUDO, 0,32 € 25600,00 8.079,36 € NO
    //
    // Strategia: per ogni riga del testo
    //   - cerca ODA + POS all'inizio
    //   - cerca la coda fissa (PREZZO€ QTA IMPORTO€ SI/NO) in fondo alla stessa riga
    // ============================================================
    private static (string mese, List<(string oda, string pos, string qta, string importo, string subappalto)> righe)
        ParseVap(string testo)
    {
        // ── Mese di avanzamento ──
        var meseMatch = Regex.Match(testo,
            @"Periodo di riferimento[:\s]+([^\n\r]+)",
            RegexOptions.IgnoreCase);
        var mese = meseMatch.Success ? meseMatch.Groups[1].Value.Trim() : "";

        // ── Normalizza: collassa spazi/tab, rimuovi \r, mantieni \n ──
        var testoNorm = Regex.Replace(testo, @"[ \t]+", " ")
                             .Replace("\r\n", "\n")
                             .Replace("\r", "\n");

        var righe = new List<(string oda, string pos, string qta, string importo, string subappalto)>();

        // Pattern ODA + POS all'inizio riga
        var odaRe = new Regex(@"^(4\d{9})\s+(\d{1,4})\b", RegexOptions.Multiline);

        // Pattern coda fissa — NON usa $ per evitare problemi con \r residui
        // Cerca: PREZZO€  QTA  IMPORTO€  (SI|NO)  seguito da fine riga o spazi
        var codaRe = new Regex(
            @"(\d[\d,]*)\s*€\s+" +
            @"(\d[\d.,]*)\s+" +
            @"(\d{1,3}(?:\.\d{3})*,\d{2})\s*€\s*" +
            @"(SI|NO)\s*(?:\r?\n|$)",
            RegexOptions.IgnoreCase
        );

        foreach (var line in testoNorm.Split('\n'))
        {
            // Trim completo per rimuovere \r e spazi residui
            var l = line.Trim();
            if (l.Length < 15) continue;

            var odaM = odaRe.Match(l);
            if (!odaM.Success) continue;

            // Cerca la coda nella riga (aggiunge \n fittizio per far matchare il pattern)
            var codaM = codaRe.Match(l + "\n");
            if (!codaM.Success) continue;

            var oda  = odaM.Groups[1].Value;
            var pos  = odaM.Groups[2].Value.TrimStart('0');
            if (string.IsNullOrEmpty(pos)) pos = "0";
            var qta        = codaM.Groups[2].Value;
            var importo    = codaM.Groups[3].Value;
            var subappalto = codaM.Groups[4].Value.ToUpper();

            righe.Add((oda, pos == "0" ? "" : pos, qta, importo, subappalto));
        }

        return (mese, righe);
    }

    // ============================================================
    // POST /api/tools/debug-pdf  — restituisce testo grezzo dal parser Python
    // ============================================================
    [HttpPost("debug-pdf")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> DebugPdf(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        try
        {
            var result = await CallPdfParser(file, "/debug");
            return Ok(new
            {
                lunghezza = result.GetProperty("lunghezza").GetInt32(),
                testo     = result.GetProperty("testo").GetString()
            });
        }
        catch (Exception ex)
        {
            return Problem($"Errore: {ex.Message}");
        }
    }

    // ============================================================
    // DELETE /api/tools/ordini/{id}
    // ============================================================
    [HttpDelete("ordini/{id}")]
    public async Task<IActionResult> DeleteOrdine(int id)
    {
        var item = await _db.OrdiniConsegna.FindAsync(id);
        if (item == null) return NotFound();
        _db.OrdiniConsegna.Remove(item);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Riga eliminata" });
    }

    // ============================================================
    // DELETE /api/tools/ordini/by-pdf/{nomePdf}
    // ============================================================
    [HttpDelete("ordini/by-pdf/{nomePdf}")]
    public async Task<IActionResult> DeleteByPdf(string nomePdf)
    {
        var items = _db.OrdiniConsegna
            .Where(x => x.NomePdf == nomePdf)
            .ToList();

        if (items.Count == 0) return NotFound();
        _db.OrdiniConsegna.RemoveRange(items);
        await _db.SaveChangesAsync();
        return Ok(new { message = $"{items.Count} righe eliminate", count = items.Count });
    }

    // ============================================================
    // GET /api/tools/export
    // ============================================================
    [HttpGet("export")]
    public IActionResult ExportExcel()
    {
        var items = _db.OrdiniConsegna
            .AsNoTracking()
            .OrderByDescending(x => x.ImportatoIl)
            .ThenBy(x => x.NumeroOrdine)
            .ToList();

        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("Ordini Consegna");

        var headers = new[]
        {
            "Numero Ordine", "Data", "Data Consegna", "Rif. Contratto",
            "Art.", "Codice", "Descrizione", "Tipo Att.",
            "Q.tà", "UM", "Prezzo Netto", "Importo",
            "Numero RdA", "Iniziativa", "AP", "Contratto",
            "Nome PDF", "Importato Il", "Importato Da"
        };

        for (int i = 0; i < headers.Length; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#1a73e8");
            cell.Style.Font.FontColor = XLColor.White;
        }

        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value  = item.NumeroOrdine;
            ws.Cell(row, 2).Value  = item.Data;
            ws.Cell(row, 3).Value  = item.DataConsegna;
            ws.Cell(row, 4).Value  = item.RifContratto;
            ws.Cell(row, 5).Value  = item.Art;
            ws.Cell(row, 6).Value  = item.Codice;
            ws.Cell(row, 7).Value  = item.Descrizione;
            ws.Cell(row, 8).Value  = item.TipoAtt;

            // Q.tà come numero
            if (TryParseItalian(item.Quantita, out var qty))
            {
                ws.Cell(row, 9).Value = qty;
                ws.Cell(row, 9).Style.NumberFormat.Format = "#,##0.000";
            }
            else ws.Cell(row, 9).Value = item.Quantita;

            ws.Cell(row, 10).Value = item.Um;

            // Prezzo Netto in Euro
            if (TryParseItalian(item.PrezzoNetto, out var pn))
            {
                ws.Cell(row, 11).Value = pn;
                ws.Cell(row, 11).Style.NumberFormat.Format = "€ #,##0.00";
            }
            else ws.Cell(row, 11).Value = item.PrezzoNetto;

            // Importo in Euro
            if (TryParseItalian(item.Importo, out var imp))
            {
                ws.Cell(row, 12).Value = imp;
                ws.Cell(row, 12).Style.NumberFormat.Format = "€ #,##0.00";
            }
            else ws.Cell(row, 12).Value = item.Importo;

            ws.Cell(row, 13).Value = item.NumeroRda;
            ws.Cell(row, 14).Value = item.Iniziativa;
            ws.Cell(row, 15).Value = item.Ap;
            ws.Cell(row, 16).Value = item.Contratto;
            ws.Cell(row, 17).Value = item.NomePdf;
            ws.Cell(row, 18).Value = item.ImportatoIl.ToLocalTime().ToString("dd/MM/yyyy HH:mm");
            ws.Cell(row, 19).Value = item.ImportatoDA;
            row++;
        }

        ws.Columns().AdjustToContents();
        ws.RangeUsed()?.SetAutoFilter();
        ws.SheetView.FreezeRows(1);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;

        return File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"OrdiniConsegna_{DateTime.Now:yyyyMMdd}.xlsx"
        );
    }

    // ============================================================
    // POST /api/tools/export-governance
    // Riceve un file Excel esistente, aggiunge uno sheet "Ordini DD/MM/YYYY"
    // con tutti i dati degli ordini, restituisce il file modificato
    // ============================================================
    [HttpPost("export-governance")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> ExportGovernance(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        var items = _db.OrdiniConsegna
            .AsNoTracking()
            .OrderByDescending(x => x.ImportatoIl)
            .ThenBy(x => x.NumeroOrdine)
            .ToList();

        // Carica il workbook esistente
        XLWorkbook workbook;
        try
        {
            using var inputStream = file.OpenReadStream();
            using var ms = new MemoryStream();
            await inputStream.CopyToAsync(ms);
            ms.Position = 0;
            workbook = new XLWorkbook(ms);
        }
        catch (Exception ex)
        {
            return BadRequest($"Impossibile aprire il file Excel: {ex.Message}. Assicurarsi che sia un file .xlsx valido e non protetto da password.");
        }

        // Nome sheet: "Ordini" + data corrente
        var sheetName = $"Ordini {DateTime.Now:dd/MM/yyyy}";

        // Se esiste già uno sheet con lo stesso nome lo elimina e lo ricrea
        if (workbook.Worksheets.TryGetWorksheet(sheetName, out var existing))
            workbook.Worksheets.Delete(sheetName);

        var ws = workbook.Worksheets.Add(sheetName);

        var headers = new[]
        {
            "Numero Ordine", "Data", "Data Consegna", "Rif. Contratto",
            "Art.", "Codice", "Descrizione", "Tipo Att.",
            "Q.tà", "UM", "Prezzo Netto", "Importo",
            "Numero RdA", "Iniziativa", "AP", "Contratto",
            "Nome PDF", "Importato Il", "Importato Da"
        };

        for (int i = 0; i < headers.Length; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#1a73e8");
            cell.Style.Font.FontColor = XLColor.White;
        }

        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value  = item.NumeroOrdine;
            ws.Cell(row, 2).Value  = item.Data;
            ws.Cell(row, 3).Value  = item.DataConsegna;
            ws.Cell(row, 4).Value  = item.RifContratto;
            ws.Cell(row, 5).Value  = item.Art;
            ws.Cell(row, 6).Value  = item.Codice;
            ws.Cell(row, 7).Value  = item.Descrizione;
            ws.Cell(row, 8).Value  = item.TipoAtt;

            if (TryParseItalian(item.Quantita, out var qty))
            { ws.Cell(row, 9).Value = qty; ws.Cell(row, 9).Style.NumberFormat.Format = "#,##0.000"; }
            else ws.Cell(row, 9).Value = item.Quantita;

            ws.Cell(row, 10).Value = item.Um;

            if (TryParseItalian(item.PrezzoNetto, out var pn))
            { ws.Cell(row, 11).Value = pn; ws.Cell(row, 11).Style.NumberFormat.Format = "€ #,##0.00"; }
            else ws.Cell(row, 11).Value = item.PrezzoNetto;

            if (TryParseItalian(item.Importo, out var imp))
            { ws.Cell(row, 12).Value = imp; ws.Cell(row, 12).Style.NumberFormat.Format = "€ #,##0.00"; }
            else ws.Cell(row, 12).Value = item.Importo;

            ws.Cell(row, 13).Value = item.NumeroRda;
            ws.Cell(row, 14).Value = item.Iniziativa;
            ws.Cell(row, 15).Value = item.Ap;
            ws.Cell(row, 16).Value = item.Contratto;
            ws.Cell(row, 17).Value = item.NomePdf;
            ws.Cell(row, 18).Value = item.ImportatoIl.ToLocalTime().ToString("dd/MM/yyyy HH:mm");
            ws.Cell(row, 19).Value = item.ImportatoDA;
            row++;
        }

        ws.Columns().AdjustToContents();
        ws.RangeUsed()?.SetAutoFilter();
        ws.SheetView.FreezeRows(1);

        // Sposta lo sheet in fondo
        ws.Position = workbook.Worksheets.Count;

        using var outputStream = new MemoryStream();
        workbook.SaveAs(outputStream);
        workbook.Dispose();
        outputStream.Position = 0;

        var outputFileName = Path.GetFileNameWithoutExtension(file.FileName)
            + $"_Ordini_{DateTime.Now:yyyyMMdd}"
            + Path.GetExtension(file.FileName);

        return File(
            outputStream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            outputFileName
        );
    }

    // ============================================================
    // METODI PRIVATI
    // ============================================================

    private async Task<JsonElement> CallPdfParser(IFormFile file, string endpoint)
    {
        // Legge il file in memoria una sola volta
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var fileBytes = ms.ToArray();

        // Timeout lungo per gestire cold start del parser su Render free (può impiegare 30-60s)
        // Retry 1 volta in caso di errore transitorio (es. cold start)
        Exception? lastEx = null;
        for (int attempt = 1; attempt <= 2; attempt++)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(90);

                using var content = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(fileBytes);
                fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
                content.Add(fileContent, "file", file.FileName);

                var response = await client.PostAsync($"{_pdfParserUrl}{endpoint}", content);
                var body = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                    throw new Exception($"Parser Python ({endpoint}): {body}");

                return JsonDocument.Parse(body).RootElement;
            }
            catch (Exception ex) when (attempt == 1)
            {
                // Primo tentativo fallito: aspetta 3s e riprova (cold start)
                lastEx = ex;
                await Task.Delay(3000);
            }
        }
        throw lastEx!;
    }

    private static bool TryParseItalian(string value, out decimal result)
    {
        // Formato italiano: 1.234,56 → rimuove punti migliaia, sostituisce virgola con punto
        var cleaned = value.Replace(".", "").Replace(",", ".");
        return decimal.TryParse(cleaned,
            System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture,
            out result);
    }
}
