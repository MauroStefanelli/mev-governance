using System.Security.Claims;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

// Assigning the contracts of a Client in «Gestione Client» used to store the role «Editor» on the contract. The per-app permission matrix works on roles, so such a Client was treated as an Editor
// (MEV-CAP and Gestione Team reachable, the Client column of the matrix ignored). A Client must get the role «Client».
public static class ClientContractRoleRegression
{
    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        ClientPermissionsController As(string role) => new(db) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.Name, "admin"), new Claim(ClaimTypes.Role, role), new Claim("ambienteId", "1") }, "test")) } } };
        string Stored(int user, int environment) => db.UserAmbienti.AsNoTracking().Single(x => x.UserId == user && x.AmbienteId == environment).Ruolo;

        // The pure rule
        check(ContractRoles.ForClientAssignment(null, "Client") == "[\"Client\"]", "A Client without a role on the contract gets «Client»");
        check(ContractRoles.ForClientAssignment("Editor", "Client") == "[\"Client\"]", "The «Editor» written by the old code becomes «Client»");
        check(ContractRoles.ForClientAssignment("[\"Editor\"]", "Client") == "[\"Client\"]", "The same when stored as a list");
        check(ContractRoles.ForClientAssignment("[\"Client\"]", "Client") == "[\"Client\"]", "A Client already right is left as it is");
        check(ContractRoles.ForClientAssignment("[\"Client\",\"Developer\"]", "Client") == "[\"Client\",\"Developer\"]", "Roles chosen by hand are kept");
        check(ContractRoles.ForClientAssignment("[\"Editor\",\"Developer\"]", "Client") == "[\"Editor\",\"Developer\"]", "An Editor with other roles was chosen by hand: not touched");
        check(ContractRoles.ForClientAssignment("Admin", "Client") == "Admin", "Another single role is not touched");
        check(ContractRoles.ForClientAssignment(null, "Developer") == "Editor" && ContractRoles.ForClientAssignment("Editor", "Developer") == "Editor", "For an account that is not a Client nothing changes: «Editor» as before");
        check(ContractRoles.ForClientAssignment("[\"Developer\"]", "Admin") == "[\"Developer\"]", "A non-Client keeps its roles");
        check(ContractRoles.ForClientAssignment("Editor", "client") == "Editor" && ContractRoles.ForClientAssignment("Editor", null) == "Editor", "Only the exact account role Client counts");

        // The real case: CRIGGIO (right) and ClientTest (created by the old code with «Editor»), plus a Developer who is not a Client
        var criggio = new AppUser { Username = "CRIGGIO", Role = "Client" }; var clientTest = new AppUser { Username = "ClientTest", Role = "Client" };
        var developer = new AppUser { Username = "dev-x", Role = "Developer" }; var handmade = new AppUser { Username = "client-dev", Role = "Client" };
        db.Users.AddRange(criggio, clientTest, developer, handmade); await db.SaveChangesAsync();
        var environment = new Ambiente { CodiceContratto = "CLIENTROLE", IsActive = true }; db.Ambienti.Add(environment); await db.SaveChangesAsync();
        db.UserAmbienti.AddRange(new UserAmbiente { UserId = criggio.Id, AmbienteId = environment.Id, Ruolo = "[\"Client\"]" }, new UserAmbiente { UserId = clientTest.Id, AmbienteId = environment.Id, Ruolo = "Editor" },
            new UserAmbiente { UserId = handmade.Id, AmbienteId = environment.Id, Ruolo = "[\"Client\",\"Developer\"]" }); await db.SaveChangesAsync();
        var admin = As("Admin");
        check(admin.SetContratti(criggio.Id, new(environment.Id, new() { "BASE", "QDO" })) is OkObjectResult && Stored(criggio.Id, environment.Id) == "[\"Client\"]", "CRIGGIO stays a Client after saving his contracts");
        check(admin.SetContratti(clientTest.Id, new(environment.Id, new() { "BASE", "QDO" })) is OkObjectResult && Stored(clientTest.Id, environment.Id) == "[\"Client\"]", "ClientTest: «Editor» becomes «Client» when his contracts are saved");
        check(admin.SetContratti(handmade.Id, new(environment.Id, new() { "BASE" })) is OkObjectResult && Stored(handmade.Id, environment.Id) == "[\"Client\",\"Developer\"]", "A Client who was also given Developer by hand keeps both");
        check(await db.UserClientContratti.CountAsync(x => x.UserId == clientTest.Id && x.AmbienteId == environment.Id) == 2, "The contracts themselves are saved as before");

        // The effect: the roles in the token. A Client is a Client, not an Editor, so the matrix column «Client» is the one that applies.
        check(ContractRoles.ForUser(db, clientTest, environment.Id).SequenceEqual(new[] { "Client" }), "ClientTest now acts as a Client on the contract, with no Editor powers");
        check(!ContractRoles.TokenRoles(ContractRoles.ForUser(db, clientTest, environment.Id), clientTest.Role).Contains("Editor"), "Editor is no longer in the roles of the token of ClientTest");

        // A new Client (no row yet) gets «Client»; a non-Client keeps getting «Editor»
        var fresh = new AppUser { Username = "nuovo-client", Role = "Client" }; var plain = new AppUser { Username = "nuovo-editor", Role = "Editor" }; db.Users.AddRange(fresh, plain); await db.SaveChangesAsync();
        check(admin.SetContratti(fresh.Id, new(environment.Id, new() { "BASE" })) is OkObjectResult && Stored(fresh.Id, environment.Id) == "[\"Client\"]", "A new Client gets «Client» on the contract");
        check(admin.SetContratti(plain.Id, new(environment.Id, new() { "BASE" })) is OkObjectResult && Stored(plain.Id, environment.Id) == "Editor", "A user who is not a Client gets «Editor» as before");

        // Removing every contract still removes the association
        check(admin.SetContratti(fresh.Id, new(environment.Id, new())) is OkObjectResult && !db.UserAmbienti.Any(x => x.UserId == fresh.Id && x.AmbienteId == environment.Id), "Without contracts the Client is no longer in the environment");
        check(As("Client").GetType() == typeof(ClientPermissionsController), "controller built for a Client caller");
    }
}
