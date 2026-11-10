using System.Security.Claims;
using MevGovernanceBackend.Data;
using MevGovernanceBackend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Controllers;

// Who is working on an initiative of the Sviluppo application, who saved last, and the team chat.
// The identity always comes from the token, never from the request body.
[ApiController, Authorize]
[Route("api/configuratore/development")]
public class DevelopmentCollaborationController : BaseController
{
    public static readonly TimeSpan OnlineWindow = TimeSpan.FromSeconds(45);
    public const int MaxMessageLength = 2000;
    private readonly AppDbContext db;
    public DevelopmentCollaborationController(AppDbContext db) => this.db = db;
    private bool CanWork => User.IsInRole("Admin") || User.IsInRole("Developer") || User.IsInRole("SuperAdmin");

    private static string? Normalize(string? code)
    {
        var value = (code ?? "").Trim().ToLowerInvariant();
        return value.Length is > 0 and <= 120 ? value : null;
    }
    private (string Username, string FullName)? Who()
    {
        var username = User.Identity?.Name;
        if (string.IsNullOrWhiteSpace(username)) return null;
        return (username, User.FindFirstValue("fullName") ?? "");
    }
    private object MessageView(DevelopmentMessage m, string me) => new { m.Id, m.Author, m.AuthorFullName, m.CreatedAt, m.Text, mine = m.Author == me };
    private static object UserView(DevelopmentPresence p, string me) => new { p.Username, p.FullName, p.LastSeenAt, isMe = p.Username == me };

    // Upserts the caller's row; a concurrent insert of the same row is retried once as an update.
    private async Task Touch(int environment, string code, (string Username, string FullName) who, DateTime now, bool worked, bool offline = false)
    {
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var row = await db.DevelopmentPresences.SingleOrDefaultAsync(p => p.AmbienteId == environment && p.Goto == code && p.Username == who.Username);
            if (row == null) { row = new DevelopmentPresence { AmbienteId = environment, Goto = code, Username = who.Username }; db.DevelopmentPresences.Add(row); }
            row.FullName = who.FullName;
            row.LastSeenAt = offline ? now - OnlineWindow - OnlineWindow : now;
            if (worked) row.LastWorkedAt = now;
            try { await db.SaveChangesAsync(); return; }
            catch (DbUpdateException) when (attempt == 0) { db.ChangeTracker.Clear(); }
        }
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary()
    {
        if (!CanWork || GetAmbienteId() <= 0 || Who() is not { } who) return Forbid();
        var cutoff = DateTime.UtcNow - OnlineWindow;
        var presences = await db.DevelopmentPresences.AsNoTracking().Where(p => p.AmbienteId == GetAmbienteId()).ToListAsync();
        var counts = await db.DevelopmentMessages.AsNoTracking().Where(m => m.AmbienteId == GetAmbienteId())
            .GroupBy(m => m.Goto).Select(g => new { Goto = g.Key, Count = g.Count() }).ToListAsync();
        var codes = presences.Select(p => p.Goto).Concat(counts.Select(c => c.Goto)).Distinct();
        return Ok(codes.Select(code =>
        {
            var rows = presences.Where(p => p.Goto == code).ToList();
            var last = rows.Where(p => p.LastWorkedAt != null).OrderByDescending(p => p.LastWorkedAt).FirstOrDefault();
            return new
            {
                @goto = code,
                lastWorkedBy = last?.Username, lastWorkedByFullName = last?.FullName, lastWorkedAt = last?.LastWorkedAt,
                online = rows.Where(p => p.LastSeenAt >= cutoff).OrderBy(p => p.FullName).Select(p => UserView(p, who.Username)).ToList(),
                messageCount = counts.FirstOrDefault(c => c.Goto == code)?.Count ?? 0,
            };
        }).ToList());
    }

