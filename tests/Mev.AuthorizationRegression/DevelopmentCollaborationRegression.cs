using System.Security.Claims;
using System.Text.Json;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

public static class DevelopmentCollaborationRegression
{
    static JsonElement J(object? value) => JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    static JsonElement Ok(IActionResult result) => result is OkObjectResult ok ? J(ok.Value) : throw new Exception("Expected 200, got " + result.GetType().Name);

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        DevelopmentCollaborationController As(string user, string role, int environment = 1) => new(db) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.Name, user), new Claim("fullName", user.ToUpperInvariant() + " Rossi"), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString())
            }, "test")) } }
        };
        var anna = As("anna", "Developer"); var luca = As("luca", "Admin");

        check(await As("cliente", "Client").Summary() is ForbidResult, "Development collaboration forbids Client");
        check(await As("capo", "Bid Manager").Presence(new("GOTO-D", null)) is ForbidResult, "Supervisor cannot join development presence");
        check(await As("anna", "Developer", 0).Presence(new("GOTO-D", null)) is ForbidResult, "Development collaboration requires an environment");
        check(await anna.Presence(new("  ", null)) is BadRequestObjectResult, "Presence requires an initiative");
        check(await anna.Presence(new(new string('x', 121), null)) is BadRequestObjectResult, "Presence rejects overlong initiative code");

        // Presence: both users appear, each seeing who they are.
        await anna.Presence(new("GOTO-D", null));
        var seen = Ok(await luca.Presence(new("goto-d", null)));
        check(seen.GetProperty("users").GetArrayLength() == 2, "Both connected users are listed");
        check(seen.GetProperty("users").EnumerateArray().Count(u => u.GetProperty("isMe").GetBoolean()) == 1, "Each user sees which entry is themselves");
        check(db.DevelopmentPresences.Count(p => p.Goto == "goto-d") == 2, "Initiative code is case-insensitive: one row per user");
        await luca.Presence(new("GOTO-D", null));
        check(db.DevelopmentPresences.Count(p => p.Goto == "goto-d") == 2, "Repeated heartbeat does not duplicate the row");

        // Stale presence disappears.
        var stale = await db.DevelopmentPresences.SingleAsync(p => p.Username == "luca");
        stale.LastSeenAt = DateTime.UtcNow - TimeSpan.FromMinutes(5); await db.SaveChangesAsync();
        check(Ok(await anna.Presence(new("GOTO-D", null))).GetProperty("users").GetArrayLength() == 1, "A user silent beyond the window is no longer shown as connected");

        // Environments are isolated.
        check(Ok(await As("anna", "Developer", 2).Presence(new("GOTO-D", null))).GetProperty("users").GetArrayLength() == 1, "Presence is isolated by environment");

        // Last worker: only an explicit save counts, not mere connection.
        check(Ok(await anna.Presence(new("GOTO-D", null))).GetProperty("lastWorked").ValueKind == JsonValueKind.Null, "Connecting is not working");
        await luca.Worked(new("GOTO-D"));
        var worked = Ok(await anna.Presence(new("GOTO-D", null))).GetProperty("lastWorked");
        check(worked.GetProperty("by").GetString() == "luca" && !worked.GetProperty("isMe").GetBoolean(), "Last worker is the user who saved");
        await Task.Delay(15); await anna.Worked(new("GOTO-D"));
        check(Ok(await luca.Presence(new("GOTO-D", null))).GetProperty("lastWorked").GetProperty("by").GetString() == "anna", "Last worker updates to the latest saver");
        check(await anna.Worked(new("")) is BadRequestObjectResult, "Worked requires an initiative");

        // Leaving removes the user from the connected list immediately, keeping history.
        await luca.Presence(new("GOTO-D", null));
        check(Ok(await anna.Presence(new("GOTO-D", null))).GetProperty("users").GetArrayLength() == 2, "Second user connected again");
        await luca.Leave(new("GOTO-D"));
        check(Ok(await anna.Presence(new("GOTO-D", null))).GetProperty("users").GetArrayLength() == 1, "Leaving removes the user from connected users");
        check(Ok(await luca.Leave(new("NEVER-OPENED"))).GetProperty("left").GetBoolean() == false, "Leaving an unopened initiative creates nothing");
        check(!db.DevelopmentPresences.Any(p => p.Goto == "never-opened"), "Leave never creates a presence row");

        // Chat: validated, attributed by the server, ordered, isolated, paginated.
        check(await anna.Send(new("GOTO-D", "   ")) is BadRequestObjectResult, "Empty chat message rejected");
        check(await anna.Send(new("GOTO-D", new string('a', DevelopmentCollaborationController.MaxMessageLength + 1))) is BadRequestObjectResult, "Overlong chat message rejected");
        check(await anna.Send(new("", "ciao")) is BadRequestObjectResult, "Chat requires an initiative");
        check(await As("cliente", "Client").Send(new("GOTO-D", "ciao")) is ForbidResult, "Client cannot chat");
        var first = Ok(await anna.Send(new("GOTO-D", "  Sto guardando la scheda 3  ")));
        check(first.GetProperty("text").GetString() == "Sto guardando la scheda 3" && first.GetProperty("author").GetString() == "anna", "Chat message is trimmed and attributed by the server");
        check(first.GetProperty("mine").GetBoolean(), "Sender sees the message as theirs");
        await luca.Send(new("goto-d", "Io la 4"));
        var polled = Ok(await luca.Presence(new("GOTO-D", first.GetProperty("id").GetInt64() - 1)));
        check(polled.GetProperty("messages").GetArrayLength() == 2, "Polling returns messages after the cursor");
        check(polled.GetProperty("messages")[0].GetProperty("author").GetString() == "anna" && !polled.GetProperty("messages")[0].GetProperty("mine").GetBoolean(), "Other users' messages are not marked as mine");
        check(Ok(await luca.Presence(new("GOTO-D", polled.GetProperty("messages")[1].GetProperty("id").GetInt64()))).GetProperty("messages").GetArrayLength() == 0, "Polling past the last message returns nothing");
        check(Ok(await As("anna", "Developer", 2).History("GOTO-D", null, 100)).GetProperty("messages").GetArrayLength() == 0, "Chat history is isolated by environment");
        check(Ok(await anna.History("OTHER", null, 100)).GetProperty("messages").GetArrayLength() == 0, "Chat history is isolated by initiative");

        for (var i = 0; i < 5; i++) await anna.Send(new("GOTO-D", "m" + i));
        var page = Ok(await anna.History("GOTO-D", null, 3));
        check(page.GetProperty("messages").GetArrayLength() == 3 && page.GetProperty("hasMore").GetBoolean(), "History is paginated from the newest");
        check(page.GetProperty("messages")[2].GetProperty("text").GetString() == "m4", "History pages are in chronological order");
        var older = Ok(await anna.History("GOTO-D", page.GetProperty("messages")[0].GetProperty("id").GetInt64(), 100));
        check(older.GetProperty("messages").GetArrayLength() == 4 && !older.GetProperty("hasMore").GetBoolean(), "Older page continues without gaps or overlaps");
        check(older.GetProperty("messages")[0].GetProperty("text").GetString() == "Sto guardando la scheda 3", "Whole history is retained");

        // Summary for the initiative list.
        var summary = Ok(await anna.Summary()).EnumerateArray().Single(entry => entry.GetProperty("goto").GetString() == "goto-d");
        check(summary.GetProperty("lastWorkedBy").GetString() == "anna", "Summary reports the last worker");
        check(summary.GetProperty("messageCount").GetInt32() == 7, "Summary counts chat messages");
        check(summary.GetProperty("online").GetArrayLength() == 2, "Summary lists the users connected now");
        var gone = await db.DevelopmentPresences.SingleAsync(p => p.Username == "luca" && p.AmbienteId == 1);
        gone.LastSeenAt = DateTime.UtcNow - TimeSpan.FromMinutes(5); await db.SaveChangesAsync();
        check(Ok(await anna.Summary()).EnumerateArray().Single(entry => entry.GetProperty("goto").GetString() == "goto-d").GetProperty("online").GetArrayLength() == 1, "Summary omits users silent beyond the window");
        check(!Ok(await As("anna", "Developer", 2).Summary()).EnumerateArray().Any(entry => entry.GetProperty("goto").GetString() == "goto-d" && entry.GetProperty("messageCount").GetInt32() > 0), "Summary is isolated by environment");
    }
}
