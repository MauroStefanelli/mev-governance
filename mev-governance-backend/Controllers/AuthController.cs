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

        // Recupera gli ambienti accessibili all'utente
        var ambienti = GetAmbientiForUser(user);
        var defaultAmbienteId = ambienti.FirstOrDefault()?.Id ?? 0;

        var token = GenerateToken(user, defaultAmbienteId);

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
            role = user.Role,
            ambienti,
            ambienteId = defaultAmbienteId
        });
    }

    // ============================================================
    // GET /api/auth/my-ambienti
    // ============================================================
    [HttpGet("my-ambienti")]
    [Authorize]
    public IActionResult GetMyAmbienti()
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var user = _db.Users.FirstOrDefault(u => u.Id == userId);
        if (user == null) return Unauthorized();

        return Ok(GetAmbientiForUser(user));
    }

    // ============================================================
    // POST /api/auth/switch-ambiente
    // Genera un nuovo token con un ambienteId diverso
    // ============================================================
    [HttpPost("switch-ambiente")]
    [Authorize]
    public IActionResult SwitchAmbiente([FromBody] SwitchAmbienteRequest request)
    {
        var userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        var user = _db.Users.FirstOrDefault(u => u.Id == userId);
        if (user == null) return Unauthorized();

        var ambienti = GetAmbientiForUser(user);
        if (!ambienti.Any(a => a.Id == request.AmbienteId))
            return Forbid();

        var newToken = GenerateToken(user, request.AmbienteId);
        return Ok(new { token = newToken, ambienteId = request.AmbienteId });
    }

    // Helper: restituisce gli ambienti visibili all'utente
    private List<AmbienteDto> GetAmbientiForUser(AppUser user)
    {
        // SuperAdmin vede tutti gli ambienti attivi
        if (user.Role == "SuperAdmin")
        {
            return _db.Ambienti
                .Where(a => a.IsActive)
                .OrderBy(a => a.CodiceContratto)
                .Select(a => new AmbienteDto(a.Id, a.CodiceContratto, a.Descrizione))
                .ToList();
        }

        // Gli altri vedono solo gli ambienti a cui sono associati
        return (from ua in _db.UserAmbienti
                join a in _db.Ambienti on ua.AmbienteId equals a.Id
                where ua.UserId == user.Id && a.IsActive
                orderby a.CodiceContratto
                select new AmbienteDto(a.Id, a.CodiceContratto, a.Descrizione))
               .ToList();
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

        // Preserva l'ambienteId corrente dal vecchio token (se presente)
        var currentAmbienteId = 0;
        if (request.CurrentToken != null)
        {
            try
            {
                var handler = new JwtSecurityTokenHandler();
                var jwt = handler.ReadJwtToken(request.CurrentToken);
                var claim = jwt.Claims.FirstOrDefault(c => c.Type == "ambienteId");
                if (claim != null) currentAmbienteId = int.Parse(claim.Value);
            }
            catch { /* ignora token malformato */ }
        }

        var newJwt = GenerateToken(user, currentAmbienteId);
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
        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin"))
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

    // ============================================================
    // Delete USERS (pagina Utenti ✅)
    // ============================================================
    [HttpDelete("users/{id}")]
    [Authorize]
    public IActionResult DeleteUser(int id)
    {
        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin"))
            return Forbid();

        var user = _db.Users.FirstOrDefault(u => u.Id == id);

        if (user == null)
            return NotFound("Utente non trovato");

        _db.Users.Remove(user);
        _db.SaveChanges();

        return Ok(new { message = "Utente eliminato" });
    }

    // ============================================================
    // PUT /api/auth/users/{id}/role — cambia ruolo utente
    // ============================================================
    [HttpPut("users/{id}/role")]
    [Authorize]
    public IActionResult UpdateUserRole(int id, [FromBody] UpdateRoleRequest request)
    {
        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin"))
            return Forbid();

        var validRoles = new[] { "Admin", "Editor", "SuperAdmin" };
        if (!validRoles.Contains(request.Role))
            return BadRequest("Ruolo non valido. Valori accettati: SuperAdmin, Admin, Editor");

        var user = _db.Users.FirstOrDefault(u => u.Id == id);
        if (user == null)
            return NotFound("Utente non trovato");

        user.Role = request.Role;
        _db.SaveChanges();

        return Ok(new { id = user.Id, username = user.Username, role = user.Role });
    }

    [HttpPost("users")]
    [Authorize]
    public IActionResult CreateUser([FromBody] CreateUserRequest request)
    {
        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin"))
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
        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin"))
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
        if (!User.IsInRole("Admin") && !User.IsInRole("SuperAdmin"))
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
    private string GenerateToken(AppUser user, int ambienteId = 0)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var expires = DateTime.UtcNow.AddMinutes(60);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("fullName", user.FullName),
            new Claim("ambienteId", ambienteId.ToString())
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

// ============================================================
// EMERGENCY RESET — ripristina password admin
// Protetto da chiave segreta, da rimuovere dopo l'uso
// ============================================================
[ApiController]
[Route("api/auth")]
public class EmergencyController : ControllerBase
{
    private readonly AppDbContext _db;
    private const string EmergencyKey = "MEV-RESET-2025-Capgemini";

    public EmergencyController(AppDbContext db) { _db = db; }

    [HttpPost("emergency-reset")]
    [AllowAnonymous]
    public async Task<IActionResult> EmergencyReset([FromBody] EmergencyResetRequest req)
    {
        if (req.Key != EmergencyKey)
            return Unauthorized(new { message = "Chiave non valida" });

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == "MSTEFANE");
        if (user == null)
        {
            // Crea utente se non esiste
            user = new AppUser
            {
                Username     = "MSTEFANE",
                FullName     = "Mauro Stefanelli",
                Email        = "mauro.stefanelli@capgemini.com",
                Role         = "Admin",
                IsActive     = true,
                SendEmail    = false,
            };
            _db.Users.Add(user);
        }
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await _db.SaveChangesAsync();
        return Ok(new { message = $"Password aggiornata per {user.Username}" });
    }
}

public record EmergencyResetRequest(string Key, string NewPassword);


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
public record RefreshRequest(string RefreshToken, string? CurrentToken = null);
public record UpdateRoleRequest(string Role);
public record SwitchAmbienteRequest(int AmbienteId);
public record AmbienteDto(int Id, string CodiceContratto, string Descrizione);