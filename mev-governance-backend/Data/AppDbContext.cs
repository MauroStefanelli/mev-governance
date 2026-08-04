using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Data;

public class AppDbContext : DbContext
{
    private readonly string _schema;

    public AppDbContext(DbContextOptions<AppDbContext> options, IConfiguration configuration)
        : base(options)
    {
        _schema = configuration["DB_SCHEMA"] ?? "public";
    }

    public DbSet<MevItem> MevItems => Set<MevItem>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Contratto> Contratti => Set<Contratto>();
    public DbSet<BuonoConsegna> BuoniConsegna => Set<BuonoConsegna>();
    public DbSet<ConsumoTow> ConsumoTow => Set<ConsumoTow>();
    public DbSet<AppSettings> AppSettings => Set<AppSettings>();
    public DbSet<UserAccessLog> UserAccessLogs => Set<UserAccessLog>();
    public DbSet<OrdineConsegnaItem> OrdiniConsegna => Set<OrdineConsegnaItem>();
    public DbSet<VerbaleAvanzamento> VerbaliAvanzamento => Set<VerbaleAvanzamento>();
    public DbSet<Ambiente> Ambienti => Set<Ambiente>();
    public DbSet<UserAmbiente> UserAmbienti => Set<UserAmbiente>();
    public DbSet<RtiSocietaRiga> RtiSocietaRighe => Set<RtiSocietaRiga>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        if (_schema != "public")
            modelBuilder.HasDefaultSchema(_schema);

        base.OnModelCreating(modelBuilder);
    }
}
