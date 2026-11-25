using Microsoft.Extensions.Configuration;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

// A gateway that answers with a fixed body, and remembers what it was asked.
public class GatewayFactory : IHttpClientFactory
{
    readonly string body; readonly Action<string> seen;
    public GatewayFactory(string body, Action<string> seen) { this.body = body; this.seen = seen; }
    sealed class Handler : HttpMessageHandler
    {
        readonly string body; readonly Action<string> seen; public Handler(string body, Action<string> seen) { this.body = body; this.seen = seen; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        { seen(request.Content == null ? "" : await request.Content.ReadAsStringAsync(token)); return new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") }; }
    }
    public HttpClient CreateClient(string name) => new(new Handler(body, seen));
}

public class FakeAssistant : IRationaleAssistant
{
    public Func<AssistantRequest, AssistantResult?> Reply = _ => null;
    public List<AssistantRequest> Seen = new();
    public bool Throw;
    public Task<AssistantResult?> AskAsync(AssistantRequest request, AppUserAiSettings settings)
    { Seen.Add(request); if (Throw) throw new InvalidOperationException("provider down"); return Task.FromResult(Reply(request)); }
}

public static class RationaleRegression
{
    static JsonElement J(object? value) => JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    static JsonElement Ok(IActionResult result) => result is OkObjectResult ok ? J(ok.Value) : throw new Exception("Expected 200, got " + result.GetType().Name + (result is ObjectResult o ? " " + J(o.Value) : ""));

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        // Response normalizer: presentation only, never invents entries.
        static JsonObject Obj(string json) => JsonNode.Parse(json)!.AsObject();
        var plain = RationaleResponse.Normalize(Obj("{\"answer\":\"Serve la modifica X\",\"proposals\":[{\"kind\":\"vincolo\",\"text\":\"Nessun cambio al DB\"},{\"kind\":\"???\",\"text\":\"scartata\"},{\"kind\":\"razionale\",\"text\":\"\"}],\"questions\":[\"Chi approva?\"]}"));
        check(plain != null && plain.Proposals.Count == 1 && plain.Proposals[0].Kind == "vincolo", "Normalizer keeps only valid kinds with text");
        check(plain!.Questions.SequenceEqual(new[] { "Chi approva?" }), "Normalizer keeps open questions");
        var nested = RationaleResponse.Normalize(Obj("{\"analysis\":{\"risposta\":\"ok\",\"proposte\":[{\"tipo\":\"Vincoli\",\"testo\":\"Solo ambiente TEST\",\"intervento\":\"I1\"}]}}"));
        check(nested != null && nested.Proposals[0].Kind == "vincolo" && nested.Proposals[0].InterventionId == "I1", "Normalizer accepts wrapped Italian keys");
        check(RationaleResponse.Normalize(Obj("{\"proposals\":[{\"kind\":\"vincolo\",\"text\":\"x\"}]}")) == null, "Normalizer never fabricates an answer");
        check(RationaleResponse.Normalize(Obj("{\"answer\":\"a\",\"proposals\":[{\"kind\":\"razionale\",\"text\":\"Uguale\"},{\"kind\":\"vincolo\",\"text\":\"uguale\"}]}"))!.Proposals.Count == 1, "Normalizer drops duplicate proposals");
        check(RationaleResponse.Normalize(Obj("{\"answer\":\"a\",\"proposals\":[{\"kind\":\"razionale\",\"text\":\"" + new string('z', 900) + "\"}]}"))!.Proposals[0].Text.Length <= RationaleResponse.MaxEntryLength + 1, "Normalizer bounds entry length");
        var many = string.Join(",", Enumerable.Range(0, 20).Select(i => "{\"kind\":\"razionale\",\"text\":\"voce " + i + "\"}"));
        check(RationaleResponse.Normalize(Obj("{\"answer\":\"a\",\"proposals\":[" + many + "]}"))!.Proposals.Count == RationaleResponse.MaxEntries, "Normalizer bounds the number of proposals");

