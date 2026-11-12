using System.Text.Json;
using System.Text.Json.Nodes;

namespace MevGovernanceBackend.Services;

// One row of PC_DataRecords as the merge sees it. Pure data: the merge never touches a database, so every rule is testable on its own.
public record ContractRow(string RecordKey, string EntityType, string ContractId, string LotId, string Title, string PayloadJson);

public record LotMove(string LotId, string Action, string Reason, int FromPrices, int ToPrices, int FromCatalog, int ToCatalog);
public record SharedAppsMove(string LotKey, string Action, int FromApps, int ToApps, int Added);
public record Reference(string RecordKey, string EntityType, string Title, string Field);

// A revision of the shared analysis (table InitiativeRevisions). Immutable by design: a version is never rewritten, only its pointer to the
// catalog it was built on is, and only when that catalog no longer exists. Everything else in the payload stays byte-for-byte as it was.
public record RevisionRow(long Id, string Goto, int Version, string PayloadJson);
public record RevisionRepoint(long Id, string Goto, int Version, string FromContractId, string Lot);

// What moving a contract into another would do, decided entirely from the rows. Nothing is written by building it.
public class MergePlan
{
    public string FromId { get; set; } = ""; public string ToId { get; set; } = "";
    public string FromName { get; set; } = ""; public string ToName { get; set; } = "";
    public List<LotMove> Lots { get; } = new();
    public List<SharedAppsMove> SharedApps { get; } = new();
    public List<Reference> References { get; } = new();          // records that point at the contract being removed through their payload
    public List<RevisionRepoint> Revisions { get; } = new();     // revisions of the shared analysis that were built on the contract being removed
    public List<string> Blockers { get; } = new();                // reasons the removal must not happen
    public List<string> Notes { get; } = new();
    public int DependentRecords => References.Count + Revisions.Count;
    public bool CanRemove => Blockers.Count == 0;
}

// Rules, in one place:
//  * Nothing in the destination is ever overwritten with something emptier. A lot of the source fills a destination lot only where the
//    destination has nothing (no prices, no catalog entries, no file name); it never replaces data that exists.
//  * A lot that exists only in the source is added to the destination under the same lot id, unless that id is taken by a different lot.
//  * Shared applications are merged by identity (code + name): the destination's own entry wins, the source adds the ones it lacks.
//  * Records that carry the source contract in their payload (catalogSource.contractId of an evaluation) are repointed to the destination.
//  * The removal is blocked while anything still points at the source after the move, and when source and destination are the same,
//    when the source is the built-in contract, or when either does not exist.
public static class ContractMerge
{
    const string Builtin = "poste-tet-2025";

