import React from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import SviluppoPage from './SviluppoPage';
import { IDBFactory } from 'fake-indexeddb';
import { resetSourceLibrary } from '../configuratore/sourceLibrary';
import * as service from '../services/mevService';

jest.mock('../services/mevService', () => ({
  getConfiguratoreRecords: jest.fn(), getConfiguratoreContracts: jest.fn(), upsertConfiguratoreRecord: jest.fn(), getSharedApplications: jest.fn(),
  analyzeDevelopmentWithAi: jest.fn(), prepareActivityDevelopment: jest.fn(), generateActivityCode: jest.fn(), developmentRequest: jest.fn(), deleteConfiguratoreRecord: jest.fn(),
}));
const evaluation = { initiative: { code: 'GOTO1', title: 'Invio prenotazione', system: 'NPSO' }, lot: '2', contractId: 'C1',
  items: [{ sourceRowId: 'detail-1', interventionId: 'I1', reason: 'Prima attività' }, { sourceRowId: 'detail-2', interventionId: 'I1', reason: 'Seconda attività' }] };
const offer = { record_key: 'C1|2|initiative|goto1', entity_type: 'initiative_evaluation', contract_id: 'C1', lot_id: '2', title: 'GOTO1', updated_at: '2026-01-02T10:00:00Z', payload: JSON.stringify(evaluation) };
let store; let server;
const me = { username: 'io', fullName: 'Io Stesso', isMe: true };
const colleague = { username: 'lucia', fullName: 'Lucia Bianchi', isMe: false };
beforeEach(() => {
  global.indexedDB = new IDBFactory(); resetSourceLibrary(); localStorage.setItem('XUSER', 'io');
  store = [];
  server = { summary: [], users: [me], messages: [], lastWorked: null, calls: [] };
  Object.values(service).forEach(fn => fn.mockReset?.());
  service.getConfiguratoreContracts.mockResolvedValue([]);
  service.getSharedApplications.mockResolvedValue([{ id: 'a', name: 'NPSO', codeUrl: '/src/npso' }]);
  service.getConfiguratoreRecords.mockImplementation(async params => ({ records: params.entity_type === 'initiative_evaluation' ? [offer] : store.filter(r => r.entity_type === params.entity_type) }));
  service.developmentRequest.mockImplementation(async (path, body) => {
    server.calls.push([path, body]);
    if (path === 'summary') return server.summary;
    if (path === 'presence') return { users: server.users, messages: server.messages.filter(m => m.id > (body.afterMessageId || 0)), lastWorked: server.lastWorked };
    if (path.startsWith('chat') && !body) return { messages: server.messages, hasMore: false };
    if (path === 'chat') { const saved = { id: server.messages.length + 1, author: 'io', authorFullName: 'Io Stesso', createdAt: new Date().toISOString(), text: body.text, mine: true }; server.messages = [...server.messages, saved]; return saved; }
    return {};
  });
  service.upsertConfiguratoreRecord.mockImplementation(async body => { const saved = { ...body, payload: JSON.stringify(body.payload) }; store = [...store.filter(r => r.record_key !== body.record_key), saved]; return saved; });
});
const openFirst = async () => { render(<SviluppoPage ambienteId={1} codiceContratto="C1" />); fireEvent.click(await screen.findByText('Invio prenotazione')); await screen.findByLabelText('Percorso di sviluppo'); };
const bar = () => document.querySelector('.dev-steps');
const goToSheets = () => fireEvent.click(within(bar()).getByRole('button', { name: /Schede/ }));

test('lists evaluated initiatives with their progress and explains the six phases', async () => {
  render(<SviluppoPage ambienteId={1} codiceContratto="C1" />);
  expect(await screen.findByText('Invio prenotazione')).toBeInTheDocument();
  expect(screen.getByText('Da avviare')).toBeInTheDocument();
  expect(within(screen.getByLabelText('Le fasi del percorso')).getAllByRole('listitem')).toHaveLength(6);
});

