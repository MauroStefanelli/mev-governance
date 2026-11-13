import { checkAttachments, attachmentSummary, pasteItem, formatSize, connectionWarnings, loadConnection, saveConnection, emptyConnection, CONNECTION_KEY, MAX_ITEMS, MAX_CHARS_EACH, MAX_CHARS_TOTAL, sourceExcerptsFor } from './rationaleAttachments';

const TOKEN = 'ghp_' + '0123456789abcdefghijABCDEFGHIJ0123';
const code = (name, text) => ({ kind: 'sorgente', name, text, startLine: 1, endLine: 3 });

describe('what may leave the browser', () => {
  test('a normal excerpt and a pasted result are kept, in order', () => {
    const { kept, dropped } = checkAttachments([code('src/Servizio.java', 'class Servizio { void invia() {} }'), pasteItem('Risultato query', 'ID;STATO\n1;OK')]);
    expect(kept.map(a => a.name)).toEqual(['src/Servizio.java', 'Risultato query']); expect(dropped).toEqual([]);
  });
  test('an item with a credential is dropped, with the reason and the line, and its text is nowhere in the result', () => {
    const { kept, dropped } = checkAttachments([code('config/Db.java', 'riga uno\nString t = "' + TOKEN + '";'), code('ok.java', 'class A {}')]);
    expect(kept.map(a => a.name)).toEqual(['ok.java']); expect(dropped).toEqual([{ name: 'config/Db.java', reason: 'token GitHub', line: 2 }]); expect(JSON.stringify({ kept, dropped })).not.toContain(TOKEN);
  });
  test('a password in plain text and a URL with credentials are both refused', () => {
    expect(checkAttachments([pasteItem('conn', 'password = Segreta!2026x')]).dropped).toHaveLength(1);
    expect(checkAttachments([pasteItem('conn', 'jdbc: postgres://utente:Segreta99@host/db')]).dropped[0].reason).toMatch(/utente e password/);
  });
  test('empty items are dropped as empty', () => { expect(checkAttachments([code('a.java', '   '), pasteItem('x', '')]).dropped.map(d => d.reason)).toEqual(['vuoto', 'vuoto']); });
  test('an excerpt longer than the limit is shortened, not refused', () => {
    const { kept } = checkAttachments([code('Grande.java', 'x'.repeat(MAX_CHARS_EACH + 500))]); expect(kept[0].text).toHaveLength(MAX_CHARS_EACH);
  });
  test('no more than 8 items and 20.000 characters in total: the rest is dropped with that reason', () => {
    const many = Array.from({ length: 12 }, (_, i) => code(`f${i}.java`, 'class A {}')); const a = checkAttachments(many);
    expect(a.kept).toHaveLength(MAX_ITEMS); expect(a.dropped).toHaveLength(4); expect(a.dropped[0].reason).toMatch(/oltre il limite di 8/);
    const big = Array.from({ length: 8 }, (_, i) => code(`g${i}.java`, 'y'.repeat(3900))); const b = checkAttachments(big);
    expect(b.kept).toHaveLength(Math.floor(MAX_CHARS_TOTAL / 3900)); expect(b.dropped.every(d => /limite totale/.test(d.reason))).toBe(true);
  });
  test('nothing at all is fine', () => { expect(checkAttachments(undefined)).toEqual({ kept: [], dropped: [] }); expect(checkAttachments([])).toEqual({ kept: [], dropped: [] }); });
});

describe('what the user is told', () => {
  test('sent and dropped items are named; a dropped one comes with its reason and line, never its content', () => {
    const s = attachmentSummary({ sent: [{ name: 'a.java' }, { name: 'b.java' }], dropped: [{ name: 'Db.java', reason: 'token GitHub', line: 2 }], notes: ['«x» è stato accorciato'] });
    expect(s.text).toBe('2 allegati inviati all’AI · 1 non inviato: «Db.java» (token GitHub, riga 2)'); expect(s.notes).toEqual(['«x» è stato accorciato']);
  });
  test('singular and plural, and nothing when there is nothing', () => {
    expect(attachmentSummary({ sent: [{ name: 'a' }] }).text).toBe('1 allegato inviato all’AI'); expect(attachmentSummary({}).text).toBe(''); expect(attachmentSummary().text).toBe('');
  });
  test('sizes are shown in KB and MB', () => { expect(formatSize(300)).toBe('1 KB'); expect(formatSize(20480)).toBe('20 KB'); expect(formatSize(3 * 1048576)).toBe('3.0 MB'); });
});

describe('source excerpts chosen for a question', () => {
  const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
  beforeEach(() => { const { webcrypto } = require('crypto'); const { TextEncoder: TE } = require('util'); if (!globalThis.TextEncoder) globalThis.TextEncoder = TE; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });
  test('the files whose path and text match the question come first, with path and lines', async () => {
    const files = [file('app/src/Altro.java', 'class Altro {}'), file('app/src/InvioService.java', 'class InvioService {\n  void ritenta() { retry(3); }\n}')];
    const { items, coverage } = await sourceExcerptsFor('Dove si ritenta nell invio?', files, new Map());
    expect(items[0]).toMatchObject({ kind: 'sorgente', name: 'app/src/InvioService.java' }); expect(items[0].text).toContain('retry(3)'); expect(items[0].startLine).toBe(1);
    expect(coverage.notice).toMatch(/Campione limitato/);
  });
  test('no folder, no excerpts and no coverage note', async () => { expect(await sourceExcerptsFor('qualsiasi', [], new Map())).toEqual({ items: [], coverage: null }); });
  test('folders that never hold the code (node_modules, .git, target) and other file types are not read', async () => {
    const files = [file('app/node_modules/x/index.js', 'secret thing'), file('app/.git/config', 'x'), file('app/immagine.png', 'binary'), file('app/src/Ok.java', 'class Ok {}')];
    const { items } = await sourceExcerptsFor('class Ok', files, new Map()); expect(items.map(i => i.name)).toEqual(['app/src/Ok.java']);
  });
});

describe('connection notes (how to reach an environment): text for people, never credentials, kept in this browser only', () => {
  const memory = () => { const data = {}; return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } }; };
  test('they are saved and read back from the browser, and start empty', () => {
    const storage = memory(); expect(loadConnection(storage)).toEqual(emptyConnection());
    saveConnection({ ...emptyConnection(), environment: 'Collaudo NPSO', vpn: 'VPN Poste' }, storage); expect(loadConnection(storage)).toMatchObject({ environment: 'Collaudo NPSO', vpn: 'VPN Poste', host: '' });
  });
  test('a broken or missing storage never breaks the panel', () => {
    expect(loadConnection({ getItem: () => '{not json' })).toEqual(emptyConnection()); expect(loadConnection({ getItem: () => { throw new Error('no'); } })).toEqual(emptyConnection());
    expect(saveConnection({}, { setItem: () => { throw new Error('quota'); } })).toBe(false);
  });
  test('a credential written in the notes is flagged by field and by kind, never repeated', () => {
    const w = connectionWarnings({ ...emptyConnection(), host: 'oracle://utente:Segreta99@db.poste.it/NPSO', access: 'password = Abc!12345x' });
    expect(w.map(x => x.field).sort()).toEqual(['access', 'host']); expect(JSON.stringify(w)).not.toMatch(/Segreta99|Abc!12345/);
    expect(connectionWarnings({ ...emptyConnection(), host: 'Oracle NPSO collaudo, schema SAPLES' })).toEqual([]);
  });
  test('the notes are stored under their own key, separate from anything the server knows', () => { expect(CONNECTION_KEY).toBe('mev-rationale-connection-notes'); });
});
