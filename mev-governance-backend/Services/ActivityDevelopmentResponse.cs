using System.Text.Json.Nodes;

namespace MevGovernanceBackend.Services;

public static class ActivityDevelopmentResponse
{
    // Normalize presentation only: never fill absent technical content.
    public static JsonObject? Normalize(JsonObject response)
    {
        var candidates = new List<JsonObject> { response };
        foreach (var key in new[] { "analysis", "result", "plan", "scheda", "data" })
            if (response[key] is JsonObject nested) candidates.Add(nested);
        foreach (var candidate in candidates)
        {
            string Read(params string[] keys)
            {
                var node = keys.Select(k => candidate[k]).FirstOrDefault(n => n != null);
                if (node is JsonValue value && value.TryGetValue<string>(out var text)) return text.Trim();
                if (node is JsonArray array && array.All(n => n is JsonValue v && v.TryGetValue<string>(out _)))
                    return string.Join("\n", array.Select(n => n!.GetValue<string>()));
                return "";
            }
            var solution = Read("solution", "soluzione", "soluzioneTecnica", "technicalSolution");
            var acceptance = Read("acceptance", "criteriAccettazione", "acceptanceCriteria", "criteri_di_accettazione");
            if (string.IsNullOrWhiteSpace(solution) || string.IsNullOrWhiteSpace(acceptance)) continue;
            return new JsonObject {
                ["solution"] = solution, ["acceptance"] = acceptance,
                ["openQuestions"] = Read("openQuestions", "puntiAperti", "questions"),
                ["evidence"] = candidate["evidence"] is JsonArray evidence ? evidence.DeepClone() : new JsonArray(),
                ["hypothesizedFiles"] = candidate["hypothesizedFiles"] is JsonArray hypotheses ? hypotheses.DeepClone() : new JsonArray(),
            };
        }
        return null;
    }
}
