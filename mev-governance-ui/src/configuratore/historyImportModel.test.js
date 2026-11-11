import fs from 'fs';
import { parseManifest, readNotes, classifyNotes, bySystem, buildReport, systemOf, gotoOf, skipReason, authorOf, folderOf, baseName } from './historyImportModel';
import { scanForSecrets, RULE_LABELS } from './secretScan';

import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';
const ZIP = '/tmp/backup-full.zip';
const MANIFEST = '/Users/MSTEFANE/Downloads/claude-backup-20261111-143450.manifest.txt';
const real = fs.existsSync(ZIP) && fs.existsSync(MANIFEST);
const withReal = real ? test : test.skip;
const asFile = (path) => { const buffer = fs.readFileSync(path); const file = new File([buffer], 'backup.zip', { type: 'application/zip' }); Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }); return file; };
// jsdom has neither TextEncoder nor crypto.subtle; the browser has both.
beforeEach(() => { if (!globalThis.TextEncoder) globalThis.TextEncoder = NodeTextEncoder; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });
const TOKEN = 'ghp_' + '0123456789abcdefghijABCDEFGHIJ0123';

describe('secret scan', () => {
  const flags = (text, file = 'nota.md') => scanForSecrets(file, text).length > 0;
  test('finds each kind of credential', () => {
    expect(flags('Il token è ' + TOKEN)).toBe(true);
    expect(flags('oc login --token=sha256~' + 'a'.repeat(30))).toBe(true);
    expect(flags('Authorization: Bearer ' + 'x'.repeat(10) + 'abcdefghijklmnop')).toBe(true);
    expect(flags('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk')).toBe(true);
    expect(flags('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
    expect(flags('jdbc: postgres://utente:Segreta99@host/db')).toBe(true);
    expect(flags('La password è `Qwerty!2026x`')).toBe(true);
    expect(flags('pass:  Xk9#mLp2')).toBe(true);
    expect(flags("PGPASSWORD='Abc123xyz9' psql")).toBe(true);
  });
  test('does not flag ordinary technical text, placeholders or links to other notes', () => {
    expect(flags("Serve la password dell'utente, da chiedere a Poste.")).toBe(false);
    expect(flags('password: <da chiedere>')).toBe(false);
    expect(flags('password: xxxxxxxx')).toBe(false); expect(flags('password = ${DB_PASSWORD}')).toBe(false); expect(flags('password: null')).toBe(false);
    expect(flags('Vedi [[reference-oc-login-token-ilp-sviluppo]] e feedback-ghe-pr-merge-via-api-no-ssh.md')).toBe(false);
    expect(flags('Causa: la proprietà camel.springboot.xmlRoutes è rimossa in Camel 4.18.0; commit 51b03f2')).toBe(false);
  });
  test('an access note is read more strictly than an ordinary one', () => {
    const line = 'host x Ab1Cd2Ef3Gh4Ij5Kl6';
    expect(flags(line, 'reference-x-db-access.md')).toBe(true);
    expect(flags(line, 'ilp-nota-normale.md')).toBe(false);
  });
  test('the report of a hit has the rule and the line and never the value', () => {
    const hits = scanForSecrets('n.md', 'riga uno\nIl token è ' + TOKEN + '\n');
    expect(hits.find(h => h.rule === 'token-github')).toEqual({ rule: 'token-github', line: 2 });
    expect(JSON.stringify(hits)).not.toContain(TOKEN);
    expect(Object.keys(RULE_LABELS)).toEqual(expect.arrayContaining(['token-github', 'password-con-valore', 'credenziale-in-file-sensibile']));
  });
});

describe('manifest and classification', () => {
  test('lines glued together by a bad paste are reported, not guessed', () => {
    const m = parseManifest('projects/-home-a/memory/MEMORY.mdprojects/-home-a/memory/ilp.md\nprojects/-home-a/memory/ok.md\nprojects/-home-a/x.jsonl\n');
    expect(m.stuck).toHaveLength(1); expect(m.markdown).toEqual(['projects/-home-a/memory/ok.md']); expect(m.skippedByType).toBe(1);
  });
  test('author, folder, system and GOTO are read from the path and the text', () => {
    expect(authorOf('projects/-home-mfabbri-opencode/memory/a.md')).toBe('mfabbri');
    expect(folderOf('projects/-home-mfabbri/memory/a.md')).toBe('-home-mfabbri'); expect(baseName('projects/x/memory/a.md')).toBe('a.md');
    expect(systemOf('ilp-fix.md')).toBe('ILP'); expect(systemOf('ipersuite-x.md')).toBe('IPER/IPERSUITE'); expect(systemOf('is-connector-as4-x.md')).toBe('IS-CONNECTOR-AS4'); expect(systemOf('altro-x.md')).toBe('');
    expect(gotoOf('ilp-x.md', '143247 '.repeat(5))).toBe('143247');
    expect(gotoOf('ilp-143247-x.md', 'niente')).toBe('143247');
    expect(gotoOf('ilp-x.md', 'citato una volta 141761')).toBe('');
    expect(gotoOf('ilp-x.md', '143247 143247 143247 146757 146757 146757')).toBe('');
  });
  test('indexes, session hubs, preferences and personal notes are left out with a reason', () => {
    for (const name of ['MEMORY.md', 'session-ilp.md', 'index-feedback-x.md', 'feedback-no-readme-updates.md', 'user-ferie-permessi-piano-2026.md', 'vpn-x.md', 'tool-oc-cli-installed.md'])
      expect(skipReason(name)).not.toBe('');
    expect(skipReason('ilp-despatch-id-anagldv.md')).toBe(''); expect(skipReason('reference-ilp-collaudo-access.md')).toBe('');
  });
  test('a note with a secret is refused with rule and line, one without a system is set aside, an identical one is read once', async () => {
    const note = (fileName, text) => ({ path: 'projects/-home-m/memory/' + fileName, fileName, author: 'm', text });
    const c = await classifyNotes([note('ilp-a.md', 'Il servizio riprova tre volte.'), note('ilp-b.md', 'Il servizio riprova tre volte.'), note('ilp-c.md', 'token ' + TOKEN),
      note('zzz-d.md', 'testo'), note('ilp-e.md', '   '), note('ilp-f.md', 'x'.repeat(60001)), note('session-ilp.md', 'link')]);
    expect(c.toRead.map(n => n.fileName)).toEqual(['ilp-a.md']);
    expect(c.skipped.map(n => n.fileName).sort()).toEqual(['ilp-b.md', 'session-ilp.md']);
    expect(c.skipped.find(n => n.fileName === 'ilp-b.md').reason).toContain('ilp-a.md');
    expect(c.secrets.map(n => n.fileName)).toEqual(['ilp-c.md']); expect(c.noSystem.map(n => n.fileName)).toEqual(['zzz-d.md']); expect(c.unusable).toHaveLength(2);
    expect(c.toRead[0].sha).toMatch(/^[0-9a-f]{64}$/);
  });
  test('the report lists names, rules and lines — and no secret, no note text', async () => {
    const note = (fileName, text) => ({ path: 'projects/-home-m/memory/' + fileName, fileName, author: 'm', text });
    const classified = await classifyNotes([note('ilp-c.md', 'prima riga\nIl token è ' + TOKEN + ' e basta'), note('session-ilp.md', 'Contenuto riservato della sessione')]);
    const report = buildReport({ classified, missing: ['projects/x/y.md'], stuck: ['aaa'], date: new Date('2026-11-11T10:00:00Z') });
    expect(report).toContain('# Rapporto importazione storico AI — 2026-11-11');
    expect(report).toContain('| projects/-home-m/memory/ilp-c.md | token GitHub | 2 | sicura |');
    expect(report).toContain('Non lette per scelta'); expect(report).toContain('projects/x/y.md');
    expect(report).not.toContain(TOKEN); expect(report).not.toContain('Contenuto riservato'); expect(report).not.toContain('Il token è');
  });
});

test('a note stopped only by the prudential check is marked "da verificare" in the report, a sure one is not', async () => {
  const note = (fileName, text) => ({ path: 'projects/-home-m/memory/' + fileName, fileName, author: 'm', text });
  const c = await classifyNotes([note('reference-x-access.md', 'host Ab1Cd2Ef3Gh4Ij5Kl6'), note('ilp-sure.md', 'token ' + TOKEN)]);
  const report = buildReport({ classified: c, date: new Date('2026-11-11T10:00:00Z') });
  expect(report).toMatch(/reference-x-access\.md \| stringa lunga in una nota di accessi \| 1 \| da verificare/);
  expect(report).toMatch(/ilp-sure\.md \| token GitHub \| 1 \| sicura/);
  expect(report).toContain('da verificare a mano (fermate solo da un controllo prudenziale, potrebbero essere innocue): 1');
});

test('without a hash function no note is wrongly treated as a duplicate of another', async () => {
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    const note = (fileName, text) => ({ path: 'projects/-home-m/memory/' + fileName, fileName, author: 'm', text });
    const c = await classifyNotes([note('ilp-a.md', 'Prima nota tecnica.'), note('ilp-b.md', 'Seconda nota tecnica, diversa.'), note('npso-c.md', 'Terza nota.')]);
    expect(c.toRead.map(n => n.fileName)).toEqual(['ilp-a.md', 'ilp-b.md', 'npso-c.md']); expect(c.skipped).toEqual([]);
  } finally { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); }
});

