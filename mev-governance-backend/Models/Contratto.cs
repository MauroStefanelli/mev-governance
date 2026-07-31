using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class Contratto
{
    [Key]
    public int Id { get; set; }

    public string RifContratto { get; set; } = "";
    public string TipoContratto { get; set; } = "";
    public string? Data { get; set; }
    public decimal ImpLordo { get; set; }
    public decimal Sconto { get; set; }
    public decimal ImportoNetto { get; set; }
    public decimal Ordinato { get; set; }
    public decimal DaOrdinare { get; set; }
    public decimal Avanzato { get; set; }
    public decimal DaAvanzare { get; set; }
}
