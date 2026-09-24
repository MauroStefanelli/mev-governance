using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class AppUser
{
    [Key]
    public int Id { get; set; }

    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";

    // SuperAdmin | Admin | Editor | Client
    public string Role         { get; set; } = "Editor";

    public bool   IsActive     { get; set; } = true;

    // Se true, riceve email di notifica ad ogni salvataggio MEV
    public bool   SendEmail    { get; set; } = false;

    // Tracciamento accessi
    public DateTime? LastLogin  { get; set; }
    public DateTime? LastLogout { get; set; }

    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }

    // Configurazione AI personale
    public string? AiApiKey   { get; set; }   // chiave API (es. sk-...)
    public string? AiEndpoint { get; set; }   // es. https://api.openai.com/v1/chat/completions
    public string? AiModel    { get; set; }   // es. gpt-4o, gpt-5.5
    public string? AiStyle    { get; set; }   // "responses" | "chat"
    public string? AiAuthMode { get; set; }   // "bearer" | "api-key"
}
