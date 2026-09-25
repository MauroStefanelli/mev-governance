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

                // Prezzi: colonna >70% larghezza, formato italiano NNN.NNN,NN
                var prices = row
                    .Where(x => x.X / w > 0.70 && Regex.IsMatch(x.Text, @"^\d{1,3}(?:\.\d{3})*,\d{2}$"))
                    .OrderBy(x => x.X)
                    .Select(x => ParseMoney(x.Text))
                    .Take(6)
                    .ToList();

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
                            Semplice  = prices[0],
                            Medio     = prices[1],
                            Complesso = prices[2]
                        },
                        Modifica = new ComplexityPrices
                        {
                            Semplice  = prices[3],
                            Medio     = prices[4],
                            Complesso = prices[5]
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

                var nums = lineItems
                    .Where(x => Regex.IsMatch(x.Text, @"^\d{1,3}(?:\.\d{3})*,\d{2}$"))
                    .Select(x => ParseMoney(x.Text))
                    .ToList();

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
        // Formato italiano: 1.234,56 → 1234.56
        var clean = Regex.Replace(s, @"\s", "")
                         .Replace(".", "")
                         .Replace(",", ".")
                         .Trim();
        return double.TryParse(clean, System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0;
    }

    private class PdfItem
    {
        public string Text { get; set; } = "";
        public double X { get; set; }
        public double Y { get; set; }
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
