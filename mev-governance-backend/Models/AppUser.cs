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

    // Admin | Editor
    public string Role { get; set; } = "Editor";

    public bool IsActive { get; set; } = true;
}
