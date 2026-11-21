using System.Globalization;
using System.Text.Json.Nodes;
using ClosedXML.Excel;

namespace MevGovernanceBackend.Services;

// «Voci di catalogo offerti»: after the award the prices that count are the OFFERED ones, not the tender base. They are kept next to the tender
// catalog (never over it) and come from an Excel file. This class builds the model the user fills in and reads/checks the file that comes back.
public static class OfferedCatalogWorkbook
{
    public const string DataSheet = "CatalogoOfferto";
    public const string BaseSheet = "BaseAsta";
    public const string HelpSheet = "Istruzioni";
    public const int MaxRows = 500;
    public const int MaxErrors = 60;
    public static readonly string[] Types = { "REALIZZAZIONE", "MODIFICA" };
    public static readonly string[] Bands = { "Semplice", "Medio", "Complesso" };
    static string TypeTitle(string type) => type == "REALIZZAZIONE" ? "Realizzazione" : "Modifica";
    public static string Header(string type, string band) => $"{TypeTitle(type)} {band}";
    public static readonly string[] FixedHeaders = { "ID", "Ambito", "Voce" };
    public static List<string> PriceHeaders() => Types.SelectMany(t => Bands.Select(b => Header(t, b))).ToList();

    public record Price(string Type, string Band, decimal? Base, decimal? Offered);
    public record Row(string Id, string Ambit, string Name, List<Price> Prices);
    public class Result
    {
        public List<string> Errors { get; } = new();
        public List<string> Warnings { get; } = new();
        public List<Row> Rows { get; } = new();
        public bool Ok => Errors.Count == 0 && Rows.Count > 0;
        public void Error(string message) { if (Errors.Count < MaxErrors) Errors.Add(message); else if (Errors.Count == MaxErrors) Errors.Add("…altri errori non elencati: correggi quelli sopra e riprova."); }
    }

    static decimal? Read(JsonNode? entry, string type, string band)
    {
        if (entry?["prezzi"] is not JsonObject prices) return null;
        var typeKey = prices.Select(p => p.Key).FirstOrDefault(k => k.Equals(type, StringComparison.OrdinalIgnoreCase));
        if (typeKey == null || prices[typeKey] is not JsonObject bands) return null;
        var bandKey = bands.Select(p => p.Key).FirstOrDefault(k => k.Equals(band, StringComparison.OrdinalIgnoreCase));
        if (bandKey == null || bands[bandKey] == null) return null;
        return decimal.TryParse(bands[bandKey]!.ToString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) && n >= 0 ? n : null;
    }

