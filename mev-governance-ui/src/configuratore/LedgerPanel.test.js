import fs from 'fs';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import LedgerPanel from './LedgerPanel';
import { ledgerRequest } from '../services/mevService';
jest.mock('../services/mevService', () => ({ ledgerRequest: jest.fn() }));

const REAL = '/Users/MSTEFANE/Downloads/STATO_INIZIATIVE_20261111.md';
const real = fs.existsSync(REAL) ? fs.readFileSync(REAL, 'utf8') : null;
const withFile = real ? test : test.skip;

const row = (id, extra = {}) => ({ id, key: `k${id}`, goto: String(145000 + id), gotoPlaceholder: false, title: `Iniziativa ${id}`, system: 'NPSO', pmPoste: 'Lerro', status: 'approvata', release: 'R01.2027', plannedRelease: null,
  collaudoDate: '2026-11-25', collaudoText: null, notes: 'una nota', released: null, missing: null, amounts: [], source: 'file', sourceFile: 'STATO.md', revision: 2, archived: false, createdAt: '2026-11-11T10:00:00Z', createdBy: 'anna', updatedAt: '2026-11-11T10:00:00Z', updatedBy: 'anna', ...extra });
let server;
const list = (rows, extra = {}) => ({ initiatives: rows, total: rows.length, shown: rows.length, counts: { rilasciata: rows.filter(r => r.status === 'rilasciata').length, approvata: rows.filter(r => r.status === 'approvata').length },
  systems: ['NPSO', 'BEP'], pms: ['Lerro', 'Mollo'], releases: ['R01.2027'], lastImport: null, canWork: true, ...extra });
beforeEach(() => {
  server = { rows: [row(1), row(2, { status: 'rilasciata', title: 'Rilasciata uno', goto: '145999' }), row(3, { goto: null, gotoPlaceholder: true, title: 'Senza codice' })], calls: [], previewResult: null, importResult: null };
  ledgerRequest.mockReset().mockImplementation(async (path, options = {}) => {
    server.calls.push([path, options]);
    if (path === 'import/preview') return server.previewResult || { created: 1, updated: 0, unchanged: 0, skipped: 0, items: [{ index: 0, outcome: 'nuova', title: 'X', goto: '1', system: 'NPSO' }] };
    if (path === 'import') return server.importResult || { created: 1, updated: 0, unchanged: 0, skipped: 0 };
    if (path === 'export') return { markdown: '# Stato delle iniziative', fileName: 'STATO_INIZIATIVE_20261111.md', count: 3 };
    if (/^\d+$/.test(path)) { const found = server.rows.find(r => String(r.id) === path) || (path === '99' ? row(99, { title: 'Nuova richiesta', system: 'BEP', goto: null, gotoPlaceholder: true, status: 'in-analisi' }) : undefined); if (!found) return {}; return { initiative: found, events: [{ id: 9, kind: 'stato', summary: 'Stato: Approvata → Rilasciata', changes: [{ field: 'status', label: 'Stato', from: 'approvata', to: 'rilasciata' }], actor: 'anna', actorFullName: 'Anna Rossi', at: '2026-11-11T10:00:00Z' }] }; }
    if (options.method === 'PUT') return { initiative: server.rows[0] };
    if (path.endsWith('/events') || path.endsWith('/archive') || path === '') { if (options.body && path === '') return { initiative: row(99) }; }
    const params = new URLSearchParams(path.replace(/^\?/, ''));
    let rows = server.rows;
    if (params.get('status')) rows = rows.filter(r => r.status === params.get('status'));
    if (params.get('q')) rows = rows.filter(r => r.title.toLowerCase().includes(params.get('q').toLowerCase()));
    return list(rows, { total: server.rows.length });
  });
  window.URL.createObjectURL = jest.fn(() => 'blob:x'); window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const trigger = () => screen.getAllByRole('button', { name: /Storico iniziative/ })[0];
const openPanel = async () => { render(<LedgerPanel canEdit onOpenInitiative={jest.fn()} />); fireEvent.click(trigger()); return screen.findByRole('dialog', { name: 'Storico delle iniziative' }); };
const file = (text, name = 'STATO.md') => new File([text], name, { type: 'text/markdown' });
const calls = predicate => server.calls.filter(([path, options]) => predicate(path, options));

test('the trigger is a labelled button with an icon and shows how many initiatives exist, without opening the panel', async () => {
  render(<LedgerPanel canEdit />);
  const button = screen.getByRole('button', { name: /Storico iniziative/ });
  expect(button.querySelector('svg')).toBeInTheDocument();
  expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(await screen.findByText('3 iniziative')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('opening shows the initiatives grouped by status, with counts and the code or TBD', async () => {
  const dialog = await openPanel();
  expect(await within(dialog).findByText('Iniziativa 1')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Rilasciata')).toHaveTextContent('Rilasciata uno');
  expect(within(dialog).getByLabelText('Approvata')).toHaveTextContent('Iniziativa 1');
  expect(within(dialog).getByText('Senza codice').closest('button')).toHaveTextContent('TBD');
  expect(within(dialog).getByLabelText('Iniziative per stato')).toHaveTextContent('Rilasciata');
});

test('Escape and the close button close the panel and give the focus back to the icon', async () => {
  const dialog = await openPanel();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger()).toHaveFocus();
  fireEvent.click(trigger());
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi lo storico' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(dialog).toBeDefined();
});

test('a status card filters the list and pressing it again clears the filter', async () => {
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Rilasciata: \d+$/ }));
  await waitFor(() => expect(calls(path => path.includes('status=rilasciata'))).toHaveLength(1));
  fireEvent.click(within(dialog).getByRole('button', { name: /^Rilasciata: \d+$/, pressed: true }));
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Rilasciata: \d+$/ })).toHaveAttribute('aria-pressed', 'false'));
});

