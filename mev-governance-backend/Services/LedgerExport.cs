using System.Text;
using System.Text.Json;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Services;

// Writes the history back in the same shape as the file that is imported, so the file can be kept and shared and re-imported unchanged.
public static class LedgerExport
{
    static string Cell(string? value) => string.IsNullOrWhiteSpace(value) ? "—" : value.Replace("|", "\\|").Replace("\r", " ").Replace("\n", " ").Trim();
    static string Date(DateTime? value, string? text) => value != null ? value.Value.ToString("dd/MM/yyyy", System.Globalization.CultureInfo.InvariantCulture) : Cell(text);

    public static string Markdown(IReadOnlyCollection<LedgerInitiative> all, DateTime now, string? lastFile)
    {
        var sb = new StringBuilder();
        sb.AppendLine("# Stato delle iniziative").AppendLine();
        sb.AppendLine("| | |").AppendLine("|---|---|").AppendLine($"| Aggiornato al | {now.ToUniversalTime():dd/MM/yyyy} |");
        sb.AppendLine($"| Fonte | storico delle iniziative nel Configuratore{(lastFile != null ? $" (ultimo file importato: {lastFile})" : "")} |").AppendLine();
        sb.AppendLine("Le iniziative non sono raggruppate per release: la release, quando c'è, è indicata nella riga.").AppendLine();
        sb.AppendLine("## Indice").AppendLine();
        var sections = new (string Id, string Title, string[] Header)[]
        {
            ("rilasciata", "Rilasciate", new[] { "GOTO", "Titolo", "Sistema", "PM Poste", "Release", "Rilascio al collaudo", "Note" }),
            ("parziale", "Rilasciate parzialmente", new[] { "GOTO", "Titolo", "Sistema", "PM Poste", "Cosa è rilasciato", "Cosa manca" }),
            ("approvata", "Approvate", new[] { "GOTO", "Titolo", "Sistema", "PM Poste", "Release", "Rilascio al collaudo", "Note" }),
            ("in-approvazione", "In approvazione", new[] { "GOTO", "Titolo", "Sistema", "PM Poste", "Release prevista", "Note" }),
            ("in-analisi", "In analisi / stima", new[] { "GOTO", "Titolo", "Sistema", "PM Poste", "Release prevista", "Note" }),
            ("cr-da-stimare", "CR da stimare", new[] { "GOTO", "Titolo", "Sistema", "PM Poste", "Note" }),
        };
        for (var i = 0; i < sections.Length; i++) sb.AppendLine($"{i + 1}. [{sections[i].Title}](#{i + 1}-{sections[i].Title.ToLowerInvariant().Replace(" / ", "--").Replace(' ', '-')})");
        sb.AppendLine($"{sections.Length + 1}. [Riepilogo](#{sections.Length + 1}-riepilogo)").AppendLine().AppendLine("---").AppendLine();
        var counts = new List<(string, int)>();
        for (var i = 0; i < sections.Length; i++)
        {
            var (id, title, header) = sections[i];
            var rows = all.Where(r => r.Status == id).OrderBy(r => r.Goto ?? "~").ThenBy(r => r.System).ThenBy(r => r.Title).ToList();
            counts.Add((title, rows.Count));
            sb.AppendLine($"## {i + 1}. {title}").AppendLine();
            if (rows.Count == 0) { sb.AppendLine("_Nessuna iniziativa._").AppendLine(); continue; }
            sb.AppendLine("| " + string.Join(" | ", header) + " |").AppendLine("|" + string.Concat(header.Select(_ => "---|")));
            foreach (var r in rows)
            {
                var cells = header.Select(h => h switch
                {
                    "GOTO" => r.Goto ?? "TBD", "Titolo" => Cell(r.Title), "Sistema" => Cell(r.System), "PM Poste" => Cell(r.PmPoste), "Release" => Cell(r.Release), "Release prevista" => Cell(r.PlannedRelease),
                    "Rilascio al collaudo" => Date(r.CollaudoDate, r.CollaudoText), "Note" => Cell(r.Notes), "Cosa è rilasciato" => Cell(r.Released), "Cosa manca" => Cell(r.Missing), _ => "—",
                });
                sb.AppendLine("| " + string.Join(" | ", cells) + " |");
            }
            sb.AppendLine();
        }
        sb.AppendLine($"## {sections.Length + 1}. Riepilogo").AppendLine().AppendLine("| Stato | Numero di righe |").AppendLine("|---|---|");
        foreach (var (title, n) in counts) sb.AppendLine($"| {title} | {n} |");
        sb.AppendLine($"| **Totale** | **{counts.Sum(c => c.Item2)}** |");
        return sb.ToString();
    }
}
