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
        "technical_analysis", "application", "contract", "setting", "other"
    };

    private (string Schema, string ConStr) GetDbTarget()
    {
        var rawSchema = (_config["DB_SCHEMA"] ?? "public").Trim().ToLower();
        var sch = System.Text.RegularExpressions.Regex.IsMatch(rawSchema, @"^[a-zA-Z0-9_]+$")
            ? rawSchema : "public";
        var cs = _config["DB_CONNECTION_STRING"] ?? "";
        if (string.IsNullOrWhiteSpace(cs))
            throw new InvalidOperationException("DB_CONNECTION_STRING non configurato");
        return (sch, cs);
    }

    // ============================================================
    // GET /api/configuratore/records?entity_type=&contract_id=&lot_id=&q=
    // ============================================================
    [HttpGet("records")]
    public async Task<IActionResult> GetRecords([FromQuery] string? entity_type, [FromQuery] string? contract_id, [FromQuery] string? lot_id, [FromQuery] string? q)
    {
        if (!CanAccess()) return Forbid();

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
}

public record PcRecordRequest(
    string RecordKey,
    string EntityType,
    string? ContractId,
    string? LotId,
    string? Title,
    Dictionary<string, object?>? Payload
);