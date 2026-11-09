using System.Text.Json.Nodes;

namespace MevGovernanceBackend.Services;

public static class CodeArtifactValidation
{
    public static bool SafePath(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 240
        && !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl)
        && path.Split('/').All(part => part.Length > 0 && part is not "." and not ".." and not ".git")
        && !path.Split('/').Any(part => part.Equals(".env", StringComparison.OrdinalIgnoreCase));

    public static JsonArray Validate(JsonObject response, IReadOnlyDictionary<string, string> originalHashes)
    {
        var files = response["files"] as JsonArray ?? (response["result"] as JsonObject)?["files"] as JsonArray;
        if (files == null || files.Count is < 1 or > 12) throw new ArgumentException("La risposta deve contenere da 1 a 12 file reali.");
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new JsonArray();
        foreach (var node in files)
        {
            if (node is not JsonObject file || file["path"] is not JsonValue p || !p.TryGetValue<string>(out var path) || !SafePath(path)
                || !paths.Add(path) || file["content"] is not JsonValue c || !c.TryGetValue<string>(out var content)
                || string.IsNullOrWhiteSpace(content) || content.Length > 60000)
                throw new ArgumentException("File generato non valido: percorso relativo sicuro, contenuto completo e nomi univoci obbligatori.");
            var action = file["action"]?.ToString();
            if (action is not ("create" or "update")) throw new ArgumentException("Sono ammesse solo creazione e modifica di file; nessuna eliminazione.");
            var baseHash = file["baseSha256"]?.ToString() ?? "";
            if (action == "update" && (!originalHashes.TryGetValue(path, out var expected) || baseHash != expected))
                throw new ArgumentException($"Modifica di {path} rifiutata: manca l’originale completo o l’impronta non coincide.");
            if (action == "create" && originalHashes.ContainsKey(path)) throw new ArgumentException($"Il file {path} esiste fra gli originali: non può essere dichiarato nuovo.");
            result.Add(new JsonObject { ["path"] = path, ["action"] = action, ["content"] = content, ["baseSha256"] = action == "update" ? baseHash : "" });
        }
        return result;
    }
}
