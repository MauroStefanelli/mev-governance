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

export const MAX_SCAN = 6000;     // how many files are read to look for the terms in their CONTENT (all of them in any ordinary repository; beyond this the rest is reported)
export const MAX_SENT = 8;        // how many excerpts leave for the AI
const KEEP = 40;                  // how many of the best-scored files are kept (with their hash) for the final choice
const BATCH = 40;                 // files read in parallel
const CACHE_BUDGET = 120 * 1024 * 1024; // bytes of source kept in memory for reuse across questions

// `activity` is the free text (a question, an activity description). `options.extraTerms` are words the user typed to say where to look,
// `options.onProgress(done, total)` lets the panel show that a large folder is being read, `options.maxScan` overrides MAX_SCAN (tests).
// EVERY eligible file is read once and scored on its path and content, because the rule that answers a question often sits in a file with a neutral
// name (helpers.ts, validators.ts); only the best KEEP files are then hashed and kept. A file with no term at all is never sent to fill the sample, and
// build/config files come after the code.
export async function activitySourceContext(files, activity, cache, options = {}) {
  const asked = termsOf(activity, { extra: options.extraTerms });
  const candidates = files.filter(file => allowed.test(file.name) && file.size <= 500000
    && !/(^|\/)(\.git|node_modules|target|bin|obj|vendor|dist)(\/|$)/i.test(file.webkitRelativePath || file.name));
  const { terms, ignored } = informativeTerms(asked, candidates.map(file => file.webkitRelativePath || file.name));
  const pathScore = file => terms.filter(term => matches(` ${partsOf(file.webkitRelativePath || file.name)} `, term)).length;
  // files whose path already holds a term are read first, so that if the folder is larger than MAX_SCAN the likeliest ones are not the ones left out
  const queue = candidates.map(file => ({ file, p: pathScore(file) })).sort((a, b) => b.p - a.p).slice(0, options.maxScan || MAX_SCAN).map(entry => entry.file);
  const useCache = Boolean(cache) && queue.reduce((sum, file) => sum + (file.size || 0), 0) <= CACHE_BUDGET;
  let scored = [];
  let done = 0;
  let matchedCount = 0;
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = await Promise.all(queue.slice(i, i + BATCH).map(async file => {
      // through the shared cache while the folder is of ordinary size, so that each file is read and hashed once for every question and activity;
      // beyond CACHE_BUDGET bytes files are read straight, to keep the memory of the browser bounded
      const lines = useCache ? (await readOnce(file, cache)).lines : String(await file.text()).split(/\r?\n/);
      const path = file.webkitRelativePath || file.name;
      return { file, path, lines, ...scoreFile({ path, lines, terms }) };
    }));
    const hits = batch.filter(item => item.inPath.length + item.inText.length > 0); matchedCount += hits.length;
    scored = scored.concat(hits).sort((a, b) => b.score - a.score).slice(0, KEEP); // only the lines of the kept files stay in memory; the others are dropped with the batch
    done += batch.length; if (options.onProgress) options.onProgress(done, queue.length);
    if (terms.length === 0) break;
  }
  const matchingTotal = matchedCount;
  // the structure fallback: nothing matched, so look at a few files (in path order) only to show how the folder is made
  const pool = scored.length ? scored : queue.slice(0, 3).map(file => ({ file, path: file.webkitRelativePath || file.name, score: 0, inPath: [], inText: [], config: false }));
  const read = [];
  const sha = async lines => { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lines.join('\n'))); return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''); };
  for (const item of pool) {
    // the fingerprint is that of the whole text as read (through the cache when there is one, so it is the same for every question), never of the excerpt
    const { lines, sha256 } = item.lines && !useCache ? { lines: item.lines, sha256: await sha(item.lines) } : await readOnce(item.file, cache);
    const anchor = bestLine(lines, terms);
    const start = Math.max(0, (anchor < 0 ? 0 : anchor) - 8);
    const excerpt = lines.slice(start, start + 80).join('\n').slice(0, 4000);
    read.push({ path: item.path, startLine: start + 1, endLine: start + excerpt.split('\n').length, sha256, text: excerpt, score: item.score,
      matched: item.inPath.length + item.inText.length > 0, why: { inPath: item.inPath, inText: item.inText }, config: item.config && !terms.some(term => CONFIG_WORDS.has(term)) });
  }
  const order = item => (item.config ? 1 : 0);
  const matching = read.filter(item => item.matched).sort((a, b) => order(a) - order(b) || b.score - a.score);
  const selected = (matching.length ? matching : read.sort((a, b) => a.path.localeCompare(b.path))).slice(0, matching.length ? MAX_SENT : 3);
  const scanned = Math.min(done, queue.length);
  return { files: selected, terms, ignoredTerms: ignored, coverage: { selectedFiles: files.length, eligibleFiles: candidates.length, sampledFiles: scanned, matchingFiles: matchingTotal,
    sentFiles: selected.length, sentWithMatch: selected.filter(item => item.matched).length, notOpened: Math.max(0, candidates.length - scanned),
    notice: matching.length ? `Campione limitato: letti ${scanned} file su ${candidates.length}, ${matchingTotal} con le parole della domanda, ${selected.length} estratti inviati, non analisi completa del repository. Nessuna compilazione o test eseguito.${candidates.length > scanned ? ` ${candidates.length - scanned} file non letti (cartella molto grande).` : ''}`
      : `Nessun file della cartella contiene le parole della domanda (letti ${scanned} file su ${candidates.length}): invio ${selected.length} file solo per mostrare la struttura. La regola cercata non è in questa cartella, oppure usa altre parole: prova con «Cerca nel codice». Campione limitato, non analisi completa. Nessuna compilazione o test eseguito.` } };
}
