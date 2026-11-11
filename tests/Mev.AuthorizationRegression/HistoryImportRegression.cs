using System.Security.Claims;
using System.Text.Json;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

public class FakeExtractor : IKnowledgeExtractor
{
    public Func<ExtractionRequest, ExtractionResult?> Reply = _ => null;
    public List<ExtractionRequest> Seen = new();
    public bool Throw;
    public Task<ExtractionResult?> ExtractAsync(ExtractionRequest request, AppUserAiSettings settings)
    { Seen.Add(request); if (Throw) throw new InvalidOperationException("provider down"); return Task.FromResult(Reply(request)); }
}

public static class HistoryImportRegression
{
    static JsonElement J(object? value) => JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    static JsonElement Ok(IActionResult result) => result is OkObjectResult ok ? J(ok.Value) : throw new Exception("Expected 200, got " + result.GetType().Name + (result is ObjectResult o ? " " + J(o.Value) : ""));

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        // ---- the scanner: reports the rule and the line, never the value ----
        const string SecretToken = "ghp_" + "0123456789abcdefghijABCDEFGHIJ0123";
        bool Flags(string text, string file = "nota.md") => SecretScanner.Scan(file, text).Count > 0;
        check(Flags("Il token è " + SecretToken), "Scanner: GitHub token is found");
        check(Flags("oc login --token=sha256~" + new string('a', 30)), "Scanner: OpenShift token is found");
        check(Flags("Authorization: Bearer " + new string('x', 10) + "abcdefghijklmnop"), "Scanner: Bearer token is found");
        check(Flags("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk"), "Scanner: JWT is found");
        check(Flags("-----BEGIN RSA PRIVATE KEY-----"), "Scanner: private key is found");
        check(Flags("jdbc: postgres://utente:Segreta99@host/db"), "Scanner: URL with credentials is found");
        check(Flags("La password è `Qwerty!2026x`"), "Scanner: a password written in the text is found");
        check(Flags("pass:  Xk9#mLp2"), "Scanner: 'pass:' with a value is found");
        check(Flags("PGPASSWORD='Abc123xyz9' psql"), "Scanner: PGPASSWORD with a value is found");
        check(!Flags("Serve la password dell'utente, da chiedere a Poste."), "Scanner: talking about a password is not a hit");
        check(!Flags("password: <da chiedere>"), "Scanner: a placeholder is not a hit");
        check(!Flags("password: xxxxxxxx") && !Flags("password = ${DB_PASSWORD}") && !Flags("password: null"), "Scanner: masked values and variables are not hits");
        check(!Flags("Vedi [[reference-oc-login-token-ilp-sviluppo]] e feedback-ghe-pr-merge-via-api-no-ssh.md"), "Scanner: links to other notes are not a hit");
        check(!Flags("Causa: la proprietà camel.springboot.xmlRoutes è rimossa in Camel 4.18.0; commit 51b03f2"), "Scanner: a normal technical note is clean");
        var hit = SecretScanner.Scan("n.md", "riga uno\nIl token è " + SecretToken + "\n").Single(h => h.Rule == "token-github");
        check(hit.Line == 2 && !hit.ToString().Contains(SecretToken), "Scanner reports the line and never the value");
        check(Flags("host x " + "Ab1" + "Cd2Ef3Gh4Ij5Kl6", "reference-x-db-access.md"), "Scanner: a long mixed string in an access note is a hit");
        check(!Flags("host x " + "Ab1" + "Cd2Ef3Gh4Ij5Kl6", "ilp-nota-normale.md"), "Scanner: the same string in a normal note is not, by itself, a hit");

