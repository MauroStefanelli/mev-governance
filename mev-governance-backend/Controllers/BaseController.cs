using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Controllers;

public abstract class BaseController : ControllerBase
{
    /// <summary>
    /// Restituisce l'AmbienteId dal claim JWT.
    /// Ritorna 0 se il claim non è presente (token vecchio o non ancora aggiornato).
    /// </summary>
    protected int GetAmbienteId()
    {
        var claim = User.FindFirst("ambienteId")?.Value;
        return int.TryParse(claim, out var id) ? id : 0;
    }

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
