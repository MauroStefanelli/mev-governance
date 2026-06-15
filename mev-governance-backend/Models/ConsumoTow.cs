using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class ConsumoTow
{
    [Key]
    public int Id { get; set; }

    public string Tow { get; set; } = "";           // colonna "TOW" — es. "TOW02.1"
    public string? TowContratto { get; set; }        // colonna "TOW Contratto"
    public decimal ValoreUnitario { get; set; }      // colonna "Valore Unitario"
    public decimal ValoreTotale { get; set; }
    public decimal Approvato { get; set; }
    public decimal OrdinatiRda { get; set; }         // colonna "Ordinati(RDA)"
    public decimal Impegnato { get; set; }
    public decimal Residuo { get; set; }
    public decimal TowApprovati { get; set; }
    public decimal TowImpegnati { get; set; }
    public decimal TowResidui { get; set; } 

}




