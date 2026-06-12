using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public AuthController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    // ============================================================
    // POST /api/auth/login
    // ============================================================
    [HttpPost("login")]
    [AllowAnonymous]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        var user = _db.Users.FirstOrDefault(u =>
            u.Username == request.Username && u.IsActive);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized("Credenziali non valide");

        user.LastLogin  = DateTime.UtcNow;
        user.LastLogout = null;

        // Crea voce nello storico accessi
        var logEntry = new UserAccessLog
        {
            UserId   = user.Id,
            Username = user.Username,
            FullName = user.FullName,
            Role     = user.Role,
            LoginAt  = DateTime.UtcNow,
        };
        _db.UserAccessLogs.Add(logEntry);
        _db.SaveChanges();

        var token = GenerateToken(user);

        return Ok(new
        {
            token,
            username = user.Username,
            fullName = user.FullName,
            role = user.Role
        });
    }

    // ============================================================
    // POST /api/auth/logout  — registra data/ora uscita
    // ============================================================
    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId == null) return Unauthorized();

        var user = _db.Users.FirstOrDefault(u => u.Id == int.Parse(userId));
        if (user != null)
        {
            user.LastLogout = DateTime.UtcNow;

            // Aggiorna l'ultima voce nello storico (quella senza LogoutAt)
            var lastLog = _db.UserAccessLogs
                .Where(l => l.UserId == user.Id && l.LogoutAt == null)
                .OrderByDescending(l => l.LoginAt)
                .FirstOrDefault();
            if (lastLog != null)
                lastLog.LogoutAt = DateTime.UtcNow;

            _db.SaveChanges();
        }

        return Ok(new { message = "Logout registrato" });
    }

    // ============================================================
    // GET /api/auth/editor-logins  — ultimi login Editor (solo Admin)
    // Restituisce gli Editor che hanno fatto login dopo il timestamp
    // passato come query-param ?since=<ISO8601>, oppure tutti se omesso.
    // ============================================================
    [HttpGet("editor-logins")]
    [Authorize]
    public IActionResult GetEditorLogins([FromQuery] DateTime? since)
    {
        if (!IsAdmin()) return Forbid();

        var query = _db.Users.Where(u => u.Role == "Editor" && u.LastLogin != null);

        if (since.HasValue)
            query = query.Where(u => u.LastLogin > since.Value);

        var result = query
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.FullName,
                u.LastLogin,
                u.LastLogout
            })
            .ToList();

        return Ok(result);
    }

    // ============================================================
    // GET /api/auth/users/{id}/access-log  (solo Admin)
    // Storico completo di login/logout per un utente
    // ============================================================
    [HttpGet("users/{id}/access-log")]
    [Authorize]
    public IActionResult GetAccessLog(int id)
    {
        if (!IsAdmin()) return Forbid();

        var logs = _db.UserAccessLogs
            .Where(l => l.UserId == id)
            .OrderByDescending(l => l.LoginAt)
            .Select(l => new
            {
                l.Id,
                l.LoginAt,
                l.LogoutAt,
            })
            .ToList();

        return Ok(logs);
    }

    // ============================================================
    // GET /api/auth/users  (solo Admin)
    // ============================================================
    [HttpGet("users")]
    [Authorize]
    public IActionResult GetUsers()
    {
        if (!IsAdmin()) return Forbid();

        var users = _db.Users
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.FullName,
                u.Email,
                u.Role,
                u.IsActive,
                u.SendEmail,
                u.LastLogin,
                u.LastLogout
            })
            .ToList();

        return Ok(users);
    }

    // ============================================================
    // POST /api/auth/users  (solo Admin)
    // ============================================================
    [HttpPost("users")]
    [Authorize]
    public IActionResult CreateUser([FromBody] CreateUserRequest request)
    {
        if (!IsAdmin()) return Forbid();

        if (_db.Users.Any(u => u.Username == request.Username))
            return BadRequest("Username già esistente");

        var user = new AppUser
        {
            Username     = request.Username,
            FullName     = request.FullName,
            Email        = request.Email ?? "",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role         = request.Role == "Admin" ? "Admin" : "Editor",
            IsActive     = true
        };

        _db.Users.Add(user);
        _db.SaveChanges();

        return Ok(new { user.Id, user.Username, user.FullName, user.Role });
    }

    // ============================================================
    // PUT /api/auth/me/password  — utente corrente cambia la propria password
    // ============================================================
    [HttpPut("me/password")]
    [Authorize]
    public IActionResult ChangeMyPassword([FromBody] ChangePasswordRequest request)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId == null) return Unauthorized();

        var user = _db.Users.FirstOrDefault(u => u.Id == int.Parse(userId));
        if (user == null) return NotFound();

        if (!BCrypt.Net.BCrypt.Verify(request.OldPassword, user.PasswordHash))
            return BadRequest("Password attuale non corretta");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        _db.SaveChanges();

        return Ok(new { message = "Password aggiornata" });
    }

    // ============================================================
    // PUT /api/auth/users/{id}/toggle  (solo Admin)
    // ============================================================
    [HttpPut("users/{id}/toggle")]
    [Authorize]
    public IActionResult ToggleUser(int id)
    {
        if (!IsAdmin()) return Forbid();

        var user = _db.Users.FirstOrDefault(u => u.Id == id);
        if (user == null) return NotFound();

        user.IsActive = !user.IsActive;
        _db.SaveChanges();

        return Ok(new { user.Id, user.IsActive });
    }

    // ============================================================
    // PUT /api/auth/users/{id}/toggleemail  (solo Admin)
    // ============================================================
    [HttpPut("users/{id}/toggleemail")]
    [Authorize]
    public IActionResult ToggleEmail(int id)
    {
        if (!IsAdmin()) return Forbid();

        var user = _db.Users.FirstOrDefault(u => u.Id == id);
        if (user == null) return NotFound();

        user.SendEmail = !user.SendEmail;
        _db.SaveChanges();

        return Ok(new { user.Id, user.SendEmail });
    }

    // ============================================================
    // PUT /api/auth/users/{id}/password  (solo Admin)
    // ============================================================
    [HttpPut("users/{id}/password")]
    [Authorize]
    public IActionResult ResetPassword(int id, [FromBody] ResetPasswordRequest request)
    {
        if (!IsAdmin()) return Forbid();

        var user = _db.Users.FirstOrDefault(u => u.Id == id);
        if (user == null) return NotFound();

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        _db.SaveChanges();

        return Ok(new { message = "Password aggiornata" });
    }

    // ============================================================
    // DELETE /api/auth/users/{id}  (solo Admin)
    // ============================================================
    [HttpDelete("users/{id}")]
    [Authorize]
    public IActionResult DeleteUser(int id)
    {
        if (!IsAdmin()) return Forbid();

        var user = _db.Users.FirstOrDefault(u => u.Id == id);
        if (user == null) return NotFound();
        _db.Users.Remove(user);
        _db.SaveChanges();

        return Ok(new { message = "Utente eliminato" });
    }

    // ============================================================
    // Helpers
    // ============================================================
    private string GenerateToken(AppUser user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddHours(double.Parse(_config["Jwt:ExpiresHours"]!));

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("fullName", user.FullName)
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: expires,
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private bool IsAdmin()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        return role == "Admin";
    }
}

// ============================================================
// Request DTOs
// ============================================================
public record LoginRequest(string Username, string Password);
public record CreateUserRequest(string Username, string FullName, string? Email, string Password, string? Role);
public record ResetPasswordRequest(string NewPassword);
public record ChangePasswordRequest(string OldPassword, string NewPassword);
