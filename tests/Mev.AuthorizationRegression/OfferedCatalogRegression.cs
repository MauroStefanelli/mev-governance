using System.Security.Claims;
using System.Text.Json.Nodes;
using ClosedXML.Excel;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Npgsql;

// «Voci di catalogo offerti»: il modello Excel, la lettura con errori cella per cella, il salvataggio che non tocca il catalogo di gara e chi puo' gestirlo.
// Il catalogo e' quello VERO del lotto 2 (27 voci, stessa fixture del Configuratore). Il salvataggio su database vero gira se MEV_TEST_PG e' impostata.
public static class OfferedCatalogRegression
{
    static JsonArray Tender()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "mev-governance-ui", "src", "configuratore", "__fixtures__", "lotto2Catalogo.json"))) dir = dir.Parent;
        if (dir == null) throw new Exception("fixture lotto2Catalogo.json non trovata");
        return JsonNode.Parse(File.ReadAllText(Path.Combine(dir.FullName, "mev-governance-ui", "src", "configuratore", "__fixtures__", "lotto2Catalogo.json")))!.AsArray();
    }

    // Compila il modello come farebbe l'utente: ogni cella gialla = prezzo di gara x sconto (le voci a 0 in gara restano vuote).
    static XLWorkbook Filled(JsonArray tender, decimal factor)
    {
        var wb = new XLWorkbook(new MemoryStream(OfferedCatalogWorkbook.BuildTemplate(tender, "poste-tet-2025", "2")));
        var ws = wb.Worksheet(OfferedCatalogWorkbook.DataSheet); var reference = wb.Worksheet(OfferedCatalogWorkbook.BaseSheet);
        for (int r = 2; r <= tender.Count + 1; r++)
            for (int c = 4; c <= 9; c++)
            {
                var b = reference.Cell(r, c);
                if (!b.IsEmpty() && b.GetDouble() > 0) ws.Cell(r, c).Value = Math.Round((decimal)b.GetDouble() * factor, 2);
            }
        return wb;
    }
    static OfferedCatalogWorkbook.Result Read(XLWorkbook wb, JsonArray tender) { var m = new MemoryStream(); wb.SaveAs(m); m.Position = 0; return OfferedCatalogWorkbook.Read(m, tender); }

    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        var tender = Tender();
        var localReal = Environment.GetEnvironmentVariable("MEV_REAL_CATALOG");
        if (!string.IsNullOrEmpty(localReal) && File.Exists(localReal))
        {
            using var local = File.OpenRead(localReal); var readReal = OfferedCatalogWorkbook.Read(local, tender);
            check(readReal.Ok && readReal.Rows.Count == 27 && readReal.Errors.Count == 0, "LOCAL real file (MEV_REAL_CATALOG): accepted with 27 voices and no errors");
        }
        check(tender.Count == 27, "the real lot 2 tender catalog has 27 voices");

        // ---- il modello ----
        using (var wb = new XLWorkbook(new MemoryStream(OfferedCatalogWorkbook.BuildTemplate(tender, "poste-tet-2025", "2"))))
        {
            var data = wb.Worksheet(OfferedCatalogWorkbook.DataSheet); var reference = wb.Worksheet(OfferedCatalogWorkbook.BaseSheet);
            check(wb.Worksheets.Select(s => s.Name).SequenceEqual(new[] { "CatalogoOfferto", "BaseAsta", "Istruzioni" }), "template: three sheets (data, tender prices, instructions)");
            var headers = Enumerable.Range(1, 9).Select(i => data.Cell(1, i).GetString()).ToList();
            check(headers.SequenceEqual(new[] { "ID", "Ambito", "Voce", "Realizzazione Semplice", "Realizzazione Medio", "Realizzazione Complesso", "Modifica Semplice", "Modifica Medio", "Modifica Complesso" }), "template: the headers are the fixed ones");
            check(data.LastRowUsed()!.RowNumber() == 28 && data.Cell(2, 1).GetString() == "236" && data.Cell(2, 3).GetString() == "Realizzazione Single Page Application" && data.Cell(2, 2).GetString() == "Frontend", "template: one row per tender voice, id/ambit/name already filled");
            check(Enumerable.Range(2, 27).All(r => Enumerable.Range(4, 6).All(c => data.Cell(r, c).IsEmpty())), "template: the price cells are EMPTY (a forgotten price cannot pass as «offered = tender»)");
            check(Enumerable.Range(10, 4).Select(i => data.Cell(1, i).GetString()).SequenceEqual(new[] { "Descrizione Driver", "Descrizione Semplice", "Descrizione Medio", "Descrizione Complesso" }), "template: the four description columns exist after the prices (Descrizione Driver, Semplice, Medio, Complesso)");
            check(Enumerable.Range(2, 27).All(r => Enumerable.Range(10, 4).All(c => data.Cell(r, c).IsEmpty())), "template: the description cells are EMPTY (nothing is pre-filled, so nothing is replaced by mistake)");
            // The fixture of the prices has no tender description: a catalog WITH descriptions (as the real one has) is used for this check.
            var withText = new JsonArray(tender.OfType<JsonObject>().Select(e => { var c = (JsonObject)e.DeepClone(); c["descrizione"] = $"Descrizione di gara {c["id"]}"; return (JsonNode)c; }).ToArray());
            using var wbText = new XLWorkbook(new MemoryStream(OfferedCatalogWorkbook.BuildTemplate(withText, "x", "2")));
            var refText = wbText.Worksheet(OfferedCatalogWorkbook.BaseSheet);
            var dataText = wbText.Worksheet(OfferedCatalogWorkbook.DataSheet);
            check(Enumerable.Range(2, 27).All(r => Enumerable.Range(10, 4).All(c => dataText.Cell(r, c).IsEmpty())), "template: even when the tender voices HAVE a description the description cells of the model stay EMPTY (the user decides what to write)");
            check(refText.Cell(1, 10).GetString().Contains("gara") && refText.Cell(2, 10).GetString() == "Descrizione di gara 236" && refText.Cell(28, 10).GetString() == "Descrizione di gara 1025", "template: the sheet BaseAsta shows the tender description of each voice for reference");
            check(reference.Cell(2, 4).GetDouble() == 1200 && reference.Cell(2, 6).GetDouble() == 4800 && reference.Cell(2, 7).GetDouble() == 280, "template: the sheet BaseAsta shows the tender prices (1200/…/4800, 280)");
        }

        // ---- le descrizioni nel MODELLO (stesse quattro colonne del foglio catalogo): compilo il modello scaricato e lo rileggo ----
        {
            var wb = Filled(tender, 0.5m); var ws = wb.Worksheet("CatalogoOfferto");
            ws.Cell(2, 10).Value = "Driver dal modello"; ws.Cell(2, 11).Value = "Semplice dal modello"; ws.Cell(2, 12).Value = "Medio dal modello"; ws.Cell(2, 13).Value = "Complesso dal modello";
            ws.Cell(3, 11).Value = "Solo semplice";
            var r = Read(wb, tender); var a = r.Rows.Single(x => x.Id == "236"); var b = r.Rows.Single(x => x.Id == "239");
            check(r.Ok && r.Format == OfferedCatalogWorkbook.ModelFormat && a.DriverDescription == "Driver dal modello" && a.Descriptions!["Semplice"] == "Semplice dal modello" && a.Descriptions["Medio"] == "Medio dal modello" && a.Descriptions["Complesso"] == "Complesso dal modello", "model: the four description columns are read like those of the catalog sheet");
            check(b.DriverDescription == null && b.Descriptions!.Count == 1 && b.Descriptions["Semplice"] == "Solo semplice" && r.Rows.Single(x => x.Id == "241").Descriptions == null, "model: a voice may have only some descriptions; empty cells are not invented");
            var entries0 = OfferedCatalogWorkbook.ToEntries(r.Rows);
            check(entries0[0]!["descrizione"]!.ToString() == "Driver dal modello" && entries0[0]!["descrizioni"]!["Complesso"]!.ToString() == "Complesso dal modello" && entries0[0]!["nome"] == null, "model: the descriptions are saved with the prices, never the name");
        }
        {
            // A model downloaded BEFORE the description columns existed (nine columns) is still accepted.
            var wb = Filled(tender, 0.5m); var ws = wb.Worksheet("CatalogoOfferto"); ws.Range(1, 10, 28, 13).Clear();
            var r = Read(wb, tender); check(r.Ok && r.Rows.Count == 27 && r.Rows.All(x => x.Descriptions == null && x.DriverDescription == null), "model: an older model without the description columns is still accepted");
        }
        { var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 10).Value = new string('x', 2500); var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 2") && e.Contains("Descrizione Driver") && e.Contains("supera 2000")), "model: a description that is far too long is refused"); }
        { var wb = Filled(tender, 0.5m); var ws = wb.Worksheet("CatalogoOfferto"); ws.Cell(40, 11).Value = "testo orfano"; var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 40") && e.Contains("manca l'ID")), "model: a description written on a row without an ID is an error, not silently dropped"); }

        // ---- un file compilato bene ----
        var good = Read(Filled(tender, 0.5m), tender);
        check(good.Ok && good.Errors.Count == 0 && good.Rows.Count == 27, "a filled model is accepted with all 27 voices");
        var first = good.Rows.First(r => r.Id == "236");
        check(first.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Medio").Offered == 1400 && first.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Medio").Base == 2800, "read: offered 1.400 next to the tender 2.800 (voice 236, Realizzazione Medio)");
        check(first.Prices.Single(p => p.Type == "MODIFICA" && p.Band == "Semplice").Offered == 140, "read: Modifica Semplice 280 x 0,5 = 140");
        var zeroVoices = tender.OfType<JsonObject>().Count(e => new[] { "REALIZZAZIONE", "MODIFICA" }.Any(t => new[] { "Semplice", "Medio", "Complesso" }.Any(b => (e["prezzi"]![t]![b]?.GetValue<decimal>() ?? 0) == 0)));
        check(zeroVoices > 0 && good.Ok, "voices with a 0 price in the tender may stay empty in the file (" + zeroVoices + " voices have one)");
        check(good.Warnings.Count == 0, "no warnings for an ordinary discount");

        // ---- cosa viene salvato: id + prezzi, mai i nomi ----
        var entries = OfferedCatalogWorkbook.ToEntries(good.Rows);
        check(entries.Count == 27 && entries[0]!["id"]!.GetValue<long>() == 236 && entries[0]!["nome"] == null && entries[0]!["ambito"] == null && entries[0]!["descrizione"] == null, "saved: only id and prices (names stay those of the tender catalog)");
        check(entries[0]!["prezzi"]!["REALIZZAZIONE"]!["Medio"]!.GetValue<decimal>() == 1400m, "saved: prezzi.REALIZZAZIONE.Medio = 1400");

        // ---- errori: ognuno rifiuta il file e dice dove ----
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 1).Value = "99999";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 2") && e.Contains("99999") && e.Contains("non esiste")), "error: an ID that is not in the tender catalog is refused, with the row");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(3, 1).Value = "236";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 3") && e.Contains("più di una volta")), "error: a duplicated ID is refused");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Row(5).Delete();
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Mancano 1 voci")), "error: a missing voice is refused (every voice of the lot is needed)");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 5).Clear();
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 2") && e.Contains("Realizzazione Medio") && e.Contains("manca il prezzo offerto") && e.Contains("2800")), "error: an empty price where the tender has one is refused and says which cell");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 5).Value = "abc";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 2") && e.Contains("«abc» non è un importo")), "error: text that is not an amount is refused");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 5).Value = -5;
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("negativo")), "error: a negative price is refused");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(1, 5).Value = "Prezzo medio";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Intestazioni mancanti") && e.Contains("Realizzazione Medio")), "error: a changed header is refused");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Name = "Foglio1";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Non riconosco il file")), "error: a renamed sheet (neither the model nor the catalog sheet) is refused with a clear message");
        }
        { var r = OfferedCatalogWorkbook.Read(new MemoryStream(new byte[] { 1, 2, 3, 4 }), tender); check(!r.Ok && r.Errors.Single().Contains("non è un XLSX leggibile"), "error: a file that is not an XLSX is refused with a clear message"); }
        { var r = Read(new XLWorkbook(new MemoryStream(OfferedCatalogWorkbook.BuildTemplate(tender, "x", "2"))), tender); check(!r.Ok && r.Errors.Any(e => e.Contains("manca il prezzo offerto")), "error: the EMPTY model is refused (nothing filled in)"); }
        {
            var wb = Filled(tender, 0.5m); var ws = wb.Worksheet("CatalogoOfferto");
            for (int r0 = 2; r0 <= 28; r0++) ws.Cell(r0, 5).Value = "xx";
            var r = Read(wb, tender); check(!r.Ok && r.Errors.Count <= OfferedCatalogWorkbook.MaxErrors + 1, "error: the list of errors is capped (not hundreds of lines)");
        }

        // ---- il foglio catalogo con i prezzi offerti (stessa struttura del file vero del lotto 2: ID, descrizioni per complessita', colonne di calcolo; i valori sono inventati) ----
        var realFile = Path.Combine(AppContext.BaseDirectory, "Fixtures", "CatalogoLotto2Offerto.xlsx");
        OfferedCatalogWorkbook.Result Real(Action<IXLWorksheet>? edit = null)
        {
            using var wb = new XLWorkbook(realFile); edit?.Invoke(wb.Worksheets.First());
            var m = new MemoryStream(); wb.SaveAs(m); m.Position = 0; return OfferedCatalogWorkbook.Read(m, tender);
        }
        var real = Real();
        check(real.Ok && real.Rows.Count == 27 && real.Errors.Count == 0, "catalog sheet: the real file is accepted with all 27 voices and no errors");
        check(real.Format == OfferedCatalogWorkbook.CatalogFormat, "catalog sheet: the format is recognised as the catalog sheet");
        var r236 = real.Rows.Single(x => x.Id == "236");
        check(r236.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Semplice").Offered == 600m && r236.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Medio").Offered == 1400m && r236.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Complesso").Offered == 2400m, "catalog sheet: voice 236 Realizzazione 600 / 1.400 / 2.400 (read from the columns under «P. OFFERTO REALIZZAZIONE»)");
        check(r236.Prices.Single(p => p.Type == "MODIFICA" && p.Band == "Semplice").Offered == 140m && r236.Prices.Single(p => p.Type == "MODIFICA" && p.Band == "Medio").Offered == 420m && r236.Prices.Single(p => p.Type == "MODIFICA" && p.Band == "Complesso").Offered == 700m, "catalog sheet: voice 236 Modifica 140 / 420 / 700");
        check(real.Rows.Single(x => x.Id == "239").Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Complesso").Offered == 2250m, "catalog sheet: voice 239 Realizzazione Complesso 2.250 (read from the right column)");
        check(real.Rows.Single(x => x.Id == "406").Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Semplice").Offered == 0m, "catalog sheet: a 0 offered where the tender is 0 is kept (voice 406, Realizzazione Semplice)");
        check(real.Rows.Count(x => x.Descriptions != null) == 18 && real.Rows.Count(x => x.Descriptions?.Count == 3) == 18 && r236.Descriptions!["Semplice"] == "Descrizione Semplice di prova per la voce 236" && r236.Descriptions["Complesso"] == "Descrizione Complesso di prova per la voce 236", "catalog sheet: the descriptions Semplice/Medio/Complesso are read for the 18 voices that have them");
        check(r236.DriverDescription == "Descrizione driver di prova 236" && real.Rows.Count(x => x.DriverDescription != null) == 26 && real.Rows.Single(x => x.Id == "239").DriverDescription == null, "catalog sheet: the «Descrizione Driver» is read for the 26 voices that have it; where the cell is empty nothing is invented");
        check(real.Rows.Single(x => x.Id == "406").Descriptions == null, "catalog sheet: a voice without descriptions has none (nothing invented)");
        check(real.Warnings.Count == 3 && real.Warnings.Any(w => w.Contains("Riga 8") && w.Contains("ambito") && w.Contains("resta quello di gara")) && real.Warnings.Any(w => w.Contains("ID 242")) && real.Warnings.Any(w => w.Contains("ID 410")), "catalog sheet: name and ambit that differ from the tender are only WARNED (3 warnings), the tender ones stay");
        var realEntries = OfferedCatalogWorkbook.ToEntries(real.Rows);
        check(realEntries.Count == 27 && realEntries[0]!["nome"] == null && realEntries[0]!["ambito"] == null, "catalog sheet: saved are id, prices and descriptions, never name or ambit");
        check(realEntries[0]!["descrizione"]!.ToString() == "Descrizione driver di prova 236" && realEntries.Single(e => e!["id"]!.GetValue<long>() == 239)!["descrizione"] == null, "catalog sheet: the driver description is saved under «descrizione» only where the file has one");
        check(realEntries[0]!["descrizioni"]!["Medio"]!.ToString() == "Descrizione Medio di prova per la voce 236" && realEntries.Single(e => e!["id"]!.GetValue<long>() == 406)!["descrizioni"] == null, "catalog sheet: the descriptions are saved under «descrizioni» and only where present");
        check(Real(ws => ws.Cell(40, 17).Value = 5).Ok && Real(ws => { ws.Cell(31, 24).Value = 6015; }).Ok, "catalog sheet: the calculation cells under the table (no ID in that row) are ignored");
        { var r = Real(ws => ws.Cell(3, 10).Clear()); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 3") && e.Contains("Realizzazione Semplice") && e.Contains("manca il prezzo offerto")), "catalog sheet: an empty offered price is refused with the row and the column"); }
        { var r = Real(ws => ws.Cell(3, 11).Value = 5000); check(r.Ok && r.Warnings.Any(w => w.Contains("Riga 3") && w.Contains("supera la base d'asta")), "catalog sheet: an offered price above the tender is warned"); }
        { var r = Real(ws => ws.Row(6).Delete()); check(!r.Ok && r.Errors.Any(e => e.Contains("Mancano 1 voci") && e.Contains("242")), "catalog sheet: a missing voice is refused and named"); }
        { var r = Real(ws => ws.Cell(4, 2).Value = 99999); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 4") && e.Contains("99999")), "catalog sheet: an unknown ID is refused"); }
        { var r = Real(ws => ws.Cell(4, 2).Value = 236); check(!r.Ok && r.Errors.Any(e => e.Contains("più di una volta")), "catalog sheet: a duplicated ID is refused"); }
        { var r = Real(ws => { ws.Cell(1, 10).Value = "Altro"; ws.Cell(1, 13).Value = "Altro"; }); check(!r.Ok && r.Errors.Any(e => e.Contains("non trovo le colonne dei prezzi offerti")), "catalog sheet: without the «P. OFFERTO» labels the price columns are not guessed"); }
        { var r = Real(ws => { ws.Cell(1, 10).Value = "PREZZO BASE REALIZZAZIONE"; ws.Cell(1, 13).Value = "PREZZO BASE MODIFICA"; }); check(!r.Ok && r.Errors.Any(e => e.Contains("non trovo le colonne dei prezzi offerti")), "catalog sheet: columns labelled as BASE prices are never read as offered prices"); }
        { var r = Real(ws => ws.Cell(3, 5).Value = new string('x', 2500)); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 3") && e.Contains("Descrizione Driver") && e.Contains("supera 2000")), "catalog sheet: a «Descrizione Driver» that is far too long is refused"); }
        { var r = Real(ws => ws.Cell(3, 6).Value = new string('x', 2500)); check(!r.Ok && r.Errors.Any(e => e.Contains("Riga 3") && e.Contains("supera 2000 caratteri")), "catalog sheet: a description that is far too long is refused"); }
        { var r = Real(ws => ws.Cell(3, 13).Value = -1); check(!r.Ok && r.Errors.Any(e => e.Contains("negativo")), "catalog sheet: a negative price is refused"); }
        check(good.Format == OfferedCatalogWorkbook.ModelFormat, "model: the format is recognised as the model");
        check(OfferedCatalogWorkbook.ToEntries(good.Rows)[0]!["descrizioni"] == null && OfferedCatalogWorkbook.ToEntries(good.Rows)[0]!["descrizione"] == null, "model: without descriptions nothing is saved");

        // ---- importi scritti all'italiana, avvisi ----
        {
            var wb = Filled(tender, 0.5m); var ws = wb.Worksheet("CatalogoOfferto");
            ws.Cell(2, 5).SetValue("1.400,50"); ws.Cell(2, 4).SetValue("€ 600"); ws.Cell(2, 6).SetValue("2400.5");
            var r = Read(wb, tender); var row = r.Rows.First(x => x.Id == "236");
            check(r.Ok && row.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Medio").Offered == 1400.50m && row.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Semplice").Offered == 600m && row.Prices.Single(p => p.Type == "REALIZZAZIONE" && p.Band == "Complesso").Offered == 2400.5m, "amounts written as text are read: «1.400,50», «€ 600», «2400.5»");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 5).Value = 3000;
            var r = Read(wb, tender); check(r.Ok && r.Warnings.Any(w => w.Contains("Riga 2") && w.Contains("supera la base d'asta")), "a price above the tender base is saved but WARNED");
        }
        {
            var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(2, 3).Value = "Altro nome";
            var r = Read(wb, tender); check(r.Ok && r.Warnings.Any(w => w.Contains("vale l'ID 236")) && OfferedCatalogWorkbook.ToEntries(r.Rows)[0]!["nome"] == null, "a different name is only warned: the ID decides and the name is never overwritten");
        }
        { var wb = Filled(tender, 0.5m); wb.Worksheet("CatalogoOfferto").Cell(40, 1).Value = ""; check(Read(wb, tender).Ok, "empty rows at the bottom are ignored"); }

        // ---- la tabella modificabile: le modifiche passano dagli STESSI controlli del file ----
        JsonArray Edits(Action<JsonObject>? change = null)
        {
            var rows = new JsonArray();
            foreach (var row in good.Rows)
            {
                var o = new JsonObject { ["id"] = row.Id, ["nome"] = "nome da ignorare", ["ambito"] = "ambito da ignorare", ["prezzi"] = new JsonObject() };
                foreach (var type in OfferedCatalogWorkbook.Types) { var t = new JsonObject(); foreach (var band in OfferedCatalogWorkbook.Bands) t[band] = row.Prices.Single(p => p.Type == type && p.Band == band).Offered; o["prezzi"]![type] = t; }
                change?.Invoke(o); rows.Add(o);
            }
            return rows;
        }
        var okEdit = OfferedCatalogWorkbook.FromEdits(Edits(), tender);
        check(okEdit.Ok && okEdit.Rows.Count == 27 && okEdit.Errors.Count == 0, "table: an unchanged table is accepted with all 27 voices");
        var editedA = OfferedCatalogWorkbook.FromEdits(Edits(o => { if (o["id"]!.ToString() == "236") { o["prezzi"]!["REALIZZAZIONE"]!["Medio"] = "1.234,50"; o["descrizione"] = "Nuova descrizione"; o["descrizioni"] = new JsonObject { ["Semplice"] = "S", ["Complesso"] = "C" }; } }), tender);
        var entry236 = OfferedCatalogWorkbook.ToEntries(editedA.Rows)[0]!;
        check(editedA.Ok && entry236["prezzi"]!["REALIZZAZIONE"]!["Medio"]!.GetValue<decimal>() == 1234.50m && entry236["descrizione"]!.ToString() == "Nuova descrizione" && entry236["descrizioni"]!["Complesso"]!.ToString() == "C" && entry236["descrizioni"]!["Medio"] == null, "table: an edited price (written «1.234,50»), the driver description and some band descriptions are saved; empty ones are not invented");
        check(entry236["nome"] == null && entry236["ambito"] == null && editedA.Rows[0].Name == "Realizzazione Single Page Application" && editedA.Rows[0].Ambit == "Frontend", "table: name and ambit sent by the table are IGNORED (they stay those of the tender catalog)");
        { var r = OfferedCatalogWorkbook.FromEdits(Edits(o => { if (o["id"]!.ToString() == "236") o["prezzi"]!["REALIZZAZIONE"]!["Medio"] = null; }), tender); check(!r.Ok && r.Errors.Any(e => e.Contains("ID 236") && e.Contains("Realizzazione Medio") && e.Contains("manca il prezzo offerto")), "table: clearing a price where the tender has one is refused"); }
        { var r = OfferedCatalogWorkbook.FromEdits(Edits(o => { if (o["id"]!.ToString() == "236") o["prezzi"]!["REALIZZAZIONE"]!["Medio"] = "abc"; }), tender); check(!r.Ok && r.Errors.Any(e => e.Contains("«abc» non è un importo")), "table: text that is not an amount is refused"); }
        { var r = OfferedCatalogWorkbook.FromEdits(Edits(o => { if (o["id"]!.ToString() == "236") o["prezzi"]!["MODIFICA"]!["Semplice"] = -3; }), tender); check(!r.Ok && r.Errors.Any(e => e.Contains("negativo")), "table: a negative price is refused"); }
        { var r = OfferedCatalogWorkbook.FromEdits(Edits(o => { if (o["id"]!.ToString() == "236") o["descrizione"] = new string('x', 2500); }), tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Descrizione Driver") && e.Contains("supera 2000")), "table: a description that is far too long is refused"); }
        { var rows = Edits(); rows.RemoveAt(3); var r = OfferedCatalogWorkbook.FromEdits(rows, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("Mancano 1 voci")), "table: a missing voice is refused (every voice of the lot is needed)"); }
        { var rows = Edits(); rows[2]!["id"] = "236"; var r = OfferedCatalogWorkbook.FromEdits(rows, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("più di una volta")), "table: a duplicated ID is refused"); }
        { var rows = Edits(); rows[2]!["id"] = "99999"; var r = OfferedCatalogWorkbook.FromEdits(rows, tender); check(!r.Ok && r.Errors.Any(e => e.Contains("99999")), "table: an unknown ID is refused"); }
        { var r = OfferedCatalogWorkbook.FromEdits(Edits(o => { if (o["id"]!.ToString() == "236") o["prezzi"]!["REALIZZAZIONE"]!["Medio"] = 5000; }), tender); check(r.Ok && r.Warnings.Any(w => w.Contains("supera la base d'asta")), "table: a price above the tender base is saved but WARNED, as in the file"); }
        check(OfferedCatalogWorkbook.FromEdits(new JsonArray(), tender).Errors.Count > 0, "table: an empty table is refused");

        // ---- chi puo' gestirlo ----
        check(OfferedCatalogWorkbook.CanManage(true, false, null, "4490015980") && OfferedCatalogWorkbook.CanManage(true, false, null, null), "SuperAdmin: every lot");
        check(OfferedCatalogWorkbook.CanManage(false, true, "4490015980", "4490015980"), "Admin: the lot of HIS contract");
        check(!OfferedCatalogWorkbook.CanManage(false, true, "4490015980", "4490015981"), "Admin: NOT the lot of another contract");
        check(!OfferedCatalogWorkbook.CanManage(false, true, "4490015980", "") && !OfferedCatalogWorkbook.CanManage(false, true, "4490015980", null), "Admin: NOT a lot linked to no contract");
        check(!OfferedCatalogWorkbook.CanManage(false, true, "", "") && !OfferedCatalogWorkbook.CanManage(false, true, null, null), "Admin without contract: nothing (empty = empty must not match)");
        check(!OfferedCatalogWorkbook.CanManage(false, false, "4490015980", "4490015980"), "any other role: never");

        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        OfferedCatalogController As(string role, int environment = 1) => new(db, config) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.Name, "anna"), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", environment.ToString()) }, "test")) } } };
        foreach (var role in new[] { "Editor", "Client", "Developer", "Bid Manager", "Manager" })
        {
            var c = As(role);
            check(await c.Lots() is ForbidResult && await c.Template("poste-tet-2025", "2") is ForbidResult && await c.Preview(null!, "poste-tet-2025", "2") is ForbidResult
                && await c.Import(null!, "poste-tet-2025", "2") is ForbidResult && await c.Remove("poste-tet-2025", "2") is ForbidResult
                && await c.Table("poste-tet-2025", "2") is ForbidResult && await c.SaveTable(new TableEdit { ContractId = "poste-tet-2025", Lot = "2", Rows = new JsonArray() }) is ForbidResult, $"{role}: refused on all seven actions of the offered catalog (including the table)");
        }
        var attrs = typeof(OfferedCatalogController).GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AuthorizeAttribute), true);
        check(attrs.Length == 1, "the controller requires a login");

        // ---- salvataggio su un Postgres vero (solo se MEV_TEST_PG e' impostata) ----
        var pg = Environment.GetEnvironmentVariable("MEV_TEST_PG");
        if (string.IsNullOrWhiteSpace(pg)) { Console.WriteLine("(salvataggio su Postgres saltato: imposta MEV_TEST_PG per provarlo)"); return; }
        await using var conn = new NpgsqlConnection(pg); await conn.OpenAsync();
        async Task Sql(string sql) { await using var cmd = new NpgsqlCommand(sql, conn); await cmd.ExecuteNonQueryAsync(); }
        await Sql("DROP SCHEMA IF EXISTS offtest CASCADE; CREATE SCHEMA offtest; CREATE TABLE offtest.\"PC_DataRecords\" (id serial primary key, record_key text unique, entity_type text, contract_id text, lot_id text, title text, payload jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
        var lotPayload = new JsonObject { ["name"] = "Lotto 2", ["codiceContratto"] = "4490015980", ["catalog"] = tender.DeepClone(), ["towPrices"] = new JsonObject { ["TOW02.1"] = 3607 }, ["catalogFile"] = "gara.pdf", ["active"] = true };
        await using (var ins = new NpgsqlCommand("INSERT INTO offtest.\"PC_DataRecords\" (record_key, entity_type, contract_id, lot_id, title, payload) VALUES ('poste-tet-2025|2|contract-lot','contract_lot','poste-tet-2025','2','Lotto 2', @p::jsonb)", conn)) { ins.Parameters.AddWithValue("p", lotPayload.ToJsonString()); await ins.ExecuteNonQueryAsync(); }
        var before = (await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!;
        check(OfferedCatalogStore.TenderCatalog(before.Payload).Count == 27 && before.Payload["offeredCatalog"] == null, "db: the lot has the tender catalog and no offered catalog yet");
        check(await OfferedCatalogStore.Save(conn, "offtest", "poste-tet-2025", "2", entries, new JsonObject { ["fileName"] = "f.xlsx", ["rows"] = 27 }), "db: the offered catalog is saved");
        var after = (await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!;
        check(after.Payload["offeredCatalog"]!.AsArray().Count == 27 && after.Payload["offeredCatalogMeta"]!["fileName"]!.ToString() == "f.xlsx", "db: 27 offered voices and the file name are stored");
        check(after.Payload["catalog"]!.ToJsonString() == before.Payload["catalog"]!.ToJsonString(), "db: the TENDER catalog is byte-for-byte the same after the import");
        check(after.Payload["towPrices"]!.ToJsonString() == before.Payload["towPrices"]!.ToJsonString() && after.Payload["catalogFile"]!.ToString() == "gara.pdf" && after.Payload["codiceContratto"]!.ToString() == "4490015980", "db: TOW prices, file name and contract link are untouched");
        check(after.Payload["offeredCatalog"]![0]!["prezzi"]!["REALIZZAZIONE"]!["Medio"]!.GetValue<decimal>() == 1400m, "db: the offered price is stored (1.400)");
        // Il Configuratore legge i contratti da GET api/configuratore/contracts: il catalogo offerto deve arrivare fin li', altrimenti «Riallinea ai prezzi offerti» non compare mai.
        await using (var contract = new NpgsqlCommand("INSERT INTO offtest.\"PC_DataRecords\" (record_key, entity_type, contract_id, lot_id, title, payload) VALUES ('poste-tet-2025|contract','contract','poste-tet-2025','','Poste','{\"name\":\"Poste TeT\"}'::jsonb)", conn)) await contract.ExecuteNonQueryAsync();
        var api = new ConfiguratoreController(db, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DB_CONNECTION_STRING"] = pg, ["DB_SCHEMA"] = "offtest" }).Build())
        { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, "anna"), new Claim(ClaimTypes.Role, "SuperAdmin") }, "test")) } } };
        var served = System.Text.Json.JsonSerializer.Serialize(((OkObjectResult)await api.GetContracts()).Value);
        var servedLot = System.Text.Json.JsonDocument.Parse(served).RootElement[0].GetProperty("lots")[0];
        check(servedLot.GetProperty("offeredCatalog").GetArrayLength() == 27 && servedLot.GetProperty("offeredCatalogMeta").GetProperty("fileName").GetString() == "f.xlsx", "api: GET contracts sends the offered catalog (27 voices) and its file name to the Configuratore");
        check(servedLot.GetProperty("catalog").GetArrayLength() == 27 && servedLot.GetProperty("offeredCatalog")[0].GetProperty("prezzi").GetProperty("REALIZZAZIONE").GetProperty("Medio").GetDecimal() == 1400m, "api: the tender catalog is still sent as before, next to the offered one");
        // la tabella: lettura e salvataggio con controllo di versione, sul lotto vero
        var tableApi = new OfferedCatalogController(db, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DB_CONNECTION_STRING"] = pg, ["DB_SCHEMA"] = "offtest" }).Build())
        { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, "anna"), new Claim(ClaimTypes.Role, "SuperAdmin") }, "test")) } } };
        var tableDoc = System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(((OkObjectResult)await tableApi.Table("poste-tet-2025", "2")).Value)).RootElement;
        check(tableDoc.GetProperty("rows").GetArrayLength() == 27 && tableDoc.GetProperty("loaded").GetBoolean() && tableDoc.GetProperty("rows")[0].GetProperty("id").ToString() == "236" && tableDoc.GetProperty("rows")[0].GetProperty("prezzi").GetProperty("REALIZZAZIONE").GetProperty("Medio").GetDecimal() == 1400m && tableDoc.GetProperty("rows")[0].GetProperty("prezziGara").GetProperty("REALIZZAZIONE").GetProperty("Medio").GetDecimal() == 2800m, "table api: 27 voices in tender order, each with the offered price (1.400) next to the tender price (2.800)");
        // l'import dal FILE passa dall'endpoint vero (non solo dallo store): risposta e salvataggio devono funzionare
        var importFile = Path.Combine(AppContext.BaseDirectory, "Fixtures", "CatalogoLotto2Offerto.xlsx");
        await using (var xs = File.OpenRead(importFile))
        {
            var form = new FormFile(xs, 0, xs.Length, "file", "CatalogoLotto2Offerto.xlsx");
            var imported = await tableApi.Import(form, "poste-tet-2025", "2");
            check(imported is OkObjectResult ok1 && System.Text.Json.JsonSerializer.Serialize(ok1.Value).Contains("\"stamp\""), "import api: the file import answers OK (no error 500) and returns the version stamp");
        }
        var afterImport = (await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!;
        check(afterImport.Payload["offeredCatalog"]!.AsArray().Count == 27 && afterImport.Payload["offeredCatalogMeta"]!["fileName"]!.ToString() == "CatalogoLotto2Offerto.xlsx" && afterImport.Payload["offeredCatalogMeta"]!["importedAt"]!.ToString().Contains('.'), "import api: 27 voices saved with the file name and a precise version stamp");
        tableDoc = System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(((OkObjectResult)await tableApi.Table("poste-tet-2025", "2")).Value)).RootElement;
        check(tableDoc.GetProperty("rows")[0].GetProperty("prezzi").GetProperty("REALIZZAZIONE").GetProperty("Medio").GetDecimal() == 1400m, "import api: the table shows what the import saved");
        var stamp0 = tableDoc.GetProperty("stamp").GetString() ?? "";
        var sendRows = new JsonArray(good.Rows.Select(r => { var o = new JsonObject { ["id"] = r.Id, ["prezzi"] = new JsonObject() }; foreach (var type in OfferedCatalogWorkbook.Types) { var t = new JsonObject(); foreach (var band in OfferedCatalogWorkbook.Bands) t[band] = r.Prices.Single(p => p.Type == type && p.Band == band).Offered; o["prezzi"]![type] = t; } return (JsonNode)o; }).ToArray());
        sendRows[0]!["prezzi"]!["REALIZZAZIONE"]!["Medio"] = 1500; sendRows[0]!["descrizione"] = "Descrizione modificata";
        var saved1 = await tableApi.SaveTable(new TableEdit { ContractId = "poste-tet-2025", Lot = "2", Stamp = stamp0, Rows = (JsonArray)sendRows.DeepClone() });
        check(saved1 is OkObjectResult, "table api: the edited table is saved");
        var afterEdit = (await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!;
        check(afterEdit.Payload["offeredCatalog"]![0]!["prezzi"]!["REALIZZAZIONE"]!["Medio"]!.GetValue<decimal>() == 1500m && afterEdit.Payload["offeredCatalog"]![0]!["descrizione"]!.ToString() == "Descrizione modificata", "table api: the new price (1.500) and description are in the database");
        check(afterEdit.Payload["catalog"]!.ToJsonString() == before.Payload["catalog"]!.ToJsonString() && afterEdit.Payload["towPrices"]!.ToJsonString() == before.Payload["towPrices"]!.ToJsonString(), "table api: the TENDER catalog and the TOW prices are untouched by a table save");
        var stamp1 = OfferedCatalogStore.Stamp(afterEdit.Payload);
        check(stamp1 != "" && stamp1 != stamp0 && afterEdit.Payload["offeredCatalogMeta"]!["updatedBy"]!.ToString() == "anna", "table api: the version stamp changes and records who saved");
        var saved2 = await tableApi.SaveTable(new TableEdit { ContractId = "poste-tet-2025", Lot = "2", Stamp = stamp1, Rows = (JsonArray)sendRows.DeepClone() });
        var stamp2 = OfferedCatalogStore.Stamp((await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!.Payload);
        check(saved2 is OkObjectResult && stamp2 != stamp1 && stamp2 != stamp0 && System.Text.Json.JsonSerializer.Serialize(((OkObjectResult)saved2).Value).Contains(stamp2), "table api: EVERY save makes a new version stamp, and the answer carries it (so the next save from the same page works)");
        var stale = await tableApi.SaveTable(new TableEdit { ContractId = "poste-tet-2025", Lot = "2", Stamp = stamp1, Rows = (JsonArray)sendRows.DeepClone() });
        check(stale is ConflictObjectResult, "table api: a save made on an OLD version (somebody else saved meanwhile) is refused with a conflict");
        check((await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!.Payload["offeredCatalog"]![0]!["prezzi"]!["REALIZZAZIONE"]!["Medio"]!.GetValue<decimal>() == 1500m, "table api: the refused save wrote nothing");
        var badRows = (JsonArray)sendRows.DeepClone(); badRows[1]!["prezzi"]!["REALIZZAZIONE"]!["Medio"] = "xx";
        var bad = await tableApi.SaveTable(new TableEdit { ContractId = "poste-tet-2025", Lot = "2", Stamp = stamp2, Rows = badRows });
        check(bad is BadRequestObjectResult && (await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!.Payload["offeredCatalog"]![1]!["prezzi"]!["REALIZZAZIONE"]!["Medio"]!.GetValue<decimal>() != 0m, "table api: a table with an error is refused as a whole and nothing is written");
        check(await tableApi.SaveTable(new TableEdit { ContractId = "poste-tet-2025", Lot = "9", Stamp = stamp1, Rows = (JsonArray)sendRows.DeepClone() }) is NotFoundObjectResult, "table api: a lot that does not exist is not found");
        var adminOther = new OfferedCatalogController(db, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DB_CONNECTION_STRING"] = pg, ["DB_SCHEMA"] = "offtest" }).Build())
        { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, "paolo"), new Claim(ClaimTypes.Role, "Admin"), new Claim("ambienteId", "2") }, "test")) } } };
        check(await adminOther.Table("poste-tet-2025", "2") is NotFoundObjectResult && await adminOther.SaveTable(new TableEdit { ContractId = "poste-tet-2025", Lot = "2", Stamp = stamp1, Rows = (JsonArray)sendRows.DeepClone() }) is NotFoundObjectResult, "table api: an Admin of ANOTHER contract can neither read nor save this lot's table");
        check(!await OfferedCatalogStore.Save(conn, "offtest", "poste-tet-2025", "9", entries, null), "db: a lot that does not exist is not created");
        check(await OfferedCatalogStore.Save(conn, "offtest", "poste-tet-2025", "2", null, null), "db: the offered catalog is removed");
        var removed = (await OfferedCatalogStore.LoadLot(conn, "offtest", "poste-tet-2025", "2"))!;
        check(removed.Payload["offeredCatalog"] == null && removed.Payload["offeredCatalogMeta"] == null && removed.Payload["catalog"]!.ToJsonString() == before.Payload["catalog"]!.ToJsonString(), "db: after the removal the lot is back to the tender catalog, unchanged");
        await Sql("DROP SCHEMA offtest CASCADE");
    }
}
