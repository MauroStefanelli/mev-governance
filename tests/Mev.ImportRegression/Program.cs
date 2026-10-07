using ClosedXML.Excel;
using MevGovernanceBackend.Services;
using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using MevGovernanceBackend.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Primitives;
using System.Security.Claims;

int checks = 0;
void Check(bool value, string message) { if (!value) throw new Exception(message); checks++; }
MemoryStream Workbook(bool badHeaders = false, string catName = "Schema Offerta Catalogo Lotto 1")
{
    using var wb = new XLWorkbook();
    var eco = wb.AddWorksheet("SCHEMA OFFERTA ECONOMICA");
    eco.Range("A1:G1").Merge().Value = "IMPORTO BASE GARA: € 1.234.567,89";
    eco.Range("A3:A4").Merge().Value = "Codice TOW";
    eco.Range("B3:B4").Merge().Value = "Descrizione";
    eco.Range("C3:C4").Merge().Value = "Quantità";
    eco.Cell("D3").Value = "Prezzo"; eco.Cell("D4").Value = "Unitario";
    eco.Cell("E3").Value = badHeaders ? "Sconosciuta" : "Importo";
    eco.Cell("E4").Value = badHeaders ? "" : "Offerto";
    eco.Range("F3:F4").Merge().Value = "Regole";
    eco.Cell("A5").Value = "TOW 01.1"; eco.Cell("B5").Value = "Analisi";
    eco.Cell("C5").Value = 510; eco.Cell("D5").Value = "1234.56"; eco.Cell("E5").Value = "1.234,56 €";
    eco.Cell("A6").Value = "TOW01.2"; eco.Cell("B6").Value = "Realizzazione";
    eco.Cell("C6").Value = 95; eco.Cell("D6").Value = 100.50; eco.Cell("E6").Value = 0;
    eco.Cell("A7").Value = "TOW02.1"; eco.Cell("B7").Value = "Altro lotto";
    eco.Cell("A8").Value = "IMPORTO TOTALE OFFERTO"; eco.Cell("E8").Value = 999999;
    var cat = wb.AddWorksheet(catName);
    cat.Range("A1:P1").Merge().Value = "SCHEMA OFFERTA CATALOGO";
    cat.Range("A3:A5").Merge().Value = "ID";
    cat.Range("B3:B5").Merge().Value = "Ambito";
    cat.Range("C3:C5").Merge().Value = "Componente";
    cat.Range("D3:D5").Merge().Value = "Descrizione";
    cat.Range("E3:G3").Merge().Value = "Prezzi Catalogo";
    cat.Range("E4:G4").Merge().Value = "Realizzazione";
    cat.Range("H3:J3").Merge().Value = "Prezzi Catalogo";
    cat.Range("H4:J4").Merge().Value = "Modifica";
    cat.Range("K3:M3").Merge().Value = "Prezzo Offerto";
    cat.Range("K4:M4").Merge().Value = "Realizzazione";
    cat.Range("N3:N5").Merge().Value = "Regole";
    foreach (var first in new[] { 5, 8, 11 })
    { cat.Cell(5, first).Value = "S"; cat.Cell(5, first + 1).Value = "M"; cat.Cell(5, first + 2).Value = "C"; }
    cat.Range("B6:B7").Merge().Value = "Software";
    for (int r = 6; r <= 7; r++)
    {
        cat.Cell(r, 1).Value = r - 5; // ID a una cifra
        cat.Cell(r, 3).Value = r == 6 ? "Componente Realizzazione" : "Servizio";
        cat.Cell(r, 4).Value = "Descrizione che contiene Ambito e Realizzazione";
        for (int c = 5; c <= 10; c++) cat.Cell(r, c).Value = c * 100 + r;
        cat.Cell(r, 11).Value = r == 6 ? "2.345,67" : "1234.56";
        cat.Cell(r, 12).Value = 0;
        cat.Cell(r, 14).Value = "Non superare il listino";
    }
    cat.Cell("C8").Value = "Totale"; cat.Cell("E8").Value = 12345; // Mai un ID
    var stream = new MemoryStream(); wb.SaveAs(stream); stream.Position = 0; return stream;
}
using (var input = Workbook())
{
    var r = ContractParserService.ParseOffertaExcel(input, 1, null);
    Check(r.Error is null, "Errore su workbook valido");
    Check(r.OffertaEconomica?.Righe.Count == 2, "Righe TOW e filtro lotto");
    Check(r.OffertaEconomica!.ImportoBaseGara == 1234567.89, "Base gara inline");
    Check(r.OffertaEconomica.Righe[0].PrezzoUnitario == 1234.56, "Decimale invariante testuale");
    Check(r.OffertaEconomica.Righe[0].ImportoOfferto == 1234.56, "Importo italiano euro");
    Check(r.OffertaEconomica.Righe[1].ImportoOfferto == 0, "Zero conservato");
    Check(r.OffertaCatalogo?.Count == 2, "ID singoli, testo dati con keyword e totale escluso");
    var c = r.OffertaCatalogo![0];
    Check(c.PrezzoRealizzazioneSemplice == 506 && c.PrezzoModificaSemplice == 806, "Gruppi prezzi distinti");
    Check(c.PrezziOfferto.Select(p => p.Fascia).SequenceEqual(new[] { "Semplice", "Medio", "Complesso" }), "Fasce sotto intestazione unita");
    Check(c.PrezziOfferto[0].Valore == 2345.67 && c.PrezziOfferto[1].Valore == 0 && c.PrezziOfferto[2].Valore is null, "Prezzi offerti distinti da listino, zero e null");
    Check(r.OffertaCatalogo[1].Ambito == "Software", "Ambito unito ereditato");
    Check(r.Diagnostica.Count == 2 && r.Diagnostica.All(d => d.RigheLette == 2), "Diagnostica righe e colonne");
}
using (var input = Workbook(catName: "Offerta Catalogo Lotto 10"))
{
    var r = ContractParserService.ParseOffertaExcel(input, 1, null);
    Check(r.OffertaCatalogo is null && r.Avvisi.Any(a => a.Contains("assente")), "Lotto 1 non importa Lotto 10");
}
using (var input = Workbook(badHeaders: true))
{
    var r = ContractParserService.ParseOffertaExcel(input, 1, null);
    Check(r.OffertaEconomica!.Righe.All(x => x.ImportoOfferto is null) && r.Avvisi.Any(a => a.Contains("importo")), "Colonna sconosciuta: avviso senza numeri inventati");
}
using (var wb = new XLWorkbook())
{
    wb.AddWorksheet("SCHEMA OFFERTA ECONOMICA").Cell("A1").Value = "Nessun dato";
    using var input = new MemoryStream(); wb.SaveAs(input); input.Position = 0;
    var r = ContractParserService.ParseOffertaExcel(input, 1, null);
    Check(r.Error is not null, "Nessun successo per risultato vuoto");
}
// Fixture pubblica ExcelDataReader v3.7.0: vera cifratura Agile AES256/SHA512.
var fixture = Path.Combine(AppContext.BaseDirectory, "Fixtures", "encrypted-password.xlsx");
foreach (var pwd in new string?[] { null, "errata", "password" })
{
    using var input = File.OpenRead(fixture);
    var r = ContractParserService.ParseOffertaExcel(input, 1, pwd);
    if (pwd == "password") Check(r.FogliDisponibili?.Count > 0 && !r.Error!.Contains("Password"), "Password corretta apre il workbook cifrato");
    else Check(r.Error?.Contains("Password") == true && r.FogliDisponibili is null, "Password mancante o errata gestita");
}
async Task<IActionResult> Endpoint(Stream input, string? password = null)
{
    var http = new DefaultHttpContext();
    http.User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.Role, "Bid Manager") }, "test"));
    http.Request.ContentType = "multipart/form-data; boundary=test";
    var files = new FormFileCollection { new FormFile(input, 0, input.Length, "file", "test.xlsx") };
    http.Request.Form = new FormCollection(new Dictionary<string, StringValues> { ["password"] = password ?? "" }, files);
    var controller = new GareController(null!, null!, new ConfigurationBuilder().Build()) { ControllerContext = new ControllerContext { HttpContext = http } };
    return await controller.ParseOffertaExcel(1);
}
using (var input = Workbook()) Check(await Endpoint(input) is OkObjectResult, "Endpoint restituisce OK per dati reali");
using (var input = File.OpenRead(fixture)) Check(await Endpoint(input, "errata") is BadRequestObjectResult, "Endpoint restituisce 400 per password errata");
using (var input = File.OpenRead(fixture)) Check(await Endpoint(input, "password") is BadRequestObjectResult, "Endpoint restituisce 400 quando il workbook non contiene offerte");