    [HttpPost("presence")]
    public async Task<IActionResult> Presence(PresenceRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || Who() is not { } who) return Forbid();
        if (Normalize(request.Goto) is not { } code) return BadRequest(new { message = "Indica l’iniziativa (massimo 120 caratteri)." });
        var now = DateTime.UtcNow;
        await Touch(GetAmbienteId(), code, who, now, worked: false);
        var cutoff = now - OnlineWindow;
        var rows = await db.DevelopmentPresences.AsNoTracking().Where(p => p.AmbienteId == GetAmbienteId() && p.Goto == code).ToListAsync();
        var last = rows.Where(p => p.LastWorkedAt != null).OrderByDescending(p => p.LastWorkedAt).FirstOrDefault();
        var messages = request.AfterMessageId is long after
            ? await db.DevelopmentMessages.AsNoTracking().Where(m => m.AmbienteId == GetAmbienteId() && m.Goto == code && m.Id > after).OrderBy(m => m.Id).Take(200).ToListAsync()
            : new List<DevelopmentMessage>();
        return Ok(new
        {
            serverTime = now,
            users = rows.Where(p => p.LastSeenAt >= cutoff).OrderBy(p => p.FullName).Select(p => UserView(p, who.Username)).ToList(),
            messages = messages.Select(m => MessageView(m, who.Username)).ToList(),
            lastWorked = last == null ? null : new { by = last.Username, fullName = last.FullName, at = last.LastWorkedAt, isMe = last.Username == who.Username },
        });
    }

    [HttpPost("worked")]
    public async Task<IActionResult> Worked(CodeRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || Who() is not { } who) return Forbid();
        if (Normalize(request.Goto) is not { } code) return BadRequest(new { message = "Indica l’iniziativa (massimo 120 caratteri)." });
        var now = DateTime.UtcNow;
        await Touch(GetAmbienteId(), code, who, now, worked: true);
        return Ok(new { by = who.Username, fullName = who.FullName, at = now });
    }

    [HttpPost("leave")]
    public async Task<IActionResult> Leave(CodeRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || Who() is not { } who) return Forbid();
        if (Normalize(request.Goto) is not { } code) return BadRequest(new { message = "Indica l’iniziativa (massimo 120 caratteri)." });
        var existing = await db.DevelopmentPresences.AnyAsync(p => p.AmbienteId == GetAmbienteId() && p.Goto == code && p.Username == who.Username);
        if (existing) await Touch(GetAmbienteId(), code, who, DateTime.UtcNow, worked: false, offline: true);
        return Ok(new { left = existing });
    }

    [HttpGet("chat")]
    public async Task<IActionResult> History([FromQuery(Name = "goto")] string? code, [FromQuery] long? before, [FromQuery] int limit = 100)
    {
        if (!CanWork || GetAmbienteId() <= 0 || Who() is not { } who) return Forbid();
        if (Normalize(code) is not { } initiative) return BadRequest(new { message = "Indica l’iniziativa (massimo 120 caratteri)." });
        limit = Math.Clamp(limit, 1, 200);
        var query = db.DevelopmentMessages.AsNoTracking().Where(m => m.AmbienteId == GetAmbienteId() && m.Goto == initiative);
        if (before is long cursor) query = query.Where(m => m.Id < cursor);
        var page = await query.OrderByDescending(m => m.Id).Take(limit + 1).ToListAsync();
        var hasMore = page.Count > limit;
        var messages = page.Take(limit).OrderBy(m => m.Id).Select(m => MessageView(m, who.Username)).ToList();
        return Ok(new { messages, hasMore });
    }

    [HttpPost("chat")]
    public async Task<IActionResult> Send(ChatRequest request)
    {
        if (!CanWork || GetAmbienteId() <= 0 || Who() is not { } who) return Forbid();
        if (Normalize(request.Goto) is not { } code) return BadRequest(new { message = "Indica l’iniziativa (massimo 120 caratteri)." });
        var text = (request.Text ?? "").Trim();
        if (text.Length == 0) return BadRequest(new { message = "Scrivi un messaggio." });
        if (text.Length > MaxMessageLength) return BadRequest(new { message = $"Il messaggio supera {MaxMessageLength} caratteri." });
        var message = new DevelopmentMessage { AmbienteId = GetAmbienteId(), Goto = code, Author = who.Username, AuthorFullName = who.FullName, CreatedAt = DateTime.UtcNow, Text = text };
        db.DevelopmentMessages.Add(message);
        await db.SaveChangesAsync();
        return Ok(MessageView(message, who.Username));
    }
}

public record PresenceRequest(string? Goto, long? AfterMessageId);
public record CodeRequest(string? Goto);
public record ChatRequest(string? Goto, string? Text);
