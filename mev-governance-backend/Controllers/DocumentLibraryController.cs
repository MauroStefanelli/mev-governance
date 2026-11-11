using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using MevGovernanceBackend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Controllers;

// Documentary workspace of an initiative: folders, versions, full-text search and questions answered from the documents.
// Documents live in the same table as the earlier attachments, which remain visible as version 1.
[ApiController, Authorize]
[Route("api/configuratore/library")]
public class DocumentLibraryController : BaseController
{
    public const long MaxFileBytes = 10 * 1024 * 1024;
    public const int MaxFilesPerRequest = 5;
    public const int MaxDocumentsPerInitiative = 300;
    public const int MaxSearchDocuments = 30;
    public const int MaxQuestion = 2000;
    public const int ReindexBatch = 8;
    public const string DefaultCategory = "Allegati ricevuti";
    public const string MemoryCategory = DocumentRetrieval.MemoryCategory;
    // "Versioni storiche" is not a folder one chooses: every replaced version moves there automatically.
    public static readonly string[] Categories = { MemoryCategory, "Requisiti cliente", "Analisi funzionali", "Documentazione tecnica", "Email e comunicazioni", DefaultCategory };
    static readonly HashSet<string> Blocked = new(StringComparer.OrdinalIgnoreCase)
    { ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".scr", ".ps1", ".vbs", ".vbe", ".jar", ".sh", ".app", ".apk", ".pif", ".lnk", ".msc", ".reg", ".hta", ".wsf", ".cpl" };

    private readonly AppDbContext db;
    private readonly IDocumentAssistant assistant;
    // Test seam only: runs between the version check and the atomic switch, where a concurrent colleague could act.
    public Func<Task>? BeforeVersionSwitch { get; set; }
    public DocumentLibraryController(AppDbContext db, IDocumentAssistant assistant) { this.db = db; this.assistant = assistant; }
    private bool CanWork => User.IsInRole("Admin") || User.IsInRole("Developer") || User.IsInRole("SuperAdmin");
    private bool CanRead => CanWork || User.IsInRole("Bid Manager");
    private bool IsAdmin => User.IsInRole("Admin") || User.IsInRole("SuperAdmin");
    private string Actor => User.Identity?.Name ?? "";

    static string? Code(string? code) { var value = (code ?? "").Trim(); return value.Length is > 0 and <= 120 ? value : null; }
    static string? CategoryOf(string? value) { var v = (value ?? "").Trim(); return Categories.FirstOrDefault(c => string.Equals(c, v, StringComparison.OrdinalIgnoreCase)); }
    // Same initiative whatever the letter case typed in the GOTO field; earlier attachments are found too.
    IQueryable<InitiativeDocument> Docs(string code) { var key = code.ToLower(); return db.InitiativeDocuments.Where(d => d.AmbienteId == GetAmbienteId() && d.Goto.ToLower() == key); }

