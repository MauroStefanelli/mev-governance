using System.Security.Claims;
using System.Text.Json;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

public static class InitiativeLedgerRegression
{
    static JsonElement J(object? value) => JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    static JsonElement Ok(IActionResult result) => result is OkObjectResult ok ? J(ok.Value) : throw new Exception("Expected 200, got " + result.GetType().Name + (result is ObjectResult o ? " " + J(o.Value) : ""));
    static ImportRow Row(string? goto_, string title, string system, string status = "approvata", Action<ImportRow>? more = null) { var r = new ImportRow { Goto = goto_, Title = title, System = system, Status = status, PmPoste = "Sugamiele" }; more?.Invoke(r); return r; }
    static ImportRequest Request(string file, string? date, params ImportRow[] rows) => new(rows.ToList(), file, "abc", date);

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        // ---- identity ----
        check(InitiativeLedgerController.KeyOf("145999", "IPER/IPERSUITE", "Validazione itmatt outbound") == InitiativeLedgerController.KeyOf(" 145999 ", "iper/ipersuite", "validazione  ITMATT outbound"), "Identity ignores case, accents and spacing");
        check(InitiativeLedgerController.KeyOf("145999", "ILP", "X") != InitiativeLedgerController.KeyOf("145999", "BEP", "X"), "The same GOTO on two systems is two initiatives");
        check(InitiativeLedgerController.KeyOf("145999", "ILP", "A") != InitiativeLedgerController.KeyOf("145999", "ILP", "B"), "The same GOTO and system with two titles is two initiatives");
        check(InitiativeLedgerController.KeyOf("TBD", "BEP", "X") == InitiativeLedgerController.KeyOf(null, "BEP", "X") && InitiativeLedgerController.KeyOf("tbd", "BEP", "X") == InitiativeLedgerController.KeyOf("", "BEP", "X"), "An unassigned GOTO is one identity however it is written");
        check(InitiativeLedgerController.IsPlaceholder("TBD") && InitiativeLedgerController.IsPlaceholder("da assegnare") && !InitiativeLedgerController.IsPlaceholder("145999"), "Placeholder GOTO detection");

        // ---- validation: the server never trusts the browser ----
        check(InitiativeLedgerController.Validate(Row("1", "", "NPSO"), out _) != null, "A row without a title is refused");
        check(InitiativeLedgerController.Validate(Row("1", "A", "  "), out _) != null, "A row without a system is refused");
        check(InitiativeLedgerController.Validate(Row("1", "A", "NPSO", "inventato"), out _) != null, "An unknown status is refused");
        check(InitiativeLedgerController.Validate(Row("1", "A", "NPSO", "approvata", r => r.CollaudoDate = "05/11/2026"), out _) != null, "A date that is not ISO is refused");
        check(InitiativeLedgerController.Validate(Row("1", "A", "NPSO", "approvata", r => r.CollaudoDate = "2026-02-31"), out _) != null, "An impossible date is refused");
        check(InitiativeLedgerController.Validate(Row("TBD", "A", "NPSO"), out var cleanTbd) == null && cleanTbd.Goto == null, "TBD becomes no code, not the text TBD");
        check(InitiativeLedgerController.Validate(Row("1", new string('t', 900), "NPSO"), out var longRow) == null && longRow.Title.Length == 500, "An overlong title is cut, not rejected");
        check(InitiativeLedgerController.Validate(Row("1", "A", "NPSO", "approvata", r => r.Amounts = new() { new() { Text = "x", Value = double.NaN }, new() { Text = "15.493,18 €", Value = 15493.18 } }), out var amounts) == null && !amounts.AmountsJson!.Contains("NaN"), "Impossible amounts are dropped");

