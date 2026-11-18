using System.Security.Claims;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

// La scheda «Modifica MEV» tiene Mandataria e Mandanti in UN solo campo (Capgemini). La colonna storica «Iet» (una «x» dell'Excel) non la puo' modificare:
// se restava, alla riapertura la «x» riaggiungeva IET anche dopo che l'utente l'aveva tolta, e il campo «tornava indietro».
public static class MevMandatoryRegression
{
    public static async Task Run(AppDbContext db, Action<bool, string> check)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        MevController As(int environment) => new(db, new EmailService(config, NullLogger<EmailService>.Instance), config) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.Name, "anna"), new Claim("fullName", "Anna Rossi"), new Claim(ClaimTypes.Role, "Admin"), new Claim("ambienteId", environment.ToString()) }, "test")) } } };
        var environmentRow = new Ambiente { CodiceContratto = "MANDATORY", IsActive = true }; db.Ambienti.Add(environmentRow); await db.SaveChangesAsync(); var env = environmentRow.Id;

        MevItem Item(string goTo, string cap, string? iet) => new() { ExcelOrder = 1, ExcelId = goTo, GoTo = goTo, Applicativo = "BEP", Descrizione = "d", Stato = "Approvato", AmbienteId = env, Capgemini = cap, Iet = iet };
        var withX = Item("142379", "[\"Capgemini Italia S.p.A.\",\"IET\"]", "x");     // la riga vera di produzione
        var other = Item("G2", "x", "x"); var untouched = Item("G3", "x", "x");
        db.MevItems.AddRange(withX, other, untouched); await db.SaveChangesAsync();

        // L'utente toglie IET dalla scheda e salva: arriva la nuova lista in Capgemini
        var result = await As(env).UpdateMev(withX.Id, new UpdateMevRequest { Capgemini = "Capgemini Italia S.p.A." });
        check(result is OkObjectResult, "Saving the card answers 200");
        var saved = await db.MevItems.AsNoTracking().SingleAsync(x => x.Id == withX.Id);
        check(saved.Capgemini == "Capgemini Italia S.p.A.", "The list chosen in the card is saved in Capgemini");
        check(saved.Iet == null, "The old «x» of the IET column is cleared with it, so IET does not come back when the card is reopened");

        // Un salvataggio che NON tocca Mandataria/Mandante lascia la colonna come stava
        await As(env).UpdateMev(other.Id, new UpdateMevRequest { PNote = "solo una nota" });
        var other2 = await db.MevItems.AsNoTracking().SingleAsync(x => x.Id == other.Id);
        check(other2.Iet == "x" && other2.Capgemini == "x", "Saving something else (a note) does not touch Mandataria/Mandante");

        // Un'altra riga non viene toccata dal salvataggio della prima
        check((await db.MevItems.AsNoTracking().SingleAsync(x => x.Id == untouched.Id)).Iet == "x", "Another row keeps its «x»");

        // Salvare una lista vuota (l'utente ha tolto tutto) azzera anche la colonna vecchia
        await As(env).UpdateMev(untouched.Id, new UpdateMevRequest { Capgemini = "" });
        var emptied = await db.MevItems.AsNoTracking().SingleAsync(x => x.Id == untouched.Id);
        check(string.IsNullOrEmpty(emptied.Capgemini) && emptied.Iet == null, "If everybody is removed, nothing is left of the old marks either");

        // Un altro ambiente non vede la riga: il salvataggio non la tocca
        var other3 = await As(env + 1000).UpdateMev(other.Id, new UpdateMevRequest { Capgemini = "X" });
        check(other3 is NotFoundResult && (await db.MevItems.AsNoTracking().SingleAsync(x => x.Id == other.Id)).Capgemini == "x", "A row of another environment is not touched");
    }
}