        var user = new AppUser { Username = "anna", FullName = "Anna Rossi", Role = "Developer", IsActive = true, AiApiKey = "k" };
        db.Users.Add(user); await db.SaveChangesAsync();
        var fake = new FakeExtractor();
        HistoryImportController As(string role, int environment = 1) => new(db, fake) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.Username), new Claim("fullName", user.FullName), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString()) }, "test")) } }
        };
        var anna = As("Developer");
        HistoryImportController.FileRequest File(string text, string name = "ilp-fix.md", string system = "ILP", string? goto_ = null) => new($"projects/-home-m/memory/{name}", name, text, system, goto_, "mfabbri");
        const string Clean = "Il servizio non caricava le route perché la proprietà era rimossa in Camel 4. La libreria item-core deve restare separata dall'app.";

        // ---- permissions and validation, before anything is stored ----
        check(await As("Client").ReadFile(File(Clean)) is ForbidResult, "History import forbids Client");
        check(await As("Bid Manager").ReadFile(File(Clean)) is ForbidResult, "Supervisor cannot import");
        check(await As("Developer", 0).ReadFile(File(Clean)) is ForbidResult, "History import requires an environment");
        check(await As("Bid Manager").Pending(null, null) is OkObjectResult, "Supervisor can read the pending list");
        check(await anna.ReadFile(File(Clean, "voce.txt")) is BadRequestObjectResult, "Only .md notes are accepted");
        check(await anna.ReadFile(File("   ")) is BadRequestObjectResult, "An empty note is rejected");
        check(await anna.ReadFile(File(Clean, system: "")) is BadRequestObjectResult, "The system is required");
        check(await anna.ReadFile(File(new string('a', HistoryImportController.MaxNoteChars + 1))) is BadRequestObjectResult, "An overlong note is rejected");
        check(await anna.ReadFile(File(Clean, goto_: "../x y")) is BadRequestObjectResult, "A malformed GOTO is rejected");
        check(!db.KnowledgeImportFiles.Any() && fake.Seen.Count == 0, "Rejected notes are neither stored nor sent to the AI");

        // ---- a note with a secret never reaches the AI and is not recorded as read ----
        fake.Reply = _ => new ExtractionResult(new() { new("razionale", "x") }, "m");
        var blocked = await anna.ReadFile(File("Accesso: il token è " + SecretToken));
        check(blocked is UnprocessableEntityObjectResult, "A note with a secret is refused");
        var blockedJson = J(((UnprocessableEntityObjectResult)blocked).Value);
        check(blockedJson.GetProperty("hits")[0].GetProperty("rule").GetString() == "token-github" && blockedJson.GetProperty("hits")[0].GetProperty("line").GetInt32() == 1, "The refusal says which rule and which line");
        check(!blockedJson.ToString().Contains(SecretToken), "The refusal never repeats the secret");
        check(fake.Seen.Count == 0, "A note with a secret is never sent to the AI");
        check(!db.KnowledgeImportFiles.Any() && !db.RationaleEntries.Any(e => e.SourceFile != null), "A note with a secret leaves no trace");

        // ---- normal reading: proposals only, with provenance ----
        fake.Reply = request => new ExtractionResult(new() { new("razionale", "Le route della libreria item-core non erano caricate perché la proprietà xmlRoutes è stata rimossa in Camel 4"), new("vincolo", "item-core deve restare separata dall'app"), new("decisione", "???"), new("boh", "tipo non valido") }, "modello-test");
        var read = Ok(await anna.ReadFile(File(Clean)));
        check(read.GetProperty("outcome").GetString() == "elaborato" && read.GetProperty("proposals").GetInt32() == 3 && read.GetProperty("dropped").GetInt32() == 1, "A normal note yields proposals and drops the invalid kind");
        check(fake.Seen.Single().System == "ILP" && fake.Seen.Single().Text == Clean, "The AI receives the system and the note text");
        var rows = db.RationaleEntries.Where(e => e.SourceFile != null).ToList();
        check(rows.All(e => e.Status == "proposta" && e.ByAi && e.DecidedAt == null), "Imported entries are proposals, never confirmed");
        check(rows.All(e => e.SourceFile == "projects/-home-m/memory/ilp-fix.md" && e.SourceSha!.Length == 64 && e.SourceAuthor == "mfabbri" && e.ImportedBy == "anna"), "Every entry carries file, hash, author and importer");
        check(rows.All(e => e.Goto == "storico-ilp" && e.SystemKey == "ilp" && e.AmbienteId == 1), "Without a GOTO the entries belong to the system bucket of the environment");
        check(db.KnowledgeImportFiles.Count() == 1 && db.KnowledgeImportFiles.Single().Proposals == 3, "The note is recorded as read with its result");

        // ---- the same content is never read twice, whatever its name ----
        var again = Ok(await anna.ReadFile(File(Clean, "altro-nome.md")));
        check(again.GetProperty("outcome").GetString() == "gia-letto" && fake.Seen.Count == 1 && db.RationaleEntries.Count(e => e.SourceFile != null) == 3, "The same content is not read twice, even under another name");
        var checkedHashes = Ok(await anna.Check(new(new() { HistoryImportController.Sha256Of(Clean.Replace("\r\n", "\n")), new string('a', 64), "not-a-hash" })));
        check(checkedHashes.GetProperty("known").GetArrayLength() == 1, "The browser can ask which notes are already known");

        // ---- GOTO in the text or chosen by the user: the entries follow the initiative ----
        fake.Reply = _ => new ExtractionResult(new() { new("vincolo", "Il PDF si salva con FileSaver come i dispacci") }, "m");
        Ok(await anna.ReadFile(File("Nota sulla conferma partenza 143247: salvataggio PDF.", "ilp-143247.md", "ILP", "143247")));
        check(db.RationaleEntries.Any(e => e.Goto == "143247" && e.GotoLabel == "143247" && e.SystemKey == "ilp"), "A note tied to a GOTO lands on that initiative");

        // ---- AI failures: nothing is recorded as read, so it can be retried ----
        fake.Throw = true;
        check(await anna.ReadFile(File("Altra nota tecnica sulla coda Kafka.", "ilp-b.md")) is ObjectResult { StatusCode: 502 }, "AI failure reports 502");
        fake.Throw = false; fake.Reply = _ => null;
        check(await anna.ReadFile(File("Altra nota tecnica sulla coda Kafka.", "ilp-b.md")) is ObjectResult { StatusCode: 502 }, "Unreadable AI answer reports 502");
        check(!db.KnowledgeImportFiles.Any(f => f.FileName == "ilp-b.md"), "A failed reading is not recorded as read");
        fake.Reply = _ => new ExtractionResult(new(), "m");
        check(Ok(await anna.ReadFile(File("Altra nota tecnica sulla coda Kafka.", "ilp-b.md"))).GetProperty("outcome").GetString() == "senza-voci", "A note without durable knowledge is recorded as read with no entries");

        // ---- the AI must not smuggle a secret into a proposal, nor duplicate a known one ----
        fake.Reply = _ => new ExtractionResult(new() { new("vincolo", "Usare la password `Qwerty!2026x` per il DB"), new("razionale", "le route della libreria item-core non erano caricate perché la proprietà xmlRoutes è stata rimossa in Camel 4"), new("vincolo", "Nuova regola unica sul retry") }, "m");
        var filtered = Ok(await anna.ReadFile(File("Nota diversa sul retry dei messaggi.", "ilp-c.md")));
        check(filtered.GetProperty("proposals").GetInt32() == 1 && filtered.GetProperty("dropped").GetInt32() == 2, "A proposal carrying a secret or repeating a known entry is dropped");
        check(!db.RationaleEntries.Any(e => e.Text.Contains("Qwerty")), "No secret reaches a stored proposal");

        // ---- decisions ----
        var pending = Ok(await anna.Pending(null, null));
        check(pending.GetProperty("total").GetInt32() == db.RationaleEntries.Count(e => e.Status == "proposta" && e.SourceFile != null && e.AmbienteId == 1) && pending.GetProperty("bySystem")[0].GetProperty("system").GetString() == "ilp", "Pending counts the history proposals by system");
        var ids = db.RationaleEntries.Where(e => e.Goto == "storico-ilp").Select(e => e.Id).Take(2).ToList();
        check(await As("Bid Manager").Decide(new(ids, "confermata")) is ForbidResult, "Supervisor cannot decide");
        check(await anna.Decide(new(ids, "boh")) is BadRequestObjectResult && await anna.Decide(new(new(), "confermata")) is BadRequestObjectResult, "Invalid or empty decisions are rejected");
        check(await anna.Decide(new(Enumerable.Range(1, HistoryImportController.MaxBulkDecision + 1).Select(i => (long)i).ToList(), "confermata")) is BadRequestObjectResult, "A decision on too many entries is refused");
        var decided = Ok(await anna.Decide(new(ids, "confermata")));
        check(decided.GetProperty("decided").GetInt32() == 2 && db.RationaleEntries.Where(e => ids.Contains(e.Id)).All(e => e.Status == "confermata" && e.DecidedBy == "anna"), "A person confirms entries and is recorded as the one who decided");
        check(Ok(await anna.Decide(new(ids, "scartata"))).GetProperty("skipped").GetInt32() == 2, "An already decided entry cannot be decided again");

        // an entry written in the app (no source file) is out of reach of this endpoint
        var manual = new RationaleEntry { AmbienteId = 1, Goto = "g9", GotoLabel = "g9", SystemKey = "ilp", Kind = "razionale", Text = "scritta a mano", Status = "proposta", CreatedBy = "anna", CreatedAt = DateTime.UtcNow };
        db.RationaleEntries.Add(manual); await db.SaveChangesAsync();
        check(Ok(await anna.Decide(new(new() { manual.Id }, "confermata"))).GetProperty("decided").GetInt32() == 0 && db.RationaleEntries.Single(e => e.Id == manual.Id).Status == "proposta", "Entries not coming from the history cannot be decided here");

        // ---- looking at what was imported: confirmed entries stay visible, searchable and filterable ----
        check(await As("Client").Entries("confermata", null, null, null, null) is ForbidResult, "Client cannot list imported entries");
        check(await anna.Entries("boh", null, null, null, null) is BadRequestObjectResult, "An unknown state is rejected");
        var confirmedList = Ok(await anna.Entries(null, null, null, null, null));
        check(confirmedList.GetProperty("status").GetString() == "confermata" && confirmedList.GetProperty("entries").EnumerateArray().All(e => e.GetProperty("status").GetString() == "confermata" && e.GetProperty("decidedBy").GetString() == "anna"), "The default list is the confirmed entries, with who confirmed them");
        check(confirmedList.GetProperty("total").GetInt32() == db.RationaleEntries.Count(e => e.AmbienteId == 1 && e.Status == "confermata" && e.SourceFile != null) && confirmedList.GetProperty("total").GetInt32() >= 2, "The total counts the confirmed history entries of the environment");
        check(confirmedList.GetProperty("entries").EnumerateArray().All(e => !string.IsNullOrEmpty(e.GetProperty("sourceFile").GetString())), "Every listed entry shows the note it came from");
        check(!confirmedList.GetProperty("entries").EnumerateArray().Any(e => e.GetProperty("id").GetInt64() == manual.Id), "What people wrote in the app is not listed among the imported entries");
        var firstKind = confirmedList.GetProperty("entries")[0].GetProperty("kind").GetString();
        var byKind = Ok(await anna.Entries("confermata", null, firstKind, null, null));
        check(byKind.GetProperty("entries").EnumerateArray().All(e => e.GetProperty("kind").GetString() == firstKind) && byKind.GetProperty("matching").GetInt32() <= confirmedList.GetProperty("total").GetInt32(), "The kind filter returns only that kind");
        check(Ok(await anna.Entries("confermata", "npso", null, null, null)).GetProperty("entries").GetArrayLength() == 0, "The system filter returns only that system");
        var searched = Ok(await anna.Entries("confermata", null, null, "ITEM-CORE", null));
        check(searched.GetProperty("matching").GetInt32() >= 1 && searched.GetProperty("entries").EnumerateArray().All(e => e.GetProperty("text").GetString()!.ToLower().Contains("item-core")), "The search is case-insensitive and matches the text");
        check(Ok(await anna.Entries("confermata", null, null, "ilp-fix", null)).GetProperty("matching").GetInt32() >= 1, "The search also matches the source note name");
        check(Ok(await anna.Entries("confermata", null, null, "zzz-nessuna", null)).GetProperty("matching").GetInt32() == 0, "A search with no match returns nothing");
        check(confirmedList.GetProperty("systems").EnumerateArray().Any(g => g.GetProperty("system").GetString() == "ilp"), "The system filters show only systems that exist, with counts");
        var toDiscard = db.RationaleEntries.Where(e => e.AmbienteId == 1 && e.SourceFile != null && e.Status == "proposta").Select(e => e.Id).Take(1).ToList();
        check(toDiscard.Count == 1 && Ok(await anna.Decide(new(toDiscard, "scartata"))).GetProperty("decided").GetInt32() == 1, "(setup) one entry is discarded");
        check(Ok(await anna.Entries("scartata", null, null, null, null)).GetProperty("entries").EnumerateArray().Any(e => e.GetProperty("id").GetInt64() == toDiscard[0]), "Discarded entries can be listed too");
        check(Ok(await As("Developer", 2).Entries("confermata", null, null, null, null)).GetProperty("total").GetInt32() == 0, "Another environment lists nothing");
        var firstId = confirmedList.GetProperty("entries")[0].GetProperty("id").GetInt64();
        var older = Ok(await anna.Entries("confermata", null, null, null, firstId));
        check(older.GetProperty("entries").GetArrayLength() == confirmedList.GetProperty("total").GetInt32() - 1 && !older.GetProperty("entries").EnumerateArray().Any(e => e.GetProperty("id").GetInt64() >= firstId), "The cursor returns exactly the entries older than the last one seen, none repeated");
        var ids2 = confirmedList.GetProperty("entries").EnumerateArray().Select(e => e.GetProperty("id").GetInt64()).ToList();
        check(ids2.SequenceEqual(ids2.OrderByDescending(x => x)), "The list is newest first");

        // ---- environments are isolated ----
        check(Ok(await As("Developer", 2).Pending(null, null)).GetProperty("total").GetInt32() == 0, "Another environment sees nothing");
        var otherEnv = db.RationaleEntries.Where(e => e.SourceFile != null && e.Status == "proposta").Select(e => e.Id).Take(1).ToList();
        check(Ok(await As("Developer", 2).Decide(new(otherEnv, "scartata"))).GetProperty("decided").GetInt32() == 0, "Another environment cannot decide this environment's entries");
        check(Ok(await As("Developer", 2).Check(new(new() { HistoryImportController.Sha256Of(Clean) }))).GetProperty("known").GetArrayLength() == 0, "Read notes are per environment");
        fake.Reply = _ => new ExtractionResult(new() { new("razionale", "Voce dell'altro ambiente") }, "m");
        check(Ok(await As("Developer", 2).ReadFile(File(Clean))).GetProperty("outcome").GetString() == "elaborato", "The same note can be read in another environment");

        // ---- confirmed history knowledge is what the other initiatives will see for the same system ----
        var related = Ok(await new RationaleController(db, new FakeAssistant()) { ControllerContext = anna.ControllerContext }.Related("ILP", "999"));
        check(related.GetArrayLength() >= 2, "Confirmed history knowledge is offered to other initiatives of the same system");
        var summary = Ok(await anna.Summary());
        check(summary.GetProperty("filesRead").GetInt32() >= 4 && summary.GetProperty("confirmed").GetInt32() == 2, "The summary counts notes read and entries confirmed");
    }
}
