using ClosedXML.Excel;
using MevGovernanceBackend.Services;

internal static class RealLayoutRegression
{
    public static int Run()
    {
        int checks = 0;
        void Check(bool value, string message) { if (!value) throw new Exception(message); checks++; }
        OffertaExcelResult Read(int offset = 0)
        {
            using var wb = new XLWorkbook();
            var e = wb.AddWorksheet("SCHEMA OFFERTA ECONOMICA ");
            e.Cell("B13").Value = "Modalità di erogazione"; e.Cell("C13").Value = "Descrizione";
            e.Range("D13:E13").Merge().Value = "Type-of-Work";
            e.Cell("F13").Value = "Unità\nMisura"; e.Cell("G13").Value = "Qtà";
            e.Cell("H13").Value = "Prezzo Unitario (IVA esclusa)"; e.Cell("I13").Value = "Prezzo Totale (IVA esclusa)";
            e.Range("B14:B18").Merge().Value = "Servizi a TASK";
            e.Range("C14:C18").Merge().Value = "Ambito evolutivo";
            e.Range("F14:F17").Merge().Value = "Nr. Iniziative";
            for (int i = 0; i < 5; i++)
            {
                var r = i + 14; e.Cell(r, 4).Value = $"TOW02.{i + 1}";
                e.Cell(r, 5).Value = $"Descrizione TOW {i + 1}";
                if (i < 4) { e.Cell(r, 7).Value = 410; e.Cell(r, 9).Value = 0; }
            }
            e.Range("F18:H18").Merge().Value = "A catalogo";
            e.Range("B19:H19").Merge().Value = "IMPORTO TOTALE OFFERTO Servizi a TASK"; e.Cell("I19").Value = 0;
            e.Cell("D20").Value = "TOW02.6"; e.Cell("E20").Value = "Descrizione canone";
            e.Cell("B20").Value = "Servizi a canone"; e.Cell("C20").Value = "Ambito ordinario";
            e.Cell("F20").Value = "Canoni"; e.Cell("G20").Value = 24; e.Cell("I20").Value = 0;
            e.Range("B25:E25").Merge().Value = "L'IMPORTO TOTALE OFFERTO NON PUO ESSERE PARI O SUPERIORE ALL'IMPORTO BASE GARA pari a 1.234.567,89";
            e.Range("B26:E26").Merge().Value = "NON SUPERARE IL 2,25% DELL' IMPORTO TOTALE OFFERTO";
            var c = wb.AddWorksheet("Schema Offerta Catalogo Lotto 2");
            c.Range("C7:E7").Merge().Value = "Base d'asta REALIZZAZIONE";
            c.Range("F7:H7").Merge().Value = "Base d'asta MODIFICA";
            c.Range("J7:L7").Merge().Value = "Prezzo offerto REALIZZAZIONE";
            c.Range("N7:P7").Merge().Value = "Prezzo MODIFICA";
            c.Cell("A8").Value = "Nome Driver"; c.Cell("B8").Value = "Descrizione Driver";
            foreach (int col in new[] { 3, 6, 10, 14 })
            { c.Cell(8, col).Value = "Semplice"; c.Cell(8, col + 1).Value = "Medio"; c.Cell(8, col + 2).Value = "Complesso"; }
            c.Cell("R8").Value = "TOTALE";
            for (int row = 9; row <= 10; row++)
            {
                c.Cell(row, 1).Value = row == 9 ? "Driver Alpha" : "Driver Beta";
                c.Cell(row, 2).Value = "Descrizione Realizzazione Componente con parole dell'intestazione";
                for (int col = 3; col <= 8; col++) c.Cell(row, col).Value = col * 100;
                for (int col = 14; col <= 16; col++) c.Cell(row, col).Value = 0;
                c.Cell(row, 26).Value = 6; c.Cell(row, 27).Value = false; // Colonne helper mai usate come ID
            }
            c.Cell("R11").Value = 0; c.Cell("AA11").Value = false;
            c.Cell("A12").Value = "Note finali";
            if (offset > 0) c.Row(1).InsertRowsAbove(offset);
            using var input = new MemoryStream(); wb.SaveAs(input); input.Position = 0;
            return ContractParserService.ParseOffertaExcel(input, 2, null);
        }
        var result = Read();
        Check(result.Error is null && result.Avvisi.Count == 0, "Layout reale senza errori o avvisi");
        var eco = result.OffertaEconomica!; var catalog = result.OffertaCatalogo!;
        Check(eco.Righe.Count == 6 && catalog.Count == 2, "Sei TOW e driver senza ID");
        Check(eco.ImportoBaseGara == 1234567.89, "Base gara nella nota dopo i dati, senza confonderla con il totale o una percentuale");
        Check(eco.Righe[0].Descrizione == "Descrizione TOW 1" && eco.Righe[0].Ambito == "Ambito evolutivo", "Descrizione TOW distinta da ambito");
        Check(eco.Righe[3].UnitaMisura == "Nr. Iniziative" && eco.Righe[3].TipoServizio == "Servizi a TASK", "Celle unite ereditate");
        Check(eco.Righe[4].ACatalogo && eco.Righe[4].Quantita is null && eco.Righe[4].PrezzoUnitario is null, "A catalogo senza quantità o prezzo fittizio");
        Check(eco.Righe[5].Quantita == 24 && eco.Righe[5].Ambito == "Ambito ordinario", "Canone separato dai task");
        Check(catalog.All(x => x.IdGenerato && x.Id.StartsWith("driver-") && x.Id != "6"), "ID tecnici distinti dai numeri helper nascosti");
        Check(catalog[0].Nome == "Driver Alpha" && catalog[0].PrezzoRealizzazioneSemplice == 300 && catalog[0].PrezzoModificaSemplice == 600, "Prezzi base Realizzazione/Modifica separati");
        Check(catalog[0].PrezziOfferto.All(p => p.Valore is null) && catalog[0].PrezziOffertoModifica.All(p => p.Valore == 0), "Offerta Realizzazione vuota, Modifica zero in gruppo separato");
        var shifted = Read(3);
        Check(catalog.Select(x => x.Id).SequenceEqual(shifted.OffertaCatalogo!.Select(x => x.Id)), "Identificatori stabili dopo spostamento delle righe");
        Check(shifted.OffertaCatalogo![0].RigaExcel == 12, "Tracciabilità della riga sorgente aggiornata");
        return checks;
    }
}
