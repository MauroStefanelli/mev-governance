import { extensionOf, fileKind, formatSize, checkFile, planUpload, folderCounts, filterDocuments, indexStatus, isSearchable, describeResults, highlightParts, sourceLabel, eventLabel, MAX_FILE, MAX_FILES, FOLDERS, isRasterImage, imagesNeedingOcrChoice, ocrChoiceState, ocrOutcome } from './libraryModel';

const file = (name, size = 100) => ({ name, size });

test('extensions and kinds cover the formats the workspace accepts', () => {
  expect(extensionOf('Requisiti.Finali.PDF')).toBe('pdf');
  expect(extensionOf('senza')).toBe('');
  expect(extensionOf(null)).toBe('');
  ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'rar', 'eml', 'msg', 'xml', 'json', 'png', 'jpg', 'jpeg', 'gif', 'svg'].forEach(ext => expect(fileKind(`a.${ext}`).tone).not.toBe('file'));
  expect(fileKind('a.xyz')).toEqual({ label: 'XYZ', tone: 'file' });
  expect(fileKind('noext')).toEqual({ label: 'File', tone: 'file' });
});

test('sizes are written the way Italian users expect', () => {
  expect(formatSize(0)).toBe('0 B');
  expect(formatSize(512)).toBe('512 B');
  expect(formatSize(2048)).toBe('2,0 KB');
  expect(formatSize(300 * 1024)).toBe('300 KB');
  expect(formatSize(5 * 1024 * 1024)).toBe('5,0 MB');
  expect(formatSize(undefined)).toBe('0 B');
});

test('files are checked with the same rules as the server', () => {
  expect(checkFile(file('a.pdf'))).toBe('');
  expect(checkFile(file('setup.EXE'))).toMatch(/eseguibile/);
  expect(checkFile(file('vuoto.txt', 0))).toMatch(/vuoto/);
  expect(checkFile(file('grande.pdf', MAX_FILE + 1))).toMatch(/Supera/);
  expect(checkFile(file('x.pdf', MAX_FILE))).toBe('');
  expect(checkFile({ name: '', size: 5 })).toMatch(/non valido/);
});

test('an upload is split into server-sized batches and refused files are reported with the reason', () => {
  const many = Array.from({ length: MAX_FILES * 2 + 1 }, (_, i) => file(`f${i}.txt`));
  const plan = planUpload([...many, file('virus.bat'), file('grande.pdf', MAX_FILE + 5)]);
  expect(plan.batches.map(batch => batch.length)).toEqual([MAX_FILES, MAX_FILES, 1]);
  expect(plan.refused.map(r => r.fileName)).toEqual(['virus.bat', 'grande.pdf']);
  expect(plan.refused.every(r => r.ok === false && r.message)).toBe(true);
  expect(planUpload([])).toEqual({ batches: [], refused: [] });
});

test('folders are counted and documents filtered by folder and name', () => {
  const docs = [{ category: 'Requisiti cliente', fileName: 'Requisiti.pdf' }, { category: 'Requisiti cliente', fileName: 'note.txt' }, { category: 'Memorie iniziali', fileName: 'standard.docx' }];
  expect(folderCounts(docs)['Requisiti cliente']).toBe(2);
  expect(Object.keys(folderCounts(docs))).toEqual(FOLDERS);
  expect(filterDocuments(docs, { folder: 'Requisiti cliente' })).toHaveLength(2);
  expect(filterDocuments(docs, { text: 'STANDARD' })).toHaveLength(1);
  expect(filterDocuments(docs, { folder: 'Memorie iniziali', text: 'note' })).toHaveLength(0);
  expect(filterDocuments(docs)).toHaveLength(3);
});

test('every index state is explained honestly and only readable ones count as searchable', () => {
  ['ready', 'partial', 'empty', 'unsupported', 'error', 'pending'].forEach(status => expect(indexStatus({ indexStatus: status }).hint.length).toBeGreaterThan(10));
  expect(indexStatus({ indexStatus: 'qualcosa' }).label).toBe('Da indicizzare');
  expect(isSearchable({ indexStatus: 'ready' })).toBe(true);
  expect(isSearchable({ indexStatus: 'partial' })).toBe(true);
  expect(isSearchable({ indexStatus: 'unsupported' })).toBe(false);
  expect(isSearchable({ indexStatus: 'empty' })).toBe(false);
});

test('result summaries count documents and excerpts', () => {
  expect(describeResults([])).toBe('0 documenti');
  expect(describeResults([{ snippets: [] }])).toBe('1 documento');
  expect(describeResults([{ snippets: [{}] }, { snippets: [] }])).toBe('2 documenti · 1 con estratti dal contenuto');
});

test('matches are highlighted without HTML, ignoring case and accents', () => {
  expect(highlightParts('Il Timeout è di 5 secondi', ['timeout'])).toEqual([{ text: 'Il ', hit: false }, { text: 'Timeout', hit: true }, { text: ' è di 5 secondi', hit: false }]);
  expect(highlightParts('nessuna corrispondenza', ['xyz'])).toEqual([{ text: 'nessuna corrispondenza', hit: false }]);
  expect(highlightParts('testo', [])).toEqual([{ text: 'testo', hit: false }]);
  expect(highlightParts('<b>timeout</b>', ['timeout']).map(p => p.text).join('')).toBe('<b>timeout</b>');
  expect(highlightParts('timeout timeout', ['timeout']).filter(p => p.hit)).toHaveLength(2);
});

test('sources and history events have readable labels', () => {
  expect(sourceLabel({ fileName: 'req.docx', version: 3, location: 'paragrafo 4' })).toBe('req.docx · v3 · paragrafo 4');
  expect(eventLabel('nuova versione')).toBe('Nuova versione');
  expect(eventLabel('boh')).toBe('boh');
});

test('only raster images raise the OCR question: SVG, documents and archives never do', () => {
  ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'webp'].forEach(ext => expect(isRasterImage(`a.${ext}`)).toBe(true));
  ['svg', 'pdf', 'docx', 'txt', 'zip', 'eml', 'png.exe', 'noext'].forEach(name => expect(isRasterImage(name)).toBe(false));
  expect(isRasterImage('FOTO.JPG')).toBe(true);
  const files = [file('a.png'), file('b.pdf'), file('c.svg'), file('d.jpeg'), file('vuota.png', 0), file('grande.jpg', MAX_FILE + 1), file('virus.exe')];
  expect(imagesNeedingOcrChoice(files).map(f => f.name)).toEqual(['a.png', 'd.jpeg']);
  expect(imagesNeedingOcrChoice([file('b.pdf'), file('t.txt')])).toEqual([]);
});

test('the OCR choice summary tells how many images were ticked', () => {
  const images = [file('a.png'), file('b.png')];
  expect(ocrChoiceState(images, {})).toEqual({ total: 2, picked: 0, all: false, none: true });
  expect(ocrChoiceState(images, { 'a.png': true })).toEqual({ total: 2, picked: 1, all: false, none: false });
  expect(ocrChoiceState(images, { 'a.png': true, 'b.png': true }).all).toBe(true);
  expect(ocrChoiceState([], {}).all).toBe(false);
});

test('every OCR outcome has a label and unknown ones are silent', () => {
  ['done', 'empty', 'failed', 'unavailable'].forEach(status => expect(ocrOutcome(status).text.length).toBeGreaterThan(5));
  expect(ocrOutcome('none').text).toBe('');
  expect(ocrOutcome(undefined).text).toBe('');
});
