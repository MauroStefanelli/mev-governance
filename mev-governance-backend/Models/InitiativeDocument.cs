using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Models;

[Index(nameof(AmbienteId), nameof(Goto))]
public class InitiativeDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int AmbienteId { get; set; }
    [MaxLength(120)] public string Goto { get; set; } = "";
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
    public string Sha256 { get; set; } = "";
    public string Author { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    [JsonIgnore] public byte[] Content { get; set; } = Array.Empty<byte>();
    [JsonIgnore] public string? Extraction { get; set; }
    public DateTime? RemovedAt { get; set; }
    public string RemovedBy { get; set; } = "";
}
