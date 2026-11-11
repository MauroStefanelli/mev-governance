using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using ClosedXML.Excel;
using UglyToad.PdfPig;

namespace MevGovernanceBackend.Services;

public record DocumentPassage(string Location, string Text);
public record DocumentExtraction(string Status, string Message, List<DocumentPassage> Passages, string ExtractorVersion = InitiativeDocumentExtractor.Version);

public static class InitiativeDocumentExtractor
{
    public const string Version = "3";
    public const int MaxCharacters = 500000;
    public const int MaxArchiveEntries = 500;
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
                case ".pptx":
                    using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
                    {
                        XNamespace drawing = "http://schemas.openxmlformats.org/drawingml/2006/main";
                        var slides = zip.Entries.Where(e => System.Text.RegularExpressions.Regex.IsMatch(e.FullName, @"^ppt/slides/slide\d+\.xml$"))
                            .OrderBy(e => int.Parse(System.Text.RegularExpressions.Regex.Match(e.Name, @"\d+").Value)).ToList();
                        if (slides.Count == 0) throw new InvalidDataException();
                        foreach (var slide in slides)
                        {
                            if (slide.Length > 8 * 1024 * 1024) throw new InvalidDataException();
                            using var source = slide.Open();
                            var xml = XDocument.Load(source);
                            var number = System.Text.RegularExpressions.Regex.Match(slide.Name, @"\d+").Value;
                            Add($"slide {number}", string.Join("\n", xml.Descendants(drawing + "p").Select(p => string.Concat(p.Descendants(drawing + "t").Select(t => t.Value))).Where(t => t.Length > 0)));
                            if (remaining <= 0) { truncated = true; break; }
                        }
                    }
                    break;
                case ".html": case ".htm": case ".svg":
                    {
                        using var reader = new StreamReader(stream, new UTF8Encoding(false, false), true);
                        var markup = reader.ReadToEnd();
                        markup = System.Text.RegularExpressions.Regex.Replace(markup, @"<(script|style)\b[^>]*>.*?</\1\s*>", " ", System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                        var text = System.Net.WebUtility.HtmlDecode(System.Text.RegularExpressions.Regex.Replace(markup, @"<[^>]+>", "\n"));
                        var lineNumber = 0;
                        foreach (var line in text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0)) { Add($"riga {++lineNumber}", line); if (remaining <= 0) { truncated = true; break; } }
                    }
                    break;
                case ".eml":
                    {
                        var mail = EmailParser.Parse(content);
                        Add("intestazioni", mail.Headers);
                        var lineNumber = 0;
                        foreach (var line in mail.Body.Split('\n').Select(l => l.TrimEnd('\r')).Where(l => l.Trim().Length > 0)) { Add($"corpo · riga {++lineNumber}", line); if (remaining <= 0) { truncated = true; break; } }
                        if (mail.Attachments.Count > 0) Add("allegati", string.Join(", ", mail.Attachments));
                    }
                    break;
                case ".zip":
                    using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
                    {
                        var names = zip.Entries.Where(e => !string.IsNullOrEmpty(e.Name)).Select(e => e.FullName).ToList();
                        if (names.Count == 0) return new("empty", "Archivio vuoto.", passages);
                        // Only the names are indexed: contents are never unpacked, to stay safe from archive bombs.
                        Add("elenco file", string.Join("\n", names.Take(MaxArchiveEntries)));
                        return new("partial", "Archivio ZIP: sono indicizzati solo i nomi dei file contenuti, non il loro contenuto. Scarica e apri l’archivio per leggerli.", passages);
                    }
                default:
                    return new("unsupported", "Formato non supportato per l’estrazione del testo (es. immagini, DOC/XLS/PPT, MSG, RAR). L’originale resta disponibile e il nome del file è ricercabile.", passages);
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
