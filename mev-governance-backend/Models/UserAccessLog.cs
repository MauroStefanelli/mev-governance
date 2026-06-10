using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

/// <summary>
/// Storico degli accessi (login/logout) per ogni utente.
/// Un record per ogni sessione: LoginAt viene scritto al login,
/// LogoutAt viene aggiornato al logout.
/// </summary>
public class UserAccessLog
{
    [Key]
    public int Id { get; set; }

    public int    UserId   { get; set; }
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Role     { get; set; } = "";

    public DateTime  LoginAt  { get; set; }
    public DateTime? LogoutAt { get; set; }
}
