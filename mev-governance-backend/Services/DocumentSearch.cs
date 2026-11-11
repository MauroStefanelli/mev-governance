using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace MevGovernanceBackend.Services;

public record SearchPassage(string Location, string Text);
public record Snippet(string Location, string Text, double Score);

// Search over the extracted text of an initiative. It is deliberately deterministic and database independent:
// the text is normalized (case, accents) and passages are ranked by how many distinct query terms they contain,
// with a bonus for the whole phrase and for rarer terms.
public static class DocumentSearch
{
    public const int MaxIndexedChars = 500_000;
    public const int SnippetLength = 320;
    public static readonly HashSet<string> Stop = new(StringComparer.Ordinal)
    { "il","lo","la","i","gli","le","un","uno","una","di","a","da","in","con","su","per","tra","fra","e","ed","o","che","del","della","dei","delle","al","alla","ai","alle","nel","nella","non","si","come","sono","questo","questa","the","and","of","to" };

    public static string Normalize(string? text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var decomposed = text.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed) if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(char.ToLowerInvariant(c));
        return Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
    }

    // Light Italian stemming: a final vowel is dropped from longer words, so "requisiti" finds "requisito" and
    // "prenotazione" finds "prenotazioni". Matching is by substring, so the stem matches every inflection.
    static string Stem(string term) => term.Length >= 6 && "aeiou".Contains(term[^1]) ? term[..^1] : term;

    public static List<string> Terms(string? query) => Regex.Matches(Normalize(query), @"[\p{L}\p{N}][\p{L}\p{N}_\-\.]*")
        .Select(m => m.Value.Trim('.', '-', '_')).Where(t => t.Length >= 2 && !Stop.Contains(t)).Select(Stem).Distinct().Take(12).ToList();

    // Flattened, normalized text stored once per document so that a query is a simple scan of the database column.
    public static string BuildIndex(IEnumerable<SearchPassage> passages)
    {
        var sb = new StringBuilder();
        foreach (var p in passages)
        {
            if (sb.Length >= MaxIndexedChars) break;
            sb.Append(Normalize(p.Text)).Append('\n');
        }
        return sb.Length > MaxIndexedChars ? sb.ToString(0, MaxIndexedChars) : sb.ToString();
    }

    // Score of one passage for the query terms. 0 means it does not match.
    public static double Score(string passage, IReadOnlyList<string> terms, string phrase)
    {
        if (terms.Count == 0) return 0;
        var text = Normalize(passage);
        var hits = terms.Count(t => text.Contains(t, StringComparison.Ordinal));
        if (hits == 0) return 0;
        var score = (double)hits / terms.Count * 10;
        if (hits == terms.Count) score += 5;
        if (phrase.Length > 3 && text.Contains(phrase, StringComparison.Ordinal)) score += 8;
        score += Math.Min(3, terms.Sum(t => Count(text, t)) * 0.2);
        return Math.Round(score, 2);
    }
    static int Count(string text, string term)
    {
        var count = 0; var index = 0;
        while (count < 50 && (index = text.IndexOf(term, index, StringComparison.Ordinal)) >= 0) { count++; index += term.Length; }
        return count;
    }

    // A short window of the original passage around the first match, so users can see why it matched.
    public static string Excerpt(string text, IReadOnlyList<string> terms)
    {
        var plain = Regex.Replace(text ?? "", @"\s+", " ").Trim();
        if (plain.Length <= SnippetLength) return plain;
        var folded = Normalize(plain);
        var first = terms.Select(t => folded.IndexOf(t, StringComparison.Ordinal)).Where(i => i >= 0).DefaultIfEmpty(0).Min();
        // Normalization can shorten the string (removed marks): keep the position within the original text.
        first = Math.Min(first, plain.Length - 1);
        var start = Math.Max(0, first - SnippetLength / 4);
        var end = Math.Min(plain.Length, start + SnippetLength);
        return (start > 0 ? "…" : "") + plain[start..end].Trim() + (end < plain.Length ? "…" : "");
    }

    public static List<Snippet> Rank(IEnumerable<SearchPassage> passages, string query, int take)
    {
        var terms = Terms(query); var phrase = Normalize(query);
        return passages.Select(p => (p, s: Score(p.Text, terms, phrase))).Where(x => x.s > 0)
            .OrderByDescending(x => x.s).ThenBy(x => x.p.Location, StringComparer.Ordinal).Take(take)
            .Select(x => new Snippet(x.p.Location, Excerpt(x.p.Text, terms), x.s)).ToList();
    }

    // Does the flattened document index contain at least one term? Cheap pre-filter before loading passages.
    public static bool MayMatch(string? index, IReadOnlyList<string> terms) => !string.IsNullOrEmpty(index) && terms.Any(t => index.Contains(t, StringComparison.Ordinal));
}
