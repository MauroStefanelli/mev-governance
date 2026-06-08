using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class BuonoConsegna
{
    [Key]
    public int Id { get; set; }

    public string Oda { get; set; } = "";
    public string? Contratto { get; set; }
    public string? RifContratto { get; set; }
    public decimal Importo { get; set; }
    public decimal Avanzato { get; set; }
    public decimal DaAvanzare { get; set; }
}
