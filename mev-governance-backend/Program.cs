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
                DbConfigConnectionString = $"Host={cfg.Host};Port={port};Database={cfg.Database};Username={cfg.Username};Password={cfg.Password};SSL Mode=Require;Trust Server Certificate=true";
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
        // Npgsql NON accetta URL postgresql:// direttamente — va parsata in key=value
        var uri      = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);
        var user     = Uri.UnescapeDataString(userInfo[0]);
        var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
        var host     = uri.Host;
        var port     = uri.Port > 0 ? uri.Port : 5432;
        var dbName   = uri.AbsolutePath.TrimStart('/');
        connStr = $"Host={host};Port={port};Database={dbName};Username={user};Password={password};SSL Mode=Require;Trust Server Certificate=true";
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

var app = builder.Build();

app.UseCors("FrontendPolicy");

// ✅ CREA DB + SEED ADMIN
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

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
