using MevGovernanceBackend.Data;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Text.Json.Nodes;

namespace MevGovernanceBackend.Controllers;

// «Voci di catalogo offerti»: the prices offered after the award, kept next to the tender catalog of the lot (never over it).
// SuperAdmin: every lot. Admin: only the lots linked to the contract he is working on (codiceContratto of the lot = code of his environment).
[ApiController, Authorize]
[Route("api/configuratore/offered-catalog")]
public class OfferedCatalogController : BaseController
{
    public const int MaxBytes = 5 * 1024 * 1024;
    private readonly AppDbContext db;
    private readonly IConfiguration config;
    public OfferedCatalogController(AppDbContext db, IConfiguration config) { this.db = db; this.config = config; }

    private bool IsSuper => User.IsInRole("SuperAdmin");
    private bool IsAdmin => User.IsInRole("Admin");

    private (string Schema, string Connection) Target()
    {
        var raw = (config["DB_SCHEMA"] ?? "").Trim().ToLower();
        var schema = raw.Length > 0 && System.Text.RegularExpressions.Regex.IsMatch(raw, "^[a-zA-Z0-9_]+$") ? raw : "public";
        var cs = config["DB_CONNECTION_STRING"] ?? "";
        if (string.IsNullOrWhiteSpace(cs)) cs = config["DATABASE_DIRECT_URL"] ?? config["DATABASE_URL"] ?? "";
        return (schema, cs);
    }

    private async Task<string?> EnvironmentCode()
    {
        var id = GetAmbienteId();
        return id <= 0 ? null : await db.Ambienti.AsNoTracking().Where(a => a.Id == id && a.IsActive).Select(a => a.CodiceContratto).FirstOrDefaultAsync();
    }

    private async Task<bool> Allowed(JsonObject lotPayload) =>
        OfferedCatalogWorkbook.CanManage(IsSuper, IsAdmin, IsSuper ? null : await EnvironmentCode(), lotPayload["codiceContratto"]?.ToString());

    private static object MetaView(JsonObject payload) => new
    {
        count = (payload["offeredCatalog"] as JsonArray)?.Count ?? 0,
        meta = payload["offeredCatalogMeta"],
    };

