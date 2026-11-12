using Npgsql;

namespace MevGovernanceBackend.Services;

public record MergeOutcome(bool Done, int HttpStatus, string Message, MergePlan Plan, int Written, int Removed, List<Reference>? Dangling);

// The database side of the merge, kept apart from the controller so the SAME code runs in the app and in the tests against a real Postgres.
// One transaction: the move and the removal both happen or nothing does.
public static class ContractMergeStore
{
    // The revisions of the shared analysis live in their own table. The table may not exist yet on an old database: then there is nothing to repoint.
    public static async Task<List<RevisionRow>> LoadRevisions(NpgsqlConnection conn, NpgsqlTransaction? tx, string schema)
    {
        var list = new List<RevisionRow>();
        await using var exists = new NpgsqlCommand("SELECT to_regclass('\"" + schema + "\".\"InitiativeRevisions\"') IS NOT NULL", conn, tx);
        if (!(bool)(await exists.ExecuteScalarAsync() ?? false)) return list;
        await using var cmd = new NpgsqlCommand("SELECT \"Id\", \"Goto\", \"Version\", \"Payload\" FROM \"" + schema + "\".\"InitiativeRevisions\"", conn, tx);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) list.Add(new RevisionRow(reader.GetInt64(0), reader.GetString(1), reader.GetInt32(2), reader.GetString(3)));
        return list;
    }

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
            var revisions = await LoadRevisions(conn, tx, schema);
            var plan = ContractMerge.Plan(from, to, rows, revisions);
            if (!plan.CanRemove) { await tx.RollbackAsync(); return new MergeOutcome(false, 409, "Il contratto non può essere eliminato: " + string.Join(" ", plan.Blockers), plan, 0, 0, null); }
            var writes = ContractMerge.Apply(plan, rows, revisions);
            foreach (var u in writes.Upserts)
            {
                await using var up = new NpgsqlCommand($@"INSERT INTO ""{schema}"".""PC_DataRecords"" (""record_key"", ""entity_type"", ""contract_id"", ""lot_id"", ""title"", ""payload"")
                    VALUES (@rk, @et, @cid, @lid, @title, @pl::jsonb)
                    ON CONFLICT (""record_key"") DO UPDATE SET ""title"" = EXCLUDED.""title"", ""payload"" = EXCLUDED.""payload"", ""updated_at"" = now()", conn, tx);
                up.Parameters.AddWithValue("rk", u.RecordKey); up.Parameters.AddWithValue("et", u.EntityType); up.Parameters.AddWithValue("cid", u.ContractId);
                up.Parameters.AddWithValue("lid", u.LotId); up.Parameters.AddWithValue("title", u.Title); up.Parameters.AddWithValue("pl", u.PayloadJson);
                await up.ExecuteNonQueryAsync();
            }
            // Only the pointer to the catalog is rewritten; the analysis itself (decisions, documents, estimate) is left exactly as it was.
            foreach (var (id, payload) in writes.RevisionWrites ?? new())
            {
                await using var rv = new NpgsqlCommand("UPDATE \"" + schema + "\".\"InitiativeRevisions\" SET \"Payload\" = @pl WHERE \"Id\" = @id", conn, tx);
                rv.Parameters.AddWithValue("pl", payload); rv.Parameters.AddWithValue("id", id);
                await rv.ExecuteNonQueryAsync();
            }
            var removed = 0;
            foreach (var key in writes.DeleteKeys)
            {
                await using var del = new NpgsqlCommand($@"DELETE FROM ""{schema}"".""PC_DataRecords"" WHERE ""record_key"" = @rk AND ""contract_id"" = @cid", conn, tx);
                del.Parameters.AddWithValue("rk", key); del.Parameters.AddWithValue("cid", from);
                removed += await del.ExecuteNonQueryAsync();
            }
            if (afterWritesBeforeCheck != null) await afterWritesBeforeCheck();
            // The same checks on what the transaction now holds: anything still tied to the removed contract undoes everything.
            // LIMIT, verified on a real Postgres: this guards against a mistake of THIS code (something it forgot to carry over), not against another
            // session writing a revision in the same instants, because a serializable transaction does not see it. That case leaves a revision pointing at
            // the removed contract; it is not lost, and "Ripara i collegamenti" (ContractRepair) reconnects it.
            var after = await LoadAllRows(conn, tx, schema);
            var leftover = after.Where(r => r.ContractId == from).ToList();
            var afterRevisions = await LoadRevisions(conn, tx, schema);
            var danglingPlan = ContractMerge.Plan(from, to, after.Append(new ContractRow($"{from}|contract", "contract", from, "", plan.FromName, "{}")).ToList(), afterRevisions);
            var dangling = danglingPlan.References;
            if (leftover.Count > 0 || dangling.Count > 0 || danglingPlan.Revisions.Count > 0)
            { await tx.RollbackAsync(); return new MergeOutcome(false, 409, "Dopo lo spostamento risultano ancora dati collegati al contratto da eliminare: non è stato modificato nulla.", plan, 0, 0, dangling); }
            await tx.CommitAsync();
            return new MergeOutcome(true, 200, "Dati spostati ed eliminato il contratto.", plan, writes.Upserts.Count + (writes.RevisionWrites?.Count ?? 0), removed, null);
        }
        catch { try { await tx.RollbackAsync(); } catch { /* already closed */ } throw; }
    }
}

