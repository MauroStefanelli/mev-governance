using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Models;

[Index(nameof(AmbienteId), nameof(Goto))]
public class InitiativeConversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int AmbienteId { get; set; }
    public string Goto { get; set; } = "";
    public int Revision { get; set; }
    public string Author { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public string Question { get; set; } = "";
    public string Answer { get; set; } = "{}";
    public string Model { get; set; } = "";
    [JsonIgnore] public string Context { get; set; } = "{}";
}
