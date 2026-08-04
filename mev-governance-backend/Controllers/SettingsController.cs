using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Npgsql;
using System.Text.Json;
using MevGovernanceBackend.Data;

namespace MevGovernanceBackend.Controllers;


[ApiController]
[Route("api/settings")]
[Authorize(Policy = "AdminOrSuper")]
public class SettingsController : ControllerBase
{
    private const string ConfigFile = "/data/db-config.json";
    private readonly AppDbContext _db;

    public SettingsController(AppDbContext db)
    {
        _db = db;
    }

    // ── App Settings (logoutMinutes, ecc.) ────────────────────────────────────

    [HttpGet("app")]
    public IActionResult GetAppSettings()
    {
        var s = _db.AppSettings.FirstOrDefault(x => x.Id == 1);
        if (s == null) return Ok(new { logoutMinutes = 60 });
        return Ok(new { logoutMinutes = s.LogoutMinutes });
    }

    [HttpPut("app")]
    public IActionResult SetAppSettings([FromBody] AppSettingsDto dto)
    {
        var s = _db.AppSettings.FirstOrDefault(x => x.Id == 1);
        if (s == null)
        {
            s = new MevGovernanceBackend.Models.AppSettings { Id = 1, LogoutMinutes = dto.LogoutMinutes };
            _db.AppSettings.Add(s);
        }
        else
        {
            s.LogoutMinutes = dto.LogoutMinutes;
        }
        _db.SaveChanges();
        return Ok(new { logoutMinutes = s.LogoutMinutes });
    }

    // ── TOW Impatto (% impatto per contratto) — condiviso tra tutti gli utenti ─

    [HttpGet("tow-impatto")]
    [Authorize] // tutti gli utenti autenticati possono leggere
    public IActionResult GetTowImpatto()
    {
        var s = _db.AppSettings.FirstOrDefault(x => x.Id == 1);
        var json = s?.TowImpattoJson;
        if (string.IsNullOrEmpty(json)) return Ok(new { });
        try { return Content(json, "application/json"); }
        catch { return Ok(new { }); }
    }

    [HttpPut("tow-impatto")]
    public IActionResult SetTowImpatto([FromBody] object dto)
    {
        var json = JsonSerializer.Serialize(dto);
        var s = _db.AppSettings.FirstOrDefault(x => x.Id == 1);
        if (s == null)
        {
            s = new MevGovernanceBackend.Models.AppSettings { Id = 1, TowImpattoJson = json };
            _db.AppSettings.Add(s);
        }
        else
        {
            s.TowImpattoJson = json;
        }
        _db.SaveChanges();
        return Ok(new { message = "Configurazione impatto salvata" });
    }

    [HttpGet("db-config")]
    public IActionResult GetDbConfig()
    {
        // Se esiste db-config.json, usalo (ha priorità assoluta)
        if (System.IO.File.Exists(ConfigFile))
        {
            var json = System.IO.File.ReadAllText(ConfigFile);
            var config = JsonSerializer.Deserialize<DbConfigDto>(json);
            if (config != null)
            {
                return Ok(new
                {
                    provider    = config.Provider,
                    sqlitePath  = config.SqlitePath,
                    host        = config.Host,
                    port        = config.Port,
                    database    = config.Database,
                    username    = config.Username,
                    passwordSet = !string.IsNullOrEmpty(config.Password),
                    sslMode     = config.SslMode ?? "disable",
                    readonlyEnv = false,
                    isRender    = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DATABASE_DIRECT_URL"))
                });
            }
        }

        // Nessun file: prepopola da DATABASE_DIRECT_URL se presente (default Render)
        var envUrl = (Environment.GetEnvironmentVariable("DATABASE_DIRECT_URL")
                   ?? Environment.GetEnvironmentVariable("DATABASE_URL"))?.Trim();

        if (!string.IsNullOrEmpty(envUrl))
        {
            try
            {
                var s = envUrl;
                if (s.StartsWith("postgresql://")) s = s.Substring("postgresql://".Length);
                else if (s.StartsWith("postgres://"))  s = s.Substring("postgres://".Length);
                var atIdx    = s.LastIndexOf('@');
                var userInfo = atIdx >= 0 ? s.Substring(0, atIdx) : "";
                var hostPart = atIdx >= 0 ? s.Substring(atIdx + 1) : s;
                var colonIdx = userInfo.IndexOf(':');
                var user     = colonIdx >= 0 ? userInfo.Substring(0, colonIdx) : userInfo;
                var slashIdx = hostPart.IndexOf('/');
                var hostPort = slashIdx >= 0 ? hostPart.Substring(0, slashIdx) : hostPart;
                var dbName   = slashIdx >= 0 ? hostPart.Substring(slashIdx + 1) : "";
                var qIdx     = dbName.IndexOf('?'); if (qIdx >= 0) dbName = dbName.Substring(0, qIdx);
                var portIdx  = hostPort.LastIndexOf(':');
                var host     = portIdx >= 0 ? hostPort.Substring(0, portIdx) : hostPort;
                var port     = portIdx >= 0 ? (int?)int.Parse(hostPort.Substring(portIdx + 1)) : 5432;
                return Ok(new { provider = "postgresql", host, port, database = dbName,
                                username = user, passwordSet = true,
                                sslMode = "require", readonlyEnv = false, isRender = true });
            }
            catch { }
        }

        // Default: SQLite locale
        return Ok(new
        {
            provider    = "sqlite",
            sqlitePath  = "/data/mev.db",
            host        = (string?)null,
            port        = (int?)null,
            database    = (string?)null,
            username    = (string?)null,
            passwordSet = false,
            sslMode     = "disable",
            readonlyEnv = false,
            isRender    = false
        });
    }

