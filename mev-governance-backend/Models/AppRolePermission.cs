namespace MevGovernanceBackend.Models;

/// <summary>
/// Permessi per sotto-applicazione per ruolo.
/// AppId    = identificatore dell'app (es. "mev", "mevcap", "contratti", "chart", ...)
/// Role     = ruolo (es. "Admin", "Editor", "Client", "Developer", "Bid Manager", "SuperAdmin")
/// CanView  = può accedere e visualizzare i dati
/// CanEdit  = può modificare i dati (implica CanView)
/// </summary>
public class AppRolePermission
{
    public int    Id      { get; set; }
    public string AppId   { get; set; } = "";
    public string Role    { get; set; } = "";
    public bool   CanView { get; set; } = true;
    public bool   CanEdit { get; set; } = true;
}
