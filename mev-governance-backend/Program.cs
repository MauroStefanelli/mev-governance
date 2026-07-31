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
                var ssl = cfg.SslMode switch {
                    "require" => "SSL Mode=Require;Trust Server Certificate=true",
                    "prefer"  => "SSL Mode=Prefer",
                    _         => "SSL Mode=Disable;Trust Server Certificate=true",
                };
                DbConfigConnectionString = $"Host={cfg.Host};Port={port};Database={cfg.Database};Username={cfg.Username};Password={cfg.Password};{ssl}";
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
    "https://mev-governance-frontend-dev.onrender.com",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8082",
    "http://192.168.1.144:3000",
    "http://192.168.1.144:3001",
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
               ?.Trim();

// Schema PostgreSQL: "public" per prod (default), "dev" per sviluppo
var dbSchema = (Environment.GetEnvironmentVariable("DB_SCHEMA") ?? "public").Trim().ToLower();
// Rende lo schema disponibile come IConfiguration per il DbContext
builder.Configuration["DB_SCHEMA"] = dbSchema;
var isPostgres = false;

if (DbConfigConnectionString != null && DbConfigIsPostgres)
{
    isPostgres = true;
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(DbConfigConnectionString,
            npg => npg.MigrationsHistoryTable("__EFMigrationsHistory", dbSchema)));
}
else if (DbConfigConnectionString != null)
{
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlite(DbConfigConnectionString));
}
else if (!string.IsNullOrEmpty(databaseUrl))
{
    isPostgres = true;
    string connStr;
    if (databaseUrl.StartsWith("postgres://") || databaseUrl.StartsWith("postgresql://"))
        connStr = ParsePostgresUrl(databaseUrl, dbSchema);
    else
        connStr = databaseUrl;

    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(connStr,
            npg => npg.MigrationsHistoryTable("__EFMigrationsHistory", dbSchema)));
}
else
{
    var dbPath = Environment.GetEnvironmentVariable("DATABASE_PATH") ?? "mev.db";
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlite($"Data Source={dbPath}"));
}


// Parsing manuale della URL postgresql:// senza usare System.Uri
// (Uri.UserInfo può perdere la password in certi casi)
static string ParsePostgresUrl(string url, string schema = "public")
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

    // SSL: abilitato per qualsiasi host Supabase (direct e pooler), disabilitato per locale
    var isSupabase = host.Contains(".supabase.co") || host.Contains(".supabase.com");
    var sslMode = isSupabase
        ? "SSL Mode=Require;Trust Server Certificate=true"
        : "SSL Mode=Disable";

    // Disabilita il pooling lato Npgsql per il Session Pooler di Supabase
    // (il pooler gestisce lui le connessioni; il Transaction Pooler non supporta prepared statements)
    var noPool = host.Contains("pooler") ? ";No Reset On Close=true;Maximum Pool Size=5" : "";

    // Search Path: forza lo schema corretto (dev o public) per migration e query
    var searchPath = schema != "public" ? $";Search Path={schema},public" : "";

    return $"Host={host};Port={port};Database={dbName};Username={user};Password={password};{sslMode}{noPool}{searchPath}";
}

// ✅ JWT — usa variabile d'ambiente JWT_KEY se disponibile (Railway)
var jwtKey     = Environment.GetEnvironmentVariable("JWT_KEY")      ?? builder.Configuration["Jwt:Key"]!;
var jwtIssuer  = Environment.GetEnvironmentVariable("JWT_ISSUER")   ?? builder.Configuration["Jwt:Issuer"]!;
var jwtAudience= Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? builder.Configuration["Jwt:Audience"]!;
Console.WriteLine($"[JWT] Issuer={jwtIssuer} Audience={jwtAudience}");

// Sovrascrive i valori in IConfiguration così AuthController li legge correttamente
builder.Configuration["Jwt:Key"]      = jwtKey;
builder.Configuration["Jwt:Issuer"]   = jwtIssuer;
builder.Configuration["Jwt:Audience"] = jwtAudience;

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