    // The model: one row per voice of the tender catalog (id, ambit, name already filled in), the price cells EMPTY (a forgotten price must not pass as «offered = tender»),
    // the tender prices on a second sheet for reference, and the instructions on a third.
    public static byte[] BuildTemplate(JsonArray tenderCatalog, string contractName, string lot)
    {
        using var workbook = new XLWorkbook();
        var data = workbook.AddWorksheet(DataSheet);
        var headers = FixedHeaders.Concat(PriceHeaders()).ToList();
        for (int c = 0; c < headers.Count; c++) data.Cell(1, c + 1).Value = headers[c];
        var reference = workbook.AddWorksheet(BaseSheet);
        for (int c = 0; c < headers.Count; c++) reference.Cell(1, c + 1).Value = headers[c];
        int row = 2;
        foreach (var entry in tenderCatalog.OfType<JsonObject>())
        {
            var id = entry["id"]?.ToString() ?? "";
            data.Cell(row, 1).SetValue(id); data.Cell(row, 2).SetValue(entry["ambito"]?.ToString() ?? ""); data.Cell(row, 3).SetValue(entry["nome"]?.ToString() ?? "");
            reference.Cell(row, 1).SetValue(id); reference.Cell(row, 2).SetValue(entry["ambito"]?.ToString() ?? ""); reference.Cell(row, 3).SetValue(entry["nome"]?.ToString() ?? "");
            int col = 4;
            foreach (var type in Types) foreach (var band in Bands)
            {
                if (Read(entry, type, band) is { } price) reference.Cell(row, col).Value = price;
                data.Cell(row, col).Style.NumberFormat.Format = "#,##0.00";
                reference.Cell(row, col).Style.NumberFormat.Format = "#,##0.00";
                col++;
            }
            row++;
        }
        foreach (var sheet in new[] { data, reference })
        {
            var head = sheet.Range(1, 1, 1, headers.Count);
            head.Style.Font.Bold = true; head.Style.Fill.BackgroundColor = XLColor.FromHtml("#1d4ed8"); head.Style.Font.FontColor = XLColor.White;
            sheet.SheetView.FreezeRows(1); sheet.SheetView.FreezeColumns(3);
            sheet.Column(1).Width = 8; sheet.Column(2).Width = 16; sheet.Column(3).Width = 52;
            for (int c = 4; c <= headers.Count; c++) sheet.Column(c).Width = 22;
        }
        var offeredInput = data.Range(2, 4, Math.Max(2, row - 1), headers.Count);
        offeredInput.Style.Fill.BackgroundColor = XLColor.FromHtml("#fff7d6");
        reference.Range(1, 1, Math.Max(2, row - 1), headers.Count).Style.Protection.Locked = true;
        var help = workbook.AddWorksheet(HelpSheet);
        var lines = new[]
        {
            $"Catalogo offerto - {contractName} - lotto {lot}",
            "",
            "COSA FARE",
            "1. Nel foglio 'CatalogoOfferto' scrivi, per ogni voce, il prezzo OFFERTO (quello dopo gli sconti dell'aggiudicazione) nelle celle gialle.",
            "2. Non cambiare ID, Ambito, Voce né le intestazioni delle colonne: l'ID è ciò che collega la riga alla voce del catalogo di gara.",
            "3. Non aggiungere né togliere righe: servono tutte le voci del catalogo di gara. Una voce che non offri o che non ha prezzo (0 in gara) si lascia vuota.",
            "4. I prezzi sono importi in euro, numeri positivi o zero (es. 1250 oppure 1250,50). Non scrivere il simbolo €.",
            "5. Il foglio 'BaseAsta' mostra i prezzi di gara, solo per confronto: non viene letto.",
            "6. Salva il file in formato .xlsx e caricalo in 'Voci di catalogo offerti'. Prima di salvare, il programma mostra un'anteprima e segnala gli errori.",
            "",
            "REGOLE CONTROLLATE",
            "- ogni ID del file deve esistere nel catalogo di gara e comparire una sola volta;",
            "- ogni voce di gara deve comparire nel file;",
            "- se in gara la voce ha un prezzo, quello offerto è obbligatorio;",
            "- un prezzo offerto oltre la base d'asta non blocca il caricamento ma viene segnalato.",
        };
        for (int i = 0; i < lines.Length; i++) help.Cell(i + 1, 1).Value = lines[i];
        help.Column(1).Width = 130; help.Cell(1, 1).Style.Font.Bold = true; help.Cell(3, 1).Style.Font.Bold = true; help.Cell(11, 1).Style.Font.Bold = true;
        using var stream = new MemoryStream(); workbook.SaveAs(stream); return stream.ToArray();
    }