    static JsonObject Parse(string json) { try { return JsonNode.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json) as JsonObject ?? new JsonObject(); } catch { return new JsonObject(); } }
    static int Count(JsonNode? node) => node is JsonArray a ? a.Count : node is JsonObject o ? o.Count(p => p.Value != null && p.Value.GetValueKind() != JsonValueKind.Null) : 0;
    static string Text(JsonNode? node) => node is JsonValue v && v.TryGetValue<string>(out var s) ? s.Trim() : "";
    static bool IsPlaceholderFile(string name) => name.Length == 0 || name.StartsWith("(importato da gara", StringComparison.OrdinalIgnoreCase);
    static string ContractKey(string id) => $"{id}|contract";
    static string LotKey(string id, string lot) => $"{id}|{lot}|contract-lot";

    public record CatalogRef(string ContractId, string Lot);
    // The catalog an analysis revision was built on, or null when it names none.
    public static CatalogRef? CatalogOf(string payloadJson)
    {
        var estimate = Parse(payloadJson)["estimate"] as JsonObject;
        var source = estimate?["catalogSource"] as JsonObject;
        var id = Text(source?["contractId"]); if (id.Length == 0) return null;
        var lot = source?["lot"] is JsonValue v ? (v.TryGetValue<string>(out var s1) ? s1 : v.TryGetValue<int>(out var i1) ? i1.ToString() : v.ToString()) : "";
        return new CatalogRef(id, lot.Trim());
    }
    // The same payload with ONLY the catalog contract changed. Nothing else is touched, not even the order of the fields.
    public static string Repoint(string payloadJson, string toContractId)
    {
        var node = Parse(payloadJson);
        if (node["estimate"] is JsonObject estimate && estimate["catalogSource"] is JsonObject source) source["contractId"] = toContractId;
        return node.ToJsonString();
    }

    public static string AppIdentity(JsonNode? app)
    {
        static string N(string s) => new string(s.Normalize(System.Text.NormalizationForm.FormD).Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
        return N(Text(app?["code"])) + "|" + N(Text(app?["name"]));
    }

    public static MergePlan Plan(string fromId, string toId, IReadOnlyList<ContractRow> rows, IReadOnlyList<RevisionRow>? revisions = null)
    {
        var plan = new MergePlan { FromId = fromId, ToId = toId };
        ContractRow? Find(string key) => rows.FirstOrDefault(r => r.RecordKey == key);
        var fromHead = Find(ContractKey(fromId)); var toHead = Find(ContractKey(toId));
        plan.FromName = Text(Parse(fromHead?.PayloadJson ?? "")["name"]) is { Length: > 0 } fn ? fn : fromHead?.Title ?? fromId;
        plan.ToName = Text(Parse(toHead?.PayloadJson ?? "")["name"]) is { Length: > 0 } tn ? tn : toHead?.Title ?? toId;

        if (string.IsNullOrWhiteSpace(fromId) || string.IsNullOrWhiteSpace(toId)) plan.Blockers.Add("Indica il contratto da eliminare e quello che resta.");
        else if (fromId == toId) plan.Blockers.Add("Il contratto da eliminare e quello che resta sono lo stesso.");
        if (fromId == Builtin) plan.Blockers.Add("Il contratto di sistema (built-in) non si elimina.");
        if (fromHead == null && fromId.Length > 0) plan.Blockers.Add("Il contratto da eliminare non esiste.");
        if (toHead == null && toId.Length > 0) plan.Blockers.Add("Il contratto che resta non esiste.");
        if (plan.Blockers.Count > 0) return plan;

        // ---- lots ----
        var fromLots = rows.Where(r => r.EntityType == "contract_lot" && r.ContractId == fromId).OrderBy(r => r.LotId, StringComparer.Ordinal).ToList();
        var toLots = rows.Where(r => r.EntityType == "contract_lot" && r.ContractId == toId).ToDictionary(r => r.LotId);
        foreach (var lot in fromLots)
        {
            var src = Parse(lot.PayloadJson);
            if (src["deleted"]?.GetValue<bool>() == true) { plan.Lots.Add(new LotMove(lot.LotId, "ignora", "Lotto già eliminato.", 0, 0, 0, 0)); continue; }
            var srcPrices = Count(src["towPrices"]); var srcCatalog = Count(src["catalog"]);
            if (!toLots.TryGetValue(lot.LotId, out var dest) || Parse(dest.PayloadJson)["deleted"]?.GetValue<bool>() == true)
            { plan.Lots.Add(new LotMove(lot.LotId, "aggiungi", "Il lotto non esiste nel contratto che resta: viene copiato.", srcPrices, 0, srcCatalog, 0)); continue; }
            var dst = Parse(dest.PayloadJson); var dstPrices = Count(dst["towPrices"]); var dstCatalog = Count(dst["catalog"]);
            var fills = new List<string>();
            if (dstPrices == 0 && srcPrices > 0) fills.Add($"listino TOW ({srcPrices} prezzi)");
            if (dstCatalog == 0 && srcCatalog > 0) fills.Add($"catalogo ({srcCatalog} voci)");
            if (Count(dst["towImpact"]) == 0 && Count(src["towImpact"]) > 0) fills.Add("percentuali di impatto TOW");
            if (IsPlaceholderFile(Text(dst["priceFile"])) && !IsPlaceholderFile(Text(src["priceFile"]))) fills.Add("nome del file del listino");
            if (IsPlaceholderFile(Text(dst["catalogFile"])) && !IsPlaceholderFile(Text(src["catalogFile"]))) fills.Add("nome del file del catalogo");
            if (Text(dst["codiceContratto"]).Length == 0 && Text(src["codiceContratto"]).Length > 0) fills.Add($"codice contratto {Text(src["codiceContratto"])}");
            plan.Lots.Add(fills.Count > 0
                ? new LotMove(lot.LotId, "completa", "Completa solo ciò che manca: " + string.Join(", ", fills) + ".", srcPrices, dstPrices, srcCatalog, dstCatalog)
                : new LotMove(lot.LotId, "nessuna", "Il lotto di destinazione ha già tutto: non cambia.", srcPrices, dstPrices, srcCatalog, dstCatalog));
        }

        // ---- shared applications (per lot key) ----
        foreach (var src in rows.Where(r => r.EntityType == "shared_applications" && r.ContractId == fromId))
        {
            var srcApps = (Parse(src.PayloadJson)["applications"] as JsonArray)?.ToList() ?? new();
            var dest = rows.FirstOrDefault(r => r.EntityType == "shared_applications" && r.ContractId == toId && r.LotId == src.LotId);
            var destApps = dest == null ? new List<JsonNode?>() : (Parse(dest.PayloadJson)["applications"] as JsonArray)?.ToList() ?? new();
            var known = destApps.Select(AppIdentity).ToHashSet();
            var added = srcApps.Count(a => !known.Contains(AppIdentity(a)));
            plan.SharedApps.Add(new SharedAppsMove(src.LotId, dest == null ? "aggiungi" : added > 0 ? "completa" : "nessuna", srcApps.Count, destApps.Count, added));
        }

        // ---- everything else that points at the source through its payload ----
        foreach (var r in rows)
        {
            if (r.ContractId == fromId && r.EntityType is "contract" or "contract_lot" or "shared_applications") continue;
            var p = Parse(r.PayloadJson);
            var holder = p["catalogSource"] as JsonObject;
            if (holder != null && Text(holder["contractId"]) == fromId) plan.References.Add(new Reference(r.RecordKey, r.EntityType, r.Title, "catalogSource.contractId"));
            if (p["contractId"] is JsonNode c && Text(c) == fromId && r.ContractId != fromId && r.EntityType != "contract") plan.References.Add(new Reference(r.RecordKey, r.EntityType, r.Title, "contractId"));
        }
        // revisions of the shared analysis: they remember the catalog they were built on inside estimate.catalogSource
        foreach (var rev in revisions ?? Array.Empty<RevisionRow>())
            if (CatalogOf(rev.PayloadJson) is { } src && src.ContractId == fromId) plan.Revisions.Add(new RevisionRepoint(rev.Id, rev.Goto, rev.Version, fromId, src.Lot));
        // records stored UNDER the source contract that this merge does not know how to carry over would be lost with the removal
        foreach (var r in rows.Where(r => r.ContractId == fromId && r.EntityType is not ("contract" or "contract_lot" or "shared_applications")))
            plan.Blockers.Add($"Il record «{(string.IsNullOrWhiteSpace(r.Title) ? r.RecordKey : r.Title)}» ({r.EntityType}) è salvato sotto il contratto da eliminare: spostarlo a mano o eliminarlo prima.");

        if (plan.Lots.All(l => l.Action is "ignora") && plan.Lots.Count > 0) plan.Notes.Add("Il contratto da eliminare non ha lotti attivi da spostare.");
        return plan;
    }

    // The rows that must be written for the move, given the plan. Returns upserts and the keys to delete. Writing them is the caller's job.
    public record Writes(List<ContractRow> Upserts, List<string> DeleteKeys, List<(long Id, string PayloadJson)>? RevisionWrites = null);

    public static Writes Apply(MergePlan plan, IReadOnlyList<ContractRow> rows, IReadOnlyList<RevisionRow>? revisions = null)
    {
        var upserts = new List<ContractRow>(); var deletes = new List<string>(); var revisionWrites = new List<(long, string)>();
        if (!plan.CanRemove) return new Writes(upserts, deletes, revisionWrites);
        ContractRow Row(string key) => rows.First(r => r.RecordKey == key);

        foreach (var move in plan.Lots)
        {
            var src = rows.FirstOrDefault(r => r.RecordKey == LotKey(plan.FromId, move.LotId)); if (src == null) continue;
            var key = LotKey(plan.ToId, move.LotId);
            if (move.Action == "aggiungi")
            {
                var payload = Parse(src.PayloadJson); payload["codiceContratto"] = Text(payload["codiceContratto"]); // keep as is
                upserts.Add(new ContractRow(key, "contract_lot", plan.ToId, move.LotId, src.Title.Replace(plan.FromName, plan.ToName), payload.ToJsonString()));
            }
            else if (move.Action == "completa")
            {
                var dest = Row(key); var dst = Parse(dest.PayloadJson); var s = Parse(src.PayloadJson);
                if (Count(dst["towPrices"]) == 0 && Count(s["towPrices"]) > 0) dst["towPrices"] = s["towPrices"]?.DeepClone();
                if (Count(dst["catalog"]) == 0 && Count(s["catalog"]) > 0) dst["catalog"] = s["catalog"]?.DeepClone();
                if (Count(dst["towImpact"]) == 0 && Count(s["towImpact"]) > 0) dst["towImpact"] = s["towImpact"]?.DeepClone();
                if (IsPlaceholderFile(Text(dst["priceFile"])) && !IsPlaceholderFile(Text(s["priceFile"]))) dst["priceFile"] = s["priceFile"]?.DeepClone();
                if (IsPlaceholderFile(Text(dst["catalogFile"])) && !IsPlaceholderFile(Text(s["catalogFile"]))) dst["catalogFile"] = s["catalogFile"]?.DeepClone();
                if (Text(dst["codiceContratto"]).Length == 0 && Text(s["codiceContratto"]).Length > 0) dst["codiceContratto"] = s["codiceContratto"]?.DeepClone();
                upserts.Add(dest with { PayloadJson = dst.ToJsonString() });
            }
        }
        foreach (var move in plan.SharedApps)
        {
            var src = rows.First(r => r.EntityType == "shared_applications" && r.ContractId == plan.FromId && r.LotId == move.LotKey);
            var key = $"{plan.ToId}|{move.LotKey}|shared_applications";
            if (move.Action == "aggiungi")
            { var p = Parse(src.PayloadJson); upserts.Add(new ContractRow(key, "shared_applications", plan.ToId, move.LotKey, $"Applicativi condivisi — contratto {plan.ToId}", p.ToJsonString())); }
            else if (move.Action == "completa")
            {
                var dest = rows.First(r => r.EntityType == "shared_applications" && r.ContractId == plan.ToId && r.LotId == move.LotKey);
                var dst = Parse(dest.PayloadJson); var list = dst["applications"] as JsonArray ?? new JsonArray(); var known = list.Select(AppIdentity).ToHashSet();
                foreach (var app in (Parse(src.PayloadJson)["applications"] as JsonArray) ?? new JsonArray()) if (known.Add(AppIdentity(app))) list.Add(app?.DeepClone());
                dst["applications"] = list; upserts.Add(dest with { PayloadJson = dst.ToJsonString() });
            }
        }
        foreach (var reference in plan.References)
        {
            var row = rows.First(r => r.RecordKey == reference.RecordKey); var p = Parse(row.PayloadJson);
            if (reference.Field == "catalogSource.contractId" && p["catalogSource"] is JsonObject cs) cs["contractId"] = plan.ToId;
            else if (reference.Field == "contractId") p["contractId"] = plan.ToId;
            upserts.Add(row with { PayloadJson = p.ToJsonString() });
        }
        foreach (var move in plan.Revisions)
        {
            var rev = revisions?.FirstOrDefault(r => r.Id == move.Id); if (rev == null) continue;
            revisionWrites.Add((rev.Id, Repoint(rev.PayloadJson, plan.ToId)));
        }
        deletes.Add(ContractKey(plan.FromId));
        deletes.AddRange(rows.Where(r => r.ContractId == plan.FromId && r.EntityType is "contract_lot" or "shared_applications").Select(r => r.RecordKey));
        return new Writes(upserts, deletes.Distinct().ToList(), revisionWrites);
    }
}
