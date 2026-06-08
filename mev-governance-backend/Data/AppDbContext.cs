using Microsoft.EntityFrameworkCore;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<MevItem> MevItems => Set<MevItem>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Contratto> Contratti => Set<Contratto>();
    public DbSet<BuonoConsegna> BuoniConsegna => Set<BuonoConsegna>();
}
