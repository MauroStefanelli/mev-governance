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
        var related = Ok(await anna.Related("NPSO", "G2"));
        check(related.GetArrayLength() == 2 && related.EnumerateArray().All(r => r.GetProperty("goto").GetString() == "g1"), "Related returns confirmed entries of other initiatives on the same system");
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
