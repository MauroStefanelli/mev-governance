// Which words of a question point at code, and how to rank the files of a folder against them.
// Shared by the rationale chat and by Sviluppo. The old rule kept only words of 4+ letters: it lost exactly the codes that name a rule
// (H7, CHA, PDDP, LDV, HU), and it ranked files by their PATH alone, so the first files of the folder won and the rules deep inside were never read.

// Common Italian and English words that say nothing about code. Short codes (h7, hu, ldv...) are NOT here: they are the point.
export const STOPWORDS = new Set((
  'il lo la le gli un una uno di del dello della dei degli delle da dal dallo dalla dai dagli dalle in nel nello nella nei negli nelle su sul sullo sulla sui sugli sulle per con tra fra ' +
  'e ed o ma se che chi cui non si ci vi mi ti ne come dove quando quale quali quanto perche cosa cose sono era essere ha hanno ho aver avere fare fa fatto puo possono deve devono ' +
  'anche ancora solo piu meno molto poco tutto tutti ogni altro altra altri altre questo questa questi queste quello quella quelli quelle nel nell dell dall sull all alla alle allo agli ai ' +
  'the a an of to in on for and or is are was be with from as by at it this that these those do does how what where when which who why can will should may'
).split(/\s+/));

const normalize = text => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Terms of a free question. A word counts when it is 2+ characters long (so H7, HU, CHA, LDV survive), is not a common word, and is not only digits.
// Identifiers written the way code writes them (camelCase, snake_case, kebab-case, dotted) are also split into their parts, so "PrintRulesH7" is found by "print", "rules", "h7".
export function termsOf(text, { extra = '' } = {}) {
  const out = new Set();
  const add = word => { const w = normalize(word); if (w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) out.add(w); };
  String(`${text || ''} ${extra || ''}`).match(/[A-Za-z\u00C0-\u00FF0-9_.-]{2,}/g)?.forEach(token => {
    add(token);
    token.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([0-9])([A-Z][a-z])/g, '$1 $2').split(/[_.\-\s]+/).forEach(part => { if (part !== token) add(part); });
  });
  return [...out];
}

// Files that describe the build or the dependencies say little about behaviour: they go after the code unless the question is about them.
export const CONFIG_FILE = /(^|\/)(pom\.xml|build\.gradle|package(-lock)?\.json|\.?(application|bootstrap)([-.][\w-]+)?\.(ya?ml|properties)|[\w.-]*\.(csproj|sln))$/i;

// A term is looked for as a whole token when it is short (so "hu" does not match "should" or "human", and "h7" does not match "h70"),
// and as plain text when it is long. A "token" boundary is anything that is not a letter or a digit, so "PrintRulesH7" is one token and is found by
// the long term "printrules" but not by "h7"; that is why identifiers are also split into their parts by termsOf and the path is scored on its parts too.
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function matches(haystack, term) {
  if (term.length >= 4) return haystack.includes(term);
  return new RegExp(`(^|[^a-z0-9])${escape(term)}([^a-z0-9]|$)`).test(haystack);
}
// The parts of an identifier or of a path, lower-cased: "item-service/src/PrintRulesH7.java" -> item service src print rules h7 java
// A letter followed by digits stays together (H7, P1, CP87, HUT107): such codes name rules and must be found whole. Only a lower-case letter followed by an upper-case one splits.
export const partsOf = text => normalize(String(text || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([0-9])([A-Z][a-z])/g, '$1 $2')).replace(/[^a-z0-9]+/g, ' ').trim();

// Score of a file for the terms: how many DIFFERENT terms appear in the name/path (weight 3, a file called PrintRulesH7 is the answer to "stampa H7")
// and in the content (weight 1, capped so that a huge file is not preferred for its size alone).
export function scoreFile({ path, lines, terms }) {
  const lowerPath = ` ${partsOf(path)} `; const lowerText = normalize(lines.join('\n')); const textParts = ` ${partsOf(lines.join('\n'))} `;
  const inPath = terms.filter(term => matches(lowerPath, term));
  const inText = terms.filter(term => matches(lowerText, term) || matches(textParts, term));
  const occurrences = terms.reduce((n, term) => n + Math.min(5, (lowerText.split(term).length - 1)), 0);
  return { score: inPath.length * 3 + inText.length + Math.min(occurrences, 12) / 12, inPath, inText, config: CONFIG_FILE.test(path) };
}

// The line to start the excerpt from: the one with the most different terms, not merely the first one that contains any.
export function bestLine(lines, terms) {
  let best = -1; let bestCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const lower = normalize(lines[i]); const parts = ` ${partsOf(lines[i])} `; const count = terms.filter(term => matches(lower, term) || matches(parts, term)).length;
    if (count > bestCount) { best = i; bestCount = count; }
  }
  return best;
}

// A word found in the path of most files (the name of the project, "src", "main", "java") separates nothing: it would make every file look relevant
// and push the real answer out of the sample. With a folder of some size, terms present in more than half of the paths are set aside; they are reported.
export function informativeTerms(terms, paths) {
  if (paths.length < 10) return { terms, ignored: [] };
  const spaced = paths.map(path => ` ${partsOf(path)} `);
  const ignored = terms.filter(term => spaced.filter(path => matches(path, term)).length > paths.length / 2);
  const kept = terms.filter(term => !ignored.includes(term));
  return kept.length ? { terms: kept, ignored } : { terms, ignored: [] };
}
