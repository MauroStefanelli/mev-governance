using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;

namespace MevGovernanceBackend.Services;

// ============================================================
// Servizio AI del Configuratore Offerta TOW.
// Replica il comportamento del server locale (server.py):
// chiamate a OpenAI o Capgemini Generative AI EU, estrazione
// del testo di risposta, parsing JSON con fallback, e i due
// flussi Analyze (stima) e Development (verifica piano).
// Le chiavi API vivono SOLO nel backend (env), mai nel browser.
// ============================================================

public class AiService
{
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private static readonly string[] AllowedHosts =
    {
        "api.openai.com",
        "openai.generative-eu.engine.capgemini.com"
    };

    public AiService(IConfiguration config, IHttpClientFactory httpClientFactory)
    {
        _config = config;
        _httpClientFactory = httpClientFactory;
    }

    private string Env(string key, string fallback)
    {
        var v = _config[key];
        return string.IsNullOrWhiteSpace(v) ? fallback : v;
    }

    private AiSettings Settings(string? userApiKey = null, string? userEndpoint = null,
                                string? userModel = null, string? userStyle = null, string? userAuthMode = null)
    {
        var endpoint = !string.IsNullOrWhiteSpace(userEndpoint) ? userEndpoint : Env("AI_ENDPOINT", "https://api.openai.com/v1/chat/completions");
        var model    = !string.IsNullOrWhiteSpace(userModel)    ? userModel    : Env("AI_MODEL", "gpt-4o");
        var apiKey   = !string.IsNullOrWhiteSpace(userApiKey)   ? userApiKey   : Env("AI_API_KEY", "");
        var apiStyle = !string.IsNullOrWhiteSpace(userStyle)    ? userStyle    : Env("AI_API_STYLE", "chat");
        var authMode = !string.IsNullOrWhiteSpace(userAuthMode) ? userAuthMode : Env("AI_AUTH_MODE", "bearer");
        var provider = Env("AI_PROVIDER", "openai");
        return new AiSettings(endpoint, model, apiKey, apiStyle, authMode, provider);
    }