        var user = new AppUser { Username = "carla", FullName = "Carla Neri", Role = "Developer", IsActive = true };
        db.Users.Add(user); await db.SaveChangesAsync();
        InitiativeLedgerController As(string name, string role, int environment = 1) => new(db) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, name), new Claim("fullName", name.ToUpperInvariant() + " Rossi"), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString()) }, "test")) } }
        };
        var anna = As("anna", "Developer"); var luca = As("luca", "Admin"); var capo = As("capo", "Bid Manager");

        check(await As("x", "Client").List(null, null, null, null, null, false) is ForbidResult, "Ledger forbids Client");
        check(await As("x", "Developer", 0).List(null, null, null, null, null, false) is ForbidResult, "Ledger requires an environment");
        check(await capo.List(null, null, null, null, null, false) is OkObjectResult, "Supervisor can read the ledger");
        check(await capo.Import(Request("f.md", null, Row("1", "A", "NPSO"))) is ForbidResult, "Supervisor cannot import");
        check(await capo.Preview(Request("f.md", null, Row("1", "A", "NPSO"))) is ForbidResult, "Supervisor cannot preview an import");
        check(await capo.Create(new("1", "A", "NPSO", null, null, null, null, null)) is ForbidResult, "Supervisor cannot create");
        check(await anna.Import(new(new(), "f.md", "", null)) is BadRequestObjectResult, "An empty import is refused");
        check(await anna.Import(new(Enumerable.Range(0, InitiativeLedgerController.MaxRowsPerImport + 1).Select(i => Row(i.ToString(), "T" + i, "NPSO")).ToList(), "f.md", "", null)) is BadRequestObjectResult, "An oversized import is refused");
        check(await anna.Import(Request("f.md", "31/12/2026", Row("1", "A", "NPSO"))) is BadRequestObjectResult, "A file date that is not ISO is refused");

        // ---- first import ----
        var first = Request("STATO_20261111.md", "2026-11-11",
            Row("145999", "Validazione itmatt outbound", "IPER/IPERSUITE", "approvata", r => { r.Release = "R01.2027"; r.CollaudoDate = "2026-11-25"; r.Notes = "Dopo il PIP"; }),
            Row("145999", "varie add-on R11.2026-B", "IPER/IPERSUITE", "rilasciata", r => r.Release = "R11.2026"),
            Row("145999", "varie add-on R11.2026-B", "ILP", "rilasciata"),
            Row("TBD", "Gestione messaggi referral N99", "IPER/IPERSUITE", "in-approvazione", r => r.PlannedRelease = "R04.2027"),
            Row("146023", "EntryType 13", "NPSO", "in-analisi"),
            Row("145999", "Validazione itmatt outbound", "IPER/IPERSUITE", "approvata"));
        var preview = Ok(await anna.Preview(first));
        check(preview.GetProperty("created").GetInt32() == 5 && preview.GetProperty("skipped").GetInt32() == 1, "Preview counts new rows and the repeated one without writing anything");
        check(!db.LedgerInitiatives.Any(), "A preview never writes");
        check(preview.GetProperty("items").EnumerateArray().Any(i => i.GetProperty("reason").ValueKind == JsonValueKind.String && i.GetProperty("reason").GetString()!.Contains("ripetuta")), "A row repeated inside the file is reported with the reason");
        var run1 = Ok(await anna.Import(first));
        check(run1.GetProperty("created").GetInt32() == 5 && run1.GetProperty("skipped").GetInt32() == 1 && db.LedgerInitiatives.Count() == 5, "First import creates one initiative per identity");
        check(db.LedgerInitiatives.Count(i => i.Goto == "145999") == 3 && db.LedgerInitiatives.Count(i => i.Goto == "145999" && i.System == "IPER/IPERSUITE") == 2, "The same GOTO is kept as separate initiatives");
        check(db.LedgerInitiatives.Single(i => i.AmbienteId == 1 && i.Title.StartsWith("Gestione messaggi")).Goto == null, "An unassigned GOTO stays without a code");
        var itmatt = db.LedgerInitiatives.AsNoTracking().Single(i => i.AmbienteId == 1 && i.Title == "Validazione itmatt outbound");
        check(itmatt.CollaudoDate == new DateTime(2026, 11, 25, 0, 0, 0, DateTimeKind.Utc) && itmatt.Release == "R01.2027" && itmatt.CreatedBy == "anna" && itmatt.Revision == 1 && itmatt.SourceDate == new DateTime(2026, 11, 11, 0, 0, 0, DateTimeKind.Utc), "Values, author, revision and file date are stored");
        check(db.LedgerEvents.Count() == 5 && db.LedgerEvents.All(e => e.Kind == "import" && e.Actor == "anna"), "Every created initiative has an import event attributed on the server");

        // ---- idempotency ----
        var again = Ok(await anna.Import(first));
        check(again.GetProperty("created").GetInt32() == 0 && again.GetProperty("updated").GetInt32() == 0 && again.GetProperty("unchanged").GetInt32() == 5, "Importing the same file twice changes nothing");
        check(db.LedgerInitiatives.Count() == 5 && db.LedgerEvents.Count() == 5 && db.LedgerInitiatives.AsNoTracking().Single(i => i.AmbienteId == 1 && i.Title == "Validazione itmatt outbound").Revision == 1, "A repeated import adds no duplicates, no events and no revisions");
        check(db.LedgerImports.Count() == 2, "Each import run is recorded, even when it changes nothing");

        // ---- newer file ----
        var second = Request("STATO_20261120.md", "2026-11-20",
            Row("145999", "Validazione itmatt outbound", "IPER/IPERSUITE", "rilasciata", r => { r.Release = "R01.2027"; r.CollaudoDate = "2026-11-25"; r.Notes = "Rilasciata in collaudo"; }),
            Row("146023", "EntryType 13", "NPSO", "in-analisi", r => { r.PmPoste = null; r.Notes = null; }));
        var run2 = Ok(await anna.Import(second));
        check(run2.GetProperty("updated").GetInt32() == 1 && run2.GetProperty("unchanged").GetInt32() == 1, "A newer file updates only what changed");
        var moved = db.LedgerInitiatives.AsNoTracking().Single(i => i.AmbienteId == 1 && i.Title == "Validazione itmatt outbound");
        check(moved.Status == "rilasciata" && moved.Notes == "Rilasciata in collaudo" && moved.Revision == 2 && moved.SourceDate == new DateTime(2026, 11, 20, 0, 0, 0, DateTimeKind.Utc), "Status, note, revision and file date move forward");
        var statusEvent = db.LedgerEvents.AsNoTracking().Where(e => e.InitiativeId == moved.Id).OrderByDescending(e => e.Id).First();
        check(statusEvent.Kind == "stato" && statusEvent.Summary.Contains("Approvata → Rilasciata") && statusEvent.ChangesJson!.Contains("\"from\":\"approvata\""), "A status change is recorded with the old and the new value");
        check(db.LedgerInitiatives.AsNoTracking().Count() == 5, "Initiatives missing from the second file are untouched, not deleted");

        // ---- a field the file leaves empty never erases what is known ----
        check(db.LedgerInitiatives.AsNoTracking().Single(i => i.AmbienteId == 1 && i.Title == "EntryType 13").PmPoste == "Sugamiele", "An empty value in the file does not erase a known PM Poste");
        check(db.LedgerInitiatives.AsNoTracking().Single(i => i.AmbienteId == 1 && i.Title == "Validazione itmatt outbound").Release == "R01.2027", "An unchanged value stays");

        // ---- an older file never overwrites newer data ----
        var older = Request("STATO_20261105.md", "2026-11-05",
            Row("145999", "Validazione itmatt outbound", "IPER/IPERSUITE", "approvata", r => { r.Notes = "Testo vecchio"; r.PmPoste = "Altro"; r.PlannedRelease = "R04.2027"; }));
        var olderPreview = Ok(await anna.Preview(older));
        check(olderPreview.GetProperty("items")[0].GetProperty("stale").GetBoolean(), "The preview says when a file is older than the data held");
        Ok(await anna.Import(older));
        var afterOlder = db.LedgerInitiatives.AsNoTracking().Single(i => i.AmbienteId == 1 && i.Title == "Validazione itmatt outbound");
        check(afterOlder.Status == "rilasciata" && afterOlder.Notes == "Rilasciata in collaudo" && afterOlder.PmPoste == "Sugamiele", "An older file does not overwrite status, notes or PM");
        check(afterOlder.PlannedRelease == "R04.2027" && afterOlder.SourceDate == new DateTime(2026, 11, 20, 0, 0, 0, DateTimeKind.Utc), "An older file may fill an empty field but never moves the file date back");

        // ---- unassigned GOTO gets its real code ----
        var assigned = Ok(await anna.Import(Request("STATO_20261125.md", "2026-11-25", Row("147001", "Gestione messaggi referral N99", "IPER/IPERSUITE", "in-approvazione", r => r.PlannedRelease = "R04.2027"))));
        check(assigned.GetProperty("created").GetInt32() == 0 && assigned.GetProperty("updated").GetInt32() == 1, "The real GOTO updates the unassigned initiative instead of creating a second one");
        var promoted = db.LedgerInitiatives.AsNoTracking().Single(i => i.AmbienteId == 1 && i.Title.StartsWith("Gestione messaggi"));
        check(promoted.Goto == "147001" && promoted.Key == InitiativeLedgerController.KeyOf("147001", "IPER/IPERSUITE", "Gestione messaggi referral N99") && db.LedgerInitiatives.Count() == 5, "Its identity now carries the code");
        check(Ok(await anna.Import(Request("STATO_20261125.md", "2026-11-25", Row("147001", "Gestione messaggi referral N99", "IPER/IPERSUITE", "in-approvazione", r => r.PlannedRelease = "R04.2027")))).GetProperty("unchanged").GetInt32() == 1, "After the code arrives the same row is unchanged");

        // ---- isolation ----
        check(Ok(await As("anna", "Developer", 2).List(null, null, null, null, null, false)).GetProperty("total").GetInt32() == 0, "The ledger is isolated by environment");
        check(await As("anna", "Developer", 2).Detail(promoted.Id) is NotFoundResult, "A detail from another environment is not found");
        Ok(await As("anna", "Developer", 2).Import(Request("altro.md", "2026-11-01", Row("145999", "Validazione itmatt outbound", "IPER/IPERSUITE", "approvata"))));
        check(db.LedgerInitiatives.AsNoTracking().Count(i => i.AmbienteId == 2) == 1 && db.LedgerInitiatives.AsNoTracking().Count(i => i.AmbienteId == 1) == 5, "The same row in another environment is a separate initiative");
        check(await As("anna", "Developer", 2).Update(promoted.Id, new() { ExpectedRevision = promoted.Revision, Status = "approvata" }) is NotFoundResult, "An initiative of another environment cannot be edited");

        // ---- list, search, filters ----
        var all = Ok(await anna.List(null, null, null, null, null, false));
        check(all.GetProperty("total").GetInt32() == 5 && all.GetProperty("counts").GetProperty("rilasciata").GetInt32() == 3, "The list counts initiatives by status");
        check(all.GetProperty("initiatives")[0].GetProperty("status").GetString() == "rilasciata", "The list is ordered by status, released first");
        check(Ok(await anna.List("rilasciata", null, null, null, null, false)).GetProperty("shown").GetInt32() == 3, "Filter by status");
        check(Ok(await anna.List(null, "ilp", null, null, null, false)).GetProperty("shown").GetInt32() == 1, "Filter by system ignores case");
        check(Ok(await anna.List(null, null, "sugamiele", null, null, false)).GetProperty("shown").GetInt32() == 5, "Filter by PM Poste ignores case");
        check(Ok(await anna.List(null, null, null, "R04.2027", null, false)).GetProperty("shown").GetInt32() == 2, "Filter by release also matches the planned release (the older file filled one, the unassigned initiative has the other)");
        check(Ok(await anna.List(null, null, null, "R01.2027", null, false)).GetProperty("shown").GetInt32() == 1, "Filter by release matches the actual release");
        check(Ok(await anna.List(null, null, null, null, "referral", false)).GetProperty("shown").GetInt32() == 1, "Search finds a word in the title");
        check(Ok(await anna.List(null, null, null, null, "IPER 145999", false)).GetProperty("shown").GetInt32() == 2, "Search combines GOTO and system terms");
        check(Ok(await anna.List(null, null, null, null, "collaudo", false)).GetProperty("shown").GetInt32() >= 1, "Search also reads the notes");
        check(Ok(await anna.List(null, null, null, null, "parolaassente", false)).GetProperty("shown").GetInt32() == 0, "A search with no match returns nothing");
        check(Ok(await anna.List(null, null, null, null, null, false)).GetProperty("systems").GetArrayLength() == 3, "The list offers the systems present");

        // ---- editing with history ----
        var target = db.LedgerInitiatives.AsNoTracking().Single(i => i.AmbienteId == 1 && i.Title == "EntryType 13");
        check(await capo.Update(target.Id, new() { ExpectedRevision = target.Revision, Status = "approvata" }) is ForbidResult, "Supervisor cannot edit");
        check(await anna.Update(target.Id, new() { ExpectedRevision = target.Revision + 5, Status = "approvata" }) is ConflictObjectResult, "A stale revision is refused");
        check(await anna.Update(target.Id, new() { ExpectedRevision = target.Revision, Status = "inventato" }) is BadRequestObjectResult, "An invalid status in an edit is refused");
        var edited = Ok(await anna.Update(target.Id, new() { ExpectedRevision = target.Revision, Status = "approvata", Notes = "Approvata il 12/11", NotesProvided = true }));
        check(edited.GetProperty("initiative").GetProperty("status").GetString() == "approvata" && edited.GetProperty("initiative").GetProperty("revision").GetInt32() == target.Revision + 1, "An edit changes the status and moves the revision");
        var detail = Ok(await anna.Detail(target.Id));
        var last = detail.GetProperty("events")[0];
        check(last.GetProperty("kind").GetString() == "stato" && last.GetProperty("actor").GetString() == "anna" && last.GetProperty("summary").GetString()!.Contains("In analisi / stima → Approvata"), "The edit is in the history with who, when and old → new");
        check(await anna.Update(target.Id, new() { ExpectedRevision = target.Revision, Status = "rilasciata" }) is ConflictObjectResult, "Editing from the revision seen before is refused");
        var cleared = Ok(await anna.Update(target.Id, new() { ExpectedRevision = target.Revision + 1, Notes = "", NotesProvided = true }));
        check(cleared.GetProperty("initiative").GetProperty("notes").ValueKind == JsonValueKind.Null, "A person can empty a field on purpose");
        check(Ok(await anna.Update(target.Id, new() { ExpectedRevision = target.Revision + 2 })).GetProperty("unchanged").GetBoolean(), "An edit that changes nothing is reported as unchanged");
        check(db.LedgerEvents.AsNoTracking().Count(e => e.InitiativeId == target.Id) == 3, "An unchanged edit adds no history");
        check(await anna.Update(target.Id, new() { ExpectedRevision = target.Revision + 2, Title = "  " }) is BadRequestObjectResult, "A blank title in an edit is refused");
        check(db.LedgerInitiatives.AsNoTracking().Single(i => i.Id == target.Id).Title == "EntryType 13", "A refused edit leaves the title untouched");
        var renamed = Ok(await anna.Update(target.Id, new() { ExpectedRevision = target.Revision + 2, Title = "EntryType 13 - Fase 2" }));
        check(renamed.GetProperty("initiative").GetProperty("title").GetString() == "EntryType 13 - Fase 2" && renamed.GetProperty("initiative").GetProperty("key").GetString() == InitiativeLedgerController.KeyOf("146023", "NPSO", "EntryType 13 - Fase 2"), "Renaming moves the identity with the title");
        var ilp = db.LedgerInitiatives.AsNoTracking().First(i => i.AmbienteId == 1 && i.System == "ILP");
        check(await anna.Update(ilp.Id, new() { ExpectedRevision = ilp.Revision, Title = "Validazione itmatt outbound", Goto = "145999", GotoProvided = true }) is OkObjectResult, "Renaming onto a free identity on another system is allowed");
        var clash = db.LedgerInitiatives.AsNoTracking().Single(i => i.AmbienteId == 1 && i.Title == "Validazione itmatt outbound" && i.System == "IPER/IPERSUITE");
        check(await anna.Update(ilp.Id, new() { ExpectedRevision = ilp.Revision + 1, Title = clash.Title }) is OkObjectResult, "Same title on a different system never clashes");

        // ---- notes, creation, archive ----
        check(await anna.AddEvent(target.Id, new("nota", "  ")) is BadRequestObjectResult, "An empty note is refused");
        Ok(await anna.AddEvent(target.Id, new("attivita", "Stima consegnata a Poste")));
        check(Ok(await anna.Detail(target.Id)).GetProperty("events")[0].GetProperty("kind").GetString() == "attivita", "An activity is added to the history");
        check(await anna.AddEvent(99999, new("nota", "x")) is NotFoundResult, "A note on an unknown initiative is not found");
        check(await capo.AddEvent(target.Id, new("nota", "x")) is ForbidResult, "Supervisor cannot add to the history");
        var created = Ok(await anna.Create(new(null, "Nuova richiesta", "BEP", "Mollo", null, null, null, null)));
        check(created.GetProperty("initiative").GetProperty("gotoPlaceholder").GetBoolean() && created.GetProperty("initiative").GetProperty("status").GetString() == "in-analisi" && created.GetProperty("initiative").GetProperty("source").GetString() == "app", "A new initiative starts in analysis, without a code");
        check(await anna.Create(new(null, "Nuova richiesta", "BEP", null, null, null, null, null)) is ConflictObjectResult, "A duplicate identity cannot be created");
        check(await anna.Create(new("1", "", "BEP", null, null, null, null, null)) is BadRequestObjectResult, "Creation validates like the import");
        var arch = created.GetProperty("initiative").GetProperty("id").GetInt64();
        Ok(await anna.Archive(arch, new(true)));
        check(Ok(await anna.List(null, null, null, null, null, false)).GetProperty("initiatives").EnumerateArray().All(i => i.GetProperty("id").GetInt64() != arch), "An archived initiative leaves the list");
        check(Ok(await anna.List(null, null, null, null, null, true)).GetProperty("initiatives").EnumerateArray().Any(i => i.GetProperty("id").GetInt64() == arch), "The archive can be consulted");
        check(db.LedgerEvents.AsNoTracking().Count(e => e.InitiativeId == arch) == 2, "Archiving keeps and extends the history");
        Ok(await anna.Archive(arch, new(false)));
        check(Ok(await anna.List(null, null, null, null, null, false)).GetProperty("initiatives").EnumerateArray().Any(i => i.GetProperty("id").GetInt64() == arch), "An initiative can be restored");
        check(await capo.Archive(arch, new(true)) is ForbidResult, "Supervisor cannot archive");

        // ---- dates read back from the database keep their day, whatever kind the driver gives them ----
        foreach (var kind in new[] { DateTimeKind.Utc, DateTimeKind.Local, DateTimeKind.Unspecified })
        {
            var asRead = new LedgerInitiative { Title = "t", System = "s", Status = "approvata", CollaudoDate = new DateTime(2026, 11, 25, 0, 0, 0, kind), SourceDate = new DateTime(2026, 11, 25, 0, 0, 0, kind) };
            check(LedgerMerge.Date(asRead.CollaudoDate) == "2026-11-25", $"A {kind} date keeps its day when written as a string");
            check(LedgerExport.Markdown(new[] { asRead }, DateTime.UtcNow, null).Contains("| 25/11/2026 |"), $"A {kind} date keeps its day in the exported file");
        }
        check(LedgerMerge.Changes(new LedgerInitiative { Title = "t", System = "s", Status = "approvata", CollaudoDate = new DateTime(2026, 11, 25, 0, 0, 0, DateTimeKind.Unspecified) },
            new LedgerRow("k", null, "t", "s", null, "approvata", null, null, new DateTime(2026, 11, 25, 0, 0, 0, DateTimeKind.Utc), null, null, null, null, null)).Count == 0, "The same calendar date is not seen as a change just because its kind differs");

        // ---- export in the format that is imported ----
        var export = Ok(await anna.Export());
        var md = export.GetProperty("markdown").GetString()!;
        check(md.Contains("# Stato delle iniziative") && md.Contains("## 1. Rilasciate") && md.Contains("## 6. CR da stimare") && md.Contains("## 7. Riepilogo"), "The export has the same structure as the imported file");
        check(md.Contains("| TBD |") || md.Contains("| 147001 |"), "The export writes the code, or TBD when there is none");
        check(md.Contains("25/11/2026") && !md.Contains("24/11/2026"), "A calendar date is written the Italian way and never shifts by a day");
        check(export.GetProperty("count").GetInt32() == db.LedgerInitiatives.AsNoTracking().Count(i => i.AmbienteId == 1 && !i.Archived), "The export lists only the active initiatives of the environment");
        check(!md.Contains("Altro ambiente"), "The export never includes another environment");
    }
}
