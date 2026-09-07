using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

/// <summary>
/// Associa un utente a una pagina che può visualizzare.
/// PageId corrisponde agli id delle pagine del frontend (es. "mevcap", "contratti", "chart", ecc.)
/// </summary>
public class UserPagePermission
{
    [Key]
    public int    Id     { get; set; }
    public int    UserId { get; set; }
    public string PageId { get; set; } = "";
}
