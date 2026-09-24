using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using System.Text.Json.Serialization;
using System.Data;
using System.Text.Json;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Services;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/configuratore")]
[Authorize]
public class ConfiguratoreController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public ConfiguratoreController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    // ============================================================
    // ACCESSO: solo SuperAdmin e Developer
    // ============================================================
    private bool CanAccess()
    {
        return User.IsInRole("SuperAdmin") || User.IsInRole("Developer");
    }

    private static readonly string[] ValidEntities =
    {
        "initiative_evaluation", "release_calendar", "implementation_plan",
        "code_change_request", "implementation_report", "tow_percentages",
        "technical_analysis", "application", "contract", "contract_lot",
        "setting", "other"
    };

    private (string Schema, string ConStr) GetDbTarget()
    {
        var rawSchema = (_config["DB_SCHEMA"] ?? "").Trim().ToLower();
        var sch = rawSchema.Length > 0 && System.Text.RegularExpressions.Regex.IsMatch(rawSchema, @"^[a-zA-Z0-9_]+$")
            ? rawSchema : "dev";
        // Se DB_CONNECTION_STRING manca, prova le variabili che Render/Supabase espongono.
        var cs = _config["DB_CONNECTION_STRING"] ?? "";
        if (string.IsNullOrWhiteSpace(cs))
            cs = _config["DATABASE_DIRECT_URL"] ?? _config["DATABASE_URL"] ?? "";
        // La connessione recovery NON deve far esplodere il 500: se manca, deleghiamo
        // la connessione a GetAllRecordsInternal che proverà anche gli schemi alternativi.
        return (sch, cs);
    }

    // ============================================================
    // GET /api/configuratore/contracts
    // Restituisce tutti i contratti con i relativi lotti, assemblati
    // da record entity_type 'contract' (contratto) e 'contract_lot' (lotto).
    // ============================================================
    [HttpGet("contracts")]
    public async Task<IActionResult> GetContracts()
    {
        if (!CanAccess()) return Forbid();

        try
        {
            var contracts = await GetAllContractsInternal();
            return Ok(contracts);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura contratti", error = ex.Message });
        }
    }

    // ============================================================
    // GET /api/configuratore/contracts/{contractId}
    // ============================================================
    [HttpGet("contracts/{contractId}")]
    public async Task<IActionResult> GetContract(string contractId)
    {
        if (!CanAccess()) return Forbid();
        var contracts = await GetAllContractsInternal();
        var found = contracts.FirstOrDefault(c =>
            (c.GetValueOrDefault("contractId") as string) == contractId);
        return found != null ? Ok(found) : NotFound(new { message = "Contratto non trovato" });
    }

    // ============================================================
    // POST /api/configuratore/contracts — upsert contratto (con lotti opzionali)
    // Body: { contractId, name, rulesFile?, builtin?, createdAt?,
    //         lots?: [ { lotId, name?, catalogFile?, priceFile?, tow5Share?, active?, codiceContratto? } ] }
    // ============================================================
    [HttpPost("contracts")]
    public async Task<IActionResult> UpsertContract([FromBody] ContractRequest req)
    {
        if (!CanAccess()) return Forbid();
        if (string.IsNullOrWhiteSpace(req.ContractId))
            return BadRequest("contractId è obbligatorio");
        if (!System.Text.RegularExpressions.Regex.IsMatch(req.ContractId, @"^[a-zA-Z0-9_\-]+$"))
            return BadRequest("contractId non valido (solo lettere, numeri, _ e -)");

        var (sch, cs) = GetDbTarget();

        // 1. Upsert contratto
        var sqlContract = $@"
            INSERT INTO ""{sch}"".""PC_DataRecords"" (""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload"")
            VALUES (@rk, 'contract', @cid, '', @title, @pl::jsonb)
            ON CONFLICT (""record_key"") DO UPDATE SET
                ""title""   = EXCLUDED.""title"",
                ""payload"" = EXCLUDED.""payload"",
                ""updated_at"" = now()";

        var contractPayload = new Dictionary<string, object?>
        {
            ["name"] = req.Name ?? req.ContractId,
            ["rulesFile"] = req.RulesFile ?? "",
            ["builtin"] = req.Builtin ?? false,
            ["createdAt"] = req.CreatedAt ?? DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
        };

        try
        {
            await ExecuteAsync(cs, sqlContract, new List<NpgsqlParameter>
            {
                new("rk", $"{req.ContractId}|contract"),
                new("cid", req.ContractId),
                new("title", req.Name ?? req.ContractId),
                new("pl", JsonSerializer.Serialize(contractPayload)),
            });

            // 2. Upsert lotti (se forniti)
            if (req.Lots != null && req.Lots.Count > 0)
            {
                foreach (var lot in req.Lots)
                {
                    if (string.IsNullOrEmpty(lot.LotId)) continue;
                    var lotPayload = new Dictionary<string, object?>
                    {
                        ["name"] = lot.Name ?? $"Lotto {lot.LotId}",
                        ["catalogFile"] = lot.CatalogFile ?? "",
                        ["priceFile"] = lot.PriceFile ?? "",
                        ["tow5Share"] = lot.Tow5Share ?? 65,
                        ["active"] = lot.Active ?? true,
                        ["codiceContratto"] = lot.CodiceContratto ?? "",
                    };
                    var sqlLot = $@"
                        INSERT INTO ""{sch}"".""PC_DataRecords"" (""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload"")
                        VALUES (@rk, 'contract_lot', @cid, @lid, @title, @pl::jsonb)
                        ON CONFLICT (""record_key"") DO UPDATE SET
                            ""title""   = EXCLUDED.""title"",
                            ""payload"" = EXCLUDED.""payload"",
                            ""updated_at"" = now()";
                    await ExecuteAsync(cs, sqlLot, new List<NpgsqlParameter>
                    {
                        new("rk", $"{req.ContractId}|{lot.LotId}|contract-lot"),
                        new("cid", req.ContractId),
                        new("lid", lot.LotId),
                        new("title", lot.Name ?? $"Lotto {lot.LotId}"),
                    new("pl",    JsonSerializer.Serialize(lotPayload)),
                    });
                }
            }

            return Ok(new { message = "Contratto salvato", contractId = req.ContractId });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore salvataggio contratto", error = ex.Message });
        }
    }

    // ============================================================
    // POST /api/configuratore/contracts/import  — multipart/form-data
    // Crea un contratto parsando i PDF/Excel caricati per ogni lotto.
    // Form fields:
    //   contractId  (string)
    //   name        (string)
    //   rulesFile   (file, opzionale — PDF capitolato)
    //   lotsJson    (JSON string) — array di { lotId, name, tow5Share }
    //   catalogFile_{lotId}  (file PDF)
    //   priceFile_{lotId}    (file XLSX o PDF)
    // ============================================================
    [HttpPost("contracts/import")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(50 * 1024 * 1024)] // 50 MB max
    public async Task<IActionResult> ImportContract([FromForm] IFormCollection form)
    {
        if (!CanAccess()) return Forbid();

        var contractId = form["contractId"].ToString().Trim();
        var name       = form["name"].ToString().Trim();
        if (string.IsNullOrEmpty(contractId) || string.IsNullOrEmpty(name))
            return BadRequest("contractId e name sono obbligatori");
        if (!System.Text.RegularExpressions.Regex.IsMatch(contractId, @"^[a-zA-Z0-9_\-]+$"))
            return BadRequest("contractId non valido");

        // Leggi metadati lotti dal JSON inviato dal frontend
        var lotsJson = form["lotsJson"].ToString();
        List<ImportLotMeta> lotMetas;
        try
        {
            lotMetas = JsonSerializer.Deserialize<List<ImportLotMeta>>(lotsJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new List<ImportLotMeta>();
        }
        catch
        {
            return BadRequest("lotsJson non valido");
        }

        var (sch, cs) = GetDbTarget();

        // ── 1. Salva contratto (header) ──
        var rulesFileName = "";
        var rfFile = form.Files.GetFile("rulesFile");
        if (rfFile != null)
            rulesFileName = rfFile.FileName;

        var contractPayload = new Dictionary<string, object?>
        {
            ["name"]      = name,
            ["rulesFile"] = rulesFileName,
            ["builtin"]   = false,
            ["createdAt"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
        };

        var sqlContract = $@"
            INSERT INTO ""{sch}"".""PC_DataRecords"" (""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload"")
            VALUES (@rk, 'contract', @cid, '', @title, @pl::jsonb)
            ON CONFLICT (""record_key"") DO UPDATE SET
                ""title""      = EXCLUDED.""title"",
                ""payload""    = EXCLUDED.""payload"",
                ""updated_at"" = now()";

        try
        {
            await ExecuteAsync(cs, sqlContract, new List<NpgsqlParameter>
            {
                new("rk",    $"{contractId}|contract"),
                new("cid",   contractId),
                new("title", name),
                new("pl",    JsonSerializer.Serialize(contractPayload)),
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore salvataggio contratto", error = ex.Message });
        }

        // ── 2. Per ogni lotto: parsa PDF catalogo + listino TOW ──
        var lotResults = new List<object>();
        var errors     = new List<string>();

        foreach (var meta in lotMetas)
        {
            var lotId = meta.LotId?.Trim();
            if (string.IsNullOrEmpty(lotId)) continue;

            if (!int.TryParse(lotId, out var lotNum))
            {
                errors.Add($"Lotto {lotId}: lotId deve essere numerico");
                continue;
            }

            var catalogFile = form.Files.GetFile($"catalogFile_{lotId}");
            var priceFile   = form.Files.GetFile($"priceFile_{lotId}");

            if (priceFile == null)
            {
                errors.Add($"Lotto {lotId}: file listino TOW mancante");
                continue;
            }

            List<CatalogEntry> catalog = new();
            Dictionary<string, double> towPrices;

            // Il catalogo PDF è opzionale — può essere caricato in un secondo momento
            if (catalogFile != null)
            {
                try
                {
                    await using var catStream = catalogFile.OpenReadStream();
                    catalog = ContractParserService.ParseCatalogPdf(catStream, lotNum);
                    if (catalog.Count == 0)
                        errors.Add($"Lotto {lotId}: nessuna voce riconosciuta nel catalogo PDF");
                }
                catch (Exception ex)
                {
                    errors.Add($"Lotto {lotId} catalogo: {ex.Message}");
                }
            }

            try
            {
                await using var priceStream = priceFile.OpenReadStream();
                var isExcel = priceFile.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase);
                towPrices = isExcel
                    ? ContractParserService.ParseTowPriceExcel(priceStream, lotNum)
                    : ContractParserService.ParseTowPricePdf(priceStream, lotNum);
            }
            catch (Exception ex)
            {
                errors.Add($"Lotto {lotId} listino: {ex.Message}");
                towPrices = new Dictionary<string, double>();
            }

            var lotPayload = new Dictionary<string, object?>
            {
                ["name"]        = meta.Name ?? $"Lotto {lotId}",
                ["catalogFile"] = catalogFile?.FileName ?? "",
                ["priceFile"]   = priceFile.FileName,
                ["tow5Share"]   = meta.Tow5Share ?? 65,
                ["active"]      = true,
                ["codiceContratto"] = "",
                ["catalog"]     = catalog,
                ["towPrices"]   = towPrices,
            };

            var sqlLot = $@"
                INSERT INTO ""{sch}"".""PC_DataRecords"" (""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload"")
                VALUES (@rk, 'contract_lot', @cid, @lid, @title, @pl::jsonb)
                ON CONFLICT (""record_key"") DO UPDATE SET
                    ""title""      = EXCLUDED.""title"",
                    ""payload""    = EXCLUDED.""payload"",
                    ""updated_at"" = now()";

            try
            {
                await ExecuteAsync(cs, sqlLot, new List<NpgsqlParameter>
                {
                    new("rk",    $"{contractId}|{lotId}|contract-lot"),
                    new("cid",   contractId),
                    new("lid",   lotId),
                    new("title", meta.Name ?? $"Lotto {lotId}"),
                    new("pl",    JsonSerializer.Serialize(lotPayload)),
                });
                lotResults.Add(new { lotId, catalogEntries = catalog.Count, towEntries = towPrices.Count });
            }
            catch (Exception ex)
            {
                errors.Add($"Lotto {lotId} salvataggio DB: {ex.Message}");
            }
        }

        return Ok(new
        {
            message    = errors.Count == 0 ? "Contratto importato con successo" : "Importazione completata con avvisi",
            contractId,
            lots       = lotResults,
            warnings   = errors,
        });
    }

    // ============================================================
    // PUT /api/configuratore/contracts/{contractId}/lots/{lotId}
    // Body: { name?, catalogFile?, priceFile?, tow5Share?, active?, codiceContratto? }
    // (updates parziali del lotto; la richiesta principale è il Codice Contratto)
    // ============================================================
    [HttpPut("contracts/{contractId}/lots/{lotId}")]
    public async Task<IActionResult> UpdateLot(string contractId, string lotId, [FromBody] LotPatchRequest req)
    {
        if (!CanAccess()) return Forbid();
        if (string.IsNullOrWhiteSpace(contractId) || string.IsNullOrWhiteSpace(lotId))
            return BadRequest("contractId e lotId obbligatori");

        var (sch, cs) = GetDbTarget();
        var existingSql = $@"SELECT ""payload""::text AS ""payload"" FROM ""{sch}"".""PC_DataRecords"" WHERE ""record_key"" = @rk";
        var rk = $"{contractId}|{lotId}|contract-lot";

        try
        {
            var rows = await QueryAsync(cs, existingSql, new List<NpgsqlParameter> { new("rk", rk) }, sch);
            // QueryAsync deserializza il payload come JsonElement; lo convertiamo in Dictionary
            Dictionary<string, object?> payload;
            if (rows.Count > 0 && rows[0].GetValueOrDefault("payload") is System.Text.Json.JsonElement je)
                payload = JsonElementToDict(je);
            else if (rows.Count > 0 && rows[0].GetValueOrDefault("payload") is Dictionary<string, object?> d)
                payload = d;
            else
                payload = new Dictionary<string, object?> { ["name"] = $"Lotto {lotId}" };

            if (req.Name != null) payload["name"] = req.Name;
            if (req.CatalogFile != null) payload["catalogFile"] = req.CatalogFile;
            if (req.PriceFile != null) payload["priceFile"] = req.PriceFile;
            if (req.Tow5Share != null) payload["tow5Share"] = req.Tow5Share;
            if (req.Active != null) payload["active"] = req.Active;
            if (req.Deleted != null) payload["deleted"] = req.Deleted;
            if (req.CodiceContratto != null) payload["codiceContratto"] = req.CodiceContratto;

            var sql = $@"
                INSERT INTO ""{sch}"".""PC_DataRecords"" (""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload"")
                VALUES (@rk, 'contract_lot', @cid, @lid, @title, @pl::jsonb)
                ON CONFLICT (""record_key"") DO UPDATE SET
                    ""title""   = EXCLUDED.""title"",
                    ""payload"" = EXCLUDED.""payload"",
                    ""updated_at"" = now()";

            await ExecuteAsync(cs, sql, new List<NpgsqlParameter>
            {
                new("rk", rk),
                new("cid", contractId),
                new("lid", lotId),
                new("title", (payload.GetValueOrDefault("name") as string) ?? $"Lotto {lotId}"),
                new("pl", JsonSerializer.Serialize(payload)),
            });

            return Ok(new { message = "Lotto aggiornato", contractId, lotId, payload });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore aggiornamento lotto", error = ex.Message });
        }
    }

    // ============================================================
    // DELETE /api/configuratore/contracts/{contractId} — elimina contratto e lotti
    // ============================================================
    [HttpDelete("contracts/{contractId}")]
    public async Task<IActionResult> DeleteContract(string contractId)
    {
        if (!CanAccess()) return Forbid();
        if (string.IsNullOrWhiteSpace(contractId))
            return BadRequest("contractId obbligatorio");

        var (sch, cs) = GetDbTarget();
        var sql = $@"DELETE FROM ""{sch}"".""PC_DataRecords""
            WHERE (""record_key"" = @rkm OR ""record_key"" LIKE @rkp)";

        try
        {
            await ExecuteAsync(cs, sql, new List<NpgsqlParameter>
            {
                new("rkm", $"{contractId}|contract"),
                new("rkp", $"{contractId}|%|contract-lot"),
            });
            return Ok(new { message = "Contratto eliminato", contractId });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore eliminazione contratto", error = ex.Message });
        }
    }

    // ============================================================
    // POST /api/configuratore/contracts/seed-builtin
    // Inserisce/aggiorna il contratto builtin poste-tet-2025 con
    // catalogo e prezzi TOW reali letti dal bundle dell'app standalone.
    // Idempotente: usa ON CONFLICT DO UPDATE.
    // ============================================================
    [HttpPost("contracts/seed-builtin")]
    public async Task<IActionResult> SeedBuiltin([FromBody] SeedBuiltinRequest req)
    {
        if (!CanAccess()) return Forbid();

        const string contractId = "poste-tet-2025";
        var (sch, cs) = GetDbTarget();

        try
        {
            // 1. Upsert contratto
            var contractPayload = new Dictionary<string, object?>
            {
                ["name"]      = "Poste Italiane \u2013 Tracciatura e Logistica Integrata",
                ["rulesFile"] = "02_Gara_TeT_Capitolato Tecnico_Tracciatura e Logistica_All.1.1.pdf",
                ["builtin"]   = true,
                ["createdAt"] = "2025-01-01T00:00:00Z",
            };
            var sqlC = $@"INSERT INTO ""{sch}"".""PC_DataRecords"" (""record_key"",""entity_type"",""contract_id"",""lot_id"",""title"",""payload"")
                VALUES (@rk,'contract',@cid,'',@title,@pl::jsonb)
                ON CONFLICT (""record_key"") DO UPDATE SET ""title""=EXCLUDED.""title"",""payload""=EXCLUDED.""payload"",""updated_at""=now()";
            await ExecuteAsync(cs, sqlC, new List<NpgsqlParameter>
            {
                new("rk",    $"{contractId}|contract"),
                new("cid",   contractId),
                new("title", "Poste Italiane \u2013 Tracciatura e Logistica Integrata"),
                new("pl",    JsonSerializer.Serialize(contractPayload)),
            });

            // 2. Lotti — i dati catalog/towPrices vengono dal body
            var lots = req.Lots ?? new List<BuiltinLotData>();
            foreach (var lot in lots)
            {
                if (string.IsNullOrEmpty(lot.LotId)) continue;

                // Usa GetRawText() per preservare catalog e towPrices esattamente come arrivano
                var catalogRaw  = lot.Catalog.HasValue  && lot.Catalog.Value.ValueKind  != System.Text.Json.JsonValueKind.Null
                    ? lot.Catalog.Value.GetRawText()  : "[]";
                var towRaw      = lot.TowPrices.HasValue && lot.TowPrices.Value.ValueKind != System.Text.Json.JsonValueKind.Null
                    ? lot.TowPrices.Value.GetRawText() : "{}";

                // Costruiamo il payload JSON manualmente per includere i raw values
                var lotPayloadJson = $@"{{
                    ""name"":""{lot.Name?.Replace("\"","\\\"")}"",
                    ""catalogFile"":""{(lot.CatalogFile ?? "").Replace("\"","\\\"")}"",
                    ""priceFile"":""{(lot.PriceFile ?? "").Replace("\"","\\\"")}"",
                    ""tow5Share"":{lot.Tow5Share ?? 65},
                    ""active"":true,
                    ""deleted"":false,
                    ""builtin"":true,
                    ""codiceContratto"":""{(lot.CodiceContratto ?? "").Replace("\"","\\\"")}"",
                    ""catalog"":{catalogRaw},
                    ""towPrices"":{towRaw}
                }}";
                var sqlL = $@"INSERT INTO ""{sch}"".""PC_DataRecords"" (""record_key"",""entity_type"",""contract_id"",""lot_id"",""title"",""payload"")
                    VALUES (@rk,'contract_lot',@cid,@lid,@title,@pl::jsonb)
                    ON CONFLICT (""record_key"") DO UPDATE SET ""title""=EXCLUDED.""title"",""payload""=EXCLUDED.""payload"",""updated_at""=now()";
                await ExecuteAsync(cs, sqlL, new List<NpgsqlParameter>
                {
                    new("rk",    $"{contractId}|{lot.LotId}|contract-lot"),
                    new("cid",   contractId),
                    new("lid",   lot.LotId),
                    new("title", lot.Name ?? $"Lotto {lot.LotId}"),
                    new("pl",    lotPayloadJson),
                });
            }

            return Ok(new { message = "Seed builtin completato", contractId, lots = lots.Count });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore seed builtin", error = ex.Message });
        }
    }

    // ============================================================
    // GET /api/configuratore/records?entity_type=&contract_id=&lot_id=&q=
    // ============================================================
    [HttpGet("records")]
    public async Task<IActionResult> GetRecords([FromQuery] string? entity_type, [FromQuery] string? contract_id, [FromQuery] string? lot_id, [FromQuery] string? q)
    {

        var (sch, cs) = GetDbTarget();
        var sql = $@"SELECT id AS ""Id"", ""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload""::text AS ""payload"", ""created_at"", ""updated_at"" FROM ""{sch}"".""PC_DataRecords"" WHERE 1 = 1";
        var ps = new List<NpgsqlParameter>();

        if (!string.IsNullOrWhiteSpace(entity_type))
        {
            sql += " AND \"entity_type\" = @et";
            ps.Add(new NpgsqlParameter("et", entity_type));
        }
        if (!string.IsNullOrWhiteSpace(contract_id))
        {
            sql += " AND \"contract_id\" = @cid";
            ps.Add(new NpgsqlParameter("cid", contract_id));
        }
        if (!string.IsNullOrWhiteSpace(lot_id))
        {
            sql += " AND \"lot_id\" = @lid";
            ps.Add(new NpgsqlParameter("lid", lot_id));
        }
        if (!string.IsNullOrWhiteSpace(q))
        {
            sql += " AND (\"title\" ILIKE @q OR \"record_key\" ILIKE @q)";
            ps.Add(new NpgsqlParameter("q", $"%{q}%"));
        }
        sql += " ORDER BY \"updated_at\" DESC LIMIT 500";

        try
        {
            var list = await QueryAsync(cs, sql, ps, sch);
            return Ok(list);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura records", error = ex.Message });
        }
    }

    // ============================================================
    // POST /api/configuratore/records — upsert per record_key
    // Body: { record_key, entity_type, contract_id, lot_id, title, payload }
    // ============================================================
    [HttpPost("records")]
    public async Task<IActionResult> UpsertRecord([FromBody] PcRecordRequest req)
    {
        if (!CanAccess()) return Forbid();
        if (string.IsNullOrWhiteSpace(req.RecordKey) || string.IsNullOrWhiteSpace(req.EntityType))
            return BadRequest("record_key e entity_type sono obbligatori");
        if (!ValidEntities.Contains(req.EntityType))
            return BadRequest($"entity_type non valido. Valori accettati: {string.Join(", ", ValidEntities)}");

        var (sch, cs) = GetDbTarget();
        // Serializza il payload preservando la struttura JSON originale
        string payloadJson;
        if (req.Payload.HasValue && req.Payload.Value.ValueKind != JsonValueKind.Null && req.Payload.Value.ValueKind != JsonValueKind.Undefined)
            payloadJson = req.Payload.Value.GetRawText();
        else
            payloadJson = "{}";

        var sql = $@"
            INSERT INTO ""{sch}"".""PC_DataRecords"" (""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload"")
            VALUES (@rk, @et, @cid, @lid, @title, @pl::jsonb)
            ON CONFLICT (""record_key"") DO UPDATE SET
                ""entity_type"" = EXCLUDED.""entity_type"",
                ""contract_id"" = EXCLUDED.""contract_id"",
                ""lot_id""      = EXCLUDED.""lot_id"",
                ""title""       = EXCLUDED.""title"",
                ""payload""     = EXCLUDED.""payload"",
                ""updated_at""  = now()
            RETURNING id AS ""Id"", ""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload""::text AS ""payload"", ""created_at"", ""updated_at""";

        try
        {
            var list = await QueryAsync(cs, sql, new List<NpgsqlParameter>
            {
                new("rk", req.RecordKey),
                new("et", req.EntityType),
                new("cid", req.ContractId ?? ""),
                new("lid", req.LotId ?? ""),
                new("title", req.Title ?? ""),
                new("pl", payloadJson),
            }, sch);
            return Ok(list.Count > 0 ? list[0] : new { message = "salvato" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore salvataggio record", error = ex.Message });
        }
    }

    // ============================================================
    // DELETE /api/configuratore/records/{id}
    // ============================================================
    [HttpDelete("records/{id}")]
    public async Task<IActionResult> DeleteRecord(string id)
    {
        if (!CanAccess()) return Forbid();
        if (!Guid.TryParse(id, out var gid))
            return BadRequest("Id non valido");

        var (sch, cs) = GetDbTarget();
        var sql = $@"DELETE FROM ""{sch}"".""PC_DataRecords"" WHERE id = @id::uuid";

        try
        {
            await using var conn = new NpgsqlConnection(cs);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("id", gid);
            var affected = await cmd.ExecuteNonQueryAsync();
            return Ok(new { deleted = affected > 0 });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore eliminazione record", error = ex.Message });
        }
    }

    // ============================================================
    // Helper query generica
    // ============================================================
    private async Task<List<Dictionary<string, object?>>> QueryAsync(string cs, string sql, List<NpgsqlParameter> ps, string schema)
    {
        var result = new List<Dictionary<string, object?>>();
        await using var conn = new NpgsqlConnection(cs);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var p in ps) cmd.Parameters.Add(p);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object?>();
            for (int i = 0; i < reader.FieldCount; i++)
            {
                var name = reader.GetName(i);
                var value = reader.IsDBNull(i) ? null : reader.GetValue(i);

                // payload è restituito come TEXT json → lo deserializziamo come oggetto
                if (name == "payload" && value is string s && !string.IsNullOrWhiteSpace(s))
                {
                    try { row[name] = JsonSerializer.Deserialize<object>(s); }
                    catch { row[name] = s; }
                }
                else if (value is DateTime dt)
                {
                    row[name] = dt.ToString("yyyy-MM-ddTHH:mm:ssZ");
                }
                else
                {
                    row[name] = value;
                }
            }
            result.Add(row);
        }
        return result;
    }

    // ============================================================
    // Helper: assembla i contratti (riusato da GET contracts e GET contracts/{id})
    // ============================================================
    private async Task<List<Dictionary<string, object?>>> GetAllContractsInternal()
    {
        var (sch, cs) = GetDbTarget();
        var sql = $@"SELECT id AS ""Id"", ""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload""::text AS ""payload"", ""created_at"", ""updated_at""
            FROM ""{sch}"".""PC_DataRecords""
            WHERE ""entity_type"" IN ('contract', 'contract_lot')
            ORDER BY ""contract_id"", ""lot_id""";

        var rows = await QueryAsync(cs, sql, new List<NpgsqlParameter>(), sch);
        var contracts = new List<Dictionary<string, object?>>();
        var byContract = new Dictionary<string, Dictionary<string, object?>>();

        foreach (var r in rows)
        {
            var cid = (r.GetValueOrDefault("contract_id") as string) ?? "";
            var lotId = (r.GetValueOrDefault("lot_id") as string) ?? "";
            var entityType = (r.GetValueOrDefault("entity_type") as string) ?? "";
            var payloadRaw = r.GetValueOrDefault("payload");
            var payload = payloadRaw is System.Text.Json.JsonElement je2
                ? JsonElementToDict(je2)
                : (payloadRaw as Dictionary<string, object?> ?? new Dictionary<string, object?>());

            if (entityType == "contract" && string.IsNullOrEmpty(lotId))
            {
                var c = new Dictionary<string, object?>
                {
                    ["contractId"] = cid,
                    ["name"] = payload.GetValueOrDefault("name") ?? r.GetValueOrDefault("title"),
                    ["rulesFile"] = payload.GetValueOrDefault("rulesFile") ?? "",
                    ["builtin"] = payload.GetValueOrDefault("builtin") ?? false,
                    ["createdAt"] = payload.GetValueOrDefault("createdAt") ?? r.GetValueOrDefault("created_at"),
                    ["recordId"] = r.GetValueOrDefault("Id"),
                    ["lots"] = new List<Dictionary<string, object?>>(),
                };
                byContract[cid] = c;
                contracts.Add(c);
            }
            else if (entityType == "contract_lot")
            {
                var lot = new Dictionary<string, object?>
                {
                    ["lotId"] = lotId,
                    ["name"] = payload.GetValueOrDefault("name") ?? r.GetValueOrDefault("title"),
                    ["catalogFile"] = payload.GetValueOrDefault("catalogFile") ?? "",
                    ["priceFile"] = payload.GetValueOrDefault("priceFile") ?? "",
                    ["tow5Share"] = payload.GetValueOrDefault("tow5Share") ?? 65,
                    ["active"] = payload.GetValueOrDefault("active") ?? true,
                    ["deleted"] = payload.GetValueOrDefault("deleted") ?? false,
                    ["codiceContratto"] = payload.GetValueOrDefault("codiceContratto") ?? "",
                    ["recordId"] = r.GetValueOrDefault("Id"),
                    // Includi catalog e towPrices dal payload (popolati dall'import PDF/Excel)
                    ["catalog"] = payload.GetValueOrDefault("catalog") ?? new List<object?>(),
                    ["towPrices"] = payload.GetValueOrDefault("towPrices") ?? new Dictionary<string, object?>(),
                };
                if (byContract.TryGetValue(cid, out var contract))
                    (contract["lots"] as List<Dictionary<string, object?>>)?.Add(lot);
            }
        }

        foreach (var c in contracts)
        {
            var lots = c["lots"] as List<Dictionary<string, object?>>;
            lots?.Sort((a, b) => string.Compare((a.GetValueOrDefault("lotId") as string) ?? "", (b.GetValueOrDefault("lotId") as string) ?? "", StringComparison.Ordinal));
        }

        return contracts;
    }

    // ============================================================
    // Helper: converte JsonElement (output di JsonSerializer.Deserialize<object>)
    // in Dictionary<string,object?> — necessario per il merge del payload lotto
    // ============================================================
    private static Dictionary<string, object?> JsonElementToDict(System.Text.Json.JsonElement el)
    {
        var d = new Dictionary<string, object?>();
        if (el.ValueKind != System.Text.Json.JsonValueKind.Object) return d;
        foreach (var prop in el.EnumerateObject())
            d[prop.Name] = JsonElementToValue(prop.Value);
        return d;
    }

    private static object? JsonElementToValue(System.Text.Json.JsonElement el) => el.ValueKind switch
    {
        System.Text.Json.JsonValueKind.Object  => JsonElementToDict(el),
        System.Text.Json.JsonValueKind.Array   => el.EnumerateArray().Select(JsonElementToValue).ToList(),
        System.Text.Json.JsonValueKind.String  => el.GetString(),
        System.Text.Json.JsonValueKind.Number  => el.TryGetInt64(out var i) ? (object?)i : el.GetDouble(),
        System.Text.Json.JsonValueKind.True    => true,
        System.Text.Json.JsonValueKind.False   => false,
        _ => null
    };

    // ============================================================
    // Helper: esecuzione comando (INSERT/UPDATE/DELETE)
    // ============================================================
    private async Task ExecuteAsync(string cs, string sql, List<NpgsqlParameter> ps)
    {
        await using var conn = new NpgsqlConnection(cs);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        foreach (var p in ps) cmd.Parameters.Add(p);
        await cmd.ExecuteNonQueryAsync();
    }
}

