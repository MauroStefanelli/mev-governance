using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using ClosedXML.Excel;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Collections.Generic;

namespace MevGovernanceBackend.Controllers;

[ApiController]
[Route("api/tools")]
[Authorize(Policy = "AdminOrSuper")]
public class OrdineConsegnaController : BaseController
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _pdfParserUrl;

    public OrdineConsegnaController(AppDbContext db, IHttpClientFactory httpClientFactory, IConfiguration config)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _pdfParserUrl = config["PDF_PARSER_URL"] ?? "http://localhost:8765";
    }

    // ============================================================
    // GET /api/tools/parser-warmup  — sveglia il parser (cold start Render free)
    // Risponde SEMPRE entro pochi secondi:
    //   { status: "ok" }      → parser già attivo
    //   { status: "warming" } → parser ancora in avvio
    // Il frontend fa polling su questo endpoint finché ottiene "ok".
    // Se SKIP_PARSER_WARMUP=true (es. QNAP locale) risponde subito ok senza chiamare il parser.
    // ============================================================
    [HttpGet("parser-warmup")]
    public async Task<IActionResult> ParserWarmup()
    {
        // Su ambienti locali (QNAP) il parser non va mai in sleep: skip warmup
        if (Environment.GetEnvironmentVariable("SKIP_PARSER_WARMUP") == "true")
            return Ok(new { status = "ok" });

        try
        {
            var client = _httpClientFactory.CreateClient();
            // Timeout 15s: sufficiente sia per Render cold start che per QNAP
            client.Timeout = TimeSpan.FromSeconds(15);
            var response = await client.GetAsync($"{_pdfParserUrl}/health");
            if (response.IsSuccessStatusCode)
                return Ok(new { status = "ok" });
            return Ok(new { status = "warming" });
        }
        catch
        {
            return Ok(new { status = "warming" });
        }
    }

    // ============================================================
    // GET /api/tools/ordini
    // ============================================================
    [HttpGet("ordini")]
    public IActionResult GetOrdini()
    {
        var ambienteId = GetAmbienteId();
        var items = _db.OrdiniConsegna
            .AsNoTracking()
            .Where(x => x.AmbienteId == ambienteId)
            .OrderByDescending(x => x.ImportatoIl)
            .ToList();

        return Ok(items);
    }

    // ============================================================
    // POST /api/tools/upload-pdf  — upload → parser Python → salva su DB
    // ============================================================
    [HttpPost("upload-pdf")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadPdf(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            return BadRequest("Il file deve essere un PDF");

        var username = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
        var ambienteId = GetAmbienteId();

        try
        {
            // Chiama il microservizio Python per il parsing
            var parseResult = await CallPdfParser(file, "/parse");

            var header = parseResult.GetProperty("header");
            var rows   = parseResult.GetProperty("rows");
            int count  = parseResult.GetProperty("count").GetInt32();

            if (count == 0)
                return BadRequest("Nessun articolo trovato nel PDF. Verificare il formato del documento.");

            string GetH(string key) =>
                header.TryGetProperty(key, out var v) ? v.GetString() ?? "" : "";

            var items = new List<OrdineConsegnaItem>();
            foreach (var r in rows.EnumerateArray())
            {
                string Get(string key) =>
                    r.TryGetProperty(key, out var v) ? v.GetString() ?? "" : "";

                items.Add(new OrdineConsegnaItem
                {
                    NumeroOrdine = GetH("numeroOrdine"),
                    Data         = GetH("data"),
                    DataConsegna = GetH("dataConsegna"),
                    RifContratto = GetH("rifContratto"),
                    Art          = Get("art"),
                    Codice       = Get("codice"),
                    Descrizione  = Get("descrizione"),
                    TipoAtt      = Get("tipoAtt"),
                    Quantita     = Get("quantita"),
                    Um           = Get("um"),
                    PrezzoNetto  = Get("prezzoNetto"),
                    Importo      = Get("importo"),
                    NumeroRda    = Get("numeroRda"),
                    Iniziativa   = Get("iniziativa"),
                    Ap           = Get("ap"),
                    Contratto    = Get("contratto"),
                    NomePdf      = file.FileName,
                    ImportatoIl  = DateTime.UtcNow,
                    ImportatoDA  = username,
                    AmbienteId   = ambienteId,
                });
            }

            _db.OrdiniConsegna.AddRange(items);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                message         = "PDF importato con successo",
                nomePdf         = file.FileName,
                numeroOrdine    = GetH("numeroOrdine"),
                articoliSalvati = items.Count
            });
        }
        catch (Exception ex)
        {
            var inner = ex.InnerException?.Message ?? "";
            var inner2 = ex.InnerException?.InnerException?.Message ?? "";
            return Problem($"Errore durante l'elaborazione del PDF: {ex.Message} | Inner: {inner} | Inner2: {inner2}");
        }
    }

    // ============================================================
    // POST /api/tools/upload-vap  — carica verbale avanzamento PDF e aggiorna OrdiniConsegna
    // ============================================================
    [HttpPost("upload-vap")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadVap(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            return BadRequest("Il file deve essere un PDF");

        var username = User.FindFirst(ClaimTypes.Name)?.Value ?? "unknown";
        var ambienteId = GetAmbienteId();

        try
        {
            var parseResult = await CallPdfParser(file, "/debug");
            var testo = parseResult.GetProperty("testo").GetString() ?? "";

            if (testo.Length < 10)
                return BadRequest("Impossibile estrarre testo dal PDF. Verificare che non sia scansionato.");

            var (meseAvanzamento, righe) = ParseVap(testo);

            if (righe.Count == 0)
                return BadRequest("Nessuna riga di avanzamento trovata nel PDF. Verificare il formato del verbale.");

            // ── Aggiorna le righe corrispondenti in OrdiniConsegna ──
            int aggiornati = 0;
            foreach (var (oda, pos, qta, importo, subappalto) in righe)
            {
                List<OrdineConsegnaItem> records;
                if (string.IsNullOrEmpty(pos))
                {
                    records = _db.OrdiniConsegna
                        .Where(r => r.NumeroOrdine == oda && r.AmbienteId == ambienteId)
                        .ToList();
                }
                else
                {
                    int posInt = int.TryParse(pos, out var p) ? p : -1;
                    records = _db.OrdiniConsegna
                        .Where(r => r.NumeroOrdine == oda && r.AmbienteId == ambienteId)
                        .ToList()
                        .Where(r => int.TryParse(r.Art, out var a) && a == posInt)
                        .ToList();
                }

                foreach (var rec in records)
                {
                    // ── Logica di merge: se la riga ha già dati VAP, somma invece di sovrascrivere ──
                    bool hasDati = !string.IsNullOrWhiteSpace(rec.MeseAvanzamento)
                                   && rec.MeseAvanzamento != meseAvanzamento;

                    if (hasDati)
                    {
                        // Concatena il mese solo se non già presente
                        var mesiEsistenti = rec.MeseAvanzamento.Split('/').Select(m => m.Trim()).ToList();
                        if (!mesiEsistenti.Contains(meseAvanzamento.Trim(), StringComparer.OrdinalIgnoreCase))
                            rec.MeseAvanzamento = rec.MeseAvanzamento.Trim() + "/" + meseAvanzamento.Trim();

                        // Somma QtaAvanzata
                        var qtaVecchia  = decimal.TryParse(rec.QtaAvanzata?.Replace(",", "."),
                            System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var qv) ? qv : 0m;
                        var qtaNuova    = decimal.TryParse(qta?.Replace(",", "."),
                            System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var qn) ? qn : 0m;
                        rec.QtaAvanzata = (qtaVecchia + qtaNuova).ToString(System.Globalization.CultureInfo.InvariantCulture);

                        // Somma ImportoFatturabile
                        // Parsing robusto: gestisce sia formato IT (19.329,00) che invariant (19329.00)
                        static decimal ParseImporto(string? s)
                        {
                            if (string.IsNullOrWhiteSpace(s)) return 0m;
                            s = s.Trim();
                            // Formato italiano: punto come sep migliaia, virgola come decimale
                            // es. "19.329,00" → rimuovi punti, sostituisci virgola con punto
                            if (s.Contains(','))
                                s = s.Replace(".", "").Replace(",", ".");
                            // Formato invariant: solo punto come decimale (es. "19329.00")
                            // non toccare
                            return decimal.TryParse(s, System.Globalization.NumberStyles.Any,
                                System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0m;
                        }
                        var impVecchio  = ParseImporto(rec.ImportoFatturabile);
                        var impNuovo    = ParseImporto(importo);
                        rec.ImportoFatturabile = (impVecchio + impNuovo).ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
                    }
                    else
                    {
                        // Prima scrittura: sovrascrive normalmente
                        rec.MeseAvanzamento    = meseAvanzamento;
                        rec.QtaAvanzata        = qta;
                        rec.ImportoFatturabile = importo;
                        rec.Subappalto         = subappalto;
                    }
                    aggiornati++;
                }
            }

            await _db.SaveChangesAsync();

            // ── Salva il verbale nel registro con i dati grezzi delle righe ──
            var datiRigheJson = System.Text.Json.JsonSerializer.Serialize(
                righe.Select(r => new { r.oda, r.pos, r.qta, r.importo, r.subappalto })
            );
            _db.VerbaliAvanzamento.Add(new VerbaleAvanzamento
            {
                NomePdf         = file.FileName,
                MeseAvanzamento = meseAvanzamento,
                RigheElaborate  = righe.Count,
                RigheAggiornate = aggiornati,
                CaricatoIl      = DateTime.UtcNow,
                CaricatoDa      = username,
                DatiRigheJson   = datiRigheJson,
                AmbienteId      = ambienteId,
            });
            await _db.SaveChangesAsync();

            // ── Raccogli le righe che richiedono abbinamento al Subco ─────────────
            // Include: subappalto = "SI" (da abbinare) oppure nome abbreviato (es. "Logica")
            // Esclude: "" (non valorizzato) e "NO"
            var subappaltiSI = new List<object>();
            foreach (var (oda, pos, qta, importo, subappalto) in righe)
            {
                // Salta righe senza subappalto o con NO
                if (string.IsNullOrWhiteSpace(subappalto)) continue;
                if (string.Equals(subappalto, "NO", StringComparison.OrdinalIgnoreCase)) continue;

                List<OrdineConsegnaItem> matching;
                if (string.IsNullOrEmpty(pos))
                {
                    matching = _db.OrdiniConsegna
                        .Where(r => r.NumeroOrdine == oda && r.AmbienteId == ambienteId)
                        .ToList();
                }
                else
                {
                    int posInt = int.TryParse(pos, out var p2) ? p2 : -1;
                    matching = _db.OrdiniConsegna
                        .Where(r => r.NumeroOrdine == oda && r.AmbienteId == ambienteId)
                        .ToList()
                        .Where(r => int.TryParse(r.Art, out var a) && a == posInt)
                        .ToList();
                }
                foreach (var rec in matching)
                    subappaltiSI.Add(new {
                        id          = rec.Id,
                        oda,
                        pos,
                        qta,
                        importo,
                        descrizione = rec.Descrizione,
                        subappaltoLetto = subappalto  // valore raw dal PDF ("SI" o "Logica" ecc.)
                    });
            }

            return Ok(new
            {
                message          = $"Verbale elaborato: {aggiornati} righe aggiornate",
                meseAvanzamento,
                righeElaborate   = righe.Count,
                righeAggiornate  = aggiornati,
                nomePdf          = file.FileName,
                subappaltiSI     // lista righe con subappalto=SI da assegnare al Subco
            });
        }
        catch (Exception ex)
        {
            return Problem($"Errore durante l'elaborazione del verbale: {ex.Message}");
        }
    }

    // ============================================================
    // PATCH /api/tools/ordini/set-subco  — associa un nome Subco a una o più righe
    // Body: [{ id: int, nomeSocietà: string }, ...]
    // ============================================================
    [HttpPatch("ordini/set-subco")]
    public async Task<IActionResult> SetSubco([FromBody] List<SetSubcoItem> items)
    {
        if (items == null || items.Count == 0)
            return BadRequest("Nessun elemento fornito");

        var ambienteId = GetAmbienteId();
        var ids = items.Select(i => i.Id).ToList();
        var records = _db.OrdiniConsegna
            .Where(r => ids.Contains(r.Id) && r.AmbienteId == ambienteId)
            .ToList();

        foreach (var item in items)
        {
            var rec = records.FirstOrDefault(r => r.Id == item.Id);
            if (rec == null) continue;
            rec.Subappalto = item.NomeSocieta ?? "SI";
        }

        await _db.SaveChangesAsync();
        return Ok(new { aggiornati = records.Count });
    }

    public class SetSubcoItem
    {
        public int Id { get; set; }
        public string? NomeSocieta { get; set; }
    }

    // ============================================================
    // POST /api/tools/debug-vap  — restituisce testo grezzo + righe parsate + match DB
    // ============================================================
    [HttpPost("debug-vap")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> DebugVap(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        try
        {
            var parseResult = await CallPdfParser(file, "/debug");
            var testo = parseResult.GetProperty("testo").GetString() ?? "";

            // Normalizza identico a ParseVap per vedere la struttura reale
            var testoNorm = System.Text.RegularExpressions.Regex.Replace(testo, @"[ \t]+", " ")
                                 .Replace("\r\n", "\n").Replace("\r", "\n");

            var (mese, righe) = ParseVap(testo);

            // Carica tutti i NumeroOrdine distinti dal DB per confronto diretto
            var odaDalVerbale = righe.Select(r => r.oda).Distinct().ToList();
            var tuttiGliOrdini = _db.OrdiniConsegna
                .Select(x => new { x.NumeroOrdine, x.Art, x.Id })
                .ToList();

            // Mostra i NumeroOrdine nel DB che iniziano con 41 (per confronto)
            var odaInDb = tuttiGliOrdini
                .Select(x => x.NumeroOrdine)
                .Distinct()
                .OrderBy(x => x)
                .ToList();

            // Per ogni riga parsata mostra cosa trova nel DB
            var matches = righe.Select(r =>
            {
                int posInt = int.TryParse(r.pos, out var p) ? p : -1;

                // Match: confronta byte a byte dopo trim
                var inDb = tuttiGliOrdini
                    .Where(x => x.NumeroOrdine.Trim() == r.oda.Trim())
                    .ToList();

                var matched = inDb
                    .Where(x => int.TryParse(x.Art.Trim(), out var a) && a == posInt)
                    .ToList();

                // Diagnostica: mostra lunghezza e bytes dei primi chars per individuare caratteri invisibili
                var odaBytes = string.Join("-", System.Text.Encoding.UTF8.GetBytes(r.oda).Take(12).Select(b => b.ToString("X2")));
                var firstDbOda = tuttiGliOrdini.FirstOrDefault(x => x.NumeroOrdine.Contains(r.oda.Substring(0, 6)));
                var dbOdaBytes = firstDbOda != null
                    ? string.Join("-", System.Text.Encoding.UTF8.GetBytes(firstDbOda.NumeroOrdine).Take(12).Select(b => b.ToString("X2")))
                    : "N/A";

                return new
                {
                    r.oda,
                    odaLen     = r.oda.Length,
                    odaBytes,
                    dbOdaBytes,
                    r.pos, posInt,
                    r.qta, r.importo, r.subappalto,
                    recordInDb     = inDb.Count,
                    artValuesInDb  = matched.Select(x => x.Art).ToList(),
                    matched        = matched.Count,
                    matchedIds     = matched.Select(x => x.Id).ToList()
                };
            }).ToList();

            // Prime 80 righe del testo grezzo per diagnostica
            var righeGrezze = testoNorm.Split('\n')
                .Select(l => l.Trim())
                .Where(l => l.Length > 0)
                .Take(80)
                .ToList();

            // Blocchi assemblati dal ParseVap (per diagnostica)
            var blocchiDebug = new List<string>();
            {
                var odaAnyRe2 = new System.Text.RegularExpressions.Regex(@"(4\d{9})\s+(\d{1,4})\b");
                var stopRe2   = new System.Text.RegularExpressions.Regex(@"^(TOTALE|EVENTUALI|Per gli|Flaggare|\*)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                var wmRe2     = new System.Text.RegularExpressions.Regex(@"^[\d/\._\s]{1,6}$");
                string? bc = null;
                foreach (var rawLine in testoNorm.Split('\n'))
                {
                    var l2 = rawLine.Trim();
                    if (string.IsNullOrEmpty(l2) || wmRe2.IsMatch(l2)) continue;
                    if (stopRe2.IsMatch(l2)) { if (bc != null) { blocchiDebug.Add(bc); bc = null; } continue; }
                    var m2 = odaAnyRe2.Match(l2);
                    if (m2.Success) { if (bc != null) blocchiDebug.Add(bc); bc = l2.Substring(m2.Index); }
                    else if (bc != null) bc += " " + l2;
                }
                if (bc != null) blocchiDebug.Add(bc);
            }

            return Ok(new
            {
                meseAvanzamento = mese,
                odaDalVerbale,
                odaInDb,
                righeConOda = testoNorm.Split('\n')
                    .Where(l => System.Text.RegularExpressions.Regex.IsMatch(l.Trim(), @"^4\d{9}"))
                    .Select(l => l.Trim())
                    .ToList(),
                righeGrezze,
                blocchiAssemblati = blocchiDebug,
                righe = matches
            });
        }
        catch (Exception ex)
        {
            return Problem($"Errore: {ex.Message}");
        }
    }

    // ============================================================
    // GET /api/tools/verbali
    // ============================================================
    [HttpGet("verbali")]
    public IActionResult GetVerbali()
    {
        var ambienteId = GetAmbienteId();
        var list = _db.VerbaliAvanzamento
            .AsNoTracking()
            .Where(x => x.AmbienteId == ambienteId)
            .OrderByDescending(x => x.CaricatoIl)
            .ToList();
        return Ok(list);
    }

    // ============================================================
    // DELETE /api/tools/verbali/{id}
    // Elimina il verbale e ricalcola i campi VAP di tutte le righe
    // riapplicando i verbali rimanenti in ordine cronologico
    // ============================================================
    [HttpDelete("verbali/{id}")]
    public async Task<IActionResult> DeleteVerbale(int id)
    {
        var ambienteId = GetAmbienteId();
        var item = await _db.VerbaliAvanzamento.FindAsync(id);
        if (item == null || item.AmbienteId != ambienteId) return NotFound();

        // ── Rimuove il verbale ──
        _db.VerbaliAvanzamento.Remove(item);
        await _db.SaveChangesAsync();

        // ── Azzera tutti i campi VAP su OrdiniConsegna per questo ambiente ──
        var tutteLeRighe = _db.OrdiniConsegna.Where(r => r.AmbienteId == ambienteId).ToList();
        foreach (var r in tutteLeRighe)
        {
            r.MeseAvanzamento    = "";
            r.QtaAvanzata        = "";
            r.ImportoFatturabile = "";
            r.Subappalto         = "";
        }
        await _db.SaveChangesAsync();

        // ── Riapplica tutti i verbali rimanenti in ordine cronologico ──
        var verbaliRimanenti = _db.VerbaliAvanzamento
            .Where(v => v.AmbienteId == ambienteId)
            .OrderBy(v => v.CaricatoIl)
            .ToList();

        int righeResettate = tutteLeRighe.Count;
        foreach (var verbale in verbaliRimanenti)
        {
            if (string.IsNullOrEmpty(verbale.DatiRigheJson)) continue;

            List<VapRigaDto>? righe = null;
            try { righe = System.Text.Json.JsonSerializer.Deserialize<List<VapRigaDto>>(verbale.DatiRigheJson); }
            catch { continue; }
            if (righe == null) continue;

            ApplicaRigheVap(verbale.MeseAvanzamento, righe, ambienteId);
        }
        await _db.SaveChangesAsync();

        return Ok(new { message = "Verbale eliminato e dati ricalcolati", righeResettate });
    }

    // DTO per deserializzare le righe VAP salvate in JSON
    private record VapRigaDto(string oda, string pos, string qta, string importo, string subappalto);

    // Applica le righe di un verbale agli OrdiniConsegna (stessa logica di UploadVap)
    private void ApplicaRigheVap(string meseAvanzamento, List<VapRigaDto> righe, int ambienteId)
    {
        foreach (var (oda, pos, qta, importo, subappalto) in righe.Select(r => (r.oda, r.pos, r.qta, r.importo, r.subappalto)))
        {
            List<OrdineConsegnaItem> records;
            if (string.IsNullOrEmpty(pos))
            {
                records = _db.OrdiniConsegna.Where(r => r.NumeroOrdine == oda && r.AmbienteId == ambienteId).ToList();
            }
            else
            {
                int posInt = int.TryParse(pos, out var p) ? p : -1;
                records = _db.OrdiniConsegna
                    .Where(r => r.NumeroOrdine == oda && r.AmbienteId == ambienteId)
                    .ToList()
                    .Where(r => int.TryParse(r.Art, out var a) && a == posInt)
                    .ToList();
            }

            foreach (var rec in records)
            {
                bool hasDati = !string.IsNullOrWhiteSpace(rec.MeseAvanzamento)
                               && rec.MeseAvanzamento != meseAvanzamento;

                if (hasDati)
                {
                    var mesiEsistenti = rec.MeseAvanzamento.Split('/').Select(m => m.Trim()).ToList();
                    if (!mesiEsistenti.Contains(meseAvanzamento.Trim(), StringComparer.OrdinalIgnoreCase))
                        rec.MeseAvanzamento = rec.MeseAvanzamento.Trim() + "/" + meseAvanzamento.Trim();

                    static decimal ParseImp(string? s)
                    {
                        if (string.IsNullOrWhiteSpace(s)) return 0m;
                        s = s.Trim();
                        if (s.Contains(',')) s = s.Replace(".", "").Replace(",", ".");
                        return decimal.TryParse(s, System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0m;
                    }

                    var qtaVecchia = decimal.TryParse(rec.QtaAvanzata?.Replace(",", "."),
                        System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var qv) ? qv : 0m;
                    var qtaNuova = decimal.TryParse(qta?.Replace(",", "."),
                        System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var qn) ? qn : 0m;
                    rec.QtaAvanzata = (qtaVecchia + qtaNuova).ToString(System.Globalization.CultureInfo.InvariantCulture);
                    rec.ImportoFatturabile = (ParseImp(rec.ImportoFatturabile) + ParseImp(importo))
                        .ToString("F2", System.Globalization.CultureInfo.InvariantCulture);
                }
                else
                {
                    rec.MeseAvanzamento    = meseAvanzamento;
                    rec.QtaAvanzata        = qta;
                    rec.ImportoFatturabile = importo;
                    rec.Subappalto         = subappalto;
                }
            }
        }
    }

    // ============================================================
    // ParseVap — calibrato sul formato reale del verbale Poste Italiane
    //
    // Ogni riga dati è su una singola riga di testo nel formato:
    //   ODA(10)  POS  [...testo libero...]  PREZZO_UNIT €  QTA  IMPORTO_FATT €  SI/NO
    // Esempi reali:
    //   4100689952 10 (vuoto) Canone Presidio Q2 2026 (vuoto) 0,644 € 30000,00 19.329,00 € NO
    //   4100698371 20 143578 Servizio Universale F1 AP-00226 COLLAUDO, 0,32 € 25600,00 8.079,36 € NO
    //
    // Strategia: per ogni riga del testo
    //   - cerca ODA + POS all'inizio
    //   - cerca la coda fissa (PREZZO€ QTA IMPORTO€ SI/NO) in fondo alla stessa riga
    // ============================================================
    private static (string mese, List<(string oda, string pos, string qta, string importo, string subappalto)> righe)
        ParseVap(string testo)
    {
        // ── Mese di avanzamento ──
        var meseMatch = Regex.Match(testo,
            @"Periodo di riferimento[:\s]+([^\n\r]+)",
            RegexOptions.IgnoreCase);
        var mese = meseMatch.Success ? meseMatch.Groups[1].Value.Trim() : "";

        // ── Normalizza: collassa spazi/tab, normalizza newline ──
        var testoNorm = Regex.Replace(testo, @"[ \t]+", " ")
                             .Replace("\r\n", "\n")
                             .Replace("\r", "\n");

        var righe = new List<(string oda, string pos, string qta, string importo, string subappalto)>();

        // ── Strategia robusta: raggruppa le righe per blocchi ODA ──
        //
        // Il PDF ha un watermark ruotato che pdfplumber estrae come singoli
        // caratteri su righe separate (es. "8","1","0","/","re .",".1"…).
        // Questi si mescolano alle righe dati in due modi:
        //   a) righe con solo watermark → da saltare
        //   b) prefisso watermark prima dell'ODA sulla stessa riga (es. ".1 4100698371 20 …")
        //
        // Soluzione:
        //  1. Salta righe vuote e righe watermark (≤6 char, solo cifre/slash/punto/underscore/spazio)
        //  2. Cerca l'ODA OVUNQUE nella riga (non solo all'inizio)
        //     e taglia tutto ciò che precede l'ODA (prefisso watermark)
        //  3. Il blocco termina SOLO su nuova ODA, parola-chiave di stop o fine testo
        var odaAnywhereRe = new Regex(@"(4\d{9})\s+(\d{1,4})\b");
        var stopRe        = new Regex(@"^(TOTALE|EVENTUALI|Per gli|Flaggare|\*)", RegexOptions.IgnoreCase);
        var watermarkRe   = new Regex(@"^[\d/\._\s]{1,6}$");

        var lines = testoNorm.Split('\n');
        var blocchi = new List<string>();
        string? bloccoCorrente = null;

        foreach (var rawLine in lines)
        {
            var l = rawLine.Trim();

            // Salta righe vuote e righe che sono solo watermark
            if (string.IsNullOrEmpty(l) || watermarkRe.IsMatch(l)) continue;

            // Parola chiave di stop → chiude il blocco corrente
            if (stopRe.IsMatch(l))
            {
                if (bloccoCorrente != null) { blocchi.Add(bloccoCorrente); bloccoCorrente = null; }
                continue;
            }

            // Cerca ODA ovunque nella riga
            var odaM = odaAnywhereRe.Match(l);
            if (odaM.Success)
            {
                // Nuova ODA → salva il blocco precedente e inizia uno nuovo
                // tagliando il prefisso watermark che precede l'ODA
                if (bloccoCorrente != null) blocchi.Add(bloccoCorrente);
                bloccoCorrente = l.Substring(odaM.Index);
            }
            else if (bloccoCorrente != null)
            {
                // Riga di continuazione (testo descrizione spezzato, coda €, ecc.)
                bloccoCorrente += " " + l;
            }
        }
        if (bloccoCorrente != null) blocchi.Add(bloccoCorrente);

        // Pattern ODA + POS all'inizio del blocco riassemblato
        var odaRe = new Regex(@"^(4\d{9})\s+(\d{1,4})\b");

        // ── Formato v2a (template corrente): coda termina con SI o NO (caso standard)
        var codaReV2 = new Regex(
            @"(\d[\d,]*)\s*€\s+" +
            @"(\d[\d.,]*)\s+" +
            @"(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*€\s*" +
            @"(SI|NO)\b",
            RegexOptions.IgnoreCase
        );

        // ── Formato v2b: coda termina con nome abbreviato subappaltatore (1-2 parole, max 20 car)
        // Ammette solo nomi brevi senza spazi interni multipli e senza parole chiave di stop.
        // Non ammette stringhe come "CERTIFICAZIONE", "TOTALE", "Per gli", "Flaggare" ecc.
        var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "TOTALE", "EVENTUALI", "CERTIFICAZIONE", "CERTIFICAZIONED", "COLLAUDO",
              "SERVIZIO", "CANONE", "PRESIDIO", "FORNITURA", "IMPORTO", "FATTURABILE" };
        var codaReV2b = new Regex(
            @"(\d[\d,]*)\s*€\s+" +
            @"(\d[\d.,]*)\s+" +
            @"(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*€\s*" +
            @"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ]{1,18}(?:\s[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ]{1,10})?)\s*$",
            RegexOptions.IgnoreCase
        );

        // ── Formato v3 (senza SI/NO inline): ODA POS [Cod] Descr [TOW] PREZZO€ QTA IMPORTO€
        // Es: 0,36 € 6000,00 2.164,20 €
        // Subappalto lasciato vuoto
        var codaReV3 = new Regex(
            @"(\d[\d,]*)\s*€\s+" +                              // Prezzo unitario €
            @"(\d[\d.,]*)\s+" +                                 // QTA
            @"(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*€",     // Importo fatturabile €
            RegexOptions.IgnoreCase
        );

        // ── Formato v1 (template vecchio): ODA POS [Cod] Descr QTA PREZZO€ TOTALE€ FATTURABILE€
        // Non c'è SI/NO inline — subappalto lasciato vuoto
        // Struttura coda: QTA  PREZZO€  TOTALE€  FATTURABILE€
        var codaReV1 = new Regex(
            @"(\d[\d.,]*)\s+" +          // QTA (intera o decimale, senza €)
            @"(\d[\d,]*)\s*€\s+" +       // Prezzo unitario €
            @"\d[\d.,]*\s*€\s+" +        // Totale avanzato € (da ignorare)
            @"(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*€",  // di cui Fatturabile €
            RegexOptions.IgnoreCase
        );

        foreach (var blocco in blocchi)
        {
            var b = Regex.Replace(blocco.Trim(), @"\s+", " ");
            if (b.Length < 15) continue;

            var odaM = odaRe.Match(b);
            if (!odaM.Success) continue;

            var oda = odaM.Groups[1].Value;
            var pos = odaM.Groups[2].Value.TrimStart('0');
            if (string.IsNullOrEmpty(pos)) pos = "0";

            // Prova prima il formato v2a (SI/NO esplicito)
            var codaMatchesV2 = codaReV2.Matches(b);
            if (codaMatchesV2.Count > 0)
            {
                var codaM      = codaMatchesV2[0];
                var qta        = codaM.Groups[2].Value;
                var importo    = codaM.Groups[3].Value;
                var subappalto = codaM.Groups[4].Value.ToUpper(); // "SI" o "NO"
                righe.Add((oda, pos == "0" ? "" : pos, qta, importo, subappalto));
                continue;
            }

            // Prova formato v2b (nome breve subappaltatore dopo importo€)
            var codaMatchV2b = codaReV2b.Match(b);
            if (codaMatchV2b.Success)
            {
                var qta     = codaMatchV2b.Groups[2].Value;
                var importo = codaMatchV2b.Groups[3].Value;
                var subRaw  = codaMatchV2b.Groups[4].Value.Trim();
                // Valida: non deve essere una stop-word
                if (!stopWords.Contains(subRaw) && !stopWords.Contains(subRaw.Split(' ')[0]))
                {
                    righe.Add((oda, pos == "0" ? "" : pos, qta, importo, subRaw));
                    continue;
                }
                // Altrimenti tratta come v3 (subappalto vuoto) — cade nel fallback sotto
                righe.Add((oda, pos == "0" ? "" : pos, qta, importo, ""));
                continue;
            }

            // Fallback formato v1 (template vecchio, 4 valori numerici)
            var codaM1 = codaReV1.Match(b);
            if (codaM1.Success)
            {
                var qta     = codaM1.Groups[1].Value;
                var importo = codaM1.Groups[3].Value;
                righe.Add((oda, pos == "0" ? "" : pos, qta, importo, ""));
                continue;
            }

            // Fallback formato v3 (3 valori: PREZZO€ QTA IMPORTO€, senza SI/NO)
            var codaMatchesV3 = codaReV3.Matches(b);
            if (codaMatchesV3.Count > 0)
            {
                // Prende l'ultimo match — è quello più vicino alla fine del blocco
                var codaM3  = codaMatchesV3[codaMatchesV3.Count - 1];
                var qta     = codaM3.Groups[2].Value;
                var importo = codaM3.Groups[3].Value;
                righe.Add((oda, pos == "0" ? "" : pos, qta, importo, ""));
            }
        }

        return (mese, righe);
    }

    // ============================================================
    // POST /api/tools/debug-pdf  — restituisce testo grezzo dal parser Python
    // ============================================================
    [HttpPost("debug-pdf")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> DebugPdf(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        try
        {
            var result = await CallPdfParser(file, "/debug");
            return Ok(new
            {
                lunghezza = result.GetProperty("lunghezza").GetInt32(),
                testo     = result.GetProperty("testo").GetString()
            });
        }
        catch (Exception ex)
        {
            return Problem($"Errore: {ex.Message}");
        }
    }

    // ============================================================
    // DELETE /api/tools/ordini/{id}
    // ============================================================
    [HttpDelete("ordini/{id}")]
    public async Task<IActionResult> DeleteOrdine(int id)
    {
        var ambienteId = GetAmbienteId();
        var item = await _db.OrdiniConsegna.FindAsync(id);
        if (item == null || item.AmbienteId != ambienteId) return NotFound();
        _db.OrdiniConsegna.Remove(item);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Riga eliminata" });
    }

    // ============================================================
    // DELETE /api/tools/ordini/by-pdf/{nomePdf}
    // ============================================================
    [HttpDelete("ordini/by-pdf/{nomePdf}")]
    public async Task<IActionResult> DeleteByPdf(string nomePdf)
    {
        var ambienteId = GetAmbienteId();
        var items = _db.OrdiniConsegna
            .Where(x => x.NomePdf == nomePdf && x.AmbienteId == ambienteId)
            .ToList();

        if (items.Count == 0) return NotFound();
        _db.OrdiniConsegna.RemoveRange(items);
        await _db.SaveChangesAsync();
        return Ok(new { message = $"{items.Count} righe eliminate", count = items.Count });
    }

    // ============================================================
    // GET /api/tools/export
    // ============================================================
    [HttpGet("export")]
    public IActionResult ExportExcel()
    {
        var ambienteId = GetAmbienteId();
        var items = _db.OrdiniConsegna
            .AsNoTracking()
            .Where(x => x.AmbienteId == ambienteId)
            .OrderByDescending(x => x.ImportatoIl)
            .ThenBy(x => x.NumeroOrdine)
            .ToList();

        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("Ordini Consegna");

        var headers = new[]
        {
            "Numero Ordine", "Data", "Data Consegna", "Rif. Contratto",
            "Art.", "Codice", "Descrizione", "Tipo Att.",
            "Q.tà", "UM", "Prezzo Netto", "Importo",
            "Numero RdA", "Iniziativa", "AP", "Contratto",
            "Nome PDF", "Importato Il", "Importato Da"
        };

        for (int i = 0; i < headers.Length; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#1a73e8");
            cell.Style.Font.FontColor = XLColor.White;
        }

        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value  = item.NumeroOrdine;
            ws.Cell(row, 2).Value  = item.Data;
            ws.Cell(row, 3).Value  = item.DataConsegna;
            ws.Cell(row, 4).Value  = item.RifContratto;
            ws.Cell(row, 5).Value  = item.Art;
            ws.Cell(row, 6).Value  = item.Codice;
            ws.Cell(row, 7).Value  = item.Descrizione;
            ws.Cell(row, 8).Value  = item.TipoAtt;

            // Q.tà come numero
            if (TryParseItalian(item.Quantita, out var qty))
            {
                ws.Cell(row, 9).Value = qty;
                ws.Cell(row, 9).Style.NumberFormat.Format = "#,##0.000";
            }
            else ws.Cell(row, 9).Value = item.Quantita;

            ws.Cell(row, 10).Value = item.Um;

            // Prezzo Netto in Euro
            if (TryParseItalian(item.PrezzoNetto, out var pn))
            {
                ws.Cell(row, 11).Value = pn;
                ws.Cell(row, 11).Style.NumberFormat.Format = "€ #,##0.00";
            }
            else ws.Cell(row, 11).Value = item.PrezzoNetto;

            // Importo in Euro
            if (TryParseItalian(item.Importo, out var imp))
            {
                ws.Cell(row, 12).Value = imp;
                ws.Cell(row, 12).Style.NumberFormat.Format = "€ #,##0.00";
            }
            else ws.Cell(row, 12).Value = item.Importo;

            ws.Cell(row, 13).Value = item.NumeroRda;
            ws.Cell(row, 14).Value = item.Iniziativa;
            ws.Cell(row, 15).Value = item.Ap;
            ws.Cell(row, 16).Value = item.Contratto;
            ws.Cell(row, 17).Value = item.NomePdf;
            ws.Cell(row, 18).Value = item.ImportatoIl.ToLocalTime().ToString("dd/MM/yyyy HH:mm");
            ws.Cell(row, 19).Value = item.ImportatoDA;
            row++;
        }

        ws.Columns().AdjustToContents();
        ws.RangeUsed()?.SetAutoFilter();
        ws.SheetView.FreezeRows(1);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;

        return File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"OrdiniConsegna_{DateTime.Now:yyyyMMdd}.xlsx"
        );
    }

    // ============================================================
    // POST /api/tools/export-governance
    // Riceve un file Excel esistente, aggiunge uno sheet "Ordini DD/MM/YYYY"
    // con tutti i dati degli ordini, restituisce il file modificato
    // ============================================================
    [HttpPost("export-governance")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> ExportGovernance(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("File non valido");

        var items = _db.OrdiniConsegna
            .AsNoTracking()
            .Where(x => x.AmbienteId == GetAmbienteId())
            .OrderByDescending(x => x.ImportatoIl)
            .ThenBy(x => x.NumeroOrdine)
            .ToList();

        // Carica il workbook esistente
        XLWorkbook workbook;
        try
        {
            using var inputStream = file.OpenReadStream();
            using var ms = new MemoryStream();
            await inputStream.CopyToAsync(ms);
            ms.Position = 0;
            workbook = new XLWorkbook(ms);
        }
        catch (Exception ex)
        {
            return BadRequest($"Impossibile aprire il file Excel: {ex.Message}. Assicurarsi che sia un file .xlsx valido e non protetto da password.");
        }

        // Nome sheet: "Ordini" + data corrente
        var sheetName = $"Ordini {DateTime.Now:dd/MM/yyyy}";

        // Se esiste già uno sheet con lo stesso nome lo elimina e lo ricrea
        if (workbook.Worksheets.TryGetWorksheet(sheetName, out var existing))
            workbook.Worksheets.Delete(sheetName);

        var ws = workbook.Worksheets.Add(sheetName);

        var headers = new[]
        {
            "Numero Ordine", "Data", "Data Consegna", "Rif. Contratto",
            "Art.", "Codice", "Descrizione", "Tipo Att.",
            "Q.tà", "UM", "Prezzo Netto", "Importo",
            "Numero RdA", "Iniziativa", "AP", "Contratto",
            "Nome PDF", "Importato Il", "Importato Da"
        };

        for (int i = 0; i < headers.Length; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#1a73e8");
            cell.Style.Font.FontColor = XLColor.White;
        }

        int row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value  = item.NumeroOrdine;
            ws.Cell(row, 2).Value  = item.Data;
            ws.Cell(row, 3).Value  = item.DataConsegna;
            ws.Cell(row, 4).Value  = item.RifContratto;
            ws.Cell(row, 5).Value  = item.Art;
            ws.Cell(row, 6).Value  = item.Codice;
            ws.Cell(row, 7).Value  = item.Descrizione;
            ws.Cell(row, 8).Value  = item.TipoAtt;

            if (TryParseItalian(item.Quantita, out var qty))
            { ws.Cell(row, 9).Value = qty; ws.Cell(row, 9).Style.NumberFormat.Format = "#,##0.000"; }
            else ws.Cell(row, 9).Value = item.Quantita;

            ws.Cell(row, 10).Value = item.Um;

            if (TryParseItalian(item.PrezzoNetto, out var pn))
            { ws.Cell(row, 11).Value = pn; ws.Cell(row, 11).Style.NumberFormat.Format = "€ #,##0.00"; }
            else ws.Cell(row, 11).Value = item.PrezzoNetto;

            if (TryParseItalian(item.Importo, out var imp))
            { ws.Cell(row, 12).Value = imp; ws.Cell(row, 12).Style.NumberFormat.Format = "€ #,##0.00"; }
            else ws.Cell(row, 12).Value = item.Importo;

            ws.Cell(row, 13).Value = item.NumeroRda;
            ws.Cell(row, 14).Value = item.Iniziativa;
            ws.Cell(row, 15).Value = item.Ap;
            ws.Cell(row, 16).Value = item.Contratto;
            ws.Cell(row, 17).Value = item.NomePdf;
            ws.Cell(row, 18).Value = item.ImportatoIl.ToLocalTime().ToString("dd/MM/yyyy HH:mm");
            ws.Cell(row, 19).Value = item.ImportatoDA;
            row++;
        }

        ws.Columns().AdjustToContents();
        ws.RangeUsed()?.SetAutoFilter();
        ws.SheetView.FreezeRows(1);

        // Sposta lo sheet in fondo
        ws.Position = workbook.Worksheets.Count;

        using var outputStream = new MemoryStream();
        workbook.SaveAs(outputStream);
        workbook.Dispose();
        outputStream.Position = 0;

        var outputFileName = Path.GetFileNameWithoutExtension(file.FileName)
            + $"_Ordini_{DateTime.Now:yyyyMMdd}"
            + Path.GetExtension(file.FileName);

        return File(
            outputStream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            outputFileName
        );
    }

    // ============================================================
    // METODI PRIVATI
    // ============================================================

    private async Task<JsonElement> CallPdfParser(IFormFile file, string endpoint)
    {
        // Legge il file in memoria una sola volta
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var fileBytes = ms.ToArray();

        // Timeout lungo per gestire cold start del parser su Render free (può impiegare 30-60s)
        // Retry 1 volta in caso di errore transitorio (es. cold start) o 502
        Exception? lastEx = null;
        for (int attempt = 1; attempt <= 2; attempt++)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(90);

                using var content = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(fileBytes);
                fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
                content.Add(fileContent, "file", file.FileName);

                var response = await client.PostAsync($"{_pdfParserUrl}{endpoint}", content);
                var body = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    // Rileva risposta HTML (502 Bad Gateway / cold start Render)
                    var isHtml = body.TrimStart().StartsWith("<", StringComparison.OrdinalIgnoreCase)
                                 || (response.Content.Headers.ContentType?.MediaType?.Contains("html") ?? false);

                    if (isHtml || (int)response.StatusCode == 502)
                    {
                        // Al primo tentativo riprova dopo una pausa più lunga per lasciare tempo al cold start
                        if (attempt == 1)
                        {
                            lastEx = new Exception(
                                "Il servizio di parsing PDF non è ancora pronto (cold start). Riprovo tra 8 secondi…");
                            await Task.Delay(8000);
                            continue;
                        }
                        throw new Exception(
                            "Il servizio di parsing PDF non è disponibile (502 Bad Gateway). " +
                            "Il servizio su Render potrebbe essere in fase di avvio: attendere 30-60 secondi e riprovare.");
                    }

                    throw new Exception($"Parser Python ({endpoint}): {body}");
                }

                return JsonDocument.Parse(body).RootElement;
            }
            catch (Exception ex) when (attempt == 1 && lastEx == null)
            {
                // Primo tentativo fallito per errore di rete/timeout: aspetta 3s e riprova
                lastEx = ex;
                await Task.Delay(3000);
            }
        }
        throw lastEx!;
    }

    private static bool TryParseItalian(string value, out decimal result)
    {
        // Formato italiano: 1.234,56 → rimuove punti migliaia, sostituisce virgola con punto
        var cleaned = value.Replace(".", "").Replace(",", ".");
        return decimal.TryParse(cleaned,
            System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture,
            out result);
    }
}
