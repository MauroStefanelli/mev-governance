using System.Text.RegularExpressions;

namespace MevGovernanceBackend.Services;

public record SecretHit(string Rule, int Line);

// Looks for credentials in a note before it is read by anything else. It reports WHICH rule matched and ON WHICH LINE, never the value:
// a report that quoted the secret would be a new leak. A file with a hit is rejected whole, it is not "cleaned".
// The browser runs the same rules before upload (secretScan.js); the server repeats them because it never trusts the browser.
public static class SecretScanner
{
    const RegexOptions Opt = RegexOptions.Compiled | RegexOptions.CultureInvariant;
    static readonly Regex Github = new(@"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b", Opt);
    static readonly Regex OpenShift = new(@"\bsha256~[A-Za-z0-9_-]{20,}", Opt);
    static readonly Regex Jwt = new(@"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}", Opt);
    static readonly Regex Bearer = new(@"\bBearer\s+[A-Za-z0-9._~+/-]{20,}", Opt);
    static readonly Regex PrivateKey = new(@"-----BEGIN [A-Z ]*PRIVATE KEY-----", Opt);
    static readonly Regex Aws = new(@"\bAKIA[0-9A-Z]{16}\b", Opt);
    static readonly Regex UrlCredentials = new(@"\b[a-z][a-z0-9+.-]*://[^\s/:@]+:[^\s/@]{3,}@", Opt | RegexOptions.IgnoreCase);
    static readonly Regex Password = new("""(?:(?:password|passwd|pwd)|\b(?:pass|psw))\b(?:\s*[:=]\s*|[^\n`*"']{0,60}(?:[`"]|\*\*|(?<!\p{L})'))([^`*"'\s<>|,;]{4,})""", Opt | RegexOptions.IgnoreCase);
    static readonly Regex Placeholder = new(@"^(?:x{3,}|\*+|\.{2,}|<.*>|\$\{?\w+\}?|da|di|in|il|la|non|nel|per|e|o|vuota|vuoto|null|none|true|false|placeholder|redatt\w*|omess\w*|hidden|segreto|secret|token|password|chiesta|chiedere)$", Opt | RegexOptions.IgnoreCase);
    static readonly Regex Slug = new(@"^[a-z0-9]+(?:[-_.][a-z0-9]+)+$", Opt);
    static readonly Regex CredentialWord = new(@"\b(?:password|passwd|pwd|token|secret|api[_-]?key|credenzial\w*|pat)\b", Opt | RegexOptions.IgnoreCase);
    static readonly Regex Wikilink = new(@"\[\[[^\]]*\]\]", Opt);
    static readonly Regex Url = new(@"https?://\S+", Opt);
    static readonly Regex LongToken20 = new(@"[A-Za-z0-9_+=/.~-]{20,}", Opt);
    static readonly Regex LongToken14 = new(@"[A-Za-z0-9_+=/.~!@#$%^&*-]{14,}", Opt);
    static readonly Regex ContextWords = new(@"credenzial|token|password|passwd|accesso|access|secret|pat\b|login|sudo|chiave|\bkey\b", Opt | RegexOptions.IgnoreCase);
    static readonly Regex Description = new(@"^description:\s*(.*)$", Opt | RegexOptions.Multiline);
    static readonly Regex OnlyLetters = new(@"^[A-Za-z]+$", Opt);
    static readonly Regex HasLetter = new(@"[A-Za-z]", Opt);
    static readonly Regex HasDigit = new(@"\d", Opt);
    static readonly Regex OnlyDigits = new(@"^\d+$", Opt);
    static readonly Regex HasSymbol = new(@"[!@#$%^&*]", Opt);

    // A note that is about access ("reference-…-access", "token", "credenziali") is read more strictly: any long mixed string counts.
    public static bool SensitiveContext(string fileName, string text)
    {
        var description = Description.Match(text);
        return ContextWords.IsMatch(fileName) || (description.Success && ContextWords.IsMatch(description.Groups[1].Value));
    }

    static bool HasCredentialLikeLongToken(string line, bool strict)
    {
        var clean = Url.Replace(Wikilink.Replace(line, ""), "");
        if (strict)
        {
            foreach (Match m in LongToken14.Matches(clean))
            {
                var t = m.Value;
                if (Slug.IsMatch(t) || t.Contains('/') || OnlyLetters.IsMatch(t)) continue;
                if (HasDigit.IsMatch(t) || HasSymbol.IsMatch(t)) return true;
            }
            return false;
        }
        if (!CredentialWord.IsMatch(line)) return false;
        foreach (Match m in LongToken20.Matches(clean))
        {
            var t = m.Value;
            if (Slug.IsMatch(t) || t.Contains('/')) continue;
            if (HasLetter.IsMatch(t) && HasDigit.IsMatch(t) && !OnlyDigits.IsMatch(t)) return true;
        }
        return false;
    }

    public static IReadOnlyList<SecretHit> Scan(string fileName, string text)
    {
        var hits = new List<SecretHit>();
        var strict = SensitiveContext(fileName ?? "", text ?? "");
        var lines = (text ?? "").Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];
            void Add(string rule) { if (!hits.Any(h => h.Rule == rule && h.Line == i + 1)) hits.Add(new SecretHit(rule, i + 1)); }
            if (Github.IsMatch(line)) Add("token-github");
            if (OpenShift.IsMatch(line)) Add("token-openshift");
            if (Jwt.IsMatch(line)) Add("jwt");
            if (Bearer.IsMatch(line)) Add("bearer");
            if (PrivateKey.IsMatch(line)) Add("chiave-privata");
            if (Aws.IsMatch(line)) Add("aws");
            if (UrlCredentials.IsMatch(line)) Add("url-con-credenziali");
            foreach (Match m in Password.Matches(line)) if (!Placeholder.IsMatch(m.Groups[1].Value)) { Add("password-con-valore"); break; }
            if (HasCredentialLikeLongToken(line, false)) Add("credenziale-lunga");
            if (strict && HasCredentialLikeLongToken(line, true)) Add("credenziale-in-file-sensibile");
        }
        return hits;
    }

    public static string Describe(string rule) => rule switch
    {
        "token-github" => "token GitHub",
        "token-openshift" => "token di login OpenShift",
        "jwt" => "token JWT",
        "bearer" => "intestazione Bearer con token",
        "chiave-privata" => "chiave privata",
        "aws" => "chiave di accesso AWS",
        "url-con-credenziali" => "indirizzo con utente e password",
        "password-con-valore" => "password scritta in chiaro",
        "credenziale-lunga" => "stringa lunga che sembra un token o una password",
        "credenziale-in-file-sensibile" => "stringa lunga in una nota di accessi",
        _ => rule,
    };
}
