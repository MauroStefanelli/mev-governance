using Microsoft.Data.Sqlite;
using Npgsql;
using System.Text.Json;

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
                passwordSet = false
            });
        }

        var json = System.IO.File.ReadAllText(ConfigFile);
        var config = JsonSerializer.Deserialize<DbConfigDto>(json);
        if (config == null)
            return Ok(new { provider = "sqlite" });

        return Ok(new
        {
            config.Provider,
            config.SqlitePath,
            config.Host,
            config.Port,
            config.Database,
            config.Username,
            passwordSet = !string.IsNullOrEmpty(config.Password)
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

                var connStr =
                    $"Host={dto.Host};Port={port};Database={dto.Database};Username={dto.Username};Password={dto.Password};SSL Mode=Disable";

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
}