    // Italian or plain numbers; text such as «1.250,50», «€ 1250» or «1250.5» is read, a negative or unreadable value is an error (null + message).
    public static bool TryPrice(IXLCell cell, out decimal? value, out string? problem)
    {
        value = null; problem = null;
        if (cell.IsEmpty() || (cell.DataType == XLDataType.Text && string.IsNullOrWhiteSpace(cell.GetString()))) return true;
        decimal n;
        if (cell.DataType == XLDataType.Number) n = (decimal)cell.GetDouble();
        else
        {
            var text = cell.GetString().Replace("€", "").Replace("\u00a0", "").Replace(" ", "").Trim();
            if (text.Contains(',') ) text = text.Replace(".", "").Replace(',', '.');
            else if (text.Count(c => c == '.') > 1) text = text.Replace(".", "");
            if (!decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out n)) { problem = $"«{cell.GetString()}» non è un importo"; return false; }
        }
        if (n < 0) { problem = "l'importo è negativo"; return false; }
        value = Math.Round(n, 2, MidpointRounding.AwayFromZero); return true;
    }

    public static Result Read(Stream file, JsonArray tenderCatalog)
    {
        var result = new Result();
        XLWorkbook workbook;
        try { workbook = new XLWorkbook(file); }
        catch (Exception) { result.Error("Il file non è un XLSX leggibile: usa il modello scaricato da 'Voci di catalogo offerti'."); return result; }
        using (workbook)
        {
            if (!workbook.Worksheets.TryGetWorksheet(DataSheet, out var sheet))
            { result.Error($"Manca il foglio '{DataSheet}': usa il modello scaricato da 'Voci di catalogo offerti' senza rinominare i fogli."); return result; }
            var expected = FixedHeaders.Concat(PriceHeaders()).ToList();
            var columns = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var cell in sheet.Row(1).CellsUsed()) columns[cell.GetString().Trim()] = cell.Address.ColumnNumber;
            var missing = expected.Where(h => !columns.ContainsKey(h)).ToList();
            if (missing.Count > 0) { result.Error($"Intestazioni mancanti nella riga 1: {string.Join(", ", missing)}. Non modificare le intestazioni del modello."); return result; }
            var last = sheet.LastRowUsed()?.RowNumber() ?? 1;
            if (last - 1 > MaxRows) { result.Error($"Il file ha più di {MaxRows} righe: controlla che sia il modello del lotto."); return result; }

            var tender = tenderCatalog.OfType<JsonObject>().ToList();
            var tenderById = new Dictionary<string, JsonObject>();
            foreach (var entry in tender) { var id = entry["id"]?.ToString()?.Trim() ?? ""; if (id != "" && !tenderById.ContainsKey(id)) tenderById[id] = entry; }
            var seen = new HashSet<string>();
            for (int r = 2; r <= last; r++)
            {
                var id = sheet.Cell(r, columns["ID"]).GetString().Trim();
                var rowEmpty = id == "" && expected.Skip(1).All(h => sheet.Cell(r, columns[h]).IsEmpty());
                if (rowEmpty) continue;
                if (id == "") { result.Error($"Riga {r}: manca l'ID della voce."); continue; }
                if (!tenderById.TryGetValue(id, out var entry)) { result.Error($"Riga {r}: l'ID {id} non esiste nel catalogo di gara di questo lotto."); continue; }
                if (!seen.Add(id)) { result.Error($"Riga {r}: l'ID {id} compare più di una volta."); continue; }
                var name = entry["nome"]?.ToString() ?? ""; var ambit = entry["ambito"]?.ToString() ?? "";
                var fileName = sheet.Cell(r, columns["Voce"]).GetString().Trim();
                if (fileName != "" && !string.Equals(fileName, name.Trim(), StringComparison.OrdinalIgnoreCase))
                    result.Warnings.Add($"Riga {r}: il nome «{fileName}» è diverso da quello di gara «{name}»; vale l'ID {id}.");
                var prices = new List<Price>(); bool rowOk = true;
                foreach (var type in Types) foreach (var band in Bands)
                {
                    var header = Header(type, band); var cell = sheet.Cell(r, columns[header]);
                    var baseValue = Read(entry, type, band);
                    if (!TryPrice(cell, out var offered, out var problem)) { result.Error($"Riga {r} (ID {id}), «{header}»: {problem}."); rowOk = false; continue; }
                    if (offered == null && baseValue is > 0) { result.Error($"Riga {r} (ID {id}), «{header}»: manca il prezzo offerto (in gara è {baseValue.Value.ToString("0.##", CultureInfo.InvariantCulture)})."); rowOk = false; continue; }
                    if (offered != null && baseValue is > 0 && offered > baseValue) result.Warnings.Add($"Riga {r} (ID {id}), «{header}»: il prezzo offerto {offered} supera la base d'asta {baseValue}.");
                    prices.Add(new Price(type, band, baseValue, offered));
                }
                if (rowOk) result.Rows.Add(new Row(id, ambit, name, prices));
            }
            var notInFile = tenderById.Keys.Where(id => !seen.Contains(id)).ToList();
            if (notInFile.Count > 0) result.Error($"Mancano {notInFile.Count} voci del catalogo di gara: ID {string.Join(", ", notInFile.Take(15))}{(notInFile.Count > 15 ? "…" : "")}. Servono tutte le voci del lotto.");
            if (result.Rows.Count == 0 && result.Errors.Count == 0) result.Error("Il file non contiene voci.");
        }
        return result;
    }

    // What is saved in the lot: only id + prices (names stay those of the tender catalog, so a typo in the file can never rename a voice).
    public static JsonArray ToEntries(IEnumerable<Row> rows)
    {
        var array = new JsonArray();
        foreach (var row in rows)
        {
            var prezzi = new JsonObject();
            foreach (var type in Types)
            {
                var bands = new JsonObject();
                foreach (var band in Bands) { var p = row.Prices.First(x => x.Type == type && x.Band == band); bands[band] = p.Offered.HasValue ? JsonValue.Create(p.Offered.Value) : null; }
                prezzi[type] = bands;
            }
            array.Add(new JsonObject { ["id"] = long.TryParse(row.Id, out var n) ? JsonValue.Create(n) : JsonValue.Create(row.Id), ["prezzi"] = prezzi });
        }
        return array;
    }

    // Who may manage the offered catalog of a lot: the SuperAdmin on every lot, an Admin only on the lots of the contract he is working on.
    public static bool CanManage(bool isSuperAdmin, bool isAdmin, string? environmentCode, string? lotContractCode) =>
        isSuperAdmin || (isAdmin && !string.IsNullOrWhiteSpace(environmentCode) && !string.IsNullOrWhiteSpace(lotContractCode)
            && string.Equals(environmentCode.Trim(), lotContractCode.Trim(), StringComparison.Ordinal));
}
