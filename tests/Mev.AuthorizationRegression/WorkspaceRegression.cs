using System.Security.Claims;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

public static class WorkspaceRegression
{
    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        InitiativeWorkspaceController Controller(string role, int environment = 1) => new(db) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.Name, "analista"), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString())
            }, "test")) } }
        };
        var admin = Controller("Admin");
        check(await Controller("Client").Revisions("GOTO-1") is ForbidResult, "Workspace forbids Client");
        check(await Controller("Admin", 0).Revisions("GOTO-1") is ForbidResult, "Workspace requires an environment");
        var state = new WorkspaceState { Title = "Iniziativa", System = "NPSO", Decisions = new() { new() { Id = "d1", Text = "Usare API", Source = "requisito.md:12", Approve = true } } };
        var result = await admin.Save("GOTO-1", new() { ExpectedVersion = 0, Reason = "Prima analisi", State = state });
        check(result is OkObjectResult, "First revision persisted");
        check(await admin.Save("GOTO-1", new() { ExpectedVersion = 0, Reason = "Stale save", State = state }) is ConflictObjectResult, "Concurrent stale revision rejected");
        var rows = ((OkObjectResult)await admin.Revisions("GOTO-1")).Value as List<InitiativeRevision>;
        check(rows?.Count == 1 && rows[0].Author == "analista", "Server attributes revision author");
        check(rows![0].Payload.Contains("approvedBy\":\"analista"), "Decision approval attributed by server");
        check((((OkObjectResult)await Controller("Admin", 2).Revisions("GOTO-1")).Value as List<InitiativeRevision>)?.Count == 0, "Workspace revisions isolated by environment");
        state.Decisions[0].Text = "Alterazione";
        check(await admin.Save("GOTO-1", new() { ExpectedVersion = 1, Reason = "Rewrite", State = state }) is BadRequestObjectResult, "Approved decisions cannot be rewritten");
        state.Decisions[0].Text = "Usare API";
        check(await admin.Save("GOTO-1", new() { ExpectedVersion = 1, Reason = "Approve", State = state, Approve = true }) is ForbidResult, "Analyst cannot approve final revision");
        var stored = System.Text.Json.JsonSerializer.Deserialize<WorkspaceState>(rows[0].Payload, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;
        check(await Controller("Bid Manager").Save("GOTO-1", new() { ExpectedVersion = 1, Reason = "Revisione verificata", State = stored, Approve = true }) is OkObjectResult, "Bid Manager approves exact saved revision");
        check(await db.InitiativeRevisions.CountAsync(r => r.Goto == "GOTO-1") == 2, "Approval preserves original revision");
        var archive = ((OkObjectResult)await admin.List()).Value as List<InitiativeRevision>;
        check(archive?.Count == 1 && archive[0].Version == 2, "Archive returns only latest revision per initiative");
        check((((OkObjectResult)await Controller("Admin", 2).List()).Value as List<InitiativeRevision>)?.Count == 0, "Archive is isolated by environment");
        var bytes = System.Text.Encoding.UTF8.GetBytes("Requisito Poste originale");
        var file = new FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", "requisiti.md");
        var upload = await admin.UploadDocument("GOTO-1", file) as OkObjectResult;
        var document = upload?.Value as InitiativeDocument;
        check(document != null && document.Size == bytes.Length && document.Author == "analista", "Original document persisted with server attribution");
        check(document!.Sha256 == Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant(), "Document hash matches original bytes");
        check(!System.Text.Json.JsonSerializer.Serialize(document).Contains("Content\""), "Document metadata never serializes original content");
        var downloaded = await Controller("Bid Manager").DownloadDocument("GOTO-1", document.Id) as FileContentResult;
        check(downloaded?.FileContents.SequenceEqual(bytes) == true, "Supervisor downloads exact original");
        check(await Controller("Admin", 2).DownloadDocument("GOTO-1", document.Id) is NotFoundResult, "Document download isolated by environment");
        check(await admin.DownloadDocument("OTHER", document.Id) is NotFoundResult, "Document download isolated by initiative");
        check(await Controller("Bid Manager").UploadDocument("GOTO-1", file) is ForbidResult, "Supervisor cannot upload documents");
        check(await admin.UploadDocument("GOTO-1", new FormFile(new MemoryStream(), 0, 0, "file", "empty")) is BadRequestObjectResult, "Empty document rejected");
        check(await admin.UploadDocument("GOTO-1", new FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", "requisiti.md")) is OkObjectResult, "Repeated names preserve distinct originals");
        check(await db.InitiativeDocuments.CountAsync(d => d.Goto == "GOTO-1") == 2, "Uploading does not overwrite previous originals");
        var extraction = ((OkObjectResult)await admin.ExtractDocument("GOTO-1", document.Id)).Value as MevGovernanceBackend.Services.DocumentExtraction;
        check(extraction?.Status == "ready" && extraction.Passages[0].Text == "Requisito Poste originale", "Extracts original text with line reference");
        check(extraction!.Passages[0].Location == "riga 1", "Text reference identifies source line");
        check(await Controller("Admin", 2).ReadExtraction("GOTO-1", document.Id) is NotFoundResult, "Extraction isolated by environment");
        check(await Controller("Bid Manager").ExtractDocument("GOTO-1", document.Id) is ForbidResult, "Supervisor cannot generate extracts");
        check(((OkObjectResult)await Controller("Bid Manager").ReadExtraction("GOTO-1", document.Id)).Value is MevGovernanceBackend.Services.DocumentExtraction { Status: "ready" }, "Saved extraction available to supervisor");
        check(MevGovernanceBackend.Services.InitiativeDocumentExtractor.Extract("image.png", bytes).Status == "unsupported", "Unsupported file explicitly reported");
        check(MevGovernanceBackend.Services.InitiativeDocumentExtractor.Extract("broken.pdf", bytes).Status == "error", "Broken PDF explicitly reported");
        check(MevGovernanceBackend.Services.InitiativeDocumentExtractor.Extract("empty.txt", Array.Empty<byte>()).Status == "empty", "Empty extraction explicitly reported");
        var large = MevGovernanceBackend.Services.InitiativeDocumentExtractor.Extract("large.txt", System.Text.Encoding.UTF8.GetBytes(new string('a', 25000)));
        check(large.Status == "partial" && large.Passages.Sum(p => p.Text.Length) == 24000, "Extract respects character limit and reports truncation");
        using var docx = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(docx, System.IO.Compression.ZipArchiveMode.Create, true))
        {
            using var writer = new StreamWriter(zip.CreateEntry("word/document.xml").Open());
            writer.Write("<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body><w:p><w:r><w:t>Specifica API</w:t></w:r></w:p></w:body></w:document>");
        }
        var word = MevGovernanceBackend.Services.InitiativeDocumentExtractor.Extract("specifica.docx", docx.ToArray());
        check(word.Status == "ready" && word.Passages[0].Location == "paragrafo 1" && word.Passages[0].Text == "Specifica API", "DOCX retains paragraph reference");
        using var excel = new MemoryStream();
        using (var workbook = new ClosedXML.Excel.XLWorkbook())
        {
            var sheet = workbook.AddWorksheet("Stima"); sheet.Cell("A1").Value = "Costo"; sheet.Cell("B1").FormulaA1 = "2+3";
            workbook.SaveAs(excel);
        }
        var xlsx = MevGovernanceBackend.Services.InitiativeDocumentExtractor.Extract("stima.xlsx", excel.ToArray());
        check(xlsx.Status == "ready" && xlsx.Passages[0].Location.Contains("Stima") && xlsx.Passages[0].Text.Contains("=2+3"), "XLSX retains sheet and formulas without recalculating");
    }
}
