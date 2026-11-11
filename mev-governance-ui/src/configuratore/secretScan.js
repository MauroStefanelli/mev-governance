// Looks for credentials in a note BEFORE it leaves the browser. It reports which rule matched and on which line, never the value:
// a report that quoted the secret would be a new leak. The server repeats the same rules (SecretScanner.cs) because it never trusts the browser.
const PLACEHOLDER = /^(?:x{3,}|\*+|\.{2,}|<.*>|\$\{?\w+\}?|da|di|in|il|la|non|nel|per|e|o|vuota|vuoto|null|none|true|false|placeholder|redatt\w*|omess\w*|hidden|segreto|secret|token|password|chiesta|chiedere)$/i;
const SLUG = /^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/;
const CREDENTIAL_WORD = /\b(?:password|passwd|pwd|token|secret|api[_-]?key|credenzial\w*|pat)\b/i;
const CONTEXT_WORDS = /credenzial|token|password|passwd|accesso|access|secret|pat\b|login|sudo|chiave|\bkey\b/i;
const PASSWORD = /(?:(?:password|passwd|pwd)|\b(?:pass|psw))\b(?:\s*[:=]\s*|[^\n`*"']{0,60}(?:[`"]|\*\*|(?<![\p{L}])'))([^`*"'\s<>|,;]{4,})/giu;

export const RULE_LABELS = {
  'token-github': 'token GitHub', 'token-openshift': 'token di login OpenShift', jwt: 'token JWT', bearer: 'intestazione Bearer con token', 'chiave-privata': 'chiave privata',
  aws: 'chiave di accesso AWS', 'url-con-credenziali': 'indirizzo con utente e password', 'password-con-valore': 'password scritta in chiaro',
  'credenziale-lunga': 'stringa lunga che sembra un token o una password', 'credenziale-in-file-sensibile': 'stringa lunga in una nota di accessi',
};

const SIMPLE_RULES = [
  ['token-github', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
  ['token-openshift', /\bsha256~[A-Za-z0-9_-]{20,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/],
  ['chiave-privata', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['aws', /\bAKIA[0-9A-Z]{16}\b/],
  ['url-con-credenziali', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{3,}@/i],
];

// A note about access ("reference-…-access", "token", "credenziali") is read more strictly: any long mixed string counts.
export function isSensitiveContext(fileName, text) {
  const description = /^description:\s*(.*)$/m.exec(text || '');
  return CONTEXT_WORDS.test(fileName || '') || (!!description && CONTEXT_WORDS.test(description[1]));
}

function longToken(line, strict) {
  const clean = line.replace(/\[\[[^\]]*\]\]/g, '').replace(/https?:\/\/\S+/g, '');
  if (strict) {
    for (const t of clean.match(/[A-Za-z0-9_+=/.~!@#$%^&*-]{14,}/g) || []) {
      if (SLUG.test(t) || t.includes('/') || /^[A-Za-z]+$/.test(t)) continue;
      if (/\d/.test(t) || /[!@#$%^&*]/.test(t)) return true;
    }
    return false;
  }
  if (!CREDENTIAL_WORD.test(line)) return false;
  for (const t of clean.match(/[A-Za-z0-9_+=/.~-]{20,}/g) || []) {
    if (SLUG.test(t) || t.includes('/')) continue;
    if (/[A-Za-z]/.test(t) && /\d/.test(t) && !/^\d+$/.test(t)) return true;
  }
  return false;
}

// -> [{ rule, line }]  (line is 1-based). Never contains the matched text.
export function scanForSecrets(fileName, text) {
  const hits = []; const strict = isSensitiveContext(fileName, text);
  String(text || '').split('\n').forEach((line, index) => {
    const add = rule => { if (!hits.some(h => h.rule === rule && h.line === index + 1)) hits.push({ rule, line: index + 1 }); };
    for (const [rule, re] of SIMPLE_RULES) if (re.test(line)) add(rule);
    for (const m of line.matchAll(PASSWORD)) if (!PLACEHOLDER.test(m[1])) { add('password-con-valore'); break; }
    if (longToken(line, false)) add('credenziale-lunga');
    if (strict && longToken(line, true)) add('credenziale-in-file-sensibile');
  });
  return hits;
}

// Rules that match a credential by its shape. The other two are heuristics (a long mixed string): they can stop a harmless note,
// so the report marks a note stopped ONLY by them as "da verificare" and leaves the decision to a person.
export const HEURISTIC_RULES = ['credenziale-lunga', 'credenziale-in-file-sensibile'];
export const isCertain = hits => hits.some(h => !HEURISTIC_RULES.includes(h.rule));
