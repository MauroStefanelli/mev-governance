using System.Text.Json;
using ClosedXML.Excel;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Services;

// L'Excel di «Esporta Excel» di MEV e di MEV-CAP: un foglio con una TABELLA (filtri sulle intestazioni, righe a bande), gli importi in euro, i numeri e le date come tali
// (non come testo), le intestazioni sempre visibili, le colonne della larghezza giusta e una riga dei totali. Le colonne sono quelle che la pagina mostra.
public static class MevWorkbookExport
{
    public enum Kind { Text, Euro, Integer, Quantity, Wrap }
    public record Column(string Title, Func<MevItem, IReadOnlyList<RtiSocietaRiga>, object?> Value, Kind Kind = Kind.Text, int Width = 0, bool Total = false);

    public const string EuroFormat = "#,##0.00 [$€-410];[Red]-#,##0.00 [$€-410]";   // 1.234,50 €   (negativi in rosso)
    public const string QuantityFormat = "#,##0.00";
    public const string IntegerFormat = "0";
    public const int EuroWidth = 19;   // «999.999.999,99 €» sono 16 caratteri: con margine, l'importo non diventa mai «#####»

    // --- Mandataria / Mandante e Subco: gli stessi nomi che la tabella mostra ---
    static List<string> Names(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return new();
        var text = value.Trim();
        if (text.StartsWith("["))
        {
            try { return (JsonSerializer.Deserialize<List<JsonElement>>(text) ?? new()).Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() ?? "" : e.ToString()).Where(s => s != "").ToList(); }
            catch (JsonException) { }
        }
        return new() { text };
    }
    static string Norm(string? s) => new string((s ?? "").ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());

    // La «x» dell'Excel storico: si traduce cercando per RUOLO nella tabella RTI & SUBCO, mai per numero di riga (vedi utils/mevCompanies.js).
    public static string CompanyForMark(string column, IReadOnlyList<RtiSocietaRiga> rti)
    {
        if (column == "iet")
            return (rti.FirstOrDefault(r => r.Ruolo == "Mandante" && (Norm(r.Societa) == "iet" || Norm(r.Societa) == "it")) ?? rti.FirstOrDefault(r => r.Ruolo == "Mandante"))?.Societa ?? "IET";
        return rti.FirstOrDefault(r => r.Ruolo == "Mandataria")?.Societa ?? "Capgemini Italia S.p.A.";
    }

    public static List<string> MandataryAndPartners(string? capgemini, string? iet, IReadOnlyList<RtiSocietaRiga> rti)
    {
        List<string> From(string? v, string column) => string.IsNullOrWhiteSpace(v) ? new() : v.Trim().ToLowerInvariant() == "x" ? new() { CompanyForMark(column, rti) } : Names(v);
        var combined = From(capgemini, "capgemini");
        foreach (var name in From(iet, "iet")) if (!combined.Any(e => Norm(e) == Norm(name))) combined.Add(name);
        return combined;
    }

    // I nomi delle SUBCO: il campo puo' contenere gli id delle righe RTI (es. [2,4]) o direttamente i nomi.
    public static List<string> SubcoNames(string? value, IReadOnlyList<RtiSocietaRiga> rti)
    {
        if (string.IsNullOrWhiteSpace(value)) return new();
        string ById(string id) => int.TryParse(id, out var n) ? rti.FirstOrDefault(r => r.Id == n)?.Societa ?? id : id;
        var text = value.Trim();
        if (text.StartsWith("["))
        {
            try { return (JsonSerializer.Deserialize<List<JsonElement>>(text) ?? new()).Select(e => ById(e.ValueKind == JsonValueKind.String ? e.GetString() ?? "" : e.ToString())).Where(s => s != "").ToList(); }
            catch (JsonException) { }
        }
        return text.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
    }

    static object? Dash(string? text) => string.IsNullOrWhiteSpace(text) ? null : text;
    static object? Join(IEnumerable<string> names) { var list = names.ToList(); return list.Count == 0 ? null : string.Join(", ", list); }

    // ---- colonne di MEV (le stesse della tabella) ----
    public static readonly IReadOnlyList<Column> MevColumns = new List<Column>
    {
        new("ID", (m, _) => Dash(m.ExcelId), Kind.Text, 8), new("GoTo", (m, _) => Dash(m.GoTo), Kind.Text, 14), new("Applicativo", (m, _) => Dash(m.Applicativo), Kind.Text, 18),
        new("Descrizione", (m, _) => Dash(m.Descrizione), Kind.Wrap, 48), new("Anno", (m, _) => m.AnnoCompetenza == 0 ? null : m.AnnoCompetenza, Kind.Integer, 8), new("Stato", (m, _) => Dash(m.Stato), Kind.Text, 16),
        new("Importo CAP", (m, _) => m.ImportoExcel, Kind.Euro, EuroWidth, true), new("Note", (m, _) => Dash(m.NoteExcel), Kind.Wrap, 30), new("ODA", (m, _) => Dash(m.Bc), Kind.Text, 14), new("RDA", (m, _) => Dash(m.AtId ?? m.Rda), Kind.Text, 14),
        new("Importo ODA", (m, _) => m.OrdinatoBdo, Kind.Euro, EuroWidth, true), new("Subco", (m, r) => Join(SubcoNames(m.Subco, r)), Kind.Wrap, 26), new("Imp. Subco", (m, _) => m.ImpSubco, Kind.Euro, EuroWidth, true),
        new("P Anno", (m, _) => m.PAnno == 0 ? null : m.PAnno, Kind.Integer, 9), new("P Release", (m, _) => Dash(m.PRelease), Kind.Text, 12), new("P Importo", (m, _) => m.PImporto, Kind.Euro, EuroWidth, true),
        new("P Note", (m, _) => Dash(m.PNote), Kind.Wrap, 30), new("Note CAP", (m, _) => Dash(m.NoteCap), Kind.Wrap, 30),
    };

    // ---- colonne di MEV-CAP ----
    public static readonly IReadOnlyList<Column> MevCapColumns = new List<Column>
    {
        new("ID", (m, _) => Dash(m.ExcelId), Kind.Text, 8), new("GoTo", (m, _) => Dash(m.GoTo), Kind.Text, 14), new("Applicativo", (m, _) => Dash(m.Applicativo), Kind.Text, 18),
        new("Descrizione", (m, _) => Dash(m.Descrizione), Kind.Wrap, 48), new("PM Poste", (m, _) => Dash(m.PmPoste), Kind.Text, 18), new("PM CAP", (m, _) => Dash(m.PmCap), Kind.Text, 18),
        new("Anno", (m, _) => m.AnnoCompetenza == 0 ? null : m.AnnoCompetenza, Kind.Integer, 8), new("Release", (m, _) => Dash(m.ReleaseExcel), Kind.Text, 12), new("Stato", (m, _) => Dash(m.Stato), Kind.Text, 16),
        new("Tipo Contr.", (m, _) => Dash(m.TipoContratto), Kind.Text, 14), new("Recupero", (m, _) => Dash(m.Recupero), Kind.Text, 12), new("Importo CAP", (m, _) => m.ImportoExcel, Kind.Euro, EuroWidth, true),
        new("Note", (m, _) => Dash(m.NoteExcel), Kind.Wrap, 30), new("ODA (BC)", (m, _) => Dash(m.Bc), Kind.Text, 14), new("RDA (AT ID)", (m, _) => Dash(m.AtId ?? m.Rda), Kind.Text, 14),
        new("Importo ODA", (m, _) => m.OrdinatoBdo, Kind.Euro, EuroWidth, true), new("P Importo", (m, _) => m.PImporto, Kind.Euro, EuroWidth, true),
        new("Mandataria/Mandante", (m, r) => Join(MandataryAndPartners(m.Capgemini, m.Iet, r)), Kind.Wrap, 30), new("Subco", (m, r) => Join(SubcoNames(m.Subco, r)), Kind.Wrap, 26), new("Imp. Subco", (m, _) => m.ImpSubco, Kind.Euro, EuroWidth, true),
        new("TOW01", (m, _) => m.Tow021, Kind.Quantity, 10), new("TOW02", (m, _) => m.Tow022, Kind.Quantity, 10), new("TOW03", (m, _) => m.Tow023, Kind.Quantity, 10), new("TOW04", (m, _) => m.Tow024, Kind.Quantity, 10),
        new("TOW05", (m, _) => m.Tow025, Kind.Quantity, 10), new("TOW06", (m, _) => m.Tow026, Kind.Quantity, 10), new("Tot TOW", (m, _) => m.TowTotale, Kind.Quantity, 11, true),
        new("P Anno", (m, _) => m.PAnno == 0 ? null : m.PAnno, Kind.Integer, 9), new("P Release", (m, _) => Dash(m.PRelease), Kind.Text, 12), new("P Note", (m, _) => Dash(m.PNote), Kind.Wrap, 30),
    };

    public static IReadOnlyList<Column> ColumnsFor(string page) => page == "mevcap" ? MevCapColumns : MevColumns;
    public static string TitleFor(string page) => page == "mevcap" ? "MEV-CAP" : "MEV";

    // Il file. «filtersText» descrive i filtri attivi (compare nell'ultima riga di nota); «when» e' l'istante dell'esportazione.
    public static byte[] Build(string page, IReadOnlyList<MevItem> items, IReadOnlyList<RtiSocietaRiga> rti, string? filtersText = null, DateTime? when = null)
    {
        var columns = ColumnsFor(page);
        using var workbook = new XLWorkbook();
        var ws = workbook.AddWorksheet(TitleFor(page));
        const int HeaderRow = 1;
        for (var c = 0; c < columns.Count; c++) ws.Cell(HeaderRow, c + 1).Value = columns[c].Title;

        for (var r = 0; r < items.Count; r++)
            for (var c = 0; c < columns.Count; c++)
            {
                var cell = ws.Cell(HeaderRow + 1 + r, c + 1); var value = columns[c].Value(items[r], rti);
                switch (value)
                {
                    case null: break;
                    case decimal d: cell.Value = d; break;
                    case int i: cell.Value = i; break;
                    case string s: cell.Value = s; break;   // sempre testo: un GoTo come «00123» o una sigla non diventano numeri
                    default: cell.Value = value.ToString(); break;
                }
            }

        var lastRow = HeaderRow + Math.Max(items.Count, 1);
        var range = ws.Range(HeaderRow, 1, lastRow, columns.Count);
        var table = range.CreateTable("MevTabella");
        table.Theme = XLTableTheme.TableStyleMedium2;
        table.ShowRowStripes = true;
        table.ShowTotalsRow = true;
        table.Field(0).TotalsRowLabel = items.Count == 1 ? "Totale (1 riga)" : $"Totale ({items.Count} righe)";
        for (var c = 0; c < columns.Count; c++)
            if (columns[c].Total) table.Field(columns[c].Title).TotalsRowFunction = XLTotalsRowFunction.Sum;

        // Formati: gli importi sono numeri con il simbolo €, non testo. Anche la riga dei totali.
        var totalsRow = lastRow + 1;
        for (var c = 0; c < columns.Count; c++)
        {
            var fmt = columns[c].Kind switch { Kind.Euro => EuroFormat, Kind.Quantity => QuantityFormat, Kind.Integer => IntegerFormat, _ => null };
            var body = ws.Range(HeaderRow + 1, c + 1, lastRow, c + 1);
            if (fmt != null) { body.Style.NumberFormat.Format = fmt; ws.Cell(totalsRow, c + 1).Style.NumberFormat.Format = fmt; }
            if (columns[c].Kind is Kind.Euro or Kind.Quantity or Kind.Integer) { body.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right; ws.Cell(totalsRow, c + 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right; }
            if (columns[c].Kind == Kind.Wrap) body.Style.Alignment.WrapText = true;
            ws.Column(c + 1).Width = Math.Max(columns[c].Width, Math.Min(columns[c].Title.Length + 4, 24));
        }
        ws.Range(HeaderRow + 1, 1, lastRow, columns.Count).Style.Alignment.Vertical = XLAlignmentVerticalValues.Top;
        var header = ws.Range(HeaderRow, 1, HeaderRow, columns.Count);
        header.Style.Alignment.WrapText = true; header.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center; header.Style.Font.Bold = true;
        ws.Row(HeaderRow).Height = 32;
        ws.Range(totalsRow, 1, totalsRow, columns.Count).Style.Font.Bold = true;

        // Intestazioni e prime colonne (ID, GoTo) sempre visibili scorrendo
        ws.SheetView.FreezeRows(HeaderRow);
        ws.SheetView.FreezeColumns(2);

        // Stampa: orizzontale, adattata alla larghezza, intestazione ripetuta
        ws.PageSetup.PageOrientation = XLPageOrientation.Landscape; ws.PageSetup.FitToPages(1, 0); ws.PageSetup.SetRowsToRepeatAtTop(HeaderRow, HeaderRow);

        // Nota sotto la tabella: quando e' stato esportato e con quali filtri
        var note = ws.Cell(totalsRow + 2, 1);
        note.Value = $"Esportato il {(when ?? DateTime.Now):dd/MM/yyyy HH:mm}" + (string.IsNullOrWhiteSpace(filtersText) ? " · tutte le righe" : $" · filtri: {filtersText}");
        note.Style.Font.Italic = true; note.Style.Font.FontColor = XLColor.Gray;

        workbook.Properties.Title = $"{TitleFor(page)} · Quadro economico"; workbook.Properties.Author = "MEV Governance";
        using var stream = new MemoryStream(); workbook.SaveAs(stream); return stream.ToArray();
    }
}
