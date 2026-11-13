// The user's source folders, kept IN THIS BROWSER so that they do not have to be selected again at every visit.
//
// Why a copy and not a reference: a web page cannot read a path again after the page is closed (the browser only allows it during the session in which the user
// picked the folder). What it CAN do is keep a copy of the text of the files in the browser's own storage (IndexedDB). That copy:
//  - stays on this computer and in this browser profile; nothing in this module talks to the network;
//  - is what the questions and Sviluppo read from; the folder on disk is never touched;
//  - is updated by selecting the folder again (only new and changed files are read), integrated, or removed by the user.
// When the browser has no usable IndexedDB (private window, blocked storage) the same functions work in memory only and the panel says so.
import { sourceFileAllowed, ignoredSourcePath } from './configuratoreCore';
import { scanForSecrets, isCertain, RULE_LABELS } from './secretScan';

export const MAX_FILE_BYTES = 500000;            // same ceiling the questions already use
export const MAX_FILES = 30000;                  // per folder
export const MAX_FOLDER_BYTES = 400 * 1024 * 1024;
export const MAX_FOLDERS = 12;
const NUL = '\u0000';
const CONFIG_LIKE = /\.(ya?ml|properties|conf|ini|json|xml|tf|tfvars|sh|bat|ps1|env)$/i;

const currentUser = () => { try { return (typeof localStorage !== 'undefined' && localStorage.getItem('XUSER')) || 'anonimo'; } catch { return 'anonimo'; } };
const dbName = () => `mev-sources-${currentUser()}`;
const textKey = (id, path) => `${id}${NUL}${path}`;

// --- what goes into the copy ---------------------------------------------------------------------------------------------------------------------------------

// What is kept out of the copy. Two kinds of file, two strictness levels:
//  - configuration (application-prod.yml, .properties, .env, .json...): where real credentials live, so any certain finding keeps the file out;
//  - source code: only credentials recognised by their SHAPE (a GitHub token, a private key, a JWT, an address with user:password). Code that merely talks about
//    passwords (`password = request.getParameter(...)`) is code, not a leak, and a file named Login.java must not be refused for its name.
// Whatever leaves the browser is checked again excerpt by excerpt with every rule (checkAttachments), so a credential that stayed in the copy still cannot be sent.
const SHAPE_RULES = ['token-github', 'token-openshift', 'jwt', 'bearer', 'chiave-privata', 'aws', 'url-con-credenziali'];
export function skipReason(name, text) {
  const configuration = CONFIG_LIKE.test(name);
  const hits = scanForSecrets(name, text).filter(hit => (configuration ? isCertain([hit]) : SHAPE_RULES.includes(hit.rule)));
  return hits.length ? { reason: RULE_LABELS[hits[0].rule] || hits[0].rule, line: hits[0].line } : null;
}

export function pathOf(file) { return file.webkitRelativePath || file.name; }
export const rootName = files => (pathOf(files[0] || { name: '' }).split('/')[0] || 'cartella');

// The files of a selected folder that enter the copy, and how many were left out and why. `files` is what the browser gives for a folder.
export function inspectSelection(files) {
  const list = [...(files || [])]; const entries = []; let ignored = 0; let tooBig = 0;
  for (const file of list) {
    const path = pathOf(file);
    if (!sourceFileAllowed(file.name) || ignoredSourcePath(path)) { ignored++; continue; }
    if (file.size > MAX_FILE_BYTES) { tooBig++; continue; }
    entries.push({ file, path, size: file.size, lastModified: file.lastModified || 0 });
  }
  return { name: rootName(list), entries, ignored, tooBig, total: list.length };
}

// Compare a saved folder with a new selection. A file is "changed" when its size or modification date differs: a date alone can change without the content
// (git checkout touches files), in which case the update reads it again and finds the same text, which is harmless.
export function diffSelection(saved, entries) {
  const known = new Map((saved?.files || []).map(entry => [entry.path, entry]));
  // a file refused before (it held a credential) that has not changed is not read again: it stays refused, it is not "same" as a saved file
  const refused = new Map((saved?.skipped || []).filter(entry => entry.size !== undefined).map(entry => [entry.path, entry]));
  const added = []; const changed = []; const same = []; const stillRefused = []; const seen = new Set();
  for (const entry of entries) {
    seen.add(entry.path); const old = known.get(entry.path); const before = refused.get(entry.path);
    if (before && before.size === entry.size && before.lastModified === entry.lastModified) { stillRefused.push(entry); continue; }
    if (!old) added.push(entry); else if (old.size !== entry.size || old.lastModified !== entry.lastModified) changed.push(entry); else same.push(entry);
  }
  const removed = (saved?.files || []).filter(entry => !seen.has(entry.path)).map(entry => entry.path);
  return { added, changed, same, removed, stillRefused };
}

// --- storage backends ----------------------------------------------------------------------------------------------------------------------------------------

