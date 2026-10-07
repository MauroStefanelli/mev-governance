using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using ClosedXML.Excel;
using System.Text.RegularExpressions;
using ExcelDataReader;

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

            var items = page.GetWords()
                .Select(wd => new PdfItem
                {
                    Text = wd.Text.Trim(),
                    X    = wd.BoundingBox.Left,
                    Y    = wd.BoundingBox.Bottom
                })
                .Where(x => !string.IsNullOrEmpty(x.Text))
                .ToList();

            // ── Identifica colonna degli ID ──────────────────────────────────
            // Cerca parole che siano numeri 2-5 cifre nella metà sinistra della pagina
            // (range allargato: < 15% larghezza invece del vecchio < 7%)
            var ids = items
                .Where(x => x.X / w < 0.15 && Regex.IsMatch(x.Text, @"^\d{2,5}$"))
                .OrderByDescending(x => x.Y)
                .ToList();

            if (ids.Count == 0) continue;

            // ── Calcola la X mediana degli ID per calibrare la soglia ────────
            double idXMedian = ids.Select(x => x.X).OrderBy(x => x).ElementAt(ids.Count / 2);
            double idXThreshold = idXMedian + (w * 0.06); // soglia destra per la colonna ID

            // Ri-filtra con soglia calibrata
            ids = items
                .Where(x => x.X <= idXThreshold && Regex.IsMatch(x.Text, @"^\d{2,5}$"))
                .OrderByDescending(x => x.Y)
                .ToList();

            if (ids.Count == 0) continue;

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

                // Prezzi: colonna > 60% larghezza (allargato da 70%)
                var prices = row
                    .Where(x => x.X / w > 0.60 && IsMoneyToken(x.Text))
                    .OrderBy(x => x.X)
                    .Select(x => ParseMoney(x.Text))
                    .Take(6)
                    .ToList();

                // Accetta anche con meno di 6 prezzi (non scartiamo righe utili)
                if (prices.Count == 0) continue;

                // Padding a 6 elementi
                while (prices.Count < 6) prices.Add(0);

                var name = ZoneText(row, w * 0.09, w * 0.30)
                    .Replace("Nome Driver", "", StringComparison.OrdinalIgnoreCase).Trim();
                if (string.IsNullOrEmpty(name))
                    name = ZoneText(row, idXThreshold, w * 0.45).Trim();

                var ambito = ZoneText(row, w * 0.04, w * 0.09)
                    .Replace("Ambito driver", "", StringComparison.OrdinalIgnoreCase).Trim();
                var descrizione = ZoneText(row, w * 0.30, w * 0.45)
                    .Replace("Descrizione Driver", "", StringComparison.OrdinalIgnoreCase).Trim();

                if (string.IsNullOrEmpty(name)) continue;

                out_.Add(new CatalogEntry
                {
                    Lotto       = lot,
                    Id          = int.TryParse(id.Text, out var idN) ? idN : 0,
                    Ambito      = ambito,
                    Nome        = name,
                    Descrizione = descrizione,
                    Criteri     = new CriteriEntry(),
                    Prezzi = new PrezziEntry
                    {
                        Realizzazione = new ComplexityPrices
                        {
                            Semplice  = prices[0],
                            Medio     = prices[1],
                            Complesso = prices[2],
                        },
                        Modifica = new ComplexityPrices
                        {
                            Semplice  = prices[3],
                            Medio     = prices[4],
                            Complesso = prices[5],
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
    // Debug: restituisce coordinate raw di ogni parola nelle pagine che contengono TOW
    public static object ExtractTowRawWords(Stream pdfStream)
    {
        var pages = new List<object>();
        using var doc = PdfDocument.Open(pdfStream);
        foreach (var page in doc.GetPages())
        {
            var words = page.GetWords()
                .Select(w => new { t = w.Text, x = Math.Round(w.BoundingBox.Left, 1), y = Math.Round(w.BoundingBox.Bottom, 1) })
                .ToList();
            var pageText = string.Join(" ", words.Select(w => w.t));
            if (!Regex.IsMatch(pageText, @"TOW\s*0?\d+\.\d+", RegexOptions.IgnoreCase)) continue;
            pages.Add(new { pageNum = page.Number, width = Math.Round(page.Width, 1), height = Math.Round(page.Height, 1), words });
        }
        return new { pages };
    }

    public static List<TowRow> ExtractTowRows(Stream pdfStream)
    {
        // Adattato da TowPdfExtractor (ChatGPT 2026-10-07).
        // Usa l'intestazione "Type-of-Work" come ancora geometrica — non dipende da coordinate fisse.
        var pdfBytes = ReadAllBytes(pdfStream);
        using var pdf = PdfDocument.Open(pdfBytes);
        var rows = new List<TowRow>();
        var codeRx = new Regex(@"^TOW(?<lot>\d+)\.(?<n>\d+)$", RegexOptions.IgnoreCase);

        foreach (var page in pdf.GetPages())
        {
            // PdfPig: Y=0 in basso. ChatGPT usa Y = height - top (Y=0 in alto). Usiamo bottom direttamente.
            var words = page.GetWords()
                .Select(w => new { w.Text, X = w.BoundingBox.Left, Y = w.BoundingBox.Bottom, Right = w.BoundingBox.Right })
                .Where(w => !string.IsNullOrWhiteSpace(w.Text))
                .ToList();

            // Trova intestazioni "Type-of-Work" — marcatore della tabella TOW
            var headers = words.Where(w => w.Text.Equals("Type-of-Work", StringComparison.OrdinalIgnoreCase)).ToList();
            if (headers.Count == 0) continue;

            foreach (var header in headers)
            {
                // Parole sulla stessa riga dell'intestazione (±6pt)
                var band = words.Where(w => Math.Abs(w.Y - header.Y) < 6).ToList();
                var amb    = band.FirstOrDefault(w => w.Text == "Ambito");
                var unit   = band.FirstOrDefault(w => w.Text == "Unità" || w.Text == "Unit\u00e0");
                var qty    = band.FirstOrDefault(w => w.Text.StartsWith("Qt", StringComparison.OrdinalIgnoreCase));
                var effort = band.FirstOrDefault(w => w.Text == "Peso");
                if (amb == null || unit == null || qty == null || effort == null) continue;

                // Codici TOW sotto questa intestazione, fino alla prossima intestazione o fine pagina
                var nextHeaderY = headers
                    .Where(w => w.Y < header.Y - 10)   // Y decrescente verso il basso in PdfPig
                    .Select(w => w.Y)
                    .DefaultIfEmpty(0)
                    .Max();
                var codes = words
                    .Where(w => codeRx.IsMatch(w.Text) && w.Y < header.Y - 5 && w.Y > nextHeaderY)
                    .OrderByDescending(w => w.Y)   // dall'alto verso il basso
                    .ToList();
                if (codes.Count == 0) continue;

                // Confini colonne ricavati dalle intestazioni
                double codeX  = codes.Min(w => w.X) - 2;
                double descX  = codes.Max(w => w.Right) + 4;
                double unitX  = (unit.X + unit.Right) / 2 - 24;
                double qtyX   = ((unit.X + unit.Right) / 2 + (qty.X + qty.Right) / 2) / 2;
                double effortX = ((qty.X + qty.Right) / 2 + (effort.X + effort.Right) / 2) / 2;

                // Limite inferiore tabella = riga "TOTALE" o fine pagina
                double tableBottom = words
                    .Where(w => w.Text == "TOTALE" && w.Y < codes[^1].Y - 5)
                    .Select(w => w.Y)
                    .DefaultIfEmpty(0)
                    .Max();

                // Separazione servizi a task / servizi a canone = prima riga "Totale" dentro la tabella
                double taskEnd = words
                    .Where(w => w.Text == "Totale" && w.Y < codes[0].Y - 2 && w.Y > codes[^1].Y)
                    .Select(w => w.Y)
                    .DefaultIfEmpty(codes[^1].Y + 2)
                    .Max();

                string Cell(double left, double right, double top, double bottom) =>
                    string.Join(" ", words
                        .Where(w => w.X >= left && w.X < right && w.Y <= top && w.Y >= bottom)
                        .OrderByDescending(w => w.Y).ThenBy(w => w.X)
                        .Select(w => w.Text));

                for (int i = 0; i < codes.Count; i++)
                {
                    var c = codes[i];
                    var match = codeRx.Match(c.Text);
                    double top    = c.Y + (i == 0 ? 12 : 6);
                    double bottom = i + 1 < codes.Count ? codes[i + 1].Y + 6 : tableBottom;
                    bool isCanone = c.Y < taskEnd;

                    var description = Cell(descX, unitX, top, bottom).Trim();
                    bool acatalogo  = Cell(unitX, page.Width, top, bottom).Contains("catalogo", StringComparison.OrdinalIgnoreCase);

                    double? quantita = null;
                    if (!acatalogo)
                    {
                        var qtyText = Cell(qtyX, effortX, top, bottom).Trim();
                        if (decimal.TryParse(qtyText, System.Globalization.NumberStyles.Number,
                            System.Globalization.CultureInfo.GetCultureInfo("it-IT"), out var qv))
                            quantita = (double)qv;
                        else if (double.TryParse(qtyText, System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var qv2))
                            quantita = qv2;
                    }

                    double? pesoEffort = null;
                    if (!acatalogo)
                    {
                        var weightText = string.Join(" ", words
                            .Where(w => w.X >= effortX && w.Y <= top && w.Y >= bottom && w.Text.Contains("%"))
                            .OrderByDescending(w => w.Y).ThenBy(w => w.X)
                            .Select(w => w.Text));
                        var clean = weightText.Replace("%", "").Trim();
                        if (decimal.TryParse(clean, System.Globalization.NumberStyles.Number,
                            System.Globalization.CultureInfo.GetCultureInfo("it-IT"), out var pv))
                            pesoEffort = (double)pv;
                    }

                    if (!rows.Any(r => r.Id == c.Text))
                        rows.Add(new TowRow
                        {
                            Id          = c.Text.ToUpperInvariant(),
                            Descrizione = description,
                            Quantita    = quantita,
                            PesoEffort  = pesoEffort,
                            ACatalogo   = acatalogo,
                            Importo     = null,
                        });
                }
            }
        }

        return rows.OrderBy(r => r.Id).ToList();
    }

    private static byte[] ReadAllBytes(Stream s)
    {
        if (s is MemoryStream ms) return ms.ToArray();
        using var buf = new MemoryStream();
        s.CopyTo(buf);
        return buf.ToArray();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OFFERTA EXCEL (protetto da password)
    // Estrae da due fogli: "SCHEMA OFFERTA ECONOMICA" e "Schema Offerta Catalogo Lotto N"
    // Usa ExcelDataReader per aprire file xlsx protetti da password (ClosedXML non supporta).
    // ─────────────────────────────────────────────────────────────────────────
    public static OffertaExcelResult ParseOffertaExcel(Stream xlsxStream, int lot, string? password)
    {
        var result = new OffertaExcelResult { Lotto = lot };

        // Leggi tutti i bytes prima (il file stream può essere consumato)
        var bytes = ReadAllBytes(xlsxStream);

        // Prova prima con ExcelDataReader (supporta password xlsx OLE)
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        ExcelDataReader.ExcelReaderConfiguration? cfg = string.IsNullOrEmpty(password) ? null
            : new ExcelDataReader.ExcelReaderConfiguration { Password = password };

        System.Data.DataSet ds;
        try
        {
            using var ms = new MemoryStream(bytes);
            using var reader = ExcelDataReader.ExcelReaderFactory.CreateReader(ms, cfg);
            ds = reader.AsDataSet(new ExcelDataReader.ExcelDataSetConfiguration
            {
                ConfigureDataTable = _ => new ExcelDataReader.ExcelDataTableConfiguration { UseHeaderRow = false }
            });
        }
        catch (Exception ex) when (ex.Message.Contains("password", StringComparison.OrdinalIgnoreCase) ||
                                    ex.Message.Contains("Invalid password", StringComparison.OrdinalIgnoreCase) ||
                                    ex.Message.Contains("encrypt", StringComparison.OrdinalIgnoreCase))
        {
            result.Error = "Password errata o file protetto — impossibile aprire il file Excel.";
            return result;
        }

        // Indici dei fogli per nome
        var fogliNomi = ds.Tables.Cast<System.Data.DataTable>().Select(t => t.TableName).ToList();
        result.FogliDisponibili = fogliNomi;

        var tableEco = ds.Tables.Cast<System.Data.DataTable>().FirstOrDefault(t =>
            t.TableName.Contains("OFFERTA ECONOMICA", StringComparison.OrdinalIgnoreCase) ||
            t.TableName.Contains("SCHEMA OFFERTA", StringComparison.OrdinalIgnoreCase));

        var tableCat = ds.Tables.Cast<System.Data.DataTable>().FirstOrDefault(t =>
            t.TableName.Contains($"Catalogo Lotto {lot}", StringComparison.OrdinalIgnoreCase) ||
            t.TableName.Contains($"Catalogo L{lot}", StringComparison.OrdinalIgnoreCase) ||
            (t.TableName.Contains("Catalogo", StringComparison.OrdinalIgnoreCase) && t.TableName.Contains(lot.ToString())));

        // Fallback: primo foglio con "Catalogo"
        if (tableCat == null)
            tableCat = ds.Tables.Cast<System.Data.DataTable>().FirstOrDefault(t =>
                t.TableName.Contains("Catalogo", StringComparison.OrdinalIgnoreCase));

        if (tableEco != null)
            result.OffertaEconomica = ParseTableOffertaEconomica(tableEco, lot);

        if (tableCat != null)
            result.OffertaCatalogo = ParseTableOffertaCatalogo(tableCat, lot);

        if (tableEco == null && tableCat == null)
            result.Error = $"Nessun foglio offerta trovato. Fogli disponibili: {string.Join(", ", fogliNomi)}";

        return result;
    }

    private static string CellStr(System.Data.DataRow row, int col)
    {
        if (col >= row.Table.Columns.Count) return "";
        var v = row[col];
        return v == null || v == DBNull.Value ? "" : v.ToString()?.Trim() ?? "";
    }

    private static double? CellDbl(System.Data.DataRow row, int col)
    {
        if (col >= row.Table.Columns.Count) return null;
        var v = row[col];
        if (v == null || v == DBNull.Value) return null;
        if (v is double d) return d;
        if (v is decimal dec) return (double)dec;
        if (v is float f) return (double)f;
        if (v is int i) return (double)i;
        var s = v.ToString()?.Replace(".", "").Replace(",", ".").Trim() ?? "";
        return double.TryParse(s, System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture, out var p) ? p : null;
    }

    private static OffertaEconomica ParseTableOffertaEconomica(System.Data.DataTable table, int lot)
    {
        var eco = new OffertaEconomica();
        var towRx = new Regex(@"TOW\s*0?\d+\.\d+", RegexOptions.IgnoreCase);
        var headerRow = -1;
        var colMap = new Dictionary<string, int>(); // nome → colonna index

        var rows = table.Rows.Cast<System.Data.DataRow>().ToList();

        for (int ri = 0; ri < rows.Count; ri++)
        {
            var row = rows[ri];
            var rowText = string.Join("|", Enumerable.Range(0, table.Columns.Count).Select(c => CellStr(row, c)));

            // Cerca importo base gara nella riga
            if (rowText.Contains("IMPORTO BASE", StringComparison.OrdinalIgnoreCase) ||
                rowText.Contains("NON PUO ESSERE", StringComparison.OrdinalIgnoreCase) ||
                rowText.Contains("IMPORTO TOTALE OFFERTO", StringComparison.OrdinalIgnoreCase))
            {
                // Cerca numero > 1000 nella stessa riga
                for (int c = 0; c < table.Columns.Count && eco.ImportoBaseGara == null; c++)
                {
                    var v = CellDbl(row, c);
                    if (v.HasValue && v.Value > 10000) eco.ImportoBaseGara = v;
                }
                // Cerca nelle righe successive se non trovato
                if (eco.ImportoBaseGara == null && ri + 1 < rows.Count)
                {
                    for (int c = 0; c < table.Columns.Count; c++)
                    {
                        var v = CellDbl(rows[ri + 1], c);
                        if (v.HasValue && v.Value > 10000) { eco.ImportoBaseGara = v; break; }
                    }
                }
            }

            // Detect header row (contiene "Codice" o "TOW" e "Descrizione")
            if (headerRow < 0 && (rowText.Contains("Codice", StringComparison.OrdinalIgnoreCase) ||
                                   rowText.Contains("Descrizione", StringComparison.OrdinalIgnoreCase)))
            {
                headerRow = ri;
                for (int c = 0; c < table.Columns.Count; c++)
                {
                    var t = CellStr(row, c).ToLowerInvariant();
                    if (t.Contains("codice") || Regex.IsMatch(t, @"^tow")) colMap["codice"] = c;
                    else if (t.Contains("descriz")) colMap["descrizione"] = c;
                    else if (t.Contains("quant")) colMap["quantita"] = c;
                    else if (t.Contains("prezzo") && t.Contains("unit")) colMap["prezzoUnitario"] = c;
                    else if (t.Contains("importo") || t.Contains("totale")) colMap["importo"] = c;
                    else if (t.Contains("regol") || t.Contains("vincol") || t.Contains("nota")) colMap["regole"] = c;
                }
                continue;
            }

            // Riga con codice TOW
            var codiceCol = -1;
            string codice = "";
            for (int c = 0; c < table.Columns.Count; c++)
            {
                var t = CellStr(row, c);
                if (towRx.IsMatch(t)) { codiceCol = c; codice = t.Trim().ToUpperInvariant(); break; }
            }
            if (codiceCol < 0) continue;

            string GetC(string key) => colMap.TryGetValue(key, out var ci) ? CellStr(row, ci) : "";
            double? GetN(string key) => colMap.TryGetValue(key, out var ci) ? CellDbl(row, ci) : null;

            var desc = GetC("descrizione");
            if (string.IsNullOrEmpty(desc))
            {
                // Prendi tutti i valori stringa non numerici dalla riga, escluso il codice
                desc = string.Join(" ", Enumerable.Range(0, table.Columns.Count)
                    .Where(c => c != codiceCol)
                    .Select(c => CellStr(row, c))
                    .Where(t => !string.IsNullOrWhiteSpace(t) && !double.TryParse(t.Replace(",", "."), out _))
                    .Take(3));
            }

            eco.Righe.Add(new RigaOffertaEconomica
            {
                Codice         = codice,
                Descrizione    = desc.Trim(),
                Quantita       = GetN("quantita"),
                PrezzoUnitario = GetN("prezzoUnitario"),
                ImportoOfferto = GetN("importo"),
                Regole         = GetC("regole"),
            });
        }

        return eco;
    }

    private static List<RigaOffertaCatalogo> ParseTableOffertaCatalogo(System.Data.DataTable table, int lot)
    {
        var righe = new List<RigaOffertaCatalogo>();
        var idRx = new Regex(@"^\d{2,5}$");
        var colMap = new Dictionary<string, int>();
        var prezziOffertoKeys = new List<(string label, int col)>();

        var rows = table.Rows.Cast<System.Data.DataRow>().ToList();

        for (int ri = 0; ri < rows.Count; ri++)
        {
            var row = rows[ri];

            // Detect header
            var rowText = string.Join("|", Enumerable.Range(0, table.Columns.Count).Select(c => CellStr(row, c)));
            if (rowText.Contains("Ambito", StringComparison.OrdinalIgnoreCase) ||
                rowText.Contains("Componente", StringComparison.OrdinalIgnoreCase) ||
                rowText.Contains("Realizzazione", StringComparison.OrdinalIgnoreCase))
            {
                colMap.Clear(); prezziOffertoKeys.Clear();
                // Cerca anche la riga successiva per intestazioni su più righe
                var headerRows = new List<System.Data.DataRow> { row };
                if (ri + 1 < rows.Count) headerRows.Add(rows[ri + 1]);

                // Prima passata: riga corrente
                for (int c = 0; c < table.Columns.Count; c++)
                {
                    var t = CellStr(row, c).ToLowerInvariant();
                    if (t == "id" || t == "cod" || t == "codice") colMap["id"] = c;
                    else if (t.Contains("ambito")) colMap["ambito"] = c;
                    else if (t.Contains("nome") || t.Contains("componente") || t.Contains("driver")) colMap["nome"] = c;
                    else if (t.Contains("descriz")) colMap["descrizione"] = c;
                    else if (t.Contains("regol") || t.Contains("vincol")) colMap["regole"] = c;
                }

                // Seconda passata: cerca "Semplice", "Medio", "Complesso", "Prezzo Offerto"
                // (possono essere in riga successiva)
                foreach (var hr in headerRows)
                {
                    for (int c = 0; c < table.Columns.Count; c++)
                    {
                        var t = CellStr(hr, c).ToLowerInvariant();
                        if (t.Contains("semplice") && !colMap.ContainsKey("sempliceR")) colMap["sempliceR"] = c;
                        else if (t.Contains("medio") && !colMap.ContainsKey("medioR")) colMap["medioR"] = c;
                        else if (t.Contains("complesso") && !colMap.ContainsKey("complessoR")) colMap["complessoR"] = c;
                        else if (t.Contains("semplice")) colMap["sempliceM"] = c;
                        else if (t.Contains("medio")) colMap["medioM"] = c;
                        else if (t.Contains("complesso")) colMap["complessoM"] = c;
                        // "Prezzo Offerto" colonne
                        if (t.Contains("prezzo") && t.Contains("offert"))
                        {
                            // Determina fascia dal testo o dalla posizione relativa
                            var label = t.Contains("sempl") ? "Semplice" :
                                        t.Contains("medio") ? "Medio" :
                                        t.Contains("compl") ? "Complesso" : $"Col{c}";
                            if (!prezziOffertoKeys.Any(k => k.col == c))
                                prezziOffertoKeys.Add((label, c));
                        }
                    }
                }

                // Se non abbiamo trovato "Prezzo Offerto" espliciti, cerca colonne dopo "Complesso"
                if (prezziOffertoKeys.Count == 0 && colMap.TryGetValue("complessoR", out var lastR))
                {
                    // Le colonne successive alla complessità di Realizzazione potrebbero essere "Prezzo Offerto"
                    for (int c = lastR + 1; c < table.Columns.Count && prezziOffertoKeys.Count < 3; c++)
                    {
                        var h = CellStr(row, c).ToLowerInvariant();
                        if (!string.IsNullOrEmpty(h))
                            prezziOffertoKeys.Add((prezziOffertoKeys.Count == 0 ? "Semplice" : prezziOffertoKeys.Count == 1 ? "Medio" : "Complesso", c));
                    }
                }

                continue;
            }

            // Riga dati: cerca ID
            var idCol = -1;
            for (int c = 0; c < table.Columns.Count; c++)
            {
                var t = CellStr(row, c);
                if (idRx.IsMatch(t)) { idCol = c; break; }
            }
            if (idCol < 0)
            {
                if (colMap.TryGetValue("id", out var idC))
                {
                    var t = CellStr(row, idC);
                    if (!string.IsNullOrWhiteSpace(t)) idCol = idC;
                }
            }
            if (idCol < 0) continue;

            string GetC(string key) => colMap.TryGetValue(key, out var ci) ? CellStr(row, ci) : "";
            double? GetN(string key) => colMap.TryGetValue(key, out var ci) ? CellDbl(row, ci) : null;

            var prezziOfferto = prezziOffertoKeys.Select(pk => new PrezzoOffertoConRegola
            {
                Fascia = pk.label,
                Valore = CellDbl(row, pk.col),
                Regola = "",
            }).ToList();

            righe.Add(new RigaOffertaCatalogo
            {
                Id                               = CellStr(row, idCol),
                Ambito                           = GetC("ambito"),
                Nome                             = GetC("nome"),
                Descrizione                      = GetC("descrizione"),
                PrezzoRealizzazioneSemplice       = GetN("sempliceR"),
                PrezzoRealizzazioneMedio          = GetN("medioR"),
                PrezzoRealizzazioneComplesso      = GetN("complessoR"),
                PrezzoModificaSemplice            = GetN("sempliceM"),
                PrezzoModificaMedio               = GetN("medioM"),
                PrezzoModificaComplesso           = GetN("complessoM"),
                PrezziOfferto                    = prezziOfferto,
                Regole                           = GetC("regole"),
            });
        }

        return righe;
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
    // Restituisce testo compatto entro maxChars, privilegiando le pagine con TOW e lotti.
    public static string ExtractRelevantPages(Stream pdfStream, int maxChars = 12000)
    {
        var keywords = new[] {
            "tow", "transazion", "allegat", "requisit", "criterio", "criteri",
            "capitolato", "oggetto", "committente", "scadenza", "importo",
            "aggiudicazion", "offerta", "tecnica", "economica",
            "lotto", "lotto 1", "lotto 2", "lotto 3", "lotto i", "lotto ii",
            "oggetto del servizio", "descrizione del servizio", "servizi a task",
            "base d'asta", "base asta", "accordo quadro"
        };

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

        // Prima: prime 5 pagine (intestazione, oggetto, committente, struttura lotti)
        foreach (var p in pageTexts.Take(5))
        {
            sb.Append($"[Pag.{p.num}] ").AppendLine(p.text);
            if (sb.Length >= maxChars) break;
        }

        // Poi: pagine rilevanti non già incluse
        foreach (var p in pageTexts.Skip(5).Where(p => p.relevant))
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
    public double? PesoEffort { get; set; }  // % peso effort (es. 32.26)
    public bool   ACatalogo   { get; set; }  // true se "A catalogo"
    public double? Importo    { get; set; }  // deprecato, sempre null
}

// ─── DTOs Offerta Excel ───────────────────────────────────────────────────────
public class OffertaExcelResult
{
    public int Lotto { get; set; }
    public string? Error { get; set; }
    public List<string>? FogliDisponibili { get; set; }
    public OffertaEconomica? OffertaEconomica { get; set; }
    public List<RigaOffertaCatalogo>? OffertaCatalogo { get; set; }
}

public class OffertaEconomica
{
    public double? ImportoBaseGara { get; set; }
    public List<RigaOffertaEconomica> Righe { get; set; } = new();
}

public class RigaOffertaEconomica
{
    public string Codice        { get; set; } = "";
    public string Descrizione   { get; set; } = "";
    public double? Quantita     { get; set; }
    public double? PrezzoUnitario { get; set; }
    public double? ImportoOfferto { get; set; }
    public string Regole        { get; set; } = "";
}

public class RigaOffertaCatalogo
{
    public string Id            { get; set; } = "";
    public string Ambito        { get; set; } = "";
    public string Nome          { get; set; } = "";
    public string Descrizione   { get; set; } = "";
    public double? PrezzoRealizzazioneSemplice  { get; set; }
    public double? PrezzoRealizzazioneMedio     { get; set; }
    public double? PrezzoRealizzazioneComplesso { get; set; }
    public double? PrezzoModificaSemplice       { get; set; }
    public double? PrezzoModificaMedio          { get; set; }
    public double? PrezzoModificaComplesso      { get; set; }
    public List<PrezzoOffertoConRegola> PrezziOfferto { get; set; } = new();
    public string Regole        { get; set; } = "";
}

public class PrezzoOffertoConRegola
{
    public string Fascia    { get; set; } = "";
    public double? Valore   { get; set; }
    public string Regola    { get; set; } = "";
}