describe('on the real backup', () => {
  withReal('the manifest and the zip agree, the secrets are caught, and what is left to read is only technical knowledge', async () => {
    const manifest = parseManifest(fs.readFileSync(MANIFEST, 'utf8'));
    expect(manifest.paths).toHaveLength(507); expect(manifest.markdown).toHaveLength(384); expect(manifest.skippedByType).toBe(123); expect(manifest.stuck).toHaveLength(0);
    const { found, missing, notInManifest } = await readNotes(asFile(ZIP), manifest);
    expect(found).toHaveLength(384); expect(missing).toEqual([]); expect(notInManifest).toEqual([]);
    const c = await classifyNotes(found);
    const total = c.toRead.length + c.skipped.length + c.secrets.length + c.unusable.length + c.noSystem.length;
    expect(total).toBe(384);
    // 1. no note that still has a credential reaches the list to read
    for (const n of c.toRead) expect(scanForSecrets(n.fileName, n.text)).toEqual([]);
    // 2. the notes that hold the access data are all refused, by name
    const refused = c.secrets.map(n => n.fileName);
    for (const name of ['reference-ghe-pat-current.md', 'reference-ilp-collaudo-access.md', 'reference-sudo-password.md', 'reference-npso-sviluppo-db-access.md', 'reference-oc-login-token-ilp-sviluppo.md', 'reference-bep-dev-db-access.md']) expect(refused).toContain(name);
    // 3. notes that are not about a system or are personal never reach the AI
    const names = c.toRead.map(n => n.fileName);
    for (const name of ['MEMORY.md', 'session-ilp.md', 'user-ferie-permessi-piano-2026.md', 'feedback-ferie-dati-personali-mai-esportare.md', 'vpn-poste-claude-connectivity.md', 'reference-ghe-pat-current.md']) expect(names).not.toContain(name);
    // 4. the systems are the ones of the Storico
    const systems = bySystem(c.toRead); expect(systems.map(s => s.system)).toEqual(expect.arrayContaining(['ILP', 'NPSO', 'BEP', 'IPER/IPERSUITE']));
    // 5. the report names the refused notes but carries no value
    const report = buildReport({ classified: c, date: new Date('2026-11-11T10:00:00Z') });
    expect(report).toContain('reference-ghe-pat-current.md'); expect(report).not.toMatch(/ghp_[A-Za-z0-9]{10}/); expect(report).not.toMatch(/sha256~[A-Za-z0-9_-]{10}/);
    // eslint-disable-next-line no-console
    console.log('REALE', JSON.stringify({ daLeggere: c.toRead.length, scartateSegreti: c.secrets.length, perScelta: c.skipped.length, senzaSistema: c.noSystem.length, inutilizzabili: c.unusable.length, perSistema: systems, conGoto: c.toRead.filter(n => n.goto).length }));
  }, 120000);
});

