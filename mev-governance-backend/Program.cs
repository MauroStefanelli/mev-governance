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
        policy.WithOrigins(
            "https://mev-governance-frontend.onrender.com"
        )
        .AllowAnyHeader()
        .AllowAnyMethod();
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

// ✅ CREA DB + SEED ADMIN tramite Migrations
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    // ── Protezione contro DROP TABLE manuale ──────────────────────────────────
    // Se le tabelle sono state cancellate manualmente ma __EFMigrationsHistory
    // esiste ancora, EF non le ricrea. Le verifichiamo e le ricreamo se mancanti.

    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS ""Users"" (
            ""Id""           SERIAL  PRIMARY KEY,
            ""Username""     TEXT    NOT NULL DEFAULT '',
            ""FullName""     TEXT    NOT NULL DEFAULT '',
            ""Email""        TEXT    NOT NULL DEFAULT '',
            ""PasswordHash"" TEXT    NOT NULL DEFAULT '',
            ""Role""         TEXT    NOT NULL DEFAULT 'Editor',
            ""IsActive""     BOOLEAN NOT NULL DEFAULT TRUE,
            ""SendEmail""    BOOLEAN NOT NULL DEFAULT FALSE,
            ""LastLogin""    TIMESTAMP,
            ""LastLogout""   TIMESTAMP,
            ""RefreshToken""      TEXT,
            ""RefreshTokenExpiry"" TIMESTAMP


        );

        CREATE TABLE IF NOT EXISTS ""MevItems"" (
            ""Id""             SERIAL        PRIMARY KEY,
            ""ExcelOrder""     INTEGER       NOT NULL DEFAULT 0,
            ""ExcelId""        TEXT          NOT NULL DEFAULT '',
            ""GoTo""           TEXT          NOT NULL DEFAULT '',
            ""Applicativo""    TEXT          NOT NULL DEFAULT '',
            ""Descrizione""    TEXT          NOT NULL DEFAULT '',
            ""AnnoCompetenza"" INTEGER       NOT NULL DEFAULT 0,
            ""Stato""          TEXT          NOT NULL DEFAULT '',
            ""ImportoExcel""   NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""NoteExcel""      TEXT,
            ""Bc""             TEXT,
            ""Contratto""      TEXT,
            ""AtId""           TEXT,
            ""OrdinatoBdo""    NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""Fatturato""      NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""ReleaseExcel""   TEXT,
            ""Rda""            TEXT,
            ""PAnno""          INTEGER       NOT NULL DEFAULT 0,
            ""PRelease""       TEXT          NOT NULL DEFAULT '',
            ""PImporto""       NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""PNote""          TEXT
        );

        CREATE TABLE IF NOT EXISTS ""Contratti"" (
            ""Id""            SERIAL        PRIMARY KEY,
            ""RifContratto""  TEXT          NOT NULL DEFAULT '',
            ""TipoContratto"" TEXT          NOT NULL DEFAULT '',
            ""Data""          TEXT,
            ""ImpLordo""      NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""Sconto""        NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""ImportoNetto""  NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""Ordinato""      NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""DaOrdinare""    NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""Avanzato""      NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""DaAvanzare""    NUMERIC(18,2) NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ""BuoniConsegna"" (
            ""Id""           SERIAL        PRIMARY KEY,
            ""Oda""          TEXT          NOT NULL DEFAULT '',
            ""Contratto""    TEXT,
            ""RifContratto"" TEXT,
            ""Importo""      NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""Avanzato""     NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""DaAvanzare""   NUMERIC(18,2) NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ""ConsumoTow"" (
            ""Id""             SERIAL        PRIMARY KEY,
            ""Tow""            TEXT          NOT NULL DEFAULT '',
            ""TowContratto""   TEXT,
            ""ValoreUnitario"" NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""ValoreTotale""   NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""Approvato""      NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""OrdinatiRda""    NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""Impegnato""      NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""Residuo""        NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""TOWApprovati""   NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""TOWImpegnati""   NUMERIC(18,2) NOT NULL DEFAULT 0,
            ""TOWResidui""     NUMERIC(18,2) NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ""AppSettings"" (
            ""Id""          SERIAL    PRIMARY KEY,
            ""LastAlignAt"" TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ""UserAccessLogs"" (
            ""Id""       SERIAL    PRIMARY KEY,
            ""UserId""   INTEGER   NOT NULL DEFAULT 0,
            ""Username"" TEXT      NOT NULL DEFAULT '',
            ""FullName"" TEXT      NOT NULL DEFAULT '',
            ""Role""     TEXT      NOT NULL DEFAULT '',
            ""LoginAt""  TIMESTAMP NOT NULL DEFAULT NOW(),
            ""LogoutAt"" TIMESTAMP
        );
    ");

    // Aggiunge colonne LastLogin/LastLogout se non esistono (per DB già esistenti)
    db.Database.ExecuteSqlRaw(@"
        ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""LastLogin""  TIMESTAMP;
        ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""LastLogout"" TIMESTAMP;

        ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""RefreshToken"" TEXT;
        ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""RefreshTokenExpiry"" TIMESTAMP;

    ");

    db.Database.ExecuteSqlRaw(@"
        ALTER TABLE ""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""TowApprovati"" NUMERIC(18,2) DEFAULT 0;
        ALTER TABLE ""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""TowImpegnati"" NUMERIC(18,2) DEFAULT 0;
        ALTER TABLE ""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""TowResidui"" NUMERIC(18,2) DEFAULT 0;
    ");


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
