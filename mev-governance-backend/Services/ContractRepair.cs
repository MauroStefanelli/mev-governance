using System.Text.Json.Nodes;

namespace MevGovernanceBackend.Services;

public record OrphanGroup(string MissingContractId, string Lot, int Revisions, int Evaluations, List<string> Goto);
public record RepairPlan(List<OrphanGroup> Orphans, string ToContractId, string ToName, bool CanRepair, List<string> Blockers, List<RevisionRepoint> RevisionFixes, List<Reference> EvaluationFixes);

// Finds the places that still name a catalog contract which no longer exists, and (when asked) points them at one that does.
// It rewrites ONLY the pointer to the catalog. A revision keeps its decisions, documents and estimate exactly as they were.
// What is left is never guessed: a lot that does not exist in the chosen contract blocks the repair and is named.
public static class ContractRepair
{
    const string Builtin = "poste-tet-2025";

    static bool Live(string id, IReadOnlyList<ContractRow> rows) => id == Builtin || rows.Any(r => r.EntityType == "contract" && r.ContractId == id);

    public static List<OrphanGroup> FindOrphans(IReadOnlyList<ContractRow> rows, IReadOnlyList<RevisionRow> revisions)
    {
        var found = new Dictionary<(string, string), (int Rev, int Eval, SortedSet<string> Goto)>();
        void Add(string contract, string lot, bool revision, string goto_)
        {
            var key = (contract, lot); found.TryGetValue(key, out var v); v.Goto ??= new SortedSet<string>(StringComparer.Ordinal);
            if (revision) v.Rev++; else v.Eval++; if (goto_.Length > 0) v.Goto.Add(goto_); found[key] = v;
        }
        foreach (var rev in revisions)
            if (ContractMerge.CatalogOf(rev.PayloadJson) is { } src && !Live(src.ContractId, rows)) Add(src.ContractId, src.Lot, true, rev.Goto);
        foreach (var r in rows.Where(r => r.EntityType != "contract" && r.EntityType != "contract_lot"))
        {
            var holder = Parse(r.PayloadJson)["catalogSource"] as JsonObject;
            var id = (holder?["contractId"] as JsonValue)?.TryGetValue<string>(out var s) == true ? s.Trim() : "";
            if (id.Length > 0 && !Live(id, rows)) Add(id, holder?["lot"]?.ToString().Trim('"') ?? "", false, "");
        }
        return found.Select(kv => new OrphanGroup(kv.Key.Item1, kv.Key.Item2, kv.Value.Rev, kv.Value.Eval, kv.Value.Goto?.ToList() ?? new())).OrderByDescending(g => g.Revisions + g.Evaluations).ThenBy(g => g.MissingContractId, StringComparer.Ordinal).ToList();
    }

    // A lot is deleted only when its payload says deleted = true. A missing flag, or false, means it is in use.
    static bool IsDeleted(string payloadJson) => Parse(payloadJson)["deleted"] is JsonValue v && v.TryGetValue<bool>(out var flag) && flag;

    static JsonObject Parse(string json) { try { return JsonNode.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json) as JsonObject ?? new JsonObject(); } catch { return new JsonObject(); } }

    public static RepairPlan Plan(string toContractId, IReadOnlyList<ContractRow> rows, IReadOnlyList<RevisionRow> revisions)
    {
        var orphans = FindOrphans(rows, revisions);
        var blockers = new List<string>(); var revFixes = new List<RevisionRepoint>(); var evalFixes = new List<Reference>();
        var head = rows.FirstOrDefault(r => r.RecordKey == $"{toContractId}|contract");
        var name = head == null ? toContractId : (Parse(head.PayloadJson)["name"] as JsonValue)?.TryGetValue<string>(out var n) == true && n.Length > 0 ? n : head.Title;
        if (string.IsNullOrWhiteSpace(toContractId)) blockers.Add("Indica il contratto a cui ricollegare.");
        else if (!Live(toContractId, rows)) blockers.Add("Il contratto scelto non esiste.");
        else if (head == null && toContractId != Builtin) blockers.Add("Il contratto scelto non esiste.");
        if (blockers.Count == 0)
        {
            var lots = rows.Where(r => r.EntityType == "contract_lot" && r.ContractId == toContractId && !IsDeleted(r.PayloadJson)).Select(r => r.LotId).ToHashSet();
            // the built-in contract lives in the app, not in the database: its lots are 1 and 2
            if (toContractId == Builtin) { lots.Add("1"); lots.Add("2"); }
            foreach (var g in orphans)
                if (g.Lot.Length > 0 && !lots.Contains(g.Lot))
                    blockers.Add($"Il lotto {g.Lot} non esiste nel contratto «{name}»: {g.Revisions + g.Evaluations} elementi che usavano «{g.MissingContractId}» non si possono ricollegare senza indovinare.");
            if (blockers.Count == 0)
            {
                foreach (var rev in revisions) if (ContractMerge.CatalogOf(rev.PayloadJson) is { } src && !Live(src.ContractId, rows)) revFixes.Add(new RevisionRepoint(rev.Id, rev.Goto, rev.Version, src.ContractId, src.Lot));
                foreach (var r in rows.Where(r => r.EntityType != "contract" && r.EntityType != "contract_lot"))
                    if (Parse(r.PayloadJson)["catalogSource"] is JsonObject h && h["contractId"] is JsonValue v && v.TryGetValue<string>(out var cid) && cid.Trim().Length > 0 && !Live(cid.Trim(), rows)) evalFixes.Add(new Reference(r.RecordKey, r.EntityType, r.Title, "catalogSource.contractId"));
            }
        }
        if (orphans.Count == 0 && blockers.Count == 0) blockers.Add("Non ci sono collegamenti da riparare.");
        return new RepairPlan(orphans, toContractId, name, blockers.Count == 0, blockers, revFixes, evalFixes);
    }

    public record Writes(List<(long Id, string PayloadJson)> Revisions, List<ContractRow> Evaluations);

    public static Writes Apply(RepairPlan plan, IReadOnlyList<ContractRow> rows, IReadOnlyList<RevisionRow> revisions)
    {
        var rev = new List<(long, string)>(); var ev = new List<ContractRow>();
        if (!plan.CanRepair) return new Writes(rev, ev);
        foreach (var fix in plan.RevisionFixes) { var row = revisions.FirstOrDefault(r => r.Id == fix.Id); if (row != null) rev.Add((row.Id, ContractMerge.Repoint(row.PayloadJson, plan.ToContractId))); }
        foreach (var fix in plan.EvaluationFixes)
        {
            var row = rows.FirstOrDefault(r => r.RecordKey == fix.RecordKey); if (row == null) continue;
            var p = Parse(row.PayloadJson); if (p["catalogSource"] is JsonObject src) src["contractId"] = plan.ToContractId;
            ev.Add(row with { PayloadJson = p.ToJsonString() });
        }
        return new Writes(rev, ev);
    }
}