describe('reading the zip', () => {
  const zipFile = async (files) => { const JSZip = require('jszip'); const zip = new JSZip(); Object.entries(files).forEach(([k, v]) => zip.file(k, v)); const buffer = await zip.generateAsync({ type: 'nodebuffer' }); const f = new File([buffer], 'b.zip'); Object.defineProperty(f, 'arrayBuffer', { value: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }); return f; };
  test('a path in the list that is not in the zip is reported as missing, and a note in the zip that is not in the list is reported too', async () => {
    const manifest = parseManifest('projects/-h/memory/a.md\nprojects/-h/memory/manca.md\n');
    const r = await readNotes(await zipFile({ 'projects/-h/memory/a.md': 'testo', 'projects/-h/memory/extra.md': 'altro' }), manifest);
    expect(r.found.map(n => n.fileName)).toEqual(['a.md']); expect(r.missing).toEqual(['projects/-h/memory/manca.md']); expect(r.notInManifest).toEqual(['projects/-h/memory/extra.md']);
    const report = buildReport({ classified: { toRead: [], skipped: [], secrets: [], unusable: [], noSystem: [] }, missing: r.missing, notInManifest: r.notInManifest });
    expect(report).toContain('assenti nello zip'); expect(report).toContain('manca.md'); expect(report).toContain('extra.md');
  });
  test('an extra top folder inside the zip does not hide the notes', async () => {
    const r = await readNotes(await zipFile({ 'claude-backup/projects/-h/memory/a.md': 'testo' }), parseManifest('projects/-h/memory/a.md'));
    expect(r.found).toHaveLength(1); expect(r.missing).toEqual([]);
  });
  test('a zip too big or not a zip is refused with a reason', async () => {
    await expect(readNotes(null, parseManifest('projects/a.md'))).rejects.toThrow('Scegli lo zip');
    await expect(readNotes(Object.assign(new File(['x'], 'b.zip'), {}), parseManifest('projects/a.md'))).rejects.toThrow('non è uno zip leggibile');
    const big = new File(['x'], 'b.zip'); Object.defineProperty(big, 'size', { value: 700 * 1024 * 1024 });
    await expect(readNotes(big, parseManifest('projects/a.md'))).rejects.toThrow('supera');
  });
});

