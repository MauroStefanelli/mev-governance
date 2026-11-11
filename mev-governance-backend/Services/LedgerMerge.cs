using System.Text.Json;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Services;

public record LedgerRow(string Key, string? Goto, string Title, string System, string? PmPoste, string Status, string? Release, string? PlannedRelease,
    DateTime? CollaudoDate, string? CollaudoText, string? Notes, string? Released, string? Missing, string? AmountsJson);
public record FieldChange(string Field, string? From, string? To);

// Decides what a file row does to an existing initiative. Rules, in short:
//  - same identity, same content  -> nothing happens (importing the same file twice changes nothing);
//  - same identity, newer values  -> the fields change and each change is recorded with its old value;
//  - a field the file leaves empty NEVER erases a value already known: the app may hold more than the file;
//  - an older file never overwrites newer data (see IsStale);
//  - an initiative missing from the file is left alone: a file is a snapshot, not a deletion order.
public static class LedgerMerge
{
    public static readonly string[] Statuses = { "rilasciata", "parziale", "approvata", "in-approvazione", "in-analisi", "cr-da-stimare" };
    public static readonly string[] Fields = { "goto", "title", "system", "pmPoste", "status", "release", "plannedRelease", "collaudoDate", "collaudoText", "notes", "released", "missing", "amounts" };
    public static readonly Dictionary<string, string> Labels = new()
    {
        ["goto"] = "GOTO", ["title"] = "Titolo", ["system"] = "Sistema", ["pmPoste"] = "PM Poste", ["status"] = "Stato", ["release"] = "Release", ["plannedRelease"] = "Release prevista",
        ["collaudoDate"] = "Rilascio al collaudo", ["collaudoText"] = "Rilascio al collaudo", ["notes"] = "Note", ["released"] = "Cosa è rilasciato", ["missing"] = "Cosa manca", ["amounts"] = "Importi",
    };

    // A calendar date (the file says "25/11/2026") has no time zone: it is written exactly as stored, never converted.
    public static string? Date(DateTime? value) => value?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
    static string? Norm(string? value) { var t = (value ?? "").Trim(); return t.Length == 0 ? null : t; }

    public static Dictionary<string, string?> Snapshot(LedgerInitiative i) => new()
    {
        ["goto"] = Norm(i.Goto), ["title"] = Norm(i.Title), ["system"] = Norm(i.System), ["pmPoste"] = Norm(i.PmPoste), ["status"] = Norm(i.Status), ["release"] = Norm(i.Release),
        ["plannedRelease"] = Norm(i.PlannedRelease), ["collaudoDate"] = Date(i.CollaudoDate), ["collaudoText"] = Norm(i.CollaudoText), ["notes"] = Norm(i.Notes), ["released"] = Norm(i.Released),
        ["missing"] = Norm(i.Missing), ["amounts"] = Norm(i.AmountsJson),
    };
    public static Dictionary<string, string?> Snapshot(LedgerRow r) => new()
    {
        ["goto"] = Norm(r.Goto), ["title"] = Norm(r.Title), ["system"] = Norm(r.System), ["pmPoste"] = Norm(r.PmPoste), ["status"] = Norm(r.Status), ["release"] = Norm(r.Release),
        ["plannedRelease"] = Norm(r.PlannedRelease), ["collaudoDate"] = Date(r.CollaudoDate), ["collaudoText"] = Norm(r.CollaudoText), ["notes"] = Norm(r.Notes), ["released"] = Norm(r.Released),
        ["missing"] = Norm(r.Missing), ["amounts"] = Norm(r.AmountsJson),
    };

    // Which fields the file would change. A value the file does not give is skipped, a value it gives and differs is a change.
    public static List<FieldChange> Changes(LedgerInitiative existing, LedgerRow incoming)
    {
        var before = Snapshot(existing); var after = Snapshot(incoming); var changes = new List<FieldChange>();
        foreach (var field in Fields)
        {
            var to = after[field]; var from = before[field];
            if (to == null) continue;
            if (field == "collaudoText" && after["collaudoDate"] != null) continue; // the date is the structured form of the same fact
            if (!string.Equals(from, to, StringComparison.Ordinal)) changes.Add(new FieldChange(field, from, to));
        }
        return changes;
    }

    // A file older than the data we hold must not overwrite it: it only fills what is still empty.
    public static bool IsStale(LedgerInitiative existing, DateTime? fileDate) => fileDate != null && existing.SourceDate != null && fileDate < existing.SourceDate;
    public static List<FieldChange> OnlyFillingGaps(List<FieldChange> changes) => changes.Where(c => c.From == null).ToList();

    public static void Apply(LedgerInitiative target, IEnumerable<FieldChange> changes)
    {
        foreach (var change in changes)
            switch (change.Field)
            {
                case "goto": target.Goto = change.To; break;
                case "title": target.Title = change.To ?? target.Title; break;
                case "system": target.System = change.To ?? target.System; break;
                case "pmPoste": target.PmPoste = change.To; break;
                case "status": target.Status = change.To ?? target.Status; break;
                case "release": target.Release = change.To; break;
                case "plannedRelease": target.PlannedRelease = change.To; break;
                case "collaudoDate": target.CollaudoDate = change.To == null ? null : DateTime.SpecifyKind(DateTime.ParseExact(change.To, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture), DateTimeKind.Utc); break;
                case "collaudoText": target.CollaudoText = change.To; break;
                case "notes": target.Notes = change.To; break;
                case "released": target.Released = change.To; break;
                case "missing": target.Missing = change.To; break;
                case "amounts": target.AmountsJson = change.To; break;
            }
    }

    public static string Describe(IEnumerable<FieldChange> changes)
    {
        var list = changes.ToList();
        if (list.Count == 0) return "Nessuna modifica";
        string One(FieldChange c) => c.Field == "status" ? $"Stato: {StatusLabel(c.From)} → {StatusLabel(c.To)}" : c.From == null ? $"{Labels[c.Field]}: {Short(c.To)}" : $"{Labels[c.Field]}: {Short(c.From)} → {Short(c.To)}";
        return string.Join(" · ", list.Take(4).Select(One)) + (list.Count > 4 ? $" · +{list.Count - 4}" : "");
    }
    static string Short(string? v) { var t = v ?? "—"; return t.Length > 60 ? t[..60] + "…" : t; }
    public static string StatusLabel(string? id) => id switch
    {
        "rilasciata" => "Rilasciata", "parziale" => "Rilasciata parzialmente", "approvata" => "Approvata", "in-approvazione" => "In approvazione",
        "in-analisi" => "In analisi / stima", "cr-da-stimare" => "CR da stimare", null => "—", _ => id,
    };
    public static string ToJson(IEnumerable<FieldChange> changes) => JsonSerializer.Serialize(changes.Select(c => new { field = c.Field, label = Labels[c.Field], from = c.From, to = c.To }));
}
