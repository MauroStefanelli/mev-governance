using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/tools")]
[Authorize(Roles = "Admin")]
public class OrdineConsegnaController : ControllerBase
{
    private readonly AppDbContext _db;

    public OrdineConsegnaController(AppDbContext db)
    {
        _db = db;
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
    // POST /api/tools/upload-pdf  — upload + parse + salva su DB
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
            // Leggi il testo dal PDF
            string text = await ExtractTextFromPdf(file);

            // Estrai testata
            var header = ExtractHeader(text);

            // Estrai righe articoli
            var rows = ExtractRows(text);

            if (rows.Count == 0)
                return BadRequest("Nessun articolo trovato nel PDF. Verificare il formato del documento.");

            // Salva su DB
            var items = rows.Select(r => new OrdineConsegnaItem
            {
                NumeroOrdine = header.GetValueOrDefault("NumeroOrdine", ""),
                Data         = header.GetValueOrDefault("Data", ""),
                DataConsegna = header.GetValueOrDefault("DataConsegna", ""),
                RifContratto = header.GetValueOrDefault("RifContratto", ""),
                Art          = r.GetValueOrDefault("Art", ""),
                Codice       = r.GetValueOrDefault("Codice", ""),
                Descrizione  = r.GetValueOrDefault("Descrizione", ""),
                TipoAtt      = r.GetValueOrDefault("TipoAtt", ""),
                Quantita     = r.GetValueOrDefault("Quantita", ""),
                Um           = r.GetValueOrDefault("Um", ""),
                PrezzoNetto  = r.GetValueOrDefault("PrezzoNetto", ""),
                Importo      = r.GetValueOrDefault("Importo", ""),
                NumeroRda    = r.GetValueOrDefault("NumeroRda", ""),
                Iniziativa   = r.GetValueOrDefault("Iniziativa", ""),
                Ap           = r.GetValueOrDefault("Ap", ""),
                Contratto    = r.GetValueOrDefault("Contratto", ""),
                NomePdf      = file.FileName,
                ImportatoIl  = DateTime.UtcNow,
                ImportatoDA  = username
            }).ToList();

            _db.OrdiniConsegna.AddRange(items);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                message        = "PDF importato con successo",
                nomePdf        = file.FileName,
                numeroOrdine   = header.GetValueOrDefault("NumeroOrdine", ""),
                articoliSalvati = items.Count
            });
        }
        catch (Exception ex)
        {
            return Problem($"Errore durante l'elaborazione del PDF: {ex.Message}");
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
    // DELETE /api/tools/ordini/by-pdf/{nomePdf}  — cancella tutte le righe di un PDF
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
    // GET /api/tools/export  — export Excel di tutti gli ordini
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

        // HEADER
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

        // DATI
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
            ws.Cell(row, 9).Value  = item.Quantita;
            ws.Cell(row, 10).Value = item.Um;

            // Prezzo Netto come numero
            if (decimal.TryParse(item.PrezzoNetto.Replace(".", "").Replace(",", "."),
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var pn))
            {
                ws.Cell(row, 11).Value = pn;
                ws.Cell(row, 11).Style.NumberFormat.Format = "€ #,##0.00";
            }
            else
            {
                ws.Cell(row, 11).Value = item.PrezzoNetto;
            }

            // Importo come numero
            if (decimal.TryParse(item.Importo.Replace(".", "").Replace(",", "."),
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var imp))
            {
                ws.Cell(row, 12).Value = imp;
                ws.Cell(row, 12).Style.NumberFormat.Format = "€ #,##0.00";
            }
            else
            {
                ws.Cell(row, 12).Value = item.Importo;
            }

            ws.Cell(row, 13).Value = item.NumeroRda;
            ws.Cell(row, 14).Value = item.Iniziativa;
            ws.Cell(row, 15).Value = item.Ap;
            ws.Cell(row, 16).Value = item.Contratto;
            ws.Cell(row, 17).Value = item.NomePdf;
            ws.Cell(row, 18).Value = item.ImportatoIl.ToLocalTime().ToString("dd/MM/yyyy HH:mm");
            ws.Cell(row, 19).Value = item.ImportatoDA;
            row++;
        }

        // Autofit colonne
        ws.Columns().AdjustToContents();

        // Filtro + freeze intestazione
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
    // METODI PRIVATI: parsing PDF
    // ============================================================

    private static async Task<string> ExtractTextFromPdf(IFormFile file)
    {
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        ms.Position = 0;

        var sb = new StringBuilder();
        using var document = PdfDocument.Open(ms.ToArray());
        foreach (var page in document.GetPages())
        {
            sb.AppendLine(page.Text);
        }
        return sb.ToString();
    }

    private static Dictionary<string, string> ExtractHeader(string text)
    {
        var info = new Dictionary<string, string>();

        var patterns = new Dictionary<string, string>
        {
            ["NumeroOrdine"] = @"Numero d'ordine\s+(\d+)",
            ["Data"]         = @"Numero d'ordine\s+\d+\s+Data\s+(\d{2}\.\d{2}\.\d{4})",
            ["DataConsegna"] = @"Data di consegna\s+(\d{2}\.\d{2}\.\d{4})",
            ["RifContratto"] = @"Rif\.\s*Contratto\s+(\d+)"
        };

        foreach (var kvp in patterns)
        {
            var match = Regex.Match(text, kvp.Value, RegexOptions.IgnoreCase);
            info[kvp.Key] = match.Success ? match.Groups[1].Value : "";
        }

        return info;
    }

    private static List<Dictionary<string, string>> ExtractRows(string text)
    {
        var rows = new List<Dictionary<string, string>>();

        var pattern = new Regex(
            @"(\d{4})\s+"                        // Art.
            + @"([A-Z0-9\.]+)\s*-\s*"            // Codice
            + @"(.*?)\s+"                        // Descrizione
            + @"(AR|AP|AF|PR)\s+"                // Tipo Att.
            + @"([\d\.,]+)\s+"                   // Q.tà
            + @"([A-Z]{2})\s+"                   // UM
            + @"([\d\.,]+)\s+"                   // Prezzo Netto
            + @"([\d\.,]+).*?"                   // Importo
            + @"Numero\s+RdA:\s*(\d+)"           // RdA
            + @"(?:\s+(\d{6}))?"                 // Iniziativa opzionale
            + @"(?:\s+AP-(\d+))?"                // AP opzionale
            + @".*?contratto\s+n\.\s*(\d+)",     // Contratto
            RegexOptions.IgnoreCase | RegexOptions.Singleline
        );

        foreach (Match m in pattern.Matches(text))
        {
            rows.Add(new Dictionary<string, string>
            {
                ["Art"]          = m.Groups[1].Value,
                ["Codice"]       = m.Groups[2].Value,
                ["Descrizione"]  = Regex.Replace(m.Groups[3].Value, @"\s+", " ").Trim(),
                ["TipoAtt"]      = m.Groups[4].Value,
                ["Quantita"]     = m.Groups[5].Value,
                ["Um"]           = m.Groups[6].Value,
                ["PrezzoNetto"]  = m.Groups[7].Value,
                ["Importo"]      = m.Groups[8].Value,
                ["NumeroRda"]    = m.Groups[9].Value,
                ["Iniziativa"]   = m.Groups[10].Value,
                ["Ap"]           = m.Groups[11].Value,
                ["Contratto"]    = m.Groups[12].Value
            });
        }

        return rows;
    }
}
