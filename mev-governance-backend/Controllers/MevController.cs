using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using System.Security.Claims;
namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/mev")]
[Authorize]
public class MevController : BaseController
{
    private readonly AppDbContext _db;
    private readonly EmailService _email;
    private readonly ContrattoController _contrattoCtrl;

    public MevController(AppDbContext db, EmailService email)
    {
        _db = db;
        _email = email;
        _contrattoCtrl = new ContrattoController(db);
    }

    // ============================================================
    // GET /api/mev
    // ============================================================
    [HttpGet]
    
    public IActionResult GetMev()
    {
        var items = _db.MevItems
            .AsNoTracking()
            .OrderBy(m => m.ExcelOrder)
            .ToList();

        return Ok(items);
    }

    // ============================================================
    // PUT /api/mev/{id}
    // ============================================================
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateMev(int id, [FromBody] UpdateMevRequest request)
    {
        var item = _db.MevItems.FirstOrDefault(x => x.Id == id);
        if (item == null)
            return NotFound();

        item.PAnno    = request.PAnno;
        item.PRelease = request.PRelease;
        item.PImporto = request.PImporto;
        item.PNote    = request.PNote;

        _db.SaveChanges();

        // Invia email di notifica solo agli utenti con SendEmail = true
        var username = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
        var fullName = User.FindFirst("fullName")?.Value ?? username;
        var emailRecipients = _db.Users
            .Where(u => u.IsActive && u.SendEmail && !string.IsNullOrEmpty(u.Email))
            .Select(u => u.Email)
            .ToList();

        _ = _email.SendMevUpdateNotificationAsync(username, fullName, item, emailRecipients);

        return Ok(item);
    }

    private static string GetDataDir() =>
        Directory.Exists("/data") ? "/data" : Path.Combine(AppContext.BaseDirectory, "Data");

    // ============================================================
    // POST /api/mev/upload  — carica il file Excel (solo Admin)
    // ============================================================
    [HttpPost("upload")]
    [Consumes("multipart/form-data")]
    [Authorize(Roles = "Admin")]
    public IActionResult UploadExcel(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        try
        {
            var dataDir = GetDataDir();
            Directory.CreateDirectory(dataDir);
            var excelPath = Path.Combine(dataDir, "MEV_LAST.xlsx");

            using (var fs = new FileStream(excelPath, FileMode.Create))
                file.CopyTo(fs);

            return Ok(new { message = "File caricato", path = excelPath });
        }
        catch (Exception ex)
        {
            return Problem($"Errore durante il caricamento del file: {ex.Message}");
        }
    }

    // ============================================================
    // POST /api/mev/align
    // ============================================================
    [HttpPost("align")]
    public IActionResult Align()
    {
        try
        {
            var dataDir = GetDataDir();
            var uploadedPath = Path.Combine(dataDir, "MEV_LAST.xlsx");

            if (!System.IO.File.Exists(uploadedPath))
                return BadRequest("Nessun file Excel disponibile. Carica prima il file con 'Carica Excel'.");

            var mevResult = ImportFromExcelFile(uploadedPath);

            // Allinea anche i contratti dallo stesso file
            var contrattoResult = _contrattoCtrl.Align();

            // Salva timestamp ultimo align
            var settings = _db.AppSettings.FirstOrDefault(s => s.Id == 1);
            if (settings == null) { settings = new Models.AppSettings { Id = 1 }; _db.AppSettings.Add(settings); }
            settings.LastAlignAt = DateTime.UtcNow;
            _db.SaveChanges();

            // Restituisce il conteggio MEV + contratti
            if (mevResult is OkObjectResult mevOk && contrattoResult is OkObjectResult contrattoOk)
            {
                dynamic mevData       = mevOk.Value!;
                dynamic contrattoData = contrattoOk.Value!;
                return Ok(new
                {
                    message          = "Allineamento completato",
                    count            = mevData.count,
                    countContratti   = contrattoData.count,
                });
            }

            // Se l'allineamento contratti fallisce, restituisce comunque il risultato MEV
            return mevResult;
        }
        catch (Exception ex)
        {
            return Problem($"Errore durante l'allineamento: {ex.Message}");
        }
    }