describe('the reading queue', () => {
  const notes = n => Array.from({ length: n }, (_, i) => ({ path: `p/${i}.md`, fileName: `${i}.md`, text: `t${i}`, system: 'ILP', goto: '', author: 'm', sha: `${i}`.padStart(64, '0') }));
  test('sends one request per note with path, system and author, and counts what the server did', async () => {
    const sent = [];
    const request = async (path, { body }) => { sent.push(body); return body.fileName === '1.md' ? { outcome: 'senza-voci', proposals: 0 } : body.fileName === '2.md' ? { outcome: 'gia-letto', proposals: 0 } : { outcome: 'elaborato', proposals: 2 }; };
    const { runImport } = require('./historyImportModel');
    const r = await runImport({ notes: notes(4), request });
    expect(sent).toHaveLength(4); expect(sent[0]).toEqual({ path: 'p/0.md', fileName: '0.md', text: 't0', system: 'ILP', goto: null, author: 'm' });
    expect(r.read).toHaveLength(2); expect(r.proposals).toBe(4); expect(r.withoutEntries).toHaveLength(1); expect(r.alreadyRead).toHaveLength(1); expect(r.stoppedBecause).toBe('');
  });
  test('a server refusal for secrets is kept with its rules and does not stop the run', async () => {
    const { runImport } = require('./historyImportModel');
    const request = async (path, { body }) => { if (body.fileName === '0.md') { const e = new Error('x'); e.status = 422; e.details = { code: 'segreti', hits: [{ rule: 'jwt', description: 'token JWT', line: 3 }] }; throw e; } return { outcome: 'elaborato', proposals: 1 }; };
    const r = await runImport({ notes: notes(3), request });
    expect(r.serverRefused).toHaveLength(1); expect(r.serverRefused[0].hits[0].line).toBe(3); expect(r.read).toHaveLength(2); expect(r.stoppedBecause).toBe('');
  });
  test('it stops by itself after repeated AI failures and leaves the other notes untouched', async () => {
    const { runImport } = require('./historyImportModel'); let calls = 0;
    const request = async () => { calls += 1; const e = new Error('AI giù'); e.status = 502; throw e; };
    const r = await runImport({ notes: notes(20), request, concurrency: 1 });
    expect(r.stoppedBecause).toBe('ai'); expect(calls).toBe(3); expect(r.failed).toHaveLength(3); expect(r.notStarted).toHaveLength(17);
  });
  test('a missing permission stops the run at once', async () => {
    const { runImport } = require('./historyImportModel');
    const request = async () => { const e = new Error('Non hai i permessi'); e.status = 403; throw e; };
    const r = await runImport({ notes: notes(10), request, concurrency: 1 });
    expect(r.stoppedBecause).toBe('permessi'); expect(r.failed).toHaveLength(1);
  });
  test('a success between failures resets the count, so a flaky AI does not stop the run', async () => {
    const { runImport } = require('./historyImportModel'); let n = 0;
    const request = async () => { n += 1; if (n % 3 !== 0) { const e = new Error('lento'); e.status = 502; throw e; } return { outcome: 'elaborato', proposals: 1 }; };
    const r = await runImport({ notes: notes(9), request, concurrency: 1 });
    expect(r.stoppedBecause).toBe(''); expect(r.read).toHaveLength(3); expect(r.failed).toHaveLength(6);
  });
  test('cancelling stops between two notes and says so', async () => {
    const { runImport } = require('./historyImportModel'); let cancel = false;
    const request = async () => { cancel = true; return { outcome: 'elaborato', proposals: 1 }; };
    const r = await runImport({ notes: notes(10), request, concurrency: 1, shouldCancel: () => cancel });
    expect(r.read).toHaveLength(1); expect(r.notStarted).toHaveLength(9); expect(r.stoppedBecause).toBe('annullato');
  });
  test('already known notes are filtered out before anything is sent, in batches', async () => {
    const { filterAlreadyRead } = require('./historyImportModel'); const all = notes(5); const asked = [];
    const request = async (path, { body }) => { asked.push(body.hashes.length); return { known: [all[1].sha, all[3].sha] }; };
    const { fresh, already } = await filterAlreadyRead(all, request, 2);
    expect(asked).toEqual([2, 2, 1]); expect(fresh.map(n => n.fileName)).toEqual(['0.md', '2.md', '4.md']); expect(already).toHaveLength(2);
  });
});
