using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using ClosedXML.Excel;
using System.Text.RegularExpressions;

namespace MevGovernanceBackend.Services;

/// <summary>
/// Porta la logica di parseCatalogPdf / parseTowPriceFile dall'app standalone JS.
/// Stessa logica geometrica (coordinate x/y, zone proporzionali alla larghezza pagina).
/// </summary>
public static class ContractParserService
{
    // ─────────────────────────────────────────────────────────────────────────
    // CATALOGO PDF
    // Ogni voce di catalogo ha:
    //   id (numero a sx <7% larghezza), nome, ambito, descrizione,
    //   criteri (Semplice/Medio/Complesso), prezzi REALIZZAZIONE e MODIFICA (6 valori)
    // ─────────────────────────────────────────────────────────────────────────
    public static List<CatalogEntry> ParseCatalogPdf(Stream pdfStream, int lot)
    {
        var out_ = new List<CatalogEntry>();

        using var doc = PdfDocument.Open(pdfStream);
        foreach (var page in doc.GetPages())
        {
            var w = page.Width;
            var h = page.Height;

            // Raccoglie tutti i word items con coordinate
            var items = page.GetWords()
                .Select(wd => new PdfItem
                {
                    Text = wd.Text.Trim(),
                    X = wd.BoundingBox.Left,
                    Y = wd.BoundingBox.Bottom
                })
                .Where(x => !string.IsNullOrEmpty(x.Text))
                .ToList();

            // Identifica le righe-ID: numero 2-5 cifre nella colonna sinistra (<7% larghezza)
            var ids = items
                .Where(x => x.X / w < 0.07 && Regex.IsMatch(x.Text, @"^\d{2,5}$"))
                .OrderByDescending(x => x.Y)
                .ToList();

            for (int i = 0; i < ids.Count; i++)
            {
                var id = ids[i];
                double top = i == 0
                    ? id.Y + (id.Y - (ids.ElementAtOrDefault(1)?.Y ?? id.Y - 40)) / 2.0
                    : (ids[i - 1].Y + id.Y) / 2.0;
                double bottom = i == ids.Count - 1
                    ? 0
                    : (id.Y + ids[i + 1].Y) / 2.0;

                var row = items.Where(x => x.Y <= top && x.Y > bottom).ToList();

                // Prezzi: colonna >70% larghezza — usa IsMoneyToken per supportare tutti i formati
                var prices = row
                    .Where(x => x.X / w > 0.70 && IsMoneyToken(x.Text))
                    .OrderBy(x => x.X)
                    .Select(x => ParseMoney(x.Text))
                    .Take(6)
                    .ToList();

                // Richiedi esattamente 6 prezzi come il parser JS originale (3 realizzazione + 3 modifica)
                if (prices.Count < 6) continue;

                var name = ZoneText(row, w * 0.09, w * 0.185)
                    .Replace("Nome Driver", "", StringComparison.OrdinalIgnoreCase).Trim();
                var ambito = ZoneText(row, w * 0.057, w * 0.09)
                    .Replace("Ambito driver", "", StringComparison.OrdinalIgnoreCase).Trim();
                var descrizione = ZoneText(row, w * 0.185, w * 0.40)
                    .Replace("Descrizione Driver", "", StringComparison.OrdinalIgnoreCase).Trim();
                var semplice = ZoneText(row, w * 0.40, w * 0.51);
                var medio    = ZoneText(row, w * 0.51, w * 0.62);
                var complesso = ZoneText(row, w * 0.62, w * 0.70);

                if (string.IsNullOrEmpty(name)) continue;

                out_.Add(new CatalogEntry
                {
                    Lotto       = lot,
                    Id          = int.TryParse(id.Text, out var idN) ? idN : 0,
                    Ambito      = ambito,
                    Nome        = name,
                    Descrizione = descrizione,
                    Criteri = new CriteriEntry
                    {
                        Semplice  = semplice,
                        Medio     = medio,
                        Complesso = complesso
                    },
                    Prezzi = new PrezziEntry
                    {
                        Realizzazione = new ComplexityPrices
                        {
                            Semplice  = prices.Count > 0 ? prices[0] : 0,
                            Medio     = prices.Count > 1 ? prices[1] : 0,
                            Complesso = prices.Count > 2 ? prices[2] : 0,
                        },
                        Modifica = new ComplexityPrices
                        {
                            Semplice  = prices.Count > 3 ? prices[3] : 0,
                            Medio     = prices.Count > 4 ? prices[4] : 0,
                            Complesso = prices.Count > 5 ? prices[5] : 0,
                        }
                    },
                    Pagina = page.Number
                });
            }
        }

        return out_;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LISTINO TOW — Excel (.xlsx)  O  PDF
    // Output: { "TOW01.1": 12345.00, "TOW01.2": ... }
    // ─────────────────────────────────────────────────────────────────────────
    public static Dictionary<string, double> ParseTowPriceExcel(Stream xlsxStream, int lot)
    {
        var prices = new Dictionary<string, double>();
        using var wb = new XLWorkbook(xlsxStream);
        var ws = wb.Worksheets.First();

        foreach (var row in ws.RowsUsed())
        {
            var cells = row.CellsUsed().ToList();
            for (int i = 0; i < cells.Count; i++)
            {
                var cellText = cells[i].GetString();
                var m = Regex.Match(cellText, $@"TOW\s*0?{lot}\.(\d+)", RegexOptions.IgnoreCase);
                if (!m.Success) continue;
                // Cerca il primo valore numerico positivo nelle celle successive
                var value = cells.Skip(i + 1)
                    .Select(c =>
                    {
                        var v = c.GetValue<double?>();
                        return v;
                    })
                    .FirstOrDefault(n => n.HasValue && n.Value > 0);

                if (value.HasValue)
                    prices[$"TOW0{lot}.{m.Groups[1].Value}"] = value.Value;
            }
        }
        return prices;
    }

    public static Dictionary<string, double> ParseTowPricePdf(Stream pdfStream, int lot)
    {
        var prices = new Dictionary<string, double>();
        using var doc = PdfDocument.Open(pdfStream);
        foreach (var page in doc.GetPages())
        {
            var items = page.GetWords()
                .Select(wd => new PdfItem
                {
                    Text = wd.Text.Trim(),
                    X = wd.BoundingBox.Left,
                    Y = wd.BoundingBox.Bottom
                })
                .Where(x => !string.IsNullOrEmpty(x.Text))
                .ToList();

            // Raggruppa per riga (Y arrotondato a multipli di 3)
            var lines = items
                .GroupBy(x => (int)(Math.Round(x.Y / 3.0) * 3))
                .ToDictionary(g => g.Key, g => g.OrderBy(x => x.X).ToList());

            foreach (var (_, lineItems) in lines)
            {
                var txt = string.Join(" ", lineItems.Select(x => x.Text));
                var m = Regex.Match(txt, $@"TOW\s*0?{lot}\.(\d+)", RegexOptions.IgnoreCase);
                if (!m.Success) continue;

                // Cerca valori monetari con IsMoneyToken (gestisce €, formati con/senza sep. migliaia)
                var nums = new List<double>();
                foreach (var word in lineItems.Select(x => x.Text))
                {
                    if (IsMoneyToken(word))
                        nums.Add(ParseMoney(word));
                }

                if (nums.Count > 0)
                    prices[$"TOW0{lot}.{m.Groups[1].Value}"] = nums.Last();
            }
        }
        return prices;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Utility
    // ─────────────────────────────────────────────────────────────────────────
    private static string ZoneText(List<PdfItem> items, double minX, double maxX)
        => string.Join(" ", items
            .Where(x => x.X >= minX && x.X < maxX)
            .OrderByDescending(x => x.Y)
            .ThenBy(x => x.X)
            .Select(x => x.Text))
            .Replace("  ", " ").Trim();

    private static double ParseMoney(string s)
    {
        // Identico al JS originale: parseMoney = s => Number(s.replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))
        // Prima rimuovi separatori migliaia (punti), poi converti virgola decimale, poi rimuovi tutto il non-numerico
        var clean = Regex.Replace(s, @"\s", "")   // spazi
                         .Replace("€", "")         // simbolo euro attaccato
                         .Replace("£", "");         // altri simboli valuta

        // Formato italiano: 1.234,56 → prima rimuovi punti migliaia, poi converti virgola
        if (Regex.IsMatch(clean, @"^\d{1,3}(?:\.\d{3})+,\d{2}$"))
        {
            clean = clean.Replace(".", "").Replace(",", ".");
        }
        else if (Regex.IsMatch(clean, @"^\d{1,7},\d{2}$"))
        {
            // Formato senza separatori migliaia: 3607,00
            clean = clean.Replace(",", ".");
        }
        else
        {
            // Fallback: rimuovi tutto il non-numerico tranne punto e meno
            clean = Regex.Replace(clean.Replace(",", "."), @"[^0-9.\-]", "");
        }

        return double.TryParse(clean, System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0;
    }

    // Controlla se una stringa rappresenta un valore monetario in formato italiano
    private static bool IsMoneyToken(string text)
    {
        // Rimuovi simbolo euro eventualmente attaccato
        var t = text.Replace("€", "").Replace("£", "").Trim();
        if (string.IsNullOrEmpty(t)) return false;
        // Con separatori migliaia: 1.234,56
        if (Regex.IsMatch(t, @"^\d{1,3}(?:\.\d{3})+,\d{2}$")) return true;
        // Senza separatori migliaia: 3607,00
        if (Regex.IsMatch(t, @"^\d{1,7},\d{2}$")) return true;
        return false;
    }

    private class PdfItem
    {
        public string Text { get; set; } = "";
        public double X { get; set; }
        public double Y { get; set; }
    }

    // ── Estrae righe TOW complete dal PDF (id, descrizione, quantità, importo) ──
    // Legge ogni riga che contiene un codice TOW (es. TOW01.1) e raccoglie
    // tutta la parte testuale come descrizione + i valori numerici come importo/quantità.
    public static List<TowRow> ExtractTowRows(Stream pdfStream)
    {
        var rows = new List<TowRow>();
        using var doc = PdfDocument.Open(pdfStream);
        foreach (var page in doc.GetPages())
        {
            var items = page.GetWords()
                .Select(wd => new PdfItem { Text = wd.Text.Trim(), X = wd.BoundingBox.Left, Y = wd.BoundingBox.Bottom })
                .Where(x => !string.IsNullOrEmpty(x.Text))
                .ToList();

            // Raggruppa per riga (Y arrotondato a multipli di 3)
            var lines = items
                .GroupBy(x => (int)(Math.Round(x.Y / 3.0) * 3))
                .OrderByDescending(g => g.Key)
                .ToDictionary(g => g.Key, g => g.OrderBy(x => x.X).ToList());

            foreach (var (_, lineItems) in lines)
            {
                var txt = string.Join(" ", lineItems.Select(x => x.Text));
                var mTow = Regex.Match(txt, @"TOW\s*0?(\d+)\.(\d+)", RegexOptions.IgnoreCase);
                if (!mTow.Success) continue;

                var codice = $"TOW0{mTow.Groups[1].Value}.{mTow.Groups[2].Value}";

                // Tutto il testo non numerico dopo il codice TOW = descrizione
                var afterTow = txt.Substring(mTow.Index + mTow.Length).Trim();
                var descParts = new System.Text.StringBuilder();
                var nums = new List<double>();
                foreach (var word in afterTow.Split(' ', StringSplitOptions.RemoveEmptyEntries))
                {
                    // Percentuali → ignora
                    if (Regex.IsMatch(word, @"^\d+[,.]\d+%$")) continue;
                    // Simbolo euro standalone → ignora
                    if (word == "€" || word == "£") continue;

                    if (IsMoneyToken(word))
                        nums.Add(ParseMoney(word));
                    else if (Regex.IsMatch(word, @"^\d+$") && int.TryParse(word, out var intVal) && intVal > 0)
                        nums.Add(intVal);
                    else
                        descParts.Append(word).Append(' ');
                }

                var descrizione = descParts.ToString().Trim();
                // Se descrizione vuota, cerca anche a sinistra del codice TOW
                if (string.IsNullOrEmpty(descrizione))
                {
                    var beforeTow = txt.Substring(0, mTow.Index).Trim();
                    // Rimuovi eventuali numeri iniziali (numeri di riga)
                    descrizione = Regex.Replace(beforeTow, @"^\d+\s*", "").Trim();
                }

                double? quantita = nums.Count >= 2 ? nums[0] : (double?)null;
                double? importo  = nums.Count >= 2 ? nums[^1] : (nums.Count == 1 ? nums[0] : (double?)null);

                // Evita duplicati (stessa pagina, stesso codice)
                if (!rows.Any(r => r.Id == codice))
                    rows.Add(new TowRow { Id = codice, Descrizione = descrizione, Quantita = quantita, Importo = importo });
            }
        }
        return rows;
    }
    public static string ExtractFullText(Stream pdfStream, int maxChars = 80000)
    {
        var sb = new System.Text.StringBuilder();
        using var doc = PdfDocument.Open(pdfStream);
        foreach (var page in doc.GetPages())
        {
            foreach (var word in page.GetWords())
                sb.Append(word.Text).Append(' ');
            sb.AppendLine();
            if (sb.Length > maxChars) break;
        }
        return sb.ToString().Trim();
    }

    // ── Estrae solo le pagine rilevanti (TOW + prime pagine) per l'analisi AI ──
    // Restituisce testo compatto entro maxChars, privilegiando le pagine con TOW.
    public static string ExtractRelevantPages(Stream pdfStream, int maxChars = 8000)
    {
        var keywords = new[] { "tow", "transazion", "allegat", "requisit", "criterio", "criteri",
                                "capitolato", "oggetto", "committente", "scadenza", "importo",
                                "aggiudicazion", "offerta", "tecnica", "economica", "lotto" };

        using var doc = PdfDocument.Open(pdfStream);
        var pages = doc.GetPages().ToList();
        var pageTexts = new List<(int num, string text, bool relevant)>();

        foreach (var page in pages)
        {
            var words = page.GetWords().Select(w => w.Text.Trim()).Where(t => !string.IsNullOrEmpty(t));
            var text = string.Join(" ", words);
            var lower = text.ToLowerInvariant();
            var relevant = keywords.Any(k => lower.Contains(k));
            pageTexts.Add((page.Number, text, relevant));
        }

        var sb = new System.Text.StringBuilder();

        // Prima: prime 3 pagine (intestazione, oggetto, committente)
        foreach (var p in pageTexts.Take(3))
        {
            sb.Append($"[Pag.{p.num}] ").AppendLine(p.text);
            if (sb.Length >= maxChars) break;
        }

        // Poi: pagine rilevanti non già incluse
        foreach (var p in pageTexts.Skip(3).Where(p => p.relevant))
        {
            if (sb.Length >= maxChars) break;
            sb.Append($"[Pag.{p.num}] ").AppendLine(p.text);
        }

        var result = sb.ToString().Trim();
        // Comprimi spazi multipli
        result = Regex.Replace(result, @"\s{2,}", " ");
        if (result.Length > maxChars)
            result = result[..maxChars] + "\n[...troncato...]";
        return result;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO output
// ─────────────────────────────────────────────────────────────────────────────
public class CatalogEntry
{
    public int Lotto { get; set; }
    public int Id { get; set; }
    public string Ambito { get; set; } = "";
    public string Nome { get; set; } = "";
    public string Descrizione { get; set; } = "";
    public CriteriEntry Criteri { get; set; } = new();
    public PrezziEntry Prezzi { get; set; } = new();
    public int Pagina { get; set; }
}

public class CriteriEntry
{
    public string Semplice { get; set; } = "";
    public string Medio { get; set; } = "";
    public string Complesso { get; set; } = "";
}

public class PrezziEntry
{
    public ComplexityPrices Realizzazione { get; set; } = new();
    public ComplexityPrices Modifica { get; set; } = new();
}

public class ComplexityPrices
{
    public double Semplice { get; set; }
    public double Medio { get; set; }
    public double Complesso { get; set; }
}

public class TowRow
{
    public string Id          { get; set; } = "";
    public string Descrizione { get; set; } = "";
    public double? Quantita   { get; set; }
    public double? Importo    { get; set; }
}
