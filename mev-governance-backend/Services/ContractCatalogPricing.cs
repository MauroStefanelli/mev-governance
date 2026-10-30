using System.Globalization;
using System.Text.Json.Nodes;
namespace MevGovernanceBackend.Services;

public static class ContractCatalogPricing
{
    private static readonly string[] Bands = { "Semplice", "Medio", "Complesso" };
    private static decimal? Number(JsonNode? value) => value != null && decimal.TryParse(value.ToString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) && n >= 0 ? n : null;
    private static decimal? Offered(JsonNode row, string band) => (row["prezziOfferto"] as JsonArray)?
        .FirstOrDefault(p => string.Equals(p?["fascia"]?.ToString(), band, StringComparison.OrdinalIgnoreCase)) is JsonNode p ? Number(p["valore"]) : null;

    public static JsonObject Prices(JsonNode row, bool offered)
    {
        var realization = new JsonObject(); var modification = new JsonObject();
        var medium = Offered(row, "Medio");
        for (int i = 0; i < Bands.Length; i++)
        {
            var band = Bands[i];
            realization[band] = offered ? Offered(row, band) : Number(row[$"prezzoRealizzazione{band}"] ?? row[$"prezzi{band}"]);
            modification[band] = offered ? (medium.HasValue ? Math.Round(medium.Value * new[] { .10m, .30m, .50m }[i], 2, MidpointRounding.AwayFromZero) : null)
                : Number(row[$"prezzoModifica{band}"] ?? row[$"mod{band}"]);
        }
        return new JsonObject { ["REALIZZAZIONE"] = realization, ["MODIFICA"] = modification };
    }

    // Only fill absent values, matching the stable contract driver ID. Never replace
    // an existing price (including zero) or guess a match by name or array order.
    public static int RecoverMissing(JsonArray catalog, JsonArray source, bool offered = false)
    {
        int recovered = 0;
        foreach (var entry in catalog.OfType<JsonObject>())
        {
            var id = entry["id"]?.ToString();
            if (string.IsNullOrWhiteSpace(id)) continue;
            var matches = source.Where(s => s?["id"]?.ToString() == id).ToList();
            if (matches.Count != 1 || matches[0] == null) continue;
            var prices = Prices(matches[0]!, offered);
            if (!offered) entry["basePrices"] = prices.DeepClone();
            if (entry["prezzi"] is not JsonObject) entry["prezzi"] = new JsonObject();
            if (!offered && entry["priceBasis"]?.ToString() == "offerto")
            {
                entry["offeredPrices"] = entry["prezzi"]!.DeepClone();
                entry["prezzi"] = new JsonObject();
                entry["priceBasis"] = "base-asta";
            }
            var target = entry["prezzi"]!.AsObject();
            foreach (var type in new[] { "REALIZZAZIONE", "MODIFICA" })
            {
                var key = target.Select(k => k.Key).FirstOrDefault(k => k.Equals(type, StringComparison.OrdinalIgnoreCase)) ?? type;
                if (target[key] is not JsonObject) target[key] = new JsonObject();
                foreach (var band in Bands)
                {
                    var bandKey = target[key]!.AsObject().Select(k => k.Key).FirstOrDefault(k => k.Equals(band, StringComparison.OrdinalIgnoreCase)) ?? band;
                    if (target[key]![bandKey] == null && prices[type]![band] != null)
                    { target[key]![bandKey] = prices[type]![band]!.DeepClone(); recovered++; }
                }
            }
        }
        return recovered;
    }
}
