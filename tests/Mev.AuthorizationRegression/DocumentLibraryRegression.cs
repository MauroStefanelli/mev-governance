using System.IO.Compression;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

public class FakeOcr : IOcrEngine
{
    public bool IsAvailable { get; set; } = true;
    public string Status = "done"; public string Text = "TIMEOUT-OCR 12 secondi per la prenotazione";
    public int Calls;
    public Task<OcrResult> ReadAsync(byte[] image, string fileName, CancellationToken cancel = default)
    {
        Calls++;
        if (!IsAvailable) return Task.FromResult(new OcrResult("unavailable", "", "Il motore OCR non è installato su questo server."));
        return Task.FromResult(Status == "done" ? new OcrResult("done", Text, "Testo riconosciuto automaticamente.", "ita+eng") : new OcrResult(Status, "", "Nessun testo."));
    }
}

public class FakeDocumentAssistant : IDocumentAssistant
{
    public List<DocumentAskRequest> Seen = new();
    public bool Throw; public bool Unreadable;
    public Task<(DocumentAnswer? Answer, string Model)> AskAsync(DocumentAskRequest request, AppUserAiSettings settings)
    {
        Seen.Add(request);
        if (Throw) throw new InvalidOperationException("provider down");
        return Task.FromResult<(DocumentAnswer?, string)>((Unreadable ? null : new DocumentAnswer("Risposta [1]", new() { "file, riga 1" }), "modello-test"));
    }
}

public static class DocumentLibraryRegression
{
    static JsonElement J(object? value) => JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    static JsonElement Ok(IActionResult result) => result is OkObjectResult ok ? J(ok.Value) : throw new Exception("Expected 200, got " + result.GetType().Name + (result is ObjectResult o ? " " + J(o.Value) : ""));
    static IFormFile File(string name, string text) { var b = Encoding.UTF8.GetBytes(text); return new FormFile(new MemoryStream(b), 0, b.Length, "files", name); }
    static IFormFile File(string name, byte[] b) => new FormFile(new MemoryStream(b), 0, b.Length, "files", name);
    static IFormFileCollection Files(params IFormFile[] files) { var c = new FormFileCollection(); foreach (var f in files) c.Add(f); return c; }

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        // ---- Search engine (pure) ----
        check(DocumentSearch.Normalize("  Prenotazione  ÈNTE  ") == "prenotazione ente", "Search normalizes case, accents and spaces");
        check(DocumentSearch.Terms("la prenotazione dei requisiti").SequenceEqual(new[] { "prenotazion", "requisit" }), "Search drops stop words and stems final vowels");
        check(DocumentSearch.Terms("   ").Count == 0 && DocumentSearch.Terms(null).Count == 0, "Empty query has no terms");
        check(DocumentSearch.Score("Il requisito di prenotazione è obbligatorio", DocumentSearch.Terms("requisiti prenotazioni"), "requisiti prenotazioni") > DocumentSearch.Score("Solo la prenotazione", DocumentSearch.Terms("requisiti prenotazioni"), "requisiti prenotazioni"), "A passage with more query terms ranks higher");
        check(DocumentSearch.Score("niente di rilevante", DocumentSearch.Terms("requisiti"), "requisiti") == 0, "A passage without terms scores zero");
        var ranked = DocumentSearch.Rank(new[] { new SearchPassage("riga 1", "Altro argomento"), new SearchPassage("riga 2", "Il timeout massimo è di 5 secondi") }, "timeout", 5);
        check(ranked.Count == 1 && ranked[0].Location == "riga 2" && ranked[0].Text.Contains("timeout"), "Ranking returns only matching passages with an excerpt");
        var longText = new string('x', 800) + " parola-chiave " + new string('y', 800);
        var excerpt = DocumentSearch.Excerpt(longText, DocumentSearch.Terms("parola-chiave"));
        check(excerpt.Contains("parola-chiave") && excerpt.Length < 400, "Excerpt is centred on the match and bounded");
        check(DocumentSearch.BuildIndex(new[] { new SearchPassage("a", new string('é', 600000)) }).Length <= DocumentSearch.MaxIndexedChars + 1, "Search index is bounded");