    public static string SuggestCategory(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() is ".eml" or ".msg" ? "Email e comunicazioni" : DefaultCategory;

    static string? ValidateName(string? raw, out string name)
    {
        name = Path.GetFileName((raw ?? "").Replace('\\', '/')).Trim();
        if (name.Length == 0 || name.Length > 255 || name.Any(char.IsControl)) return "Nome file non valido.";
        if (Blocked.Contains(Path.GetExtension(name))) return $"Il formato {Path.GetExtension(name).ToLowerInvariant()} non è ammesso: è un file eseguibile.";
        return null;
    }
    void Log(InitiativeDocument d, string action, string detail) =>
        db.InitiativeDocumentEvents.Add(new InitiativeDocumentEvent { AmbienteId = d.AmbienteId, Goto = d.Goto, GroupId = d.GroupId, DocumentId = d.Id, Version = d.Version, Action = action, Detail = detail, Actor = Actor, At = DateTime.UtcNow });

    // Metadata only: the binary content and the index are never loaded for listing or searching.
    public class DocMeta
    {
        public Guid Id { get; set; } public Guid GroupId { get; set; } public string FileName { get; set; } = ""; public string Category { get; set; } = "";
        public long Size { get; set; } public string Sha256 { get; set; } = ""; public string Author { get; set; } = ""; public DateTime CreatedAt { get; set; }
        public int Version { get; set; } public bool IsCurrent { get; set; } public bool AiEnabled { get; set; } public string IndexStatus { get; set; } = ""; public int IndexedChars { get; set; }
        public int IndexVersion { get; set; } public DateTime? IndexedAt { get; set; }
    }
    static IQueryable<DocMeta> Meta(IQueryable<InitiativeDocument> q) => q.Select(d => new DocMeta { Id = d.Id, GroupId = d.GroupId, FileName = d.FileName, Category = d.Category, Size = d.Size, Sha256 = d.Sha256,
        Author = d.Author, CreatedAt = d.CreatedAt, Version = d.Version, IsCurrent = d.IsCurrent, AiEnabled = d.AiEnabled, IndexStatus = d.IndexStatus, IndexedChars = d.IndexedChars, IndexVersion = d.IndexVersion, IndexedAt = d.IndexedAt });

    object View(DocMeta d, int versions) => new
    {
        d.Id, d.GroupId, d.FileName, extension = Path.GetExtension(d.FileName).ToLowerInvariant().TrimStart('.'), d.Category, d.Size, d.Sha256, d.Author, d.CreatedAt, d.Version, versions,
        d.AiEnabled, d.IndexStatus, d.IndexedChars, d.IndexedAt, isMemory = d.Category == MemoryCategory, canDelete = IsAdmin || string.Equals(d.Author, Actor, StringComparison.OrdinalIgnoreCase),
    };
    static DocMeta MetaOf(InitiativeDocument d) => new() { Id = d.Id, GroupId = d.GroupId, FileName = d.FileName, Category = d.Category, Size = d.Size, Sha256 = d.Sha256, Author = d.Author, CreatedAt = d.CreatedAt,
        Version = d.Version, IsCurrent = d.IsCurrent, AiEnabled = d.AiEnabled, IndexStatus = d.IndexStatus, IndexedChars = d.IndexedChars, IndexVersion = d.IndexVersion, IndexedAt = d.IndexedAt };

    [HttpGet("{code}")]
    public async Task<IActionResult> List(string code)
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        if (Code(code) is not { } c) return BadRequest(new { message = "Indica l’iniziativa." });
        var all = await Meta(Docs(c).AsNoTracking().Where(d => d.RemovedAt == null)).ToListAsync();
        var counts = all.GroupBy(r => r.GroupId).ToDictionary(g => g.Key, g => g.Count());
        var current = all.Where(d => d.IsCurrent).OrderByDescending(d => d.CreatedAt).ToList();
        var folders = Categories.Select(name => new { name, count = current.Count(d => d.Category == name) }).ToList();
        return Ok(new
        {
            documents = current.Select(d => View(d, counts.GetValueOrDefault(d.GroupId, 1))).ToList(),
            folders, categories = Categories, historical = all.Count - current.Count,
            pendingIndex = current.Count(d => d.IndexVersion < DocumentIndexer.CurrentIndexVersion), limit = MaxDocumentsPerInitiative,
        });
    }

