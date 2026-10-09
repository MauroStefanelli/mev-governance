using System.Text;
using System.Text.RegularExpressions;
using UglyToad.PdfPig;

namespace MevGovernanceBackend.Services;

public static class GaraSectionContext
{
    private static readonly Regex IndexEntry = new(
        @"(?<![\d.])(?<numero>\d+(?:\.\d+)*)\s+(?<titolo>.{1,200}?)\s*\.{3,}\s*(?<pagina>\d{1,4})(?=\s|$)",
        RegexOptions.Compiled);

    public static string Extract(Stream stream, int maxChars = 48000)
    {
        using var pdf = PdfDocument.Open(stream);
        var pages = pdf.GetPages().Select(page => (page.Number, Text: string.Join(" ", page.GetWords().Select(word => word.Text.Trim())))).ToList();
        return Build(pages, maxChars);
    }

    // L'indice identifica i titoli; gli estratti provengono dalle pagine del contenuto.
    // Il budget viene diviso tra i paragrafi, evitando il taglio delle sole prime pagine.
    public static string Build(IReadOnlyList<(int Number, string Text)> pages, int maxChars = 48000)
    {
        if (maxChars < 1000) throw new ArgumentOutOfRangeException(nameof(maxChars));
        // Rimuove il riquadro editoriale ripetuto, senza consumare il budget della sintesi.
        pages = pages.Select(page => (page.Number, Regex.Replace(page.Text,
            @"TIPO\s+DOCUMENTO\s+TITOLO\s+Pagina\s+\d+\s+di\s+\d+\s+CAPITOLATO.*?CAPITOLATO\s+TECNICO",
            "", RegexOptions.IgnoreCase | RegexOptions.Singleline))).ToList();
        var indexPages = pages.Where(page => IndexEntry.Matches(page.Text).Count >= 3).ToList();
        var sections = indexPages.SelectMany(page => IndexEntry.Matches(page.Text).Cast<Match>())
            .Select(match => (Number: match.Groups["numero"].Value, Title: match.Groups["titolo"].Value.Trim()))
            .DistinctBy(entry => entry.Number).ToList();
        var indexPageNumbers = indexPages.Select(page => page.Number).ToHashSet();
        var contentPages = pages.Where(page => !indexPageNumbers.Contains(page.Number)).ToList();
        var excerpts = new List<string>();
        if (sections.Count > 0)
        {
            var perSection = Math.Clamp((maxChars - 2000) / sections.Count - 120, 150, 1800);
            foreach (var section in sections)
            {
                // Il PDF può separare le lettere dei titoli in maiuscolo o cambiare i trattini.
                var letters = Regex.Replace(section.Title, @"[^\p{L}\p{N}]", "");
                if (letters.Length == 0) continue;
                var titlePattern = string.Join(@"[\s\p{P}]*", letters.Select(letter => Regex.Escape(letter.ToString())));
                var heading = new Regex($@"(?<![\d.]){Regex.Escape(section.Number)}\s+{titlePattern}", RegexOptions.IgnoreCase);
                var found = false;
                foreach (var page in contentPages)
                {
                    var match = heading.Match(page.Text);
                    if (!match.Success) continue;
                    var content = page.Text.Substring(match.Index + match.Length);
                    if (content.Length < perSection)
                    {
                        var next = pages.FirstOrDefault(p => p.Number == page.Number + 1);
                        if (next.Text != null) content += $" [Pag.{next.Number}] " + next.Text;
                    }
                    if (content.Length > perSection) content = content[..perSection] + " [estratto parziale]";
                    excerpts.Add($"[Pag.{page.Number}] Paragrafo {section.Number} - {section.Title}\n{content.Trim()}");
                    found = true;
                    break;
                }
                if (!found) excerpts.Add($"Paragrafo {section.Number} - {section.Title} [solo titolo nell'indice; contenuto non individuato]");
            }
        }
        else
        {
            // Per PDF senza indice distribuire il testo su tutte le pagine, con fonte esplicita.
            var budget = Math.Max(100, (maxChars - 2000) / Math.Max(1, contentPages.Count) - 35);
            excerpts.AddRange(contentPages.Select(page => $"[Pag.{page.Number}] {page.Text[..Math.Min(budget, page.Text.Length)]} [estratto parziale]"));
        }
        var result = new StringBuilder();
        if (pages.Count > 0) result.AppendLine($"[Pag.{pages[0].Number}] {pages[0].Text[..Math.Min(1500, pages[0].Text.Length)]}");
        result.AppendLine("ESTRATTI DEI PARAGRAFI: testo parziale, non inventare dettagli assenti.");
        foreach (var excerpt in excerpts)
        {
            if (result.Length + excerpt.Length + 1 > maxChars) break;
            result.AppendLine(excerpt);
        }
        return result.ToString();
    }
}
