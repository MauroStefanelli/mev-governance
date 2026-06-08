using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class ConsumoTow
{
    [Key]
    public int Id { get; set; }

    public string Voce { get; set; } = "";          // es. "TOW02.1", "TOW02.5"
    public decimal ValoreTotale { get; set; }
    public decimal Approvato { get; set; }
    public decimal OrdinatiRda { get; set; }
    public decimal Impegnato { get; set; }
    public decimal Residuo { get; set; }
}
