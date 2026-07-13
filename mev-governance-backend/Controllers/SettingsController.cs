using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Npgsql;
using System.Text.Json;
using MevGovernanceBackend.Data;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/settings")]
[Authorize(Roles = "Admin")]
public class SettingsController : ControllerBase
{
    private const string ConfigFile = "/data/db-config.json";
    private readonly AppDbContext _db;

    public SettingsController(AppDbContext db)
    {
        _db = db;
    }

    // GET /api/settings/app  — legge le impostazioni applicative (es. LogoutMinutes)
    [HttpGet("app")]
    public IActionResult GetAppSettings()
    {
        var s = _db.AppSettings.FirstOrDefault(x => x.Id == 1);
        return Ok(new { logoutMinutes = s?.LogoutMinutes ?? 60 });
    }

    // PUT /api/settings/app  — salva le impostazioni applicative
    [HttpPut("app")]
    public IActionResult SetAppSettings([FromBody] AppSettingsDto dto)
    {
        var s = _db.AppSettings.FirstOrDefault(x => x.Id == 1);
        if (s == null) { s = new MevGovernanceBackend.Models.AppSettings { Id = 1 }; _db.AppSettings.Add(s); }
        s.LogoutMinutes = dto.LogoutMinutes > 0 ? dto.LogoutMinutes : 60;
        _db.SaveChanges();
        return Ok(new { message = "Impostazioni salvate", logoutMinutes = s.LogoutMinutes });
    }

    [HttpGet("db-config")]
    public IActionResult GetDbConfig()
    {
        // Priorità 1: file db-config.json (configurazione manuale salvata)
        if (System.IO.File.Exists(ConfigFile))
        {
            var json = System.IO.File.ReadAllText(ConfigFile);
            var config = JsonSerializer.Deserialize<DbConfigDto>(json);
            if (config != null)
                return Ok(new
                {
                    provider     = config.Provider,
                    sqlitePath   = config.SqlitePath,
                    host         = config.Host,
                    port         = config.Port,
                    database     = config.Database,
                    username     = config.Username,
                    passwordSet  = !string.IsNullOrEmpty(config.Password),
                    readonlyEnv  = false
                });
        }

        // Priorità 2: variabile d'ambiente DATABASE_DIRECT_URL o DATABASE_URL
        var dbUrl = Environment.GetEnvironmentVariable("DATABASE_DIRECT_URL")
                 ?? Environment.GetEnvironmentVariable("DATABASE_URL");

        if (!string.IsNullOrEmpty(dbUrl))
        {
            try
            {
                var uri      = new Uri(dbUrl);
                var userInfo = uri.UserInfo.Split(':', 2);
                var user     = Uri.UnescapeDataString(userInfo[0]);
                var host     = uri.Host;
                var port     = uri.Port > 0 ? uri.Port : 5432;
                var dbName   = uri.AbsolutePath.TrimStart('/');

                return Ok(new
                {
                    provider    = "postgresql",
                    sqlitePath  = (string?)null,
                    host,
                    port        = (int?)port,
                    database    = dbName,
                    username    = user,
                    passwordSet = userInfo.Length > 1 && !string.IsNullOrEmpty(userInfo[1]),
                    readonlyEnv = true   // indica che viene da env var, non modificabile via UI
                });
            }
            catch { /* fallback sotto */ }
        }

        // Nessuna configurazione trovata: default SQLite
        return Ok(new
        {
            provider    = "sqlite",
            sqlitePath  = "/data/mev.db",
            host        = (string?)null,
            port        = (int?)null,
            database    = (string?)null,
            username    = (string?)null,
            passwordSet = false,
            readonlyEnv = false
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

    [HttpPost("test-db")]
    public async Task<IActionResult> TestDb([FromBody] DbConfigDto dto)
    {
        try
        {
            // Se readonlyEnv, ignora i dati del form e usa direttamente la variabile d'ambiente
            if (dto.ReadonlyEnv == true)
            {
                var dbUrl = (Environment.GetEnvironmentVariable("DATABASE_DIRECT_URL")
                          ?? Environment.GetEnvironmentVariable("DATABASE_URL"))?.Trim();

                if (string.IsNullOrEmpty(dbUrl))
                    return Ok(new { success = false, message = "Variabile DATABASE_DIRECT_URL non trovata" });

                var connStr = ParsePostgresUrl(dbUrl);
                using var conn = new NpgsqlConnection(connStr);
                await conn.OpenAsync();
                await conn.CloseAsync();
                return Ok(new { success = true, message = "Connessione PostgreSQL (env var) riuscita" });
            }

            if (dto.Provider == "sqlite")
            {
                var path = dto.SqlitePath ?? "/data/mev.db";
                var dir = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(dir) && !System.IO.Directory.Exists(dir))
                    return Ok(new { success = false, message = $"La directory {dir} non esiste" });

                using var conn = new SqliteConnection($"Data Source={path}");
                await conn.OpenAsync();
                await conn.CloseAsync();
                return Ok(new { success = true, message = "Connessione SQLite riuscita" });
            }
            else if (dto.Provider == "postgresql")
            {
                var port = dto.Port ?? 5432;
                var connStr = $"Host={dto.Host};Port={port};Database={dto.Database};Username={dto.Username};Password={dto.Password};SSL Mode=Require;Trust Server Certificate=true";

                using var conn = new NpgsqlConnection(connStr);
                await conn.OpenAsync();
                await conn.CloseAsync();
                return Ok(new { success = true, message = "Connessione PostgreSQL riuscita" });
            }

            return Ok(new { success = false, message = "Provider non supportato" });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, message = ex.Message });
        }
    }

    private static string ParsePostgresUrl(string url)
    {
        var s = url;
        if (s.StartsWith("postgresql://")) s = s.Substring("postgresql://".Length);
        else if (s.StartsWith("postgres://"))  s = s.Substring("postgres://".Length);

        var atIndex  = s.LastIndexOf('@');
        var userInfo = s.Substring(0, atIndex);
        var hostPart = s.Substring(atIndex + 1);

        var colonIdx = userInfo.IndexOf(':');
        var user     = colonIdx >= 0 ? userInfo.Substring(0, colonIdx) : userInfo;
        var password = colonIdx >= 0 ? userInfo.Substring(colonIdx + 1) : "";

        var slashIdx = hostPart.IndexOf('/');
        var hostPort = slashIdx >= 0 ? hostPart.Substring(0, slashIdx) : hostPart;
        var dbName   = slashIdx >= 0 ? hostPart.Substring(slashIdx + 1) : "postgres";

        var qIdx = dbName.IndexOf('?');
        if (qIdx >= 0) dbName = dbName.Substring(0, qIdx);

        var portIdx = hostPort.LastIndexOf(':');
        var host = portIdx >= 0 ? hostPort.Substring(0, portIdx) : hostPort;
        var port = portIdx >= 0 ? hostPort.Substring(portIdx + 1) : "5432";

        return $"Host={host};Port={port};Database={dbName};Username={user};Password={password};SSL Mode=Require;Trust Server Certificate=true";
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
    public bool? ReadonlyEnv { get; set; }
}

public class AppSettingsDto
{
    public int LogoutMinutes { get; set; } = 60;
}
