using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Models;

[Index(nameof(AmbienteId), nameof(Goto), nameof(Version), IsUnique = true)]
public class InitiativeRevision
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    [MaxLength(120)] public string Goto { get; set; } = "";
    public int Version { get; set; }
    public DateTime CreatedAt { get; set; }
    public string Author { get; set; } = "";
    public string Reason { get; set; } = "";
    public string Payload { get; set; } = "{}";
}