// Risposta AI simulata: verifica diagnostica prima della normalizzazione UI, nessuna API reale.
var content = new JsonObject { ["lotti"] = new JsonArray { new JsonObject { ["sezioni"] = new JsonArray {
    new JsonObject { ["numero"] = "1", ["titolo"] = "Titolo", ["sintesi"] = "Contenuto" },
    new JsonObject { ["numero"] = "2", ["titolo"] = "Titolo", ["sintesi"] = " " },
    new JsonObject { ["numero"] = "3", ["titolo"] = "Titolo" },
    new JsonObject { ["numero"] = "4", ["titolo"] = "Titolo", ["sintesi"] = 12 } } } } };
var response = new JsonObject { ["choices"] = new JsonArray { new JsonObject {
    ["finish_reason"] = "stop", ["message"] = new JsonObject { ["content"] = content.ToJsonString() } } } };
var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
    ["AI_ENDPOINT"] = "https://openai.generative-eu.engine.capgemini.com/v1/chat/completions",
    ["AI_API_KEY"] = "test-key", ["AI_MODEL"] = "test-model" }).Build();
var ai = new AiService(config, new FakeClientFactory(response.ToJsonString()));
var analysis = await ai.AnalizzaGaraAsync(JsonSerializer.SerializeToElement(new { testo = "solo test" }));
var diagAi = analysis.Analysis["_sectionDiagnostics"]!;
Check(diagAi["totale"]!.GetValue<int>() == 4 && diagAi["conSintesi"]!.GetValue<int>() == 1, "Conteggio sintesi AI");
Check(diagAi["sintesiVuota"]!.GetValue<int>() == 1 && diagAi["sintesiAssente"]!.GetValue<int>() == 1 && diagAi["sintesiNonValida"]!.GetValue<int>() == 1, "Diagnostica sintesi vuota, assente, tipo errato");
Check(analysis.Analysis["lotti"]![0]!["sezioni"]![1]!["sintesi"]!.GetValue<string>() == " ", "Sintesi mancante non inventata");
checks += RealLayoutRegression.Run();
Console.WriteLine($"PASS: {checks} verifiche backend.");

sealed class FakeClientFactory(string response) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new(new FakeHandler(response));
}
sealed class FakeHandler(string response) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
        Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(response) });
}
