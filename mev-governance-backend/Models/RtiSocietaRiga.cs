namespace MevGovernanceBackend.Models;

public class RtiSocietaRiga
{
    public int Id { get; set; }
    public int AmbienteId { get; set; }
    public string Contratto { get; set; } = "";
    public string Ruolo { get; set; } = "";        // Mandataria / Mandante / SUBCO / Altro
    public string Societa { get; set; } = "";
    public DateTime? DataInizio { get; set; }
    public DateTime? DataApprovazione { get; set; }
    public decimal? Percentuale { get; set; }      // valore 0-1 (es. 0.9 = 90%)
    public decimal? Importo { get; set; }
    public decimal? Consumato { get; set; }
    public int Ordine { get; set; } = 0;           // per mantenere l'ordine di inserimento
}