    [HttpPost("{code}/upload"), RequestSizeLimit(52 * 1024 * 1024)]
    public async Task<IActionResult> Upload(string code, [FromForm] IFormFileCollection files, [FromForm] string? category)
    {
        if (!CanWork || GetAmbienteId() <= 0 || string.IsNullOrWhiteSpace(Actor)) return Forbid();
        if (Code(code) is not { } c) return BadRequest(new { message = "Indica l’iniziativa." });
        if (files == null || files.Count == 0) return BadRequest(new { message = "Seleziona almeno un file." });
        if (files.Count > MaxFilesPerRequest) return BadRequest(new { message = $"Massimo {MaxFilesPerRequest} file per richiesta." });
        var chosen = string.IsNullOrWhiteSpace(category) ? null : CategoryOf(category);
        if (!string.IsNullOrWhiteSpace(category) && chosen == null) return BadRequest(new { message = "Cartella non valida." });
        var existing = await Docs(c).Where(d => d.RemovedAt == null && d.IsCurrent).CountAsync();
        var results = new List<object>();
        foreach (var file in files)
        {
            if (existing >= MaxDocumentsPerInitiative) { results.Add(new { fileName = file.FileName, ok = false, message = $"Limite di {MaxDocumentsPerInitiative} documenti per iniziativa raggiunto." }); continue; }
            if (ValidateName(file.FileName, out var name) is { } nameError) { results.Add(new { fileName = file.FileName, ok = false, message = nameError }); continue; }
            if (file.Length == 0) { results.Add(new { fileName = name, ok = false, message = "Il file è vuoto." }); continue; }
            if (file.Length > MaxFileBytes) { results.Add(new { fileName = name, ok = false, message = "Dimensione massima: 10 MB." }); continue; }
            await using var buffer = new MemoryStream(); await file.CopyToAsync(buffer);
            var bytes = buffer.ToArray();
            var sha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            // Identical bytes are never stored twice; the same name with different bytes must be an explicit new version.
            var same = await Meta(Docs(c).AsNoTracking().Where(d => d.RemovedAt == null && d.IsCurrent && (d.Sha256 == sha || d.FileName.ToLower() == name.ToLower()))).ToListAsync();
            if (same.Any(d => d.Sha256 == sha)) { results.Add(new { fileName = name, ok = false, message = $"Già presente: «{same.First(d => d.Sha256 == sha).FileName}» ha lo stesso contenuto.", existingGroupId = same.First(d => d.Sha256 == sha).GroupId }); continue; }
            if (same.Count > 0) { results.Add(new { fileName = name, ok = false, message = $"Esiste già un documento chiamato «{same[0].FileName}» con contenuto diverso. Caricalo come nuova versione per conservare lo storico.", existingGroupId = same[0].GroupId, canVersion = true }); continue; }
            var document = new InitiativeDocument { AmbienteId = GetAmbienteId(), Goto = c, FileName = name, Size = bytes.LongLength, Author = Actor, CreatedAt = DateTime.UtcNow, Content = bytes,
                Sha256 = sha, Category = chosen ?? SuggestCategory(name) };
            DocumentIndexer.Index(document);
            db.InitiativeDocuments.Add(document);
            Log(document, "caricato", $"{document.Category} · {document.Size} byte");
            await db.SaveChangesAsync();
            existing++;
            results.Add(new { fileName = name, ok = true, message = "", document = View(MetaOf(document), 1) });
        }
        return Ok(new { results });
    }

    [HttpPost("{code}/groups/{groupId:guid}/versions"), RequestSizeLimit(12 * 1024 * 1024)]
    public async Task<IActionResult> NewVersion(string code, Guid groupId, [FromForm] IFormFile file, [FromForm] int expectedVersion)
    {
        if (!CanWork || GetAmbienteId() <= 0 || string.IsNullOrWhiteSpace(Actor)) return Forbid();
        if (Code(code) is not { } c) return BadRequest(new { message = "Indica l’iniziativa." });
        var current = await Meta(Docs(c).AsNoTracking().Where(d => d.GroupId == groupId && d.IsCurrent && d.RemovedAt == null)).SingleOrDefaultAsync();
        if (current == null) return NotFound();
        if (file == null || file.Length == 0) return BadRequest(new { message = "Seleziona il file della nuova versione." });
        if (file.Length > MaxFileBytes) return BadRequest(new { message = "Dimensione massima: 10 MB." });
        if (ValidateName(file.FileName, out var name) is { } nameError) return BadRequest(new { message = nameError });
        // Early, cheap refusal with a precise message. The atomic switch below enforces the same rule under concurrency.
        if (current.Version != expectedVersion) return Conflict(new { message = $"Un collega ha già caricato la versione {current.Version}. Aggiorna l’elenco e riprova." });
        await using var buffer = new MemoryStream(); await file.CopyToAsync(buffer);
        var bytes = buffer.ToArray();
        var sha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        if (sha == current.Sha256) return Conflict(new { message = "Il file è identico alla versione corrente: nessuna nuova versione creata." });
        var next = new InitiativeDocument { AmbienteId = GetAmbienteId(), Goto = (await Docs(c).AsNoTracking().Where(d => d.Id == current.Id).Select(d => d.Goto).SingleAsync()), GroupId = groupId, Version = current.Version + 1, FileName = name, Size = bytes.LongLength,
            Author = Actor, CreatedAt = DateTime.UtcNow, Content = bytes, Sha256 = sha, Category = current.Category, AiEnabled = current.AiEnabled, IsCurrent = true };
        DocumentIndexer.Index(next);
        if (BeforeVersionSwitch != null) await BeforeVersionSwitch();
        // Flip and insert in one transaction: if a colleague got there first, the flip updates no row and nothing is written.
        await using var transaction = await db.Database.BeginTransactionAsync();
        var flipped = await db.InitiativeDocuments.Where(d => d.Id == current.Id && d.IsCurrent && d.Version == expectedVersion).ExecuteUpdateAsync(set => set.SetProperty(d => d.IsCurrent, false));
        if (flipped != 1) { await transaction.RollbackAsync(); return Conflict(new { message = "Un collega ha caricato una versione nello stesso momento. Aggiorna l’elenco e riprova." }); }
        db.InitiativeDocuments.Add(next);
        Log(next, "nuova versione", $"v{current.Version} → v{next.Version}");
        try { await db.SaveChangesAsync(); await transaction.CommitAsync(); }
        catch (DbUpdateException) { await transaction.RollbackAsync(); db.ChangeTracker.Clear(); return Conflict(new { message = "Un collega ha caricato una versione nello stesso momento. Aggiorna l’elenco e riprova." }); }
        return Ok(View(MetaOf(next), next.Version));
    }

