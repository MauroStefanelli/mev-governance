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
    // Una risposta lunga e' una risposta utile (analisi di impatto, as-is/to-be): il limite serve solo a non riempire il database di testo fuori controllo.
    // Sta sopra a quanto il modello puo' scrivere (4096 token ~ 14.000 caratteri), cosi' non taglia mai il testo di una risposta normale.
    public const int MaxAnswerLength = 20000;
    public const string CutNotice = "\n\n⚠ Risposta interrotta: il servizio AI ha raggiunto il limite di lunghezza e il testo si ferma qui, a metà. Chiedi di continuare («continua dal punto in cui ti sei fermato») oppure dividi la richiesta in parti più piccole.";

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

    // Taglia solo oltre MaxAnswerLength, e allora lo DICE: un testo che si ferma a meta' parola senza avvisare sembra una risposta completa.
    static string Clip(string answer)
    {
        if (answer.Length <= MaxAnswerLength) return answer;
        var cut = answer[..MaxAnswerLength]; var lastBreak = cut.LastIndexOfAny(new[] { '\n', '.', ';' });
        return (lastBreak > MaxAnswerLength - 1500 ? cut[..(lastBreak + 1)] : cut).TrimEnd() + "\n\n⚠ Risposta accorciata: superava " + MaxAnswerLength.ToString("N0", System.Globalization.CultureInfo.GetCultureInfo("it-IT")) + " caratteri.";
    }

    // Quando il servizio AI ha interrotto la risposta per il suo limite e il JSON e' rimasto a meta', il testo gia' scritto non va perso: si recupera il campo "answer" dal testo grezzo.
    public static RationaleReply? Recover(JsonObject response)
    {
        var raw = Text(response["rawText"]);
        if (raw.Length == 0) return null;
        var m = System.Text.RegularExpressions.Regex.Match(raw, "\"(?:answer|risposta)\"\\s*:\\s*\"", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!m.Success) return null;
        var sb = new System.Text.StringBuilder();
        for (var i = m.Index + m.Length; i < raw.Length; i++)
        {
            var c = raw[i];
            if (c == '"') break;                                     // la stringa si e' chiusa: il testo e' completo fino a qui
            if (c != '\\') { sb.Append(c); continue; }
            if (++i >= raw.Length) break;
            switch (raw[i])
            {
                case 'n': sb.Append('\n'); break; case 't': sb.Append('\t'); break; case 'r': break; case '"': sb.Append('"'); break; case '\\': sb.Append('\\'); break; case '/': sb.Append('/'); break;
                case 'u' when i + 4 < raw.Length && int.TryParse(raw.AsSpan(i + 1, 4), System.Globalization.NumberStyles.HexNumber, null, out var code): sb.Append((char)code); i += 4; break;
                default: sb.Append(raw[i]); break;
            }
        }
        var answer = sb.ToString().Trim();
        return answer.Length == 0 ? null : new RationaleReply(Clip(answer), new List<ProposedEntry>(), new List<string>());
    }

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
            return new RationaleReply(Clip(answer), proposals,
                Strings(candidate["questions"] ?? candidate["domande"] ?? candidate["daConfermare"]));
        }
        return null;
    }
}
