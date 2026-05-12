using SendGrid;
using SendGrid.Helpers.Mail;

namespace MevGovernanceBackend.Services;

public class EmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendMevUpdateNotificationAsync(
        string updatedByUsername,
        string updatedByFullName,
        object mevItem,
        List<string> adminEmails)
    {
        var apiKey = Environment.GetEnvironmentVariable("SENDGRID_API_KEY") ?? _config["SendGrid:ApiKey"];
        var from   = Environment.GetEnvironmentVariable("SENDGRID_FROM")    ?? _config["SendGrid:From"] ?? "noreply@mev-governance.com";

        if (string.IsNullOrEmpty(apiKey))
        {
            _logger.LogWarning("SENDGRID_API_KEY mancante — email non inviata.");
            return;
        }

        if (adminEmails == null || adminEmails.Count == 0)
        {
            _logger.LogWarning("Nessun Admin con email trovato — notifica non inviata.");
            return;
        }

        dynamic item = mevItem;

        var body = $@"
<html>
<body style='font-family: Arial, sans-serif; font-size: 14px; color: #333;'>
  <h2 style='color: #1a73e8;'>MEV Governance — Modifica riga</h2>
  <p>L'utente <strong>{updatedByFullName} ({updatedByUsername})</strong> ha salvato una modifica.</p>
  <table border='1' cellpadding='8' cellspacing='0' style='border-collapse: collapse; width: 100%; max-width: 700px;'>
    <tr style='background: #f0f0f0;'>
      <th align='left'>Campo</th>
      <th align='left'>Valore</th>
    </tr>
    <tr><td><strong>ID Excel</strong></td><td>{item.ExcelId}</td></tr>
    <tr><td><strong>GoTo</strong></td><td>{item.GoTo}</td></tr>
    <tr><td><strong>Applicativo</strong></td><td>{item.Applicativo}</td></tr>
    <tr><td><strong>Descrizione</strong></td><td>{item.Descrizione}</td></tr>
    <tr><td><strong>Anno Competenza</strong></td><td>{item.AnnoCompetenza}</td></tr>
    <tr><td><strong>Stato</strong></td><td>{item.Stato}</td></tr>
    <tr><td><strong>Importo Excel (CAP)</strong></td><td>{item.ImportoExcel:C}</td></tr>
    <tr style='background: #fff8e1;'><td><strong>P Anno</strong></td><td>{item.PAnno}</td></tr>
    <tr style='background: #fff8e1;'><td><strong>P Release</strong></td><td>{item.PRelease}</td></tr>
    <tr style='background: #fff8e1;'><td><strong>P Importo</strong></td><td>{item.PImporto:C}</td></tr>
    <tr style='background: #fff8e1;'><td><strong>P Note</strong></td><td>{item.PNote ?? "-"}</td></tr>
  </table>
  <p style='color: #888; font-size: 12px; margin-top: 20px;'>Notifica automatica MEV Governance — {DateTime.Now:dd/MM/yyyy HH:mm}</p>
</body>
</html>";

        try
        {
            var client   = new SendGridClient(apiKey);
            var fromAddr = new EmailAddress(from, "MEV Governance");
            var subject  = $"[MEV] Modifica riga {item.ExcelId} — {item.Applicativo}";
            var msg      = new SendGridMessage();

            msg.SetFrom(fromAddr);
            msg.SetSubject(subject);
            msg.AddContent(MimeType.Html, body);

            foreach (var email in adminEmails)
                msg.AddTo(new EmailAddress(email));

            var response = await client.SendEmailAsync(msg);

            if (response.IsSuccessStatusCode)
                _logger.LogInformation("Email notifica inviata a {count} admin.", adminEmails.Count);
            else
            {
                var respBody = await response.Body.ReadAsStringAsync();
                _logger.LogError("SendGrid errore {status}: {body}", response.StatusCode, respBody);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Errore invio email notifica.");
        }
    }
}