        var user = new AppUser { Username = "anna", FullName = "Anna Rossi", Role = "Developer", IsActive = true };
        var other = new AppUser { Username = "luca", FullName = "Luca Verdi", Role = "Admin", IsActive = true };
        db.Users.AddRange(user, other); await db.SaveChangesAsync();
        var fake = new FakeAssistant();
        RationaleController As(AppUser u, string role, int environment = 1) => new(db, fake) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.NameIdentifier, u.Id.ToString()), new Claim(ClaimTypes.Name, u.Username), new Claim("fullName", u.FullName), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString()) }, "test")) } }
        };
        var anna = As(user, "Developer"); var luca = As(other, "Admin");

        check(await As(user, "Client").Load("G1", null, 100) is ForbidResult, "Rationale forbids Client");
        check(await As(user, "Developer", 0).Load("G1", null, 100) is ForbidResult, "Rationale requires an environment");
        check(await As(user, "Bid Manager").Load("G1", null, 100) is OkObjectResult, "Supervisor can read the rationale");
        check(await As(user, "Bid Manager").Ask(new("G1", "ciao", null, null, null, null)) is ForbidResult, "Supervisor cannot ask the AI");
        check(await As(user, "Bid Manager").Add(new("G1", "vincolo", "x", null, null)) is ForbidResult, "Supervisor cannot add entries");
        check(await anna.Load("", null, 100) is BadRequestObjectResult, "Rationale requires an initiative");

        // Validation happens before anything is stored.
        check(await anna.Ask(new("G1", "   ", null, null, null, null)) is BadRequestObjectResult, "Empty question rejected");
        check(await anna.Ask(new("G1", new string('a', RationaleController.MaxQuestion + 1), null, null, null, null)) is BadRequestObjectResult, "Overlong question rejected");
        check(!db.RationaleMessages.Any(), "Rejected questions are not stored");

        // AI unavailable: the user's message is kept, nothing else is created.
        fake.Throw = true;
        check(await anna.Ask(new("G1", "Perché serve?", "Invio", "NPSO", "", null)) is ObjectResult { StatusCode: 502 }, "AI failure reports 502");
        check(db.RationaleMessages.Count() == 1 && db.RationaleMessages.Single().Role == "user", "User question survives an AI failure");
        fake.Throw = false; fake.Reply = _ => null;
        check(await anna.Ask(new("G1", "Riprovo", null, "NPSO", null, null)) is ObjectResult { StatusCode: 502 }, "Unreadable AI answer reports 502");
        check(db.RationaleEntries.Count() == 0, "No entry is created from an unreadable answer");

        // Normal answer: the AI proposes, nothing is confirmed.
        fake.Reply = request => new AssistantResult(new RationaleReply("Serve l'idempotenza.", new() { new("razionale", "Il servizio può ricevere la stessa prenotazione più volte", "OTT-4"), new("vincolo", "Nessuna modifica allo schema SAPLES", null) }, new() { "Chi gestisce i duplicati?" }), "modello-test");
        var asked = Ok(await anna.Ask(new("G1", "Perché serve l'idempotenza?", "Invio prenotazione", "NPSO", "desc", new() { new("OTT-4", "Invio") })));
        check(asked.GetProperty("answer").GetProperty("role").GetString() == "assistant" && asked.GetProperty("question").GetProperty("mine").GetBoolean(), "Answer and question are stored with their roles");
        check(asked.GetProperty("proposals").GetArrayLength() == 2 && asked.GetProperty("proposals").EnumerateArray().All(p => p.GetProperty("status").GetString() == "proposta" && p.GetProperty("byAi").GetBoolean()), "AI entries start as proposals, never confirmed");
        check(db.RationaleEntries.All(e => e.SystemKey == "npso" && e.Goto == "g1"), "Entries carry the normalized system and initiative");
        check(fake.Seen.Last().Context.Contains("Perché serve l'idempotenza?") || fake.Seen.Last().Question.Contains("idempotenza"), "The assistant receives the question");
        check(!fake.Seen.Last().Context.Contains("Il servizio può ricevere"), "Unconfirmed proposals are not fed back to the AI as facts");

        // Re-proposing the same text never duplicates.
        Ok(await anna.Ask(new("G1", "E quindi?", null, "NPSO", null, null)));
        check(db.RationaleEntries.Count() == 2, "A repeated proposal does not duplicate the entry");

        // Lifecycle.
        var entries = Ok(await anna.Load("G1", null, 100)).GetProperty("entries");
        var first = entries[0].GetProperty("id").GetInt64(); var second = entries[1].GetProperty("id").GetInt64();
        check(Ok(await anna.Load("G1", null, 100)).GetProperty("messages").GetArrayLength() == 6, "Whole conversation is retained");
        check(await As(user, "Bid Manager").Decide(first, new("confermata", null)) is ForbidResult, "Supervisor cannot confirm");
        check(await anna.Decide(first, new("revocata", null)) is ConflictObjectResult, "A proposal cannot be revoked");
        check(await anna.Decide(first, new("confermata", "   ")) is BadRequestObjectResult, "Edited text cannot be empty");
        var confirmed = Ok(await anna.Decide(first, new("confermata", "Il servizio può ricevere due volte la stessa prenotazione (duplicati)")));
        check(confirmed.GetProperty("status").GetString() == "confermata" && confirmed.GetProperty("decidedBy").GetString() == "anna" && confirmed.GetProperty("text").GetString()!.Contains("(duplicati)"), "Confirming records who decided and keeps the refined text");
        check(await anna.Decide(first, new("scartata", null)) is ConflictObjectResult, "A confirmed entry cannot be discarded");
        check(await anna.Decide(second, new("scartata", null)) is OkObjectResult, "A proposal can be discarded");
        check(await anna.Decide(second, new("confermata", null)) is ConflictObjectResult, "A discarded entry cannot come back");
        check(await As(user, "Developer", 2).Decide(first, new("revocata", null)) is NotFoundResult, "Decisions are isolated by environment");
        check(await anna.Decide(99999, new("confermata", null)) is NotFoundResult, "Unknown entry is not found");

        // Only confirmed knowledge feeds the next AI question and the shared endpoints.
        await anna.Ask(new("G1", "Altro dubbio", null, "NPSO", null, null));
        check(fake.Seen.Last().Context.Contains("due volte la stessa prenotazione"), "Confirmed knowledge is given to the AI");
        // ---- attachments: excerpts of the user's own source code and pasted data, checked again on the server ----
        fake.Reply = _ => new AssistantResult(new RationaleReply("Ho letto gli estratti.", new(), new()), "m");
        var good = new AttachmentIn("sorgente", "src/main/java/Servizio.java", "public class Servizio { void invia() { retry(3); } }", 10, 12);
        var data = new AttachmentIn("dati", "Risultato query (incollato)", "ID;STATO\n1;OK\n2;KO", null, null);
        var withSecret = new AttachmentIn("sorgente", "config/Db.java", "String url = \"jdbc:postgresql://u:SuperSegreta99@host/db\";", 1, 1);
        var sent = Ok(await anna.Ask(new("G1", "Come funziona l'invio?", "Invio", "NPSO", "", null, new() { good, data, withSecret })));
        var seenContext = fake.Seen.Last().Context;
        check(seenContext.Contains("retry(3)") && seenContext.Contains("1;OK"), "Source excerpts and pasted data reach the AI as attachments");
        check(!seenContext.Contains("SuperSegreta99") && !seenContext.Contains("jdbc:postgresql"), "An attachment with a secret is NEVER sent to the AI");
        var att = sent.GetProperty("attachments");
        check(att.GetProperty("sent").GetArrayLength() == 2 && att.GetProperty("dropped").GetArrayLength() == 1, "The answer says what was sent and what was dropped");
        check(att.GetProperty("dropped")[0].GetProperty("name").GetString() == "config/Db.java" && att.GetProperty("dropped")[0].GetProperty("line").GetInt32() == 1, "The dropped item is named with the line, never with its content");
        check(!att.ToString().Contains("SuperSegreta99"), "The reply never repeats the secret");
        check(!db.RationaleMessages.Any(m => m.Text.Contains("retry(3)") || m.Text.Contains("SuperSegreta99")), "Attachments are not stored in the conversation");
        Ok(await anna.Ask(new("G1", "Senza allegati", null, null, null, null)));
        check(!fake.Seen.Last().Context.Contains("retry(3)"), "A question without attachments carries none: they are not remembered from the previous one");
        var manyFiles = Enumerable.Range(0, 12).Select(i => new AttachmentIn("sorgente", $"a{i}.java", "class A {}", null, null)).ToList();
        var capped = Ok(await anna.Ask(new("G1", "Troppi", null, null, null, null, manyFiles))).GetProperty("attachments");
        check(capped.GetProperty("sent").GetArrayLength() == Attachments.MaxItems && capped.GetProperty("notes").GetArrayLength() >= 1, "Only the first 8 attachments are used, and the user is told");
        var bad = Ok(await anna.Ask(new("G1", "Allegati sbagliati", null, null, null, null, new() { new("script", "x.js", "a", null, null), new("sorgente", "../../etc/passwd", "root", null, null), new("sorgente", "/abs/x.java", "a", null, null), new("sorgente", "ok.java", "   ", null, null) }))).GetProperty("attachments");
        check(bad.GetProperty("sent").GetArrayLength() == 0 && bad.GetProperty("dropped").GetArrayLength() == 4, "Invalid kind, path traversal, absolute path and empty text are all refused");
        var big = Ok(await anna.Ask(new("G1", "Grande", null, null, null, null, new() { new("sorgente", "Grande.java", new string('x', 9000), null, null) }))).GetProperty("attachments");
        check(big.GetProperty("sent").GetArrayLength() == 1 && fake.Seen.Last().Context.Length < 9000 && big.GetProperty("notes").GetArrayLength() == 1, "An oversized excerpt is shortened and the user is told");
        var total = Enumerable.Range(0, 8).Select(i => new AttachmentIn("sorgente", $"f{i}.java", new string('y', 3900), null, null)).ToList();
        var capTotal = Ok(await anna.Ask(new("G1", "Totale", null, null, null, null, total))).GetProperty("attachments");
        check(capTotal.GetProperty("sent").GetArrayLength() == 5 && capTotal.GetProperty("dropped").GetArrayLength() == 3, "The total size of the attachments is capped (20.000 characters)");
        // ---- the applications chosen for the initiative: their technical sheet reaches the AI, never their code, and is checked like everything that comes from the browser ----
        var components = new List<string> { "ILP_frontend", "ILP_BACKEND_item-service", "ILP_BACKEND_hu-transport-app", "ILP_BACKEND_print-app" };
        var ilp = new ApplicationIn("ILP", "ILP", new() { "ILP" }, new() { "Java", "TypeScript" }, new() { "PostgreSQL" }, new() { "REST HTTP", "Kafka" }, new() { "Web UI" }, new() { "Docker" }, components, 12, 5447, "ILP è un applicativo basato su Java.",
            new() { new("ILP_frontend", 1), new("ILP_BACKEND_item-service", 2), new("ILP_BACKEND_hu-transport-app", 0) });
        Ok(await anna.Ask(new("G1", "Dove si decide la stampa H7?", "Stampa", "ILP", "", null, null, new() { ilp })));
        var appContext = JsonDocument.Parse(fake.Seen.Last().Context).RootElement;
        var apps = appContext.GetProperty("applications");
        check(apps.GetArrayLength() == 1 && apps[0].GetProperty("name").GetString() == "ILP", "The applications chosen for the initiative reach the AI (so it knows WHICH system is being analysed)");
        check(apps[0].GetProperty("technologies").GetArrayLength() == 2 && apps[0].GetProperty("integrations").GetArrayLength() == 2 && apps[0].GetProperty("totalComponents").GetInt32() == 12 && apps[0].GetProperty("totalFiles").GetInt32() == 5447, "The technical sheet reaches the AI: technologies, integrations, real number of components and files");
        var withHere = apps[0].GetProperty("componentsWithFilesHere").EnumerateArray().Select(e => e.GetString()).ToList(); var withoutHere = apps[0].GetProperty("componentsWithoutFilesHere").EnumerateArray().Select(e => e.GetString()).ToList();
        check(withHere.SequenceEqual(new[] { "ILP_frontend", "ILP_BACKEND_item-service" }), "The AI is told which components have files here");
        check(withoutHere.SequenceEqual(new[] { "ILP_BACKEND_hu-transport-app", "ILP_BACKEND_print-app" }), "The AI is told which components have NO file here (listed with zero files, or not listed at all)");
        check(appContext.GetProperty("notice").GetString()!.Contains("NON contengono codice"), "The AI is told that the applications carry no code");
        check(AiRationaleAssistant.Instructions.Contains("'applications'") && AiRationaleAssistant.Instructions.Contains("componentsWithoutFilesHere") && AiRationaleAssistant.Instructions.Contains("ipotesi"), "The instructions tell the AI to use the applications, to say what it has not verified and to ask for the missing component");
        check(AiRationaleAssistant.Instructions.Contains("non dire che il sistema non ti è stato indicato"), "The instructions tell the AI not to claim that the system was not given when applications are present");
        check(AiRationaleAssistant.Instructions.Contains("se non c'è un estratto che la mostri, la regola non è verificata e va presentata come ipotesi"), "The instructions tell the AI that a code rule with no excerpt showing it is unverified and must be presented as a hypothesis");
        check(AiRationaleAssistant.Instructions.Contains("chiedi di caricarne la cartella"), "The instructions tell the AI to ask for the folder of a component it has no files for");
        Ok(await anna.Ask(new("G1", "Senza applicativi", null, null, null, null)));
        check(JsonDocument.Parse(fake.Seen.Last().Context).RootElement.GetProperty("applications").GetArrayLength() == 0, "A question without applications carries none");
        var notesApp = Applications.Check(new[] { new ApplicationIn("Secret", "S", null, new() { "Java", "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8", "Spring" }, null, null, null, null, new() { "C1" }, 1, 0, "token ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8", null) });
        check(notesApp.Kept.Count == 1 && notesApp.Kept[0].Technologies.SequenceEqual(new[] { "Java", "Spring" }) && notesApp.Kept[0].Summary == "" && notesApp.Notes.Count == 2, "A credential in an application sheet is dropped (the item, or the description) and the rest is kept");
        check(!JsonSerializer.Serialize(notesApp.Kept).Contains("ghp_"), "A credential in an application sheet never reaches the AI");
        var manyApps = Applications.Check(Enumerable.Range(0, 7).Select(i => new ApplicationIn("A" + i, null, null, null, null, null, null, null, null, null, null, null, null)).ToList());
        check(manyApps.Kept.Count == Applications.MaxApplications && manyApps.Notes.Count == 1, "At most four applications are used, and the user is told");
        var huge = Applications.Check(new[] { new ApplicationIn(new string('N', 500), new string('C', 500), Enumerable.Range(0, 50).Select(i => "alias" + i).ToList(), Enumerable.Range(0, 100).Select(i => "t" + i).ToList(), null, null, null, null,
            Enumerable.Range(0, 300).Select(i => "comp" + i).ToList(), 9_999_999, -5, new string('s', 5000), null) });
        check(huge.Kept[0].Name.Length == 80 && huge.Kept[0].Code.Length == 40 && huge.Kept[0].Aliases.Count == 8 && huge.Kept[0].Technologies.Count == 20 && huge.Kept[0].Components.Count == 40 && huge.Kept[0].Summary.Length == 400, "Sizes are limited, so a huge sheet cannot flood the question");
        check(huge.Kept[0].TotalComponents == 10000 && huge.Kept[0].TotalFiles == 0, "The counts are clamped to sensible values");
        check(Applications.Check(new[] { new ApplicationIn("   ", null, null, null, null, null, null, null, null, null, null, null, null), new ApplicationIn("Bad\u0007Name", null, null, null, null, null, null, null, null, null, null, null, null) }).Kept.Count == 0, "An application with a blank name or a control character in it is ignored");
        check(Applications.Check(null).Kept.Count == 0, "No applications at all is fine");
        var dup = Applications.Check(new[] { new ApplicationIn("X", null, null, new() { "Java", "java", "JAVA", "Go" }, null, null, null, null, null, null, null, null, null) });
        check(dup.Kept[0].Technologies.SequenceEqual(new[] { "Java", "Go" }), "The same label is not repeated whatever the case");
        // ---- long answers: never cut in the middle of a word without saying so ----
        string Sentence(int n) => $"Frase numero {n} della risposta lunga con impatto sul processo e sui dati. ";
        var long12k = string.Concat(Enumerable.Range(1, 160).Select(Sentence));
        check(long12k.Length > 10000 && long12k.Length < RationaleResponse.MaxAnswerLength, "the test answer is longer than the old 6.000 limit and shorter than the new one");
        var kept = RationaleResponse.Normalize(Obj("{\"answer\":" + JsonSerializer.Serialize(long12k) + "}"))!;
        check(kept.Answer == long12k.Trim(), "An answer longer than 6.000 characters is kept WHOLE (it used to be cut at exactly 6.000, in the middle of a word)");
        var veryLong = string.Concat(Enumerable.Range(1, 400).Select(Sentence));
        var clipped = RationaleResponse.Normalize(Obj("{\"answer\":" + JsonSerializer.Serialize(veryLong) + "}"))!.Answer;
        check(clipped.Length < veryLong.Length && clipped.Contains("Risposta accorciata") && clipped.TrimEnd().EndsWith("caratteri."), "Beyond the limit the answer is shortened AND says so, never silently");
        check(clipped.Split("\n\n⚠")[0].TrimEnd().EndsWith("."), "The shortened answer ends at the end of a sentence, not in the middle of a word");
        check(RationaleResponse.Normalize(Obj("{\"answer\":\"Breve.\"}"))!.Answer == "Breve.", "A short answer is untouched");
        // the model itself stopped (finish_reason length): the gateway shapes
        check(AiService.WasCutByTokenLimit(Obj("{\"choices\":[{\"finish_reason\":\"length\"}]}")), "finish_reason 'length' is recognised as an interrupted answer");
        check(AiService.WasCutByTokenLimit(Obj("{\"choices\":[{\"finish_reason\":\"max_tokens\"}]}")), "finish_reason 'max_tokens' is recognised too");
        check(AiService.WasCutByTokenLimit(Obj("{\"status\":\"incomplete\",\"incomplete_details\":{\"reason\":\"max_output_tokens\"}}")), "A 'responses' style incomplete answer is recognised");
        check(!AiService.WasCutByTokenLimit(Obj("{\"choices\":[{\"finish_reason\":\"stop\"}]}")) && !AiService.WasCutByTokenLimit(Obj("{}")) && !AiService.WasCutByTokenLimit(Obj("{\"choices\":[]}")) && !AiService.WasCutByTokenLimit(Obj("{\"status\":\"completed\"}")), "A normal ending, or a shape that is not known, is never taken for an interruption");
        // the JSON itself was left half-written: what was already written is kept
        var halfJson = "{\"answer\":\"Impatto sul processo.\\nLe modifiche toccano la stampa \\\"H7\\\" e la partenza HU. Rischi principali: una deroga troppo ampia potrebbe autorizzare operazioni non previste; una diversa risolu";
        var rec = RationaleResponse.Recover(Obj("{\"error\":\"x\",\"rawText\":" + JsonSerializer.Serialize(halfJson) + "}"));
        check(rec != null && rec.Answer.StartsWith("Impatto sul processo.\nLe modifiche toccano la stampa \"H7\" e la partenza HU.") && rec.Answer.EndsWith("una diversa risolu"), "A half-written JSON gives back the text already written, with its line breaks and quotes decoded");
        check(rec!.Proposals.Count == 0, "Recovering a half-written answer never invents proposals");
        check(RationaleResponse.Recover(Obj("{\"rawText\":\"testo senza json\"}")) == null && RationaleResponse.Recover(Obj("{}")) == null, "Nothing to recover gives nothing");
        // the whole path with the assistant: the notice reaches the user
        var cutOk = new JsonObject { ["answer"] = "Prima parte.", ["proposals"] = new JsonArray(), ["questions"] = new JsonArray(), [AiService.CutFlag] = true };
        check(RationaleResponse.CutNotice.Contains("Risposta interrotta") && RationaleResponse.CutNotice.Contains("continua"), "The interruption notice tells what happened and what to do");
        check(AiRationaleAssistant.Instructions.Contains("9.000 caratteri") && AiRationaleAssistant.Instructions.Contains("è meglio una risposta completa su una parte che una risposta tagliata su tutte"), "The instructions tell the AI its space is limited and to prefer a complete part to a cut whole");
        check(cutOk[AiService.CutFlag]!.GetValue<bool>(), "the flag the assistant reads is the one the service writes");
        // ---- the whole path with the REAL assistant and a simulated gateway: an answer cut by the model reaches the user whole up to the cut, with a notice ----
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["AI_ENDPOINT"] = "https://api.openai.com/v1/chat/completions", ["AI_MODEL"] = "m", ["AI_API_KEY"] = "k" }).Build();
        string? lastPayload = null;
        AiRationaleAssistant Real(string gatewayBody) => new(new AiService(cfg, new GatewayFactory(gatewayBody, p => lastPayload = p)));
        static string Quote(string text) => JsonSerializer.Serialize(text);
        AssistantRequest req = new("G1", "analizza", "{}");
        var s = new AppUserAiSettings("k", "https://api.openai.com/v1/chat/completions", "m", "chat_completions", "bearer");
        var cutHalf = JsonSerializer.Serialize(new { choices = new[] { new { finish_reason = "length", message = new { content = "{" + Quote("answer") + ":" + Quote("Impatto sul processo. Rischi principali: una diversa risolu") } } }, model = "m" });
        var r1 = await Real(cutHalf).AskAsync(req, s);
        check(r1 != null && r1.Reply.Answer.StartsWith("Impatto sul processo. Rischi principali: una diversa risolu") && r1.Reply.Answer.Contains("Risposta interrotta"), "REAL PATH: a model stopped in the middle of the JSON still gives the user what it had written, followed by a notice (it used to give an error)");
        check(r1!.Reply.Proposals.Count == 0 && r1.Reply.Questions.Count == 0, "REAL PATH: an interrupted answer carries no proposals");
        var cutWhole = JsonSerializer.Serialize(new { choices = new[] { new { finish_reason = "length", message = new { content = "{" + Quote("answer") + ":" + Quote("Risposta completa nel JSON ma il modello si e' fermato.") + ",\"proposals\":[],\"questions\":[]}" } } }, model = "m" });
        var r2 = await Real(cutWhole).AskAsync(req, s);
        check(r2 != null && r2.Reply.Answer.StartsWith("Risposta completa nel JSON") && r2.Reply.Answer.Contains("Risposta interrotta"), "REAL PATH: a model that hit its limit is reported even when the JSON closed correctly");
        var fine = JsonSerializer.Serialize(new { choices = new[] { new { finish_reason = "stop", message = new { content = "{" + Quote("answer") + ":" + Quote("Tutto a posto.") + ",\"proposals\":[],\"questions\":[]}" } } }, model = "m" });
        var r3 = await Real(fine).AskAsync(req, s);
        check(r3 != null && r3.Reply.Answer == "Tutto a posto." && !r3.Reply.Answer.Contains("interrotta"), "REAL PATH: a normal answer is delivered as it is, with no notice");
        var garbage = JsonSerializer.Serialize(new { choices = new[] { new { finish_reason = "stop", message = new { content = "non e' json" } } }, model = "m" });
        check(await Real(garbage).AskAsync(req, s) == null, "REAL PATH: text that is not an answer and was NOT cut by the limit is still an error (it is not passed off as an answer)");
        var brokenNotCut = JsonSerializer.Serialize(new { choices = new[] { new { finish_reason = "stop", message = new { content = "{" + Quote("answer") + ":" + Quote("Mi fermo qui senza chiudere il json") } } }, model = "m" });
        check(await Real(brokenNotCut).AskAsync(req, s) == null, "REAL PATH: a half-written JSON from a model that says it FINISHED (finish_reason stop) is an error, not a recovered answer: only a declared interruption is trusted");
        var oneLong = "{\"answer\":" + JsonSerializer.Serialize(string.Concat(Enumerable.Range(1, 160).Select(Sentence))) + ",\"proposals\":[],\"questions\":[]}";
        var r4 = await Real(JsonSerializer.Serialize(new { choices = new[] { new { finish_reason = "stop", message = new { content = oneLong } } }, model = "m" })).AskAsync(req, s);
        check(r4 != null && r4.Reply.Answer.Length > 10000 && !r4.Reply.Answer.Contains("accorciata"), "REAL PATH: a 12.000 character answer arrives whole");
        check(await As(user, "Bid Manager").Ask(new("G1", "ciao", null, null, null, null, new() { good })) is ForbidResult, "A supervisor still cannot ask, with or without attachments");

        check(!fake.Seen.Last().Context.Contains("Nessuna modifica allo schema SAPLES"), "Discarded or proposed entries are not given to the AI");
        check(Ok(await anna.Confirmed("g1")).GetArrayLength() == 1, "Confirmed endpoint returns only confirmed entries");
        check(Ok(await As(user, "Developer", 2).Confirmed("G1")).GetArrayLength() == 0, "Confirmed knowledge is isolated by environment");

        // Manual entries are confirmed at once and not duplicated.
        var manual = Ok(await luca.Add(new("G1", "decisione", "Si usa la coda esistente", "OTT-4", "NPSO")));
        check(manual.GetProperty("status").GetString() == "confermata" && !manual.GetProperty("byAi").GetBoolean() && manual.GetProperty("createdBy").GetString() == "luca", "A person's entry is confirmed and attributed by the server");
        check(await luca.Add(new("G1", "decisione", "  si usa la coda esistente ", null, null)) is ConflictObjectResult, "A duplicate manual entry is rejected");
        check(await luca.Add(new("G1", "altro", "x", null, null)) is BadRequestObjectResult, "Unknown entry kind rejected");
        check(await luca.Add(new("G1", "vincolo", new string('v', RationaleController.MaxEntryText + 1), null, null)) is BadRequestObjectResult, "Overlong entry rejected");

        // Inheritance: same system, other initiative, confirmed only, copied as a proposal with its source.
        Ok(await anna.Ask(new("G2", "Nuova iniziativa", "Altra", "NPSO", null, null)));
        // NOTHING is offered to other initiatives until a person SHARES it: being confirmed in its own initiative is not enough.
        check(Ok(await anna.Related("NPSO", "G2")).GetArrayLength() == 0, "Related offers NOTHING that nobody shared (a confirmed entry stays in its own initiative)");
        var confirmedIds = Ok(await anna.Confirmed("g1")).EnumerateArray().Select(r => r.GetProperty("id").GetInt64()).ToList();
        foreach (var id in confirmedIds) Ok(await anna.Share(id));
        var related = Ok(await anna.Related("NPSO", "G2"));
        check(related.GetArrayLength() == 2 && related.EnumerateArray().All(r => r.GetProperty("goto").GetString() == "g1" && r.GetProperty("shared").GetBoolean()), "Related returns the SHARED confirmed entries of other initiatives on the same system");
        check(Ok(await anna.Related("NPSO", "G1")).GetArrayLength() == 0, "Related excludes the current initiative");
        check(Ok(await anna.Related("IPER", "G2")).GetArrayLength() == 0, "Related is limited to the same system");
        check(Ok(await anna.Related("  ", "G2")).GetArrayLength() == 0, "Related without a system returns nothing");
        check(Ok(await As(user, "Developer", 2).Related("NPSO", "G2")).GetArrayLength() == 0, "Related is isolated by environment");
        var sourceId = related[0].GetProperty("id").GetInt64();
        var inherited = Ok(await anna.Inherit(sourceId, new("G2", "NPSO")));
        check(inherited.GetProperty("status").GetString() == "proposta" && inherited.GetProperty("sourceEntryId").GetInt64() == sourceId && inherited.GetProperty("goto").GetString() == "g2", "Inherited entry is a proposal that keeps its source");
        check(await anna.Inherit(sourceId, new("G2", "NPSO")) is ConflictObjectResult, "The same entry cannot be taken twice");
        check(await anna.Inherit(sourceId, new("G1", "NPSO")) is BadRequestObjectResult, "An entry cannot be copied onto its own initiative");
        check(await anna.Inherit(second, new("G2", "NPSO")) is NotFoundResult, "A discarded entry cannot be inherited");
        check(await As(user, "Developer", 2).Inherit(sourceId, new("G2", "NPSO")) is NotFoundResult, "Inheritance is isolated by environment");
        check((await db.RationaleEntries.SingleAsync(e => e.Id == sourceId)).Goto == "g1", "Inheriting leaves the original entry untouched");

        // ---- SHARE: an explicit decision per entry, with its own rules ----
        var shareable = Ok(await luca.Add(new("G1", "decisione", "Per i resi si usa il batch notturno", "OTT-9", "NPSO"))).GetProperty("id").GetInt64();
        check(Ok(await anna.Related("NPSO", "G2")).EnumerateArray().All(r => r.GetProperty("id").GetInt64() != shareable), "A new confirmed entry is NOT shared by itself");
        var shared = Ok(await anna.Share(shareable));
        check(shared.GetProperty("shared").GetBoolean() && shared.GetProperty("sharedBy").GetString() == "anna" && shared.GetProperty("sharedAt").ValueKind != JsonValueKind.Null, "Sharing records who shared it and when (attributed by the server)");
        check(Ok(await anna.Related("NPSO", "G2")).EnumerateArray().Any(r => r.GetProperty("id").GetInt64() == shareable), "A shared entry is offered to another initiative of the same system");
        check(Ok(await anna.Related("IPER", "G2")).GetArrayLength() == 0, "A shared entry is NOT offered on another system");
        check(Ok(await As(user, "Developer", 2).Related("NPSO", "G2")).GetArrayLength() == 0, "A shared entry is NOT offered in another environment");
        check(await As(user, "Developer", 2).Share(shareable) is NotFoundResult, "Another environment cannot share (or even see) the entry");
        check(await As(user, "Bid Manager").Share(shareable) is ForbidResult && await As(user, "Client").Share(shareable) is ForbidResult, "A supervisor or a Client cannot share");
        check(await anna.Share(99999) is NotFoundResult, "Sharing an unknown entry is not found");
        var proposal = db.RationaleEntries.Add(new RationaleEntry { AmbienteId = 1, Goto = "g1", Kind = "razionale", Text = "solo proposta", Status = "proposta", SystemKey = "npso", CreatedBy = "x", CreatedAt = DateTime.UtcNow }); await db.SaveChangesAsync();
        check(await anna.Share(proposal.Entity.Id) is ConflictObjectResult, "A PROPOSAL cannot be shared: only a confirmed entry");
        var noSystem = db.RationaleEntries.Add(new RationaleEntry { AmbienteId = 1, Goto = "g1", Kind = "razionale", Text = "senza sistema", Status = "confermata", SystemKey = "", CreatedBy = "x", CreatedAt = DateTime.UtcNow }); await db.SaveChangesAsync();
        check(await anna.Share(noSystem.Entity.Id) is ConflictObjectResult, "An entry without a system cannot be shared: the other initiatives find it by system");
        var fromHistory = db.RationaleEntries.Add(new RationaleEntry { AmbienteId = 1, Goto = "g1", Kind = "razionale", Text = "da storico", Status = "confermata", SystemKey = "npso", SourceFile = "ilp-note.md", CreatedBy = "x", CreatedAt = DateTime.UtcNow }); await db.SaveChangesAsync();
        check(await anna.Share(fromHistory.Entity.Id) is ConflictObjectResult, "An entry that came from the history import is already knowledge: it is not shared again");
        check(Ok(await anna.Share(shareable)).GetProperty("shared").GetBoolean() && db.RationaleEntries.Count(e => e.Id == shareable && e.Shared) == 1, "Sharing twice changes nothing");
        var sharedList = Ok(await anna.SharedList(null, null, null));
        check(sharedList.GetProperty("matching").GetInt32() == confirmedIds.Count + 1 && sharedList.GetProperty("entries").EnumerateArray().All(e => e.GetProperty("entry").GetProperty("shared").GetBoolean()), "The shared list has only shared, confirmed entries");
        check(sharedList.GetProperty("systems")[0].GetProperty("system").GetString() == "npso", "The shared list offers the systems to filter by");
        check(Ok(await anna.SharedList(null, "batch notturno", null)).GetProperty("matching").GetInt32() == 1 && Ok(await anna.SharedList("iper", null, null)).GetProperty("matching").GetInt32() == 0, "The shared list can be searched and filtered by system");
        check(Ok(await As(user, "Developer", 2).SharedList(null, null, null)).GetProperty("matching").GetInt32() == 0, "The shared list is isolated by environment");
        // taken by other initiatives: the count that shows the knowledge is really reused
        Ok(await anna.Inherit(shareable, new("G2", "NPSO")));
        check(Ok(await anna.SharedList(null, "batch notturno", null)).GetProperty("entries")[0].GetProperty("takenBy").GetInt32() == 1, "The shared list says how many initiatives took an entry");
        // unshare
        var unshared = Ok(await anna.Unshare(shareable));
        check(!unshared.GetProperty("shared").GetBoolean() && unshared.GetProperty("sharedBy").ValueKind == JsonValueKind.Null, "Unsharing clears the share");
        check(Ok(await anna.Related("NPSO", "G2")).EnumerateArray().All(r => r.GetProperty("id").GetInt64() != shareable), "An entry that is no longer shared is no longer offered");
        check(db.RationaleEntries.Single(e => e.Id == shareable).Status == "confermata" && Ok(await anna.Confirmed("G1")).EnumerateArray().Any(r => r.GetProperty("id").GetInt64() == shareable), "…but it stays confirmed in its own initiative");
        check(await As(user, "Client").Unshare(shareable) is ForbidResult, "A Client cannot unshare");
        Ok(await anna.Share(shareable));
        // a revoked entry stops being shared knowledge
        await anna.Decide(shareable, new("revocata", null));
        check(Ok(await anna.SharedList(null, "batch notturno", null)).GetProperty("matching").GetInt32() == 0 && Ok(await anna.Related("NPSO", "G2")).EnumerateArray().All(r => r.GetProperty("id").GetInt64() != shareable), "A REVOKED entry leaves the shared knowledge");
        // le voci di prova della condivisione (e quella ripresa da G2) vengono tolte: il resto del test conta le voci di G1 e non deve vederle
        foreach (var id in db.RationaleEntries.Where(e => e.Id == proposal.Entity.Id || e.Id == noSystem.Entity.Id || e.Id == fromHistory.Entity.Id || e.Id == shareable || e.SourceEntryId == shareable).Select(e => e.Id).ToList()) db.RationaleEntries.Remove(db.RationaleEntries.Single(e => e.Id == id));
        await db.SaveChangesAsync();

        // Revoked knowledge stops being shared.
        await anna.Decide(first, new("revocata", null));
        check(Ok(await anna.Related("NPSO", "G2")).EnumerateArray().All(r => r.GetProperty("id").GetInt64() != first), "A revoked entry is no longer offered to other initiatives");
        check(Ok(await anna.Confirmed("G1")).EnumerateArray().All(r => r.GetProperty("id").GetInt64() != first), "A revoked entry is no longer used");

        // Pagination and summary.
        for (var i = 0; i < 5; i++) db.RationaleMessages.Add(new RationaleMessage { AmbienteId = 1, Goto = "pag", Role = "user", Author = "anna", CreatedAt = DateTime.UtcNow, Text = "m" + i });
        await db.SaveChangesAsync();
        var page = Ok(await anna.Load("PAG", null, 3));
        check(page.GetProperty("messages").GetArrayLength() == 3 && page.GetProperty("hasMore").GetBoolean() && page.GetProperty("messages")[2].GetProperty("text").GetString() == "m4", "Rationale history is paginated from the newest");
        var older = Ok(await anna.Load("PAG", page.GetProperty("messages")[0].GetProperty("id").GetInt64(), 100));
        check(older.GetProperty("messages").GetArrayLength() == 2 && !older.GetProperty("hasMore").GetBoolean() && older.GetProperty("entries").GetArrayLength() == 0, "Older page continues without gaps and skips the entries");
        var summary = Ok(await anna.Summary()).EnumerateArray().Single(s => s.GetProperty("goto").GetString() == "g1");
        check(summary.GetProperty("confirmed").GetInt32() == 1 && summary.GetProperty("proposed").GetInt32() == 2, "Summary counts only active confirmed and proposed entries");
        check(db.RationaleEntries.Count(e => e.Goto == "g1" && e.Status == "scartata") == 1 && db.RationaleEntries.Count(e => e.Goto == "g1" && e.Status == "revocata") == 1, "Discarded and revoked entries are kept as history, not counted");
    }
}
