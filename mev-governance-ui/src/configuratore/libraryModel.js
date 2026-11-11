export const FOLDERS = ['Memorie iniziali', 'Requisiti cliente', 'Analisi funzionali', 'Documentazione tecnica', 'Email e comunicazioni', 'Allegati ricevuti'];
export const MEMORY = 'Memorie iniziali';
export const MAX_FILE = 10 * 1024 * 1024;
export const MAX_FILES = 5;
export const BLOCKED = ['exe', 'dll', 'bat', 'cmd', 'com', 'msi', 'scr', 'ps1', 'vbs', 'vbe', 'jar', 'sh', 'app', 'apk', 'pif', 'lnk', 'msc', 'reg', 'hta', 'wsf', 'cpl'];

export const extensionOf = name => { const match = /\.([^.\\/]+)$/.exec(String(name || '')); return match ? match[1].toLowerCase() : ''; };

const KINDS = {
  pdf: ['PDF', 'pdf'], doc: ['Word', 'word'], docx: ['Word', 'word'], xls: ['Excel', 'excel'], xlsx: ['Excel', 'excel'], csv: ['CSV', 'excel'], ppt: ['PowerPoint', 'slides'], pptx: ['PowerPoint', 'slides'],
  txt: ['Testo', 'text'], md: ['Testo', 'text'], json: ['JSON', 'code'], xml: ['XML', 'code'], html: ['HTML', 'code'], htm: ['HTML', 'code'],
  zip: ['Archivio', 'archive'], rar: ['Archivio', 'archive'], eml: ['Email', 'mail'], msg: ['Email', 'mail'],
  png: ['Immagine', 'image'], jpg: ['Immagine', 'image'], jpeg: ['Immagine', 'image'], gif: ['Immagine', 'image'], svg: ['Immagine', 'image'],
};
export const fileKind = name => { const [label, tone] = KINDS[extensionOf(name)] || [extensionOf(name).toUpperCase() || 'File', 'file']; return { label, tone }; };

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0).replace('.', ',')} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// Same rules the server applies, so users learn why a file is refused before waiting for the upload.
export function checkFile(file) {
  const name = String(file?.name || '');
  if (!name) return 'Nome file non valido.';
  if (BLOCKED.includes(extensionOf(name))) return `Il formato .${extensionOf(name)} non è ammesso: è un file eseguibile.`;
  if (!file.size) return 'Il file è vuoto.';
  if (file.size > MAX_FILE) return `Supera ${formatSize(MAX_FILE)} (${formatSize(file.size)}).`;
  return '';
}

// Splits a drop/selection into files to send (in batches the server accepts) and files refused locally.
export function planUpload(files) {
  const accepted = []; const refused = [];
  [...files].forEach(file => { const reason = checkFile(file); if (reason) refused.push({ fileName: file.name, ok: false, message: reason }); else accepted.push(file); });
  const batches = []; for (let i = 0; i < accepted.length; i += MAX_FILES) batches.push(accepted.slice(i, i + MAX_FILES));
  return { batches, refused };
}

export const folderCounts = (documents, folders = FOLDERS) => Object.fromEntries(folders.map(name => [name, documents.filter(d => d.category === name).length]));

export function filterDocuments(documents, { folder = '', text = '' } = {}) {
  const needle = String(text || '').trim().toLowerCase();
  return documents.filter(d => (!folder || d.category === folder) && (!needle || d.fileName.toLowerCase().includes(needle)));
}

const STATUS = {
  ready: { label: 'Indicizzato', tone: 'ok', hint: 'Testo estratto e ricercabile.' },
  partial: { label: 'Indicizzato in parte', tone: 'warn', hint: 'È stata letta solo una parte del contenuto.' },
  empty: { label: 'Nessun testo', tone: 'warn', hint: 'Nessun testo leggibile (per esempio un PDF scansionato). Il nome resta ricercabile.' },
  unsupported: { label: 'Solo nome', tone: 'muted', hint: 'Formato non leggibile: si cerca solo per nome. L’originale è scaricabile.' },
  error: { label: 'Non leggibile', tone: 'bad', hint: 'File danneggiato o protetto: l’originale è conservato ma il contenuto non è ricercabile.' },
  pending: { label: 'Da indicizzare', tone: 'muted', hint: 'Caricato prima del workspace: premi «Indicizza» per renderlo ricercabile.' },
};
export const indexStatus = document => STATUS[document.indexStatus] || STATUS.pending;
export const isSearchable = document => ['ready', 'partial'].includes(document.indexStatus);

export function describeResults(results) {
  const withContent = results.filter(r => r.snippets?.length).length;
  return `${results.length} ${results.length === 1 ? 'documento' : 'documenti'}${withContent ? ` · ${withContent} con estratti dal contenuto` : ''}`;
}

// Splits a snippet around the query terms so the match can be highlighted without injecting HTML.
export function highlightParts(text, terms) {
  const list = (terms || []).filter(t => t && t.length >= 2);
  if (!list.length) return [{ text, hit: false }];
  const strip = value => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const folded = strip(text);
  if (folded.length !== text.length) return [{ text, hit: false }]; // composed characters would shift positions
  const marks = new Array(text.length).fill(false);
  list.forEach(term => { const needle = strip(term); let at = folded.indexOf(needle); while (at >= 0) { for (let i = at; i < at + needle.length; i++) marks[i] = true; at = folded.indexOf(needle, at + needle.length); } });
  const parts = []; let start = 0;
  for (let i = 1; i <= text.length; i++) if (i === text.length || marks[i] !== marks[start]) { parts.push({ text: text.slice(start, i), hit: marks[start] }); start = i; }
  return parts;
}

// What the AI is told about its sources, so users can verify an answer against the documents.
export const sourceLabel = source => `${source.fileName} · v${source.version} · ${source.location}`;

export const TIMELINE = { caricato: 'Caricato', 'nuova versione': 'Nuova versione', cartella: 'Cartella cambiata', 'ai-attivata': 'Usato dall’AI', 'ai-disattivata': 'Escluso dall’AI', eliminato: 'Eliminato' };
export const eventLabel = action => TIMELINE[action] || action;

// OCR (text recognition) is only meaningful for raster images. SVG is text and is read as such.
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'webp'];
export const isRasterImage = name => IMAGE_EXTENSIONS.includes(extensionOf(name));

// What the user must be asked before sending: one question per upload, only if it contains images.
export const imagesNeedingOcrChoice = files => [...files].filter(file => isRasterImage(file.name) && !checkFile(file));

// 'ask' = show the question, 'none' = no image in the selection. The choice is made per image, with shortcuts for all/none.
export function ocrChoiceState(images, choices) {
  const picked = images.filter(file => choices[file.name]).length;
  return { total: images.length, picked, all: picked === images.length && images.length > 0, none: picked === 0 };
}

export const ocrOutcomeLabel = {
  done: { text: 'Testo riconosciuto con OCR', tone: 'ok' },
  empty: { text: 'OCR eseguito: nessun testo trovato', tone: 'warn' },
  failed: { text: 'OCR non riuscito', tone: 'bad' },
  unavailable: { text: 'OCR non disponibile su questo server', tone: 'warn' },
  none: { text: '', tone: 'muted' },
};
export const ocrOutcome = status => ocrOutcomeLabel[status] || ocrOutcomeLabel.none;
