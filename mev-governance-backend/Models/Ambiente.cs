using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

/// <summary>
/// Ambiente = istanza di lavoro associata a un CodiceContratto.
/// Ogni set di dati (MevItems, Contratti, BuoniConsegna, ecc.) appartiene a un Ambiente.
/// </summary>
public class Ambiente
{
    [Key]
    public int Id { get; set; }

    /// <summary>Es. "4490015980"</summary>
    public string CodiceContratto { get; set; } = "";

    /// <summary>Es. "Progetto Trasformazione Digitale"</summary>
    public string Descrizione { get; set; } = "";

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
