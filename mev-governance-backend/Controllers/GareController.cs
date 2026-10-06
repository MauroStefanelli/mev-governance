using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MevGovernanceBackend.Services;
using MevGovernanceBackend.Data;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/gare")]
[Authorize]
public class GareController : ControllerBase
{
    private readonly AiService _ai;
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public GareController(AiService ai, AppDbContext db, IConfiguration config)
    {
        _ai = ai;
        _db = db;
        _config = config;
    }

    private bool CanAccess() =>
        User.IsInRole("SuperAdmin") || User.IsInRole("Bid Manager") ||
        User.IsInRole("Admin")      || User.IsInRole("Developer");

    private (string? key, string? endpoint, string? model, string? style, string? authMode) GetUserAiSettings()
    {
        var idClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(idClaim, out var userId)) return (null, null, null, null, null);
        var user = _db.Users.Find(userId);
        if (user == null) return (null, null, null, null, null);
        return (
            string.IsNullOrWhiteSpace(user.AiApiKey)   ? null : user.AiApiKey,
            string.IsNullOrWhiteSpace(user.AiEndpoint) ? null : user.AiEndpoint,
            string.IsNullOrWhiteSpace(user.AiModel)    ? null : user.AiModel,
            string.IsNullOrWhiteSpace(user.AiStyle)    ? null : user.AiStyle,
            string.IsNullOrWhiteSpace(user.AiAuthMode) ? null : user.AiAuthMode
        );
    }

    // POST /api/gare/analizza-capitolato
    // Campi form accettati:
    //   file            — PDF capitolato tecnico (obbligatorio)
    //   towFile_1       — PDF/XLSX listino prezzi TOW lotto 1 (opzionale)
    //   towFile_2       — PDF/XLSX listino prezzi TOW lotto 2 (opzionale)
    //   catalogFile_1   — PDF catalogo lotto 1 (opzionale)
    //   catalogFile_2   — PDF catalogo lotto 2 (opzionale)
    [HttpPost("analizza-capitolato")]
    public async Task<IActionResult> AnalizzaCapitolato()
    {
        if (!CanAccess()) return Forbid();

        var form = Request.Form;
        var file = form.Files.GetFile("file");
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Nessun file ricevuto. Invia il PDF come campo 'file'." });

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Sono accettati solo file PDF." });

        // 1) Estrai testo + righe TOW dal capitolato
        string fullText;
        List<TowRow> towRowsFromCapitolato;
        try
        {
            // Prima passata: testo per l'AI — 4000 char come Gestione Contratti (max_tokens=4096)
            using (var s = file.OpenReadStream())
                fullText = ContractParserService.ExtractRelevantPages(s, maxChars: 4000);
            // Seconda passata: estrazione geometrica righe TOW (id+descrizione+quantita)
            using (var s2 = file.OpenReadStream())
                towRowsFromCapitolato = ContractParserService.ExtractTowRows(s2);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura PDF: " + ex.Message });
        }

        if (string.IsNullOrWhiteSpace(fullText) || fullText.Length < 100)
            return BadRequest(new { message = "Il PDF non contiene testo leggibile o e' troppo corto." });

        // 2) Analisi AI — SOLO struttura (no proposte per stare dentro max_tokens)
        // Usa AnalizzaGaraAsync: stesso pattern di AnalyzeAsync con schema JSON incorporato nel messaggio
        var garaContext = System.Text.Json.JsonSerializer.SerializeToElement(new
        {
            fileName  = file.FileName,
            testo     = fullText
        });

        JsonObject analysis;
        string provider, usedModel;
        try
        {
            var (key, ep, mdl, sty, auth) = GetUserAiSettings();
            JsonObject? usage;
            (analysis, provider, usedModel, usage) = await _ai.AnalizzaGaraAsync(
                garaContext, key, ep, mdl, sty, auth);
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("API key") || msg.Contains("401") || msg.Contains("403") || msg.Contains("Unauthorized"))
                return StatusCode(401, new { message = "Chiave AI non configurata o non valida." });
            return StatusCode(500, new { message = "Errore analisi AI: " + msg });
        }

        // Detecta risposta AI non-JSON (es. Capgemini risponde in testo libero)
        if (analysis.TryGetPropertyValue("error", out _) && analysis.TryGetPropertyValue("rawText", out var rawNode))
        {
            var rawText = rawNode?.ToString() ?? "";
            var preview = rawText.Length > 500 ? rawText[..500] + "…" : rawText;
            return StatusCode(502, new
            {
                message = $"Il modello AI non ha restituito JSON valido. Risposta ricevuta: {preview}",
                rawText,
            });
        }

        // 3) Per ogni lotto: leggi towFile_N e catalogFile_N con i parser collaudati
        if (analysis.TryGetPropertyValue("lotti", out var lottiNode) && lottiNode is JsonArray lotti)
        {
            for (int i = 0; i < lotti.Count; i++)
            {
                if (lotti[i] is not JsonObject lotto) continue;
                var lotNum = i + 1;

                // ── TOW: merge descrizioni (dal capitolato) + importi (dal listino prezzi) ──
                var towFile = form.Files.GetFile($"towFile_{lotNum}");

                // Righe TOW del capitolato per questo lotto (filtra per prefisso numerico)
                var towCapitolato = towRowsFromCapitolato
                    .Where(r => {
                        var prefix = r.Id.Length >= 5 ? r.Id.Substring(3, 1) : "";
                        return prefix == lotNum.ToString() || r.Id.StartsWith($"TOW0{lotNum}.", StringComparison.OrdinalIgnoreCase);
                    })
                    .ToDictionary(r => r.Id.ToUpperInvariant(), r => r);

                Dictionary<string, double> towPrices = new();
                string towSource = "";
                string? towError = null;
                if (towFile != null && towFile.Length > 0)
                {
                    try
                    {
                        using var ts = towFile.OpenReadStream();
                        if (towFile.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase) ||
                            towFile.FileName.EndsWith(".xls",  StringComparison.OrdinalIgnoreCase))
                            towPrices = ContractParserService.ParseTowPriceExcel(ts, lotNum);
                        else
                            towPrices = ContractParserService.ParseTowPricePdf(ts, lotNum);
                        towSource = towFile.FileName;
                    }
                    catch (Exception ex) { towError = ex.Message; }
                }

                // Costruisci array tow finale: unione di tutte le chiavi
                var allTowKeys = towCapitolato.Keys
                    .Union(towPrices.Keys.Select(k => k.ToUpperInvariant()))
                    .Distinct()
                    .OrderBy(k => k);

                var towArr = new JsonArray();
                foreach (var key in allTowKeys)
                {
                    towCapitolato.TryGetValue(key, out var row);
                    towPrices.TryGetValue(key, out var price);
                    // Se non trovato in towPrices prova anche senza normalizzazione case
                    if (price == 0)
                        towPrices.TryGetValue(key.ToUpperInvariant(), out price);
                    var node = new JsonObject
                    {
                        ["id"]          = key,
                        ["descrizione"] = row?.Descrizione ?? "",
                        ["quantita"]    = row?.Quantita.HasValue == true ? JsonValue.Create(row.Quantita!.Value) : null,
                        ["importo"]     = price > 0 ? JsonValue.Create(price) : (row?.Importo.HasValue == true ? JsonValue.Create(row.Importo!.Value) : null),
                    };
                    towArr.Add(node);
                }
                if (towArr.Count > 0)
                {
                    lotto["tow"] = towArr;
                    if (!string.IsNullOrEmpty(towSource)) lotto["towSource"] = towSource;
                }
                lotto["_towCapitolatoCount"] = towCapitolato.Count;
                lotto["_towPricesCount"]     = towPrices.Count;
                if (towError != null) lotto["_towError"] = towError;

                // ── Catalogo ─────────────────────────────────────────────────
                var catalogFile = form.Files.GetFile($"catalogFile_{lotNum}");
                string? catalogError = null;
                int catalogCount = 0;
                if (catalogFile != null && catalogFile.Length > 0 &&
                    catalogFile.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        using var cs = catalogFile.OpenReadStream();
                        var entries = ContractParserService.ParseCatalogPdf(cs, lotNum);
                        catalogCount = entries.Count;
                        var catArr = new JsonArray();
                        foreach (var e in entries)
                            catArr.Add(new JsonObject
                            {
                                ["id"]               = e.Id,
                                ["ambito"]           = e.Ambito,
                                ["nome"]             = e.Nome,
                                ["descrizione"]      = e.Descrizione,
                                ["prezziSemplice"]   = e.Prezzi.Realizzazione.Semplice,
                                ["prezziMedio"]      = e.Prezzi.Realizzazione.Medio,
                                ["prezziComplesso"]  = e.Prezzi.Realizzazione.Complesso,
                                ["modSemplice"]      = e.Prezzi.Modifica.Semplice,
                                ["modMedio"]         = e.Prezzi.Modifica.Medio,
                                ["modComplesso"]     = e.Prezzi.Modifica.Complesso,
                            });
                        lotto["catalogo"]       = catArr;
                        lotto["catalogoSource"] = catalogFile.FileName;
                    }
                    catch (Exception ex) { catalogError = ex.Message; }
                }
                lotto["_catalogCount"] = catalogCount;
                if (catalogError != null) lotto["_catalogError"] = catalogError;
            }
        }

        return Ok(new
        {
            ok         = true,
            fileName   = file.FileName,
            textLength = fullText.Length,
            provider,
            model      = usedModel,
            analysis,
        });
    }

    // POST /api/gare/debug-tow?lot=2
    // Restituisce il raw output di ParseTowPricePdf e ExtractTowRows su un PDF
    [HttpPost("debug-tow")]
    public IActionResult DebugTow([FromQuery] int lot = 1)
    {
        if (!CanAccess()) return Forbid();
        var f = Request.Form.Files.GetFile("file");
        if (f == null) return BadRequest(new { message = "file mancante" });
        List<TowRow> rows;
        Dictionary<string, double> prices;
        using (var s1 = f.OpenReadStream()) rows   = ContractParserService.ExtractTowRows(s1);
        using (var s2 = f.OpenReadStream()) prices = ContractParserService.ParseTowPricePdf(s2, lot);
        return Ok(new { extractTowRows = rows, parseTowPricePdf = prices });
    }

    // POST /api/gare/debug-catalog?lot=1
    // Restituisce il raw output di ParseCatalogPdf su un PDF
    [HttpPost("debug-catalog")]
    public IActionResult DebugCatalog([FromQuery] int lot = 1)
    {
        if (!CanAccess()) return Forbid();
        var f = Request.Form.Files.GetFile("file");
        if (f == null) return BadRequest(new { message = "file mancante" });
        List<CatalogEntry> entries;
        using var s = f.OpenReadStream();
        entries = ContractParserService.ParseCatalogPdf(s, lot);
        return Ok(new { count = entries.Count, entries });
    }

    // POST /api/gare/analizza-proposte
    // Riceve un contesto JSON (titolo gara, lotto, requisiti) e restituisce proposte tecnica/economica/piano.
    // NON legge il PDF — usa i dati già estratti dall'analisi struttura. Stesso pattern di AnalyzeAsync.
    [HttpPost("analizza-proposte")]
    public async Task<IActionResult> AnalizzaProposte([FromBody] JsonElement context)
    {
        if (!CanAccess()) return Forbid();
        if (context.ValueKind != JsonValueKind.Object)
            return BadRequest(new { message = "Contesto non valido" });

        JsonObject analysis;
        string provider, usedModel;
        try
        {
            var (key, ep, mdl, sty, auth) = GetUserAiSettings();
            JsonObject? usage;
            (analysis, provider, usedModel, usage) = await _ai.AnalizzaProposteGaraAsync(
                context, key, ep, mdl, sty, auth);
        }
        catch (InvalidOperationException ex) when (ex.Message.StartsWith("AI_OUTPUT_TRUNCATED"))
        {
            return StatusCode(502, new { message = "La risposta AI è stata troncata (output troppo lungo). Riprova: il modello genererà una risposta più breve.", code = "AI_OUTPUT_TRUNCATED" });
        }
        catch (InvalidOperationException ex) when (ex.Message.StartsWith("AI_REFUSAL"))
        {
            return StatusCode(502, new { message = "Il modello AI ha rifiutato di rispondere. Riprova.", code = "AI_REFUSAL" });
        }
        catch (InvalidOperationException ex) when (ex.Message.StartsWith("AI_"))
        {
            return StatusCode(502, new { message = "Errore risposta AI: " + ex.Message, code = ex.Message });
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("API key") || msg.Contains("401") || msg.Contains("403"))
                return StatusCode(401, new { message = "Chiave AI non configurata o non valida." });
            return StatusCode(500, new { message = "Errore analisi AI: " + msg });
        }

        if (analysis.TryGetPropertyValue("error", out _) && analysis.TryGetPropertyValue("rawText", out var rawNode))
        {
            var rawText = rawNode?.ToString() ?? "";
            var preview = rawText.Length > 500 ? rawText[..500] + "…" : rawText;
            return StatusCode(502, new { message = $"AI non ha restituito JSON valido: {preview}", rawText });
        }

        return Ok(new { ok = true, proposte = analysis });
    }
}
