using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace MevGovernanceBackend.Services;

internal sealed record GaraSourceSection(string Numero, string Titolo, string Contenuto);

internal static class GaraAiOutput
{
    internal static string FinishReason(JsonObject response) =>
        response["choices"] is JsonArray { Count: > 0 } choices
            ? choices[0]?["finish_reason"]?.ToString() ?? ""
            : response["status"]?.ToString() == "incomplete"
                ? response["incomplete_details"]?["reason"]?.ToString() ?? "incomplete" : "";

    internal static bool Truncated(JsonObject response) => response["status"]?.ToString() == "incomplete" ||
        FinishReason(response) is "length" or "max_output_tokens" or "incomplete";

    internal static bool Refused(JsonObject response) => FinishReason(response) == "content_filter" ||
        (response["choices"] is JsonArray { Count: > 0 } choices &&
         !string.IsNullOrWhiteSpace(choices[0]?["message"]?["refusal"]?.ToString())) ||
        (response["output"] is JsonArray output && output.OfType<JsonObject>().Any(item =>
            item["content"] is JsonArray content && content.Any(part => part?["type"]?.ToString() == "refusal")));

    internal static List<GaraSourceSection> Sections(string source)
    {
        var headings = Regex.Matches(source, @"(?m)^(?:\[Pag\.\d+\]\s+)?Paragrafo (?<numero>\d+(?:\.\d+)*) - (?<titolo>[^\r\n]+)");
        var result = new List<GaraSourceSection>();
        for (var i = 0; i < headings.Count; i++)
        {
            var heading = headings[i];
            var end = i + 1 < headings.Count ? headings[i + 1].Index : source.Length;
            var title = heading.Groups["titolo"].Value.Trim();
            var content = source.Substring(heading.Index + heading.Length, end - heading.Index - heading.Length).Trim();
            if (title.Contains("[solo titolo nell'indice; contenuto non individuato]"))
            {
                title = title.Replace("[solo titolo nell'indice; contenuto non individuato]", "").Trim();
                content = "";
            }
            result.Add(new(heading.Groups["numero"].Value, title, content));
        }
        return result.DistinctBy(section => section.Numero).ToList();
    }

    internal static int? LotOwner(GaraSourceSection section, IReadOnlyList<GaraSourceSection> all)
    {
        foreach (var ancestor in all.Where(candidate => section.Numero == candidate.Numero || section.Numero.StartsWith(candidate.Numero + "."))
                     .OrderByDescending(candidate => candidate.Numero.Length))
        {
            var match = Regex.Match(ancestor.Titolo, @"\blotto\s+(\d+)\b", RegexOptions.IgnoreCase);
            if (match.Success && int.TryParse(match.Groups[1].Value, out var number)) return number;
        }
        return null;
    }
}