    // The lots this user may manage, with the state of their offered catalog.
    [HttpGet("lots")]
    public async Task<IActionResult> Lots()
    {
        if (!IsSuper && !IsAdmin) return Forbid();
        var (schema, cs) = Target();
        var code = IsSuper ? null : await EnvironmentCode();
        if (!IsSuper && string.IsNullOrWhiteSpace(code)) return Ok(new object[0]);
        await using var conn = new NpgsqlConnection(cs); await conn.OpenAsync();
        var result = new List<object>(); var names = new Dictionary<string, string>();
        await using (var cmd = new NpgsqlCommand($@"SELECT ""contract_id"", ""lot_id"", ""entity_type"", ""title"", ""payload""::text FROM ""{schema}"".""PC_DataRecords"" WHERE ""entity_type"" IN ('contract','contract_lot') ORDER BY ""contract_id"", ""lot_id""", conn))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            var lots = new List<(string C, string L, string Title, JsonObject P)>();
            while (await reader.ReadAsync())
            {
                var p = reader.IsDBNull(4) ? new JsonObject() : JsonNode.Parse(reader.GetString(4)) as JsonObject ?? new JsonObject();
                if (reader.GetString(2) == "contract") names[reader.GetString(0)] = p["name"]?.ToString() ?? reader.GetString(3);
                else lots.Add((reader.GetString(0), reader.GetString(1), reader.IsDBNull(3) ? "" : reader.GetString(3), p));
            }
            foreach (var l in lots)
            {
                if (l.P["deleted"]?.GetValue<bool>() == true) continue;
                if (!OfferedCatalogWorkbook.CanManage(IsSuper, IsAdmin, code, l.P["codiceContratto"]?.ToString())) continue;
                var view = MetaView(l.P);
                result.Add(new { contractId = l.C, contractName = names.GetValueOrDefault(l.C) ?? l.C, lotId = l.L, lotName = l.P["name"]?.ToString() ?? l.Title,
                    tenderCount = OfferedCatalogStore.TenderCatalog(l.P).Count, offered = view });
            }
        }
        return Ok(result);
    }

    private async Task<(LotRecord? Lot, IActionResult? Error)> Authorized(NpgsqlConnection conn, string schema, string? contractId, string? lot)
    {
        if (!IsSuper && !IsAdmin) return (null, Forbid());
        if (string.IsNullOrWhiteSpace(contractId) || string.IsNullOrWhiteSpace(lot)) return (null, BadRequest(new { message = "Indica contratto e lotto." }));
        var record = await OfferedCatalogStore.LoadLot(conn, schema, contractId.Trim(), lot.Trim());
        if (record == null) return (null, NotFound(new { message = "Lotto non trovato nell'Archivio contrattuale." }));
        // A lot the user may not manage is reported as «not found»: it must not reveal that it exists.
        if (!await Allowed(record.Payload)) return (null, NotFound(new { message = "Lotto non trovato nell'Archivio contrattuale." }));
        return (record, null);
    }

    // The Excel model to fill in: the voices of the tender catalog with empty price cells.
    [HttpGet("template")]
    public async Task<IActionResult> Template([FromQuery] string contractId, [FromQuery] string lot)
    {
        if (!IsSuper && !IsAdmin) return Forbid();
        var (schema, cs) = Target();
        await using var conn = new NpgsqlConnection(cs); await conn.OpenAsync();
        var (record, error) = await Authorized(conn, schema, contractId, lot);
        if (error != null) return error;
        var tender = OfferedCatalogStore.TenderCatalog(record!.Payload);
        if (tender.Count == 0) return BadRequest(new { message = "Il lotto non ha un catalogo di gara: caricalo prima in 'Lotti e prezzi'." });
        var bytes = OfferedCatalogWorkbook.BuildTemplate(tender, contractId, lot);
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"catalogo-offerto-{contractId}-lotto-{lot}.xlsx");
    }

    private async Task<(OfferedCatalogWorkbook.Result? Result, LotRecord? Lot, IActionResult? Error)> ReadFile(NpgsqlConnection conn, string schema, IFormFile? file, string? contractId, string? lot)
    {
        var (record, error) = await Authorized(conn, schema, contractId, lot);
        if (error != null) return (null, null, error);
        if (file == null || file.Length == 0 || file.Length > MaxBytes || !file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
            return (null, null, BadRequest(new { message = "Scegli il file Excel in formato XLSX (massimo 5 MB)." }));
        await using var input = file.OpenReadStream(); using var memory = new MemoryStream(); await input.CopyToAsync(memory); memory.Position = 0;
        return (OfferedCatalogWorkbook.Read(memory, OfferedCatalogStore.TenderCatalog(record!.Payload)), record, null);
    }

    private static object Comparison(OfferedCatalogWorkbook.Result result) => result.Rows.Select(r => new
    {
        id = r.Id, ambito = r.Ambit, nome = r.Name,
        prezzi = r.Prices.Select(p => new { tipo = p.Type, fascia = p.Band, gara = p.Base, offerto = p.Offered }),
    });

    // Reads and checks the file WITHOUT saving: errors cell by cell, warnings, and the comparison with the tender prices.
    [HttpPost("preview"), RequestSizeLimit(MaxBytes + 1024 * 1024)]
    public async Task<IActionResult> Preview(IFormFile file, [FromForm] string contractId, [FromForm] string lot)
    {
        if (!IsSuper && !IsAdmin) return Forbid();
        var (schema, cs) = Target();
        await using var conn = new NpgsqlConnection(cs); await conn.OpenAsync();
        var (result, _, error) = await ReadFile(conn, schema, file, contractId, lot);
        if (error != null) return error;
        return Ok(new { ok = result!.Ok, errors = result.Errors, warnings = result.Warnings, rows = Comparison(result) });
    }

    // Checks again and saves. A file with even one error is refused as a whole: the offered catalog is replaced entirely or not at all.
    [HttpPost("import"), RequestSizeLimit(MaxBytes + 1024 * 1024)]
    public async Task<IActionResult> Import(IFormFile file, [FromForm] string contractId, [FromForm] string lot)
    {
        if (!IsSuper && !IsAdmin) return Forbid();
        var (schema, cs) = Target();
        await using var conn = new NpgsqlConnection(cs); await conn.OpenAsync();
        var (result, _, error) = await ReadFile(conn, schema, file, contractId, lot);
        if (error != null) return error;
        if (!result!.Ok) return BadRequest(new { message = "Il file contiene errori: nessuna voce è stata salvata.", errors = result.Errors, warnings = result.Warnings });
        var meta = new JsonObject
        {
            ["fileName"] = Path.GetFileName(file.FileName), ["importedAt"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            ["importedBy"] = User.Identity?.Name ?? "", ["importedByFullName"] = User.FindFirst("fullName")?.Value ?? "", ["rows"] = result.Rows.Count,
        };
        if (!await OfferedCatalogStore.Save(conn, schema, contractId.Trim(), lot.Trim(), OfferedCatalogWorkbook.ToEntries(result.Rows), meta))
            return NotFound(new { message = "Lotto non trovato nell'Archivio contrattuale." });
        return Ok(new { message = "Catalogo offerto salvato.", count = result.Rows.Count, warnings = result.Warnings, meta });
    }

    // Removes the offered catalog: the lot goes back to the tender prices. The tender catalog is not touched.
    [HttpDelete]
    public async Task<IActionResult> Remove([FromQuery] string contractId, [FromQuery] string lot)
    {
        if (!IsSuper && !IsAdmin) return Forbid();
        var (schema, cs) = Target();
        await using var conn = new NpgsqlConnection(cs); await conn.OpenAsync();
        var (_, error) = await Authorized(conn, schema, contractId, lot);
        if (error != null) return error;
        await OfferedCatalogStore.Save(conn, schema, contractId.Trim(), lot.Trim(), null, null);
        return Ok(new { message = "Catalogo offerto rimosso: il lotto torna ai prezzi di gara." });
    }
}