builder.Services.AddAuthorization(options =>
{
    // SuperAdmin ha tutti i permessi di Admin, più i propri
    options.AddPolicy("AdminOrSuper", policy =>
        policy.RequireRole("Admin", "SuperAdmin"));
});
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

    // Valida lo schema: accetta solo lettere, numeri e underscore (no SQL injection)
    var sch = System.Text.RegularExpressions.Regex.IsMatch(dbSchema, @"^[a-zA-Z0-9_]+$")
        ? dbSchema : "public";

    // Se siamo su PostgreSQL e lo schema non è "public", lo creiamo prima delle migration
    if (isPostgres && sch != "public")
    {
        try
        {
#pragma warning disable EF1002
            db.Database.ExecuteSqlRaw($"CREATE SCHEMA IF NOT EXISTS \"{sch}\";");
#pragma warning restore EF1002
            Console.WriteLine($"[SCHEMA] Schema '{sch}' pronto.");
        }
        catch (Exception ex) { Console.Error.WriteLine($"[SCHEMA ERROR] {ex.Message}"); }
    }

    try
    {
        db.Database.Migrate(); // applica tutte le migration pendenti
        Console.WriteLine("[MIGRATE] Migration completata.");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[MIGRATE ERROR] {ex.Message}");
    }

    // Patch di sicurezza: aggiunge colonne mancanti se la migration non le ha create
    // e converte IsCatalogo da integer a boolean se necessario (SQLite→Postgres mismatch)
    if (isPostgres)
    {
        try
        {
#pragma warning disable EF1002
            db.Database.ExecuteSqlRaw($@"
                ALTER TABLE ""{sch}"".""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""Sconto"" numeric NOT NULL DEFAULT 0;
                ALTER TABLE ""{sch}"".""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""IsCatalogo"" boolean NOT NULL DEFAULT false;
            ");
            // Converte IsCatalogo da integer a boolean (DROP DEFAULT → CAST → SET DEFAULT)
            db.Database.ExecuteSqlRaw($@"
                DO $$
                BEGIN
                  IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = '{sch}'
                      AND table_name   = 'ConsumoTow'
                      AND column_name  = 'IsCatalogo'
                      AND data_type    = 'integer'
                  ) THEN
                    ALTER TABLE ""{sch}"".""ConsumoTow"" ALTER COLUMN ""IsCatalogo"" DROP DEFAULT;
                    ALTER TABLE ""{sch}"".""ConsumoTow"" ALTER COLUMN ""IsCatalogo"" TYPE boolean USING (""IsCatalogo""::integer::boolean);
                    ALTER TABLE ""{sch}"".""ConsumoTow"" ALTER COLUMN ""IsCatalogo"" SET DEFAULT false;
                  END IF;
                END$$;
            ");
            // Converte Sconto da TEXT a numeric (DROP DEFAULT → CAST → SET DEFAULT)
            db.Database.ExecuteSqlRaw($@"
                DO $$
                BEGIN
                  IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = '{sch}'
                      AND table_name   = 'ConsumoTow'
                      AND column_name  = 'Sconto'
                      AND data_type    = 'text'
                  ) THEN
                    ALTER TABLE ""{sch}"".""ConsumoTow"" ALTER COLUMN ""Sconto"" DROP DEFAULT;
                    ALTER TABLE ""{sch}"".""ConsumoTow"" ALTER COLUMN ""Sconto"" TYPE numeric USING (""Sconto""::numeric);
                    ALTER TABLE ""{sch}"".""ConsumoTow"" ALTER COLUMN ""Sconto"" SET DEFAULT 0;
                  END IF;
                END$$;
            ");
#pragma warning restore EF1002
            Console.WriteLine("[PATCH] Colonne Sconto/IsCatalogo verificate e corrette.");
        }
        catch (Exception ex) { Console.Error.WriteLine($"[PATCH ERROR] {ex.Message}"); }
    }

    // Seed admin — inserisce MSTEFANE se non esiste, aggiorna la password se esiste già
#pragma warning disable EF1002
    try
    {
        var adminPassword = Environment.GetEnvironmentVariable("ADMIN_PASSWORD") ?? "Admin2025!";
        var adminHash = BCrypt.Net.BCrypt.HashPassword(adminPassword);
        var saHash = BCrypt.Net.BCrypt.HashPassword("SA-Capgemini2026!");

        db.Database.ExecuteSqlRaw($@"
            -- Seed MSTEFANE (Admin)
            INSERT INTO ""{sch}"".""Users"" (""Username"",""FullName"",""Email"",""PasswordHash"",""Role"",""IsActive"",""SendEmail"")
            SELECT 'MSTEFANE','Mauro Stefanelli','mauro.stefanelli@capgemini.com',{{0}},'Admin',true,false
            WHERE NOT EXISTS (SELECT 1 FROM ""{sch}"".""Users"" WHERE ""Username""='MSTEFANE');
            UPDATE ""{sch}"".""Users"" SET ""PasswordHash""={{0}} WHERE ""Username""='MSTEFANE';

            -- Seed SuperAdmin (inserisce se non esiste, e corregge sempre il ruolo)
            INSERT INTO ""{sch}"".""Users"" (""Username"",""FullName"",""Email"",""PasswordHash"",""Role"",""IsActive"",""SendEmail"")
            SELECT 'SUPERADMIN','Super Amministratore','superadmin@mev-governance.local',{{1}},'SuperAdmin',true,false
            WHERE NOT EXISTS (SELECT 1 FROM ""{sch}"".""Users"" WHERE ""Username""='SUPERADMIN');
            UPDATE ""{sch}"".""Users"" SET ""Role""='SuperAdmin' WHERE ""Username""='SUPERADMIN';

            -- Seed Ambiente 4490015980
            INSERT INTO ""{sch}"".""Ambienti"" (""CodiceContratto"",""Descrizione"",""IsActive"",""CreatedAt"")
            SELECT '4490015980','Contratto principale',true,now()
            WHERE NOT EXISTS (SELECT 1 FROM ""{sch}"".""Ambienti"" WHERE ""CodiceContratto""='4490015980');

            -- Associa MSTEFANE all'ambiente come Admin
            INSERT INTO ""{sch}"".""UserAmbienti"" (""UserId"",""AmbienteId"",""Ruolo"")
            SELECT u.""Id"", a.""Id"", 'Admin'
            FROM ""{sch}"".""Users"" u, ""{sch}"".""Ambienti"" a
            WHERE u.""Username""='MSTEFANE' AND a.""CodiceContratto""='4490015980'
            AND NOT EXISTS (
                SELECT 1 FROM ""{sch}"".""UserAmbienti"" ua
                WHERE ua.""UserId""=u.""Id"" AND ua.""AmbienteId""=a.""Id""
            );
        ", adminHash, saHash);
        Console.WriteLine("[SEED] Utenti e Ambiente pronti.");
    }
    catch (Exception ex) { Console.Error.WriteLine($"[SEED ADMIN ERROR] {ex.Message}"); }
#pragma warning restore EF1002
}

app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => Results.Ok("MEV Backend is running....."));
app.MapGet("/version", () => Results.Ok(new { commit = "0fed4fe", built = DateTime.UtcNow.ToString("o") }));
app.MapControllers();

app.Run();