    [HttpPut("{code}/groups/{groupId:guid}")]
    public async Task<IActionResult> Update(string code, Guid groupId, UpdateDocumentRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || string.IsNullOrWhiteSpace(Actor)) return Forbid();
        if (Code(code) is not { } c) return BadRequest(new { message = "Indica l’iniziativa." });
        var rows = await Meta(Docs(c).AsNoTracking().Where(d => d.GroupId == groupId && d.RemovedAt == null)).ToListAsync();
        var current = rows.SingleOrDefault(d => d.IsCurrent);
        if (current == null) return NotFound();
        var group = Docs(c).Where(d => d.GroupId == groupId && d.RemovedAt == null);
        if (request.Category != null)
        {
            if (CategoryOf(request.Category) is not { } category) return BadRequest(new { message = "Cartella non valida." });
            if (category != current.Category)
            {
                await group.ExecuteUpdateAsync(set => set.SetProperty(d => d.Category, category));
                db.InitiativeDocumentEvents.Add(new InitiativeDocumentEvent { AmbienteId = GetAmbienteId(), Goto = c, GroupId = groupId, DocumentId = current.Id, Version = current.Version, Action = "cartella", Detail = $"{current.Category} → {category}", Actor = Actor, At = DateTime.UtcNow });
                current.Category = category;
            }
        }
        if (request.AiEnabled is bool enabled && enabled != current.AiEnabled)
        {
            await group.ExecuteUpdateAsync(set => set.SetProperty(d => d.AiEnabled, enabled));
            db.InitiativeDocumentEvents.Add(new InitiativeDocumentEvent { AmbienteId = GetAmbienteId(), Goto = c, GroupId = groupId, DocumentId = current.Id, Version = current.Version, Action = enabled ? "ai-attivata" : "ai-disattivata",
                Detail = enabled ? "Il documento è usato come contesto AI" : "Il documento non è più usato come contesto AI", Actor = Actor, At = DateTime.UtcNow });
            current.AiEnabled = enabled;
        }
        await db.SaveChangesAsync();
        return Ok(View(current, rows.Count));
    }

    [HttpDelete("{code}/groups/{groupId:guid}")]
    public async Task<IActionResult> Delete(string code, Guid groupId)
    {
        if (!CanWork || GetAmbienteId() <= 0 || string.IsNullOrWhiteSpace(Actor)) return Forbid();
        if (Code(code) is not { } c) return BadRequest(new { message = "Indica l’iniziativa." });
        var rows = await Meta(Docs(c).AsNoTracking().Where(d => d.GroupId == groupId && d.RemovedAt == null)).ToListAsync();
        var current = rows.SingleOrDefault(d => d.IsCurrent);
        if (current == null) return NotFound();
        // Deleting is for the person who uploaded the current version, or an administrator.
        if (!IsAdmin && !string.Equals(current.Author, Actor, StringComparison.OrdinalIgnoreCase)) return StatusCode(403, new { message = "Puoi eliminare solo i documenti che hai caricato tu. Chiedi a un amministratore." });
        var now = DateTime.UtcNow; var actor = Actor;
        // Removal is logical: originals and history stay in the database.
        await Docs(c).Where(d => d.GroupId == groupId && d.RemovedAt == null).ExecuteUpdateAsync(set => set.SetProperty(d => d.RemovedAt, now).SetProperty(d => d.RemovedBy, actor));
        db.InitiativeDocumentEvents.Add(new InitiativeDocumentEvent { AmbienteId = GetAmbienteId(), Goto = c, GroupId = groupId, DocumentId = current.Id, Version = current.Version, Action = "eliminato", Detail = $"{rows.Count} {(rows.Count == 1 ? "versione" : "versioni")}", Actor = actor, At = now });
        await db.SaveChangesAsync();
        return Ok(new { groupId, removed = rows.Count });
    }

    [HttpGet("{code}/groups/{groupId:guid}/history")]
    public async Task<IActionResult> History(string code, Guid groupId)
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        if (Code(code) is not { } c) return BadRequest(new { message = "Indica l’iniziativa." });
        var versions = await Meta(Docs(c).AsNoTracking().Where(d => d.GroupId == groupId)).ToListAsync();
        if (versions.Count == 0) return NotFound();
        var removed = await Docs(c).AsNoTracking().Where(d => d.GroupId == groupId && d.RemovedAt != null).Select(d => d.Id).ToListAsync();
        var key = c.ToLower();
        var events = await db.InitiativeDocumentEvents.AsNoTracking().Where(e => e.AmbienteId == GetAmbienteId() && e.GroupId == groupId && e.Goto.ToLower() == key).OrderByDescending(e => e.Id).ToListAsync();
        return Ok(new
        {
            versions = versions.OrderByDescending(d => d.Version).Select(d => new { d.Id, d.Version, d.FileName, d.Size, d.Sha256, d.Author, d.CreatedAt, d.IsCurrent, removed = removed.Contains(d.Id) }).ToList(),
            events = events.Select(e => new { e.Id, e.Action, e.Detail, e.Actor, e.At, e.Version }).ToList(),
        });
    }

    [HttpGet("{code}/search")]
    public async Task<IActionResult> Search(string code, [FromQuery] string? q, [FromQuery] string? category, [FromQuery] string? author, [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] bool versions = false)
    {
        if (!CanRead || GetAmbienteId() <= 0) return Forbid();
        if (Code(code) is not { } c) return BadRequest(new { message = "Indica l’iniziativa." });
        var query = Docs(c).AsNoTracking().Where(d => d.RemovedAt == null);
        if (!versions) query = query.Where(d => d.IsCurrent);
        if (!string.IsNullOrWhiteSpace(category)) { if (CategoryOf(category) is not { } cat) return BadRequest(new { message = "Cartella non valida." }); query = query.Where(d => d.Category == cat); }
        if (!string.IsNullOrWhiteSpace(author)) { var a = author.Trim().ToLower(); query = query.Where(d => d.Author.ToLower().Contains(a)); }
        if (from is DateTime f) { var start = DateTime.SpecifyKind(f.Date, DateTimeKind.Utc); query = query.Where(d => d.CreatedAt >= start); }
        if (to is DateTime t) { var end = DateTime.SpecifyKind(t.Date.AddDays(1), DateTimeKind.Utc); query = query.Where(d => d.CreatedAt < end); }
        var terms = DocumentSearch.Terms(q); var phrase = DocumentSearch.Normalize(q);
        var counts = await Docs(c).AsNoTracking().Where(d => d.RemovedAt == null).GroupBy(d => d.GroupId).Select(g => new { g.Key, n = g.Count() }).ToDictionaryAsync(g => g.Key, g => g.n);
        var meta = await Meta(query).ToListAsync();

        if (terms.Count == 0)
            return Ok(new { query = q ?? "", terms, truncated = meta.Count > MaxSearchDocuments * 4,
                results = meta.OrderByDescending(d => d.CreatedAt).Take(MaxSearchDocuments * 4).Select(d => new { document = View(d, counts.GetValueOrDefault(d.GroupId, 1)), nameMatch = false, score = 0.0, snippets = new List<Snippet>() }).ToList() });

        // The database filters on the flattened index; only the matching documents' extractions are then read.
        var contentIds = new HashSet<Guid>();
        foreach (var term in terms)
            foreach (var id in await query.Where(d => d.SearchText != null && d.SearchText.Contains(term)).Select(d => d.Id).ToListAsync()) contentIds.Add(id);
        var hits = meta.Select(d => (d, name: terms.Any(t => DocumentSearch.Normalize(d.FileName).Contains(t, StringComparison.Ordinal)), content: contentIds.Contains(d.Id))).Where(x => x.name || x.content).ToList();
        var extractions = await Docs(c).AsNoTracking().Where(d => contentIds.Contains(d.Id)).OrderByDescending(d => d.CreatedAt).Take(40).Select(d => new { d.Id, d.Extraction }).ToDictionaryAsync(d => d.Id, d => d.Extraction);
        var scored = new List<(DocMeta d, bool name, double score, List<Snippet> snippets)>();
        foreach (var (d, name, content) in hits)
        {
            var snippets = new List<Snippet>();
            if (content && extractions.GetValueOrDefault(d.Id) is { Length: > 0 } json)
                try { snippets = DocumentSearch.Rank(JsonSerializer.Deserialize<DocumentExtraction>(json, InitiativeWorkspaceController.JsonOptions)!.Passages.Select(p => new SearchPassage(p.Location, p.Text)), q ?? "", 3); }
                catch (JsonException) { }
            var score = snippets.Count > 0 ? snippets[0].Score : (content ? 1 : 0);
            if (name) score += 6 + (DocumentSearch.Normalize(d.FileName).Contains(phrase, StringComparison.Ordinal) ? 4 : 0);
            scored.Add((d, name, score, snippets));
        }
        var top = scored.OrderByDescending(x => x.score).ThenByDescending(x => x.d.CreatedAt).Take(MaxSearchDocuments).ToList();
        return Ok(new
        {
            query = q ?? "", terms, truncated = scored.Count > top.Count,
            results = top.Select(x => new { document = View(x.d, counts.GetValueOrDefault(x.d.GroupId, 1)), nameMatch = x.name, score = Math.Round(x.score, 2), snippets = x.snippets }).ToList(),
        });
    }

    // Indexes documents uploaded before the workspace existed, or with an older extractor, a few at a time.
    [HttpPost("{code}/reindex")]
    public async Task<IActionResult> Reindex(string code)
    {
        if (!CanWork || GetAmbienteId() <= 0) return Forbid();
        if (Code(code) is not { } c) return BadRequest(new { message = "Indica l’iniziativa." });
        var pending = await Docs(c).Where(d => d.RemovedAt == null && d.IsCurrent && d.IndexVersion < DocumentIndexer.CurrentIndexVersion).OrderBy(d => d.CreatedAt).Take(ReindexBatch).ToListAsync();
        foreach (var d in pending) DocumentIndexer.Index(d);
        await db.SaveChangesAsync();
        var remaining = await Docs(c).CountAsync(d => d.RemovedAt == null && d.IsCurrent && d.IndexVersion < DocumentIndexer.CurrentIndexVersion);
        return Ok(new { indexed = pending.Count, remaining });
    }

    [HttpPost("{code}/ask")]
    public async Task<IActionResult> Ask(string code, AskDocumentsRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0) return Forbid();
        if (Code(code) is not { } c) return BadRequest(new { message = "Indica l’iniziativa." });
        var question = (request.Question ?? "").Trim();
        if (question.Length == 0) return BadRequest(new { message = "Scrivi una domanda." });
        if (question.Length > MaxQuestion) return BadRequest(new { message = $"La domanda supera {MaxQuestion} caratteri." });
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Forbid();
        var user = await db.Users.FindAsync(userId);
        if (user == null || !user.IsActive) return Forbid();
        var passages = await DocumentRetrieval.RetrieveAsync(db, GetAmbienteId(), c, question);
        // Without matching passages the AI is not called at all: it would have nothing to answer from.
        if (passages.Count == 0)
            return Ok(new { answer = "Nei documenti dell’iniziativa non ho trovato passaggi pertinenti a questa domanda. Prova con altre parole, oppure carica o abilita all’AI i documenti che ne parlano.", citations = new List<string>(), sources = new List<object>(), noSources = true });
        try
        {
            var (answer, model) = await assistant.AskAsync(new DocumentAskRequest(question, JsonSerializer.Serialize(DocumentRetrieval.ForAi(passages))),
                new AppUserAiSettings(user.AiApiKey, user.AiEndpoint, user.AiModel, user.AiStyle, user.AiAuthMode));
            if (answer == null) return StatusCode(502, new { message = "Il servizio AI non ha risposto nel formato richiesto. Riprova." });
            return Ok(new
            {
                answer = answer.Answer, answer.Citations, model, noSources = false,
                sources = passages.Select((p, i) => new { n = i + 1, p.DocumentId, p.FileName, p.Version, p.Category, p.Location, p.Text, p.Score }).ToList(),
            });
        }
        catch (Exception) { return StatusCode(502, new { message = "Il servizio AI non è raggiungibile o la configurazione AI personale non è valida." }); }
    }
}

public record UpdateDocumentRequest(string? Category, bool? AiEnabled);
public record AskDocumentsRequest(string? Question);
