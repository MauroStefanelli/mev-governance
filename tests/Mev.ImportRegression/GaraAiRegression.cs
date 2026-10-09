using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using MevGovernanceBackend.Services;

static class GaraAiRegression
{
    public static async Task<int> Run()
    {
        int checks = 0;
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); checks++; }
        JsonObject Reply(string content, string finish = "stop") => new() {
            ["choices"] = new JsonArray { new JsonObject { ["finish_reason"] = finish,
                ["message"] = new JsonObject { ["content"] = content } } } };
        string metadata = "{\"lotti\":[{\"nome\":\"Lotto 1\",\"documentiRichiesti\":[{\"nome\":\"Relazione\"}],\"sezioni\":[]},{\"nome\":\"Lotto 2\",\"sezioni\":[]}]}";
        AiService Service(Func<JsonObject, JsonObject> responder) => new(
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
                ["AI_ENDPOINT"] = "https://openai.generative-eu.engine.capgemini.com/v1/chat/completions",
                ["AI_API_KEY"] = "test-key", ["AI_MODEL"] = "test-model" }).Build(), new Factory(responder));
        var plain = JsonSerializer.SerializeToElement(new { testo = "Test" });
        int calls = 0;
        var recovered = await Service(_ => ++calls == 1 ? Reply("{\"lotti\":", "length") : Reply(metadata)).AnalizzaGaraAsync(plain);
        Check(!recovered.Analysis.ContainsKey("error") && calls == 2, "Risposta troncata riprovata");
        calls = 0;
        var cut = await Service(_ => { calls++; return Reply(metadata, "length"); }).AnalizzaGaraAsync(plain);
        Check(cut.Analysis["code"]?.ToString() == "AI_OUTPUT_TRUNCATED" && calls == 2, "JSON valido con length non accettato");
        calls = 0;
        var malformed = await Service(_ => ++calls == 1 ? Reply("{\"lotti\":") : Reply(metadata)).AnalizzaGaraAsync(plain);
        Check(!malformed.Analysis.ContainsKey("error") && calls == 2, "JSON malformato riprovato");
        var invalid = await Service(_ => Reply("{\"titolo\":\"Solo titolo\"}")).AnalizzaGaraAsync(plain);
        Check(invalid.Analysis["code"]?.ToString() == "AI_INVALID_JSON", "Lotti mancanti non salvati");
        var incomplete = await Service(_ => new JsonObject { ["status"] = "incomplete", ["choices"] = new JsonArray(),
            ["incomplete_details"] = new JsonObject { ["reason"] = "max_output_tokens" } }).AnalizzaGaraAsync(plain);
        Check(incomplete.Analysis["code"]?.ToString() == "AI_OUTPUT_TRUNCATED", "Responses incomplete e choices vuote");
        calls = 0;
        var refused = await Service(_ => { calls++; return Reply("", "content_filter"); }).AnalizzaGaraAsync(plain);
        Check(refused.Analysis["code"]?.ToString() == "AI_RESPONSE_REFUSED" && calls == 1, "Rifiuto senza retry");
        var source = "Paragrafo 1 - Ambito\nContesto comune\nParagrafo 1.4 - Contesto Applicativo\nApplicazioni\n" +
            "Paragrafo 1.4.1 - Lotto 1 - Tracciatura\nEventi postali\nParagrafo 1.4.2 - Lotto 2 - Logistica\nPrenotazioni\n" +
            string.Join("\n", Enumerable.Range(2, 10).Select(n => $"Paragrafo {n} - Requisito {n}\nDettaglio {n}"));
        var context = JsonSerializer.SerializeToElement(new { testo = source });
        var batches = new System.Collections.Concurrent.ConcurrentBag<int>();
        JsonObject Respond(JsonObject request)
        {
            var input = request["messages"]![1]!["content"]!.GetValue<string>();
            if (!input.StartsWith("[")) return Reply(metadata);
            var items = JsonNode.Parse(input)!.AsArray(); batches.Add(items.Count);
            return Reply(new JsonObject { ["sezioni"] = new JsonArray(items.Select(item => (JsonNode)new JsonObject {
                ["numero"] = item!["numero"]!.DeepClone(), ["sintesi"] = "Sintesi del contenuto" }).ToArray()) }.ToJsonString());
        }
        var grouped = await Service(Respond).AnalizzaGaraAsync(context);
        Check(!grouped.Analysis.ContainsKey("error") && batches.Count == 3 && batches.All(n => n <= 6), "14 paragrafi in tre gruppi");
        var first = grouped.Analysis["lotti"]![0]!;
        Check(first["sezioni"]!.AsArray().Count == 13, "Paragrafi comuni e Lotto 1 mantenuti");
        Check(!first["sezioni"]!.AsArray().Any(s => s!["numero"]!.ToString() == "1.4.2"), "Escluso fratello di altro lotto");
        Check(first["sezioni"]![2]!["titolo"]!.ToString() == "Lotto 1 - Tracciatura", "Titolo conservato dalla fonte");
        Check(first["documentiRichiesti"]![0]!["nome"]!.ToString() == "Relazione", "Documenti preservati");
        int failures = 0;
        var retryBatch = await Service(request => {
            var input = request["messages"]![1]!["content"]!.GetValue<string>();
            if (input.StartsWith("[") && Interlocked.Increment(ref failures) == 1) return Reply("{", "length");
            return Respond(request);
        }).AnalizzaGaraAsync(context);
        Check(!retryBatch.Analysis.ContainsKey("error") && failures == 4, "Gruppo interrotto riprovato");
        var failed = await Service(request => request["messages"]![1]!["content"]!.ToString().StartsWith("[")
            ? Reply("{", "length") : Reply(metadata)).AnalizzaGaraAsync(context);
        Check(failed.Analysis.ContainsKey("error") && !failed.Analysis.ContainsKey("lotti"), "Nessuna analisi parziale dopo errore gruppo");
        var missing = await Service(request => request["messages"]![1]!["content"]!.ToString().StartsWith("[")
            ? Reply("{\"sezioni\":[]}") : Reply(metadata)).AnalizzaGaraAsync(context);
        Check(missing.Analysis["code"]?.ToString() == "AI_INVALID_JSON", "Gruppo senza numeri richiesti rifiutato");
        var indexOnly = JsonSerializer.SerializeToElement(new {
            testo = "Paragrafo 1 - Ambito [solo titolo nell'indice; contenuto non individuato]" });
        var empty = await Service(Respond).AnalizzaGaraAsync(indexOnly);
        Check(empty.Analysis["lotti"]![0]!["sezioni"]![0]!["sintesi"]!.ToString() == "",
            "Indice senza contenuto non riceve sintesi inventata");
        var duplicate = await Service(request => {
            var input = request["messages"]![1]!["content"]!.ToString();
            if (!input.StartsWith("[")) return Reply(metadata);
            var items = JsonNode.Parse(input)!.AsArray();
            return Reply(new JsonObject { ["sezioni"] = new JsonArray(items.Select(_ => (JsonNode)new JsonObject {
                ["numero"] = "1", ["sintesi"] = "Duplicato" }).ToArray()) }.ToJsonString());
        }).AnalizzaGaraAsync(context);
        Check(duplicate.Analysis["code"]?.ToString() == "AI_INVALID_JSON", "Numeri duplicati rifiutati");
        return checks;
    }
    sealed class Factory(Func<JsonObject, JsonObject> responder) : IHttpClientFactory {
        public HttpClient CreateClient(string name) => new(new Handler(responder));
    }
    sealed class Handler(Func<JsonObject, JsonObject> responder) : HttpMessageHandler {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
            var payload = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!.AsObject();
            return new(HttpStatusCode.OK) { Content = new StringContent(responder(payload).ToJsonString()) };
        }
    }
}
