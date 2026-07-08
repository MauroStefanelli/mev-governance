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
    // LOGIN
    // ============================================================
    [HttpPost("login")]
    [AllowAnonymous]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        var user = _db.Users.FirstOrDefault(u =>
            u.Username == request.Username && u.IsActive);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized("Credenziali non valide");

        user.LastLogin = DateTime.UtcNow;
        user.LastLogout = null;

        _db.UserAccessLogs.Add(new UserAccessLog
        {
            UserId = user.Id,
            Username = user.Username,
            FullName = user.FullName,
            Role = user.Role,
            LoginAt = DateTime.UtcNow,
        });

        var token = GenerateToken(user);

        var refreshToken = GenerateRefreshToken();
        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(7);

        _db.SaveChanges();

        return Ok(new
        {
            token,
            refreshToken,
            username = user.Username,
            fullName = user.FullName,
            role = user.Role
        });
    }

    // ============================================================
    // REFRESH TOKEN
    // ============================================================
    [HttpPost("refresh")]
    [AllowAnonymous]
    public IActionResult Refresh([FromBody] RefreshRequest request)
    {
        var user = _db.Users.FirstOrDefault(u =>
            u.RefreshToken == request.RefreshToken);

        if (user == null || user.RefreshTokenExpiry == null || user.RefreshTokenExpiry < DateTime.UtcNow)
            return Unauthorized("Refresh token non valido");

        var newJwt = GenerateToken(user);
        var newRefresh = GenerateRefreshToken();

        user.RefreshToken = newRefresh;
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(7);

        _db.SaveChanges();

        return Ok(new
        {
            token = newJwt,
            refreshToken = newRefresh
        });
    }

    // ============================================================
    // LOGOUT
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
            user.RefreshToken = null;
            user.RefreshTokenExpiry = null;

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
    // GET USERS (pagina Utenti ✅)
    // ============================================================
    [HttpGet("users")]
    [Authorize]
    public IActionResult GetUsers()
    {
        if (!User.IsInRole("Admin"))
            return Forbid();

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

    [HttpPost("users")]
    [Authorize]
    public IActionResult CreateUser([FromBody] CreateUserRequest request)
    {
        if (!User.IsInRole("Admin"))
            return Forbid();

        if (_db.Users.Any(u => u.Username == request.Username))
            return BadRequest("Username già esistente");

        var user = new AppUser
        {
            Username = request.Username,
            FullName = request.FullName,
            Email = request.Email,
            Role = request.Role,
            IsActive = true,
            SendEmail = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password)
        };

        _db.Users.Add(user);
        _db.SaveChanges();

        return Ok(new
        {
            user.Id,
            user.Username
        });
    }
    // ============================================================
    // EDITOR LOGINS
    // ============================================================
    [HttpGet("editor-logins")]
    [Authorize]
    public IActionResult GetEditorLogins([FromQuery] DateTime? since)
    {
        if (!User.IsInRole("Admin"))
            return Forbid();

        var query = _db.Users
            .Where(u => u.Role == "Editor" && u.LastLogin != null);

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
    // ACCESS LOG UTENTE (storico login/logout)
    // ============================================================
    [HttpGet("users/{id}/access-log")]
    [Authorize]
    public IActionResult GetUserAccessLog(int id)
    {
        if (!User.IsInRole("Admin"))
            return Forbid();

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
    // GENERATE JWT
    // ============================================================
    private string GenerateToken(AppUser user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var expires = DateTime.UtcNow.AddMinutes(15);

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

    // ============================================================
    // GENERATE REFRESH TOKEN
    // ============================================================
    private string GenerateRefreshToken()
    {
        return Convert.ToBase64String(Guid.NewGuid().ToByteArray());
    }
}


public record CreateUserRequest(
    string Username,
    string FullName,
    string Email,
    string Password,
    string Role
);

// ============================================================
// DTO
// ============================================================
public record LoginRequest(string Username, string Password);
public record RefreshRequest(string RefreshToken);