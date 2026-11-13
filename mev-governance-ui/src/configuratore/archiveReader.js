import JSZip from 'jszip';
import pako from 'pako';

// Reads the notes of a backup from a ZIP, a TAR.GZ / TGZ or a plain TAR, in the browser. Nothing is uploaded: the archive is opened here.
// The result is the same for every format: a Map from the path inside the archive to a function that returns the file text.
//   path of "claude-backup/projects/…" and of "projects/…" end up under the same key "projects/…" (one extra top folder is tolerated).
export const MAX_TAR_BYTES = 600 * 1024 * 1024;       // the compressed archive
export const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024; // the unpacked size, to stop a "zip bomb" before it fills the memory
const BLOCK = 512;

export const archiveKind = name => {
  const n = String(name || '').toLowerCase();
  if (/\.zip$/.test(n)) return 'zip'; if (/\.(tar\.gz|tgz)$/.test(n)) return 'targz'; if (/\.tar$/.test(n)) return 'tar'; return '';
};
export const topKey = path => String(path).replace(/^\.?\/*/, '').replace(/^[^/]+\/(?=projects\/)/, '');

const text = (bytes, start, length) => { let end = start; const limit = start + length; while (end < limit && bytes[end] !== 0) end++; return new TextDecoder('utf-8').decode(bytes.subarray(start, end)); };
const octal = (bytes, start, length) => { const raw = text(bytes, start, length).trim(); return raw ? parseInt(raw, 8) : 0; };

// Walks the 512-byte headers of a TAR (ustar and GNU long names) and returns { path, start, size } for every regular file.
// Only what a backup needs is supported: regular files and directories. Links, devices and other special entries are skipped, never followed.
export function listTar(bytes) {
  const entries = []; let offset = 0; let longName = ''; let unpacked = 0;
  while (offset + BLOCK <= bytes.length) {
    if (bytes.subarray(offset, offset + BLOCK).every(b => b === 0)) break;         // two empty blocks end the archive
    let name = text(bytes, offset, 100); const size = octal(bytes, offset + 124, 12); const type = String.fromCharCode(bytes[offset + 156] || 48);
    const prefix = text(bytes, offset + 345, 155); if (prefix && /^ustar/.test(text(bytes, offset + 257, 6))) name = prefix + '/' + name;
    const dataStart = offset + BLOCK; const next = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (!Number.isFinite(size) || size < 0 || dataStart + size > bytes.length) throw new Error('L’archivio TAR è danneggiato o incompleto.');
    if (type === 'L') { longName = text(bytes, dataStart, size); offset = next; continue; }          // GNU long name: applies to the next entry
    if (type === 'x' || type === 'g') { const m = /\d+ path=([^\n]+)\n/.exec(text(bytes, dataStart, size)); if (m && type === 'x') longName = m[1]; offset = next; continue; }  // pax header
    if (longName) { name = longName; longName = ''; }
    if ((type === '0' || type === '\0' || type === '7') && name && !name.endsWith('/')) { unpacked += size; entries.push({ path: name, start: dataStart, size }); }
    if (unpacked > MAX_UNPACKED_BYTES) throw new Error('L’archivio, una volta aperto, supera 1 GB: comprimi solo la cartella projects.');
    offset = next;
  }
  return entries;
}

// ZIP: the entries stay compressed until a note is actually read.
async function fromZip(file) {
  let zip; try { zip = await JSZip.loadAsync(file); } catch { throw new Error('Il file non è uno zip leggibile.'); }
  const files = new Map(); const duplicates = new Set();
  zip.forEach((path, entry) => { if (entry.dir) return; const key = topKey(path); if (files.has(key)) duplicates.add(key); else files.set(key, () => entry.async('string')); });
  return { files, duplicates: [...duplicates], format: 'zip' };
}
async function fromTarBytes(bytes, format) {
  const files = new Map(); const duplicates = new Set();
  for (const entry of listTar(bytes)) {
    const key = topKey(entry.path); if (files.has(key)) { duplicates.add(key); continue; }
    files.set(key, async () => new TextDecoder('utf-8').decode(bytes.subarray(entry.start, entry.start + entry.size)));
  }
  return { files, duplicates: [...duplicates], format };
}
const readBytes = async file => new Uint8Array(await file.arrayBuffer());

export async function openArchive(file) {
  if (!file) throw new Error('Scegli l’archivio della cartella.');
  const kind = archiveKind(file.name);
  if (!kind) throw new Error('Formato non supportato: usa .zip, .tar.gz, .tgz o .tar.');
  if (file.size > (kind === 'zip' ? 600 * 1024 * 1024 : MAX_TAR_BYTES)) throw new Error(`L’archivio supera ${Math.round(MAX_TAR_BYTES / 1048576)} MB: comprimi solo la cartella projects.`);
  if (kind === 'zip') return fromZip(file);
  let bytes = await readBytes(file);
  if (kind === 'targz') {
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('Il file non è un archivio .tar.gz leggibile (manca l’intestazione gzip).');
    // pako does NOT complain about a gzip that was cut: it returns what it managed to read, and a half-downloaded backup would look complete.
    // The last 4 bytes of a gzip file hold the unpacked size (modulo 2^32): a cut file never matches, so the check is exact for anything under 4 GB.
    const declared = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 4, 4).getUint32(0, true);
    // A cut file gives a meaningless "declared" size, so integrity is judged first; only a file that is whole is then checked against the size limit.
    // Opening it first would already use the memory the limit is meant to protect, so the declared size also gates the (cheap) comparison below.
    let unpacked; try { unpacked = pako.ungzip(bytes); } catch { throw new Error('Il file .tar.gz è danneggiato o incompleto.'); }
    if (unpacked.length !== declared) throw new Error('Il file .tar.gz è incompleto: il download o la copia si sono interrotti. Rigeneralo e riprova.');
    if (unpacked.length > MAX_UNPACKED_BYTES) throw new Error('L’archivio, una volta aperto, supera 1 GB: comprimi solo la cartella projects.');
    bytes = unpacked;
  }
  return fromTarBytes(bytes, kind);
}
