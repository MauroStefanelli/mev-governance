using System.Security.Claims;
using System.Text.Json.Nodes;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

public static class ContractMergeRegression
{
    static string Lot(object? prices = null, object? catalog = null, string priceFile = "", string catalogFile = "", string code = "", object? impact = null, bool deleted = false)
        => new JsonObject { ["name"] = "Lotto 2", ["priceFile"] = priceFile, ["catalogFile"] = catalogFile, ["codiceContratto"] = code, ["deleted"] = deleted,
            ["towPrices"] = JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(prices ?? new { })), ["catalog"] = JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(catalog ?? Array.Empty<object>())),
            ["towImpact"] = JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(impact ?? new { })) }.ToJsonString();
    static ContractRow Head(string id, string name) => new($"{id}|contract", "contract", id, "", name, new JsonObject { ["name"] = name }.ToJsonString());
    static ContractRow LotRow(string id, string lot, string payload) => new($"{id}|{lot}|contract-lot", "contract_lot", id, lot, "Lotto", payload);
    static ContractRow Apps(string id, string lot, params string[] names) => new($"{id}|{lot}|shared_applications", "shared_applications", id, lot, "Applicativi",
        new JsonObject { ["applications"] = new JsonArray(names.Select(n => (JsonNode)new JsonObject { ["code"] = "AP-" + n, ["name"] = n }).ToArray()) }.ToJsonString());
    static ContractRow Evaluation(string key, string contractId, string catalogContract) => new(key, "initiative_evaluation", contractId, "2", "145480 · Prova",
        new JsonObject { ["catalogSource"] = new JsonObject { ["contractId"] = catalogContract, ["lot"] = "2" }, ["initiative"] = new JsonObject { ["code"] = "145480" } }.ToJsonString());
    static object Prices(int n) => Enumerable.Range(0, n).ToDictionary(i => $"TOW02.{i + 1}", i => 100.0 + i);
    static object Cat(int n) => Enumerable.Range(0, n).Select(i => new { id = i, nome = "Voce " + i }).ToArray();

    // Who may preview and run a merge: only SuperAdmin and Developer. Everyone else is refused BEFORE the database is touched
    // (the configuration here has no connection string, so reaching the database at all would throw instead of returning Forbid).
    public static async Task RunPermissions(AppDbContext db, IConfiguration config, Action<bool, string> check)
    {
        ConfiguratoreController As(string role) => new(db, config) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, "u"), new Claim(ClaimTypes.Role, role) }, "test")) } } };
        var body = new ConfiguratoreController.MergeContractsRequest { FromContractId = "a", ToContractId = "b" };
        foreach (var role in new[] { "Client", "Admin", "Manager", "Bid Manager", "Editor" })
        {
            check(await As(role).MergeContracts(body) is ForbidResult, $"Merge: {role} cannot merge or delete contracts");
            check(await As(role).MergeContractsPreview(body) is ForbidResult, $"Merge: {role} cannot even preview a merge");
        }
        foreach (var role in new[] { "SuperAdmin", "Developer" })
            check(await As(role).MergeContractsPreview(body) is not ForbidResult, $"Merge: {role} is allowed to preview a merge");
    }

    public static void Run(Action<bool, string> check)
    {
        const string Keep = "tet-logistica"; const string Drop = "accordo-quadro";
        // the situation described by the user: same catalog on both, but only the kept contract has TOW prices
        var kept = new List<ContractRow> { Head(Keep, "Tracciatura e Logistica Integrata"), LotRow(Keep, "1", Lot()), LotRow(Keep, "2", Lot(Prices(5), Cat(27), "Listino.pdf", "Catalogo Lotto 2.pdf", "4490015980")) };
        var dropped = new List<ContractRow> { Head(Drop, "Accordo Quadro per la fornitura di Servizi Professionali"), LotRow(Drop, "2", Lot(null, Cat(27), "(importato da gara abc)", "(importato da gara abc)")) };
        var rows = kept.Concat(dropped).ToList();

        var plan = ContractMerge.Plan(Drop, Keep, rows);
        check(plan.CanRemove && plan.Blockers.Count == 0, "Merge: the duplicate with no prices can be folded into the complete contract");
        check(plan.Lots.Single().Action == "nessuna", "Merge: nothing is overwritten when the destination already has prices, catalog and files");
        var w = ContractMerge.Apply(plan, rows);
        check(w.Upserts.Count == 0, "Merge: when the destination already has everything, no record is rewritten");
        check(w.DeleteKeys.Contains($"{Drop}|contract") && w.DeleteKeys.Contains($"{Drop}|2|contract-lot") && w.DeleteKeys.All(k => k.StartsWith(Drop)), "Merge: removal deletes only the source contract and its lots");
        check(!w.DeleteKeys.Any(k => k.StartsWith(Keep)), "Merge: the destination is never in the delete list");

        // the opposite direction: the incomplete contract is the destination and receives what it lacks
        var reverse = ContractMerge.Plan(Keep, Drop, rows);
        check(reverse.Lots.Any(l => l.LotId == "2" && l.Action == "completa" && l.Reason.Contains("listino TOW (5 prezzi)")), "Merge: an empty destination lot is completed with the prices of the source");
        check(reverse.Lots.Any(l => l.LotId == "1" && l.Action == "aggiungi"), "Merge: a lot present only in the source is added");
        var rw = ContractMerge.Apply(reverse, rows);
        var filled = JsonNode.Parse(rw.Upserts.Single(u => u.RecordKey == $"{Drop}|2|contract-lot").PayloadJson)!;
        check(filled["towPrices"]!.AsObject().Count == 5, "Merge: the prices are really copied into the destination lot");
        check(filled["catalog"]!.AsArray().Count == 27, "Merge: the destination's own catalog is kept as it was");
        check(filled["priceFile"]!.GetValue<string>() == "Listino.pdf" && filled["codiceContratto"]!.GetValue<string>() == "4490015980", "Merge: a placeholder file name and an empty contract code are replaced by the real ones");

        // the destination is NEVER made emptier or overwritten
        var rich = new List<ContractRow> { Head("a", "A"), LotRow("a", "2", Lot(Prices(2), Cat(3), "mio.pdf", "mio-cat.pdf", "111")), Head("b", "B"), LotRow("b", "2", Lot(Prices(9), Cat(30), "altro.pdf", "altro-cat.pdf", "222")) };
        var p2 = ContractMerge.Plan("b", "a", rich);
        check(p2.Lots.Single().Action == "nessuna" && ContractMerge.Apply(p2, rich).Upserts.Count == 0, "Merge: a destination that has its own data is not overwritten even if the source has more");

        // the destination is completed only where it is EMPTY, field by field: prices present, catalog empty -> only the catalog is filled
        var mixed = new List<ContractRow> { Head("a", "A"), LotRow("a", "2", Lot(Prices(2), Cat(0), "mio-listino.pdf", "(importato da gara x)", "111")), Head("b", "B"), LotRow("b", "2", Lot(Prices(9), Cat(30), "altro-listino.pdf", "altro-cat.pdf", "222", new { TOW02_1 = 10 })) };
        var p2b = ContractMerge.Plan("b", "a", mixed); var mixedWrite = ContractMerge.Apply(p2b, mixed);
        var mixedLot = JsonNode.Parse(mixedWrite.Upserts.Single().PayloadJson)!;
        check(mixedLot["towPrices"]!.AsObject().Count == 2, "Merge: prices already in the destination are NOT replaced by the 9 of the source");
        check(mixedLot["catalog"]!.AsArray().Count == 30, "Merge: an empty destination catalog is filled from the source");
        check(mixedLot["priceFile"]!.GetValue<string>() == "mio-listino.pdf", "Merge: a real file name in the destination is kept");
        check(mixedLot["catalogFile"]!.GetValue<string>() == "altro-cat.pdf", "Merge: a placeholder file name is replaced by the real one");
        check(mixedLot["codiceContratto"]!.GetValue<string>() == "111", "Merge: the destination's contract code is kept");
        check(mixedLot["towImpact"]!.AsObject().Count == 1, "Merge: empty TOW impact percentages are filled from the source");
        // the mirror case: catalog present in the destination, prices missing -> prices are filled, the catalog (even with a different size) is NOT replaced
        var mirror = new List<ContractRow> { Head("a", "A"), LotRow("a", "2", Lot(null, Cat(3), "(importato da gara x)", "mio-catalogo.pdf")), Head("b", "B"), LotRow("b", "2", Lot(Prices(5), Cat(27), "listino.pdf", "altro-catalogo.pdf")) };
        var mirrorLot = JsonNode.Parse(ContractMerge.Apply(ContractMerge.Plan("b", "a", mirror), mirror).Upserts.Single().PayloadJson)!;
        check(mirrorLot["towPrices"]!.AsObject().Count == 5 && mirrorLot["catalog"]!.AsArray().Count == 3, "Merge: the destination keeps its own catalog (3 entries) while the missing prices are filled");
        check(mirrorLot["catalogFile"]!.GetValue<string>() == "mio-catalogo.pdf" && mirrorLot["priceFile"]!.GetValue<string>() == "listino.pdf", "Merge: a real catalog file name is kept, a placeholder price file name is replaced");
        // an EMPTY file name (never filled) is just as replaceable as a placeholder
        var emptyNames = new List<ContractRow> { Head("a", "A"), LotRow("a", "2", Lot(Prices(1), Cat(1), "", "")), Head("b", "B"), LotRow("b", "2", Lot(Prices(1), Cat(1), "Listino reale.pdf", "Catalogo reale.pdf")) };
        var en = ContractMerge.Plan("b", "a", emptyNames); var enLot = JsonNode.Parse(ContractMerge.Apply(en, emptyNames).Upserts.Single().PayloadJson)!;
        check(en.Lots.Single().Action == "completa" && enLot["priceFile"]!.GetValue<string>() == "Listino reale.pdf" && enLot["catalogFile"]!.GetValue<string>() == "Catalogo reale.pdf", "Merge: an empty file name in the destination is replaced by the real one of the source");
        var onlyPlaceholders = new List<ContractRow> { Head("a", "A"), LotRow("a", "2", Lot(Prices(1), Cat(1), "(importato da gara x)", "(importato da gara x)")), Head("b", "B"), LotRow("b", "2", Lot(Prices(1), Cat(1), "(importato da gara y)", "(importato da gara y)")) };
        check(ContractMerge.Plan("b", "a", onlyPlaceholders).Lots.Single().Action == "nessuna", "Merge: two placeholder file names are not treated as a difference worth moving");

        // evaluations that name the source directly through "contractId" in the payload are repointed too
        var direct = new List<ContractRow> { Head("a", "A"), LotRow("a", "2", Lot(Prices(1), Cat(1))), Head("b", "B"), LotRow("b", "2", Lot(null, Cat(1))),
            new("env|2|something", "technical_analysis", "env", "2", "Analisi", new JsonObject { ["contractId"] = "b", ["note"] = "x" }.ToJsonString()) };
        var pd = ContractMerge.Plan("b", "a", direct); var dw = ContractMerge.Apply(pd, direct);
        check(pd.References.Single().Field == "contractId" && JsonNode.Parse(dw.Upserts.Single().PayloadJson)!["contractId"]!.GetValue<string>() == "a" && JsonNode.Parse(dw.Upserts.Single().PayloadJson)!["note"]!.GetValue<string>() == "x", "Merge: a record naming the source through its own contractId is repointed and otherwise untouched");

        // lots: deleted source lots are ignored; a deleted destination lot is replaced by the source one
        var withDeleted = new List<ContractRow> { Head("a", "A"), LotRow("a", "2", Lot(deleted: true)), Head("b", "B"), LotRow("b", "2", Lot(Prices(3), Cat(4))), LotRow("b", "3", Lot(deleted: true)) };
        var p3 = ContractMerge.Plan("b", "a", withDeleted);
        check(p3.Lots.First(l => l.LotId == "2").Action == "aggiungi" && p3.Lots.First(l => l.LotId == "3").Action == "ignora", "Merge: a deleted destination lot is refilled, a deleted source lot is skipped");

        // shared applications merged by identity: the destination wins, the source only adds what is missing
        var apps = new List<ContractRow> { Head("a", "A"), Head("b", "B"), Apps("a", "2", "SAP", "SFRA"), Apps("b", "2", "sap", "NPSO", "BEP"), Apps("b", "all", "ILP") };
        var p4 = ContractMerge.Plan("b", "a", apps);
        check(p4.SharedApps.Single(s => s.LotKey == "2").Added == 2 && p4.SharedApps.Single(s => s.LotKey == "all").Action == "aggiungi", "Merge: shared applications are matched by name and only the missing ones are added");
        var aw = ContractMerge.Apply(p4, apps);
        var merged = JsonNode.Parse(aw.Upserts.Single(u => u.RecordKey == "a|2|shared_applications").PayloadJson)!["applications"]!.AsArray();
        check(merged.Count == 4 && merged.Select(n => n!["name"]!.GetValue<string>()).Count(n => n.ToLower() == "sap") == 1, "Merge: an application present on both sides is not duplicated");
        check(aw.DeleteKeys.Contains("b|2|shared_applications") && aw.DeleteKeys.Contains("b|all|shared_applications"), "Merge: the source's shared applications are removed with it");

        // evaluations that name the source as their catalog are repointed, never left dangling
        var refs = new List<ContractRow> { Head("a", "A"), LotRow("a", "2", Lot(Prices(1), Cat(1))), Head("b", "B"), LotRow("b", "2", Lot(null, Cat(1))), Evaluation("4490015980|2|initiative|x", "4490015980", "b"), Evaluation("4490015980|2|initiative|y", "4490015980", "a") };
        var p5 = ContractMerge.Plan("b", "a", refs);
        check(p5.References.Single().RecordKey.EndsWith("|x") && p5.DependentRecords == 1, "Merge: only the evaluation that uses the source as catalog is reported");
        var rf = ContractMerge.Apply(p5, refs);
        check(JsonNode.Parse(rf.Upserts.Single(u => u.RecordKey.EndsWith("|x")).PayloadJson)!["catalogSource"]!["contractId"]!.GetValue<string>() == "a", "Merge: that evaluation now points at the contract that stays");
        check(JsonNode.Parse(rf.Upserts.Single(u => u.RecordKey.EndsWith("|x")).PayloadJson)!["initiative"]!["code"]!.GetValue<string>() == "145480", "Merge: the rest of the evaluation is untouched");
        check(!rf.Upserts.Any(u => u.RecordKey.EndsWith("|y")), "Merge: evaluations that did not use the source are not rewritten");

        // blockers
        check(!ContractMerge.Plan(Keep, Keep, rows).CanRemove, "Merge: a contract cannot be merged into itself");
        check(!ContractMerge.Plan("poste-tet-2025", Keep, rows.Append(Head("poste-tet-2025", "Built-in")).ToList()).CanRemove, "Merge: the built-in contract is never removed");
        check(!ContractMerge.Plan("nope", Keep, rows).CanRemove && !ContractMerge.Plan(Drop, "nope", rows).CanRemove, "Merge: a missing contract on either side blocks the move");
        check(!ContractMerge.Plan("", Keep, rows).CanRemove && !ContractMerge.Plan(Drop, " ", rows).CanRemove, "Merge: empty ids are refused");
        var foreign = rows.Append(new ContractRow($"{Drop}|release|r1", "release_calendar", Drop, "", "Release 1", "{}")).ToList();
        var p6 = ContractMerge.Plan(Drop, Keep, foreign);
        check(!p6.CanRemove && p6.Blockers.Any(b => b.Contains("Release 1")), "Merge: a record the merge cannot carry over blocks the removal and is named");
        check(ContractMerge.Apply(p6, foreign).DeleteKeys.Count == 0, "Merge: a blocked plan produces no writes at all");
        check(ContractMerge.Plan(Drop, Keep, rows.Select(r => r with { PayloadJson = "not json" }).ToList()).Lots.Count >= 0, "Merge: unreadable payloads do not crash the plan");
    }
}