describe('applications of an initiative with an empty System (the real «TBD · cr post uat» case)', () => {
  const tbd = { ...offer, record_key: 'C1|2|initiative|tbd', title: 'TBD', payload: JSON.stringify({ ...evaluation, initiative: { code: '', title: 'TBD · cr post uat', system: '' }, selectedAppIds: ['ilp'],
    catalogSource: { contractId: 'poste-tet-2025', lot: '2' } }) };
  const apps = [{ id: 'npso', name: 'NPSO', codeUrl: '/src/npso' }, { id: 'ilp', name: 'ILP', codeUrl: '/src/ilp' }, { id: 'iper', name: 'IPER' }];
  const open = async () => { render(<SviluppoPage ambienteId={1} codiceContratto="C1" />); fireEvent.click(await screen.findByText('TBD · cr post uat')); await screen.findByLabelText('Percorso di sviluppo'); };
  beforeEach(() => {
    service.getConfiguratoreContracts.mockResolvedValue([{ contractId: 'poste-tet-2025', name: 'Poste Italiane – Tracciatura e Logistica Integrata', lots: [] }]);
    service.getConfiguratoreRecords.mockImplementation(async params => ({ records: params.entity_type === 'initiative_evaluation' ? [tbd] : store.filter(r => r.entity_type === params.entity_type) }));
  });
  test('the chosen application is shown as the application of the initiative, not a warning', async () => {
    service.getSharedApplications.mockResolvedValue(apps); await open();
    expect(await screen.findByText('ILP')).toBeInTheDocument(); expect(screen.getByText('/src/ilp')).toBeInTheDocument();
    expect(screen.queryByText(/Nessun applicativo corrisponde/)).not.toBeInTheDocument();
  });
  test('the heading does not show an empty system as a dash, and a missing repository link is not presented as an error', async () => {
    service.getSharedApplications.mockResolvedValue(apps); await open();
    await screen.findByText('ILP');
    expect(screen.getByText('Applicativi dell’iniziativa')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('«—»'); expect(document.body.textContent).not.toContain('Percorso sorgenti non configurato');
  });
  test('the heading names the system when the initiative has one', async () => {
    service.getConfiguratoreRecords.mockImplementation(async params => ({ records: params.entity_type === 'initiative_evaluation' ? [{ ...tbd, payload: JSON.stringify({ ...JSON.parse(tbd.payload), initiative: { code: '', title: 'TBD · cr post uat', system: 'ILP' } }) }] : [] }));
    service.getSharedApplications.mockResolvedValue(apps); await open();
    expect(await screen.findByText(/sistema «ILP»/)).toBeInTheDocument();
  });
  test('with nothing chosen the warning names the contract by its name, not its identifier, and says what to do', async () => {
    service.getSharedApplications.mockResolvedValue([{ id: 'npso', name: 'NPSO' }, { id: 'iper', name: 'IPER' }]); await open();
    const warning = await screen.findByText(/Nessun applicativo corrisponde/);
    expect(warning.textContent).toContain('«Poste Italiane – Tracciatura e Logistica Integrata»'); expect(warning.textContent).not.toContain('poste-tet-2025');
    expect(warning.textContent).toContain('non ha un Sistema'); expect(warning.textContent).not.toContain('«»');
  });
});

test('opens on the sources phase for a new development and points to the next step', async () => {
  await openFirst();
  expect(screen.getByRole('region', { name: 'Fase: Fonti' })).toBeInTheDocument();
  expect(screen.getByText('/src/npso')).toBeInTheDocument();
  expect(screen.getByText(/cartella dei sorgenti/, { selector: '.dev-next-box p' })).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').filter(li => li.querySelector('.dev-step'))).toHaveLength(6);
  expect(screen.queryByText(/Importo/)).not.toBeInTheDocument();
});

test('the phase bar and the pager move between phases and mark the current one', async () => {
  await openFirst();
  goToSheets();
  expect(screen.getByRole('region', { name: 'Fase: Schede' })).toBeInTheDocument();
  expect(within(bar()).getByRole('button', { name: /Schede/, current: 'step' })).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Cambio fase' })).getByRole('button', { name: /Progetto/ }));
  expect(screen.getByRole('region', { name: 'Fase: Progetto' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Mostra le regole/ }));
  expect(screen.getByRole('region', { name: 'Regole della fase Progetto' })).toHaveTextContent('Una decisione è documentata solo con scelta, fonte e referente');
});

test('saves, closes and reopens with the same sheet content, and Save and close stays open on failure', async () => {
  await openFirst();
  goToSheets();
  fireEvent.click(screen.getByText('Attività 2'));
  fireEvent.change(screen.getAllByLabelText('Soluzione tecnica')[0], { target: { value: 'Soluzione salvata' } });
  service.upsertConfiguratoreRecord.mockRejectedValueOnce(new Error('rete'));
  fireEvent.click(screen.getByText('Salva e chiudi'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito: rete');
  expect(screen.getByLabelText('Percorso di sviluppo')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Salva e chiudi'));
  await screen.findByLabelText('Iniziative da sviluppare');
  expect(store).toHaveLength(1);
  expect(await screen.findByText('Avviato')).toBeInTheDocument();
  expect(screen.getByText(/0\/2 schede/)).toBeInTheDocument();
  fireEvent.click(await screen.findByText('Invio prenotazione'));
  await screen.findByLabelText('Percorso di sviluppo');
  expect(screen.getByRole('region', { name: 'Fase: Schede' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Attività 2'));
  await waitFor(() => expect(screen.getAllByLabelText('Soluzione tecnica')[0]).toHaveValue('Soluzione salvata'));
});

test('an edited sheet updates the progress and unsaved state immediately', async () => {
  await openFirst();
  goToSheets();
  fireEvent.click(screen.getByText('Attività 1'));
  expect(screen.getByText('0/2 definite')).toBeInTheDocument();
  fireEvent.change(screen.getAllByLabelText('File coinvolti (uno per riga, percorso relativo)')[0], { target: { value: 'a.java' } });
  fireEvent.change(screen.getAllByLabelText('Soluzione tecnica')[0], { target: { value: 'sol' } });
  fireEvent.change(screen.getAllByLabelText('Criteri di accettazione')[0], { target: { value: 'crit' } });
  expect(screen.getByText('1/2 definite')).toBeInTheDocument();
  expect(screen.getByText('Modifiche non salvate')).toBeInTheDocument();
  expect(screen.getByText('Salva sviluppo')).toBeEnabled();
});

test('the delivery phase lists what is still missing before the package is useful', async () => {
  await openFirst();
  fireEvent.click(within(bar()).getByRole('button', { name: /Consegna/ }));
  fireEvent.click(screen.getByRole('button', { name: /Mostra le regole/ }));
  const guide = screen.getByRole('region', { name: 'Regole della fase Consegna' });
  expect(guide).toHaveTextContent('○ Sviluppo salvato');
  expect(guide).toHaveTextContent('○ Branch indicato');
  fireEvent.change(screen.getByLabelText('Branch suggerito'), { target: { value: 'feature/x' } });
  expect(screen.getByRole('region', { name: 'Regole della fase Consegna' })).toHaveTextContent('✓ Branch indicato');
});

test('the list shows who worked last and who is connected, matched regardless of GOTO case', async () => {
  server.summary = [{ goto: 'goto1', lastWorkedBy: 'lucia', lastWorkedByFullName: 'Lucia Bianchi', lastWorkedAt: new Date(Date.now() - 2 * 3600000).toISOString(), online: [colleague], messageCount: 3 }];
  render(<SviluppoPage ambienteId={1} codiceContratto="C1" />);
  expect(await screen.findByText(/Ultimo lavoro: Lucia Bianchi · 2 h fa/)).toBeInTheDocument();
  expect(screen.getByText('Lucia Bianchi è collegato')).toBeInTheDocument();
});

test('the list still works, with a neutral message, when the collaboration service is unavailable', async () => {
  service.developmentRequest.mockRejectedValue(new Error('404'));
  render(<SviluppoPage ambienteId={1} codiceContratto="C1" />);
  expect(await screen.findByText('Invio prenotazione')).toBeInTheDocument();
  expect(screen.getByText('Nessuna attività registrata')).toBeInTheDocument();
});

test('an opened initiative warns about colleagues and shows the stored chat history', async () => {
  server.users = [me, colleague];
  server.messages = [{ id: 1, author: 'lucia', authorFullName: 'Lucia Bianchi', createdAt: new Date().toISOString(), text: 'Sto lavorando alla scheda 2', mine: false }];
  await openFirst();
  expect(await screen.findByText(/Lucia Bianchi sta lavorando su questa iniziativa/)).toBeInTheDocument();
  expect(screen.getByText('1 collega collegato')).toBeInTheDocument();
  expect(screen.getByText('Sto lavorando alla scheda 2')).toBeInTheDocument();
  expect(screen.getByText('Io Stesso (tu)')).toBeInTheDocument();
  expect(server.calls.some(([path, body]) => path === 'presence' && body.goto === '145480' || body?.goto === 'GOTO1')).toBe(true);
});

test('sending a chat message posts it for the opened initiative and clears the box', async () => {
  await openFirst();
  const box = await screen.findByLabelText('Messaggio per i colleghi');
  fireEvent.change(box, { target: { value: '  Ho finito la scheda 1  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Invia' }));
  expect(await screen.findByText('Ho finito la scheda 1')).toBeInTheDocument();
  expect(server.calls).toContainEqual(['chat', { goto: 'GOTO1', text: 'Ho finito la scheda 1' }]);
  expect(box).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Invia' })).toBeDisabled();
});

test('a failed message stays in the box so it is not lost', async () => {
  await openFirst();
  const box = await screen.findByLabelText('Messaggio per i colleghi');
  const original = service.developmentRequest.getMockImplementation();
  service.developmentRequest.mockImplementation(async (path, body) => { if (path === 'chat' && body) throw new Error('rete'); return original(path, body); });
  fireEvent.change(box, { target: { value: 'Importante' } });
  fireEvent.click(screen.getByRole('button', { name: 'Invia' }));
  expect(await screen.findByText(/Messaggio non inviato: rete/)).toBeInTheDocument();
  expect(box).toHaveValue('Importante');
});

test('saving records the user as the last worker only when the save is confirmed', async () => {
  await openFirst();
  fireEvent.click(within(bar()).getByRole('button', { name: /Schede/ }));
  fireEvent.click(screen.getByText('Attività 1'));
  fireEvent.change(screen.getAllByLabelText('Soluzione tecnica')[0], { target: { value: 'x' } });
  service.upsertConfiguratoreRecord.mockRejectedValueOnce(new Error('rete'));
  fireEvent.click(screen.getByText('Salva sviluppo'));
  await screen.findByText(/Salvataggio non riuscito/);
  expect(server.calls.filter(([path]) => path === 'worked')).toHaveLength(0);
  fireEvent.click(screen.getByText('Salva sviluppo'));
  await waitFor(() => expect(server.calls.filter(([path]) => path === 'worked')).toHaveLength(1));
  expect(server.calls.find(([path]) => path === 'worked')[1]).toEqual({ goto: 'GOTO1' });
});

test('a source folder chosen once is still there when Sviluppo is opened again: no new selection is asked for', async () => {
  const { act } = require('@testing-library/react');
  const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
  const input = { files: [file('npso/src/Invio.java', 'class Invio {}'), file('npso/src/Altro.java', 'class Altro {}')], setAttribute: jest.fn(), click: jest.fn() };
  await openFirst();
  const original = document.createElement.bind(document); let taken = false;     // armed only now: React also creates inputs while rendering
  jest.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'input' && !taken ? ((taken = true), input) : original(tag)));
  fireEvent.click(await screen.findByRole('button', { name: 'Seleziona cartella sorgenti' })); await act(async () => { input.onchange(); });
  expect(await screen.findByText(/2 file selezionati/)).toBeInTheDocument();
  document.createElement.mockRestore(); cleanup(); resetSourceLibrary();      // the page is closed and opened again; the browser keeps its storage
  await openFirst();
  expect(await screen.findByText(/2 file selezionati/)).toBeInTheDocument(); expect(screen.getByRole('checkbox', { name: /npso/ })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Aggiungi o aggiorna una cartella' })).toBeInTheDocument();
});

describe('deleting a saved initiative from «Sviluppo iniziative»', () => {
  const mount = (roles = ['Developer']) => render(<SviluppoPage ambienteId={1} codiceContratto="C1" role={roles[0]} roles={roles} />);
  const deleteButton = () => screen.queryByRole('button', { name: 'Elimina iniziativa GOTO1' });
  beforeEach(() => { offer.Id = 'abc-1'; service.deleteConfiguratoreRecord.mockResolvedValue({ deleted: true, developmentDeleted: 1 }); });
  afterEach(() => { delete offer.Id; });

  test.each([['Developer'], ['Admin'], ['SuperAdmin']])('a %s sees the delete button on every initiative of the list', async role => {
    mount([role]); await screen.findByText('Invio prenotazione'); expect(deleteButton()).toBeInTheDocument();
  });
  test.each([['Manager'], ['Bid Manager'], ['Client'], ['Editor']])('a %s does NOT see it', async role => {
    mount([role]); await screen.findByText('Invio prenotazione'); expect(deleteButton()).toBeNull();
  });
  test('the button is NOT inside the row button (a button inside a button is invalid and would open the initiative)', async () => {
    mount(); await screen.findByText('Invio prenotazione');
    expect(deleteButton().closest('button.dev-list-row')).toBeNull();
    fireEvent.click(deleteButton()); expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByLabelText('Percorso di sviluppo')).toBeNull();                 // non ha aperto l'iniziativa
  });
  test('pressing it asks first, says what disappears and what stays, and deletes NOTHING yet', async () => {
    mount(); await screen.findByText('Invio prenotazione'); fireEvent.click(deleteButton());
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Eliminare questa iniziativa?'); expect(dialog).toHaveTextContent('GOTO1'); expect(dialog).toHaveTextContent('Invio prenotazione');
    expect(dialog).toHaveTextContent('Sparisce'); expect(dialog).toHaveTextContent('lo sviluppo salvato'); expect(dialog).toHaveTextContent('Resta'); expect(dialog).toHaveTextContent('L’operazione non si può annullare');
    expect(service.deleteConfiguratoreRecord).not.toHaveBeenCalled();
  });
  test('«Annulla» (and Escape) close it without deleting; the initiative is still in the list', async () => {
    mount(); await screen.findByText('Invio prenotazione');
    fireEvent.click(deleteButton()); fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Annulla' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(deleteButton()); fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(service.deleteConfiguratoreRecord).not.toHaveBeenCalled(); expect(screen.getByText('Invio prenotazione')).toBeInTheDocument();
  });
  test('«Elimina definitivamente» deletes THAT record and the list is reloaded', async () => {
    mount(); await screen.findByText('Invio prenotazione'); fireEvent.click(deleteButton());
    const calls = service.getConfiguratoreRecords.mock.calls.length;
    service.getConfiguratoreRecords.mockImplementation(async params => ({ records: params.entity_type === 'initiative_evaluation' ? [] : [] }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    await waitFor(() => expect(service.deleteConfiguratoreRecord).toHaveBeenCalledWith('abc-1'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(screen.queryByText('Invio prenotazione')).toBeNull());
    expect(service.getConfiguratoreRecords.mock.calls.length).toBeGreaterThan(calls);
    expect(screen.getByText(/Nessuna iniziativa valutata/)).toBeInTheDocument();
  });
  test('when the server refuses, the window stays open with the reason and the initiative is NOT removed from the list', async () => {
    service.deleteConfiguratoreRecord.mockRejectedValue(new Error('Errore eliminazione record configuratore'));
    mount(); await screen.findByText('Invio prenotazione'); fireEvent.click(deleteButton());
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore eliminazione record configuratore');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument(); expect(screen.getByText('Invio prenotazione')).toBeInTheDocument();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' })).not.toBeDisabled();       // si puo' riprovare
  });
  test('an initiative already deleted by a colleague says so and the list is refreshed', async () => {
    service.deleteConfiguratoreRecord.mockResolvedValue({ deleted: false, developmentDeleted: 0 });
    mount(); await screen.findByText('Invio prenotazione'); fireEvent.click(deleteButton());
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    await waitFor(() => expect(service.getConfiguratoreRecords.mock.calls.length).toBeGreaterThan(2));
  });
});
