using Npgsql;

namespace MevGovernanceBackend.Services;

public record MergeOutcome(bool Done, int HttpStatus, string Message, MergePlan Plan, int Written, int Removed, List<Reference>? Dangling);

// The database side of the merge, kept apart from the controller so the SAME code runs in the app and in the tests against a real Postgres.
// One transaction: the move and the removal both happen or nothing does.
public static class ContractMergeStore
{
    public static async Task<List<ContractRow>> LoadAllRows(NpgsqlConnection conn, NpgsqlTransaction? tx, string schema)
    {
        var rows = new List<ContractRow>();
        await using var cmd = new NpgsqlCommand($@"SELECT ""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload""::text FROM ""{schema}"".""PC_DataRecords"" WHERE ""entity_type"" <> 'gara'", conn, tx);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            rows.Add(new ContractRow(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.IsDBNull(5) ? "{}" : reader.GetString(5)));
        return rows;
    }

    public static async Task<MergeOutcome> MergeAsync(NpgsqlConnection conn, string schema, string from, string to, Func<Task>? afterWritesBeforeCheck = null)
    {
        await using var tx = await conn.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        try
        {
            var rows = await LoadAllRows(conn, tx, schema);
            var plan = ContractMerge.Plan(from, to, rows);
            if (!plan.CanRemove) { await tx.RollbackAsync(); return new MergeOutcome(false, 409, "Il contratto non può essere eliminato: " + string.Join(" ", plan.Blockers), plan, 0, 0, null); }
            var writes = ContractMerge.Apply(plan, rows);
            foreach (var u in writes.Upserts)
            {
                await using var up = new NpgsqlCommand($@"INSERT INTO ""{schema}"".""PC_DataRecords"" (""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload"")
                    VALUES (@rk, @et, @cid, @lid, @title, @pl::jsonb)
                    ON CONFLICT (""record_key"") DO UPDATE SET ""title"" = EXCLUDED.""title"", ""payload"" = EXCLUDED.""payload"", ""updated_at"" = now()", conn, tx);
                up.Parameters.AddWithValue("rk", u.RecordKey); up.Parameters.AddWithValue("et", u.EntityType); up.Parameters.AddWithValue("cid", u.ContractId);
                up.Parameters.AddWithValue("lid", u.LotId); up.Parameters.AddWithValue("title", u.Title); up.Parameters.AddWithValue("pl", u.PayloadJson);
                await up.ExecuteNonQueryAsync();
            }
            var removed = 0;
            foreach (var key in writes.DeleteKeys)
            {
                await using var del = new NpgsqlCommand($@"DELETE FROM ""{schema}"".""PC_DataRecords"" WHERE ""record_key"" = @rk AND ""contract_id"" = @cid", conn, tx);
                del.Parameters.AddWithValue("rk", key); del.Parameters.AddWithValue("cid", from);
                removed += await del.ExecuteNonQueryAsync();
            }
            if (afterWritesBeforeCheck != null) await afterWritesBeforeCheck();
            // the same checks on what the transaction now holds: anything still tied to the removed contract undoes everything
            var after = await LoadAllRows(conn, tx, schema);
            var leftover = after.Where(r => r.ContractId == from).ToList();
            var dangling = ContractMerge.Plan(from, to, after.Append(new ContractRow($"{from}|contract", "contract", from, "", plan.FromName, "{}")).ToList()).References;
            if (leftover.Count > 0 || dangling.Count > 0)
            { await tx.RollbackAsync(); return new MergeOutcome(false, 409, "Dopo lo spostamento risultano ancora dati collegati al contratto da eliminare: non è stato modificato nulla.", plan, 0, 0, dangling); }
            await tx.CommitAsync();
            return new MergeOutcome(true, 200, "Dati spostati ed eliminato il contratto.", plan, writes.Upserts.Count, removed, null);
        }
        catch { try { await tx.RollbackAsync(); } catch { /* already closed */ } throw; }
    }
}
