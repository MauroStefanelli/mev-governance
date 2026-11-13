import { termsOf, informativeTerms, matches, partsOf, scoreFile, bestLine } from './sourceSearch';
const CONFIG_WORDS = new Set(['pom', 'gradle', 'dependency', 'dependencies', 'dipendenza', 'dipendenze', 'versione', 'version', 'build', 'maven', 'package', 'application', 'config', 'configurazione', 'properties', 'yaml', 'yml']);
const allowed = /\.(java|sql|xml|xsd|wsdl|bpel|jca|proxy|biz|pipeline|xq|xqy|xsl|xslt|js|ts|json|md|cs)$/i;
// One cache per selected folder: each file is read and hashed once, then reused by every activity.
export const createSourceCache = () => new Map();
async function readOnce(file, cache) {
  if (cache?.has(file)) return cache.get(file);
  const pending = (async () => {
    const text = await file.text();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return { text, lines: text.split(/\r?\n/), sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') };
  })();
  cache?.set(file, pending);
  return pending;
}

export const MAX_READ = 400;      // how many files are opened to look for the terms (a folder is rarely larger; the rest is reported, never silently ignored)
export const MAX_SENT = 8;        // how many excerpts leave for the AI

// `activity` is the free text (a question, an activity description). `options.extraTerms` are words the user typed to say where to look.
// Every eligible file is ranked by the terms found in its PATH and in its CONTENT; the best are read in full for the excerpt. A file with no term at all
// is only used to fill the sample when nothing better exists, and the build/config files come after the code.
export async function activitySourceContext(files, activity, cache, options = {}) {
  const asked = termsOf(activity, { extra: options.extraTerms });
  const candidates = files.filter(file => allowed.test(file.name) && file.size <= 500000
    && !/(^|\/)(\.git|node_modules|target|bin|obj|vendor|dist)(\/|$)/i.test(file.webkitRelativePath || file.name));
  const { terms, ignored } = informativeTerms(asked, candidates.map(file => file.webkitRelativePath || file.name));
  const pathScore = file => terms.filter(term => matches(` ${partsOf(file.webkitRelativePath || file.name)} `, term)).length;
  // 1) cheap pass: rank by path, so a very large folder is not opened file by file in vain; the best by path are read, then all those are ranked by content too
  const byPath = candidates.map(file => ({ file, p: pathScore(file) })).sort((a, b) => b.p - a.p);
  const toOpen = byPath.slice(0, MAX_READ);
  const read = [];
  for (const { file } of toOpen) {
    const { lines, sha256 } = await readOnce(file, cache);
    const path = file.webkitRelativePath || file.name;
    const ranked = scoreFile({ path, lines, terms });
    const anchor = bestLine(lines, terms);
    const start = Math.max(0, (anchor < 0 ? 0 : anchor) - 8);
    const excerpt = lines.slice(start, start + 80).join('\n').slice(0, 4000);
    read.push({ path, startLine: start + 1, endLine: start + excerpt.split('\n').length, sha256, text: excerpt,
      score: ranked.score, matched: ranked.inPath.length + ranked.inText.length > 0, why: { inPath: ranked.inPath, inText: ranked.inText }, config: ranked.config && !terms.some(term => CONFIG_WORDS.has(term)) });
  }
  // Code that matches first, then build/config files that match. A file that shares NOTHING with the question is not sent: filling the sample with
  // unrelated files costs tokens, hides the real answer among noise and makes the model believe it has seen the code it asked about.
  // Only when no file matches at all (a question with no usable words) a few files are sent so that the AI at least sees the structure.
  const order = item => (item.config ? 1 : 0);
  const matching = read.filter(item => item.matched).sort((a, b) => order(a) - order(b) || b.score - a.score);
  const selected = (matching.length ? matching : read.sort((a, b) => a.path.localeCompare(b.path))).slice(0, matching.length ? MAX_SENT : 3);
  const withMatch = read.filter(item => item.matched).length;
  return { files: selected, terms, ignoredTerms: ignored, coverage: { selectedFiles: files.length, eligibleFiles: candidates.length, sampledFiles: read.length, matchingFiles: withMatch,
    sentFiles: selected.length, sentWithMatch: selected.filter(item => item.matched).length, notOpened: Math.max(0, candidates.length - read.length),
    notice: matching.length ? `Campione limitato: ${read.length} file aperti su ${candidates.length}, ${selected.length} estratti inviati scelti per le parole della domanda, non analisi completa del repository. Nessuna compilazione o test eseguito.`
      : `Nessun file contiene le parole della domanda: invio ${selected.length} file solo per mostrare la struttura. Aggiungi parole o nomi di file in «Cerca nel codice». Campione limitato, non analisi completa. Nessuna compilazione o test eseguito.` } };
}
