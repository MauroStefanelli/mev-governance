using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// ✅ CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

// ✅ DB — PostgreSQL su Render/Supabase, SQLite in locale
// Usa DATABASE_DIRECT_URL per runtime (supporta Migrate), fallback su DATABASE_URL
var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_DIRECT_URL")
               ?? Environment.GetEnvironmentVariable("DATABASE_URL");

string ConvertToNpgsql(string url)
{
    if (url.StartsWith("postgres://") || url.StartsWith("postgresql://"))
    {
        var uri      = new Uri(url);
        var userInfo = uri.UserInfo.Split(':', 2);
        var user     = Uri.UnescapeDataString(userInfo[0]);
        var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
        var host     = uri.Host;
        var port     = uri.Port > 0 ? uri.Port : 5432;
        var dbName   = uri.AbsolutePath.TrimStart('/');
        return $"Host={host};Port={port};Database={dbName};Username={user};Password={password};SSL Mode=Require;Trust Server Certificate=true";
    }
    return url;
}

if (!string.IsNullOrEmpty(databaseUrl))
{
    var npgsqlConn = ConvertToNpgsql(databaseUrl);
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(npgsqlConn));
}
else
{
    // SQLite locale
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

// ✅ CREA DB + SEED ADMIN tramite Migrations
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    // Protezione contro DROP TABLE manuale: se la tabella MevItems non esiste
    // (la migration è già segnata come applicata ma la tabella è stata eliminata),
    // la ricrea eseguendo lo script SQL direttamente.
    try
    {
        db.MevItems.Count(); // test di esistenza
    }
    catch
    {
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""MevItems"" (
                ""Id""             SERIAL        PRIMARY KEY,
                ""ExcelId""        TEXT          NOT NULL DEFAULT '',
                ""ExcelOrder""     INTEGER       NOT NULL DEFAULT 0,
                ""GoTo""           TEXT          NOT NULL DEFAULT '',
                ""Applicativo""    TEXT          NOT NULL DEFAULT '',
                ""Descrizione""    TEXT          NOT NULL DEFAULT '',
                ""AnnoCompetenza"" INTEGER       NOT NULL DEFAULT 0,
                ""Stato""          TEXT          NOT NULL DEFAULT '',
                ""ImportoExcel""   NUMERIC(18,2) NOT NULL DEFAULT 0,
                ""PAnno""          INTEGER       NOT NULL DEFAULT 0,
                ""PRelease""       TEXT          NOT NULL DEFAULT '',
                ""PImporto""       NUMERIC(18,2) NOT NULL DEFAULT 0,
                ""PNote""          TEXT
            );
        ");
    }

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

app.MapGet("/", () => Results.Ok("MEV Backend is running"));
app.MapControllers();

app.Run();
