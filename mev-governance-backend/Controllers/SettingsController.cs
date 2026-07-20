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

    [HttpGet("db-config")]
    public IActionResult GetDbConfig()
    {
        // Se DATABASE_DIRECT_URL è presente → Render, sola lettura
        var envUrl = Environment.GetEnvironmentVariable("DATABASE_DIRECT_URL")
                  ?? Environment.GetEnvironmentVariable("DATABASE_URL");
        if (!string.IsNullOrEmpty(envUrl))
        {
            // Estrae host/db dall'URL per mostrarlo in UI (senza password)
            try
            {
                // formato: postgres://user:pwd@host:port/db
                var s = envUrl;
                if (s.StartsWith("postgresql://")) s = s.Substring("postgresql://".Length);
                else if (s.StartsWith("postgres://"))  s = s.Substring("postgres://".Length);
                var atIdx    = s.LastIndexOf('@');
                var hostPart = atIdx >= 0 ? s.Substring(atIdx + 1) : s;
                var slashIdx = hostPart.IndexOf('/');
                var hostPort = slashIdx >= 0 ? hostPart.Substring(0, slashIdx) : hostPart;
                var dbName   = slashIdx >= 0 ? hostPart.Substring(slashIdx + 1) : "";
                var portIdx  = hostPort.LastIndexOf(':');
                var host     = portIdx >= 0 ? hostPort.Substring(0, portIdx) : hostPort;
                var port     = portIdx >= 0 ? (int?)int.Parse(hostPort.Substring(portIdx + 1)) : 5432;
                return Ok(new { provider = "postgresql", host, port, database = dbName,
                                username = (string?)null, passwordSet = true,
                                sslMode = "require", readonlyEnv = true });
            }
            catch
            {
                return Ok(new { provider = "postgresql", readonlyEnv = true, passwordSet = true, sslMode = "require" });
            }
        }

        if (!System.IO.File.Exists(ConfigFile))
        {
            return Ok(new
            {
                provider = "sqlite",
                sqlitePath = "/data/mev.db",
                host = (string?)null,
                port = (int?)null,
                database = (string?)null,
                username = (string?)null,
                passwordSet = false,
                sslMode = "disable",
                readonlyEnv = false
            });
        }

        var json = System.IO.File.ReadAllText(ConfigFile);
        var config = JsonSerializer.Deserialize<DbConfigDto>(json);
        if (config == null)
            return Ok(new { provider = "sqlite", readonlyEnv = false });

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

                var connStr = $"Host={dto.Host};Port={port};Database={dto.Database};Username={dto.Username};Password={dto.Password};{ssl}";

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

