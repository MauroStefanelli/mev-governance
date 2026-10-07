using System.Text.Json.Nodes;
namespace MevGovernanceBackend.Services;

internal static class GaraSectionDiagnostics
{
    // Conta i campi nella risposta parsata prima di qualsiasi normalizzazione frontend.
    // Non sostituisce una sintesi mancante con testo inventato.
    public static JsonObject Inspect(JsonObject analysis)
    {
        var sections = new List<JsonObject>();
        void Add(JsonNode? node)
        {
            if (node is JsonArray array) sections.AddRange(array.OfType<JsonObject>());
        }
        Add(analysis["sezioni"]);
        if (analysis["lotti"] is JsonArray lotti)
            foreach (var lot in lotti.OfType<JsonObject>()) Add(lot["sezioni"]);
        int missing = 0, empty = 0, invalid = 0, present = 0;
        foreach (var section in sections)
        {
            if (!section.TryGetPropertyValue("sintesi", out var value)) missing++;
            else if (value is null) empty++;
            else if (value is JsonValue json && json.TryGetValue<string>(out var text))
            {
                if (string.IsNullOrWhiteSpace(text)) empty++; else present++;
            }
            else invalid++;
        }
        return new JsonObject { ["totale"] = sections.Count, ["conSintesi"] = present,
            ["sintesiAssente"] = missing, ["sintesiVuota"] = empty, ["sintesiNonValida"] = invalid };
    }
}
