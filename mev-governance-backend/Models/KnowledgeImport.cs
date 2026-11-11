using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Models;

// One row per note of an AI work history that was read, so the same note is never read twice and every proposal can be traced back.
[Index(nameof(AmbienteId), nameof(Sha256), IsUnique = true)]
[Index(nameof(AmbienteId), nameof(Id))]
public class KnowledgeImportFile
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    [MaxLength(64)] public string Sha256 { get; set; } = "";
    public string FileName { get; set; } = "";
    public string SourcePath { get; set; } = "";
    public string SourceAuthor { get; set; } = "";
    [MaxLength(120)] public string System { get; set; } = "";
    [MaxLength(120)] public string Goto { get; set; } = "";       // initiative the proposals belong to, or the system bucket
    [MaxLength(24)] public string Outcome { get; set; } = "";     // elaborato | senza-voci
    public int Proposals { get; set; }
    public bool Truncated { get; set; }
    public string Actor { get; set; } = "";
    public string ActorFullName { get; set; } = "";
    public DateTime At { get; set; }
}
