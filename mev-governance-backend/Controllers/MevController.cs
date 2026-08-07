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
    private readonly IConfiguration _config;

    public MevController(AppDbContext db, EmailService email, IConfiguration config)
    {
        _db = db;
        _email = email;
        _contrattoCtrl = new ContrattoController(db);
        _config = config;
    }

    // ============================================================
    // GET /api/mev
    // ============================================================
    [HttpGet]
    
    public IActionResult GetMev()
    {
        var ambienteId = GetAmbienteId();
        var items = _db.MevItems
            .AsNoTracking()
            .Where(m => m.AmbienteId == ambienteId)
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
        var ambienteId = GetAmbienteId();
        var item = _db.MevItems.FirstOrDefault(x => x.Id == id && x.AmbienteId == ambienteId);
        if (item == null)
            return NotFound();

        // Campi PMO
        item.PAnno      = request.PAnno;
        item.PRelease   = request.PRelease;
        item.PImporto   = request.PImporto;
        item.PNote      = request.PNote;
        item.ImportoBdo = request.ImportoBdo;

        // Campi Excel editabili dalla modale
        if (request.Stato      != null) item.Stato      = request.Stato;
        if (request.ReleaseExcel != null) item.ReleaseExcel = request.ReleaseExcel;
        if (request.PmPoste    != null) item.PmPoste    = request.PmPoste;
        if (request.PmCap      != null) item.PmCap      = request.PmCap;
        if (request.TipoContratto != null) item.TipoContratto = request.TipoContratto;
        if (request.Recupero   != null) item.Recupero   = request.Recupero;
        if (request.Capgemini  != null) item.Capgemini  = request.Capgemini;
        if (request.Subco      != null) item.Subco      = request.Subco;
        if (request.CapImporti   != null) item.CapImporti   = request.CapImporti;
        if (request.SubcoImporti != null) item.SubcoImporti = request.SubcoImporti;
        if (request.Tbd        != null) item.Tbd        = request.Tbd;
        if (request.Bc         != null) item.Bc         = request.Bc;
        if (request.Contratto  != null) item.Contratto  = request.Contratto;
        if (request.Rda        != null) item.Rda        = request.Rda;
        if (request.AtId       != null) item.AtId       = request.AtId;
        if (request.Tow021     != null) item.Tow021     = request.Tow021;
        if (request.Tow022     != null) item.Tow022     = request.Tow022;
        if (request.Tow023     != null) item.Tow023     = request.Tow023;
        if (request.Tow024     != null) item.Tow024     = request.Tow024;
        if (request.Tow025     != null) item.Tow025     = request.Tow025;
        if (request.Tow026     != null) item.Tow026     = request.Tow026;
        if (request.Accantonato!= null) item.Accantonato= request.Accantonato;
        if (request.Nel        != null) item.Nel        = request.Nel;
        if (request.InVita     != null) item.InVita     = request.InVita;
        if (request.Cm         != null) item.Cm         = request.Cm;
        if (request.NoteExcel  != null) item.NoteExcel  = request.NoteExcel;

        // Ricalcolo importi e TowTotale se inviati dal frontend
        if (request.ImportoExcel             != null) item.ImportoExcel             = request.ImportoExcel.Value;
        if (request.ImportoFornituraScontato != null) item.ImportoFornituraScontato = request.ImportoFornituraScontato.Value;
        if (request.TowTotale               != null) item.TowTotale               = request.TowTotale.Value;

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
    [Authorize(Policy = "AdminOrSuper")]
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

            var ambienteId = GetAmbienteId();
            var mevResult = ImportFromExcelFile(uploadedPath, ambienteId);

            // Allinea anche i contratti dallo stesso file
            var contrattoResult = _contrattoCtrl.AlignInternal(ambienteId);

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
    // GET /api/mev/options  — valori distinti per i dropdown
    // ============================================================
    [HttpGet("options")]
    public IActionResult GetOptions()
    {
        var ambienteId = GetAmbienteId();

        var items = _db.MevItems
            .AsNoTracking()
            .Where(m => m.AmbienteId == ambienteId)
            .ToList();

        static IEnumerable<string> Distinct(IEnumerable<string?> source) =>
            source
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => v!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(v => v);

        // Prezzi unitari per tipo contratto: { "BASE": { "TOW02.1": 123.45, ... }, "QDO": { ... } }
        // Se l'ambiente non ha ConsumoTow, usa i prezzi da qualsiasi altro ambiente (fallback globale).
        var towRows = _db.ConsumoTow
            .AsNoTracking()
            .Where(t => t.AmbienteId == ambienteId && t.TowContratto != null)
            .ToList();

        if (towRows.Count == 0)
        {
            towRows = _db.ConsumoTow
                .AsNoTracking()
                .Where(t => t.TowContratto != null)
                .ToList();
        }

        var priceMap = towRows
            .GroupBy(t => t.TowContratto!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.ToDictionary(t => t.Tow, t => t.ValoreUnitario)
            );

        return Ok(new
        {
            applicativo   = Distinct(items.Select(i => i.Applicativo)),
            pmPoste       = Distinct(items.Select(i => i.PmPoste)),
            pmCap         = Distinct(items.Select(i => i.PmCap)),
            annoCompetenza = items.Select(i => i.AnnoCompetenza)
                                  .Where(a => a > 0)
                                  .Distinct()
                                  .OrderBy(a => a)
                                  .Select(a => a.ToString()),
            releaseExcel  = Distinct(items.Select(i => i.ReleaseExcel)),
            stato         = new[] { "Approvato", "In analisi / Stima", "In approvazione", "Sospeso", "Eliminato" },
            tipoContratto = new[] { "BASE", "QDO" },
            priceMap,
        });
    }

    // ============================================================
    // POST /api/mev  — crea una nuova riga MEV manualmente
    // ============================================================
    [HttpPost]
    public IActionResult CreateMev([FromBody] CreateMevRequest request)
    {
        var ambienteId = GetAmbienteId();

        // ExcelId univoco per questo ambiente
        if (string.IsNullOrWhiteSpace(request.ExcelId))
            return BadRequest("ExcelId obbligatorio");

        if (_db.MevItems.Any(x => x.ExcelId == request.ExcelId && x.AmbienteId == ambienteId))
            return Conflict($"ExcelId '{request.ExcelId}' già presente in questo ambiente");

        var maxOrder = _db.MevItems
            .Where(x => x.AmbienteId == ambienteId)
            .Select(x => (int?)x.ExcelOrder)
            .Max() ?? 0;

        var item = new MevItem
        {
            ExcelOrder              = maxOrder + 1,
            ExcelId                 = request.ExcelId.Trim(),
            Applicativo             = request.Applicativo,
            Descrizione             = request.Descrizione,
            GoTo                    = request.GoTo ?? "",
            XOrdine                 = request.XOrdine,
            PmPoste                 = request.PmPoste,
            PmCap                   = request.PmCap,
            AnnoCompetenza          = request.AnnoCompetenza,
            ReleaseExcel            = request.ReleaseExcel,
            Stato                   = request.Stato,
            TipoContratto           = request.TipoContratto,
            ImportoExcel            = request.ImportoExcel,
            ImportoFornituraScontato = request.ImportoExcel,
            Recupero                = request.Recupero,
            NoteExcel               = request.NoteExcel,
            Bc                      = request.Bc,
            Contratto               = request.Contratto,
            Rda                     = request.Rda,
            AtId                    = request.AtId,
            Nel                     = request.Nel,
            InVita                  = request.InVita,
            Cm                      = request.Cm,
            Subco                   = request.Subco,
            Tbd                     = request.Tbd,
            Accantonato             = request.Accantonato,
            Tow021                  = request.Tow021,
            Tow022                  = request.Tow022,
            Tow023                  = request.Tow023,
            Tow024                  = request.Tow024,
            Tow025                  = request.Tow025,
            Tow026                  = request.Tow026,
            TowTotale               = (request.Tow021 ?? 0) + (request.Tow022 ?? 0) + (request.Tow023 ?? 0)
                                    + (request.Tow024 ?? 0) + (request.Tow025 ?? 0) + (request.Tow026 ?? 0),
            PAnno                   = request.PAnno,
            PRelease                = request.PRelease,
            PImporto                = request.PImporto,
            PNote                   = request.PNote,
            ImportoBdo              = request.ImportoBdo,
            Capgemini               = request.Capgemini,
            CapImporti              = request.CapImporti,
            SubcoImporti            = request.SubcoImporti,
            AmbienteId              = ambienteId,
            IsManual                = 1,   // creata dalla UI, protetta da align
        };

        _db.MevItems.Add(item);
        _db.SaveChanges();

        return CreatedAtAction(nameof(GetMev), new { }, item);
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
    private IActionResult ImportFromExcelFile(string excelPath, int ambienteId)
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

        Console.WriteLine($"[MEV ALIGN] Colonne TOW trovate: " +
            string.Join(", ", columnMap
                .Where(kv => System.Text.RegularExpressions.Regex.IsMatch(kv.Key, @"^TOW\d+\.\d+$", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                .OrderBy(kv => kv.Value)
                .Select(kv => $"{kv.Key}=col{kv.Value}")));

        // Costruisco un dizionario delle righe esistenti per ExcelId (filtrato per ambiente)
        var existingItems = _db.MevItems
            .Where(x => x.AmbienteId == ambienteId)
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

            decimal GetDecimalByCol(int colNum)
            {
                row.Cell(colNum).TryGetValue(out decimal v);
                return v;
            }

            int GetInt(string col)
            {
                if (!columnMap.ContainsKey(col))
                    return 0;
                row.Cell(columnMap[col]).TryGetValue(out int v);
                return v;
            }

            string goTo        = GetString("GoTo");
            string applicativo = GetString("Applicativo");
            string xOrdine     = GetString("X ORDINE");
            string descrizione = GetString("Descrizione");
            string pmPoste     = GetString("PM POSTE");
            string pmCap       = GetString("PM CAP");
            string stato       = GetString("Stato");
            decimal importo    = GetDecimal("Importo Fornitura");
            string tipoContratto = GetString("Tipo Contratto");
            decimal importoScontato = GetDecimal("Importo Fornitura scontato ");
            string excelId     = GetString("ID");
            string noteExcel   = GetString("Note");
            string recupero    = GetString("Recupero");
            string subco       = GetString("SUBCO");
            string tbd         = GetString("TBD");
            string bc          = GetString("BC");
            string contratto   = GetString("Contratto");
            string atId        = GetString("AT ID");
            // Legge le colonne TOW per POSIZIONE ORDINALE:
            // tutte le colonne "TOWxx.x" trovate nell'header, ordinate alfabeticamente,
            // vengono mappate in sequenza a tow021…tow026 (1°→tow021, 2°→tow022, ecc.)
            // Questo supporta qualsiasi serie (TOW01.x, TOW02.x, ecc.)
            var towColumnsOrdered = columnMap
                .Where(kv => System.Text.RegularExpressions.Regex.IsMatch(
                    kv.Key, @"^TOW\d+\.\d+$", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                .OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
                .ToList();
            decimal? GetTowByPos(int pos) =>
                pos < towColumnsOrdered.Count
                    ? (decimal?)GetDecimalByCol(towColumnsOrdered[pos].Value)
                    : null;
            decimal? tow021 = GetTowByPos(0);
            decimal? tow022 = GetTowByPos(1);
            decimal? tow023 = GetTowByPos(2);
            decimal? tow024 = GetTowByPos(3);
            decimal? tow025 = GetTowByPos(4);
            decimal? tow026 = GetTowByPos(5);
            decimal towTotale  = GetDecimal("Totale");
            decimal ordinatoBdo = GetDecimal("Ordinato (BdO)");
            decimal fatturato  = GetDecimal("Fatturato");
            decimal residuo    = GetDecimal("Residuo fatturabile");
            string tabellaOfferta = GetString("Tabella Offerta");
            string powerAppsId = GetString("__PowerAppsId__");
            string subcoNome   = GetString("Nome");
            decimal? offertaEuro = columnMap.ContainsKey("Offerta (€)") ? (decimal?)GetDecimal("Offerta (€)") : null;
            string po          = GetString("PO");
            string docOfferta  = GetString("Documento Offerta");
            decimal? accantonato = columnMap.ContainsKey("Accantonato") ? (decimal?)GetDecimal("Accantonato") : null;
            string nel         = GetString("NEL");
            string inVita      = GetString("In Vita");
            string cm          = GetString("CM");
            string releaseExcel = GetString("Release");
            string rda         = GetString("RDA");
            string cap         = GetString("Capgemini");
            string iet         = GetString("IET");

            // SKIP / STOP riga "TOTALE" — ferma l'import
            if (
                descrizione.Contains("totale", StringComparison.OrdinalIgnoreCase) ||
                applicativo.Contains("totale", StringComparison.OrdinalIgnoreCase) ||
                goTo.Contains("totale", StringComparison.OrdinalIgnoreCase) ||
                excelId.Contains("totale", StringComparison.OrdinalIgnoreCase)
            )
                break; // interrompe completamente il loop, non solo salta la riga

            // SKIP righe completamente vuote (nessun dato significativo)
            if (string.IsNullOrWhiteSpace(goTo) && string.IsNullOrWhiteSpace(applicativo) &&
                string.IsNullOrWhiteSpace(descrizione) && importo == 0)
                continue;

            excelIds.Add(excelId);

            if (existingItems.TryGetValue(excelId, out var existing))
            {
                // Aggiorna solo i campi Excel, preserva i campi PMO
                existing.ExcelOrder             = excelOrder++;
                existing.GoTo                   = goTo;
                existing.Applicativo            = applicativo;
                existing.XOrdine                = xOrdine;
                existing.Descrizione            = descrizione;
                existing.PmPoste                = pmPoste;
                existing.PmCap                  = pmCap;
                existing.Stato                  = stato;
                existing.AnnoCompetenza         = GetInt("Anno Competenza");
                existing.ReleaseExcel           = releaseExcel;
                existing.Capgemini              = cap;
                existing.Iet                    = iet;
                existing.ImportoExcel           = importo;
                existing.TipoContratto          = tipoContratto;
                existing.ImportoFornituraScontato = importoScontato;
                existing.NoteExcel              = noteExcel;
                existing.Recupero               = recupero;
                existing.Subco                  = subco;
                existing.Tbd                    = tbd;
                existing.Bc                     = bc;
                existing.Contratto              = contratto;
                existing.AtId                   = atId;
                existing.Rda                    = rda;
                existing.Tow021                 = tow021;
                existing.Tow022                 = tow022;
                existing.Tow023                 = tow023;
                existing.Tow024                 = tow024;
                existing.Tow025                 = tow025;
                existing.Tow026                 = tow026;
                existing.TowTotale              = towTotale;
                existing.OrdinatoBdo            = ordinatoBdo;
                existing.Fatturato              = fatturato;
                existing.ResiduoFatturabile     = residuo;
                existing.TabellaOfferta         = tabellaOfferta;
                existing.PowerAppsId            = powerAppsId;
                existing.SubcoNome              = subcoNome;
                existing.OffertaEuro            = offertaEuro;
                existing.Po                     = po;
                existing.DocumentoOfferta       = docOfferta;
                existing.Accantonato            = accantonato;
                existing.Nel                    = nel;
                existing.InVita                 = inVita;
                existing.Cm                     = cm;
            }
            else
            {
                // Nuova riga: inserisce con valori PMO di default dall'Excel
                var item = new MevItem
                {
                    ExcelOrder              = excelOrder++,
                    ExcelId                 = excelId,
                    GoTo                    = goTo,
                    Applicativo             = applicativo,
                    XOrdine                 = xOrdine,
                    Descrizione             = descrizione,
                    PmPoste                 = pmPoste,
                    PmCap                   = pmCap,
                    Stato                   = stato,
                    AnnoCompetenza          = GetInt("Anno Competenza"),
                    ReleaseExcel            = releaseExcel,
                    Capgemini               = cap,
                    Iet                     = iet,
                    ImportoExcel            = importo,
                    TipoContratto           = tipoContratto,
                    ImportoFornituraScontato = importoScontato,
                    NoteExcel               = noteExcel,
                    Recupero                = recupero,
                    Subco                   = subco,
                    Tbd                     = tbd,
                    Bc                      = bc,
                    Contratto               = contratto,
                    AtId                    = atId,
                    Rda                     = rda,
                    Tow021                  = tow021,
                    Tow022                  = tow022,
                    Tow023                  = tow023,
                    Tow024                  = tow024,
                    Tow025                  = tow025,
                    Tow026                  = tow026,
                    TowTotale               = towTotale,
                    OrdinatoBdo             = ordinatoBdo,
                    Fatturato               = fatturato,
                    ResiduoFatturabile      = residuo,
                    TabellaOfferta          = tabellaOfferta,
                    PowerAppsId             = powerAppsId,
                    SubcoNome               = subcoNome,
                    OffertaEuro             = offertaEuro,
                    Po                      = po,
                    DocumentoOfferta        = docOfferta,
                    Accantonato             = accantonato,
                    Nel                     = nel,
                    InVita                  = inVita,
                    Cm                      = cm,
                    PAnno                   = GetInt("Anno Competenza"),
                    PRelease                = releaseExcel,
                    PImporto                = importo,
                    ImportoBdo              = ordinatoBdo,
                    AmbienteId              = ambienteId
                };
                _db.MevItems.Add(item);
            }
        }

        // Rimuove le righe che non sono più presenti nell'Excel (escluse le righe manuali)
        var toRemove = existingItems.Values
            .Where(x => !excelIds.Contains(x.ExcelId) && x.IsManual == 0)
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

        var ambienteId = GetAmbienteId();
        var items = _db.MevItems
            .AsNoTracking()
            .Where(x => x.AmbienteId == ambienteId)
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
    // ============================================================
    // DELETE /api/mev/{id}
    // Elimina una singola riga MEV per l'ambiente corrente.
    // ============================================================
    [HttpDelete("{id:int}")]
    public IActionResult DeleteMev(int id)
    {
        var ambienteId = GetAmbienteId();
        var item = _db.MevItems.FirstOrDefault(x => x.Id == id && x.AmbienteId == ambienteId);
        if (item == null)
            return NotFound($"Riga MEV {id} non trovata in questo ambiente");

        _db.MevItems.Remove(item);
        _db.SaveChanges();

        return Ok(new { deleted = id });
    }

    // ============================================================
    // DELETE /api/mev/reset-all
    // Svuota MevItems e ConsumoTow per l'ambiente corrente e resetta i serial ID.
    // Riservato a SuperAdmin.
    // ============================================================
    [HttpDelete("reset-all")]
    [Authorize(Policy = "AdminOrSuper")]
    public IActionResult ResetAll()
    {
        var ambienteId = GetAmbienteId();

        // Legge lo schema dal config (stesso meccanismo di Program.cs)
        var rawSchema = (_config["DB_SCHEMA"] ?? "public").Trim().ToLower();
        var sch = System.Text.RegularExpressions.Regex.IsMatch(rawSchema, @"^[a-zA-Z0-9_]+$")
            ? rawSchema : "public";

        // 1. Cancella le righe dell'ambiente corrente
        var mevDeleted  = _db.MevItems.Where(m => m.AmbienteId == ambienteId).Count();
        var towDeleted  = _db.ConsumoTow.Where(t => t.AmbienteId == ambienteId).Count();

        _db.MevItems.RemoveRange(_db.MevItems.Where(m => m.AmbienteId == ambienteId));
        _db.ConsumoTow.RemoveRange(_db.ConsumoTow.Where(t => t.AmbienteId == ambienteId));
        _db.SaveChanges();

        // 2. Resetta la sequenza PostgreSQL solo se non ci sono più righe nelle tabelle
        //    (altri ambienti potrebbero avere ancora righe — in quel caso non resettiamo)
        try
        {
#pragma warning disable EF1002
            if (!_db.MevItems.Any())
                _db.Database.ExecuteSqlRaw($@"
                    SELECT setval(
                        pg_get_serial_sequence('""{sch}"".""MevItems""', 'Id'),
                        1, false
                    );");

            if (!_db.ConsumoTow.Any())
                _db.Database.ExecuteSqlRaw($@"
                    SELECT setval(
                        pg_get_serial_sequence('""{sch}"".""ConsumoTow""', 'Id'),
                        1, false
                    );");
#pragma warning restore EF1002
        }
        catch (Exception ex)
        {
            // Il reset della sequenza è best-effort: non blocca l'operazione
            Console.Error.WriteLine($"[RESET-ALL] Sequence reset warning: {ex.Message}");
        }

        return Ok(new {
            message = $"Reset completato per ambienteId={ambienteId}.",
            mevDeleted,
            towDeleted
        });
    }

}

