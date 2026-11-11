using System.Text.Json;
using MevGovernanceBackend.Controllers;
using MevGovernanceBackend.Models;

namespace MevGovernanceBackend.Services;

// Extracts the text of a document and stores what search and AI retrieval need. Never throws for bad files:
// an unreadable document is still stored and findable by name, with an honest status.
public static class DocumentIndexer
{
    public static readonly int CurrentIndexVersion = int.Parse(InitiativeDocumentExtractor.Version);

    public static void Index(InitiativeDocument document)
    {
        var extraction = InitiativeDocumentExtractor.Extract(document.FileName, document.Content);
        document.Extraction = JsonSerializer.Serialize(extraction, InitiativeWorkspaceController.JsonOptions);
        document.SearchText = DocumentSearch.BuildIndex(extraction.Passages.Select(p => new SearchPassage(p.Location, p.Text)));
        document.IndexedChars = extraction.Passages.Sum(p => p.Text.Length);
        document.IndexStatus = extraction.Status;
        document.IndexVersion = CurrentIndexVersion;
        document.IndexedAt = DateTime.UtcNow;
    }

    public static bool NeedsIndexing(InitiativeDocument document) => document.IndexVersion < CurrentIndexVersion;
}
