using ClosedXML.Excel;
using MevGovernanceBackend.Services;

public static class OfferWorkbookRegression
{
    public static void Run(Action<bool, string> check)
    {
        using var template = new MemoryStream();
        using (var workbook = new XLWorkbook())
        {
            var summary = workbook.AddWorksheet("EXAMPLE"); summary.Cell("A4").Value = "ID_INTERVENTO";
            summary.Cell("A6").Value = "OLD"; summary.Cell("H7").Value = "TOTALE TOW";
            summary.Range("J9:M9").Merge(); summary.Cell("B18").Value = "TOW02.1";
            summary.Cell("A27").Value = "ESCLUSIONI"; summary.Cell("B28").Value = "OLD EXCLUSION";
            var detail = workbook.AddWorksheet("DettaglioInterventi");
            var heads = new[] { "ID Intervento", "Componente-applicativo", "Tecnologia", "Unità", "Descrizione Intervento", "ID di catalogo", "Ambito driver", "Nome Driver", "Tipo Intervento", "Complessità", "Quantità", "Prezzo Unitario", "Prezzo Totale" };
            for (var c = 0; c < heads.Length; c++) detail.Cell(1, c + 1).Value = heads[c];
            detail.Cell("A2").Value = "OLD"; detail.Cell("M2").Value = 999;
            var table = detail.Range("A1:M2").CreateTable("Table3"); table.ShowTotalsRow = true;
            workbook.SaveAs(template);
        }
        var request = new OfferWorkbookRequest { Code = "GOTO-TEST", Title = "Prova", Interventions = new() {
            new("I1", "Uno", "", "", "SAP", "REQ1", "", "", 1, 0, 1, 0),
            new("I2", "Due", "", "", "SAP", "REQ2", "", "", 0, 1, 0, 1) },
            Details = new() { new("I1", "API", "Java", "", "API uno", "239", "Backend", "API", "MODIFICA", "Medio", 2, 50), new("I2", "Tabella", "SAP", "", "Tabella due", "965", "SAP", "Tabella", "REALIZZAZIONE", "Medio", 1, 75) },
            TowPrices = new() { ["TOW02.1"] = 10, ["TOW02.2"] = 20, ["TOW02.3"] = 30, ["TOW02.4"] = 40 } };
        template.Position = 0;
        var bytes = OfferWorkbookExporter.Generate(template, request);
        using var result = new XLWorkbook(new MemoryStream(bytes));
        var s = result.Worksheet("GOTO-TEST"); var d = result.Worksheet("DettaglioInterventi");
        check(result.Worksheets.Count == 2, "Export preserves two worksheet structure");
        check(d.Cell("M2").HasFormula && d.Cell("M3").HasFormula && d.Cell("M2").GetValue<decimal>() == 100 && d.Cell("M3").GetValue<decimal>() == 75, $"Export detail uses quantity times price formulas: {d.Cell("M2").FormulaA1} / {d.Cell("M3").FormulaA1}");
        check(s.Cell("M6").FormulaA1.Contains("SUMIF") && s.Cell("M7").FormulaA1.Contains("A7"), "Export groups catalog totals by intervention ID");
        check(s.Cell("I9").FormulaA1 == "I8*D19" && s.Cell("J10").FormulaA1 == "SUM(I9:M9)", "Export adjusts summary formulas and shifted price references");
        check(s.Cell("D19").GetValue<decimal>() == 10 && d.Cell("L2").GetValue<decimal>() == 50, "Export replaces example prices");
        check(!s.CellsUsed().Any(c => c.DataType == XLDataType.Text && c.GetString() == "OLD EXCLUSION"), "Export clears example exclusions");
        check(d.Tables.Single().RangeAddress.LastAddress.RowNumber == 4, "Export resizes structured detail table");
        var realTemplate = Environment.GetEnvironmentVariable("OFFER_TEMPLATE_TEST");
        if (!string.IsNullOrEmpty(realTemplate))
        {
            using var original = File.OpenRead(realTemplate);
            var actual = OfferWorkbookExporter.Generate(original, request);
            using var actualBook = new XLWorkbook(new MemoryStream(actual));
            check(actualBook.Worksheet("GOTO-TEST").Cell("J10").GetValue<decimal>() == 275, "Real template summary reconciles with detail and TOW prices");
            check(actualBook.Worksheet("DettaglioInterventi").Tables.Single().DataRange.RowCount() == 2, "Real template resizes to current details");
        }
        request.TowPrices.Clear(); template.Position = 0;
        try { OfferWorkbookExporter.Generate(template, request); check(false, "Missing price should block export"); }
        catch (ArgumentException) { check(true, "Missing contractual prices block export"); }
    }
}
