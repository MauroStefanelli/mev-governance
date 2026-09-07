using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

/// <summary>
/// Associa un utente Client ai contratti che può visualizzare in un dato ambiente.
/// TowContratto = nome contratto (es. "BASE", "QDO") come in ConsumoTow.TowContratto.
/// </summary>
public class UserClientContratto
{
    [Key]
    public int    Id            { get; set; }
    public int    UserId        { get; set; }
    public int    AmbienteId    { get; set; }
    public string TowContratto  { get; set; } = "";
}
