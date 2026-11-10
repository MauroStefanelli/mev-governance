using System.Text.Json.Nodes;

namespace MevGovernanceBackend.Services;

public record ProposedEntry(string Kind, string Text, string? InterventionId);
public record RationaleReply(string Answer, List<ProposedEntry> Proposals, List<string> Questions);

// Reads the AI answer for the rationale chat. It only normalizes presentation: it never invents entries,
// and it drops anything that is not clearly a rationale, constraint or decision.
public static class RationaleResponse
{
    public static readonly string[] Kinds = { "razionale", "vincolo", "decisione" };
    public const int MaxEntries = 8;
    public const int MaxEntryLength = 600;

    static string Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var text) ? text.Trim() : "";

    static string NormalizeKind(string raw)
    {
        var value = raw.Trim().ToLowerInvariant();
        if (value.StartsWith("vinc") || value.StartsWith("constr")) return "vincolo";
        if (value.StartsWith("decis")) return "decisione";
        if (value.StartsWith("raz") || value.StartsWith("rat") || value.StartsWith("motiv")) return "razionale";
        return "";
    }

    static List<string> Strings(JsonNode? node) => node is JsonArray array
        ? array.Select(Text).Where(t => t.Length > 0).Take(6).ToList()
        : Text(node) is { Length: > 0 } single ? new List<string> { single } : new List<string>();

    public static RationaleReply? Normalize(JsonObject response)
    {
        var candidates = new List<JsonObject> { response };
        foreach (var key in new[] { "analysis", "result", "response", "data" })
            if (response[key] is JsonObject nested) candidates.Add(nested);
        foreach (var candidate in candidates)
        {
            var answer = new[] { "answer", "risposta", "sintesi", "reply", "message" }.Select(k => Text(candidate[k])).FirstOrDefault(t => t.Length > 0) ?? "";
            if (answer.Length == 0) continue;
            var proposals = new List<ProposedEntry>();
            var source = new[] { "proposals", "proposte", "entries", "voci" }.Select(k => candidate[k]).OfType<JsonArray>().FirstOrDefault();
            if (source != null)
                foreach (var item in source.OfType<JsonObject>())
                {
                    var kind = NormalizeKind(Text(item["kind"]) is { Length: > 0 } k ? k : Text(item["tipo"]));
                    var text = Text(item["text"]) is { Length: > 0 } t ? t : Text(item["testo"]);
                    if (kind.Length == 0 || text.Length == 0) continue;
                    if (text.Length > MaxEntryLength) text = text[..MaxEntryLength].TrimEnd() + "…";
                    if (proposals.Any(p => string.Equals(p.Text, text, StringComparison.OrdinalIgnoreCase))) continue;
                    var intervention = Text(item["interventionId"]) is { Length: > 0 } i ? i : Text(item["intervento"]);
                    proposals.Add(new ProposedEntry(kind, text, intervention.Length == 0 ? null : intervention[..Math.Min(intervention.Length, 120)]));
                    if (proposals.Count == MaxEntries) break;
                }
            return new RationaleReply(answer.Length > 6000 ? answer[..6000] : answer, proposals,
                Strings(candidate["questions"] ?? candidate["domande"] ?? candidate["daConfermare"]));
        }
        return null;
    }
}