public record RepairOutcome(bool Done, int HttpStatus, string Message, RepairPlan Plan, int RevisionsFixed, int EvaluationsFixed);

// Same idea as the merge, for links that are ALREADY broken: one transaction, the pointer is the only thing rewritten.
public static class ContractRepairStore
{
    public static async Task<RepairPlan> PlanAsync(NpgsqlConnection conn, string schema, string to)
    {
        var rows = await ContractMergeStore.LoadAllRows(conn, null, schema); var revisions = await ContractMergeStore.LoadRevisions(conn, null, schema);
        return ContractRepair.Plan(to, rows, revisions);
    }

    public static async Task<RepairOutcome> RepairAsync(NpgsqlConnection conn, string schema, string to)
    {
        await using var tx = await conn.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        try
        {
            var rows = await ContractMergeStore.LoadAllRows(conn, tx, schema); var revisions = await ContractMergeStore.LoadRevisions(conn, tx, schema);
            var plan = ContractRepair.Plan(to, rows, revisions);
            if (!plan.CanRepair) { await tx.RollbackAsync(); return new RepairOutcome(false, 409, "Non si può ricollegare: " + string.Join(" ", plan.Blockers), plan, 0, 0); }
            var writes = ContractRepair.Apply(plan, rows, revisions);
            foreach (var (id, payload) in writes.Revisions)
            {
                await using var rv = new NpgsqlCommand("UPDATE \"" + schema + "\".\"InitiativeRevisions\" SET \"Payload\" = @pl WHERE \"Id\" = @id", conn, tx);
                rv.Parameters.AddWithValue("pl", payload); rv.Parameters.AddWithValue("id", id); await rv.ExecuteNonQueryAsync();
            }
            foreach (var u in writes.Evaluations)
            {
                await using var up = new NpgsqlCommand("UPDATE \"" + schema + "\".\"PC_DataRecords\" SET \"payload\" = @pl::jsonb, \"updated_at\" = now() WHERE \"record_key\" = @rk", conn, tx);
                up.Parameters.AddWithValue("pl", u.PayloadJson); up.Parameters.AddWithValue("rk", u.RecordKey); await up.ExecuteNonQueryAsync();
            }
            // nothing may still name a contract that does not exist, or the whole repair is undone
            var after = ContractRepair.Plan(to, await ContractMergeStore.LoadAllRows(conn, tx, schema), await ContractMergeStore.LoadRevisions(conn, tx, schema));
            if (after.Orphans.Count > 0) { await tx.RollbackAsync(); return new RepairOutcome(false, 409, "Dopo la riparazione restano collegamenti rotti: non è stato modificato nulla.", after, 0, 0); }
            await tx.CommitAsync();
            return new RepairOutcome(true, 200, "Collegamenti ripristinati.", plan, writes.Revisions.Count, writes.Evaluations.Count);
        }
        catch { try { await tx.RollbackAsync(); } catch { /* already closed */ } throw; }
    }
}
