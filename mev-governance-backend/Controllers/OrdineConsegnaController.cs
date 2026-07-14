using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using System.Security.Claims;
using System.Text.Json;

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
    // METODI PRIVATI
    // ============================================================

    private async Task<JsonElement> CallPdfParser(IFormFile file, string endpoint)
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(60);

        using var content = new MultipartFormDataContent();
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        ms.Position = 0;
        var fileContent = new ByteArrayContent(ms.ToArray());
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
        content.Add(fileContent, "file", file.FileName);

        var response = await client.PostAsync($"{_pdfParserUrl}{endpoint}", content);
        var body = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
            throw new Exception($"Parser Python ({endpoint}): {body}");

        return JsonDocument.Parse(body).RootElement;
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
