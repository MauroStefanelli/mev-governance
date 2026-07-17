using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using MevGovernanceBackend.Controllers;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// ✅ DB — caricato da db-config.json se presente, altrimenti env var
string? DbConfigConnectionString = null;
bool DbConfigIsPostgres = false;

var dbConfigFile = "/data/db-config.json";
if (File.Exists(dbConfigFile))
{
    try
    {
        var json = File.ReadAllText(dbConfigFile);
        var cfg = JsonSerializer.Deserialize<DbConfigDto>(json);
        if (cfg != null)
        {
            if (cfg.Provider == "postgresql" && !string.IsNullOrEmpty(cfg.Host) && !string.IsNullOrEmpty(cfg.Database))
            {
                var port = cfg.Port ?? 5432;
                // DbConfigConnectionString = $"Host={cfg.Host};Port={port};Database={cfg.Database};Username={cfg.Username};Password={cfg.Password};SSL Mode=Require;Trust Server Certificate=true";
                DbConfigConnectionString = $"Host={cfg.Host};Port={port};Database={cfg.Database};Username={cfg.Username};Password={cfg.Password};SSL Mode=Disable;
                DbConfigIsPostgres = true;
            }
            else if (cfg.Provider == "sqlite")
            {
                DbConfigConnectionString = $"Data Source={cfg.SqlitePath ?? "/data/mev.db"}";
            }
        }
    }
    catch { /* fallback a env */ }
}

// ✅ CORS
var allowedOrigins = new List<string>
{
    "https://mev-governance-frontend.onrender.com",
    "http://localhost:3000",
    "http://localhost:8082",
};

// Permette di aggiungere origini aggiuntive via variabile d'ambiente
var extraOrigins = Environment.GetEnvironmentVariable("CORS_ORIGINS");
if (!string.IsNullOrEmpty(extraOrigins))
    allowedOrigins.AddRange(extraOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigins.ToArray())
        .AllowAnyHeader()
        .AllowAnyMethod();
    });
});

// ✅ DB
var databaseUrl = (Environment.GetEnvironmentVariable("DATABASE_DIRECT_URL")
               ?? Environment.GetEnvironmentVariable("DATABASE_URL"))
               ?.Trim(); // rimuove spazi, newline e altri caratteri invisibili

if (DbConfigConnectionString != null && DbConfigIsPostgres)
{
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(DbConfigConnectionString));
}
else if (DbConfigConnectionString != null)
{
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlite(DbConfigConnectionString));
}
else if (!string.IsNullOrEmpty(databaseUrl))
{
    string connStr;
    if (databaseUrl.StartsWith("postgres://") || databaseUrl.StartsWith("postgresql://"))
    {
        connStr = ParsePostgresUrl(databaseUrl);
    }
    else
    {
        connStr = databaseUrl;
    }
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(connStr));
}
else
{
    var dbPath = Environment.GetEnvironmentVariable("DATABASE_PATH") ?? "mev.db";
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlite($"Data Source={dbPath}"));
}


// Parsing manuale della URL postgresql:// senza usare System.Uri
// (Uri.UserInfo può perdere la password in certi casi)
static string ParsePostgresUrl(string url)
{
    // Rimuove il prefisso postgres:// o postgresql://
    var s = url;
    if (s.StartsWith("postgresql://")) s = s.Substring("postgresql://".Length);
    else if (s.StartsWith("postgres://"))  s = s.Substring("postgres://".Length);

    // Separa userinfo@host dalla parte host
    // formato: user:password@host:port/dbname
    var atIndex = s.LastIndexOf('@');
    var userInfo = s.Substring(0, atIndex);         // user:password
    var hostPart = s.Substring(atIndex + 1);        // host:port/dbname

    // Estrae user e password — usa LastIndexOf per sicurezza
    var colonIdx = userInfo.IndexOf(':');
    var user     = colonIdx >= 0 ? userInfo.Substring(0, colonIdx) : userInfo;
    var password = colonIdx >= 0 ? userInfo.Substring(colonIdx + 1) : "";

    // Estrae host, port e dbname
    var slashIdx = hostPart.IndexOf('/');
    var hostPort = slashIdx >= 0 ? hostPart.Substring(0, slashIdx) : hostPart;
    var dbName   = slashIdx >= 0 ? hostPart.Substring(slashIdx + 1) : "postgres";

    // Rimuove eventuali query string dal dbName
    var qIdx = dbName.IndexOf('?');
    if (qIdx >= 0) dbName = dbName.Substring(0, qIdx);

    var portIdx = hostPort.LastIndexOf(':');
    var host = portIdx >= 0 ? hostPort.Substring(0, portIdx) : hostPort;
    var port = portIdx >= 0 ? hostPort.Substring(portIdx + 1) : "5432";

    return $"Host={host};Port={port};Database={dbName};Username={user};Password={password};SSL Mode=Disable;
    // return $"Host={host};Port={port};Database={dbName};Username={user};Password={password};SSL Mode=Require;Trust Server Certificate=true";
}

// ✅ JWT — usa variabile d'ambiente JWT_KEY se disponibile (Railway)
var jwtKey     = Environment.GetEnvironmentVariable("JWT_KEY")      ?? builder.Configuration["Jwt:Key"]!;
var jwtIssuer  = Environment.GetEnvironmentVariable("JWT_ISSUER")   ?? builder.Configuration["Jwt:Issuer"]!;
var jwtAudience= Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? builder.Configuration["Jwt:Audience"]!;

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ClockSkew                = TimeSpan.Zero, 
            ValidateIssuerSigningKey = true,
            ValidIssuer              = jwtIssuer,
            ValidAudience            = jwtAudience,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<EmailService>();
