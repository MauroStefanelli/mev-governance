using System.Security.Claims;
using ClosedXML.Excel;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

// The Excel model of the Offer Table is saved once per lot and every export starts from it.
public static class OfferWorkbookTemplateRegression
{
    static IFormFile File(byte[] bytes, string name = "Tabella Offerta.xlsx") => new FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", name);
    static string Payload(string lot = "2") => System.Text.Json.JsonSerializer.Serialize(new OfferWorkbookRequest { Code = "GOTO-1", Title = "T", Lot = lot,
        Interventions = new() { new("I1", "Uno", "", "", "S", "", "", "", 1, 0, 1, 0) },
        Details = new() { new("I1", "API", "Java", "", "d", "239", "Backend", "API", "MODIFICA", "Medio", 2, 50) },
        TowPrices = new() { [$"TOW0{lot}.1"] = 10, [$"TOW0{lot}.2"] = 20, [$"TOW0{lot}.3"] = 30, [$"TOW0{lot}.4"] = 40 } }, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
    static string FirstCell(byte[] workbook) { using var book = new XLWorkbook(new MemoryStream(workbook)); return book.Worksheet("GOTO-1").Cell("Z1").GetString(); }

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        OfferWorkbookController As(string role, int environment = 1) => new(db) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.Name, "anna"), new Claim("fullName", "Anna Rossi"), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString()) }, "test")) } } };
        T Body<T>(IActionResult r) where T : class => (r as ObjectResult)?.Value as T ?? throw new Exception("unexpected " + r.GetType().Name);
        string Json(IActionResult r) => System.Text.Json.JsonSerializer.Serialize((r as ObjectResult)?.Value);

        var one = OfferWorkbookRegression.Model("2", "UNO"); var two = OfferWorkbookRegression.Model("2", "DUE");
        check(await As("Developer").Status("2") is OkObjectResult { Value: not null } status && Json(await As("Developer").Status("2")).Contains("\"current\":null"), "Template: with nothing saved the status says so");

        // permissions
        check(await As("Client").Upload(File(one), "2") is ForbidResult, "Template: a Client cannot save the model");
        check(await As("Bid Manager").Upload(File(one), "2") is ForbidResult, "Template: a Bid Manager reads but cannot change the model");
        check(await As("Developer", 0).Upload(File(one), "2") is ForbidResult, "Template: an environment is required");
        check(await As("Client").Status("2") is ForbidResult, "Template: a Client cannot read the model");
        check(await As("Bid Manager").Status("2") is OkObjectResult, "Template: a Bid Manager can read the status");

        // a wrong file is refused BEFORE it is saved
        check(await As("Developer").Upload(File(new byte[] { 1, 2, 3 }), "2") is BadRequestObjectResult, "Template: a file that is not an XLSX is refused");
        check(await As("Developer").Upload(File(one, "modello.txt"), "2") is BadRequestObjectResult, "Template: only .xlsx is accepted");
        check(await As("Developer").Upload(File(OfferWorkbookRegression.Model("1", "X")), "2") is BadRequestObjectResult, "Template: a model of another lot (price list TOW01) is refused for lot 2");
        check(await As("Developer").Upload(File(one), "") is BadRequestObjectResult, "Template: the lot is required");
        check(await As("Developer").Upload(File(OfferWorkbookRegression.Model("2-1", "P")), "2-1") is BadRequestObjectResult && await As("Developer").Upload(File(OfferWorkbookRegression.Model(new string('1', 17), "P")), new string('1', 17)) is BadRequestObjectResult, "Template: the lot must be a plain short code, even for a model that fits it");
        check(!await db.OfferWorkbookTemplates.AnyAsync(), "Template: nothing is saved by the refused files");

        // first save, same file again, update
        var first = Json(await As("Developer").Upload(File(one), "2"));
        check(first.Contains("\"Version\":1") && first.Contains("\"unchanged\":false") && first.Contains("Anna Rossi"), $"Template: the first save is version 1, with who saved it ({first})");
        check(Json(await As("Developer").Upload(File(one, "altro nome.xlsx"), "2")).Contains("\"unchanged\":true") && await db.OfferWorkbookTemplates.CountAsync() == 1, "Template: the same file again is not a new version");
        var second = Json(await As("Admin").Upload(File(two), "2"));
        check(second.Contains("\"Version\":2") && await db.OfferWorkbookTemplates.CountAsync() == 2, "Template: a different file is a new version");
        var status2 = Json(await As("Developer").Status("2"));
        check(status2.Contains("\"Version\":2") && status2.Contains("\"previous\":[") && status2.Contains("\"Version\":1"), "Template: the status shows the version in use and the previous ones");

        // download
        check(await As("Developer").Download("2", null) is FileContentResult { FileContents.Length: > 0 } && FirstCell2(((FileContentResult)await As("Developer").Download("2", null)).FileContents) == "DUE", "Template: the file in use is the latest version");
        check(FirstCell2(((FileContentResult)await As("Developer").Download("2", 1)).FileContents) == "UNO", "Template: an earlier version can be downloaded");
        check(await As("Developer").Download("2", 99) is NotFoundObjectResult && await As("Developer").Download("1", null) is NotFoundObjectResult, "Template: an unknown version or a lot without a model is not found");

        // restore = a new version with the old content
        check(Json(await As("Developer").Restore("2", 1)).Contains("\"Version\":3") && FirstCell2(((FileContentResult)await As("Developer").Download("2", null)).FileContents) == "UNO", "Template: putting back an old version makes a NEW version, nothing is lost");
        check(await As("Developer").Restore("2", 50) is NotFoundObjectResult, "Template: restoring a version that does not exist is refused");
        check(await As("Bid Manager").Restore("2", 1) is ForbidResult, "Template: a Bid Manager cannot restore");

        // isolation between environments and lots
        check(Json(await As("Developer", 2).Status("2")).Contains("\"current\":null"), "Template: another environment does not see this model");
        check(await As("Developer").Download("1", null) is NotFoundObjectResult, "Template: another lot does not see this model");
        check(await As("Developer", 2).Download("2", null) is NotFoundObjectResult && await As("Developer", 2).Download("2", 1) is NotFoundObjectResult, "Template: another environment cannot download this model, not even by version number");
        check(await As("Developer", 2).Restore("2", 1) is NotFoundObjectResult, "Template: another environment cannot restore this model");

        // only the last versions are kept
        for (var n = 0; n < 7; n++) await As("Developer").Upload(File(OfferWorkbookRegression.Model("2", "V" + n)), "2");
        var kept = await db.OfferWorkbookTemplates.Where(t => t.AmbienteId == 1 && t.Lot == "2").Select(t => t.Version).OrderBy(v => v).ToListAsync();
        check(kept.Count == OfferWorkbookController.Keep && kept.Last() == 10, $"Template: only the last {OfferWorkbookController.Keep} versions are kept ({string.Join(",", kept)})");

        // export
        var latest = ((FileContentResult)await As("Developer").Download("2", null)).FileContents;
        var fromSaved = await As("Developer").Export(null, Payload("2"));
        check(fromSaved is FileContentResult f1 && FirstCell(f1.FileContents) == "V6" && f1.ContentType.Contains("spreadsheetml"), "Export: without a file it starts from the saved model");
        var withFile = await As("Developer").Export(File(OfferWorkbookRegression.Model("2", "SOLO-QUESTA")), Payload("2"));
        check(withFile is FileContentResult f2 && FirstCell(f2.FileContents) == "SOLO-QUESTA", "Export: a file sent with the request is used for that export");
        check(await db.OfferWorkbookTemplates.CountAsync(t => t.AmbienteId == 1 && t.Lot == "2") == OfferWorkbookController.Keep && !(await db.OfferWorkbookTemplates.AnyAsync(t => t.Sha256 == Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(OfferWorkbookRegression.Model("2", "SOLO-QUESTA"))).ToLowerInvariant())), "Export: the file sent with an export is not saved");
        check(await As("Developer").Export(File(OfferWorkbookRegression.Model("2", "X"), "modello.txt"), Payload("2")) is BadRequestObjectResult, "Export: a file that is not .xlsx is refused");
        check(await As("Developer").Export(File(new byte[10 * 1024 * 1024 + 1], "grande.xlsx"), Payload("2")) is BadRequestObjectResult, "Export: a file over 10 MB is refused");
        var versionsBefore = await db.OfferWorkbookTemplates.CountAsync();
        var noModel = await As("Developer").Export(null, Payload("1"));
        check(noModel is BadRequestObjectResult && Json(noModel).Contains("Nessun modello salvato per il lotto 1"), "Export: a lot without a saved model says what to do, it does not fail obscurely");
        check(await As("Client").Export(null, Payload("2")) is ForbidResult, "Export: a Client cannot export");
        check(await As("Bid Manager").Export(null, Payload("2")) is FileContentResult, "Export: a Bid Manager can export from the saved model");
        check(await As("Developer").Export(null, "non è json") is BadRequestObjectResult, "Export: unreadable data is refused with a message");
        check(await db.OfferWorkbookTemplates.CountAsync() == versionsBefore, "Export: exporting never changes the saved model");
    }

    static string FirstCell2(byte[] model) { using var book = new XLWorkbook(new MemoryStream(model)); return book.Worksheet("EXAMPLE").Cell("Z1").GetString(); }
}
