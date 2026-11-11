import fs from 'fs';
import React from 'react';
import JSZip from 'jszip';
import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import HistoryImportPanel from './HistoryImportPanel';
import { historyImportRequest } from '../services/mevService';
jest.mock('../services/mevService', () => ({ historyImportRequest: jest.fn() }));

const TOKEN = 'ghp_' + '0123456789abcdefghijABCDEFGHIJ0123';
const REAL_ZIP = '/tmp/backup-full.zip';
const REAL_MANIFEST = '/Users/MSTEFANE/Downloads/claude-backup-20261111-143450.manifest.txt';
const withReal = fs.existsSync(REAL_ZIP) && fs.existsSync(REAL_MANIFEST) ? test : test.skip;

let server;
const entry = (id, extra = {}) => ({ id, goto: 'storico-ilp', gotoLabel: 'Storico ILP', system: 'ilp', kind: 'razionale', text: `Voce ${id}`, sourceFile: 'projects/-home-m/memory/ilp-a.md', sourceAuthor: 'mfabbri', createdAt: '2026-11-11T10:00:00Z', status: 'proposta', ...extra });
const pendingOf = rows => ({ entries: rows, hasMore: false, total: rows.length, bySystem: [...new Set(rows.map(r => r.system))].map(system => ({ system, count: rows.filter(r => r.system === system).length })) });
const zipOf = async files => { const zip = new JSZip(); Object.entries(files).forEach(([path, text]) => zip.file(path, text)); const buffer = await zip.generateAsync({ type: 'nodebuffer' }); return toFile(buffer, 'backup.zip'); };
const toFile = (buffer, name) => { const file = new File([buffer], name, { type: 'application/zip' }); Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }); return file; };
const textFile = (text, name = 'elenco.txt') => new File([text], name, { type: 'text/plain' });
const note = (name, body) => [`projects/-home-m/memory/${name}`, body];

beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); if (!globalThis.TextEncoder) globalThis.TextEncoder = NodeTextEncoder;
  server = { calls: [], pending: [entry(1), entry(2, { kind: 'vincolo', system: 'npso', goto: 'storico-npso' })], summary: { filesRead: 0, withProposals: 0, pending: 2, confirmed: 0 }, known: [], replies: {}, failAll: null };
  historyImportRequest.mockReset().mockImplementation(async (path, options = {}) => {
    server.calls.push([path, options.body]);
    if (path === 'summary') return server.summary;
    if (path.startsWith('pending')) { const key = (new URLSearchParams(path.split('?')[1] || '').get('system') || ''); return pendingOf(server.pending.filter(r => !key || r.system === key)); }
    if (path === 'check') return { known: server.known };
    if (path === 'decide') { server.pending = server.pending.filter(r => !options.body.ids.includes(r.id)); return { decided: options.body.ids.length, skipped: 0 }; }
    if (path === 'file') { if (server.failAll) throw server.failAll; return server.replies[options.body.fileName] || { outcome: 'elaborato', proposals: 2 }; }
    return {};
  });
  window.URL.createObjectURL = jest.fn(() => 'blob:x'); window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const calls = name => server.calls.filter(([path]) => path === name);
const trigger = () => screen.getAllByRole('button', { name: /Conoscenza storica AI/ })[0];
const openPanel = async (props = {}) => { render(<HistoryImportPanel canEdit {...props} />); fireEvent.click(trigger()); return screen.findByRole('dialog', { name: 'Conoscenza storica AI' }); };
const choose = (dialog, zip, manifest) => { fireEvent.change(within(dialog).getByLabelText('Zip della cartella'), { target: { files: [zip] } }); fireEvent.change(within(dialog).getByLabelText('Elenco dei file'), { target: { files: [manifest] } }); };
const preview = async (files, manifestLines) => { const dialog = await openPanel(); choose(dialog, await zipOf(files), textFile(manifestLines.join('\n'))); fireEvent.click(within(dialog).getByRole('button', { name: 'Controlla i file' })); await within(dialog).findByLabelText('Anteprima'); return dialog; };
const OK = note('ilp-uno.md', 'Il servizio riprova tre volte prima di scartare.'); const OK2 = note('npso-due.md', 'Il consolidamento avviene a fine giornata.');

