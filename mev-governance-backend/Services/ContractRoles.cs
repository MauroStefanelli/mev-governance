using System.Text.Json;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
namespace MevGovernanceBackend.Services;

public static class ContractRoles
{
    public static readonly string[] Allowed = { "Admin", "Editor", "Client", "Developer", "Bid Manager" };
    // Preserve the existing TEXT column and legacy single-role rows.
    public static string[] Read(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return Array.Empty<string>();
        if (!value.StartsWith("[")) return new[] { value };
        try { return JsonSerializer.Deserialize<string[]>(value) ?? Array.Empty<string>(); }
        catch (JsonException) { return Array.Empty<string>(); }
    }
    public static string Store(IEnumerable<string> roles) => JsonSerializer.Serialize(roles.Distinct().ToArray());
    public static string[] Effective(IEnumerable<string> global, IEnumerable<string> assigned, bool isBidManager)
    {
        var globals = global.ToArray();
        if (globals.Contains("SuperAdmin")) return new[] { "SuperAdmin" };
        return assigned.Where(Allowed.Contains).Concat(isBidManager ? new[] { "Bid Manager" } : Array.Empty<string>()).Distinct().ToArray();
    }
    // The account role adds to the token only what the per-app permission matrix needs and that never grants powers:
    // "Client". Roles that open features (Admin, Developer, Editor, Bid Manager) must come from the selected contract,
    // otherwise an account-level Admin who is only an Editor on a contract would act as Admin there.
    public static readonly string[] AccountRolesInToken = { "Client" };
    public static IEnumerable<string> TokenRoles(IEnumerable<string> contractRoles, string? accountRole)
    {
        var roles = contractRoles.ToList();
        if (!string.IsNullOrWhiteSpace(accountRole) && AccountRolesInToken.Contains(accountRole) && !roles.Contains(accountRole)) roles.Add(accountRole);
        return roles;
    }

    public static string[] ForUser(AppDbContext db, AppUser user, int ambienteId)
    {
        var global = db.UserRoles.Where(x => x.UserId == user.Id).Select(x => x.Role).ToList();
        global.Add(user.Role);
        var memberships = db.UserAmbienti.Where(x => x.UserId == user.Id).ToList();
        var activeIds = db.Ambienti.Where(a => a.IsActive).Select(a => a.Id).ToList();
        var assigned = memberships.Where(x => x.AmbienteId == ambienteId && activeIds.Contains(x.AmbienteId)).SelectMany(x => Read(x.Ruolo));
        var bidManager = global.Contains("Bid Manager") || memberships.Where(x => activeIds.Contains(x.AmbienteId)).SelectMany(x => Read(x.Ruolo)).Contains("Bid Manager");
        return Effective(global, assigned, bidManager);
    }
}
