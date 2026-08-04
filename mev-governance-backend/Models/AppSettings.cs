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

    /// <summary>Minuti di inattività prima del logout automatico. Default 60.</summary>
    public int LogoutMinutes { get; set; } = 60;

    /// <summary>
    /// Percentuali impatto TOW per contratto, serializzate come JSON.
    /// Formato: { "NomeContratto": { "TOW02.1": 30.5, ... } }
    /// </summary>
    public string? TowImpattoJson { get; set; }
}
