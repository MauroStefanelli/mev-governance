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
}
