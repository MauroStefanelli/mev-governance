using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class VerbaleAvanzamento
{
    [Key]
    public int Id { get; set; }

    public string NomePdf         { get; set; } = "";
    public string MeseAvanzamento { get; set; } = "";
    public int    RigheElaborate  { get; set; }
    public int    RigheAggiornate { get; set; }
    public DateTime CaricatoIl   { get; set; } = DateTime.UtcNow;
    public string CaricatoDa     { get; set; } = "";

    // Righe parsate in formato JSON: [{oda, pos, qta, importo, subappalto}, ...]
    // Usato per ricalcolare i campi VAP senza ricaricare il PDF
    public string? DatiRigheJson  { get; set; }

    public int AmbienteId { get; set; }
}
