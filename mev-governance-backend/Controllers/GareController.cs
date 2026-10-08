using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MevGovernanceBackend.Services;
using MevGovernanceBackend.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;

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
            // Distribuisce il contesto tra i paragrafi, includendo il contenuto oltre l'indice.
            using (var s = file.OpenReadStream())
                fullText = GaraSectionContext.Extract(s);
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

        // Non salvare analisi parziali o risposte interrotte dal limite del modello.
        if (analysis.TryGetPropertyValue("error", out var aiError))
            return StatusCode(502, new {
                message = aiError?.ToString() ?? "Il servizio AI non ha completato l'analisi.",
                code = analysis["code"]?.ToString(),
                finishReason = analysis["finishReason"]?.ToString()
            });

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
                        ["pesoEffort"]  = row?.PesoEffort.HasValue == true ? JsonValue.Create(row.PesoEffort!.Value) : null,
                        ["acatalogo"]   = row?.ACatalogo == true ? JsonValue.Create(true) : null,
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

    // POST /api/gare/debug-tow-raw
    // Mostra coordinate (X,Y) di ogni parola nelle pagine che contengono codici TOW
    [HttpPost("debug-tow-raw")]
    public IActionResult DebugTowRaw()
    {
        if (!CanAccess()) return Forbid();
        var f = Request.Form.Files.GetFile("file");
        if (f == null) return BadRequest(new { message = "file mancante" });
        var result = ContractParserService.ExtractTowRawWords(f.OpenReadStream());
        return Ok(result);
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

    // POST /api/gare/parse-offerta-excel
    // Riceve un file Excel (protetto da password) e restituisce i dati strutturati
    // dei fogli "SCHEMA OFFERTA ECONOMICA" e "Schema Offerta Catalogo Lotto N"
    // Campi form: file (xlsx), password (opzionale), lot (query param, default 1)
    [HttpPost("parse-offerta-excel")]
    [RequestSizeLimit(25 * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 25 * 1024 * 1024)]
    public async Task<IActionResult> ParseOffertaExcel([FromQuery] int lot = 1)
    {
        if (!CanAccess()) return Forbid();
        if (lot <= 0) return BadRequest(new { message = "Lotto non valido." });
        if (!Request.HasFormContentType) return BadRequest(new { message = "Invia il file come multipart/form-data." });
        var form = await Request.ReadFormAsync(HttpContext.RequestAborted);
        var file = form.Files.GetFile("file");
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Nessun file ricevuto. Invia il file Excel come campo 'file'." });
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension is not ".xlsx" and not ".xls")
            return BadRequest(new { message = "Formato non supportato: carica un file .xlsx o .xls." });
        var password = form.TryGetValue("password", out var pwdVals) ? pwdVals.FirstOrDefault() : null;
        try
        {
            using var stream = file.OpenReadStream();
            var result = ContractParserService.ParseOffertaExcel(stream, lot, password);
            if (result.Error != null)
                return BadRequest(new { message = result.Error, fogliDisponibili = result.FogliDisponibili,
                    avvisi = result.Avvisi, diagnostica = result.Diagnostica });
            return Ok(new { ok = true, lotto = lot, data = result });
        }
        catch (Exception)
        {
            return StatusCode(500, new { message = "Impossibile leggere il file Excel. Verifica il formato e riprova." });
        }
    }

    // POST /api/gare/debug-catalog-raw    // Mostra le prime N parole del PDF catalogo con coordinate, per diagnosticare il parser
    [HttpPost("debug-catalog-raw")]
    public IActionResult DebugCatalogRaw([FromQuery] int lot = 1)
    {
        if (!CanAccess()) return Forbid();
        var file = Request.Form.Files.GetFile("file");
        if (file == null || file.Length == 0) return BadRequest("Carica un file PDF (campo 'file')");

        using var stream = file.OpenReadStream();
        using var doc = UglyToad.PdfPig.PdfDocument.Open(stream);

        var result = new System.Text.Json.Nodes.JsonArray();
        foreach (var page in doc.GetPages())
        {
            var w = page.Width;
            var pageObj = new System.Text.Json.Nodes.JsonObject
            {
                ["page"] = page.Number,
                ["width"] = w,
                ["height"] = page.Height,
            };
            var wordsArr = new System.Text.Json.Nodes.JsonArray();
            foreach (var wd in page.GetWords().Take(60))
            {
                wordsArr.Add(new System.Text.Json.Nodes.JsonObject
                {
                    ["text"] = wd.Text,
                    ["x"]    = Math.Round(wd.BoundingBox.Left, 1),
                    ["xPct"] = Math.Round(wd.BoundingBox.Left / w * 100, 1),
                    ["y"]    = Math.Round(wd.BoundingBox.Bottom, 1),
                });
            }
            pageObj["words"] = wordsArr;
            result.Add(pageObj);
            if (result.Count >= 3) break; // prime 3 pagine bastano
        }
        return Ok(result);
    }

    // ── POST /api/gare/importa-come-contratto ─────────────────────────────
    // Importa una gara (con capitolato, TOW e catalogo offerta) come nuovo contratto
    // nel Archivio Contrattuale, senza richiedere file fisici.
    // Body JSON: { garaId, contractId, contractName }
    [HttpPost("importa-come-contratto")]
    public async Task<IActionResult> ImportaComContratto([FromBody] ImportaGaraRequest req)
    {
        if (!CanAccess()) return Forbid();
        if (string.IsNullOrWhiteSpace(req.GaraId) || string.IsNullOrWhiteSpace(req.ContractId) || string.IsNullOrWhiteSpace(req.ContractName))
            return BadRequest(new { message = "garaId, contractId e contractName sono obbligatori." });
        if (!System.Text.RegularExpressions.Regex.IsMatch(req.ContractId, @"^[a-zA-Z0-9_\-]+$"))
            return BadRequest(new { message = "contractId deve contenere solo lettere, numeri, trattini e underscore." });

        // Ricava schema e connection string (stesso pattern di ConfiguratoreController)
        var rawSchema = (_config["DB_SCHEMA"] ?? "").Trim().ToLower();
        var sch = rawSchema.Length > 0 && System.Text.RegularExpressions.Regex.IsMatch(rawSchema, @"^[a-zA-Z0-9_]+$") ? rawSchema : "public";
        var cs = _config["DB_CONNECTION_STRING"] ?? _config["DATABASE_DIRECT_URL"] ?? _config["DATABASE_URL"] ?? "";
        if (string.IsNullOrWhiteSpace(cs))
            return StatusCode(500, new { message = "DB non configurato." });

        // 1. Carica il payload della gara dal DB
        string garaJson;
        try
        {
            await using var conn = new NpgsqlConnection(cs);
            await conn.OpenAsync();
            var rk = $"gara|{req.GaraId}";
            await using var cmd = new NpgsqlCommand(
                $@"SELECT ""payload""::text FROM ""{sch}"".""PC_DataRecords"" WHERE ""record_key"" = @rk LIMIT 1", conn);
            cmd.Parameters.AddWithValue("rk", rk);
            var raw = await cmd.ExecuteScalarAsync();
            if (raw == null) return NotFound(new { message = $"Gara '{req.GaraId}' non trovata." });
            garaJson = raw.ToString()!;
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura gara: " + ex.Message });
        }

        // 2. Deserializza e mappa i dati
        JsonObject gara;
        try { gara = JsonNode.Parse(garaJson)!.AsObject(); }
        catch { return StatusCode(500, new { message = "Payload gara non valido." }); }

        var capitolato = gara["capitolato"]?.AsObject();
        var lottiNode  = capitolato?["lotti"]?.AsArray() ?? new JsonArray();
        var offertaLottiNode = gara["offertaLotti"]?.AsObject();

        var createdAt = DateTime.UtcNow.ToString("o");
        var warnings  = new List<string>();
        var lottiCreati = new List<object>();

        // 3. Salva il record contratto header
        var contractPayload = new JsonObject
        {
            ["name"]      = req.ContractName,
            ["rulesFile"] = capitolato?["fileName"]?.GetValue<string>() ?? "",
            ["ente"]      = gara["ente"]?.GetValue<string>() ?? "",
            ["cig"]       = gara["cig"]?.GetValue<string>() ?? "",
            ["garaId"]    = req.GaraId,
            ["builtin"]   = false,
            ["createdAt"] = createdAt,
        };

        try
        {
            await UpsertRecord(cs, sch, $"{req.ContractId}|contract", "contract", req.ContractId, "", req.ContractName, contractPayload.ToJsonString());
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore creazione contratto: " + ex.Message });
        }

        // 4. Per ogni lotto, costruisci towPrices e catalog dai dati offerta
        for (int i = 0; i < lottiNode.Count && i < 6; i++)
        {
            var lotto     = lottiNode[i]?.AsObject();
            if (lotto == null) continue;
            var lottoNum  = i + 1;
            var lotId     = String(lottoNum);
            var lotNome   = lotto["nome"]?.GetValue<string>() ?? $"Lotto {lotId}";

            // towPrices: preferisce offerta Excel, fallback a tow dal capitolato (quantita×prezzoUnitario non disponibile → skip)
            var towPrices = new JsonObject();
            var offertaLotto = offertaLottiNode?[lotId]?.AsObject();
            var righeOfferta = offertaLotto?["offertaEconomica"]?["righe"]?.AsArray();
            if (righeOfferta != null)
            {
                foreach (var riga in righeOfferta)
                {
                    var codice = riga?["codice"]?.GetValue<string>();
                    var prezzoVal = riga?["prezzoUnitario"];
                    if (!string.IsNullOrWhiteSpace(codice) && prezzoVal != null)
                    {
                        double prezzo = 0;
                        try { prezzo = prezzoVal.GetValue<double>(); } catch { try { prezzo = double.Parse(prezzoVal.ToString()!); } catch { } }
                        if (prezzo > 0) towPrices[codice!] = prezzo;
                    }
                }
            }
            if (towPrices.Count == 0)
                warnings.Add($"Lotto {lotId}: nessun prezzo TOW dall'offerta Excel. Carica il listino manualmente.");

            // catalog: preferisce offerta catalogo, fallback alle voci catalogo del capitolato
            var catalogArray = new JsonArray();
            var offertaCatalogo = offertaLotto?["offertaCatalogo"]?.AsArray();
            if (offertaCatalogo != null && offertaCatalogo.Count > 0)
            {
                foreach (var voce in offertaCatalogo)
                {
                    if (voce == null) continue;
                    var entry = new JsonObject
                    {
                        ["id"]          = voce["id"]?.DeepClone(),
                        ["nome"]        = voce["nome"]?.DeepClone(),
                        ["ambito"]      = voce["ambito"]?.DeepClone(),
                        ["descrizione"] = voce["descrizione"]?.DeepClone() ?? "",
                        ["prezzi"] = new JsonObject
                        {
                            ["REALIZZAZIONE"] = new JsonObject
                            {
                                ["Semplice"]  = voce["prezziSemplice"]?.DeepClone(),
                                ["Medio"]     = voce["prezziMedio"]?.DeepClone(),
                                ["Complesso"] = voce["prezziComplesso"]?.DeepClone(),
                            },
                            ["MODIFICA"] = new JsonObject
                            {
                                ["Semplice"]  = voce["modSemplice"]?.DeepClone(),
                                ["Medio"]     = voce["modMedio"]?.DeepClone(),
                                ["Complesso"] = voce["modComplesso"]?.DeepClone(),
                            }
                        }
                    };
                    catalogArray.Add(entry);
                }
            }
            else
            {
                // Fallback: voci catalogo dal capitolato (struttura diversa ma usabile)
                var capCatalogo = lotto["catalogo"]?.AsArray();
                if (capCatalogo != null)
                {
                    foreach (var voce in capCatalogo)
                    {
                        if (voce == null) continue;
                        var entry = new JsonObject
                        {
                            ["id"]          = voce["id"]?.DeepClone(),
                            ["nome"]        = voce["nome"]?.DeepClone(),
                            ["ambito"]      = voce["ambito"]?.DeepClone(),
                            ["descrizione"] = voce["descrizione"]?.DeepClone() ?? "",
                            ["prezzi"] = new JsonObject
                            {
                                ["REALIZZAZIONE"] = new JsonObject
                                {
                                    ["Semplice"]  = voce["prezziSemplice"]?.DeepClone(),
                                    ["Medio"]     = voce["prezziMedio"]?.DeepClone(),
                                    ["Complesso"] = voce["prezziComplesso"]?.DeepClone(),
                                },
                                ["MODIFICA"] = new JsonObject
                                {
                                    ["Semplice"]  = voce["modSemplice"]?.DeepClone(),
                                    ["Medio"]     = voce["modMedio"]?.DeepClone(),
                                    ["Complesso"] = voce["modComplesso"]?.DeepClone(),
                                }
                            }
                        };
                        catalogArray.Add(entry);
                    }
                }
                if (catalogArray.Count == 0)
                    warnings.Add($"Lotto {lotId}: nessuna voce catalogo trovata. Carica il PDF catalogo manualmente.");
            }

            // tow5Share: cerca TOW con suffisso .5 e legge pesoEffort
            int tow5Share = 65;
            var towList = lotto["tow"]?.AsArray();
            if (towList != null)
            {
                foreach (var t in towList)
                {
                    var tid = t?["id"]?.GetValue<string>() ?? "";
                    if (tid.EndsWith(".5", StringComparison.OrdinalIgnoreCase))
                    {
                        var pe = t?["pesoEffort"];
                        if (pe != null) { try { tow5Share = (int)Math.Round(pe.GetValue<double>() * 100); } catch { } }
                        break;
                    }
                }
            }

            // towImpact: da pesoEffort dei TOW con peso
            var towImpact = new JsonObject();
            if (towList != null)
            {
                foreach (var t in towList)
                {
                    var tid  = t?["id"]?.GetValue<string>() ?? "";
                    var pe   = t?["pesoEffort"];
                    if (pe != null && !tid.EndsWith(".5", StringComparison.OrdinalIgnoreCase) && !tid.EndsWith(".6", StringComparison.OrdinalIgnoreCase))
                    {
                        try { towImpact[tid] = Math.Round(pe.GetValue<double>() * 100, 2); } catch { }
                    }
                }
            }

            var lotPayload = new JsonObject
            {
                ["name"]             = lotNome,
                ["catalogFile"]      = $"(importato da gara {req.GaraId})",
                ["priceFile"]        = $"(importato da gara {req.GaraId})",
                ["tow5Share"]        = tow5Share,
                ["active"]           = true,
                ["deleted"]          = false,
                ["codiceContratto"]  = "",
                ["garaId"]           = req.GaraId,
                ["garaLottoIndex"]   = i,
                ["importoBase"]      = lotto["importoBase"]?.DeepClone(),
                ["towPrices"]        = towPrices,
                ["towImpact"]        = towImpact,
                ["catalog"]          = catalogArray,
            };

            try
            {
                await UpsertRecord(cs, sch, $"{req.ContractId}|{lotId}|contract-lot", "contract_lot", req.ContractId, lotId, $"{req.ContractName} — {lotNome}", lotPayload.ToJsonString());
                lottiCreati.Add(new { lotId, nome = lotNome, towEntries = towPrices.Count, catalogEntries = catalogArray.Count });
            }
            catch (Exception ex)
            {
                warnings.Add($"Lotto {lotId}: errore salvataggio — {ex.Message}");
            }
        }

        return Ok(new
        {
            ok         = true,
            contractId = req.ContractId,
            lotti      = lottiCreati,
            warnings,
            message    = $"Contratto '{req.ContractName}' creato con {lottiCreati.Count} lott{(lottiCreati.Count == 1 ? "o" : "i")}."
        });
    }

    private static string String(int n) => n.ToString();

    private static async Task UpsertRecord(string cs, string sch, string recordKey, string entityType, string contractId, string lotId, string title, string payloadJson)
    {
        await using var conn = new NpgsqlConnection(cs);
        await conn.OpenAsync();
        var sql = $@"
            INSERT INTO ""{sch}"".""PC_DataRecords"" (""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload"")
            VALUES (@rk, @et, @cid, @lid, @title, @pl::jsonb)
            ON CONFLICT (""record_key"") DO UPDATE SET
                ""entity_type"" = EXCLUDED.""entity_type"",
                ""contract_id"" = EXCLUDED.""contract_id"",
                ""lot_id""      = EXCLUDED.""lot_id"",
                ""title""       = EXCLUDED.""title"",
                ""payload""     = EXCLUDED.""payload"",
                ""updated_at""  = now()";
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("rk",    recordKey);
        cmd.Parameters.AddWithValue("et",    entityType);
        cmd.Parameters.AddWithValue("cid",   contractId);
        cmd.Parameters.AddWithValue("lid",   lotId);
        cmd.Parameters.AddWithValue("title", title);
        cmd.Parameters.AddWithValue("pl",    payloadJson);
        await cmd.ExecuteNonQueryAsync();
    }
}

// ── DTO per importa-come-contratto ────────────────────────────────────────
public record ImportaGaraRequest(
    string GaraId,
    string ContractId,
    string ContractName
);
