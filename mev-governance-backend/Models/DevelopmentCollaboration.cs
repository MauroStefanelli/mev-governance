using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Models;

// One row per user and initiative: when the user was last connected and when they last saved.
[Index(nameof(AmbienteId), nameof(Goto), nameof(Username), IsUnique = true)]
public class DevelopmentPresence
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    [MaxLength(120)] public string Goto { get; set; } = "";
    [MaxLength(120)] public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public DateTime LastSeenAt { get; set; }
    public DateTime? LastWorkedAt { get; set; }
}

// Permanent chat history shared by everyone working on the same initiative of an environment.
[Index(nameof(AmbienteId), nameof(Goto), nameof(Id))]
public class DevelopmentMessage
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    [MaxLength(120)] public string Goto { get; set; } = "";
    [MaxLength(120)] public string Author { get; set; } = "";
    public string AuthorFullName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public string Text { get; set; } = "";
}
