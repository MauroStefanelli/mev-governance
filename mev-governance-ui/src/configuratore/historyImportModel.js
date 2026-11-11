import JSZip from 'jszip';
import { scanForSecrets, RULE_LABELS, isCertain } from './secretScan';
import { sha256Hex } from './ledgerModel';

// Which notes to read, from the folder zipped by the user and the manifest of the paths. All of this runs in the browser:
// the zip (hundreds of MB of session transcripts) is never uploaded, only the notes that pass every check.
export const MAX_ZIP_BYTES = 600 * 1024 * 1024;
export const MAX_NOTE_CHARS = 60000;
export const MAX_NOTES = 1000;

// Skipped on purpose, with the reason shown in the report. Not a security filter (that is the secret scan): a choice of what is worth reading.
const SKIP_NAMES = [
  [/^MEMORY\.md$/i, 'Indice della memoria: non contiene conoscenza propria.'],
  [/^session-/i, 'Nota di sessione: raccoglie link e cronaca, non conoscenza duratura.'],
  [/^index-/i, 'Indice: rimanda ad altre note.'],
];
const PERSONAL = [[/^(?:user-|feedback-ferie)/i, 'Dati personali o su come lavorare con l’assistente: non sono conoscenza di iniziativa.']];
const PREFERENCES = [[/^(?:feedback|tool|vpn|wsl|falcon|proxy|github)-/i, 'Preferenza di lavoro o ambiente personale dell’assistente: non riguarda un sistema.']];

// Known systems, by the prefix of the note. Written as the names the Storico uses, so related knowledge is found by the same name.
export const DEFAULT_SYSTEMS = [
  { prefix: 'ilp', system: 'ILP' }, { prefix: 'npso', system: 'NPSO' }, { prefix: 'bep', system: 'BEP' }, { prefix: 'iper', system: 'IPER/IPERSUITE' },
  { prefix: 'ipersuite', system: 'IPER/IPERSUITE' }, { prefix: 'is', system: 'IS-CONNECTOR-AS4' }, { prefix: 'sc', system: 'SC' }, { prefix: 'consumer', system: 'IPER/IPERSUITE' },
  { prefix: 'ptype13', system: 'BEP' }, { prefix: 'wipi', system: 'WIPI' },
];

