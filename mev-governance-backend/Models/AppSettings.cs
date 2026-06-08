using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

/// <summary>
/// Tabella con un solo record (Id=1) che tiene il timestamp dell'ultimo Allinea Dati.
/// </summary>
public class AppSettings
{
    [Key]
    public int Id { get; set; }

    public DateTime? LastAlignAt { get; set; }
}
