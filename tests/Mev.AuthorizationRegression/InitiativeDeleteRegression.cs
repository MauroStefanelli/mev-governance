using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using Npgsql;

// Eliminare un'iniziativa salvata: chi puo', cosa sparisce (valutazione + sviluppo) e cosa NO. Il database e' un Postgres vero (MEV_TEST_PG), con la stessa forma di PC_DataRecords.
public static class InitiativeDeleteRegression
{
    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        var pg = Environment.GetEnvironmentVariable("MEV_TEST_PG");
        if (string.IsNullOrWhiteSpace(pg)) { Console.WriteLine("(eliminazione iniziative su Postgres saltata: imposta MEV_TEST_PG per provarla)"); return; }
        await using var conn = new NpgsqlConnection(pg); await conn.OpenAsync();
        async Task Sql(string sql) { await using var cmd = new NpgsqlCommand(sql, conn); await cmd.ExecuteNonQueryAsync(); }
        async Task<long> Count(string where) { await using var cmd = new NpgsqlCommand($"SELECT count(*) FROM deltest.\"PC_DataRecords\" WHERE {where}", conn); return Convert.ToInt64(await cmd.ExecuteScalarAsync()); }
        await Sql("DROP SCHEMA IF EXISTS deltest CASCADE; CREATE SCHEMA deltest; CREATE TABLE deltest.\"PC_DataRecords\" (id uuid primary key default gen_random_uuid(), record_key text not null unique, entity_type text not null, contract_id text not null default '', lot_id text not null default '', title text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
        async Task<string> Insert(string key, string entity, string contract, string lot, string payload)
        {
            await using var cmd = new NpgsqlCommand("INSERT INTO deltest.\"PC_DataRecords\" (record_key, entity_type, contract_id, lot_id, title, payload) VALUES (@k, @e, @c, @l, @k, @p::jsonb) RETURNING id", conn);
            cmd.Parameters.AddWithValue("k", key); cmd.Parameters.AddWithValue("e", entity); cmd.Parameters.AddWithValue("c", contract); cmd.Parameters.AddWithValue("l", lot); cmd.Parameters.AddWithValue("p", payload);
            return ((Guid)(await cmd.ExecuteScalarAsync())!).ToString();
        }
        ConfiguratoreController As(params string[] roles) => new(db, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DB_CONNECTION_STRING"] = pg, ["DB_SCHEMA"] = "deltest" }).Build())
        { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(roles.Select(r => new Claim(ClaimTypes.Role, r)).Append(new Claim(ClaimTypes.Name, "anna")), "test")) } } };
        static JsonElement Body(IActionResult result) => JsonDocument.Parse(JsonSerializer.Serialize(((OkObjectResult)result).Value)).RootElement;
        string Eval(string code, string title) => JsonSerializer.Serialize(new { initiative = new { code, title }, items = new object[0] });
        var devKey = (string contract, string lot, string identity) => ConfiguratoreController.DevelopmentKey(contract, lot, identity);

        // 1) una valutazione con il suo sviluppo, un'altra iniziativa con il suo, e un'altra riga di sviluppo di un'iniziativa non collegata
        var evalA = await Insert("C1|2|initiative|a", "initiative_evaluation", "C1", "2", Eval("146023", "Invio prenotazione"));
        await Insert(devKey("C1", "2", "146023"), "implementation_plan", "C1", "2", JsonSerializer.Serialize(new { goto_ = "146023", initiativeRecordKey = "C1|2|initiative|a", revision = 3 }));
        var evalB = await Insert("C1|2|initiative|b", "initiative_evaluation", "C1", "2", Eval("138512", "Accettazione"));
        await Insert(devKey("C1", "2", "138512"), "implementation_plan", "C1", "2", JsonSerializer.Serialize(new { initiativeRecordKey = "C1|2|initiative|b", revision = 1 }));
        await Insert("C1|2|release", "release_calendar", "C1", "2", "{}");

        // 2) chi non puo' eliminare: la valutazione e lo sviluppo restano
        check(await As("Manager").DeleteRecord(evalA) is ForbidResult, "delete: a Manager cannot delete a saved initiative");
        check(await As("Bid Manager").DeleteRecord(evalA) is ForbidResult, "delete: a Bid Manager cannot delete a saved initiative");
        check(await As("Client").DeleteRecord(evalA) is ForbidResult, "delete: a Client cannot delete a saved initiative");
        check(await As("Editor").DeleteRecord(evalA) is ForbidResult, "delete: an Editor cannot delete a saved initiative");
        check(await Count("entity_type = 'initiative_evaluation'") == 2 && await Count("entity_type = 'implementation_plan'") == 2, "delete: after the refusals NOTHING was removed");

        // 3) chi puo': Admin, Developer, SuperAdmin; con la valutazione se ne va anche lo SVILUPPO di quell'iniziativa (e solo il suo)
        var done = Body(await As("Admin").DeleteRecord(evalA));
        check(done.GetProperty("deleted").GetBoolean() && done.GetProperty("developmentDeleted").GetInt32() == 1, "delete: an Admin deletes the evaluation AND its development (1 record)");
        check(await Count("record_key = 'C1|2|initiative|a'") == 0 && await Count($"record_key = '{devKey("C1", "2", "146023")}'") == 0, "delete: the evaluation and its development are gone");
        check(await Count("record_key = 'C1|2|initiative|b'") == 1 && await Count($"record_key = '{devKey("C1", "2", "138512")}'") == 1 && await Count("entity_type = 'release_calendar'") == 1, "delete: the OTHER initiative, its development and other records are untouched");
        var again = Body(await As("Admin").DeleteRecord(evalA));
        check(!again.GetProperty("deleted").GetBoolean() && again.GetProperty("developmentDeleted").GetInt32() == 0, "delete: deleting twice is harmless (nothing to delete, no error)");
        check(Body(await As("Developer").DeleteRecord(evalB)).GetProperty("deleted").GetBoolean() && await Count("entity_type = 'implementation_plan'") == 0, "delete: a Developer can delete too, and the second development goes with it");

        // 4) due offerte della stessa iniziativa: eliminarne UNA non toglie lo sviluppo (e' dell'iniziativa, non di una offerta)
        var first = await Insert("C1|2|initiative|c1", "initiative_evaluation", "C1", "2", Eval("200100", "Doppia"));
        var second = await Insert("C1|2|initiative|c2", "initiative_evaluation", "C1", "2", Eval("200100", "Doppia"));
        await Insert(devKey("C1", "2", "200100"), "implementation_plan", "C1", "2", JsonSerializer.Serialize(new { initiativeRecordKey = "C1|2|initiative|c1", revision = 2 }));
        var one = Body(await As("SuperAdmin").DeleteRecord(first));
        check(one.GetProperty("deleted").GetBoolean() && one.GetProperty("developmentDeleted").GetInt32() == 0 && await Count("entity_type = 'implementation_plan'") == 1, "delete: with another evaluation of the SAME initiative still saved, the development stays");
        var last = Body(await As("SuperAdmin").DeleteRecord(second));
        check(last.GetProperty("developmentDeleted").GetInt32() == 1 && await Count("entity_type = 'implementation_plan'") == 0, "delete: deleting the last evaluation of the initiative removes the development too");

        // 5) stessa iniziativa (stesso GOTO) in un ALTRO lotto o contratto: non si tocca
        var here = await Insert("C1|2|initiative|d", "initiative_evaluation", "C1", "2", Eval("300300", "Stesso GOTO"));
        await Insert("C1|1|initiative|d", "initiative_evaluation", "C1", "1", Eval("300300", "Stesso GOTO"));
        await Insert(devKey("C1", "1", "300300"), "implementation_plan", "C1", "1", "{}");
        await Insert(devKey("C2", "2", "300300"), "implementation_plan", "C2", "2", "{}");
        await Insert(devKey("C1", "2", "300300"), "implementation_plan", "C1", "2", "{}");
        await Insert("C1|1|development|copiato", "implementation_plan", "C1", "1", JsonSerializer.Serialize(new { initiativeRecordKey = "C1|2|initiative|d" }));   // uno sviluppo di un altro lotto che punta alla STESSA valutazione
        await As("Admin").DeleteRecord(here);
        check(await Count("record_key = 'C1|1|development|copiato'") == 1, "delete: a development of ANOTHER lot is never removed, even if it points at the deleted evaluation");
        check(await Count($"record_key = '{devKey("C1", "1", "300300")}'") == 1 && await Count($"record_key = '{devKey("C2", "2", "300300")}'") == 1 && await Count($"record_key = '{devKey("C1", "2", "300300")}'") == 0, "delete: only the development of THAT contract and lot goes; same GOTO in another lot or contract stays");

        // 6) un'iniziativa senza GOTO: si identifica dal titolo, e la chiave arriva anche dal client
        var noCode = await Insert("C1|2|initiative|e", "initiative_evaluation", "C1", "2", Eval("", "TBD cr post uat"));
        await Insert(devKey("C1", "2", "TBD cr post uat"), "implementation_plan", "C1", "2", "{}");
        check(Body(await As("Admin").DeleteRecord(noCode)).GetProperty("developmentDeleted").GetInt32() == 1, "delete: an initiative without GOTO is identified by the title and its development goes too");

        // 6b) la chiave deve essere IDENTICA a quella del frontend (encodeURIComponent): accenti, apostrofi, parentesi e simboli
        check(ConfiguratoreController.DevelopmentKey("C1", "2", "  CR (post) UAT: l'ordine! ") == "C1|2|development|cr%20(post)%20uat%3A%20l'ordine!", "development key: same as encodeURIComponent for spaces, parentheses, apostrophes and !");
        check(ConfiguratoreController.DevelopmentKey("C1", "2", "Perché è così/ok") == "C1|2|development|perch%C3%A9%20%C3%A8%20cos%C3%AC%2Fok", "development key: accents are UTF-8 percent encoded in capitals, / is encoded");
        check(ConfiguratoreController.DevelopmentKey("C1", "2", "A&B #1 ~ x*y") == "C1|2|development|a%26b%20%231%20~%20x*y", "development key: & # ~ * as encodeURIComponent");
        var odd = await Insert("C1|2|initiative|f", "initiative_evaluation", "C1", "2", Eval("", "Perché (CR) l'ordine!"));
        await Insert(ConfiguratoreController.DevelopmentKey("C1", "2", "Perché (CR) l'ordine!"), "implementation_plan", "C1", "2", "{}");
        check(Body(await As("Admin").DeleteRecord(odd)).GetProperty("developmentDeleted").GetInt32() == 1, "delete: a title with accents and symbols still finds its development");

        // 7) gli altri tipi di record: i permessi di prima non cambiano
        var calendar = await Insert("C1|cal", "release_calendar", "C1", "", "{}");
        check(Body(await As("Manager").DeleteRecord(calendar)).GetProperty("deleted").GetBoolean(), "delete: a Manager can still delete other records (release calendar): only initiatives are restricted");
        var gara = await Insert("gara|x", "gara", "", "", "{}");
        check(!Body(await As("Developer").DeleteRecord(gara)).GetProperty("deleted").GetBoolean() && await Count("entity_type = 'gara'") == 1, "delete: tenders (gara) are still protected from a Developer");
        check(await As("Client").DeleteRecord(calendar) is ForbidResult && Guid.TryParse(calendar, out _), "delete: a Client has no access at all");
        check(await As("Admin").DeleteRecord("non-un-guid") is BadRequestObjectResult, "delete: an invalid id is a 400, not a 500");
        await Sql("DROP SCHEMA deltest CASCADE");
    }
}