export function parseManifest(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const stuck = lines.filter(line => (line.match(/projects\//g) || []).length > 1);
  const paths = lines.filter(line => !stuck.includes(line));
  return { paths: [...new Set(paths)], stuck, markdown: [...new Set(paths)].filter(p => /\.md$/i.test(p)), skippedByType: paths.filter(p => !/\.md$/i.test(p)).length };
}

export const baseName = path => String(path || '').split('/').pop();
export const folderOf = path => (/^projects\/([^/]+)\//.exec(path) || [])[1] || '';
// "-home-mfabbri-opencode-github-repositories-ilp" -> author "mfabbri"; the folder is only used for the author, the system comes from the note.
export const authorOf = path => (/^-home-([^-]+)/.exec(folderOf(path)) || [])[1] || '';

export function systemOf(fileName, systems = DEFAULT_SYSTEMS) {
  const prefix = baseName(fileName).split('-')[0].toLowerCase();
  return systems.find(s => s.prefix === prefix)?.system || '';
}

// Only a GOTO that clearly belongs to an initiative: six digits starting with 14, and only when the note names it more than once or in its title.
export function gotoOf(fileName, text) {
  const counts = new Map();
  for (const m of String(text || '').matchAll(/\b(14\d{4})\b/g)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  const inName = (/\b(14\d{4})\b/.exec(baseName(fileName)) || [])[1];
  if (inName) return inName;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length && ranked[0][1] >= 3 && (ranked.length === 1 || ranked[0][1] >= ranked[1][1] * 2) ? ranked[0][0] : '';
}

export function skipReason(fileName) {
  const name = baseName(fileName);
  for (const [re, reason] of [...SKIP_NAMES, ...PERSONAL, ...PREFERENCES]) if (re.test(name)) return reason;
  return '';
}

// Opens the zip and reads, for each path in the manifest, the note. Nothing is sent to the server here.
export async function readNotes(zipFile, manifest, { onProgress } = {}) {
  if (!zipFile) throw new Error('Scegli lo zip della cartella.');
  if (zipFile.size > MAX_ZIP_BYTES) throw new Error(`Lo zip supera ${Math.round(MAX_ZIP_BYTES / 1048576)} MB: comprimi solo la cartella projects.`);
  let zip;
  try { zip = await JSZip.loadAsync(zipFile); } catch { throw new Error('Il file non è uno zip leggibile.'); }
  const index = new Map(); const duplicatesInZip = new Set();
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const key = path.replace(/^[^/]+\/(?=projects\/)/, '');             // tolerate an extra top folder ("claude-backup/projects/…")
    if (index.has(key)) duplicatesInZip.add(key); else index.set(key, entry);
  });
  const found = []; const missing = [];
  const wanted = manifest.markdown.slice(0, MAX_NOTES);
  for (let i = 0; i < wanted.length; i++) {
    const path = wanted[i]; const entry = index.get(path);
    if (!entry) { missing.push(path); continue; }
    const text = (await entry.async('string')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    found.push({ path, fileName: baseName(path), author: authorOf(path), text });
    if (onProgress && (i % 25 === 0 || i === wanted.length - 1)) onProgress(i + 1, wanted.length);
  }
  const notInManifest = [...index.keys()].filter(p => /\.md$/i.test(p) && !manifest.markdown.includes(p));
  return { found, missing, notInManifest, truncatedList: manifest.markdown.length > MAX_NOTES, duplicatesInZip: [...duplicatesInZip] };
}

// Sorts every note: to read, skipped (with the reason), refused for secrets (with rule and line), or too big/empty.
export async function classifyNotes(found, { systems = DEFAULT_SYSTEMS } = {}) {
  const toRead = []; const skipped = []; const secrets = []; const unusable = []; const noSystem = [];
  const seen = new Map();
  for (const note of found) {
    const reason = skipReason(note.fileName);
    if (reason) { skipped.push({ ...note, reason }); continue; }
    if (!note.text.trim()) { unusable.push({ ...note, reason: 'La nota è vuota.' }); continue; }
    if (note.text.length > MAX_NOTE_CHARS) { unusable.push({ ...note, reason: `La nota supera ${MAX_NOTE_CHARS} caratteri.` }); continue; }
    const hits = scanForSecrets(note.fileName, note.text);
    if (hits.length) { secrets.push({ ...note, hits }); continue; }
    const system = systemOf(note.fileName, systems);
    if (!system) { noSystem.push({ ...note, reason: 'Il nome della nota non indica un sistema noto.' }); continue; }
    // Without a hash (a page not served over HTTPS has no crypto.subtle) nothing can be called "identical": the server compares by content anyway.
    const sha = await sha256Hex(note.text);
    if (sha && seen.has(sha)) { skipped.push({ ...note, reason: `Stesso contenuto di ${seen.get(sha)}.` }); continue; }
    if (sha) seen.set(sha, note.fileName);
    toRead.push({ ...note, system, goto: gotoOf(note.fileName, note.text), sha });
  }
  return { toRead, skipped, secrets, unusable, noSystem };
}

export function bySystem(notes) {
  const map = new Map();
  for (const n of notes) map.set(n.system, (map.get(n.system) || 0) + 1);
  return [...map.entries()].map(([system, count]) => ({ system, count })).sort((a, b) => b.count - a.count || a.system.localeCompare(b.system));
}

// The downloadable report of what was left out and why. It NEVER contains a secret or any text of a note: only names, rules and line numbers.
export function buildReport({ classified, missing = [], notInManifest = [], stuck = [], serverRefused = [], failed = [], read = [], date = new Date() }) {
  const day = date.toISOString().slice(0, 10);
  const out = [`# Rapporto importazione storico AI — ${day}`, '', 'Questo rapporto non contiene valori sensibili né testo delle note: solo nomi dei file, regole e numeri di riga.', ''];
  const table = (title, header, rows) => { if (!rows.length) return; out.push(`## ${title} (${rows.length})`, '', `| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(c => String(c).replace(/\|/g, '/')).join(' | ')} |`), ''); };
  out.push('## Riepilogo', '', `- Note lette dall’AI: ${read.length}`, `- Scartate per credenziali: ${classified.secrets.length + serverRefused.length}`, `- Non lette per scelta: ${classified.skipped.length}`, `- Non utilizzabili: ${classified.unusable.length + classified.noSystem.length}`, `- Non trovate nello zip: ${missing.length}`, `- Errori durante la lettura: ${failed.length}`, '');
  const doubtful = classified.secrets.filter(n => !isCertain(n.hits));
  out.splice(out.indexOf('## Riepilogo') + 7, 0, `- di cui da verificare a mano (fermate solo da un controllo prudenziale, potrebbero essere innocue): ${doubtful.length}`);
  table('Scartate per credenziali', ['File', 'Cosa è stato trovato', 'Riga', 'Certezza'], [
    ...classified.secrets.flatMap(n => n.hits.map(h => [n.path, RULE_LABELS[h.rule] || h.rule, h.line, isCertain(n.hits) ? 'sicura' : 'da verificare'])),
    ...serverRefused.flatMap(n => (n.hits || []).map(h => [n.path, h.description || h.rule, h.line, 'sicura']))]);
  table('Non lette per scelta', ['File', 'Motivo'], classified.skipped.map(n => [n.path, n.reason]));
  table('Non utilizzabili', ['File', 'Motivo'], [...classified.unusable, ...classified.noSystem].map(n => [n.path, n.reason]));
  table('Indicate nell’elenco ma assenti nello zip', ['File'], missing.map(p => [p]));
  table('Presenti nello zip ma non nell’elenco', ['File'], notInManifest.map(p => [p]));
  table('Righe dell’elenco incollate tra loro', ['Riga'], stuck.map(l => [l.slice(0, 160)]));
  table('Errori durante la lettura', ['File', 'Motivo'], failed.map(f => [f.path, f.reason]));
  return out.join('\n');
}

// Which of the notes were already read by someone (by content), asked in batches before anything is sent.
export async function filterAlreadyRead(notes, request, batch = 400) {
  const known = new Set();
  const hashes = notes.map(n => n.sha).filter(Boolean);
  for (let i = 0; i < hashes.length; i += batch) {
    const result = await request('check', { body: { hashes: hashes.slice(i, i + batch) } });
    (result?.known || []).forEach(h => known.add(h));
  }
  return { fresh: notes.filter(n => !n.sha || !known.has(n.sha)), already: notes.filter(n => n.sha && known.has(n.sha)) };
}

export const STOP_AFTER_FAILURES = 3;

// Reads the notes one request each, a few at a time. It stops by itself when the AI does not answer several times in a row
// (every further note would fail the same way) or when the permission is missing, and it can be cancelled between two notes.
// Returns what happened to every note; a stop leaves the rest untouched so the same run can be repeated: already read notes are skipped.
export async function runImport({ notes, request, concurrency = 3, shouldCancel = () => false, onProgress = () => {} }) {
  const result = { read: [], withoutEntries: [], alreadyRead: [], serverRefused: [], failed: [], notStarted: [], proposals: 0, stoppedBecause: '' };
  let next = 0; let consecutiveFailures = 0; let done = 0;
  const finish = () => { done += 1; onProgress(done, notes.length, result); };
  const worker = async () => {
    for (;;) {
      if (result.stoppedBecause || shouldCancel()) return;
      const index = next++; if (index >= notes.length) return;
      const note = notes[index];
      try {
        const reply = await request('file', { body: { path: note.path, fileName: note.fileName, text: note.text, system: note.system, goto: note.goto || null, author: note.author } });
        consecutiveFailures = 0;
        if (reply.outcome === 'gia-letto') result.alreadyRead.push(note);
        else if (reply.outcome === 'senza-voci') result.withoutEntries.push(note);
        else { result.read.push(note); result.proposals += reply.proposals || 0; }
      } catch (error) {
        if (error.status === 422 && error.details?.code === 'segreti') { result.serverRefused.push({ ...note, hits: error.details.hits || [] }); consecutiveFailures = 0; }
        else if (error.status === 403) { result.failed.push({ ...note, reason: error.message }); result.stoppedBecause = 'permessi'; }
        else { result.failed.push({ ...note, reason: error.message }); consecutiveFailures += 1; if (consecutiveFailures >= STOP_AFTER_FAILURES) result.stoppedBecause = 'ai'; }
      }
      finish();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const started = new Set([...result.read, ...result.withoutEntries, ...result.alreadyRead, ...result.serverRefused, ...result.failed].map(n => n.path));
  result.notStarted = notes.filter(n => !started.has(n.path));
  if (!result.stoppedBecause && result.notStarted.length) result.stoppedBecause = 'annullato';
  return result;
}

export function pendingLabel(count) { return count === 0 ? 'Nessuna voce da confermare' : count === 1 ? '1 voce da confermare' : `${count} voci da confermare`; }
export const KIND_LABEL = { razionale: 'Razionale', vincolo: 'Vincolo', decisione: 'Decisione' };
