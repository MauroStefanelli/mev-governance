using Microsoft.AspNetCore.Mvc;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Controllers;

public abstract class BaseController : ControllerBase
{
    protected AppUser GetCurrentUser(AppDbContext db)
    {
        if (!Request.Headers.TryGetValue("X-USER", out var username))
            throw new Exception("Header X-USER mancante");

        var user = db.Users.FirstOrDefault(u => u.Username == username);
        if (user == null || !user.IsActive)
            throw new Exception("Utente non valido");

        return user;
    }
}
