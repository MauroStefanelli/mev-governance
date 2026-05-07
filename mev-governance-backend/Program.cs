using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
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
var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
if (!string.IsNullOrEmpty(databaseUrl))
{
    // Converti URI postgres:// in formato Npgsql key=value
    string npgsqlConn = databaseUrl;
    if (databaseUrl.StartsWith("postgres://") || databaseUrl.StartsWith("postgresql://"))
    {
        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':');
        var user     = userInfo[0];
        var password = userInfo.Length > 1 ? userInfo[1] : "";
        var host     = uri.Host;
        var port     = uri.Port > 0 ? uri.Port : 5432;
        var db       = uri.AbsolutePath.TrimStart('/');
        npgsqlConn   = $"Host={host};Port={port};Database={db};Username={user};Password={password};SSL Mode=Require;Trust Server Certificate=true";
    }
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

var app = builder.Build();

app.UseCors("FrontendPolicy");

// ✅ CREA DB + SEED ADMIN
// Usa DATABASE_DIRECT_URL (connessione diretta, no pooler) per EnsureCreated
// se non disponibile, usa DATABASE_URL normale
using (var scope = app.Services.CreateScope())
{
    var directUrl = Environment.GetEnvironmentVariable("DATABASE_DIRECT_URL");
    AppDbContext db;

    if (!string.IsNullOrEmpty(directUrl))
    {
        // Crea un DbContext temporaneo con connessione diretta per creare lo schema
        string directConn = directUrl;
        if (directUrl.StartsWith("postgres://") || directUrl.StartsWith("postgresql://"))
        {
            var uri = new Uri(directUrl);
            var userInfo = uri.UserInfo.Split(':');
            var user     = userInfo[0];
            var password = userInfo.Length > 1 ? userInfo[1] : "";
            var host     = uri.Host;
            var port     = uri.Port > 0 ? uri.Port : 5432;
            var dbName   = uri.AbsolutePath.TrimStart('/');
            directConn   = $"Host={host};Port={port};Database={dbName};Username={user};Password={password};SSL Mode=Require;Trust Server Certificate=true";
        }
        var directOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(directConn)
            .Options;
        db = new AppDbContext(directOptions);
    }
    else
    {
        db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    }

    using (db)
    {
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
}

app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => Results.Ok("MEV Backend is running"));
app.MapControllers();

app.Run();