test('the trigger has an icon, a name and shows how many proposals wait, without opening the panel', async () => {
  render(<HistoryImportPanel canEdit />);
  const button = trigger(); expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(await screen.findByText('2 voci da confermare')).toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('Escape closes the panel and gives the focus back to the trigger', async () => {
  await openPanel(); fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger()).toHaveFocus();
});

test('the zip is opened here, nothing is sent to the AI at the preview, and the preview counts what will be read', async () => {
  const dialog = await preview(Object.fromEntries([OK, OK2, note('MEMORY.md', '# indice'), note('ilp-segreto.md', 'Il token è ' + TOKEN)]), [OK[0], OK2[0], 'projects/-home-m/memory/MEMORY.md', 'projects/-home-m/memory/ilp-segreto.md', 'projects/-home-m/x.jsonl']);
  const plan = within(dialog).getByLabelText('Anteprima');
  expect(plan).toHaveTextContent(/2\s*note da leggere/); expect(plan).toHaveTextContent(/1\s*scartate: credenziali/);
  expect(plan).toHaveTextContent('ILP · 1'); expect(plan).toHaveTextContent('NPSO · 1');
  expect(calls('file')).toHaveLength(0); expect(calls('check')).toHaveLength(1);
  expect(JSON.stringify(server.calls)).not.toContain(TOKEN); expect(JSON.stringify(server.calls)).not.toContain('# indice');
});

test('the preview says which notes were refused for credentials, with the rule and never the value', async () => {
  const dialog = await preview(Object.fromEntries([OK, note('ilp-segreto.md', 'riga\nIl token è ' + TOKEN)]), [OK[0], 'projects/-home-m/memory/ilp-segreto.md']);
  fireEvent.click(within(dialog).getByText(/note con credenziali/));
  expect(within(dialog).getByText('ilp-segreto.md')).toBeInTheDocument(); expect(within(dialog).getByText(/token-github/)).toBeInTheDocument();
  expect(document.body.textContent).not.toContain(TOKEN);
});

test('notes already read by someone are not read again', async () => {
  const { sha256Hex } = require('./ledgerModel'); server.known = [await sha256Hex(OK[1])];
  const dialog = await preview(Object.fromEntries([OK, OK2]), [OK[0], OK2[0]]);
  expect(within(dialog).getByLabelText('Anteprima')).toHaveTextContent(/1\s*note da leggere/);
  fireEvent.click(within(dialog).getByRole('button', { name: /Leggi 1 note/ })); await within(dialog).findByText('Lettura terminata');
  expect(calls('file')).toHaveLength(1); expect(calls('file')[0][1].fileName).toBe('npso-due.md');
});

test('reading sends one request per note with path, system and author, shows progress and the result', async () => {
  server.replies['npso-due.md'] = { outcome: 'senza-voci', proposals: 0 };
  const dialog = await preview(Object.fromEntries([OK, OK2]), [OK[0], OK2[0]]);
  fireEvent.click(within(dialog).getByRole('button', { name: /Leggi 2 note con l’AI/ }));
  await within(dialog).findByText('Lettura terminata');
  expect(calls('file')).toHaveLength(2);
  expect(calls('file').find(([, b]) => b.fileName === 'ilp-uno.md')[1]).toEqual({ path: OK[0], fileName: 'ilp-uno.md', text: OK[1], system: 'ILP', goto: null, author: 'm' });
  const done = within(dialog).getByLabelText('Avanzamento');
  expect(done).toHaveTextContent(/1\s*note con proposte/); expect(done).toHaveTextContent(/1\s*senza conoscenza duratura/); expect(within(dialog).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
});

test('the server refusing a note for credentials is reported and the other notes are still read', async () => {
  const e = new Error('x'); e.status = 422; e.details = { code: 'segreti', hits: [{ rule: 'jwt', description: 'token JWT', line: 4 }] };
  historyImportRequest.mockImplementation(async (path, options = {}) => { server.calls.push([path, options.body]); if (path === 'file' && options.body.fileName === 'ilp-uno.md') throw e; if (path === 'check') return { known: [] }; if (path === 'file') return { outcome: 'elaborato', proposals: 1 }; return path.startsWith('pending') ? pendingOf([]) : { filesRead: 0, pending: 0, confirmed: 0 }; });
  const dialog = await preview(Object.fromEntries([OK, OK2]), [OK[0], OK2[0]]);
  fireEvent.click(within(dialog).getByRole('button', { name: /Leggi 2 note/ })); await within(dialog).findByText('Lettura terminata');
  expect(within(dialog).getByLabelText('Avanzamento')).toHaveTextContent(/1\s*rifiutate dal server/); expect(within(dialog).getByLabelText('Avanzamento')).toHaveTextContent(/1\s*note con proposte/);
});

test('when the AI does not answer several times in a row the run stops and says what to do', async () => {
  server.failAll = Object.assign(new Error('AI giù'), { status: 502 });
  const many = Array.from({ length: 8 }, (_, i) => note(`ilp-n${i}.md`, `Nota numero ${i} sul servizio.`));
  const dialog = await preview(Object.fromEntries(many), many.map(m => m[0]));
  fireEvent.click(within(dialog).getByRole('button', { name: /Leggi 8 note/ }));
  expect(await within(dialog).findByText(/Mi sono fermato: l’AI non ha risposto/)).toBeInTheDocument();
  expect(calls('file').length).toBeLessThan(8); expect(within(dialog).getByRole('alert')).toHaveTextContent('rilancia');
});

test('the report downloads without any secret or note text', async () => {
  let saved = '';
  window.URL.createObjectURL = jest.fn(blob => { saved = blob; return 'blob:x'; });
  const dialog = await preview(Object.fromEntries([OK, note('ilp-segreto.md', 'Il token è ' + TOKEN)]), [OK[0], 'projects/-home-m/memory/ilp-segreto.md']);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Scarica il rapporto' }));
  expect(window.URL.createObjectURL).toHaveBeenCalled();
  const text = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsText(saved); });
  expect(text).toContain('ilp-segreto.md'); expect(text).toContain('token GitHub'); expect(text).not.toContain(TOKEN); expect(text).not.toContain('Il servizio riprova');
});

