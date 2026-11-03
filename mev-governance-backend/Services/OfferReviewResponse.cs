using System.Text.Json.Nodes;

namespace MevGovernanceBackend.Services;

public static class OfferReviewResponse
{
    // Normalize transport/schema variations only. Never infer a technical verdict.
    public static JsonArray Normalize(JsonObject response)
    {
        JsonNode? source = response["reviews"] ?? response["Reviews"] ?? (response["analysis"] as JsonObject)?["reviews"] ?? (response["result"] as JsonObject)?["reviews"];
        if (source == null && response["rowId"] != null) source = new JsonArray(response.DeepClone());
        if (source == null && response["rawText"] is JsonValue raw && raw.TryGetValue<string>(out var text))
        {
            try
            {
                var start = text.IndexOf('['); var end = text.LastIndexOf(']');
                if (start >= 0 && end > start) source = JsonNode.Parse(text[start..(end + 1)]);
            }
            catch (System.Text.Json.JsonException) { }
        }
        return source is JsonArray array ? (JsonArray)array.DeepClone() : new JsonArray();
    }

    public static JsonObject? ValidRow(JsonArray reviews, string rowId)
    {
        var matches = reviews.OfType<JsonObject>().Where(r => r["rowId"]?.ToString() == rowId).ToList();
        if (matches.Count != 1) return null;
        var row = matches[0];
        if (row["status"]?.ToString() is not ("coerente" or "da_verificare" or "non_coerente")
            || row["reason"] is not JsonValue reason || !reason.TryGetValue<string>(out var message) || string.IsNullOrWhiteSpace(message)) return null;
        return (JsonObject)row.DeepClone();
    }
}
