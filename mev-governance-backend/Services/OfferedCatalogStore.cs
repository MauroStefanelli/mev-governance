using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;

namespace MevGovernanceBackend.Services;

public record LotRecord(string RecordKey, string Title, JsonObject Payload);

// The database side of the offered catalog: reads a lot and writes ONLY the keys `offeredCatalog` and `offeredCatalogMeta` of its payload.
// The tender catalog (`catalog`), the TOW prices and every other key of the lot are written back exactly as they were read.
public static class OfferedCatalogStore
{
    public static string RecordKey(string contractId, string lotId) => $"{contractId}|{lotId}|contract-lot";

    public static async Task<LotRecord?> LoadLot(NpgsqlConnection conn, string schema, string contractId, string lotId, NpgsqlTransaction? tx = null, bool forUpdate = false)
    {
        await using var cmd = new NpgsqlCommand($@"SELECT ""title"", ""payload""::text FROM ""{schema}"".""PC_DataRecords"" WHERE ""record_key"" = @rk AND ""entity_type"" = 'contract_lot'{(forUpdate ? " FOR UPDATE" : "")}", conn, tx);
        cmd.Parameters.AddWithValue("rk", RecordKey(contractId, lotId));
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        var payload = reader.IsDBNull(1) ? new JsonObject() : JsonNode.Parse(reader.GetString(1)) as JsonObject ?? new JsonObject();
        return new LotRecord(RecordKey(contractId, lotId), reader.IsDBNull(0) ? "" : reader.GetString(0), payload);
    }

    public static JsonArray TenderCatalog(JsonObject payload) => payload["catalog"] as JsonArray ?? new JsonArray();

    // Saves (or removes, when `entries` is null) the offered catalog. Re-reads the lot inside the transaction so a change made by someone else in the meantime is kept.
    public static async Task<bool> Save(NpgsqlConnection conn, string schema, string contractId, string lotId, JsonArray? entries, JsonObject? meta)
    {
        await using var tx = await conn.BeginTransactionAsync();
        var lot = await LoadLot(conn, schema, contractId, lotId, tx, forUpdate: true);
        if (lot == null) { await tx.RollbackAsync(); return false; }
        if (entries == null) { lot.Payload.Remove("offeredCatalog"); lot.Payload.Remove("offeredCatalogMeta"); }
        else { lot.Payload["offeredCatalog"] = entries; lot.Payload["offeredCatalogMeta"] = meta ?? new JsonObject(); }
        await using var up = new NpgsqlCommand($@"UPDATE ""{schema}"".""PC_DataRecords"" SET ""payload"" = @pl::jsonb, ""updated_at"" = now() WHERE ""record_key"" = @rk", conn, tx);
        up.Parameters.AddWithValue("pl", lot.Payload.ToJsonString(new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        up.Parameters.AddWithValue("rk", lot.RecordKey);
        await up.ExecuteNonQueryAsync();
        await tx.CommitAsync();
        return true;
    }
}