builder.Services.AddHttpClient();

var app = builder.Build();

app.UseCors("FrontendPolicy");

// ✅ CREA DB + SEED ADMIN
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        db.Database.Migrate(); // applica tutte le migration pendenti
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[MIGRATE ERROR] {ex.Message}");
        // Non crashare: il blocco SQL idempotente sotto copre i casi mancanti
        try { db.Database.EnsureCreated(); } catch (Exception ex2) {
            Console.Error.WriteLine($"[ENSURECREATED ERROR] {ex2.Message}");
        }
    }

    // Aggiunge colonne mancanti in modo idempotente (PostgreSQL)
    try
    {
        db.Database.ExecuteSqlRaw(@"
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AppSettings' AND column_name='LogoutMinutes') THEN
                    ALTER TABLE ""AppSettings"" ADD COLUMN ""LogoutMinutes"" INTEGER NOT NULL DEFAULT 60;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OrdiniConsegna' AND column_name='MeseAvanzamento') THEN
                    ALTER TABLE ""OrdiniConsegna"" ADD COLUMN ""MeseAvanzamento"" TEXT NOT NULL DEFAULT '';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OrdiniConsegna' AND column_name='QtaAvanzata') THEN
                    ALTER TABLE ""OrdiniConsegna"" ADD COLUMN ""QtaAvanzata"" TEXT NOT NULL DEFAULT '';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OrdiniConsegna' AND column_name='ImportoFatturabile') THEN
                    ALTER TABLE ""OrdiniConsegna"" ADD COLUMN ""ImportoFatturabile"" TEXT NOT NULL DEFAULT '';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OrdiniConsegna' AND column_name='Subappalto') THEN
                    ALTER TABLE ""OrdiniConsegna"" ADD COLUMN ""Subappalto"" TEXT NOT NULL DEFAULT '';
                END IF;
            END $$;
        ");
    }
    catch (Exception ex) { Console.Error.WriteLine($"[ALTER COLUMNS ERROR] {ex.Message}"); }

    // Crea OrdiniConsegna se non esiste (con tutte le colonne)
    try
    {
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""OrdiniConsegna"" (
                ""Id""                   SERIAL PRIMARY KEY,
                ""NumeroOrdine""         TEXT NOT NULL DEFAULT '',
                ""Data""                 TEXT NOT NULL DEFAULT '',
                ""DataConsegna""         TEXT NOT NULL DEFAULT '',
                ""RifContratto""         TEXT NOT NULL DEFAULT '',
                ""Art""                  TEXT NOT NULL DEFAULT '',
                ""Codice""               TEXT NOT NULL DEFAULT '',
                ""Descrizione""          TEXT NOT NULL DEFAULT '',
                ""TipoAtt""              TEXT NOT NULL DEFAULT '',
                ""Quantita""             TEXT NOT NULL DEFAULT '',
                ""Um""                   TEXT NOT NULL DEFAULT '',
                ""PrezzoNetto""          TEXT NOT NULL DEFAULT '',
                ""Importo""              TEXT NOT NULL DEFAULT '',
                ""NumeroRda""            TEXT NOT NULL DEFAULT '',
                ""Iniziativa""           TEXT NOT NULL DEFAULT '',
                ""Ap""                   TEXT NOT NULL DEFAULT '',
                ""Contratto""            TEXT NOT NULL DEFAULT '',
                ""NomePdf""              TEXT NOT NULL DEFAULT '',
                ""ImportatoIl""          TIMESTAMP NOT NULL DEFAULT NOW(),
                ""ImportatoDA""          TEXT NOT NULL DEFAULT '',
                ""MeseAvanzamento""      TEXT NOT NULL DEFAULT '',
                ""QtaAvanzata""          TEXT NOT NULL DEFAULT '',
                ""ImportoFatturabile""   TEXT NOT NULL DEFAULT '',
                ""Subappalto""           TEXT NOT NULL DEFAULT ''
            );
        ");
    }
    catch (Exception ex) { Console.Error.WriteLine($"[CREATE OrdiniConsegna ERROR] {ex.Message}"); }

    // Crea VerbaliAvanzamento se non esiste
    try
    {
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""VerbaliAvanzamento"" (
                ""Id""               SERIAL PRIMARY KEY,
                ""NomePdf""          TEXT NOT NULL DEFAULT '',
                ""MeseAvanzamento""  TEXT NOT NULL DEFAULT '',
                ""RigheElaborate""   INTEGER NOT NULL DEFAULT 0,
                ""RigheAggiornate""  INTEGER NOT NULL DEFAULT 0,
                ""CaricatoIl""       TIMESTAMP NOT NULL DEFAULT NOW(),
                ""CaricatoDa""       TEXT NOT NULL DEFAULT ''
            );
        ");
    }
    catch (Exception ex) { Console.Error.WriteLine($"[CREATE VerbaliAvanzamento ERROR] {ex.Message}"); }

    if (!db.Users.Any())
    {
        var adminPassword = Environment.GetEnvironmentVariable("ADMIN_PASSWORD") ?? "Admin2025!";
        db.Users.Add(new AppUser
        {
            Username     = "MSTEFANE",
            FullName     = "Mauro Stefanelli",
            Email        = "mauro.stefanelli@capgemini.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
            Role         = "Admin",
            IsActive     = true
        });
        db.SaveChanges();
    }
}

app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => Results.Ok("MEV Backend is running....."));
app.MapControllers();

app.Run();
