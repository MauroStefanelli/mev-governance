using System.Globalization;
using System.Text;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using ExcelDataReader;

namespace MevGovernanceBackend.Services;

/// <summary>Legge le intestazioni composte usando le vere celle unite del workbook.
/// I valori monetari e gli ID non vengono propagati nelle celle vuote.</summary>
internal static class OffertaExcelParser
{
    private static readonly Regex Tow = new(@"^TOW\s*(\d+)\s*\.\s*(\d+)$", RegexOptions.IgnoreCase);
    private static readonly Regex Lot = new(@"\blotto\s*0*(\d+)\b|\bl\s*0*(\d+)\b", RegexOptions.IgnoreCase);
    private sealed record Sheet(string Name, List<object?[]> Rows, CellRange[] Merges, int Width)
    {
        public object? Raw(int r, int c) => r >= 0 && r < Rows.Count && c >= 0 && c < Rows[r].Length ? Rows[r][c] : null;
        public string Text(int r, int c, bool merged = false)
        {
            var value = Raw(r, c);
            if (merged && Empty(value))
            {
                var range = Merges.FirstOrDefault(m => r >= m.FromRow && r <= m.ToRow && c >= m.FromColumn && c <= m.ToColumn);
                if (range != null) value = Raw(range.FromRow, range.FromColumn);
            }
            return Empty(value) ? "" : Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? "";
        }
    }
    private static bool Empty(object? value) => value is null or DBNull || string.IsNullOrWhiteSpace(value.ToString());
    private static string Norm(string text)
    {
        var stripped = string.Concat(text.Normalize(NormalizationForm.FormD).Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark));
        return Regex.Replace(stripped.ToLowerInvariant(), @"[^a-z0-9]+", " ").Trim();
    }
    private static int? SheetLot(string name)
    {
        var m = Lot.Match(Norm(name));
        return m.Success ? int.Parse(m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value) : null;
    }
    private static bool TryId(string text, out string id)
    {
        id = text.Trim();
        return Regex.IsMatch(id, @"^\d+$");
    }
    internal static double? Number(object? value)
    {
        if (Empty(value)) return null;
        if (value is double or float or decimal or int or long or short)
        {
            var number = Convert.ToDouble(value, CultureInfo.InvariantCulture);
            return double.IsFinite(number) ? number : null;
        }
        var s = Regex.Replace(value!.ToString()!.Trim(), @"(?:EUR|€|\s)", "", RegexOptions.IgnoreCase);
        if (!Regex.IsMatch(s, @"^[+-]?\d[\d.,]*$")) return null;
        // Due separatori: l'ultimo è il separatore decimale. Solo punto:
        // gruppi di tre cifre sono migliaia italiane; altrimenti decimali invarianti.
        CultureInfo culture;
        if (s.Contains(',') && s.Contains('.'))
            culture = s.LastIndexOf(',') > s.LastIndexOf('.') ? CultureInfo.GetCultureInfo("it-IT") : CultureInfo.InvariantCulture;
        else if (s.Contains(',')) culture = CultureInfo.GetCultureInfo("it-IT");
        else culture = Regex.IsMatch(s, @"^[+-]?\d{1,3}(\.\d{3})+$") ? CultureInfo.GetCultureInfo("it-IT") : CultureInfo.InvariantCulture;
        return double.TryParse(s, NumberStyles.Number, culture, out var parsed) && double.IsFinite(parsed) ? parsed : null;
    }

    public static OffertaExcelResult Parse(Stream stream, int lot, string? password)
    {
        var result = new OffertaExcelResult { Lotto = lot };
        if (lot <= 0) { result.Error = "Il lotto deve essere maggiore di zero."; return result; }
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        var sheets = new List<Sheet>();
        try
        {
            using var input = new MemoryStream();
            stream.CopyTo(input); input.Position = 0;
            using var reader = ExcelReaderFactory.CreateReader(input, new ExcelReaderConfiguration { Password = password });
            do
            {
                var rows = new List<object?[]>();
                var width = reader.FieldCount;
                while (reader.Read())
                {
                    var values = new object?[reader.FieldCount];
                    for (int c = 0; c < values.Length; c++) values[c] = reader.GetValue(c);
                    rows.Add(values);
                }
                sheets.Add(new(reader.Name, rows, reader.MergeCells ?? Array.Empty<CellRange>(), width));
            } while (reader.NextResult());
        }
        catch (ExcelDataReader.Exceptions.InvalidPasswordException)
        { result.Error = "Password mancante o errata. Inseriscila e riprova l'importazione."; return result; }
        catch (ExcelDataReader.Exceptions.HeaderException)
        { result.Error = "File Excel non riconosciuto o danneggiato."; return result; }

        result.FogliDisponibili = sheets.Select(s => s.Name).ToList();
        Sheet? Select(string kind)
        {
            var candidates = sheets.Where(s => Norm(s.Name).Contains(kind)).ToList();
            var exact = candidates.Where(s => SheetLot(s.Name) == lot).ToList();
            if (exact.Count == 1) return exact[0];
            var neutral = candidates.Where(s => SheetLot(s.Name) is null).ToList();
            if (exact.Count == 0 && neutral.Count == 1) return neutral[0];
            result.Avvisi.Add($"Foglio {kind} per Lotto {lot} assente o ambiguo: nessun foglio di altri lotti importato.");
            return null;
        }
        var eco = Select("offerta economica");
        var cat = Select("catalogo");
        if (eco is not null) result.OffertaEconomica = ParseEco(eco, lot, result);
        if (cat is not null) result.OffertaCatalogo = ParseCat(cat, result);
        if ((result.OffertaEconomica?.Righe.Count ?? 0) + (result.OffertaCatalogo?.Count ?? 0) == 0)
            result.Error = "Nessuna riga di offerta riconosciuta. Verifica lotto, fogli e intestazioni; consulta la diagnostica.";
        return result;
    }
    private static string Header(Sheet sheet, int first, int end, int column) =>
        string.Join(" ", Enumerable.Range(first, end - first).Select(r => Norm(sheet.Text(r, column, true))).Where(t => t.Length > 0).Distinct());
    private static int HeaderStart(Sheet sheet, int end, Func<string, bool> anchor)
    {
        for (int r = end - 1; r >= Math.Max(0, end - 12); r--)
            if (Enumerable.Range(0, sheet.Width).Any(c => anchor(Norm(sheet.Text(r, c))))) return r;
        return Math.Max(0, end - 5);
    }
    private static ExcelSheetDiagnostic Diagnostic(Sheet sheet, int start, Dictionary<string, int> map, OffertaExcelResult result)
    {
        var d = new ExcelSheetDiagnostic { Foglio = sheet.Name, RigaIntestazione = start + 1,
            Colonne = map.ToDictionary(p => p.Key, p => p.Value + 1) };
        result.Diagnostica.Add(d); return d;
    }
    private static OffertaEconomica ParseEco(Sheet s, int lot, OffertaExcelResult result)
    {
        var eco = new OffertaEconomica();
        var first = s.Rows.FindIndex(row => row.Any(v => Tow.IsMatch(Convert.ToString(v, CultureInfo.InvariantCulture)?.Trim() ?? "")));
        if (first < 0) { result.Avvisi.Add($"{s.Name}: nessun codice TOW riconosciuto."); return eco; }
        var start = HeaderStart(s, first, t => t.Contains("codice") || t.Contains("descriz") || t == "tow");
        var map = new Dictionary<string, int>();
        for (int c = 0; c < s.Width; c++)
        {
            var h = Header(s, start, first, c);
            if (h.Contains("descriz")) map.TryAdd("descrizione", c);
            if (h.Contains("quant") || Regex.IsMatch(h, @"\bqta\b")) map.TryAdd("quantita", c);
            if (h.Contains("prezzo") && h.Contains("unit")) map.TryAdd("prezzoUnitario", c);
            if ((h.Contains("importo") || h.Contains("totale")) && !h.Contains("base") && !h.Contains("asta")) map.TryAdd("importo", c);
            if (h.Contains("regol") || h.Contains("vincol") || h.Contains("nota")) map.TryAdd("regole", c);
        }
        var codeColumn = Enumerable.Range(0, s.Width).First(c => Tow.IsMatch(s.Text(first, c)));
        map["codice"] = codeColumn;
        // Nel modello Poste "Descrizione" è l'ambito. La descrizione del TOW
        // sta nella seconda metà dell'intestazione unita Type-of-Work.
        var typeHeader = s.Merges.FirstOrDefault(m => m.FromColumn == codeColumn && m.ToColumn > codeColumn
            && m.FromRow >= start && m.FromRow < first
            && Norm(s.Text(m.FromRow, codeColumn)).Contains("type of work"));
        if (typeHeader != null)
        {
            if (map.TryGetValue("descrizione", out var scopeColumn)) map["ambito"] = scopeColumn;
            map["descrizione"] = codeColumn + 1;
        }
        for (int c = 0; c < s.Width; c++)
        {
            var h = Header(s, start, first, c);
            if (h.Contains("modalita") || h.Contains("erogazione")) map.TryAdd("tipoServizio", c);
            if (h.Contains("unita") && h.Contains("misura")) map.TryAdd("unitaMisura", c);
        }
        var diag = Diagnostic(s, start, map, result);
        foreach (var field in new[] { "descrizione", "quantita", "prezzoUnitario", "importo" })
            if (!map.ContainsKey(field)) result.Avvisi.Add($"{s.Name}: colonna {field} non riconosciuta; valori lasciati vuoti.");
        // Importo base: solo etichette esplicite, mai il totale offerto o un prezzo TOW.
        var baseRx = new Regex(@"\b(?:importo\s+)?base\s+(?:(?:di|d)\s+)?(?:gara|asta)\b");
        // La nota con il limite base può essere sotto i dati. Cerca l'importo
        // dopo l'etichetta esplicita, mai tra i totali offerti o le percentuali.
        for (int r = 0; r < s.Rows.Count && eco.ImportoBaseGara is null; r++)
        for (int c = 0; c < s.Width && eco.ImportoBaseGara is null; c++)
        {
            var text = s.Text(r, c);
            var label = Regex.Match(text, @"\bbase\s+(?:(?:di|d['’]?)\s*)?(?:gara|asta)\b", RegexOptions.IgnoreCase);
            if (!label.Success || !baseRx.IsMatch(Norm(text))) continue;
            var inline = Regex.Match(text[(label.Index + label.Length)..], @"^\s*(?:pari\s+a\s*)?[:=]?\s*(?:€|EUR)?\s*(\d[\d.,]*)", RegexOptions.IgnoreCase);
            if (inline.Success) eco.ImportoBaseGara = Number(inline.Groups[1].Value);
            if (eco.ImportoBaseGara is null && r < first)
            {
                for (int cc = c + 1; cc < s.Width && eco.ImportoBaseGara is null; cc++) eco.ImportoBaseGara = Number(s.Raw(r, cc));
                if (eco.ImportoBaseGara is null && r + 1 < first) eco.ImportoBaseGara = Number(s.Raw(r + 1, c));
            }
        }
        var seen = new HashSet<string>();
        for (int r = first; r < s.Rows.Count; r++)
        {
            var codes = Enumerable.Range(0, s.Width).Select(c => (Col: c, Match: Tow.Match(s.Text(r, c)))).Where(x => x.Match.Success).ToList();
            if (codes.Count == 0) continue;
            if (codes.Count != 1) { result.Avvisi.Add($"{s.Name}, riga {r + 1}: più codici TOW, riga ignorata."); diag.RigheIgnorate++; continue; }
            var m = codes[0].Match;
            if (int.Parse(m.Groups[1].Value) != lot) { diag.RigheIgnorate++; continue; }
            var code = $"TOW{int.Parse(m.Groups[1].Value):00}.{int.Parse(m.Groups[2].Value)}";
            if (!seen.Add(code)) { result.Avvisi.Add($"{s.Name}, riga {r + 1}: TOW duplicato {code}, riga ignorata."); diag.RigheIgnorate++; continue; }
            string Text(string key) => map.TryGetValue(key, out var c) ? s.Text(r, c, true) : "";
            double? Num(string key) => map.TryGetValue(key, out var c) ? ReadNumber(s, r, c, key, result) : null;
            eco.Righe.Add(new() { Codice = code, Descrizione = Text("descrizione"), Quantita = Num("quantita"),
                PrezzoUnitario = Num("prezzoUnitario"), ImportoOfferto = Num("importo"), Regole = Text("regole"),
                Ambito = Text("ambito"), TipoServizio = Text("tipoServizio"), UnitaMisura = Text("unitaMisura"),
                ACatalogo = Norm(Text("unitaMisura")).Contains("catalogo"), RigaExcel = r + 1 });
        }
        diag.RigheLette = eco.Righe.Count;
        return eco;
    }
    private static double? ReadNumber(Sheet s, int row, int col, string field, OffertaExcelResult result)
    {
        var value = Number(s.Raw(row, col));
        if (value is null && !Empty(s.Raw(row, col))) result.Avvisi.Add($"{s.Name}, riga {row + 1}, colonna {col + 1}: {field} non numerico.");
        return value;
    }
    private static List<RigaOffertaCatalogo> ParseCat(Sheet s, OffertaExcelResult result)
    {
        var output = new List<RigaOffertaCatalogo>();
        var anchor = -1; var idCol = -1;
        for (int r = 0; r < s.Rows.Count && anchor < 0; r++)
        for (int c = 0; c < s.Width; c++)
            if (Norm(s.Text(r, c)) is "id" or "cod" or "codice" or "id componente") { anchor = r; idCol = c; break; }
        var generatedId = anchor < 0;
        var nameCol = -1;
        if (generatedId)
        {
            // Il modello reale identifica i driver per nome, senza ID numerico.
            // Non usare mai numeri di prezzo o colonne tecniche nascoste come ID.
            for (int r = 0; r < s.Rows.Count && anchor < 0; r++)
            for (int c = 0; c < s.Width; c++)
                if (Norm(s.Text(r, c)) is "nome driver" or "nome componente") { anchor = r; nameCol = c; break; }
        }
        if (anchor < 0) { result.Avvisi.Add($"{s.Name}: intestazione ID o Nome Driver non riconosciuta."); return output; }
        var first = anchor + 1;
        if (!generatedId)
            while (first < s.Rows.Count && !TryId(s.Text(first, idCol), out _)) first++;
        if (first == s.Rows.Count) { result.Avvisi.Add($"{s.Name}: nessuna riga dati riconosciuta."); return output; }
        // Le intestazioni di gruppo possono trovarsi sopra "Nome Driver".
        var start = anchor;
        for (int r = Math.Max(0, anchor - 3); r < anchor; r++)
            if (Enumerable.Range(0, s.Width).Any(c => Norm(s.Text(r, c)).Contains("realizz") || Norm(s.Text(r, c)).Contains("modifica")))
                { start = r; break; }
        var map = new Dictionary<string, int>();
        if (generatedId) map["nome"] = nameCol; else map["id"] = idCol;
        var offered = new List<(string Label, int Col)>();
        var offeredModification = new List<(string Label, int Col)>();
        for (int c = 0; c < s.Width; c++)
        {
            var h = Header(s, start, first, c);
            if (h.Contains("ambito")) map.TryAdd("ambito", c);
            if (h.Contains("nome") || h.Contains("componente") || h.Contains("driver"))
                if (c != idCol && !h.Contains("descriz")) map.TryAdd("nome", c);
            if (h.Contains("descriz")) map.TryAdd("descrizione", c);
            if (h.Contains("regol") || h.Contains("vincol") || h.Contains("nota")) map.TryAdd("regole", c);
            var band = Regex.IsMatch(h, @"\b(?:semplice|s)\b") ? "Semplice" :
                Regex.IsMatch(h, @"\b(?:medio|media|m)\b") ? "Medio" : Regex.IsMatch(h, @"\b(?:complesso|complessa|c)\b") ? "Complesso" : null;
            var isOffered = h.Contains("prezzo") && (h.Contains("offert") ||
                (h.Contains("modifica") && !h.Contains("base") && !h.Contains("asta")));
            if (isOffered)
            {
                var label = band ?? "Unico";
                var target = h.Contains("modifica") ? offeredModification : offered;
                if (target.Any(o => o.Label == label)) label += $" (col. {c + 1})";
                target.Add((label, c)); map[$"offerto{(h.Contains("modifica") ? "Modifica" : "Realizzazione")}:{label}"] = c;
            }
            else if (band != null && (h.Contains("realizz") || h.Contains("modifica")))
                map.TryAdd(band.ToLowerInvariant() + (h.Contains("modifica") ? "M" : "R"), c);
        }
        var diag = Diagnostic(s, start, map, result);
        diag.IdGenerati = generatedId;
        if (!map.ContainsKey("nome") && !map.ContainsKey("descrizione"))
        { result.Avvisi.Add($"{s.Name}: colonne nome e descrizione non riconosciute; catalogo non importato."); return output; }
        foreach (var key in new[] { "sempliceR", "medioR", "complessoR" })
            if (!map.ContainsKey(key)) result.Avvisi.Add($"{s.Name}: prezzo {key} non riconosciuto.");
        if (offered.Count == 0) result.Avvisi.Add($"{s.Name}: nessuna colonna Prezzo Offerto riconosciuta; nessun prezzo base usato come offerto.");
        var seen = new HashSet<string>();
        for (int r = first; r < s.Rows.Count; r++)
        {
            string id = "";
            if (!generatedId && !TryId(s.Text(r, idCol), out id)) continue;
            string Text(string key) => map.TryGetValue(key, out var c) ? s.Text(r, c, true) : "";
            double? Num(string key) => map.TryGetValue(key, out var c) ? ReadNumber(s, r, c, key, result) : null;
            var name = Text("nome"); var desc = Text("descrizione");
            if (name.Length == 0 && desc.Length == 0) { diag.RigheIgnorate++; continue; }
            if (generatedId)
            {
                // Richiedi prezzi di listino riconosciuti: esclude totali, note e header ripetuti.
                if (!new[] { "sempliceR", "medioR", "complessoR", "sempliceM", "medioM", "complessoM" }
                    .Any(key => map.TryGetValue(key, out var col) && Number(s.Raw(r, col)).HasValue)) continue;
                id = "driver-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Norm(name)))).ToLowerInvariant()[..16];
            }
            if (!seen.Add(id)) { result.Avvisi.Add($"{s.Name}, riga {r + 1}: identificativo duplicato, riga ignorata."); diag.RigheIgnorate++; continue; }
            var rules = Text("regole");
            output.Add(new() { Id = id, IdGenerato = generatedId, RigaExcel = r + 1, Ambito = Text("ambito"), Nome = name, Descrizione = desc,
                PrezzoRealizzazioneSemplice = Num("sempliceR"), PrezzoRealizzazioneMedio = Num("medioR"), PrezzoRealizzazioneComplesso = Num("complessoR"),
                PrezzoModificaSemplice = Num("sempliceM"), PrezzoModificaMedio = Num("medioM"), PrezzoModificaComplesso = Num("complessoM"),
                PrezziOfferto = offered.Select(o => new PrezzoOffertoConRegola { Fascia = o.Label, Valore = ReadNumber(s, r, o.Col, "prezzo offerto", result), Regola = rules }).ToList(),
                PrezziOffertoModifica = offeredModification.Select(o => new PrezzoOffertoConRegola { Fascia = o.Label, Valore = ReadNumber(s, r, o.Col, "prezzo offerto modifica", result), Regola = rules }).ToList(), Regole = rules });
        }
        diag.RigheLette = output.Count;
        return output;
    }
}
