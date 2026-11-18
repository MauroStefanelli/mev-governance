using Microsoft.AspNetCore.Authorization;

namespace MevGovernanceBackend.Services;

// The authorization policies of the API, defined once: Program.cs registers them and the regression tests evaluate the very same rules.
public static class AuthPolicies
{
    public const string AdminOrSuper = "AdminOrSuper";
    public const string AnyAuthenticated = "AnyAuthenticated";

    public static void Register(AuthorizationOptions options)
    {
        // SuperAdmin ha tutti i permessi di Admin, piu' i propri
        options.AddPolicy(AdminOrSuper, policy => policy.RequireRole("Admin", "SuperAdmin"));
        // Qualsiasi utente autenticato (per endpoint di sola lettura)
        options.AddPolicy(AnyAuthenticated, policy => policy.RequireAuthenticatedUser());
    }
}