public record PcRecordRequest(
    [property: JsonPropertyName("record_key")]   string RecordKey,
    [property: JsonPropertyName("entity_type")]  string EntityType,
    [property: JsonPropertyName("contract_id")]  string? ContractId,
    [property: JsonPropertyName("lot_id")]       string? LotId,
    [property: JsonPropertyName("title")]        string? Title,
    [property: JsonPropertyName("payload")]      JsonElement? Payload
);

public record ContractRequest(
    string ContractId,
    string? Name,
    string? RulesFile,
    bool? Builtin,
    string? CreatedAt,
    List<ContractLotRequest>? Lots
);

public record ContractLotRequest(
    string LotId,
    string? Name,
    string? CatalogFile,
    string? PriceFile,
    int? Tow5Share,
    bool? Active,
    string? CodiceContratto
);

public record LotPatchRequest(    string? Name,
    string? CatalogFile,
    string? PriceFile,
    int? Tow5Share,
    bool? Active,
    bool? Deleted,
    string? CodiceContratto
);

public record ImportLotMeta
{
    public string? LotId      { get; init; }
    public string? Name       { get; init; }
    public int?    Tow5Share  { get; init; }
}

public record SeedBuiltinRequest(List<BuiltinLotData>? Lots);

public class BuiltinLotData
{
    public string?  LotId           { get; set; }
    public string?  Name            { get; set; }
    public string?  CatalogFile     { get; set; }
    public string?  PriceFile       { get; set; }
    public int?     Tow5Share       { get; set; }
    public string?  CodiceContratto { get; set; }
    // Arrivano come JsonElement dal body JSON
    public System.Text.Json.JsonElement? Catalog   { get; set; }
    public System.Text.Json.JsonElement? TowPrices { get; set; }
}