    // ============================================================
    // GET /api/mev/last-align
    // ============================================================
    [HttpGet("last-align")]
    public IActionResult GetLastAlign()
    {
        var settings = _db.AppSettings.FirstOrDefault(s => s.Id == 1);
        return Ok(new { lastAlignAt = settings?.LastAlignAt });
    }

    // ============================================================
    // GET /api/mev/ping
    // ============================================================
    [HttpGet("ping")]
    public IActionResult Ping()
    {
        return Ok("MEV backend OK");
    }

    // ============================================================
    // METODO PRIVATO: import da Excel
    // ============================================================
    private IActionResult ImportFromExcelFile(string excelPath)
    {
        try
        {
        using var workbook = new XLWorkbook(excelPath);

        var ws = workbook.Worksheets
            .FirstOrDefault(w =>
                w.Name.Trim().Equals("MEV", StringComparison.OrdinalIgnoreCase));

        if (ws == null)
            return BadRequest("Foglio MEV non trovato");

        var range = ws.RangeUsed();
        if (range == null)
            return BadRequest("Foglio MEV vuoto");

        var headerRow = range.RowsUsed()
            .FirstOrDefault(r =>
                r.Cells().Any(c =>
                    c.GetString().Trim()
                        .Equals("Applicativo", StringComparison.OrdinalIgnoreCase)));

        if (headerRow == null)
            return BadRequest("Intestazioni MEV non trovate");

        // Costruisce la mappa colonne: in caso di intestazioni duplicate prende la prima occorrenza
        var columnMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var cell in headerRow.Cells().Where(c => !string.IsNullOrWhiteSpace(c.GetString())))
        {
            var key = cell.GetString().Trim();
            if (!columnMap.ContainsKey(key))
                columnMap[key] = cell.Address.ColumnNumber;
        }

        var dataRows = ws.RowsUsed()
            .Where(r => r.RowNumber() > headerRow.RowNumber());

        // Costruisco un dizionario delle righe esistenti per ExcelId
        var existingItems = _db.MevItems
            .ToDictionary(x => x.ExcelId, x => x);

        var excelIds = new List<string>();

        int excelOrder = 1;
        foreach (var row in dataRows)
        {
            if (row.CellsUsed().All(c => string.IsNullOrWhiteSpace(c.GetString())))
                continue;

            string GetString(string col) =>
                columnMap.ContainsKey(col)
                    ? row.Cell(columnMap[col]).GetString()
                    : "";

            decimal GetDecimal(string col)
            {
                if (!columnMap.ContainsKey(col))
                    return 0;
                row.Cell(columnMap[col]).TryGetValue(out decimal v);
                return v;
            }

            int GetInt(string col)
            {
                if (!columnMap.ContainsKey(col))
                    return 0;
                row.Cell(columnMap[col]).TryGetValue(out int v);
                return v;
            }

            string goTo = GetString("GoTo");
            string applicativo = GetString("Applicativo");
            string descrizione = GetString("Descrizione");
            string stato = GetString("Stato");
            decimal importo = GetDecimal("Importo Fornitura");
            string excelId = GetString("ID");
            string noteExcel = GetString("Note");
            string bc = GetString("BC");
            string contratto = GetString("Tipo Contratto");
            string atId = GetString("AT ID");
            decimal ordinatoBdo = GetDecimal("Ordinato (BdO)");
            decimal fatturato = GetDecimal("Fatturato");
            string releaseExcel = GetString("Release");
            string rda = GetString("RDA");
            string cap = GetString("Capgemini");
            string iet = GetString("IET");
            string subco = GetString("Subco");

            // SKIP riga "TOTALE"
            if (
                descrizione.Contains("totale", StringComparison.OrdinalIgnoreCase) ||
                applicativo.Contains("totale", StringComparison.OrdinalIgnoreCase) ||
                goTo.Contains("totale", StringComparison.OrdinalIgnoreCase)
            )
                continue;

            // SKIP righe completamente vuote (nessun dato significativo)
            if (string.IsNullOrWhiteSpace(goTo) && string.IsNullOrWhiteSpace(applicativo) &&
                string.IsNullOrWhiteSpace(descrizione) && importo == 0)
                continue;

            excelIds.Add(excelId);

            if (existingItems.TryGetValue(excelId, out var existing))
            {
                // Aggiorna solo i campi Excel, preserva i campi PMO
                existing.ExcelOrder = excelOrder++;
                existing.GoTo = goTo;
                existing.Applicativo = applicativo;
                existing.Descrizione = descrizione;
                existing.Stato = GetString("Stato");
                existing.AnnoCompetenza = GetInt("Anno Competenza");
                existing.ImportoExcel = importo;
                existing.NoteExcel = noteExcel;
                existing.Bc = bc;
                existing.Contratto = contratto;
                existing.AtId = atId;
                existing.OrdinatoBdo = ordinatoBdo;
                existing.Fatturato = fatturato;
                existing.ReleaseExcel = releaseExcel;
                existing.Rda = rda;
                existing.Capgemini = cap;
                existing.Iet = iet;
                existing.Subco = subco;
            }
            else
            {
                // Nuova riga: inserisce con valori PMO di default dall'Excel
                var item = new MevItem
                {
                    ExcelOrder = excelOrder++,
                    ExcelId = excelId,
                    GoTo = goTo,
                    Applicativo = applicativo,
                    Descrizione = descrizione,
                    Stato = GetString("Stato"),
                    AnnoCompetenza = GetInt("Anno Competenza"),
                    ImportoExcel = importo,
                    NoteExcel = noteExcel,
                    Bc = bc,
                    Contratto = contratto,
                    AtId = atId,
                    OrdinatoBdo = ordinatoBdo,
                    Fatturato = fatturato,
                    ReleaseExcel = releaseExcel,
                    Rda = rda,
                    Capgemini = cap,
                    Iet = iet,
                    Subco = subco,
                    PAnno = GetInt("Anno Competenza"),
                    PRelease = GetString("Release"),
                    PImporto = importo
                };
                _db.MevItems.Add(item);
            }
        }

        // Rimuove le righe che non sono più presenti nell'Excel
        var toRemove = existingItems.Values
            .Where(x => !excelIds.Contains(x.ExcelId))
            .ToList();
        _db.MevItems.RemoveRange(toRemove);

        _db.SaveChanges();

        return Ok(new
        {
            message = "Allineamento completato",
            count = _db.MevItems.Count()
        });
        }
        catch (Exception ex)
        {
            return Problem($"Errore durante l'importazione dal file Excel: {ex.Message}");
        }
    }

    // ============================================================
    // GET /api/mev/export
    // ============================================================
    [HttpGet("export")]
    public IActionResult ExportExcel()
    {
        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("MEV");

        // HEADER
        var headers = new[]
        {
        "ID",
        "GoTo",
        "Applicativo",
        "Descrizione",
        "Stato",
        "Anno Competenza",
        "Importo Fornitura",
        "Note",
        "P Anno",
        "P Release",
        "P Importo",
        "P Note"
    };

        for (int i = 0; i < headers.Length; i++)
            ws.Cell(1, i + 1).Value = headers[i];

        // DATI

        var items = _db.MevItems
            .AsNoTracking()
            .OrderBy(x => x.ExcelOrder)
            .ToList();


        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value = item.ExcelId;
            ws.Cell(row, 2).Value = item.GoTo;
            ws.Cell(row, 3).Value = item.Applicativo;
            ws.Cell(row, 4).Value = item.Descrizione;
            ws.Cell(row, 5).Value = item.Stato;
            ws.Cell(row, 6).Value = item.AnnoCompetenza;
            ws.Cell(row, 7).Value = item.ImportoExcel;
            ws.Cell(row, 8).Value = item.NoteExcel;
            ws.Cell(row, 9).Value = item.PAnno;
            ws.Cell(row, 10).Value = item.PRelease;
            ws.Cell(row, 11).Value = item.PImporto;
            ws.Cell(row, 12).Value = item.PNote;
            row++;
        }

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;

        return File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "MEV_Export.xlsx"
        );
    }

}