function memoryBackend() {
  const folders = new Map(); const texts = new Map();
  return {
    persistent: false,
    async all() { return [...folders.values()].map(folder => ({ ...folder })); },
    async put(folder) { folders.set(folder.id, { ...folder }); },
    async remove(id) { folders.delete(id); [...texts.keys()].filter(key => key.startsWith(`${id}${NUL}`)).forEach(key => texts.delete(key)); },
    async putTexts(id, pairs) { pairs.forEach(([path, text]) => texts.set(textKey(id, path), text)); },
    async getText(id, path) { return texts.get(textKey(id, path)); },
    async deleteTexts(id, paths) { paths.forEach(path => texts.delete(textKey(id, path))); },
  };
}

const requestDone = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const txDone = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Operazione annullata dal browser.')); });

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName(), 1);
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('folders', { keyPath: 'id' }); db.createObjectStore('texts'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Archivio del browser bloccato da un’altra scheda.'));
  });
}

function idbBackend() {
  const run = async (stores, mode, work) => { const db = await openDb(); try { const tx = db.transaction(stores, mode); const result = work(tx); await txDone(tx); return await result; } finally { db.close(); } };
  return {
    persistent: true,
    all: () => run(['folders'], 'readonly', tx => requestDone(tx.objectStore('folders').getAll())),
    put: folder => run(['folders'], 'readwrite', tx => { tx.objectStore('folders').put(folder); }),
    remove: id => run(['folders', 'texts'], 'readwrite', tx => { tx.objectStore('folders').delete(id); tx.objectStore('texts').delete(IDBKeyRange.bound(`${id}${NUL}`, `${id}\u0001`)); }),
    putTexts: (id, pairs) => run(['texts'], 'readwrite', tx => { pairs.forEach(([path, text]) => tx.objectStore('texts').put(text, textKey(id, path))); }),
    getText: (id, path) => run(['texts'], 'readonly', tx => requestDone(tx.objectStore('texts').get(textKey(id, path)))),
    deleteTexts: (id, paths) => run(['texts'], 'readwrite', tx => { paths.forEach(path => tx.objectStore('texts').delete(textKey(id, path))); }),
  };
}

let chosen = null; let chosenFor = '';
// IndexedDB when it opens, memory otherwise. The choice is made once per user; `forceMemory` is for tests and for a browser that refuses storage.
export async function getBackend() {
  if (chosen && chosenFor === dbName()) return chosen;
  let backend;
  try { if (typeof indexedDB === 'undefined') throw new Error('no indexedDB'); backend = idbBackend(); await backend.all(); } catch { backend = memoryBackend(); }
  chosen = backend; chosenFor = dbName(); return backend;
}
export function resetSourceLibrary() { chosen = null; chosenFor = ''; }

const friendly = error => {
  if (error && (error.name === 'QuotaExceededError' || /quota/i.test(error.message || ''))) return new Error('Lo spazio che il browser concede a questo sito è esaurito: rimuovi una cartella salvata o libera spazio e riprova.');
  return error;
};

// --- operations ----------------------------------------------------------------------------------------------------------------------------------------------

export async function listFolders() { return (await (await getBackend()).all()).sort((a, b) => (a.name || '').localeCompare(b.name || '')); }
export async function isPersistent() { return (await getBackend()).persistent; }

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const uniqueName = (name, folders) => { const taken = new Set(folders.map(folder => folder.name)); let candidate = name; let n = 2; while (taken.has(candidate)) candidate = `${name} (${n++})`; return candidate; };
const renamePath = (path, from, to) => (from === to ? path : `${to}${path.slice(from.length)}`);
const BATCH = 60;

