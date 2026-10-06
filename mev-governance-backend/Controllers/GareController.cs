using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MevGovernanceBackend.Services;
using MevGovernanceBackend.Data;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/gare")]
[Authorize]
public class GareController : ControllerBase
{
    private readonly AiService _ai;
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public GareController(AiService ai, AppDbContext db, IConfiguration config)
    {
        _ai = ai;
        _db = db;
        _config = config;
    }

    private bool CanAccess() =>
        User.IsInRole("SuperAdmin") || User.IsInRole("Bid Manager") ||
        User.IsInRole("Admin")      || User.IsInRole("Developer");

    private (string? key, string? endpoint, string? model, string? style, string? authMode) GetUserAiSettings()
    {
        var idClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(idClaim, out var userId)) return (null, null, null, null, null);
        var user = _db.Users.Find(userId);
        if (user == null) return (null, null, null, null, null);
        return (
            string.IsNullOrWhiteSpace(user.AiApiKey)   ? null : user.AiApiKey,
            string.IsNullOrWhiteSpace(user.AiEndpoint) ? null : user.AiEndpoint,
            string.IsNullOrWhiteSpace(user.AiModel)    ? null : user.AiModel,
            string.IsNullOrWhiteSpace(user.AiStyle)    ? null : user.AiStyle,
            string.IsNullOrWhiteSpace(user.AiAuthMode) ? null : user.AiAuthMode
        );
    }

    // POST /api/gare/analizza-capitolato
    // Accetta un file PDF multipart e restituisce analisi AI completa del capitolato di gara.
    // Il prompt richiede all'AI di:
    //   - estrarre i nomi dei file PDF allegati/citati nel documento
    //   - produrre dettagli operativi per ogni documento da produrre, ogni sezione tecnica,
    //     ogni voce economica — inclusi riferimenti agli allegati PDF del capitolato
    [HttpPost("analizza-capitolato")]
    public async Task<IActionResult> AnalizzaCapitolato()
    {
        if (!CanAccess()) return Forbid();

        var form = Request.Form;
        var file = form.Files.GetFile("file");
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Nessun file ricevuto. Invia il PDF come campo 'file'." });

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Sono accettati solo file PDF." });

        // Estrae il testo dal PDF
        string fullText;
        try
        {
            using var stream = file.OpenReadStream();
            fullText = ContractParserService.ExtractFullText(stream, maxChars: 80000);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Errore lettura PDF: " + ex.Message });
        }

        if (string.IsNullOrWhiteSpace(fullText) || fullText.Length < 100)
            return BadRequest(new { message = "Il PDF non contiene testo leggibile o e' troppo corto." });

        // Usa fino a 50.000 caratteri per dare più contesto all'AI
        var snippet = fullText.Length > 50000 ? fullText[..50000] + "\n[... testo troncato ...]" : fullText;

        var instruction = @"Sei un esperto di gare d'appalto pubbliche italiane nel settore IT/digitale.
Analizza il seguente documento di gara / capitolato tecnico in modo APPROFONDITO e OPERATIVO.

ISTRUZIONI IMPORTANTI:
1. Estrai TUTTI i nomi di file PDF, allegati, appendici, tabelle citati nel testo (es. ""Allegato 1.pdf"", ""Appendice A - Catalogo.pdf"", ""Tab. 1 - Prezzi.xlsx"" ecc.) — elencali nel campo ""allegatiCitati"".
2. CERCA CON ATTENZIONE i TOW (Transaction of Work / Transazioni di Lavoro) presenti nel documento: possono essere in forma di tabella, lista numerata, allegato tecnico o sezione dedicata. Estrai TUTTI i TOW trovati con tutti i campi disponibili (ID, codice, descrizione, quantità, importo, unità misura, ecc.). Se non ci sono TOW espliciti, restituisci un array vuoto.
3. Per ogni documento da produrre per la risposta alla gara, fornisci istruzioni OPERATIVE e SPECIFICHE su come compilarlo, cosa deve contenere, quali sezioni del capitolato rispettare, e quali allegati/file del capitolato consultare.
4. Per la proposta tecnica, descrivi CONCRETAMENTE cosa scrivere in ciascuna sezione, con riferimento ai requisiti specifici del capitolato.
5. Per la proposta economica, stima importi REALISTICI basandoti su eventuali prezzi/tariffe presenti nel capitolato o su benchmark di mercato IT.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido (senza markdown, senza ```json, solo JSON puro) con questa struttura:
{
  ""titolo"": ""titolo ufficiale del documento"",
  ""sintesi"": ""sintesi esecutiva in 5-8 frasi: oggetto della gara, committente, ambito tecnologico, requisiti principali, elementi differenzianti"",
  ""oggetto"": ""oggetto specifico della fornitura/servizio"",
  ""committente"": ""nome ente committente"",
  ""importoBase"": ""importo a base d'asta se presente, altrimenti null"",
  ""scadenza"": ""data scadenza presentazione offerte se presente, altrimenti null"",
  ""allegatiCitati"": [
    ""nome-file-1.pdf"",
    ""nome-file-2.pdf""
  ],
  ""tow"": [
    {
      ""id"": ""codice o ID del TOW se presente, altrimenti null"",
      ""descrizione"": ""descrizione completa del TOW come riportata nel documento"",
      ""quantita"": ""quantità numerica se presente, altrimenti null"",
      ""unitaMisura"": ""unità di misura se presente (es. ore, giornate, pezzi), altrimenti null"",
      ""importo"": ""importo o valore economico se presente, altrimenti null"",
      ""note"": ""qualsiasi informazione aggiuntiva rilevante sul TOW""
    }
  ],
  ""sezioni"": [
    { ""numero"": ""1"", ""titolo"": ""..."", ""sintesi"": ""sintesi della sezione in 1-2 frasi"" }
  ],
  ""requisitiTecnici"": [""requisito tecnico specifico 1"", ""requisito tecnico specifico 2""],
  ""documentiRichiesti"": [
    {
      ""nome"": ""nome del documento da produrre"",
      ""tipo"": ""tecnico|economico|amministrativo|legale"",
      ""obbligatorio"": true,
      ""dettagli"": ""Istruzioni operative dettagliate su cosa deve contenere questo documento, come strutturarlo, quali sezioni del capitolato rispettare, quali allegati consultare. Minimo 3-5 frasi specifiche."",
      ""allegatiRiferimento"": [""nome-allegato-capitolato.pdf""]
    }
  ],
  ""criteriValutazione"": [
    { ""criterio"": ""..."", ""peso"": ""xx punti o xx%"" }
  ],
  ""proposte"": {
    ""tecnica"": [
      {
        ""sezione"": ""titolo sezione proposta tecnica"",
        ""desc"": ""Descrizione di alto livello della sezione"",
        ""dettagli"": ""Istruzioni operative CONCRETE su cosa scrivere in questa sezione: punti chiave da sviluppare, requisiti del capitolato da rispettare (cita i paragrafi specifici se presenti nel testo), approccio metodologico suggerito, elementi differenzianti da evidenziare. Minimo 4-6 frasi."",
        ""allegatiRiferimento"": [""nome-allegato.pdf""]
      }
    ],
    ""economica"": [
      {
        ""voce"": ""nome voce di costo"",
        ""gg"": 0,
        ""tariffa"": 0,
        ""importo"": 0,
        ""dettagli"": ""Spiegazione di come è stata stimata questa voce, a quale attività/requisito del capitolato si riferisce, come giustificarla nell'offerta economica."",
        ""allegatiRiferimento"": [""nome-allegato.pdf""]
      }
    ],
    ""piano"": [
      {
        ""milestone"": ""nome milestone"",
        ""data"": ""data stimata"",
        ""durata"": ""durata stimata"",
        ""owner"": ""responsabile"",
        ""stato"": ""Pianificato""
      }
    ]
  },
  ""note"": ""eventuali vincoli, avvertenze o note importanti non categorizzate""
}";

        // Usa AnalyzeWithInstructionsAsync per bypassare il system prompt del Configuratore
        // e usare il prompt specifico per l'analisi di gara
        var userMessage = $"Analizza questo documento di gara/capitolato tecnico.\n\nFile: {file.FileName}\nLunghezza testo: {fullText.Length} caratteri\n\nTESTO DEL DOCUMENTO:\n{snippet}";

        try
        {
            var (key, ep, mdl, sty, auth) = GetUserAiSettings();
            var (analysis, provider, usedModel, usage) = await _ai.AnalyzeWithInstructionsAsync(
                instruction, userMessage, key, ep, mdl, sty, auth);

            return Ok(new
            {
                ok         = true,
                fileName   = file.FileName,
                textLength = fullText.Length,
                provider,
                model      = usedModel,
                analysis,
            });
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("API key") || msg.Contains("401") || msg.Contains("403") || msg.Contains("Unauthorized"))
                return StatusCode(401, new { message = "Chiave AI non configurata o non valida. Vai su Profilo → API Key AI e inserisci la tua chiave." });
            return StatusCode(500, new { message = "Errore analisi AI: " + msg });
        }
    }
}
