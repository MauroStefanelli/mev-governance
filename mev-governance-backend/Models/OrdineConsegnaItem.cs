using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class OrdineConsegnaItem
{
    [Key]
    public int Id { get; set; }

    // Dati testata PDF
    public string NumeroOrdine { get; set; } = "";
    public string Data         { get; set; } = "";
    public string DataConsegna { get; set; } = "";
    public string RifContratto { get; set; } = "";

    // Dati riga articolo
    public string Art         { get; set; } = "";
    public string Codice      { get; set; } = "";
    public string Descrizione { get; set; } = "";
    public string TipoAtt     { get; set; } = "";
    public string Quantita    { get; set; } = "";
    public string Um          { get; set; } = "";
    public string PrezzoNetto { get; set; } = "";
    public string Importo     { get; set; } = "";
    public string NumeroRda   { get; set; } = "";
    public string Iniziativa  { get; set; } = "";
    public string Ap          { get; set; } = "";
    public string Contratto   { get; set; } = "";

    // Metadati
    public string NomePdf          { get; set; } = "";
    public DateTime ImportatoIl    { get; set; } = DateTime.UtcNow;
    public string ImportatoDA      { get; set; } = "";
}