// Saves a selection. mode:
//   'new'     a separate saved folder (a name already taken gets " (2)")
//   'replace' the saved folder becomes exactly the selection: files that are no longer there disappear from the copy
//   'merge'   new and changed files are added/updated, files that are no longer in the selection are kept
// Only new and changed files are read. Returns the saved record and what was done.
export async function saveSelection({ selection, mode = 'new', target = null, onProgress }) {
  const backend = await getBackend(); const existing = await backend.all();
  if (mode === 'new' && existing.length >= MAX_FOLDERS) throw new Error(`Si possono conservare al massimo ${MAX_FOLDERS} cartelle: rimuovine una.`);
  const base = mode === 'new' ? { id: newId(), name: uniqueName(selection.name, existing), active: true, savedAt: Date.now(), files: [], skipped: [] } : { ...target };
  if (mode !== 'new' && !target) throw new Error('Cartella da aggiornare non trovata.');
  // a separate copy under another name keeps the paths readable: the first segment is the name of the copy
  const entries = selection.entries.map(entry => ({ ...entry, path: renamePath(entry.path, selection.name, base.name) }));
  const diff = mode === 'new' ? { added: entries, changed: [], same: [], removed: [], stillRefused: [] } : diffSelection(base, entries);
  const projectedFiles = mode === 'replace' ? entries.length : new Set([...base.files.map(f => f.path), ...entries.map(e => e.path)]).size;
  if (projectedFiles > MAX_FILES) throw new Error(`La cartella ha ${projectedFiles} file di codice: il limite è ${MAX_FILES}. Scegli una sottocartella.`);
  const projectedBytes = entries.reduce((sum, entry) => sum + entry.size, 0) + (mode === 'merge' ? base.files.filter(f => diff.removed.includes(f.path)).reduce((sum, f) => sum + f.size, 0) : 0);
  if (projectedBytes > MAX_FOLDER_BYTES) throw new Error(`La cartella supera ${Math.round(MAX_FOLDER_BYTES / 1048576)} MB di codice: scegli una sottocartella.`);

  const toRead = [...diff.added, ...diff.changed]; const skipped = []; const stored = new Map(); let done = 0;
  try {
    for (let i = 0; i < toRead.length; i += BATCH) {
      const slice = toRead.slice(i, i + BATCH); const pairs = [];
      await Promise.all(slice.map(async entry => {
        const text = String(await entry.file.text()); const why = skipReason(entry.file.name, text);
        if (why) skipped.push({ path: entry.path, size: entry.size, lastModified: entry.lastModified, ...why }); else { pairs.push([entry.path, text]); stored.set(entry.path, entry); }
      }));
      await backend.putTexts(base.id, pairs);        // a transaction only for the writes: the reads above happen outside of it
      done += slice.length; if (onProgress) onProgress(done, toRead.length);
    }
    const keptFromBefore = mode === 'replace' ? base.files.filter(f => !diff.removed.includes(f.path)) : base.files;
    const index = new Map(keptFromBefore.map(f => [f.path, f]));
    diff.same.forEach(entry => index.set(entry.path, { path: entry.path, size: entry.size, lastModified: entry.lastModified }));
    stored.forEach(entry => index.set(entry.path, { path: entry.path, size: entry.size, lastModified: entry.lastModified }));
    // a changed file that is now refused (it gained a credential) leaves the copy: the old text must not stay
    const refused = skipped.map(item => item.path); refused.forEach(path => index.delete(path));
    // refused files that stay refused: those unchanged in the selection and, when merging, those the selection does not mention
    const selected = new Set(entries.map(entry => entry.path));
    const carried = (base.skipped || []).filter(item => diff.stillRefused.some(entry => entry.path === item.path) || (mode === 'merge' && !selected.has(item.path)));
    const record = { ...base, files: [...index.values()].sort((a, b) => a.path.localeCompare(b.path)), updatedAt: Date.now(),
      skipped: [...carried, ...skipped],
      ignored: selection.ignored, tooBig: selection.tooBig };
    record.bytes = record.files.reduce((sum, f) => sum + f.size, 0);
    await backend.put(record);
    const gone = mode === 'replace' ? diff.removed : []; if (gone.length) await backend.deleteTexts(base.id, gone);
    if (refused.length) await backend.deleteTexts(base.id, refused);
    return { record, diff: { added: diff.added.length, changed: diff.changed.length, same: diff.same.length, removed: mode === 'replace' ? diff.removed.length : 0, kept: mode === 'merge' ? diff.removed.length : 0 }, skipped };
  } catch (error) { throw friendly(error); }
}

export async function removeFolder(id) { await (await getBackend()).remove(id); }
export async function removeAll() { const backend = await getBackend(); for (const folder of await backend.all()) await backend.remove(folder.id); }
export async function setActive(id, active) { const backend = await getBackend(); const folder = (await backend.all()).find(f => f.id === id); if (folder) await backend.put({ ...folder, active: Boolean(active) }); }

// The saved files as objects that behave like the File objects the rest of the app already uses (name, size, webkitRelativePath, text()).
// The text is read from the store only when somebody asks for it, so opening a page with a large folder does not load it all in memory.
export async function savedFiles(folders) {
  const backend = await getBackend(); const out = [];
  for (const folder of folders || []) {
    if (folder.active === false) continue;
    for (const entry of folder.files) {
      out.push({ name: entry.path.split('/').pop(), size: entry.size, lastModified: entry.lastModified, webkitRelativePath: entry.path, savedIn: folder.id,
        text: async () => { const text = await backend.getText(folder.id, entry.path); return typeof text === 'string' ? text : ''; } });
    }
  }
  return out;
}

// How much room the browser gives this site; the copy is part of it. Not every browser answers.
export async function storageUsage() {
  try { if (navigator.storage?.estimate) { const { usage, quota } = await navigator.storage.estimate(); return { usage: usage || 0, quota: quota || 0 }; } } catch { /* not available */ }
  return null;
}
// Asks the browser not to discard the copy when it is short of space. It may refuse; the copy then works the same until the browser decides otherwise.
export async function requestPersistence() { try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; } }