test('searching sends the text to the server after a short pause', async () => {
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  fireEvent.change(within(dialog).getByLabelText('Cerca nello storico'), { target: { value: 'senza' } });
  await waitFor(() => expect(calls(path => path.includes('q=senza'))).toHaveLength(1));
  expect(await within(dialog).findByText('Senza codice')).toBeInTheDocument();
});

test('an empty ledger explains how to fill it, depending on the permission', async () => {
  server.rows = [];
  render(<LedgerPanel canEdit />);
  fireEvent.click(trigger());
  expect(await screen.findByText('Lo storico è vuoto.')).toBeInTheDocument();
  expect(screen.getByText(/Importa il file dello stato delle iniziative/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Scarica .md aggiornato' })).toBeDisabled();
});

withFile('importing the real file: it is read here, previewed on the server, and nothing is saved until the user confirms', async () => {
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  server.previewResult = { created: 27, updated: 0, unchanged: 0, skipped: 0, items: [{ index: 0, outcome: 'nuova', title: 'varie add-on R11.2026-B', goto: '145999', system: 'IPER/IPERSUITE' }] };
  fireEvent.change(within(dialog).getByLabelText('Importa file dello stato delle iniziative'), { target: { files: [file(real, 'STATO_INIZIATIVE_20261111.md')] } });
  expect(await within(dialog).findByText(/27 nuove/)).toBeInTheDocument();
  const preview = calls(path => path === 'import/preview')[0][1].body;
  expect(preview.rows).toHaveLength(27);
  expect(preview.sourceDate).toBe('2026-11-11');
  expect(preview.fileName).toBe('STATO_INIZIATIVE_20261111.md');
  expect(preview.rows.filter(r => r.goto === null)).toHaveLength(5);
  expect(preview.rows.find(r => r.goto === '145480')).toMatchObject({ collaudoDate: '2026-11-09', status: 'rilasciata', pmPoste: 'Lerro' });
  expect(calls(path => path === 'import')).toHaveLength(0);
  expect(within(dialog).getByText(/Nulla è stato ancora salvato/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Conferma importazione' }));
  await waitFor(() => expect(calls(path => path === 'import')).toHaveLength(1));
  expect(calls(path => path === 'import')[0][1].body.rows).toHaveLength(27);
  expect(await within(dialog).findByText(/Importazione completata/)).toBeInTheDocument();
});

test('cancelling the import never saves anything', async () => {
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  fireEvent.change(within(dialog).getByLabelText('Importa file dello stato delle iniziative'), { target: { files: [file('## 1. Approvate\n\n| GOTO | Titolo | Sistema |\n|---|---|---|\n| 1 | A | NPSO |\n')] } });
  await within(dialog).findByText(/Nulla è stato ancora salvato/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' }));
  expect(within(dialog).queryByText(/Nulla è stato ancora salvato/)).not.toBeInTheDocument();
  expect(calls(path => path === 'import')).toHaveLength(0);
});

test('a file that cannot be read is explained and never reaches the server', async () => {
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  fireEvent.change(within(dialog).getByLabelText('Importa file dello stato delle iniziative'), { target: { files: [file('solo testo senza tabelle')] } });
  expect(await within(dialog).findByText('Il file non può essere importato:')).toBeInTheDocument();
  expect(within(dialog).getByText(/Nessuna iniziativa trovata/)).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Niente da importare' })).toBeDisabled();
  expect(calls(path => path.startsWith('import'))).toHaveLength(0);
  fireEvent.change(within(dialog).getByLabelText('Importa file dello stato delle iniziative'), { target: { files: [file('x', 'foglio.xlsx')] } });
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Markdown');
});

test('warnings from the file (a summary that does not add up) are shown before confirming', async () => {
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  const text = '## 1. Approvate\n\n| GOTO | Titolo | Sistema |\n|---|---|---|\n| 1 | A | NPSO |\n\n## 2. Riepilogo\n\n| Stato | N |\n|---|---|\n| Approvate | 9 |\n';
  fireEvent.change(within(dialog).getByLabelText('Importa file dello stato delle iniziative'), { target: { files: [file(text)] } });
  expect(await within(dialog).findByText(/Da controllare \(1\)/)).toBeInTheDocument();
  expect(within(dialog).getByText(/dichiara 9 righe/)).toBeInTheDocument();
});

test('the preview lists what would change and skips the unchanged ones, and the import button is off when nothing would change', async () => {
  server.previewResult = { created: 0, updated: 1, unchanged: 26, skipped: 0, items: [
    { index: 0, outcome: 'aggiornata', title: 'Validazione', goto: '145999', system: 'ILP', summary: 'Stato: Approvata → Rilasciata' },
    { index: 1, outcome: 'invariata', title: 'Altra', goto: '2', system: 'BEP' }] };
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  fireEvent.change(within(dialog).getByLabelText('Importa file dello stato delle iniziative'), { target: { files: [file('## 1. Approvate\n\n| GOTO | Titolo | Sistema |\n|---|---|---|\n| 1 | A | NPSO |\n')] } });
  await within(dialog).findByText(/1 aggiornata · 26 invariate/);
  expect(within(dialog).getByText('Stato: Approvata → Rilasciata')).toBeInTheDocument();
  expect(within(dialog).queryByText('Altra')).not.toBeInTheDocument();
  expect(within(dialog).getByText(/26 iniziative sono invariate/)).toBeInTheDocument();
  server.previewResult = { created: 0, updated: 0, unchanged: 27, skipped: 0, items: [] };
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' }));
  fireEvent.change(within(dialog).getByLabelText('Importa file dello stato delle iniziative'), { target: { files: [file('## 1. Approvate\n\n| GOTO | Titolo | Sistema |\n|---|---|---|\n| 1 | A | NPSO |\n')] } });
  expect(await within(dialog).findByRole('button', { name: 'Niente da importare' })).toBeDisabled();
});

test('a failed import keeps the preview open and says why', async () => {
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  fireEvent.change(within(dialog).getByLabelText('Importa file dello stato delle iniziative'), { target: { files: [file('## 1. Approvate\n\n| GOTO | Titolo | Sistema |\n|---|---|---|\n| 1 | A | NPSO |\n')] } });
  await within(dialog).findByText(/Nulla è stato ancora salvato/);
  ledgerRequest.mockImplementationOnce(async () => { throw new Error('Non hai i permessi per questa operazione.'); });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Conferma importazione' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Non hai i permessi');
  expect(within(dialog).getByText(/Nulla è stato ancora salvato/)).toBeInTheDocument();
});

test('opening an initiative shows its fields and the history with who, when and old → new', async () => {
  const dialog = await openPanel();
  fireEvent.click(await within(dialog).findByRole('button', { name: /Iniziativa 1/ }));
  const detail = await within(dialog).findByLabelText('Dettaglio dell’iniziativa');
  expect(within(detail).getByLabelText('Stato')).toHaveValue('approvata');
  expect(within(detail).getByLabelText('PM Poste')).toHaveValue('Lerro');
  expect(within(detail).getByText('Cambio di stato')).toBeInTheDocument();
  expect(within(detail).getByText('Anna Rossi', { exact: false })).toBeInTheDocument();
  expect(within(detail).getByText('approvata')).toBeInTheDocument();
  expect(within(detail).getByText(/Revisione 2/)).toBeInTheDocument();
});

test('editing sends only what changed with the revision seen, and refreshes the history', async () => {
  const dialog = await openPanel();
  fireEvent.click(await within(dialog).findByRole('button', { name: /Iniziativa 1/ }));
  const detail = await within(dialog).findByLabelText('Dettaglio dell’iniziativa');
  expect(within(detail).getByRole('button', { name: 'Salva modifiche' })).toBeDisabled();
  fireEvent.change(within(detail).getByLabelText('Stato'), { target: { value: 'rilasciata' } });
  expect(within(detail).getByText('Modifiche non salvate')).toBeInTheDocument();
  fireEvent.click(within(detail).getByRole('button', { name: 'Salva modifiche' }));
  await waitFor(() => expect(calls((path, o) => o.method === 'PUT')).toHaveLength(1));
  expect(calls((path, o) => o.method === 'PUT')[0][1].body).toEqual({ expectedRevision: 2, status: 'rilasciata' });
  expect(await within(dialog).findByText(/Modifica salvata e registrata/)).toBeInTheDocument();
});

test('a conflict keeps the user\'s edit on screen and shows the message', async () => {
  const dialog = await openPanel();
  fireEvent.click(await within(dialog).findByRole('button', { name: /Iniziativa 1/ }));
  const detail = await within(dialog).findByLabelText('Dettaglio dell’iniziativa');
  fireEvent.change(within(detail).getByLabelText('Note'), { target: { value: 'il mio testo' } });
  ledgerRequest.mockImplementationOnce(async () => { throw new Error('Un collega ha modificato l’iniziativa (revisione 3).'); });
  fireEvent.click(within(detail).getByRole('button', { name: 'Salva modifiche' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Un collega ha modificato');
  expect(within(detail).getByLabelText('Note')).toHaveValue('il mio testo');
});

test('a note or an activity can be added to the history and is sent as such', async () => {
  const dialog = await openPanel();
  fireEvent.click(await within(dialog).findByRole('button', { name: /Iniziativa 1/ }));
  const detail = await within(dialog).findByLabelText('Dettaglio dell’iniziativa');
  expect(within(detail).getByRole('button', { name: 'Aggiungi' })).toBeDisabled();
  fireEvent.change(within(detail).getByLabelText('Tipo di voce'), { target: { value: 'attivita' } });
  fireEvent.change(within(detail).getByLabelText('Aggiungi alla cronologia'), { target: { value: 'Stima consegnata' } });
  fireEvent.click(within(detail).getByRole('button', { name: 'Aggiungi' }));
  await waitFor(() => expect(calls(path => path.endsWith('/events'))).toHaveLength(1));
  expect(calls(path => path.endsWith('/events'))[0][1].body).toEqual({ kind: 'attivita', text: 'Stima consegnata' });
  expect(await within(dialog).findByText('Attività registrata.')).toBeInTheDocument();
});

test('an unassigned GOTO can be filled in later, and a coded one cannot be changed from here', async () => {
  const dialog = await openPanel();
  fireEvent.click(await within(dialog).findByRole('button', { name: /Senza codice/ }));
  let detail = await within(dialog).findByLabelText('Dettaglio dell’iniziativa');
  expect(within(detail).getByText(/Il GOTO non è ancora assegnato/)).toBeInTheDocument();
  fireEvent.change(within(detail).getByLabelText('GOTO assegnato'), { target: { value: '147001' } });
  fireEvent.click(within(detail).getByRole('button', { name: 'Salva modifiche' }));
  await waitFor(() => expect(calls((path, o) => o.method === 'PUT')).toHaveLength(1));
  expect(calls((path, o) => o.method === 'PUT')[0][1].body).toMatchObject({ goto: '147001', gotoProvided: true });
  fireEvent.click(within(dialog).getByRole('button', { name: '← Tutte le iniziative' }));
  fireEvent.click(await within(dialog).findByRole('button', { name: /Iniziativa 1/ }));
  detail = await within(dialog).findByLabelText('Dettaglio dell’iniziativa');
  expect(within(detail).queryByLabelText('GOTO assegnato')).not.toBeInTheDocument();
});

test('archiving asks for confirmation first', async () => {
  const dialog = await openPanel();
  fireEvent.click(await within(dialog).findByRole('button', { name: /Iniziativa 1/ }));
  const detail = await within(dialog).findByLabelText('Dettaglio dell’iniziativa');
  window.confirm = jest.fn(() => false);
  fireEvent.click(within(detail).getByRole('button', { name: 'Archivia' }));
  expect(calls(path => path.endsWith('/archive'))).toHaveLength(0);
  window.confirm = jest.fn(() => true);
  fireEvent.click(within(detail).getByRole('button', { name: 'Archivia' }));
  await waitFor(() => expect(calls(path => path.endsWith('/archive'))).toHaveLength(1));
  expect(calls(path => path.endsWith('/archive'))[0][1].body).toEqual({ archived: true });
});

test('leaving the detail with unsaved edits asks first', async () => {
  const dialog = await openPanel();
  fireEvent.click(await within(dialog).findByRole('button', { name: /Iniziativa 1/ }));
  const detail = await within(dialog).findByLabelText('Dettaglio dell’iniziativa');
  fireEvent.change(within(detail).getByLabelText('Note'), { target: { value: 'non salvata' } });
  window.confirm = jest.fn(() => false);
  fireEvent.click(within(detail).getByRole('button', { name: '← Tutte le iniziative' }));
  expect(window.confirm).toHaveBeenCalled();
  expect(screen.getByLabelText('Dettaglio dell’iniziativa')).toBeInTheDocument();
  window.confirm = jest.fn(() => true);
  fireEvent.click(within(detail).getByRole('button', { name: '← Tutte le iniziative' }));
  expect(screen.queryByLabelText('Dettaglio dell’iniziativa')).not.toBeInTheDocument();
});

test('a read-only user can look and download but not import, create, edit or archive', async () => {
  render(<LedgerPanel canEdit={false} />);
  fireEvent.click(trigger());
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(await within(dialog).findByRole('button', { name: /Iniziativa 1/ }));
  const detail = await within(dialog).findByLabelText('Dettaglio dell’iniziativa');
  expect(within(dialog).queryByRole('button', { name: 'Importa file .md' })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: '+ Nuova iniziativa' })).not.toBeInTheDocument();
  expect(within(detail).queryByRole('button', { name: 'Salva modifiche' })).not.toBeInTheDocument();
  expect(within(detail).queryByRole('button', { name: 'Archivia' })).not.toBeInTheDocument();
  expect(within(detail).getByLabelText('Stato')).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Scarica .md aggiornato' })).toBeEnabled();
});

test('download writes the file the server generated and says how many initiatives it holds', async () => {
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Scarica .md aggiornato' }));
  expect(await within(dialog).findByText(/File scaricato: 3 iniziative/)).toBeInTheDocument();
  expect(window.URL.createObjectURL).toHaveBeenCalled();
});

test('creating an initiative sends the form and opens the new record', async () => {
  const dialog = await openPanel();
  await within(dialog).findByText('Iniziativa 1');
  fireEvent.click(within(dialog).getByRole('button', { name: '+ Nuova iniziativa' }));
  const form = within(dialog).getByRole('form', { name: 'Nuova iniziativa' });
  fireEvent.change(within(form).getByLabelText('Titolo'), { target: { value: 'Nuova richiesta' } });
  fireEvent.change(within(form).getByLabelText('Sistema'), { target: { value: 'BEP' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Crea' }));
  await waitFor(() => expect(calls((path, o) => path === '' && o.body && o.body.title === 'Nuova richiesta')).toHaveLength(1));
  expect(calls((path, o) => path === '' && o.body)[0][1].body).toMatchObject({ goto: '', system: 'BEP', status: 'in-analisi' });
});

test('if the backend is not updated the panel says so instead of staying empty', async () => {
  ledgerRequest.mockReset().mockRejectedValue(Object.assign(new Error('Il backend non espone ancora lo storico delle iniziative: aggiorna il backend DEV.'), { status: 404 }));
  render(<LedgerPanel canEdit />);
  fireEvent.click(trigger());
  expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('aggiorna il backend DEV');
});

test('opening an initiative in the Configuratore hands it over and closes the panel', async () => {
  const open = jest.fn();
  render(<LedgerPanel canEdit onOpenInitiative={open} />);
  fireEvent.click(trigger());
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(await within(dialog).findByRole('button', { name: /Iniziativa 1/ }));
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Apri nel Configuratore' }));
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ goto: '145001', title: 'Iniziativa 1' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a record the server cannot return does not break the panel: the user is told and stays on the list', async () => {
  const dialog = await openPanel();
  const button = await within(dialog).findByRole('button', { name: /Iniziativa 1/ });
  ledgerRequest.mockImplementationOnce(async () => ({}));
  fireEvent.click(button);
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Iniziativa non trovata');
  expect(within(dialog).queryByLabelText('Dettaglio dell’iniziativa')).not.toBeInTheDocument();
  expect(within(dialog).getByText('Iniziativa 1')).toBeInTheDocument();
});

test('the open panel is attached to the page body, outside the page content, so a bar above the content cannot cover its header', async () => {
  const { container } = render(<LedgerPanel canEdit />);
  fireEvent.click(trigger());
  const dialog = await screen.findByRole('dialog', { name: 'Storico delle iniziative' });
  expect(container.contains(dialog)).toBe(false);
  expect(dialog.closest('.ledger-overlay').parentElement).toBe(document.body);
});