        // ---- Extractor: new formats ----
        var eml = "From: =?utf-8?B?TWFyaW8gUm9zc2k=?= <m@x.it>\r\nTo: a@x.it\r\nSubject: Requisiti =?utf-8?Q?citt=C3=A0?=\r\nDate: Mon, 4 May 2026 10:00:00 +0200\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"BND\"\r\n\r\n--BND\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nIl timeout =C3=A8 di 5 secondi\r\n--BND\r\nContent-Type: application/pdf; name=\"allegato.pdf\"\r\nContent-Disposition: attachment; filename=\"allegato.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\nSGVsbG8=\r\n--BND--\r\n";
        var mail = InitiativeDocumentExtractor.Extract("msg.eml", Encoding.UTF8.GetBytes(eml));
        var mailText = string.Join("\n", mail.Passages.Select(p => p.Text));
        check(mail.Status == "ready" && mailText.Contains("Mario Rossi") && mailText.Contains("Requisiti città") && mailText.Contains("Il timeout è di 5 secondi"), "EML decodes headers, quoted-printable body and encoded words");
        check(mailText.Contains("allegato.pdf") && !mailText.Contains("SGVsbG8"), "EML lists attachment names without reading their content");
        check(InitiativeDocumentExtractor.Extract("vuoto.eml", Array.Empty<byte>()).Status == "empty", "Empty EML is reported as empty");
        using (var pptx = new MemoryStream())
        {
            using (var zip = new ZipArchive(pptx, ZipArchiveMode.Create, true))
            {
                void Slide(string name, string text) { using var w = new StreamWriter(zip.CreateEntry(name).Open()); w.Write("<p:sld xmlns:p='p' xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main'><a:p><a:r><a:t>" + text + "</a:t></a:r></a:p></p:sld>"); }
                Slide("ppt/slides/slide2.xml", "Seconda slide"); Slide("ppt/slides/slide1.xml", "Prima slide");
            }
            var deck = InitiativeDocumentExtractor.Extract("deck.pptx", pptx.ToArray());
            check(deck.Status == "ready" && deck.Passages[0].Location == "slide 1" && deck.Passages[0].Text == "Prima slide" && deck.Passages[1].Location == "slide 2", "PPTX is read slide by slide in order");
        }
        check(InitiativeDocumentExtractor.Extract("rotto.pptx", new byte[] { 1, 2, 3 }).Status == "error", "Corrupt PPTX is reported, not thrown");
        var html = InitiativeDocumentExtractor.Extract("p.html", Encoding.UTF8.GetBytes("<html><style>.a{}</style><script>evil()</script><body><h1>Titolo</h1><p>Testo &amp; dettagli</p></body></html>"));
        var htmlText = string.Join(" ", html.Passages.Select(p => p.Text));
        check(htmlText.Contains("Titolo") && htmlText.Contains("Testo & dettagli") && !htmlText.Contains("evil") && !htmlText.Contains(".a{}"), "HTML text is extracted without scripts and styles");
        using (var archive = new MemoryStream())
        {
            using (var zip = new ZipArchive(archive, ZipArchiveMode.Create, true))
            {
                using (var empty = new StreamWriter(zip.CreateEntry("docs/requisiti.txt").Open())) empty.Write("riga");
                using (var w = new StreamWriter(zip.CreateEntry("docs/note.txt").Open())) w.Write("CONTENUTO-INTERNO-NON-INDICIZZATO");
            }
            var listed = InitiativeDocumentExtractor.Extract("pacco.zip", archive.ToArray());
            var listing = string.Join(" ", listed.Passages.Select(p => p.Text));
            check(listing.Contains("docs/requisiti.txt") && !listing.Contains("CONTENUTO-INTERNO"), "ZIP indexes file names only, never unpacks the contents");
            check(listed.Message.Contains("solo i nomi"), "ZIP extraction states plainly what was indexed");
        }
        check(InitiativeDocumentExtractor.Extract("a.rar", new byte[] { 1 }).Status == "unsupported" && InitiativeDocumentExtractor.Extract("a.png", new byte[] { 1 }).Status == "unsupported" && InitiativeDocumentExtractor.Extract("a.msg", new byte[] { 1 }).Status == "unsupported", "RAR, images and MSG are honestly reported as not readable");

