using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class UserRole
{
    [Key] public int Id { get; set; }
    public int UserId { get; set; }
    public string Role { get; set; } = "";
}