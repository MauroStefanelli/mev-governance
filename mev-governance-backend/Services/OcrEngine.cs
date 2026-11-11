using System.Diagnostics;
using System.Text;

namespace MevGovernanceBackend.Services;

public record OcrResult(string Status, string Text, string Message, string? Language = null);

// Text recognition for images. Behind an interface so the controller can be tested without the engine installed,
// and so that a missing engine is reported honestly instead of pretending an image was read.
public interface IOcrEngine
{
    bool IsAvailable { get; }
    Task<OcrResult> ReadAsync(byte[] image, string fileName, CancellationToken cancel = default);
}

public static class OcrSupport
{
    public static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp" };
    public static bool IsImage(string fileName) => ImageExtensions.Contains(Path.GetExtension(fileName));
    // SVG is XML text, not a raster image: it is read by the normal extractor and never needs OCR.
    public const long MaxImageBytes = 10 * 1024 * 1024;
}

// Runs the Tesseract command line tool, if installed. The image is passed through standard input and the result is read
// from standard output: nothing is written to disk and no file name from the user ever reaches a command line.
public class TesseractOcrEngine : IOcrEngine
{
    public static readonly string[] Preferred = { "ita+eng", "eng" };
    public const int TimeoutSeconds = 60;
    private readonly string executable;
    private readonly Lazy<string?> language;
    public TesseractOcrEngine() : this(Environment.GetEnvironmentVariable("TESSERACT_PATH") ?? "tesseract") { }
    public TesseractOcrEngine(string executable)
    {
        this.executable = executable;
        language = new Lazy<string?>(DetectLanguage);
    }

    public bool IsAvailable => language.Value != null;

    string? DetectLanguage()
    {
        try
        {
            var (code, output) = Run(new[] { "--list-langs" }, null, 10);
            if (code != 0) return null;
            var installed = output.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0 && !l.StartsWith("List of")).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (installed.Count == 0) return null;
            // Italian is preferred together with English; English alone is a documented fallback; otherwise whatever is installed.
            if (installed.Contains("ita") && installed.Contains("eng")) return "ita+eng";
            if (installed.Contains("eng")) return "eng";
            return installed.FirstOrDefault(l => l != "osd");
        }
        catch (Exception) { return null; }
    }

    (int Code, string Output) Run(string[] args, byte[]? input, int timeoutSeconds)
    {
        var info = new ProcessStartInfo(executable) { RedirectStandardInput = input != null, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, StandardOutputEncoding = Encoding.UTF8 };
        foreach (var a in args) info.ArgumentList.Add(a);
        using var process = Process.Start(info) ?? throw new InvalidOperationException("OCR non avviabile.");
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        if (input != null) { try { process.StandardInput.BaseStream.Write(input, 0, input.Length); process.StandardInput.Close(); } catch (IOException) { } }
        if (!process.WaitForExit(timeoutSeconds * 1000)) { try { process.Kill(true); } catch (InvalidOperationException) { } throw new TimeoutException(); }
        process.WaitForExit();
        return (process.ExitCode, stdout.Result + (process.ExitCode == 0 ? "" : stderr.Result));
    }

    public Task<OcrResult> ReadAsync(byte[] image, string fileName, CancellationToken cancel = default)
    {
        var lang = language.Value;
        if (lang == null) return Task.FromResult(new OcrResult("unavailable", "", "Il motore OCR non è installato su questo server: l’immagine è conservata ma il testo non è stato letto."));
        return Task.Run(() =>
        {
            try
            {
                var (code, output) = Run(new[] { "stdin", "stdout", "-l", lang, "--psm", "3" }, image, TimeoutSeconds);
                if (code != 0) return new OcrResult("failed", "", "Il motore OCR non è riuscito a leggere l’immagine (formato non supportato o file danneggiato).", lang);
                var text = Normalize(output);
                return text.Length == 0
                    ? new OcrResult("empty", "", "L’OCR non ha trovato testo leggibile nell’immagine.", lang)
                    : new OcrResult("done", text, "Testo riconosciuto automaticamente: può contenere errori, da verificare sull’immagine.", lang);
            }
            catch (TimeoutException) { return new OcrResult("failed", "", $"L’OCR ha superato il tempo massimo di {TimeoutSeconds} secondi.", lang); }
            catch (Exception) { return new OcrResult("failed", "", "L’OCR non è riuscito a leggere l’immagine.", lang); }
        }, cancel);
    }

    static string Normalize(string raw) => string.Join("\n", raw.Replace("\r", "").Split('\n').Select(l => l.TrimEnd()).Where(l => l.Trim().Length > 0)).Trim();
}