    private void ValidateEndpoint(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri))
            throw new InvalidOperationException("Endpoint AI non valido");
        if (uri.Scheme != "https" || !AllowedHosts.Contains(uri.Host, StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Endpoint non consentito: usa OpenAI ufficiale o Capgemini Generative AI EU");
    }

    private async Task<JsonObject> PostAsync(AiSettings s, JsonObject payload)
    {
        ValidateEndpoint(s.Endpoint);
        using var client = _httpClientFactory.CreateClient("ConfiguratoreAi");
        using var req = new HttpRequestMessage(HttpMethod.Post, s.Endpoint);
        if (s.AuthMode == "api-key")
            req.Headers.TryAddWithoutValidation("api-key", s.ApiKey);
        else
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", s.ApiKey);

        req.Content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        using var resp = await client.SendAsync(req, cts.Token);
        var bodyText = await resp.Content.ReadAsStringAsync(cts.Token);

        if (!resp.IsSuccessStatusCode)
        {
            string detail = null;
            try
            {
                using var doc = JsonDocument.Parse(bodyText);
                if (doc.RootElement.TryGetProperty("error", out var err) &&
                    err.TryGetProperty("message", out var msg))
                    detail = msg.GetString();
            }
            catch { }

            var service = s.Endpoint.Contains("capgemini") ? "Capgemini" : "OpenAI";
            throw new InvalidOperationException(detail ?? $"{service} ha risposto con errore {(int)resp.StatusCode}");
        }

        try
        {
            return JsonNode.Parse(bodyText)?.AsObject() ?? new JsonObject();
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException("La risposta del servizio AI non è JSON valido: " + ex.Message);
        }
    }

    private string ExtractResponseText(JsonObject response)
    {
        if (response.TryGetPropertyValue("choices", out var choices) && choices is JsonArray arr && arr.Count > 0)
        {
            var first = arr[0] as JsonObject;
            if (first != null)
            {
                if (first.TryGetPropertyValue("text", out var text) && text is JsonValue tv && text.GetValueKind() == JsonValueKind.String)
                {
                    var v = text.GetValue<string>();
                    if (!string.IsNullOrWhiteSpace(v)) return v;
                }

                if (first.TryGetPropertyValue("message", out var message) && message is JsonObject m)
                {
                    if (m.TryGetPropertyValue("content", out var content))
                    {
                        if (content.GetValueKind() == JsonValueKind.String)
                        {
                            var v = content.GetValue<string>();
                            if (!string.IsNullOrWhiteSpace(v)) return v;
                        }
                        else if (content is JsonArray parts)
                        {
                            var sb = new StringBuilder();
                            foreach (var part in parts)
                                if (part is JsonObject po && po.TryGetPropertyValue("text", out var t) && t.GetValueKind() == JsonValueKind.String)
                                    sb.Append(t.GetValue<string>());
                            if (sb.Length > 0) return sb.ToString();
                        }
                    }
                    foreach (var field in new[] { "reasoning_content", "text" })
                    {
                        if (m.TryGetPropertyValue(field, out var fv) && fv.GetValueKind() == JsonValueKind.String)
                        {
                            var v = fv.GetValue<string>();
                            if (!string.IsNullOrWhiteSpace(v)) return v;
                        }
                    }
                }
            }
        }

        if (response.TryGetPropertyValue("output_text", out var outputText) && outputText.GetValueKind() == JsonValueKind.String)
        {
            var v = outputText.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(v)) return v;
        }

        if (response.TryGetPropertyValue("output", out var output) && output is JsonArray outArr)
        {
            foreach (var item in outArr)
            {
                if (item is JsonObject io && io.TryGetPropertyValue("content", out var oc) && oc is JsonArray items)
                    foreach (var content in items)
                        if (content is JsonObject co && co.TryGetPropertyValue("type", out var type) &&
                            type.GetValueKind() == JsonValueKind.String && type.GetValue<string>() == "output_text" &&
                            co.TryGetPropertyValue("text", out var ot) && ot.GetValueKind() == JsonValueKind.String)
                        {
                            var v = ot.GetValue<string>();
                            if (!string.IsNullOrWhiteSpace(v)) return v;
                        }
            }
        }

        throw new InvalidOperationException("La risposta AI non contiene un risultato utilizzabile");
    }

    private JsonObject ParseAnalysisJson(string text)
    {
        var value = text.Trim();
        value = System.Text.RegularExpressions.Regex.Replace(value, @"^```(?:json)?\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        value = System.Text.RegularExpressions.Regex.Replace(value, @"\s*```$", "").Trim();
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException("Il servizio AI ha restituito una risposta vuota");

        try { return JsonNode.Parse(value)?.AsObject() ?? new JsonObject(); }
        catch (JsonException)
        {
            var start = value.IndexOf('{');
            var end = value.LastIndexOf('}');
            if (start >= 0 && end > start)
            {
                try { return JsonNode.Parse(value.Substring(start, end - start + 1))?.AsObject() ?? new JsonObject(); }
                catch (JsonException) { }
            }
            throw new InvalidOperationException("Il servizio AI ha restituito testo non convertibile in JSON. Riprova l'analisi");
        }
    }

    private JsonObject FallbackAnalysisFromText(string text, JsonObject context)
    {
        var value = System.Text.RegularExpressions.Regex.Replace(text ?? "", @"\s+", " ").Trim();
        var proposals = new JsonArray();
        var lowered = value.ToLowerInvariant();

        if (context.TryGetPropertyValue("catalog", out var catalog) && catalog is JsonArray catArr)
        {
            foreach (var item in catArr)
            {
                if (item is not JsonObject io) continue;
                var catalogId = io.GetStringProp("id") ?? "";
                var name = (io.GetStringProp("name") ?? "").Trim();
                var idMatch = !string.IsNullOrEmpty(catalogId) &&
                    System.Text.RegularExpressions.Regex.IsMatch(value,
                        @"(?:id|catalogo|voce)\s*[:#-]?\s*" + System.Text.RegularExpressions.Regex.Escape(catalogId) + @"\b",
                        System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                var nameMatch = name.Length >= 8 && lowered.Contains(name.ToLowerInvariant());
                if (!idMatch && !nameMatch) continue;

                var sentences = System.Text.RegularExpressions.Regex.Split(value, @"(?<=[.!?])\s+|\n+");
                var rationale = sentences.FirstOrDefault(s =>
                    (!string.IsNullOrEmpty(catalogId) && s.Contains(catalogId)) ||
                    (!string.IsNullOrEmpty(name) && s.ToLowerInvariant().Contains(name.ToLowerInvariant())))?.Trim() ??
                    "Voce individuata dall'analisi AI";

                proposals.Add(new JsonObject
                {
                    ["catalogId"] = catalogId,
                    ["action"] = "add",
                    ["type"] = "MODIFICA",
                    ["complexity"] = "Medio",
                    ["quantity"] = 1,
                    ["rationale"] = rationale.Length > 1200 ? rationale[..1200] : rationale,
                    ["additionalInfo"] = "Risposta Capgemini convertita automaticamente da testo libero",
                    ["confidence"] = 0.6
                });
            }
        }

        var warnings = new JsonArray { "La risposta del servizio non era JSON ed è stata convertita automaticamente; verificare quantità, tipo e complessità." };
        if (proposals.Count == 0)
            warnings.Add("Non sono stati riconosciuti ID di catalogo: il testo AI resta disponibile come sintesi.");

        return new JsonObject
        {
            ["summary"] = (value.Length > 4000 ? value[..4000] : value) is var s && string.IsNullOrWhiteSpace(s) ? "Il servizio AI ha restituito una risposta vuota." : s,
            ["proposals"] = proposals,
            ["warnings"] = warnings
        };
    }

    private JsonObject BuildPayload(AiSettings s, string endpointCheck, JsonNode input, bool structured)
    {
        JsonObject payload;
        if (s.ApiStyle == "chat_completions")
        {
            payload = new JsonObject
            {
                ["model"] = s.Model,
                ["messages"] = input is JsonArray arr ? arr.DeepClone() : new JsonArray { new JsonObject { ["role"] = "user", ["content"] = input?.ToJsonString() } }
            };
        }
        else
        {
            payload = new JsonObject
            {
                ["model"] = s.Model,
                ["input"] = input?.DeepClone(),
                ["store"] = false
            };
        }

        if (structured)
        {
            var schema = AnalysisSchema();
            if (s.ApiStyle == "chat_completions" && s.Endpoint.Contains("capgemini", StringComparison.OrdinalIgnoreCase))
            {
                var jsonInstruction = "\nRestituisci esclusivamente JSON valido, senza Markdown, con questa struttura: " + schema.ToJsonString();
                if (payload["messages"] is JsonArray msgs && msgs.Count > 0 && msgs[^1] is JsonObject last)
                    last["content"] = (last["content"]?.GetValue<string>() ?? "") + jsonInstruction;
            }
            else if (s.ApiStyle == "chat_completions")
            {
                payload["response_format"] = new JsonObject
                {
                    ["type"] = "json_schema",
                    ["json_schema"] = new JsonObject
                    {
                        ["name"] = "tow_catalog_analysis",
                        ["strict"] = true,
                        ["schema"] = schema
                    }
                };
            }
            else
            {
                payload["text"] = new JsonObject
                {
                    ["format"] = new JsonObject
                    {
                        ["type"] = "json_schema",
                        ["name"] = "tow_catalog_analysis",
                        ["strict"] = true,
                        ["schema"] = schema
                    }
                };
            }
        }

        return payload;
    }

    private static JsonObject AnalysisSchema()
    {
        var proposal = new JsonObject
        {
            ["type"] = "object",
            ["additionalProperties"] = false,
            ["required"] = new JsonArray { "catalogId", "action", "type", "complexity", "quantity", "rationale", "additionalInfo", "confidence" },
            ["properties"] = new JsonObject
            {
                ["catalogId"] = new JsonObject { ["type"] = "string" },
                ["action"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray { "add", "update", "confirm", "exclude" } },
                ["type"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray { "REALIZZAZIONE", "MODIFICA" } },
                ["complexity"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray { "Semplice", "Medio", "Complesso" } },
                ["quantity"] = new JsonObject { ["type"] = "number", ["minimum"] = 0 },
                ["rationale"] = new JsonObject { ["type"] = "string" },
                ["additionalInfo"] = new JsonObject { ["type"] = "string" },
                ["confidence"] = new JsonObject { ["type"] = "number", ["minimum"] = 0, ["maximum"] = 1 }
            }
        };

        return new JsonObject
        {
            ["type"] = "object",
            ["additionalProperties"] = false,
            ["required"] = new JsonArray { "summary", "proposals", "warnings" },
            ["properties"] = new JsonObject
            {
                ["summary"] = new JsonObject { ["type"] = "string" },
                ["proposals"] = new JsonObject { ["type"] = "array", ["items"] = proposal },
                ["warnings"] = new JsonObject { ["type"] = "array", ["items"] = new JsonObject { ["type"] = "string" } }
            }
        };
    }

    private const string AnalyzeInstructions =
        "Sei un responsabile tecnico di stima software. Analizza l'iniziativa usando esclusivamente gli ID del catalogo fornito. " +
        "Confronta requisiti, interventi Excel, contesto applicativo, stime storiche e suggerimenti correnti. " +
        "Se nel contesto è presente il campo 'sourceCode' con snippet di codice sorgente, usali per verificare " +
        "la coerenza tecnica delle proposte: verifica se le dipendenze tecnologiche, i pattern architetturali e " +
        "la complessità del codice confermano o contraddicono le stime proposte; segnala eventuali discrepanze nei warnings. " +
        "Proponi interventi necessari e sufficienti, senza inventare voci. " +
        "Usa action add/update/confirm/exclude. Quantità positiva per gli interventi inclusi. " +
        "Spiega ogni razionale in italiano e segnala in warnings le informazioni mancanti. La decisione finale spetta all'utente.";

    private const string DevelopmentInstructions =
        "Sei un responsabile tecnico software. Verifica un piano di sviluppo già stimato. " +
        "Raggruppa il lavoro per ID_INTERVENTO e, dentro ciascuno, valuta tutti gli ID Catalogo associati. " +
        "Per ogni coppia spiega perché è necessaria, attività tecniche, file candidati, rischi e test. " +
        "Non aggiungere ID Catalogo non presenti. " +
        "Restituisci esclusivamente JSON valido senza Markdown: {\"summary\":\"...\",\"recommendations\":[{\"interventionId\":\"...\",\"catalogId\":\"...\",\"reason\":\"...\",\"activities\":[\"...\"],\"files\":[\"...\"],\"risks\":[\"...\"],\"tests\":[\"...\"]}],\"warnings\":[\"...\"]}.";

    // ============================================================
    // POST /api/configuratore/ai/analyze
    // Valuta un'iniziativa e propone interventi dal catalogo.
    // ============================================================
    public async Task<(JsonObject Analysis, string Provider, string Model, JsonObject? Usage)> AnalyzeAsync(
        JsonElement context,
        string? userApiKey = null, string? userEndpoint = null,
        string? userModel = null, string? userStyle = null, string? userAuthMode = null)
    {
        var s = Settings(userApiKey, userEndpoint, userModel, userStyle, userAuthMode);
        var messages = new JsonArray
        {
            new JsonObject { ["role"] = "developer", ["content"] = AnalyzeInstructions },
            new JsonObject { ["role"] = "user", ["content"] = "Contesto da valutare:\n" + context.ToString() }
        };
        var payload = BuildPayload(s, s.Endpoint, messages, structured: true);
        var response = await PostAsync(s, payload);
        var responseText = ExtractResponseText(response);

        JsonObject analysis;
        try { analysis = ParseAnalysisJson(responseText); }
        catch (InvalidOperationException) { analysis = FallbackAnalysisFromText(responseText, context.ToJsonObject()); }

        return (
            analysis,
            s.Provider,
            response.GetStringProp("model") ?? s.Model,
            response.TryGetPropertyValue("usage", out var usage) ? usage as JsonObject : null
        );
    }

    // ============================================================
    // POST /api/configuratore/ai/development
    // Verifica un piano di sviluppo stimato (raccomandazioni).
    // ============================================================
    public async Task<(JsonObject Analysis, string Provider, string Model, JsonObject? Usage)> DevelopmentAsync(
        JsonElement context,
        string? userApiKey = null, string? userEndpoint = null,
        string? userModel = null, string? userStyle = null, string? userAuthMode = null)
    {
        var s = Settings(userApiKey, userEndpoint, userModel, userStyle, userAuthMode);
        var messages = new JsonArray
        {
            new JsonObject { ["role"] = "developer", ["content"] = DevelopmentInstructions },
            new JsonObject { ["role"] = "user", ["content"] = "Piano da analizzare:\n" + context.ToString() }
        };
        var payload = BuildPayload(s, s.Endpoint, messages, structured: false);
        var response = await PostAsync(s, payload);
        var responseText = ExtractResponseText(response);

        JsonObject analysis;
        try { analysis = ParseAnalysisJson(responseText); }
        catch (InvalidOperationException)
        {
            analysis = new JsonObject
            {
                ["summary"] = responseText.Length > 6000 ? responseText[..6000] : responseText,
                ["recommendations"] = new JsonArray(),
                ["warnings"] = new JsonArray { "La risposta AI è disponibile come sintesi ma non è stata applicata automaticamente." }
            };
        }

        return (
            analysis,
            s.Provider,
            response.GetStringProp("model") ?? s.Model,
            response.TryGetPropertyValue("usage", out var usage) ? usage as JsonObject : null
        );
    }

    // ============================================================
    // POST /api/configuratore/ai/test — verifica connessione
    // ============================================================
    public async Task<(bool Ok, string Model, string? Error)> TestAsync()
    {
        try
        {
            var s = Settings();
            var payload = new JsonObject { ["model"] = s.Model, ["input"] = "Rispondi soltanto con OK.", ["store"] = false };
            if (s.ApiStyle == "chat_completions")
                payload = new JsonObject
                {
                    ["model"] = s.Model,
                    ["messages"] = new JsonArray { new JsonObject { ["role"] = "user", ["content"] = "Rispondi soltanto con OK." } }
                };
            var response = await PostAsync(s, payload);
            return (true, response.GetStringProp("model") ?? s.Model, null);
        }
        catch (Exception ex)
        {
            return (false, "", ex.Message);
        }
    }

    private sealed record AiSettings(string Endpoint, string Model, string ApiKey, string ApiStyle, string AuthMode, string Provider);
}

internal static class JsonObjectExtensions
{
    public static string? GetStringProp(this JsonObject obj, string propertyName)
    {
        if (obj.TryGetPropertyValue(propertyName, out var value) && value != null && value.GetValueKind() != JsonValueKind.Null)
            return value.GetValue<string>();
        return null;
    }

    public static JsonObject ToJsonObject(this JsonElement element)
    {
        return JsonNode.Parse(element.ToString())?.AsObject() ?? new JsonObject();
    }
}