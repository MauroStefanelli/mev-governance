using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

public class FakeInterventionAssistant : IInterventionAssistant
{
    public Func<string, JsonObject?> Reply = _ => null; public List<string> Seen = new(); public bool Cut; public bool Throw;
    public Task<(JsonObject? Answer, string Model, bool Cut)> ProposeAsync(string context, AppUserAiSettings settings)
    { Seen.Add(context); if (Throw) throw new HttpRequestException("down"); return Task.FromResult((Reply(context), "m", Cut)); }
}

public static class InterventionProposalsRegression
{
    static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();
    static JsonElement J(object? value) => JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    static JsonElement Ok(IActionResult result) => result is OkObjectResult ok ? J(ok.Value) : throw new Exception("Expected 200, got " + result.GetType().Name + (result is ObjectResult o ? " " + J(o.Value) : ""));

    // Two rows with the prices of the real catalogue of lot 2 (236 and 239), one priced only for REALIZZAZIONE Medio.
    static List<CatalogEntryIn> Catalog() => new()
    {
        new(236, "Realizzazione Single Page Application", "Frontend", "Realizza una SPA", new() { ["MODIFICA"] = new() { ["Semplice"] = 280, ["Medio"] = 840, ["Complesso"] = 1400 }, ["REALIZZAZIONE"] = new() { ["Semplice"] = 1200, ["Medio"] = 2800, ["Complesso"] = 4800 } }),
        new(239, "Servizio/API/Microservizio", "Backend", "Un servizio", new() { ["MODIFICA"] = new() { ["Semplice"] = 200, ["Medio"] = 600, ["Complesso"] = 1000 }, ["REALIZZAZIONE"] = new() { ["Semplice"] = 900, ["Medio"] = 2000, ["Complesso"] = 3600 } }),
        new(9001, "Voce solo realizzazione media", "Backend", "", new() { ["REALIZZAZIONE"] = new() { ["Medio"] = 1000 } }),
        new(9002, "Voce solo complessa", "Backend", "", new() { ["MODIFICA"] = new() { ["Complesso"] = 5000 } }),
    };

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        // ---------- the details of the catalogue the model reads: description of the driver, criteria per level, types; never prices ----------
        var withCriteria = new List<CatalogEntryIn>
        {
            new(241, "Realizzazione schema (DDL)", "Database", new string('d', 900), new() { ["REALIZZAZIONE"] = new() { ["Semplice"] = 500, ["Medio"] = 700, ["Complesso"] = 1200 }, ["MODIFICA"] = new() { ["Semplice"] = 70, ["Medio"] = 210, ["Complesso"] = 350 } },
                new() { ["Semplice"] = "Da 1 a 10 tabelle", ["Medio"] = "Da 11 a 30 tabelle", ["Complesso"] = "Più di 30 tabelle" }),
            new(453, "SAP Custom using Dialog (module pool)", "SAP", "d", new() { ["REALIZZAZIONE"] = new() { ["Medio"] = 1360 } }, new() { ["Semplice"] = "N.A.", ["Medio"] = "N.A.", ["Complesso"] = "n.a" }),
            new(9005, "Voce con un solo criterio", "Backend", "", new() { ["MODIFICA"] = new() { ["Semplice"] = 100, ["Medio"] = 200, ["Complesso"] = 300 } }, new() { ["Medio"] = new string('c', 900), ["Semplice"] = "  " }),
        };
        var forAi = JsonSerializer.Serialize(InterventionProposals.CatalogForAi(withCriteria), new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var forAiDoc = JsonDocument.Parse(forAi).RootElement;
        check(forAiDoc[0].GetProperty("criteri").GetProperty("Medio").GetString() == "Da 11 a 30 tabelle" && forAiDoc[0].GetProperty("criteri").GetProperty("Complesso").GetString() == "Più di 30 tabelle", "AI catalogue: the criteria of each complexity level are sent");
        check(forAiDoc[0].GetProperty("descrizione").GetString()!.Length == 700, "AI catalogue: the description of the driver is sent up to 700 characters (it was cut at 300)");
        check(forAiDoc[1].GetProperty("criteri").ValueKind == JsonValueKind.Null, "AI catalogue: a voice whose criteria are all «N.A.» has NO criteria (the model must not believe there is a rule)");
        check(forAiDoc[2].GetProperty("criteri").EnumerateObject().Count() == 1 && forAiDoc[2].GetProperty("criteri").GetProperty("Medio").GetString()!.Length == 420 && !forAiDoc[2].GetProperty("criteri").TryGetProperty("Semplice", out _), "AI catalogue: empty levels are left out and long criteria are cut at 420 characters");
        check(!forAi.Contains("\"prezzi\"") && !forAi.Contains("1200") && !forAi.Contains("1360") && !forAi.Contains("500"), "AI catalogue: no price is ever sent to the model");
        check(forAiDoc[1].GetProperty("tipi").EnumerateArray().Select(t => t.GetString()).SequenceEqual(new[] { "REALIZZAZIONE" }), "AI catalogue: the types with a price are listed (only REALIZZAZIONE for voice 453)");

        // ---------- the rules for type and complexity are in EVERY prompt that reads the catalogue ----------
        foreach (var (name, text) in new[] { ("proposals from the rationale", AiInterventionAssistant.Instructions), ("second opinion / review rules", InterventionProposalsRules.Text) })
        {
            check(text.Contains("REGOLE PER TIPO E COMPLESSITÀ") && text.Contains("MODIFICA se l'attività cambia qualcosa che esiste") && text.Contains("REALIZZAZIONE se nasce qualcosa che non esiste"), $"prompt ({name}): the rule for the TYPE (change what exists / create what is new)");
            check(text.Contains("livello PIÙ ALTO compatibile con i criteri e giustificabile dal testo") && text.Contains("Non salire di livello senza un elemento del criterio"), $"prompt ({name}): the rule for the COMPLEXITY (highest compatible and justified)");
            check(text.Contains("soglie numeriche") && text.Contains("non inventarli") && text.Contains("cita il criterio"), $"prompt ({name}): numeric thresholds, no invented criteria, the criterion is quoted");
        }
        check(AiInterventionAssistant.Instructions.Contains("CATALOGO INTERVENTI di Poste") && AiInterventionAssistant.Instructions.Contains("SOLO tra quelle del catalogo fornito"), "prompt (proposals): the voices are still chosen ONLY from the catalogue");
        var aiServiceSource = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "mev-governance-backend", "Services", "AiService.cs"));
        var reviewSource = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "mev-governance-backend", "Controllers", "ConfiguratoreAiController.cs"));
        check(aiServiceSource.Contains("InterventionProposalsRules.Text") && aiServiceSource.Contains("'criteria'"), "prompt (second opinion): it carries the shared rules and tells the model where the criteria are");
        check(reviewSource.Contains("InterventionProposalsRules.Text") && reviewSource.Contains("proponi in suggestion il tipo e il livello corretti"), "prompt (row review): it carries the shared rules and asks for the correct type and level in the suggestion");

        // ---------- the check of what the model answers ----------
        var good = Obj("{\"interventions\":[{\"title\":\"Adeguare la stampa H7\",\"description\":\"d\",\"activity\":\"a\",\"system\":\"ILP\",\"requirements\":\"r\",\"components\":[\"print-app\"],\"rationaleIds\":[1,2],\"mappings\":[{\"catalogId\":236,\"type\":\"realizzazione\",\"complexity\":\"complesso\",\"qty\":2,\"component\":\"frontend\",\"technology\":\"Angular\",\"why\":\"maschera\"}]}]}");
        var one = InterventionProposals.Check(good, Catalog());
        check(one.Accepted.Count == 1 && one.Accepted[0].Mappings.Count == 1, "A good proposal is accepted");
        check(one.Accepted[0].Mappings[0] is { CatalogId: 236, Name: "Realizzazione Single Page Application", Type: "REALIZZAZIONE", Complexity: "Complesso", Qty: 2, Unit: 4800, Correction: null }, "The row carries the REAL name and the REAL price of the catalogue");
        var pricey = InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"X\",\"mappings\":[{\"catalogId\":236,\"type\":\"MODIFICA\",\"complexity\":\"Medio\",\"qty\":1,\"unit\":1,\"price\":1,\"prezzo\":1}]}]}"), Catalog());
        check(pricey.Accepted[0].Mappings[0].Unit == 840, "A price written by the model is ignored: the price comes from the catalogue");
        var invented = InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"X\",\"mappings\":[{\"catalogId\":236,\"type\":\"MODIFICA\",\"complexity\":\"Medio\"},{\"catalogId\":55555,\"type\":\"MODIFICA\",\"complexity\":\"Medio\"},{\"type\":\"MODIFICA\"},{\"catalogId\":239,\"type\":\"DEMOLIZIONE\"}]}]}"), Catalog());
        check(invented.Accepted[0].Mappings.Select(m => m.CatalogId).SequenceEqual(new[] { 236 }) && invented.Accepted[0].RejectedMappings.Count == 3, "An invented catalogue id, a missing id and a wrong type are dropped and reported");
        check(invented.Accepted[0].RejectedMappings.Any(r => r.Contains("55555") && r.Contains("non esiste")), "The rejection names the id that does not exist");
        var unpriced = InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"X\",\"mappings\":[{\"catalogId\":9001,\"type\":\"MODIFICA\",\"complexity\":\"Medio\"}]}]}"), Catalog());
        check(unpriced.Accepted[0].Mappings.Count == 0 && unpriced.Accepted[0].RejectedMappings[0].Contains("non ha un prezzo per MODIFICA"), "A type the catalogue has no price for is refused");
        var corrected = InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"X\",\"mappings\":[{\"catalogId\":9001,\"type\":\"REALIZZAZIONE\",\"complexity\":\"Complesso\"}]}]}"), Catalog()).Accepted[0].Mappings[0];
        check(corrected.Complexity == "Medio" && corrected.Unit == 1000 && corrected.Correction!.Contains("non prevista"), "A complexity the catalogue does not price is corrected to one it prices, and the correction is reported");
        var onlyComplex = InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"X\",\"mappings\":[{\"catalogId\":9002,\"type\":\"MODIFICA\",\"complexity\":\"Semplice\"}]}]}"), Catalog()).Accepted[0].Mappings[0];
        check(onlyComplex.Complexity == "Complesso" && onlyComplex.Unit == 5000 && onlyComplex.Correction != null, "When the only complexity the catalogue prices is not Medio, the correction goes to THAT one with its price");
        check(InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"X\",\"mappings\":[{\"catalogId\":236,\"type\":\"MODIFICA\",\"complexity\":\"Medio\",\"qty\":0},{\"catalogId\":239,\"type\":\"MODIFICA\",\"complexity\":\"Medio\",\"qty\":99999},{\"catalogId\":9001,\"type\":\"REALIZZAZIONE\",\"complexity\":\"Medio\",\"qty\":\"abc\"}]}]}"), Catalog()).Accepted[0].Mappings.Select(m => m.Qty).SequenceEqual(new[] { 1, 999, 1 }), "Quantities are clamped between 1 and 999");
        check(InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"X\",\"mappings\":[{\"catalogId\":236,\"type\":\"MODIFICA\",\"complexity\":\"Medio\"},{\"catalogId\":236,\"type\":\"MODIFICA\",\"complexity\":\"Complesso\"},{\"catalogId\":236,\"type\":\"REALIZZAZIONE\",\"complexity\":\"Medio\"}]}]}"), Catalog()).Accepted[0].Mappings.Count == 2, "The same row twice for the same type is kept once; as MODIFICA and REALIZZAZIONE they are two");
        check(InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"  \"},{\"titolo\":\"\"}]}"), Catalog()).Rejected.Count == 2, "An intervention without a title is refused");
        var repeated = InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"Stampa\"},{\"title\":\"STAMPA\"},{\"title\":\"Già fatto\"}]}"), Catalog(), new[] { "già fatto" });
        check(repeated.Accepted.Select(i => i.Title).SequenceEqual(new[] { "Stampa" }) && repeated.Rejected.Count == 2 && repeated.Rejected.All(r => r.Reason == "già proposto"), "A title already proposed (also in the list given), whatever the case, is not proposed again");
        var many = "{\"interventions\":[" + string.Join(",", Enumerable.Range(0, 30).Select(i => "{\"title\":\"T" + i + "\"}")) + "]}";
        var limited = InterventionProposals.Check(Obj(many), Catalog());
        check(limited.Accepted.Count == InterventionProposals.MaxInterventions && limited.Notes.Count == 1, "At most 12 interventions are taken, and the user is told");
        check(InterventionProposals.Check(Obj("{\"foo\":1}"), Catalog()).Notes.Count == 1 && InterventionProposals.Check(null, Catalog()).Accepted.Count == 0, "An answer without the list gives nothing, with a note");
        check(InterventionProposals.Check(Obj("{\"interventi\":[{\"titolo\":\"Italiano\",\"mappings\":[{\"id\":\"239\",\"tipo\":\"modifica\",\"complessita\":\"Medio\",\"quantita\":3}]}]}"), Catalog()).Accepted[0].Mappings[0] is { CatalogId: 239, Type: "MODIFICA", Qty: 3, Unit: 600 }, "Italian keys and a string id are understood");
        var longText = InterventionProposals.Check(Obj("{\"interventions\":[{\"title\":\"" + new string('t', 400) + "\",\"description\":\"" + new string('d', 5000) + "\",\"components\":[" + string.Join(",", Enumerable.Range(0, 30).Select(i => "\"c" + i + "\"")) + "]}]}"), Catalog()).Accepted[0];
        check(longText.Title.Length == InterventionProposals.MaxTitle && longText.Description.Length == InterventionProposals.MaxText && longText.Components.Count == 10, "Texts and components are limited");
        // what the model is told about the catalogue: names, ambit, a short description and the types, NEVER the prices
        var told = JsonSerializer.Serialize(InterventionProposals.CatalogForAi(Catalog()));
        check(told.Contains("Realizzazione Single Page Application") && told.Contains("\"tipi\":[\"MODIFICA\",\"REALIZZAZIONE\"]") && !told.Contains("4800") && !told.Contains("840") && !told.Contains("prezzi"), "The model is told the catalogue without the prices, with the types each row is priced for");
        check(JsonSerializer.Serialize(InterventionProposals.CatalogForAi(Catalog())).Contains("\"tipi\":[\"REALIZZAZIONE\"]"), "A row priced for one type only is offered for that type only");
        check(AiInterventionAssistant.Instructions.Contains("SOLO tra quelle del catalogo") && AiInterventionAssistant.Instructions.Contains("Non inventare voci") && AiInterventionAssistant.Instructions.Contains("non li decidi tu"), "The instructions tell the model to choose only catalogue rows and not to decide prices");
        check(AiInterventionAssistant.Instructions.Contains("elenco vuoto") && AiInterventionAssistant.Instructions.Contains("Non riempire con interventi generici"), "The instructions tell the model to give an empty list when the rationale is not enough");

        // ---------- the endpoint ----------
        var user = new AppUser { Username = "anna2", FullName = "Anna Due", Role = "Developer", IsActive = true };
        var off = new AppUser { Username = "off", FullName = "Off", Role = "Developer", IsActive = false };
        db.Users.AddRange(user, off); await db.SaveChangesAsync();
        var fake = new FakeInterventionAssistant();
        InterventionProposalsController As(AppUser u, string role, int environment = 1) => new(db, fake)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.NameIdentifier, u.Id.ToString()), new Claim(ClaimTypes.Name, u.Username), new Claim("fullName", u.FullName), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString()) }, "test")) } }
        };
        ProposeRequest Req(string goto_ = "G9", List<CatalogEntryIn>? cat = null, string? focus = null) => new(goto_, "Stampa", "ILP", "descrizione", "2", cat ?? Catalog(), null, null, null, focus);
        check(await As(user, "Client").Propose(Req()) is ForbidResult, "Interventions: a Client cannot ask the AI");
        check(await As(user, "Bid Manager").Propose(Req()) is ForbidResult, "Interventions: a supervisor cannot ask the AI (it writes proposals)");
        check(await As(user, "Developer", 0).Propose(Req()) is ForbidResult, "Interventions: an environment is required");
        check(await As(off, "Developer").Propose(Req()) is ForbidResult, "Interventions: a deactivated user is refused");
        check(await As(user, "Developer").Propose(Req("")) is BadRequestObjectResult, "Interventions: an initiative is required");
        check(await As(user, "Developer").Propose(Req(cat: new())) is BadRequestObjectResult, "Interventions: without the catalogue of the lot nothing is asked");
        check(fake.Seen.Count == 0, "Nothing reached the AI so far");
        check(await As(user, "Developer").Propose(Req(focus: "usa questa chiave ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8")) is BadRequestObjectResult && fake.Seen.Count == 0, "A credential in the request is refused BEFORE it reaches the AI");

        // the rationale comes from the DATABASE, only confirmed, only of this initiative and environment
        db.RationaleEntries.AddRange(
            new RationaleEntry { AmbienteId = 1, Goto = "g9", GotoLabel = "G9", Kind = "vincolo", Text = "CONFERMATO uno", Status = "confermata", SystemKey = "ilp", CreatedBy = "anna2", CreatedAt = DateTime.UtcNow },
            new RationaleEntry { AmbienteId = 1, Goto = "g9", GotoLabel = "G9", Kind = "razionale", Text = "SOLO PROPOSTO due", Status = "proposta", SystemKey = "ilp", CreatedBy = "ai", ByAi = true, CreatedAt = DateTime.UtcNow },
            new RationaleEntry { AmbienteId = 1, Goto = "g9", GotoLabel = "G9", Kind = "razionale", Text = "SCARTATO tre", Status = "scartata", SystemKey = "ilp", CreatedBy = "ai", ByAi = true, CreatedAt = DateTime.UtcNow },
            new RationaleEntry { AmbienteId = 2, Goto = "g9", GotoLabel = "G9", Kind = "vincolo", Text = "ALTRO AMBIENTE quattro", Status = "confermata", SystemKey = "ilp", CreatedBy = "x", CreatedAt = DateTime.UtcNow },
            new RationaleEntry { AmbienteId = 1, Goto = "altra", GotoLabel = "Altra", Kind = "vincolo", Text = "ALTRA INIZIATIVA cinque", Status = "confermata", SystemKey = "ilp", CreatedBy = "x", CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        var confirmedId = db.RationaleEntries.Single(e => e.Text == "CONFERMATO uno").Id; var proposedId = db.RationaleEntries.Single(e => e.Text.StartsWith("SOLO PROPOSTO")).Id;
        fake.Reply = _ => Obj("{\"interventions\":[{\"title\":\"Nuovo intervento\",\"rationaleIds\":[" + confirmedId + "," + proposedId + ",99999],\"mappings\":[{\"catalogId\":236,\"type\":\"MODIFICA\",\"complexity\":\"Medio\",\"qty\":1},{\"catalogId\":77777,\"type\":\"MODIFICA\"}]}],\"missing\":[\"manca il flusso di conferma partenza\"]}");
        var applications = new List<ApplicationIn> { new("ILP", "ILP", null, new() { "Java" }, null, new() { "Kafka" }, null, null, new() { "ILP_BACKEND_print-app" }, 12, 5447, "riassunto", null) };
        var answer = Ok(await As(user, "Developer").Propose(new("G9", "Stampa H7", "ILP", "Consentire la stampa", "2", Catalog(), null, applications, new() { "Titolo già presente" }, "solo punto 1")));
        var sent = fake.Seen.Last();
        check(sent.Contains("CONFERMATO uno"), "The confirmed rationale of THIS initiative reaches the AI");
        check(!sent.Contains("SOLO PROPOSTO") && !sent.Contains("SCARTATO") && !sent.Contains("ALTRO AMBIENTE") && !sent.Contains("ALTRA INIZIATIVA"), "A proposal, a discarded entry, another environment and another initiative NEVER reach the AI");
        check(sent.Contains("ILP_BACKEND_print-app") && sent.Contains("Realizzazione Single Page Application") && JsonDocument.Parse(sent).RootElement.GetProperty("existingTitles")[0].GetString() == "Titolo già presente" && JsonDocument.Parse(sent).RootElement.GetProperty("focus").GetString() == "solo punto 1", "The applications, the catalogue, the titles to avoid and the focus reach the AI");
        check(!sent.Contains("4800") && !sent.Contains("\"prezzi\""), "No price of the catalogue reaches the AI");
        // the criteria of the voice (here read from the request, as the browser sends them) reach the AI through the real endpoint, and the «N.A.» ones do not
        var withCriteria2 = Catalog(); withCriteria2.Insert(0, new(241, "Realizzazione schema (DDL)", "Database", "Schema delle tabelle", new() { ["REALIZZAZIONE"] = new() { ["Medio"] = 700 } }, new() { ["Semplice"] = "Da 1 a 10 tabelle", ["Medio"] = "Da 11 a 30 tabelle", ["Complesso"] = "Più di 30 tabelle" }));
        withCriteria2.Insert(1, new(453, "SAP Custom", "SAP", "d", new() { ["REALIZZAZIONE"] = new() { ["Medio"] = 100 } }, new() { ["Semplice"] = "N.A.", ["Medio"] = "N.A.", ["Complesso"] = "N.A." }));
        Ok(await As(user, "Developer").Propose(new("G9", "Stampa H7", "ILP", "Consentire la stampa", "2", withCriteria2, null, applications, null, null)));
        var sentCriteria = JsonDocument.Parse(fake.Seen.Last()).RootElement.GetProperty("catalog");
        var schema = sentCriteria.EnumerateArray().Single(e => e.GetProperty("id").GetInt32() == 241); var sap = sentCriteria.EnumerateArray().Single(e => e.GetProperty("id").GetInt32() == 453);
        check(schema.GetProperty("criteri").GetProperty("Medio").GetString() == "Da 11 a 30 tabelle" && schema.GetProperty("criteri").GetProperty("Complesso").GetString() == "Più di 30 tabelle", "Interventions endpoint: the criteria per level reach the AI");
        check(sap.GetProperty("criteri").ValueKind == JsonValueKind.Null, "Interventions endpoint: a voice whose criteria are «N.A.» reaches the AI WITHOUT criteria");
        check(!fake.Seen.Last().Contains("\"prezzi\""), "Interventions endpoint: still no price reaches the AI");
        check(!sent.Contains("\"codeUrl\"") && !sent.Contains("notes"), "Nothing of the applications beyond their sheet reaches the AI");
        var item = answer.GetProperty("interventions")[0];
        check(item.GetProperty("mappings").GetArrayLength() == 1 && item.GetProperty("mappings")[0].GetProperty("unit").GetDecimal() == 840 && item.GetProperty("rejectedMappings").GetArrayLength() == 1, "The answer has the checked rows, with the catalogue price, and the rejected ones");
        check(item.GetProperty("rationaleIds").EnumerateArray().Select(e => e.GetInt64()).SequenceEqual(new[] { confirmedId }), "The rationale ids kept are only the CONFIRMED ones of this initiative (a proposed one and an unknown one are dropped)");
        check(answer.GetProperty("missing")[0].GetString() == "manca il flusso di conferma partenza" && answer.GetProperty("basedOn").GetProperty("confirmed").GetInt32() == 1 && answer.GetProperty("basedOn").GetProperty("applications").GetInt32() == 1, "The answer says what is missing and what it was based on");
        check(!answer.ToString().Contains("ghp_") && item.GetProperty("mappings").EnumerateArray().All(m => m.GetProperty("catalogId").GetInt32() != 77777) && item.GetProperty("rejectedMappings")[0].GetString()!.Contains("77777"), "A row the check dropped is NOT among the rows, and is named among the rejected ones");
        // failures
        fake.Reply = _ => null; check(await As(user, "Developer").Propose(Req()) is ObjectResult { StatusCode: 502 }, "An unreadable AI answer is a 502");
        fake.Reply = _ => Obj("{\"interventions\":[]}"); fake.Cut = true; fake.Reply = _ => null; check(J(((ObjectResult)await As(user, "Developer").Propose(Req())).Value).GetProperty("message").GetString()!.Contains("interrotto"), "An answer cut by the AI limit says so, and what to do");
        fake.Cut = false; fake.Throw = true; check(await As(user, "Developer").Propose(Req()) is ObjectResult { StatusCode: 502 }, "An AI that is down is a 502, not a crash"); fake.Throw = false;
        fake.Reply = _ => Obj("{\"interventions\":[{\"title\":\"Tagliato ma buono\"}]}"); fake.Cut = true;
        check(Ok(await As(user, "Developer").Propose(Req())).GetProperty("notes").EnumerateArray().Any(n => n.GetString()!.Contains("può essere incompleto")), "A list the AI cut is delivered with a warning that it may be incomplete"); fake.Cut = false;
        check(db.RationaleMessages.Count() == db.RationaleMessages.Count() && !db.RationaleEntries.Any(e => e.Text == "Nuovo intervento"), "Proposing interventions never writes anything to the rationale");
    }
}
