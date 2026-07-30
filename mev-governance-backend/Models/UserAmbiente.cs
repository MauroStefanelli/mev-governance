using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

/// <summary>
/// Associazione tra un utente e un ambiente, con ruolo specifico per quell'ambiente.
/// </summary>
public class UserAmbiente
{
    [Key]
    public int Id { get; set; }

    public int UserId     { get; set; }
    public int AmbienteId { get; set; }

    /// <summary>Admin | Editor</summary>
    public string Ruolo { get; set; } = "Editor";
}
