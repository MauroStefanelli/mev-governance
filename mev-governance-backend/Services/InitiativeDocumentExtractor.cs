using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using ClosedXML.Excel;
using UglyToad.PdfPig;

namespace MevGovernanceBackend.Services;

public record DocumentPassage(string Location, string Text);
public record DocumentExtraction(string Status, string Message, List<DocumentPassage> Passages, string ExtractorVersion = "2");

public static class InitiativeDocumentExtractor
{
    public const int MaxCharacters = 500000;
    public static DocumentExtraction Extract(string fileName, byte[] content)
    {
        var passages = new List<DocumentPassage>();
        var remaining = MaxCharacters;
        var truncated = false;
        void Add(string location, string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return;
            if (remaining <= 0) { truncated = true; return; }
            if (text.Length > remaining) { text = text[..remaining]; truncated = true; }
            // Keep sections small enough to select individual portions for AI.
            for (var offset = 0; offset < text.Length; offset += 6000)
                passages.Add(new(text.Length > 6000 ? $"{location} · parte {offset / 6000 + 1}" : location,
                    text.Substring(offset, Math.Min(6000, text.Length - offset))));
            remaining -= text.Length;
        }
        try
        {
            using var stream = new MemoryStream(content, false);
            switch (Path.GetExtension(fileName).ToLowerInvariant())
            {
                case ".txt": case ".md": case ".csv": case ".json": case ".xml": case ".log":
                    using (var reader = new StreamReader(stream, new UTF8Encoding(false, true), true))
                    {
                        var lineNumber = 0;
                        while (!reader.EndOfStream && remaining > 0) Add($"riga {++lineNumber}", reader.ReadLine() ?? "");
                        if (!reader.EndOfStream) truncated = true;
                    }
                    break;
                case ".pdf":
                    using (var pdf = PdfDocument.Open(content))
                        foreach (var page in pdf.GetPages())
                        {
                            Add($"pagina {page.Number}", string.Join(" ", page.GetWords().Select(w => w.Text)));
                            if (remaining <= 0) { truncated = true; break; }
                        }
                    break;
                case ".docx":
                    using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
                    {
                        var document = zip.GetEntry("word/document.xml") ?? throw new InvalidDataException();
                        if (document.Length > 8 * 1024 * 1024) throw new InvalidDataException();
                        using var source = document.Open();
                        var xml = XDocument.Load(source);
                        XNamespace word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
                        var index = 0;
                        foreach (var paragraph in xml.Descendants(word + "p"))
                        {
                            Add($"paragrafo {++index}", string.Concat(paragraph.Descendants(word + "t").Select(t => t.Value)));
                            if (remaining <= 0) { truncated = true; break; }
                        }
                    }
                    break;
                case ".xlsx":
                    using (var zip = new ZipArchive(stream, ZipArchiveMode.Read, true))
                        if (zip.Entries.Sum(e => e.Length) > 40 * 1024 * 1024) throw new InvalidDataException();
                    stream.Position = 0;
                    using (var workbook = new XLWorkbook(stream))
                        foreach (var sheet in workbook.Worksheets)
                        {
                            foreach (var row in sheet.RowsUsed())
                            {
                                Add($"foglio {sheet.Name} · riga {row.RowNumber()}", string.Join(" | ", row.CellsUsed().Select(c => $"{c.Address.ColumnLetter}: {(c.HasFormula ? "=" + c.FormulaA1 : c.GetFormattedString())}")));
                                if (remaining <= 0) { truncated = true; break; }
                            }
                            if (remaining <= 0) break;
                        }
                    break;
                default:
                    return new("unsupported", "Formato non supportato per l’estrazione. L’originale resta disponibile.", passages);
            }
            if (passages.Count == 0) return new("empty", "Nessun testo leggibile. Immagini e PDF scansionati richiedono OCR, non disponibile in questa versione.", passages);
            return new(truncated ? "partial" : "ready", truncated
                ? $"Estratto parziale: limite di {MaxCharacters} caratteri raggiunto. Consultare l’originale."
                : "Testo estratto automaticamente, da verificare rispetto all’originale. Immagini, impaginazione e allegati incorporati non sono analizzati.", passages);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            return new("error", "Estrazione non riuscita: file non leggibile, protetto, codifica non supportata o struttura troppo grande. L’originale è conservato.", new());
        }
    }
}
