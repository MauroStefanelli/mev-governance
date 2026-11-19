using System.Reflection;
using System.Security.Claims;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.Extensions.DependencyInjection;

// «Annulla ultimo Align» cancella le righe dell'ultimo allineamento: se quell'Align ha caricato l'intero contratto, cancella tutto.
// Il metodo non aveva alcun controllo di ruolo: un Client con la pagina MEV poteva svuotare i dati. Qui si valuta la policy VERA (non la sola presenza dell'attributo)
// con i ruoli reali, e si fissa l'elenco degli endpoint di MevController che scrivono o cancellano e non hanno controllo di ruolo, cosi' uno nuovo non nasce scoperto per distrazione.
public static class MevEndpointsRegression
{
    static MethodInfo Method(string name) => typeof(MevController).GetMethod(name, BindingFlags.Public | BindingFlags.Instance) ?? throw new Exception("manca " + name);
    static string? PolicyOf(MethodInfo method) => method.GetCustomAttributes<AuthorizeAttribute>(true).Select(a => a.Policy).FirstOrDefault(p => p != null);

    public static async Task Run(Action<bool, string> check)
    {
        var services = new ServiceCollection(); services.AddLogging(); services.AddAuthorization(AuthPolicies.Register);
        using var provider = services.BuildServiceProvider(); var authorization = provider.GetRequiredService<IAuthorizationService>();
        async Task<bool> Allowed(string? policy, params string[] roles)
        {
            var user = new ClaimsPrincipal(new ClaimsIdentity(roles.Select(r => new Claim(ClaimTypes.Role, r)).Append(new Claim(ClaimTypes.Name, "u")), "test"));
            return policy == null || (await authorization.AuthorizeAsync(user, null, policy)).Succeeded;
        }

        var rollback = PolicyOf(Method(nameof(MevController.RollbackLastAlign)));
        check(rollback == AuthPolicies.AdminOrSuper, "«Annulla ultimo Align» is reserved by the AdminOrSuper policy");
        foreach (var role in new[] { "Client", "Editor", "Developer", "Bid Manager" })
            check(!await Allowed(rollback, role), $"«Annulla ultimo Align»: {role} is refused");
        check(!await Allowed(rollback, "Client", "Editor"), "«Annulla ultimo Align»: two roles that are not Admin are still refused");
        check(await Allowed(rollback, "Admin") && await Allowed(rollback, "SuperAdmin"), "«Annulla ultimo Align»: Admin and SuperAdmin are allowed");
        check(await Allowed(rollback, "Client", "Admin"), "«Annulla ultimo Align»: a user who is also Admin on the contract is allowed");
        check(!await Allowed(rollback), "«Annulla ultimo Align»: a user with no role is refused");

        // The ones that were already protected stay protected
        check(PolicyOf(Method(nameof(MevController.UploadExcel))) == AuthPolicies.AdminOrSuper && PolicyOf(Method(nameof(MevController.ResetAll))) == AuthPolicies.AdminOrSuper, "Upload of the Excel and the reset of all data stay for Admin and SuperAdmin");

        // The policy names the code uses exist
        check(AuthPolicies.AdminOrSuper == "AdminOrSuper" && AuthPolicies.AnyAuthenticated == "AnyAuthenticated", "The policy names are the ones the controllers use");

        // Endpoints of MevController that write or delete without a role check. Known today, and meant to be reviewed one by one (the pages are used by Client and Editor on purpose
        // for PMO fields): the list is fixed so that a NEW writing endpoint without a check fails this test and has to be decided.
        var openWriters = typeof(MevController).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.GetCustomAttributes<HttpMethodAttribute>().Any(a => a.HttpMethods.Any(h => h is "POST" or "PUT" or "DELETE" or "PATCH")))
            .Where(m => PolicyOf(m) == null).Select(m => m.Name).OrderBy(n => n).ToList();
        // ExportFormatted usa POST solo per mandare l'elenco delle righe: legge e basta (e un Client riceve solo i suoi contratti), quindi e' aperta a chi legge MEV, come GET /api/mev.
        var expected = new[] { nameof(MevController.Align), nameof(MevController.CreateMev), nameof(MevController.DeleteMev), nameof(MevController.UpdateMev), nameof(MevController.ExportFormatted) }.OrderBy(n => n).ToList();
        check(openWriters.SequenceEqual(expected), $"Writing endpoints of MEV without a role check are exactly the known ones ({string.Join(", ", openWriters)})");
    }
}