test('bad inputs are explained: not a zip, an empty list, a name missing from the zip', async () => {
  const dialog = await openPanel();
  const button = within(dialog).getByRole('button', { name: 'Controlla i file' }); expect(button).toBeDisabled();
  choose(dialog, toFile(Buffer.from('non sono uno zip'), 'x.zip'), textFile(OK[0]));
  fireEvent.click(button); expect(await within(dialog).findByRole('alert')).toHaveTextContent('non è uno zip leggibile');
  choose(dialog, await zipOf(Object.fromEntries([OK])), textFile('projects/a/b.jsonl\n'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Controlla i file' })); expect(await within(dialog).findByRole('alert')).toHaveTextContent('nessun file .md');
  choose(dialog, await zipOf(Object.fromEntries([OK])), textFile(OK[0] + '\nprojects/-home-m/memory/mancante.md'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Controlla i file' })); await within(dialog).findByLabelText('Anteprima');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Scarica il rapporto' })); expect(calls('file')).toHaveLength(0);
});

test('pending proposals show kind, system, source and author; the user confirms the selected ones, and only those', async () => {
  const dialog = await openPanel(); const list = within(dialog).getByLabelText('Voci da confermare');
  expect(await within(list).findByText('Voce 1')).toBeInTheDocument(); expect(within(list).getByText('Razionale')).toBeInTheDocument(); expect(within(list).getAllByText('ilp-a.md')[0]).toBeInTheDocument();
  fireEvent.click(within(list).getByLabelText(/Seleziona: Voce 1/));
  fireEvent.click(within(list).getByRole('button', { name: /^Conferma 1/ }));
  await waitFor(() => expect(calls('decide')).toHaveLength(1)); expect(calls('decide')[0][1]).toEqual({ ids: [1], decision: 'confermata' });
  expect(await within(dialog).findByText(/1 voci confermate/)).toBeInTheDocument(); expect(within(list).queryByText('Voce 1')).not.toBeInTheDocument(); expect(within(list).getByText('Voce 2')).toBeInTheDocument();
});

test('select-all and discard work, and the buttons are off with nothing selected', async () => {
  const dialog = await openPanel(); const list = within(dialog).getByLabelText('Voci da confermare'); await within(list).findByText('Voce 1');
  expect(within(list).getByRole('button', { name: /^Scarta/ })).toBeDisabled();
  fireEvent.click(within(list).getByLabelText(/Seleziona tutte/)); fireEvent.click(within(list).getByRole('button', { name: /^Scarta 2/ }));
  await waitFor(() => expect(calls('decide')[0][1]).toEqual({ ids: [1, 2], decision: 'scartata' }));
  expect(await within(list).findByText(/Nessuna voce in attesa/)).toBeInTheDocument();
});

test('the system chips filter the proposals on the server', async () => {
  const dialog = await openPanel(); const list = within(dialog).getByLabelText('Voci da confermare'); await within(list).findByText('Voce 1');
  fireEvent.click(within(list).getByRole('button', { name: /NPSO · 1/ }));
  await waitFor(() => expect(server.calls.some(([path]) => path === 'pending?system=npso')).toBe(true)); expect(await within(list).findByText('Voce 2')).toBeInTheDocument(); expect(within(list).queryByText('Voce 1')).not.toBeInTheDocument();
});

test('a read-only user sees the proposals but cannot import, confirm or discard', async () => {
  const dialog = await openPanel({ canEdit: false }); const list = within(dialog).getByLabelText('Voci da confermare'); await within(list).findByText('Voce 1');
  expect(within(dialog).queryByLabelText('Zip della cartella')).not.toBeInTheDocument(); expect(within(list).queryByRole('button', { name: /^Conferma/ })).not.toBeInTheDocument(); expect(within(list).queryByLabelText(/Seleziona tutte/)).not.toBeInTheDocument();
});

test('if the backend is not updated the panel says so', async () => {
  historyImportRequest.mockReset().mockRejectedValue(Object.assign(new Error('Il backend non espone ancora l’importazione dello storico AI: aggiorna il backend DEV.'), { status: 404 }));
  render(<HistoryImportPanel canEdit />); fireEvent.click(trigger());
  expect(await screen.findByRole('alert')).toHaveTextContent('aggiorna il backend DEV');
});

describe('with the real backup', () => {
  withReal('the real zip and list go through the whole flow: no credential is sent, the AI is called only for pertinent notes, the report names the refused ones', async () => {
    const dialog = await openPanel();
    const buffer = fs.readFileSync(REAL_ZIP);
    choose(dialog, toFile(buffer, 'claude-backup.zip'), textFile(fs.readFileSync(REAL_MANIFEST, 'utf8'), 'manifest.txt'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Controlla i file' }));
    const plan = await within(dialog).findByLabelText('Anteprima', {}, { timeout: 60000 });
    expect(plan).toHaveTextContent(/232\s*note da leggere/); expect(plan).toHaveTextContent(/47\s*scartate: credenziali/);
    fireEvent.click(within(dialog).getByRole('button', { name: /Leggi 232 note/ })); await within(dialog).findByText('Lettura terminata', {}, { timeout: 60000 });
    const sent = calls('file').map(([, b]) => b);
    expect(sent).toHaveLength(232);
    expect(sent.some(b => /ghp_[A-Za-z0-9]{10}/.test(b.text) || /sha256~[A-Za-z0-9_-]{10}/.test(b.text))).toBe(false);
    const names = sent.map(b => b.fileName);
    for (const name of ['reference-ghe-pat-current.md', 'reference-sudo-password.md', 'reference-npso-sviluppo-db-access.md', 'MEMORY.md', 'user-ferie-permessi-piano-2026.md', 'session-ilp.md']) expect(names).not.toContain(name);
    expect(names).toContain('ilp-despatch-id-anagldv.md');
  }, 180000);
});
