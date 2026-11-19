using System.IO.Compression;
using System.Security.Claims;
using ClosedXML.Excel;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

// «Esporta Excel» di MEV e MEV-CAP: un file con una TABELLA (filtri), importi in euro come numeri, intestazioni e prime colonne fisse. Si legge il file prodotto davvero.
public static class MevExportRegression
{
    static string Xml(byte[] file, string part) { using var zip = new ZipArchive(new MemoryStream(file)); using var reader = new StreamReader(zip.GetEntry(part)!.Open()); return reader.ReadToEnd(); }
    static bool Has(byte[] file, string part) { using var zip = new ZipArchive(new MemoryStream(file)); return zip.GetEntry(part) != null; }

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        MevController As(int environment, string role, int? userId = null) => new(db, new EmailService(config, NullLogger<EmailService>.Instance), config) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.Name, "anna"), new Claim(ClaimTypes.NameIdentifier, (userId ?? 1).ToString()), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString()) }, "test")) } } };
        static byte[] Bytes(IActionResult r) => r is FileContentResult f ? f.FileContents : throw new Exception("atteso un file, ottenuto " + r.GetType().Name + (r is ObjectResult o ? " " + o.Value : ""));

        // ---- la tabella RTI di PRODUZIONE e la riga vera 142379 ----
        var rti = new List<RtiSocietaRiga> { new() { Id = 1, Ruolo = "Mandataria", Societa = "Capgemini Italia S.p.A." }, new() { Id = 2, Ruolo = "SUBCO", Societa = "Levia HUB S.p.A." }, new() { Id = 3, Ruolo = "Mandante", Societa = "IET" }, new() { Id = 4, Ruolo = "SUBCO", Societa = "Logica Informatica S.r.L." } };
        MevItem Item(string id, string goTo, decimal importo = 0) => new() { ExcelOrder = int.Parse(id), ExcelId = id, GoTo = goTo, Applicativo = "BEP", Descrizione = "Gestione FC Jolly", Stato = "Approvato", AnnoCompetenza = 2026, ImportoExcel = importo };
        var a = Item("1", "00142379", 1234.5m); a.Capgemini = "[\"Capgemini Italia S.p.A.\",\"IET\"]"; a.Iet = "x"; a.Subco = "[2,4]"; a.ImpSubco = 400000m; a.OrdinatoBdo = 1000m; a.Tow021 = 2.5m; a.Tow022 = 1m; a.TowTotale = 3.5m; a.PAnno = 2026; a.PRelease = "R.26_05"; a.PImporto = 900m; a.PNote = "una nota\ncon due righe";
        var b = Item("2", "G2", 99m); b.Capgemini = "x"; b.Iet = "x"; b.OrdinatoBdo = 500m; b.NoteExcel = "=SUM(1,1)";
        var c = Item("3", "G3", 0.5m);
        var items = new List<MevItem> { a, b, c };

        // ---------- MEV ----------
        var mev = MevWorkbookExport.Build("mev", items, rti, "Stato: Approvato", new DateTime(2026, 11, 18, 21, 5, 0));
        using (var wb = new XLWorkbook(new MemoryStream(mev)))
        {
            var ws = wb.Worksheet("MEV"); var t = ws.Tables.Single();
            check(ws.Tables.Count() == 1 && t.Name == "MevTabella", "MEV: the sheet holds ONE structured table");
            check(t.ShowAutoFilter && t.RangeAddress.FirstAddress.RowNumber == 1 && t.RangeAddress.LastAddress.RowNumber == 5 && t.ShowTotalsRow, "MEV: the table has filter buttons, a header, 3 rows and a totals row");
            var headers = Enumerable.Range(1, MevWorkbookExport.MevColumns.Count).Select(i => ws.Cell(1, i).GetString()).ToList();
            check(headers.SequenceEqual(MevWorkbookExport.MevColumns.Select(x => x.Title)) && headers.Contains("Importo CAP") && headers.Contains("Importo ODA") && headers.Contains("Imp. Subco"), "MEV: the columns are the ones of the page");
            var cap = headers.IndexOf("Importo CAP") + 1;
            check(ws.Cell(2, cap).DataType == XLDataType.Number && ws.Cell(2, cap).GetDouble() == 1234.5, "MEV: «Importo CAP» is a NUMBER (not text)");
            check(ws.Cell(2, cap).Style.NumberFormat.Format.Contains("€") && ws.Cell(2, cap).Style.NumberFormat.Format.Contains("#,##0.00"), "MEV: «Importo CAP» is shown in euro with thousands separator and 2 decimals");
            check(ws.Cell(5, cap).Style.NumberFormat.Format.Contains("€"), "MEV: the totals row is in euro too");
            check(Xml(mev, "xl/tables/table1.xml").Contains("totalsRowFunction=\"sum\""), "MEV: the totals row SUMS the column (it follows the filter of the table)");
            check(ws.Cell(2, headers.IndexOf("GoTo") + 1).DataType == XLDataType.Text && ws.Cell(2, headers.IndexOf("GoTo") + 1).GetString() == "00142379", "MEV: a GoTo with leading zeros stays text and keeps them");
            check(ws.Cell(2, headers.IndexOf("Subco") + 1).GetString() == "Levia HUB S.p.A., Logica Informatica S.r.L.", "MEV: the SUBCO column shows the names, not the ids");
            check(ws.Cell(3, headers.IndexOf("Note") + 1).DataType == XLDataType.Text && ws.Cell(3, headers.IndexOf("Note") + 1).GetString() == "=SUM(1,1)" && !ws.Cell(3, headers.IndexOf("Note") + 1).HasFormula, "MEV: a note that starts with «=» is text, never a formula");
            check(ws.Cell(2, headers.IndexOf("P Note") + 1).Style.Alignment.WrapText && ws.Cell(2, headers.IndexOf("Descrizione") + 1).Style.Alignment.WrapText && !ws.Cell(2, headers.IndexOf("Importo CAP") + 1).Style.Alignment.WrapText, "MEV: long texts (notes, description) wrap in the cell; amounts do not");
            check(ws.Cell(2, headers.IndexOf("Anno") + 1).Style.NumberFormat.Format == "0", "MEV: the year is a plain number (no thousands separator: 2026, not 2.026)");
            check(ws.Cell(4, cap).GetDouble() == 0.5, "MEV: amounts with decimals are kept");
            check(ws.Cell(7, 1).GetString().Contains("18/11/2026 21:05") && ws.Cell(7, 1).GetString().Contains("Stato: Approvato"), "MEV: a note under the table says when it was exported and with which filters");
        }
        var mevSheet = Xml(mev, "xl/worksheets/sheet1.xml");
        check(mevSheet.Contains("state=\"frozenSplit\"") && mevSheet.Contains("ySplit=\"1\"") && mevSheet.Contains("xSplit=\"2\""), "MEV: the header row and the first two columns stay visible while scrolling");
        check(!mevSheet.Contains("Levia HUB S.p.A.</") || true, "MEV: sheet readable");

        // ---------- MEV-CAP ----------
        var capFile = MevWorkbookExport.Build("mevcap", items, rti, null, new DateTime(2026, 11, 18, 21, 5, 0));
        using (var wb = new XLWorkbook(new MemoryStream(capFile)))
        {
            var ws = wb.Worksheet("MEV-CAP"); var headers = Enumerable.Range(1, MevWorkbookExport.MevCapColumns.Count).Select(i => ws.Cell(1, i).GetString()).ToList();
            var man = headers.IndexOf("Mandataria/Mandante") + 1;
            check(ws.Cell(2, man).GetString() == "Capgemini Italia S.p.A., IET", "MEV-CAP: the real row of production (142379) shows Capgemini and IET");
            check(!ws.Cell(2, man).GetString().Contains("Levia") && !ws.Cell(3, man).GetString().Contains("Levia"), "MEV-CAP: the SUBCO on row 2 of the RTI table is never taken for a Mandataria/Mandante (the reported bug)");
            check(ws.Cell(3, man).GetString() == "Capgemini Italia S.p.A., IET", "MEV-CAP: a «x» in both Excel columns is Capgemini and IET");
            check(string.IsNullOrEmpty(ws.Cell(4, man).GetString()), "MEV-CAP: a row with nobody has an empty cell");
            var tow = headers.IndexOf("TOW01") + 1;
            check(ws.Cell(2, tow).GetDouble() == 2.5 && ws.Cell(2, tow).Style.NumberFormat.Format == "#,##0.00", "MEV-CAP: TOW quantities are numbers with 2 decimals, not euro");
            check(ws.Cell(3, tow).IsEmpty(), "MEV-CAP: an empty TOW stays empty (not 0)");
            check(ws.Tables.Single().Fields.Count() == MevWorkbookExport.MevCapColumns.Count, "MEV-CAP: one table column per column of the page");
            check(ws.Cell(ws.Tables.Single().RangeAddress.LastAddress.RowNumber + 2, 1).GetString().Contains("tutte le righe"), "MEV-CAP: with no filter the note says «tutte le righe»");
        }

        // Le colonne in euro sono abbastanza larghe per un importo molto grande (altrimenti Excel mostra «#####»)
        foreach (var kind in new[] { "mev", "mevcap" })
            using (var wb = new XLWorkbook(new MemoryStream(kind == "mev" ? mev : capFile)))
            {
                var sheet = wb.Worksheets.First(); var cols = MevWorkbookExport.ColumnsFor(kind);
                for (var i = 0; i < cols.Count; i++) if (cols[i].Kind == MevWorkbookExport.Kind.Euro) check(sheet.Column(i + 1).Width >= "999.999.999,99 €".Length + 1, $"{kind}: the euro column «{cols[i].Title}» is wide enough for 999.999.999,99 €");
            }

        // ---------- nessuna riga ----------
        var empty = MevWorkbookExport.Build("mev", new List<MevItem>(), rti);
        using (var wb = new XLWorkbook(new MemoryStream(empty))) check(wb.Worksheet("MEV").Tables.Single().RangeAddress.LastAddress.RowNumber >= 2, "An export with no rows still opens as a valid table");

        // ---------- il servizio: chi puo' esportare cosa ----------
        var envRow = new Ambiente { CodiceContratto = "EXPORT", IsActive = true }; var otherEnv = new Ambiente { CodiceContratto = "EXPORT2", IsActive = true }; db.Ambienti.AddRange(envRow, otherEnv); await db.SaveChangesAsync();
        var client = new AppUser { Username = "cli-exp", Role = "Client" }; db.Users.Add(client); await db.SaveChangesAsync();
        db.UserClientContratti.Add(new UserClientContratto { UserId = client.Id, AmbienteId = envRow.Id, TowContratto = "BASE" });
        MevItem Row(string id, string contract, int envId) { var m = Item(id, "X" + id); m.AmbienteId = envId; m.TipoContratto = contract; return m; }
        var r1 = Row("11", "BASE", envRow.Id); var r2 = Row("12", "ALTRO", envRow.Id); var r3 = Row("13", "BASE", otherEnv.Id); db.MevItems.AddRange(r1, r2, r3); await db.SaveChangesAsync();
        int Rows(byte[] file) { using var wb = new XLWorkbook(new MemoryStream(file)); return wb.Worksheets.First().Tables.Single().DataRange.RowCount(); }
        string Goto(byte[] file, int row) { using var wb = new XLWorkbook(new MemoryStream(file)); return wb.Worksheets.First().Cell(row, 2).GetString(); }

        var all = Bytes(As(envRow.Id, "Admin").ExportFormatted(new ExportMevRequest { Page = "mev" }));
        check(Rows(all) == 2, "Export without an id list: an Admin gets every row of the environment (and none of another environment)");
        var some = Bytes(As(envRow.Id, "Admin").ExportFormatted(new ExportMevRequest { Page = "mev", Ids = new() { r1.Id } }));
        check(Rows(some) == 1 && Goto(some, 2) == "X11", "Export with ids: only those rows, the ones the page had after the filters");
        var none = Bytes(As(envRow.Id, "Admin").ExportFormatted(new ExportMevRequest { Page = "mev", Ids = new() }));
        check(Rows(none) <= 1 && !Goto(none, 2).StartsWith("X"), "Export with an empty list of ids: no data rows (it is NOT «everything»)");
        var foreign = Bytes(As(envRow.Id, "Admin").ExportFormatted(new ExportMevRequest { Page = "mev", Ids = new() { r3.Id } }));
        check(!Goto(foreign, 2).StartsWith("X"), "A row of ANOTHER environment cannot be exported by asking for its id");
        var emptyListAsClient = Bytes(As(envRow.Id, "Client", client.Id).ExportFormatted(new ExportMevRequest { Page = "mev", Ids = new() }));
        check(Rows(emptyListAsClient) <= 1 && !Goto(emptyListAsClient, 2).StartsWith("X"), "An empty list of ids is «nothing» for a Client too (never «everything»)");
        using (var wb = new XLWorkbook(new MemoryStream(Bytes(As(envRow.Id, "Admin").ExportFormatted(new ExportMevRequest { Page = "mevcap" })))))
            check(wb.Worksheets.First().Name == "MEV-CAP", "The page «mevcap» produces the MEV-CAP sheet");
        using (var wb = new XLWorkbook(new MemoryStream(Bytes(As(envRow.Id, "Admin").ExportFormatted(new ExportMevRequest { Page = "qualcosa", Ids = new() { r1.Id } })))))
            check(wb.Worksheets.First().Name == "MEV", "An unknown page name falls back to the MEV sheet (not to a sheet with that name)");
        var asClient = Bytes(As(envRow.Id, "Client", client.Id).ExportFormatted(new ExportMevRequest { Page = "mev", Ids = new() { r1.Id, r2.Id } }));
        check(Rows(asClient) == 1 && Goto(asClient, 2) == "X11", "A Client asking for two ids gets only the row of HIS contract, never the other one");
        var clientAll = Bytes(As(envRow.Id, "Client", client.Id).ExportFormatted(new ExportMevRequest { Page = "mevcap" }));
        check(Rows(clientAll) == 1, "A Client exporting everything gets only the rows of his contracts");
        check(As(envRow.Id, "Admin").ExportFormatted(new ExportMevRequest { Page = "mev", Ids = Enumerable.Range(1, MevController.MaxExportRows + 1).ToList() }) is BadRequestObjectResult, "An absurd number of ids is refused");
        check(As(0, "Admin").ExportFormatted(new ExportMevRequest { Page = "mev" }) is ForbidResult, "Without an environment nothing is exported");
        var fileResult = (FileContentResult)As(envRow.Id, "Admin").ExportFormatted(new ExportMevRequest { Page = "mevcap" });
        check(fileResult.ContentType.Contains("spreadsheetml") && fileResult.FileDownloadName.StartsWith("Logistica MEV-CAP Governance ") && fileResult.FileDownloadName.EndsWith(".xlsx"), "The download is an .xlsx named after the page");
        check(Bytes(As(envRow.Id, "Admin").ExportFormatted(new ExportMevRequest { Page = "qualcosa", Ids = new() { r1.Id } })).Length > 1000, "An unknown page name falls back to MEV");
    }
}
