using ClosedXML.Excel;

namespace MevGovernanceBackend.Services;

public record OfferDetail(string InterventionId, string Component, string Technology, string Unit, string Description,
    string CatalogId, string Ambit, string Driver, string Type, string Complexity, decimal Quantity, decimal UnitPrice);
public record OfferIntervention(string Id, string Title, string Description, string Activity, string System, string Requirements,
    string Phase, string Notes, decimal Tow1, decimal Tow2, decimal Tow3, decimal Tow4);
public class OfferWorkbookRequest
{
    public string Code { get; set; } = "";
    public string Title { get; set; } = "";
    public string Lot { get; set; } = "2";
    public List<OfferIntervention> Interventions { get; set; } = new();
    public List<OfferDetail> Details { get; set; } = new();
    public Dictionary<string, decimal> TowPrices { get; set; } = new();
}

public static class OfferWorkbookExporter
{
    public static byte[] Generate(Stream template, OfferWorkbookRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || request.Code.Length > 31 || request.Code.IndexOfAny("[]:*?/\\".ToCharArray()) >= 0
            || request.Code == "DettaglioInterventi" || request.Interventions.Count == 0 || request.Interventions.Count > 500 || request.Details.Count == 0 || request.Details.Count > 10000)
            throw new ArgumentException("Codice iniziativa o numero di righe non valido.");
        var ids = request.Interventions.Select(i => i.Id).ToHashSet();
        if (ids.Count != request.Interventions.Count || ids.Any(string.IsNullOrWhiteSpace) || request.Details.Any(d => !ids.Contains(d.InterventionId)
            || d.Quantity < 0 || d.UnitPrice < 0 || string.IsNullOrWhiteSpace(d.Driver)))
            throw new ArgumentException("Interventi duplicati, dettagli non associati o importi non validi.");
        var quantities = request.Interventions.SelectMany(i => new[] { i.Tow1, i.Tow2, i.Tow3, i.Tow4 });
        if (quantities.Any(q => q < 0)) throw new ArgumentException("Le quantità TOW non possono essere negative.");
        foreach (var n in Enumerable.Range(1, 4))
        {
            var key = $"TOW0{request.Lot}.{n}";
            if (!request.TowPrices.TryGetValue(key, out var price) || price <= 0)
                throw new ArgumentException($"Prezzo contrattuale mancante: {key}. Non verrà usato il listino dell’esempio.");
        }
        using var workbook = new XLWorkbook(template);
        if (workbook.Worksheets.Count != 2 || !workbook.Worksheets.TryGetWorksheet("DettaglioInterventi", out var detail))
            throw new ArgumentException("Il template deve avere due fogli, incluso DettaglioInterventi.");
        var summary = workbook.Worksheets.First(s => s.Name != "DettaglioInterventi");
        if (summary.Cell("A4").GetString() != "ID_INTERVENTO" || detail.Cell("A1").GetString() != "ID Intervento"
            || detail.Cell("M1").GetString() != "Prezzo Totale")
            throw new ArgumentException("Template non riconosciuto: utilizzare il modello Tabella Offerta con intestazioni originali.");
        var totals = summary.Column(8).CellsUsed().FirstOrDefault(c => c.GetString() == "TOTALE TOW")?.Address.RowNumber ?? 0;
        var priceRow = summary.Column(2).CellsUsed().FirstOrDefault(c => c.GetString().Replace(" ", "") == $"TOW0{request.Lot}.1")?.Address.RowNumber ?? 0;
        if (totals <= 6 || priceRow <= totals + 2 || detail.Tables.Count() != 1)
            throw new ArgumentException("Struttura riepilogo/listino non riconosciuta o lotto del template diverso dalla stima.");
        var table = detail.Tables.Single();
        if (table.RangeAddress.FirstAddress.RowNumber != 1 || table.ColumnCount() != 13 || !table.ShowTotalsRow)
            throw new ArgumentException("La tabella DettaglioInterventi deve avere 13 colonne e riga totali.");
        summary.Name = request.Code;
        // Replace the example rows while letting ClosedXML shift formulas/merges below them.
        var oldCount = totals - 6;
        var delta = request.Interventions.Count - oldCount;
        if (delta > 0) summary.Row(totals - 1).InsertRowsBelow(delta);
        if (delta < 0) summary.Rows(6 + request.Interventions.Count, totals - 1).Delete();
        totals = 6 + request.Interventions.Count;
        priceRow += delta;
        summary.Cell("A2").Value = $"Interventi Iniziativa\nCodice: {request.Code}\nTitolo: {request.Title}";
        // Clear all example detail data, including rows outside the resized table.
        detail.Range(2, 1, Math.Max(table.RangeAddress.LastAddress.RowNumber, request.Details.Count + 2), 13).Clear(XLClearOptions.Contents);
        table.ShowTotalsRow = false;
        table.Resize(detail.Range(1, 1, request.Details.Count + 1, 13));
        table.ShowTotalsRow = true;
        for (var index = 0; index < request.Details.Count; index++)
        {
            var d = request.Details[index]; var row = index + 2;
            var values = new[] { d.InterventionId, d.Component, d.Technology, d.Unit, d.Description, d.CatalogId, d.Ambit, d.Driver, d.Type, d.Complexity };
            for (var col = 0; col < values.Length; col++) detail.Cell(row, col + 1).Value = values[col] ?? "";
            detail.Cell(row, 11).Value = d.Quantity; detail.Cell(row, 12).Value = d.UnitPrice;
            detail.Cell(row, 13).FormulaA1 = $"K{row}*L{row}";
        }
        table.Field("ID Intervento").TotalsRowLabel = "Totale";
        table.Field("Prezzo Unitario").TotalsRowFunction = XLTotalsRowFunction.Sum;
        table.Field("Prezzo Totale").TotalsRowFunction = XLTotalsRowFunction.Sum;
        detail.Range(2, 9, request.Details.Count + 1, 9).CreateDataValidation().List("\"REALIZZAZIONE,MODIFICA\"");
        for (var index = 0; index < request.Interventions.Count; index++)
        {
            var i = request.Interventions[index]; var row = index + 6;
            var values = new[] { i.Id, i.Title, i.Description, i.Activity, i.System, i.Requirements, i.Phase, i.Notes };
            for (var col = 0; col < values.Length; col++) summary.Cell(row, col + 1).Value = values[col] ?? "";
            summary.Cell(row, 9).Value = i.Tow1; summary.Cell(row, 10).Value = i.Tow2;
            summary.Cell(row, 11).Value = i.Tow3; summary.Cell(row, 12).Value = i.Tow4;
            summary.Cell(row, 13).FormulaA1 = $"SUMIF(DettaglioInterventi!A2:A{request.Details.Count + 1},A{row},DettaglioInterventi!M2:M{request.Details.Count + 1})";
        }
        for (var col = 9; col <= 13; col++)
        {
            var letter = XLHelper.GetColumnLetterFromNumber(col);
            summary.Cell(totals, col).FormulaA1 = $"SUM({letter}6:{letter}{totals - 1})";
            summary.Cell(totals + 1, col).FormulaA1 = col == 13 ? $"M{totals}" : $"{letter}{totals}*D{priceRow + col - 9}";
        }
        summary.Cell(totals + 2, 10).FormulaA1 = $"SUM(I{totals + 1}:M{totals + 1})";
        for (var n = 1; n <= 4; n++) summary.Cell(priceRow + n - 1, 4).Value = request.TowPrices[$"TOW0{request.Lot}.{n}"];
        // Never retain initiative-specific exclusions from the example.
        var exclusion = summary.Column(1).CellsUsed().FirstOrDefault(c => c.GetString() == "ESCLUSIONI");
        if (exclusion != null) summary.Range(exclusion.Address.RowNumber + 1, 2, summary.LastRowUsed()!.RowNumber(), 4).Clear(XLClearOptions.Contents);
        workbook.CalculateMode = XLCalculateMode.Auto;
        using var output = new MemoryStream(); workbook.SaveAs(output);
        return output.ToArray();
    }
}