    [HttpPut("db-config")]
    public IActionResult SetDbConfig([FromBody] DbConfigDto dto)
    {
        var dir = Path.GetDirectoryName(ConfigFile);
        if (!string.IsNullOrEmpty(dir) && !System.IO.Directory.Exists(dir))
            System.IO.Directory.CreateDirectory(dir);

        var json = JsonSerializer.Serialize(dto, new JsonSerializerOptions { WriteIndented = true });
        System.IO.File.WriteAllText(ConfigFile, json);

        return Ok(new { message = "Configurazione salvata. Riavvia il backend per applicare le modifiche." });
    }


    [HttpPost("restart")]
    public IActionResult Restart()
    {
        _ = Task.Run(async () =>
        {
            await Task.Delay(500);
            Environment.Exit(0);
        });
        return Ok(new { message = "Riavvio in corso..." });
    }

    [HttpPost("test-db")]
    public async Task<IActionResult> TestDb([FromBody] DbConfigDto dto)
    {
        try
        {
            if (dto.Provider == "sqlite")
            {
                var path = dto.SqlitePath ?? "/data/mev.db";

                using var conn = new SqliteConnection($"Data Source={path}");
                await conn.OpenAsync();
                await conn.CloseAsync();

                return Ok(new { success = true, message = "Connessione SQLite riuscita" });
            }
            else if (dto.Provider == "postgresql")
            {
                var port = dto.Port ?? 5432;
                var ssl = dto.SslMode switch {
                    "require" => "SSL Mode=Require;Trust Server Certificate=true",
                    "prefer"  => "SSL Mode=Prefer",
                    _         => "SSL Mode=Disable",
                };

                // Se la password non è stata inviata dal form (campo lasciato vuoto),
                // prova a recuperarla dalla configurazione persistente (file o env var).
                var password = dto.Password;
                if (string.IsNullOrEmpty(password))
                {
                    // 1) Prova dal file db-config.json
                    if (System.IO.File.Exists(ConfigFile))
                    {
                        try
                        {
                            var saved = JsonSerializer.Deserialize<DbConfigDto>(System.IO.File.ReadAllText(ConfigFile));
                            if (!string.IsNullOrEmpty(saved?.Password))
                                password = saved.Password;
                        }
                        catch { }
                    }

                    // 2) Fallback: estrai la password da DATABASE_DIRECT_URL
                    if (string.IsNullOrEmpty(password))
                    {
                        var envUrl = (Environment.GetEnvironmentVariable("DATABASE_DIRECT_URL")
                                   ?? Environment.GetEnvironmentVariable("DATABASE_URL"))?.Trim();
                        if (!string.IsNullOrEmpty(envUrl))
                        {
                            try
                            {
                                var s2 = envUrl;
                                if (s2.StartsWith("postgresql://")) s2 = s2.Substring("postgresql://".Length);
                                else if (s2.StartsWith("postgres://"))  s2 = s2.Substring("postgres://".Length);
                                var atIdx2   = s2.LastIndexOf('@');
                                var userInfo = atIdx2 >= 0 ? s2.Substring(0, atIdx2) : "";
                                var colonIdx = userInfo.IndexOf(':');
                                if (colonIdx >= 0)
                                    password = Uri.UnescapeDataString(userInfo.Substring(colonIdx + 1));
                            }
                            catch { }
                        }
                    }
                }

                var connStr = $"Host={dto.Host};Port={port};Database={dto.Database};Username={dto.Username};Password={password};{ssl}";

                Console.WriteLine("===== TEST-DB =====");
                Console.WriteLine(connStr);

                using var conn = new NpgsqlConnection(connStr);

                await conn.OpenAsync();
                await conn.CloseAsync();

                return Ok(new
                {
                    success = true,
                    message = "Connessione PostgreSQL riuscita"
                });
            }

            return Ok(new
            {
                success = false,
                message = "Provider non supportato"
            });
        }
        catch (Exception ex)
        {
            return Ok(new
            {
                success = false,
                message = ex.Message
            });
        }
    }
}
public class DbConfigDto
{
    public string Provider { get; set; } = "sqlite";
    public string? SqlitePath { get; set; } = "/data/mev.db";
    public string? Host { get; set; }
    public int? Port { get; set; }
    public string? Database { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    // "disable" (default) | "require" | "prefer"
    public string SslMode { get; set; } = "disable";
}

public class AppSettingsDto
{
    public int LogoutMinutes { get; set; } = 60;
}


