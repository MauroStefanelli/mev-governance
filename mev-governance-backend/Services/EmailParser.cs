using System.Text;
using System.Text.RegularExpressions;

namespace MevGovernanceBackend.Services;

public record ParsedEmail(string Headers, string Body, List<string> Attachments);

// Minimal RFC 5322 / MIME reader for .eml files: headers, the first readable text part and the attachment names.
// It never executes or renders anything: it only decodes text.
public static class EmailParser
{
    const int MaxDepth = 4;
    public static ParsedEmail Parse(byte[] content)
    {
        var text = Encoding.UTF8.GetString(content);
        var attachments = new List<string>();
        var (headers, body) = Split(text);
        var h = ParseHeaders(headers);
        var shown = string.Join("\n", new[] { "Da", "A", "Cc", "Oggetto", "Data" }.Zip(new[] { "from", "to", "cc", "subject", "date" })
            .Select(pair => (Label: pair.First, Value: Decode(h.GetValueOrDefault(pair.Second) ?? "")))
            .Where(x => x.Value.Length > 0).Select(x => $"{x.Label}: {x.Value}"));
        var bodyText = ReadPart(h, body, attachments, 0);
        return new ParsedEmail(shown, bodyText.Trim(), attachments);
    }

    static (string Headers, string Body) Split(string text)
    {
        var match = Regex.Match(text, @"\r?\n\r?\n");
        return match.Success ? (text[..match.Index], text[(match.Index + match.Length)..]) : (text, "");
    }
    static Dictionary<string, string> ParseHeaders(string raw)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        string? name = null;
        foreach (var line in raw.Split('\n').Select(l => l.TrimEnd('\r')))
        {
            if ((line.StartsWith(' ') || line.StartsWith('\t')) && name != null) { result[name] += " " + line.Trim(); continue; }
            var colon = line.IndexOf(':');
            if (colon <= 0) { name = null; continue; }
            name = line[..colon].Trim().ToLowerInvariant();
            result[name] = line[(colon + 1)..].Trim();
        }
        return result;
    }
    static string Param(string header, string key)
    {
        var m = Regex.Match(header, key + @"\s*=\s*(?:""([^""]*)""|([^;\s]+))", RegexOptions.IgnoreCase);
        return m.Success ? (m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value) : "";
    }

    static string ReadPart(Dictionary<string, string> headers, string body, List<string> attachments, int depth)
    {
        var type = (headers.GetValueOrDefault("content-type") ?? "text/plain").ToLowerInvariant();
        var disposition = headers.GetValueOrDefault("content-disposition") ?? "";
        var fileName = Decode(Param(disposition, "filename") is { Length: > 0 } f ? f : Param(type, "name"));
        if (fileName.Length > 0 && attachments.Count < 50) { attachments.Add(fileName); return ""; }
        if (type.StartsWith("multipart/") && depth < MaxDepth)
        {
            var boundary = Param(headers.GetValueOrDefault("content-type") ?? "", "boundary");
            if (boundary.Length == 0) return "";
            var parts = body.Split("--" + boundary).Skip(1).Where(p => !p.TrimStart().StartsWith("--")).ToList();
            var plain = new StringBuilder(); string html = "";
            foreach (var part in parts)
            {
                var (rawHeaders, partBody) = Split(part.TrimStart('\r', '\n'));
                var partHeaders = ParseHeaders(rawHeaders);
                var partType = (partHeaders.GetValueOrDefault("content-type") ?? "text/plain").ToLowerInvariant();
                var text = ReadPart(partHeaders, partBody, attachments, depth + 1);
                if (text.Length == 0) continue;
                if (partType.StartsWith("text/html")) html = text; else plain.AppendLine(text);
            }
            return plain.Length > 0 ? plain.ToString() : html;
        }
        if (!type.StartsWith("text/")) return "";
        var decoded = DecodeBody(body, headers.GetValueOrDefault("content-transfer-encoding") ?? "", Param(type, "charset"));
        return type.StartsWith("text/html") ? System.Net.WebUtility.HtmlDecode(Regex.Replace(Regex.Replace(decoded, @"<(script|style)\b[^>]*>.*?</\1\s*>", " ", RegexOptions.Singleline | RegexOptions.IgnoreCase), @"<[^>]+>", "\n")) : decoded;
    }

    static string DecodeBody(string body, string encoding, string charset)
    {
        byte[] bytes;
        switch (encoding.Trim().ToLowerInvariant())
        {
            case "base64":
                try { bytes = Convert.FromBase64String(Regex.Replace(body, @"\s+", "")); } catch (FormatException) { return ""; }
                break;
            case "quoted-printable":
                var decoded = new List<byte>();
                var soft = Regex.Replace(body, @"=\r?\n", "");
                for (var i = 0; i < soft.Length; i++)
                {
                    if (soft[i] == '=' && i + 2 < soft.Length + 0 && Uri.IsHexDigit(soft[i + 1]) && Uri.IsHexDigit(soft[i + 2])) { decoded.Add(Convert.ToByte(soft.Substring(i + 1, 2), 16)); i += 2; }
                    else decoded.AddRange(Encoding.UTF8.GetBytes(soft[i].ToString()));
                }
                bytes = decoded.ToArray();
                break;
            default: bytes = Encoding.UTF8.GetBytes(body); break;
        }
        try { return (charset.Length > 0 ? Encoding.GetEncoding(charset) : Encoding.UTF8).GetString(bytes); }
        catch (ArgumentException) { return Encoding.UTF8.GetString(bytes); }
    }

    // RFC 2047 encoded words in headers: =?utf-8?B?...?= and =?utf-8?Q?...?=
    public static string Decode(string value) => Regex.Replace(value, @"=\?([^?]+)\?([bBqQ])\?([^?]*)\?=", match =>
    {
        try
        {
            var charset = Encoding.GetEncoding(match.Groups[1].Value);
            if (match.Groups[2].Value.ToUpperInvariant() == "B") return charset.GetString(Convert.FromBase64String(match.Groups[3].Value));
            var q = match.Groups[3].Value.Replace('_', ' ');
            var bytes = new List<byte>();
            for (var i = 0; i < q.Length; i++)
                if (q[i] == '=' && i + 2 < q.Length + 0 && Uri.IsHexDigit(q[i + 1]) && Uri.IsHexDigit(q[i + 2])) { bytes.Add(Convert.ToByte(q.Substring(i + 1, 2), 16)); i += 2; } else bytes.Add((byte)q[i]);
            return charset.GetString(bytes.ToArray());
        }
        catch (Exception) { return match.Value; }
    });
}