        // ---- Controller ----
        // Bulk updates go straight to the database, so reads that verify them must not come from the tracker.
        db.ChangeTracker.Clear();
        var user = new AppUser { Username = "carla", FullName = "Carla Neri", Role = "Developer", IsActive = true };
        db.Users.Add(user); await db.SaveChangesAsync();
        var fake = new FakeDocumentAssistant();
        var ocr = new FakeOcr();
        DocumentLibraryController As(string name, string role, int environment = 1) => new(db, fake, ocr) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, name), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString()) }, "test")) } }
        };
        var anna = As("anna", "Developer"); var luca = As("luca", "Admin"); var capo = As("capo", "Bid Manager");

        check(await As("x", "Client").List("L1") is ForbidResult, "Library forbids Client");
        check(await As("x", "Developer", 0).List("L1") is ForbidResult, "Library requires an environment");
        check(await capo.Upload("L1", Files(File("a.txt", "x")), null) is ForbidResult, "Supervisor cannot upload");
        check(await capo.Ask("L1", new("domanda")) is ForbidResult, "Supervisor cannot ask the AI");
        check(await anna.List(" ") is BadRequestObjectResult, "Library requires an initiative");
        check(await anna.Upload("L1", Files(), null) is BadRequestObjectResult, "Upload needs at least one file");
        check(await anna.Upload("L1", Files(Enumerable.Range(0, 6).Select(i => File("f" + i + ".txt", "x" + i)).ToArray()), null) is BadRequestObjectResult, "Upload bounds the number of files");
        check(await anna.Upload("L1", Files(File("a.txt", "x")), "Cartella inventata") is BadRequestObjectResult, "Upload rejects an unknown folder");

        // Multi-file upload with per-file outcomes.
        var big = new byte[(int)DocumentLibraryController.MaxFileBytes + 1];
        var up = Ok(await anna.Upload("L1", Files(File("requisiti.txt", "Il sistema deve gestire la prenotazione con timeout di 5 secondi.\nIl chiamante può ritentare."), File("vuoto.txt", ""), File("virus.exe", "MZ"), File("enorme.pdf", big), File("scambio.eml", eml)), DocumentLibraryController.MemoryCategory)).GetProperty("results");
        check(up.GetArrayLength() == 5, "Upload reports one outcome per file");
        check(up[0].GetProperty("ok").GetBoolean() && up[0].GetProperty("document").GetProperty("category").GetString() == DocumentLibraryController.MemoryCategory, "Valid file stored in the chosen folder");
        check(!up[1].GetProperty("ok").GetBoolean() && up[1].GetProperty("message").GetString()!.Contains("vuoto"), "Empty file refused with a reason");
        check(!up[2].GetProperty("ok").GetBoolean() && up[2].GetProperty("message").GetString()!.Contains("eseguibile"), "Executable files are refused");
        check(!up[3].GetProperty("ok").GetBoolean() && up[3].GetProperty("message").GetString()!.Contains("10 MB"), "Oversized file refused with a reason");
        check(up[4].GetProperty("ok").GetBoolean(), "A bad file does not block the valid ones");
        check(db.InitiativeDocuments.Count(d => d.Goto == "L1") == 2, "Only the valid files are stored");
        var first = db.InitiativeDocuments.Single(d => d.FileName == "requisiti.txt");
        check(first.Author == "anna" && first.Version == 1 && first.IsCurrent && first.GroupId == first.Id && first.IndexVersion >= 3 && first.IndexStatus == "ready" && first.SearchText!.Contains("prenotazion"), "Upload attributes the author on the server, sets version 1 and indexes the text");
        check(db.InitiativeDocuments.Single(d => d.FileName == "scambio.eml").Category == DocumentLibraryController.MemoryCategory, "An explicit folder wins over the suggested one");
        check(Ok(await anna.Upload("L1", Files(File("posta.eml", eml.Replace("TWFyaW8gUm9zc2k=", "TWFyY28gQmlhbmNoaQ==").Replace("Il timeout =C3=A8 di 5", "Altro messaggio =C3=A8 di 9"))), null)).GetProperty("results")[0].GetProperty("document").GetProperty("category").GetString() == "Email e comunicazioni", "Emails are suggested the communications folder");
        check(Ok(await anna.Upload("L1", Files(File("generico.txt", "altro contenuto")), null)).GetProperty("results")[0].GetProperty("document").GetProperty("category").GetString() == DocumentLibraryController.DefaultCategory, "Other files go to the default folder");

        // Duplicates.
        var dup = Ok(await anna.Upload("L1", Files(File("copia.txt", "Il sistema deve gestire la prenotazione con timeout di 5 secondi.\nIl chiamante può ritentare.")), null)).GetProperty("results")[0];
        check(!dup.GetProperty("ok").GetBoolean() && dup.GetProperty("message").GetString()!.Contains("stesso contenuto"), "Identical content is never stored twice");
        var sameName = Ok(await anna.Upload("L1", Files(File("REQUISITI.txt", "contenuto diverso")), null)).GetProperty("results")[0];
        check(!sameName.GetProperty("ok").GetBoolean() && sameName.GetProperty("canVersion").GetBoolean(), "Same name with new content must become a version");
        check(db.InitiativeDocuments.AsNoTracking().Count(d => d.Goto == "L1") == 4, "Refused uploads store nothing");

        // Isolation.
        check(Ok(await As("anna", "Developer", 2).List("L1")).GetProperty("documents").GetArrayLength() == 0, "Library is isolated by environment");
        check(Ok(await anna.List("l1")).GetProperty("documents").GetArrayLength() == 4, "Initiative code is case-insensitive");
        check(Ok(await anna.List("ALTRA")).GetProperty("documents").GetArrayLength() == 0, "Library is isolated by initiative");

        // Versions.
        var group = first.GroupId;
        check(await anna.NewVersion("L1", group, File("requisiti_v2.txt", "Il timeout diventa di 8 secondi."), 7) is ConflictObjectResult, "A stale version number is a conflict");
        check(await anna.NewVersion("L1", group, File("requisiti.txt", "Il sistema deve gestire la prenotazione con timeout di 5 secondi.\nIl chiamante può ritentare."), 1) is ConflictObjectResult, "A new version identical to the current one is refused");
        check(await capo.NewVersion("L1", group, File("x.txt", "y"), 1) is ForbidResult, "Supervisor cannot add versions");
        check(await anna.NewVersion("L1", Guid.NewGuid(), File("x.txt", "y"), 1) is NotFoundResult, "Unknown document group is not found");
        var v2 = Ok(await luca.NewVersion("L1", group, File("requisiti_v2.txt", "Il timeout diventa di 8 secondi per la prenotazione."), 1));
        check(v2.GetProperty("version").GetInt32() == 2 && v2.GetProperty("versions").GetInt32() == 2 && v2.GetProperty("author").GetString() == "luca", "New version is v2 with the new author");
        check(db.InitiativeDocuments.AsNoTracking().Count(d => d.GroupId == group && d.IsCurrent) == 1 && db.InitiativeDocuments.AsNoTracking().Count(d => d.GroupId == group) == 2, "Exactly one version is current and the old one is kept");
        check(!db.InitiativeDocuments.AsNoTracking().Single(d => d.Id == first.Id).IsCurrent && db.InitiativeDocuments.AsNoTracking().Single(d => d.Id == first.Id).Content.Length == first.Content.Length, "The replaced version keeps its original bytes");
        check(await anna.NewVersion("L1", group, File("requisiti_v3.txt", "ancora diverso"), 1) is ConflictObjectResult, "Two people versioning the same base: the second is refused");
        check(db.InitiativeDocuments.AsNoTracking().Count(d => d.GroupId == group) == 2, "A refused version stores nothing");
        // The loser of a real race read version 2 as current, but a colleague flips it before the transaction runs.
        db.ChangeTracker.Clear();
        var raced = await luca.NewVersion("L1", group, File("requisiti_v3.txt", "terza versione valida"), 2);
        check(raced is OkObjectResult, "The next version on the right base is accepted");
        check(await anna.NewVersion("L1", group, File("requisiti_v3b.txt", "concorrente sulla stessa base"), 2) is ConflictObjectResult, "A second author on the same base 2 is refused");
        check(db.InitiativeDocuments.AsNoTracking().Count(d => d.GroupId == group && d.IsCurrent) == 1 && db.InitiativeDocuments.AsNoTracking().Count(d => d.GroupId == group) == 3, "Concurrent versioning never leaves two current versions");
        // A real race: the colleague switches the current version AFTER this request passed the version check and BEFORE its write.
        var before = db.InitiativeDocuments.AsNoTracking().Count(d => d.GroupId == group);
        var racer = As("anna", "Developer");
        racer.BeforeVersionSwitch = async () =>
        {
            using var other = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(db.Database.GetDbConnection()).Options, new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build());
            var currentRow = await other.InitiativeDocuments.SingleAsync(d => d.GroupId == group && d.IsCurrent);
            currentRow.IsCurrent = false;
            other.InitiativeDocuments.Add(new InitiativeDocument { AmbienteId = 1, Goto = "L1", GroupId = group, Version = currentRow.Version + 5, FileName = "arrivato-prima.txt", Size = 3, Sha256 = "zzz", Author = "luca", CreatedAt = DateTime.UtcNow, Content = new byte[] { 1 }, Category = currentRow.Category });
            await other.SaveChangesAsync();
        };
        var versionsBeforeRace = db.InitiativeDocuments.AsNoTracking().Where(d => d.GroupId == group).Select(d => d.Version).ToList();
        var lost = await racer.NewVersion("L1", group, File("perdente.txt", "sono arrivato dopo"), 3);
        check(lost is ConflictObjectResult, "A version lost in a real race is refused");
        db.ChangeTracker.Clear();
        check(db.InitiativeDocuments.AsNoTracking().Count(d => d.GroupId == group) == before + 1 && !db.InitiativeDocuments.AsNoTracking().Any(d => d.FileName == "perdente.txt"), "The losing upload writes nothing");
        check(db.InitiativeDocuments.AsNoTracking().Count(d => d.GroupId == group && d.IsCurrent) == 1, "After a real race exactly one version is current");
        check(Ok(await anna.List("L1")).GetProperty("documents").EnumerateArray().Count(d => d.GetProperty("groupId").GetGuid() == group) == 1, "The list shows only the current version");
        var history = Ok(await anna.History("L1", group));
        check(history.GetProperty("versions").GetArrayLength() == 4 && history.GetProperty("versions")[0].GetProperty("version").GetInt32() == 8, "History lists all versions, newest first");
        check(history.GetProperty("events").EnumerateArray().Select(e => e.GetProperty("action").GetString()).Contains("nuova versione") && history.GetProperty("events").EnumerateArray().Select(e => e.GetProperty("action").GetString()).Contains("caricato"), "History records who did what");
        check(history.GetProperty("events").EnumerateArray().All(e => !string.IsNullOrEmpty(e.GetProperty("actor").GetString())), "Every event is attributed");
        check(await As("anna", "Developer", 2).History("L1", group) is NotFoundResult, "History is isolated by environment");

        // Search.
        var found = Ok(await anna.Search("L1", "timeout", null, null, null, null, false));
        check(found.GetProperty("results").GetArrayLength() >= 1 && found.GetProperty("results").EnumerateArray().All(r => r.GetProperty("snippets").GetArrayLength() > 0 || r.GetProperty("nameMatch").GetBoolean()), "Content search finds documents with an excerpt");
        check(!found.GetProperty("results").EnumerateArray().Any(r => r.GetProperty("document").GetProperty("groupId").GetGuid() == group && r.GetProperty("document").GetProperty("version").GetInt32() < 8), "Search covers current versions only by default");
        check(Ok(await anna.Search("L1", "timeout", null, null, null, null, true)).GetProperty("results").EnumerateArray().Any(r => r.GetProperty("document").GetProperty("version").GetInt32() == 1 && r.GetProperty("document").GetProperty("groupId").GetGuid() == group), "Search can include previous versions");
        check(Ok(await anna.Search("L1", "TIMEOUT", null, null, null, null, false)).GetProperty("results").GetArrayLength() == found.GetProperty("results").GetArrayLength(), "Search ignores letter case");
        check(Ok(await anna.Search("L1", "citta", null, null, null, null, false)).GetProperty("results").GetArrayLength() >= 1, "Search ignores accents");
        check(Ok(await anna.Search("L1", "arrivato-prima", null, null, null, null, false)).GetProperty("results")[0].GetProperty("nameMatch").GetBoolean(), "Search matches the file name");
        check(Ok(await anna.Search("L1", "parolaassentissima", null, null, null, null, false)).GetProperty("results").GetArrayLength() == 0, "A query with no match returns nothing");
        check(Ok(await anna.Search("L1", "timeout", DocumentLibraryController.MemoryCategory, null, null, null, false)).GetProperty("results").EnumerateArray().All(r => r.GetProperty("document").GetProperty("category").GetString() == DocumentLibraryController.MemoryCategory), "Search filters by folder");
        check(Ok(await anna.Search("L1", null, null, "luca", null, null, false)).GetProperty("results").EnumerateArray().All(r => r.GetProperty("document").GetProperty("author").GetString() == "luca"), "Search filters by author");
        check(Ok(await anna.Search("L1", null, null, null, DateTime.UtcNow.Date.AddDays(1), null, false)).GetProperty("results").GetArrayLength() == 0, "Search filters by upload date (from)");
        check(Ok(await anna.Search("L1", null, null, null, null, DateTime.UtcNow.Date.AddDays(-1), false)).GetProperty("results").GetArrayLength() == 0, "Search filters by upload date (to)");
        check(Ok(await anna.Search("L1", null, null, null, DateTime.UtcNow.Date, DateTime.UtcNow.Date, false)).GetProperty("results").GetArrayLength() > 0, "A same-day date range includes today's uploads");
        check(await anna.Search("L1", "x", "Cartella inventata", null, null, null, false) is BadRequestObjectResult, "Search rejects an unknown folder");
        check(Ok(await As("anna", "Developer", 2).Search("L1", "timeout", null, null, null, null, false)).GetProperty("results").GetArrayLength() == 0, "Search is isolated by environment");
        check(Ok(await capo.Search("L1", "timeout", null, null, null, null, false)).GetProperty("results").GetArrayLength() >= 1, "Supervisor can search");

        // Folder, AI flag, delete.
        var cat = Ok(await anna.Update("L1", group, new("Analisi funzionali", null)));
        check(cat.GetProperty("category").GetString() == "Analisi funzionali" && db.InitiativeDocuments.AsNoTracking().Where(d => d.GroupId == group).All(d => d.Category == "Analisi funzionali"), "Changing folder moves every version of the document");
        check(await anna.Update("L1", group, new("Versioni storiche", null)) is BadRequestObjectResult, "Historical versions is not a folder one can choose");
        check(await capo.Update("L1", group, new("Requisiti cliente", null)) is ForbidResult, "Supervisor cannot reorganize");
        check(Ok(await anna.Update("L1", group, new(null, false))).GetProperty("aiEnabled").GetBoolean() == false, "A document can be excluded from AI use");
        check(await anna.Delete("L1", db.InitiativeDocuments.Single(d => d.FileName == "generico.txt").GroupId) is OkObjectResult, "The author can delete their own document");
        check(await anna.Delete("L1", group) is ObjectResult { StatusCode: 403 } o1 && J(o1.Value).GetProperty("message").GetString()!.Contains("hai caricato"), "A user cannot delete a document uploaded by someone else");
        check(await luca.Delete("L1", group) is OkObjectResult, "An administrator can delete any document");
        check(db.InitiativeDocuments.AsNoTracking().Count(d => d.GroupId == group && d.RemovedAt != null) == 4 && db.InitiativeDocuments.AsNoTracking().Where(d => d.GroupId == group).All(d => d.Content.Length > 0), "Deleting is logical: every version and its bytes remain");
        check(!Ok(await anna.List("L1")).GetProperty("documents").EnumerateArray().Any(d => d.GetProperty("groupId").GetGuid() == group), "A deleted document disappears from the list");
        check(!Ok(await anna.Search("L1", "timeout", null, null, null, null, true)).GetProperty("results").EnumerateArray().Any(r => r.GetProperty("document").GetProperty("groupId").GetGuid() == group), "A deleted document is not searchable");
        check(await anna.Delete("L1", group) is NotFoundResult, "Deleting twice is not found");
        check(Ok(await anna.History("L1", group)).GetProperty("events").EnumerateArray().Any(e => e.GetProperty("action").GetString() == "eliminato"), "Deletion is recorded in the history");

        // Backfill of attachments that existed before the workspace.
        var legacy = new InitiativeDocument { AmbienteId = 1, Goto = "L2", FileName = "vecchio.txt", Size = 5, Sha256 = "abc", Author = "vecchio", CreatedAt = DateTime.UtcNow, Content = Encoding.UTF8.GetBytes("timeout storico") };
        db.InitiativeDocuments.Add(legacy); await db.SaveChangesAsync();
        check(legacy.GroupId == legacy.Id && legacy.Version == 1 && legacy.IsCurrent && legacy.Category == DocumentLibraryController.DefaultCategory, "Old attachments become version 1 of their own group in the default folder");
        var pending = Ok(await anna.List("L2"));
        check(pending.GetProperty("pendingIndex").GetInt32() == 1 && pending.GetProperty("documents").GetArrayLength() == 1, "Old attachments are listed and flagged as not yet indexed");
        check(Ok(await anna.Reindex("L2")).GetProperty("remaining").GetInt32() == 0, "Reindexing brings old attachments up to date");
        check(Ok(await anna.Search("L2", "storico", null, null, null, null, false)).GetProperty("results").GetArrayLength() == 1, "Old attachments become searchable after reindexing");
        check(await capo.Reindex("L2") is ForbidResult, "Supervisor cannot reindex");

        // Questions answered from the documents.
        check(await anna.Ask("L1", new("  ")) is BadRequestObjectResult, "Ask requires a question");
        check(await anna.Ask("L1", new(new string('d', DocumentLibraryController.MaxQuestion + 1))) is BadRequestObjectResult, "Ask bounds the question");
        var none = Ok(await anna.Ask("L1", new("parolaassentissima")));
        check(none.GetProperty("noSources").GetBoolean() && fake.Seen.Count == 0, "With no matching passage the AI is not called at all");
        // A replaced version that mentions a term the current one no longer has: it must never reach the AI.
        var staleGroup = Guid.NewGuid();
        db.InitiativeDocuments.Add(new InitiativeDocument { AmbienteId = 1, Goto = "L1", GroupId = staleGroup, Version = 1, IsCurrent = false, FileName = "storico.txt", Size = 10, Sha256 = "s1", Author = "anna", CreatedAt = DateTime.UtcNow,
            Content = new byte[] { 1 }, SearchText = "valoreobsoleto timeout", IndexVersion = 3, IndexedChars = 30, IndexStatus = "ready",
            Extraction = JsonSerializer.Serialize(new DocumentExtraction("ready", "ok", new() { new("riga 1", "VALORE-OBSOLETO: il timeout era di 99 secondi") }), new JsonSerializerOptions(JsonSerializerDefaults.Web)) });
        await db.SaveChangesAsync();
        var asked = Ok(await anna.Ask("L1", new("Qual è il timeout della prenotazione?")));
        check(!asked.GetProperty("noSources").GetBoolean() && asked.GetProperty("sources").GetArrayLength() > 0 && fake.Seen.Count == 1, "With matching passages the AI is asked once");
        check(asked.GetProperty("sources").EnumerateArray().Where(s => s.GetProperty("fileName").GetString()!.StartsWith("requisiti")).All(s => s.GetProperty("version").GetInt32() == 8), "Retrieval uses the current version of a document, never an old one");
        check(!fake.Seen[0].Context.Contains("VALORE-OBSOLETO") && !fake.Seen[0].Context.Contains("storico.txt"), "The text that only existed in a replaced version is never sent to the AI");
        var sent = fake.Seen[0].Context;
        check(sent.Contains("timeout") && !sent.Contains("generico"), "The AI receives the matching passages only");
        check(Ok(await As("anna", "Developer", 2).Ask("L1", new("timeout prenotazione"))).GetProperty("noSources").GetBoolean(), "Retrieval is isolated by environment");
        // The initial memory, excluded documents and removed ones.
        var memory = db.InitiativeDocuments.First(d => d.FileName == "scambio.eml");
        await anna.Update("L1", memory.GroupId, new(null, false));
        fake.Seen.Clear();
        Ok(await anna.Ask("L1", new("timeout secondi")));
        check(!fake.Seen.Any() || !fake.Seen[0].Context.Contains("scambio.eml"), "A document excluded from AI use is never sent to the AI");
        // Everything about the timeout is now excluded or deleted: the AI is not even called.
        check(Ok(await anna.Ask("L1", new("Quale timeout?"))).GetProperty("noSources").GetBoolean(), "When every relevant document is excluded or deleted there is nothing to answer from");
        Ok(await anna.Upload("L1", Files(File("nuovo.txt", "Il nuovo timeout è di 12 secondi.")), null));
        fake.Throw = true;
        check(await anna.Ask("L1", new("Quale timeout?")) is ObjectResult { StatusCode: 502 }, "AI failure reports 502 with the sources untouched");
        fake.Throw = false; fake.Unreadable = true;
        check(await anna.Ask("L1", new("Quale timeout?")) is ObjectResult { StatusCode: 502 }, "An unreadable AI answer is reported, not invented");

        // ---- Documents attached to the offer analysis ----
        var jo = (string json) => System.Text.Json.Nodes.JsonNode.Parse(json)!.AsObject();
        var offerEnv = 7;
        db.InitiativeDocuments.Add(new InitiativeDocument { AmbienteId = offerEnv, Goto = "OFF1", FileName = "req.txt", Size = 5, Sha256 = "o1", Author = "anna", CreatedAt = DateTime.UtcNow, Content = new byte[] { 1 }, AiEnabled = true, IndexVersion = 3, IndexedChars = 40, IndexStatus = "ready",
            SearchText = "la prenotazione richiede idempotenza", Extraction = JsonSerializer.Serialize(new DocumentExtraction("ready", "ok", new() { new("riga 1", "La prenotazione richiede idempotenza sul numero") }), new JsonSerializerOptions(JsonSerializerDefaults.Web)) });
        db.InitiativeDocuments.Add(new InitiativeDocument { AmbienteId = offerEnv + 1, Goto = "OFF1", FileName = "altro-ambiente.txt", Size = 5, Sha256 = "o2", Author = "anna", CreatedAt = DateTime.UtcNow, Content = new byte[] { 1 }, AiEnabled = true, IndexVersion = 3, IndexedChars = 40, IndexStatus = "ready",
            SearchText = "la prenotazione segreta", Extraction = JsonSerializer.Serialize(new DocumentExtraction("ready", "ok", new() { new("riga 1", "SEGRETO-ALTRO-AMBIENTE prenotazione") }), new JsonSerializerOptions(JsonSerializerDefaults.Web)) });
        await db.SaveChangesAsync();
        var attached = await DocumentContext.AttachAsync(db, offerEnv, jo("{\"initiative\":{\"code\":\"off1\",\"title\":\"Prenotazione\",\"system\":\"NPSO\"},\"catalog\":[]}"));
        var attachedJson = attached.Context.ToJsonString();
        check(attachedJson.Contains("documentKnowledge") && attachedJson.Contains("idempotenza") && attached.Sources.Count > 0, "Offer analysis receives the relevant passages of the open initiative");
        check(!attachedJson.Contains("SEGRETO-ALTRO-AMBIENTE"), "Offer analysis never receives documents of another environment");
        check(attachedJson.Contains("documentPolicy") && attachedJson.Contains("catalog"), "Offer analysis keeps its own context and adds a safety policy for the documents");
        var untouched = await DocumentContext.AttachAsync(db, offerEnv, jo("{\"initiative\":{\"title\":\"\"}}"));
        check(!untouched.Context.ToJsonString().Contains("documentKnowledge") && untouched.Sources.Count == 0, "Without a GOTO or title nothing is attached");
        check(!(await DocumentContext.AttachAsync(db, 0, jo("{\"initiative\":{\"code\":\"off1\"}}"))).Context.ToJsonString().Contains("documentKnowledge"), "Without an environment nothing is attached");
        check(!(await DocumentContext.AttachAsync(db, offerEnv, jo("{\"initiative\":{\"code\":\"sconosciuta\"}}"))).Context.ToJsonString().Contains("documentKnowledge"), "An initiative with no documents gets the context unchanged");
        db.InitiativeDocuments.Where(d => d.AmbienteId == offerEnv).ExecuteUpdate(set => set.SetProperty(d => d.AiEnabled, false));
        check(!(await DocumentContext.AttachAsync(db, offerEnv, jo("{\"initiative\":{\"code\":\"off1\",\"title\":\"Prenotazione\"}}"))).Context.ToJsonString().Contains("idempotenza"), "Documents excluded from AI are not attached to the offer analysis");

        // ---- OCR on images ----
        fake.Throw = false; fake.Unreadable = false;
        var png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 1, 2, 3 };
        var noOcr = Ok(await anna.Upload("OC1", Files(File("schema.png", png)), null)).GetProperty("results")[0];
        check(noOcr.GetProperty("ok").GetBoolean() && noOcr.GetProperty("ocr").GetString() == "none" && ocr.Calls == 0, "An image uploaded without asking for OCR is never sent to the OCR engine");
        var plainImage = noOcr.GetProperty("document");
        check(plainImage.GetProperty("isImage").GetBoolean() && plainImage.GetProperty("indexStatus").GetString() == "unsupported", "An image without OCR is honestly marked as not readable");
        check(plainImage.GetProperty("ocrAvailable").GetBoolean(), "The list tells the user whether OCR can be run");

        var withOcr = Ok(await anna.Upload("OC1", Files(File("schermata.png", new byte[] { 0x89, 0x50, 9, 9 })), null, new[] { "schermata.png" })).GetProperty("results")[0];
        check(withOcr.GetProperty("ocr").GetString() == "done" && ocr.Calls == 1, "OCR runs only on the image the user asked for");
        check(withOcr.GetProperty("document").GetProperty("indexStatus").GetString() == "ready" && withOcr.GetProperty("document").GetProperty("indexedChars").GetInt32() > 10, "Recognized text makes the image indexed");
        var ocrDoc = db.InitiativeDocuments.AsNoTracking().Single(d => d.FileName == "schermata.png");
        check(ocrDoc.OcrStatus == "done" && ocrDoc.OcrLanguage == "ita+eng" && ocrDoc.OcrAt != null && ocrDoc.Content.Length == 4, "OCR status is stored and the original image bytes are untouched");
        check(Ok(await anna.Search("OC1", "timeout-ocr", null, null, null, null, false)).GetProperty("results").EnumerateArray().Any(r => r.GetProperty("document").GetProperty("fileName").GetString() == "schermata.png" && r.GetProperty("snippets")[0].GetProperty("location").GetString()!.StartsWith("OCR")), "Text read by OCR is searchable and labelled as OCR");
        var ocrAsk = Ok(await anna.Ask("OC1", new("Quanto vale il timeout-ocr?")));
        check(!ocrAsk.GetProperty("noSources").GetBoolean() && ocrAsk.GetProperty("sources").EnumerateArray().Any(src => src.GetProperty("location").GetString()!.StartsWith("OCR")), "Text read by OCR is available to the AI, with its OCR source");

        var mixed = Ok(await anna.Upload("OC2", Files(File("nota.txt", "documento di testo"), File("foto.jpg", new byte[] { 0xFF, 0xD8, 7 })), null, new[] { "nota.txt", "foto.jpg" })).GetProperty("results");
        check(mixed[0].GetProperty("ocr").GetString() == "none" && mixed[1].GetProperty("ocr").GetString() == "done", "OCR requested for a non-image file is ignored");
        check(ocr.Calls == 2, "Only images reach the OCR engine, even if other names are ticked");
        check(Ok(await anna.Upload("OC2", Files(File("diagramma.svg", "<svg><text>etichetta vettoriale</text></svg>")), null, new[] { "diagramma.svg" })).GetProperty("results")[0].GetProperty("ocr").GetString() == "none", "SVG is text and never needs OCR");

        ocr.IsAvailable = false;
        var unavailable = Ok(await anna.Upload("OC3", Files(File("scan.png", new byte[] { 0x89, 5, 5 })), null, new[] { "scan.png" })).GetProperty("results")[0];
        check(unavailable.GetProperty("ok").GetBoolean() && unavailable.GetProperty("ocr").GetString() == "unavailable" && unavailable.GetProperty("ocrMessage").GetString()!.Contains("non è installato"), "A missing OCR engine never blocks the upload and is reported");
        check(unavailable.GetProperty("document").GetProperty("indexStatus").GetString() == "unsupported" && !unavailable.GetProperty("document").GetProperty("ocrAvailable").GetBoolean(), "Without the engine the image stays unreadable and says so");
        var groupNoEngine = db.InitiativeDocuments.AsNoTracking().Single(d => d.FileName == "scan.png").GroupId;
        check(await anna.RunOcr("OC3", groupNoEngine) is ObjectResult { StatusCode: 503 }, "Running OCR without the engine reports 503");
        ocr.IsAvailable = true; ocr.Status = "failed";
        var failed = Ok(await anna.Upload("OC3", Files(File("rotta.png", new byte[] { 0x89, 6, 6 })), null, new[] { "rotta.png" })).GetProperty("results")[0];
        check(failed.GetProperty("ok").GetBoolean() && failed.GetProperty("ocr").GetString() == "failed" && failed.GetProperty("document").GetProperty("indexStatus").GetString() == "unsupported", "An image the engine cannot read is stored and reported, not lost");
        ocr.Status = "empty";
        check(Ok(await anna.Upload("OC3", Files(File("bianca.png", new byte[] { 0x89, 7, 7 })), null, new[] { "bianca.png" })).GetProperty("results")[0].GetProperty("ocr").GetString() == "empty", "An image with no text is reported as empty");

        var tricky = Ok(await anna.Upload("OC4", Files(File("a.png", new byte[] { 0x89, 1, 1 }), File("b.png", new byte[] { 0x89, 2, 2 })), null, new[] { "a.png|b.png" })).GetProperty("results");
        check(tricky[0].GetProperty("ocr").GetString() == "none" && tricky[1].GetProperty("ocr").GetString() == "none", "OCR names are matched one by one: a name containing | never selects another file");
        check(Ok(await anna.List("OC4")).GetProperty("ocrAvailable").GetBoolean() == ocr.IsAvailable, "The library says whether OCR can be run");

        // Running OCR afterwards on an image uploaded without it.
        ocr.Status = "done"; ocr.Text = "RIPETUTO-DOPO la conferma del fornitore";
        var laterGroup = db.InitiativeDocuments.AsNoTracking().Single(d => d.FileName == "schema.png").GroupId;
        check(await capo.RunOcr("OC1", laterGroup) is ForbidResult, "Supervisor cannot run OCR");
        check(await anna.RunOcr("OC1", Guid.NewGuid()) is NotFoundResult, "OCR on an unknown document is not found");
        check(await As("anna", "Developer", 2).RunOcr("OC1", laterGroup) is NotFoundResult, "OCR is isolated by environment");
        var after = Ok(await anna.RunOcr("OC1", laterGroup));
        check(after.GetProperty("ocr").GetString() == "done" && after.GetProperty("document").GetProperty("indexStatus").GetString() == "ready", "OCR can be requested after the upload");
        check(Ok(await anna.Search("OC1", "ripetuto-dopo", null, null, null, null, false)).GetProperty("results").GetArrayLength() == 1, "Text from a later OCR becomes searchable");
        check(await anna.RunOcr("OC2", db.InitiativeDocuments.AsNoTracking().Single(d => d.FileName == "nota.txt").GroupId) is BadRequestObjectResult, "OCR is refused for files that are not images");
        check(Ok(await anna.History("OC1", laterGroup)).GetProperty("events").EnumerateArray().Any(e => e.GetProperty("action").GetString() == "ocr"), "OCR runs are recorded in the document history");
        var callsBefore = ocr.Calls;
        check(await anna.Upload("OC1", Files(File("schema.png", png)), null, new[] { "schema.png" }) is OkObjectResult && ocr.Calls == callsBefore, "A duplicate image is refused before any OCR work is done");
    }
}
