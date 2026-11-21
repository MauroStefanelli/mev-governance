using System.Security.Claims;
using System.Text.Json.Nodes;
using ClosedXML.Excel;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Npgsql;

// «Voci di catalogo offerti»: il modello Excel, la lettura con errori cella per cella, il salvataggio che non tocca il catalogo di gara e chi puo' gestirlo.
// Il catalogo e' quello VERO del lotto 2 (27 voci, stessa fixture del Configuratore). Il salvataggio su database vero gira se MEV_TEST_PG e' impostata.
public static class OfferedCatalogRegression
{
    static JsonArray Tender()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "mev-governance-ui", "src", "configuratore", "__fixtures__", "lotto2Catalogo.json"))) dir = dir.Parent;
        if (dir == null) throw new Exception("fixture lotto2Catalogo.json non trovata");
        return JsonNode.Parse(File.ReadAllText(Path.Combine(dir.FullName, "mev-governance-ui", "src", "configuratore", "__fixtures__", "lotto2Catalogo.json")))!.AsArray();
    }

    // Compila il modello come farebbe l'utente: ogni cella gialla = prezzo di gara x sconto (le voci a 0 in gara restano vuote).
    static XLWorkbook Filled(JsonArray tender, decimal factor)
    {
        var wb = new XLWorkbook(new MemoryStream(OfferedCatalogWorkbook.BuildTemplate(tender, "poste-tet-2025", "2")));
        var ws = wb.Worksheet(OfferedCatalogWorkbook.DataSheet); var reference = wb.Worksheet(OfferedCatalogWorkbook.BaseSheet);
        for (int r = 2; r <= tender.Count + 1; r++)
            for (int c = 4; c <= 9; c++)
            {
                var b = reference.Cell(r, c);
                if (!b.IsEmpty() && b.GetDouble() > 0) ws.Cell(r, c).Value = Math.Round((decimal)b.GetDouble() * factor, 2);
            }
        return wb;
    }
    static OfferedCatalogWorkbook.Result Read(XLWorkbook wb, JsonArray tender) { var m = new MemoryStream(); wb.SaveAs(m); m.Position = 0; return OfferedCatalogWorkbook.Read(m, tender); }

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        var tender = Tender();
        check(tender.Count == 27, "the real lot 2 tender catalog has 27 voices");

        // ---- il modello ----
        using (var wb = new XLWorkbook(new MemoryStream(OfferedCatalogWorkbook.BuildTemplate(tender, "poste-tet-2025", "2"))))
        {
            var data = wb.Worksheet(OfferedCatalogWorkbook.DataSheet); var reference = wb.Worksheet(OfferedCatalogWorkbook.BaseSheet);
            check(wb.Worksheets.Select(s => s.Name).SequenceEqual(new[] { "CatalogoOfferto", "BaseAsta", "Istruzioni" }), "template: three sheets (data, tender prices, instructions)");
            var headers = Enumerable.Range(1, 9).Select(i => data.Cell(1, i).GetString()).ToList();
            check(headers.SequenceEqual(new[] { "ID", "Ambito", "Voce", "Realizzazione Semplice", "Realizzazione Medio", "Realizzazione Complesso", "Modifica Semplice", "Modifica Medio", "Modifica Complesso" }), "template: the headers are the fixed ones");
            check(data.LastRowUsed()!.RowNumber() == 28 && data.Cell(2, 1).GetString() == "236" && data.Cell(2, 3).GetString() == "Realizzazione Single Page Application" && data.Cell(2, 2).GetString() == "Frontend", "template: one row per tender voice, id/ambit/name already filled");
            check(Enumerable.Range(2, 27).All(r => Enumerable.Range(4, 6).All(c => data.Cell(r, c).IsEmpty())), "template: the price cells are EMPTY (a forgotten price cannot pass as «offered = tender»)");
            check(reference.Cell(2, 4).GetDouble() == 1200 && reference.Cell(2, 6).GetDouble() == 4800 && reference.Cell(2, 7).GetDouble() == 280, "template: the sheet BaseAsta shows the tender prices (1200/…/4800, 280)");
        }

        // ---- un file compilato bene ----
        var good = Read(Filled(tender, 0.5m), tender);
        check(good.Ok && good.Errors.Count == 0 && good.Rows.Count == 27, "a filled model is accepted with all 27 voices");
        var first = good.Rows.First(r => r.Id == "236");
        check(first.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Medio").Offered == 1400 && first.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Medio").Base == 2800, "read: offered 1.400 next to the tender 2.800 (voice 236, Realizzazione Medio)");
        check(first.Prices.Single(p => p.Type == "MODIFICA" && p.Band == "Semplice").Offered == 140, "read: Modifica Semplice 280 x 0,5 = 140");
        var zeroVoices = tender.OfType<JsonObject>().Count(e => new[] { "REALIZZAZIONE", "MODIFICA" }.Any(t => new[] { "Semplice", "Medio", "Complesso" }.Any(b => (e["prezzi"]![t]![b]?.GetValue<decimal>() ?? 0) == 0)));
        check(zeroVoices > 0 && good.Ok, "voices with a 0 price in the tender may stay empty in the file (" + zeroVoices + " voices have one)");
        check(good.Warnings.Count == 0, "no warnings for an ordinary discount");

        // ---- cosa viene salvato: id + prezzi, mai i nomi ----
        var entries = OfferedCatalogWorkbook.ToEntries(good.Rows);
        check(entries.Count == 27 && entries[0]!["id"]!.GetValue<long>() == 236 && entries[0]!["nome"] == null && entries[0]!["ambito"] == null && entries[0]!["descrizione"] == null, "saved: only id and prices (names stay those of the tender catalog)");
        check(entries[0]!["prezzi"]!["REALIZZAZIONE"]!["Medio"]!.GetValue<decimal>() == 1400m, "saved: prezzi.REALIZZAZIONE.Medio = 1400");

        // ---- errori: ognuno rifiuta il file e dice dove ----
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 1).Value = "99999";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 2") && e.Contains("99999") && e.Contains("non esiste")), "error: an ID that is not in the tender catalog is refused, with the row");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(3, 1).Value = "236";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 3") && e.Contains("più di una volta")), "error: a duplicated ID is refused");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Row(5).Delete();
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Mancano 1 voci")), "error: a missing voice is refused (every voice of the lot is needed)");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 5).Clear();
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 2") && e.Contains("Realizzazione Medio") && e.Contains("manca il prezzo offerto") && e.Contains("2800")), "error: an empty price where the tender has one is refused and says which cell");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 5).Value = "abc";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 2") && e.Contains("«abc» non è un importo")), "error: text that is not an amount is refused");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 5).Value = -5;
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("negativo")), "error: a negative price is refused");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(1, 5).Value = "Prezzo medio";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Intestazioni mancanti") && e.Contains("Realizzazione Medio")), "error: a changed header is refused");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Name = "Foglio1";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Manca il foglio 'CatalogoOfferto'")), "error: a renamed sheet is refused");
        }
        { var r = OfferedCatalogWorkbook.Read(new MemoryStream(new byte[] { 1, 2, 3, 4 }), tender); check(!r.Ok && r.Errors.Single().Contains("non è un XLSX leggibile"), "error: a file that is not an XLSX is refused with a clear message"); }
        { var r = Read(new XLWorkbook(new MemoryStream(OfferedCatalogWorkbook.BuildTemplate(tender, "x", "2"))), tender); check(!r.Ok && r.Errors.Any(e => e.Contains("manca il prezzo offerto")), "error: the EMPTY model is refused (nothing filled in)"); }
        {
            var wb = Filled(tender, 0.5m); var ws = wb.Worksheet("CatalogoOfferto");
            for (int r0 = 2; r0 <= 28; r0++) ws.Cell(r0, 5).Value = "xx";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Count <= OfferedCatalogWorkbook.MaxErrors + 1, "error: the list of errors is capped (not hundreds of lines)");
        }

        // ---- importi scritti all'italiana, avvisi ----
        {
            var wb = Filled(tender, 0.5m); var ws = wb.Worksheet("CatalogoOfferto");
            ws.Cell(2, 5).SetValue("1.400,50"); ws.Cell(2, 4).SetValue("€ 600"); ws.Cell(2, 6).SetValue("2400.5");
            var r = Read(wb, tender); var row = r.Rows.First(x => x.Id == "236");
            check(r.Ok && row.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Medio").Offered == 1400.50m && row.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Semplice").Offered == 600m && row.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Complesso").Offered == 2400.5m, "amounts written as text are read: «1.400,50», «€ 600», «2400.5»");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 5).Value = 3000;
            var r = Read(wb, tender); check(r.Ok && r.Warnings.Any(w => w.Contains("Riga 2") && w.Contains("supera la base d'asta")), "a price above the tender base is saved but WARNED");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 3).Value = "Altro nome";
            var r = Read(wb, tender); check(r.Ok && r.Warnings.Any(w => w.Contains("vale l'ID 236")) && OfferedCatalogWorkbook.ToEntries(r.Rows)[0]!["nome"] == null, "a different name is only warned: the ID decides and the name is never overwritten");
        }
        { var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(40, 1).Value = ""; check(Read(wb, tender).Ok, "empty rows at the bottom are ignored"); }

        // ---- chi puo' gestirlo ----
        check(OfferedCatalogWorkbook.CanManage(true, false, null, "4490015980") && OfferedCatalogWorkbook.CanManage(true, false, null, null), "SuperAdmin: every lot");
        check(OfferedCatalogWorkbook.CanManage(false, true, "4490015980", "4490015980"), "Admin: the lot of HIS contract");
        check(!OfferedCatalogWorkbook.CanManage(false, true, "4490015980", "4490015981"), "Admin: NOT the lot of another contract");
        check(!OfferedCatalogWorkbook.CanManage(false, true, "4490015980", "") && !OfferedCatalogWorkbook.CanManage(false, true, "4490015980", null), "Admin: NOT a lot linked to no contract");
        check(!OfferedCatalogWorkbook.CanManage(false, true, "", "") && !OfferedCatalogWorkbook.CanManage(false, true, null, null), "Admin without contract: nothing (empty = empty must not match)");
        check(!OfferedCatalogWorkbook.CanManage(false, false, "4490015980", "4490015980"), "any other role: never");

        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        OfferedCatalogController As(string role, int environment = 1) => new(db, config) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.Name, "anna"), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString()) }, "test")) } } };
        foreach (var role in new[] { "Editor", "Client", "Developer", "Bid Manager", "Manager" })
        {
            var c = As(role);
            check(await c.Lots() is ForbidResult && await c.Template("poste-tet-2025", "2") is ForbidResult && await c.Preview(null!, "poste-tet-2025", "2") is ForbidResult
                && await c.Import(null!, "poste-tet-2025", "2") is ForbidResult && await c.Remove("poste-tet-2025", "2") is ForbidResult, $"{role}: refused on all five actions of the offered catalog");
        }
        var attrs = typeof(OfferedCatalogController).GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AuthorizeAttribute), true);
        check(attrs.Length == 1, "the controller requires a login");

        // ---- salvataggio su un Postgres vero (solo se MEV_TEST_PG e' impostata) ----
        var pg = Environment.GetEnvironmentVariable("MEV_TEST_PG");
        if (string.IsNullOrWhiteSpace(pg)) { Console.WriteLine("(salvataggio su Postgres saltato: imposta MEV_TEST_PG per provarlo)"); return; }
        await using var conn = new NpgsqlConnection(pg); await conn.OpenAsync();
        async Task Sql(string sql) { await using var cmd = new NpgsqlCommand(sql, conn); await cmd.ExecuteNonQueryAsync(); }
        await Sql("DROP SCHEMA IF EXISTS offtest CASCADE; CREATE SCHEMA offtest; CREATE TABLE offtest.\"PC_DataRecords\" (id serial primary key, record_key text unique, entity_type text, contract_id text, lot_id text, title text, payload jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
        var lotPayload = new JsonObject { ["name"] = "Lotto 2", ["codiceContratto"] = "4490015980", ["catalog"] = tender.DeepClone(), ["towPrices"] = new JsonObject { ["TOW02.1"] = 3607 }, ["catalogFile"] = "gara.pdf", ["active"] = true };
        await using (var ins = new NpgsqlCommand("INSERT INTO offtest.\"PC_DataRecords\" (record_key, entity_type, contract_id, lot_id, title, payload) VALUES ('poste-tet-2025|2|contract-lot','contract_lot','poste-tet-2025','2','Lotto 2', @p::jsonb)", conn)) { ins.Parameters.AddWithValue("p", lotPayload.ToJsonString()); await ins.ExecuteNonQueryAsync(); }
        var before = (await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!;
        check(OfferedCatalogStore.TenderCatalog(before.Payload).Count == 27 && before.Payload["offeredCatalog"] == null, "db: the lot has the tender catalog and no offered catalog yet");
        check(await OfferedCatalogStore.Save(conn, "offtest", "poste-tet-2025", "2", entries, new JsonObject { ["fileName"] = "f.xlsx", ["rows"] = 27 }), "db: the offered catalog is saved");
        var after = (await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!;
        check(after.Payload["offeredCatalog"]!.AsArray().Count == 27 && after.Payload["offeredCatalogMeta"]!["fileName"]!.ToString() == "f.xlsx", "db: 27 offered voices and the file name are stored");
        check(after.Payload["catalog"]!.ToJsonString() == before.Payload["catalog"]!.ToJsonString(), "db: the TENDER catalog is byte-for-byte the same after the import");
        check(after.Payload["towPrices"]!.ToJsonString() == before.Payload["towPrices"]!.ToJsonString() && after.Payload["catalogFile"]!.ToString() == "gara.pdf" && after.Payload["codiceContratto"]!.ToString() == "4490015980", "db: TOW prices, file name and contract link are untouched");
        check(after.Payload["offeredCatalog"]![0]!["prezzi"]!["REALIZZAZIONE"]!["Medio"]!.GetValue<decimal>() == 1400m, "db: the offered price is stored (1.400)");
        check(!await OfferedCatalogStore.Save(conn, "offtest", "poste-tet-2025", "9", entries, null), "db: a lot that does not exist is not created");
        check(await OfferedCatalogStore.Save(conn, "offtest", "poste-tet-2025", "2", null, null), "db: the offered catalog is removed");
        var removed = (await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!;
        check(removed.Payload["offeredCatalog"] == null && removed.Payload["offeredCatalogMeta"] == null && removed.Payload["catalog"]!.ToJsonString() == before.Payload["catalog"]!.ToJsonString(), "db: after the removal the lot is back to the tender catalog, unchanged");
        await Sql("DROP SCHEMA offtest CASCADE");
    }
}
