using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using System.Data;
using System.Text.Json;
using MevGovernanceBackend.Data;

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
                        new("pl", JsonSerializer.Serialize(lotPayload)),
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
            var payload = rows.Count > 0
                ? (rows[0].GetValueOrDefault("payload") as Dictionary<string, object?> ?? new Dictionary<string, object?>())
                : new Dictionary<string, object?> { ["name"] = $"Lotto {lotId}" };

            if (req.Name != null) payload["name"] = req.Name;
            if (req.CatalogFile != null) payload["catalogFile"] = req.CatalogFile;
            if (req.PriceFile != null) payload["priceFile"] = req.PriceFile;
            if (req.Tow5Share != null) payload["tow5Share"] = req.Tow5Share;
            if (req.Active != null) payload["active"] = req.Active;
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
    // GET /api/configuratore/records?entity_type=&contract_id=&lot_id=&q=
    // ============================================================
    [HttpGet("records")]
    public async Task<IActionResult> GetRecords([FromQuery] string? entity_type, [FromQuery] string? contract_id, [FromQuery] string? lot_id, [FromQuery] string? q)
    {

        var (sch, cs) = GetDbTarget();
        var sql = $@"SELECT ""Id"", ""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload""::text AS ""payload"", ""created_at"", ""updated_at"" FROM ""{sch}"".""PC_DataRecords"" WHERE 1 = 1";
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
        var payload = req.Payload ?? new Dictionary<string, object?>();

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
            RETURNING ""Id"", ""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload""::text AS ""payload"", ""created_at"", ""updated_at""";

        try
        {
            var list = await QueryAsync(cs, sql, new List<NpgsqlParameter>
            {
                new("rk", req.RecordKey),
                new("et", req.EntityType),
                new("cid", req.ContractId ?? ""),
                new("lid", req.LotId ?? ""),
                new("title", req.Title ?? ""),
                new("pl", JsonSerializer.Serialize(payload)),
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
        var sql = $@"DELETE FROM ""{sch}"".""PC_DataRecords"" WHERE ""Id"" = @id::uuid";

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
        var sql = $@"SELECT ""Id"", ""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload""::text AS ""payload"", ""created_at"", ""updated_at""
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
            var payload = r.GetValueOrDefault("payload") as Dictionary<string, object?> ??
                          new Dictionary<string, object?>();

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
                    ["codiceContratto"] = payload.GetValueOrDefault("codiceContratto") ?? "",
                    ["recordId"] = r.GetValueOrDefault("Id"),
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
    string RecordKey,
    string EntityType,
    string? ContractId,
    string? LotId,
    string? Title,
    Dictionary<string, object?>? Payload
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

public record LotPatchRequest(
    string? Name,
    string? CatalogFile,
    string? PriceFile,
    int? Tow5Share,
    bool? Active,
    string? CodiceContratto
);