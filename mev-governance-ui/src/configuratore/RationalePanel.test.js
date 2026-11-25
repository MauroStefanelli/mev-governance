import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import RationalePanel, { splitNotice } from './RationalePanel';
import { IDBFactory } from 'fake-indexeddb';
import { resetSourceLibrary, removeAll } from './sourceLibrary';
import { rationaleRequest } from '../services/mevService';
jest.mock('../services/mevService', () => ({ rationaleRequest: jest.fn() }));

const initiative = { code: 'GOTO-1', title: 'Invio prenotazione', system: 'NPSO', description: 'd' };
const entry = (id, kind, status, text, extra = {}) => ({ id, goto: 'goto-1', kind, status, text, byAi: true, createdBy: 'ai', createdByFullName: 'Assistente AI', createdAt: new Date().toISOString(), ...extra });
let server; let known;
function Harness({ onKnowledge }) {
  return <RationalePanel initiative={initiative} interventions={[{ id: 'OTT-4', titolo: 'Invio' }]} onKnowledge={list => { known = list; onKnowledge?.(list); }} />;
}
beforeEach(() => {
  global.indexedDB = new IDBFactory(); resetSourceLibrary(); localStorage.setItem('XUSER', 'tester');
  known = null;
  server = { messages: [], entries: [], related: [], calls: [], answer: null };
  rationaleRequest.mockReset().mockImplementation(async (path, body) => {
    server.calls.push([path, body]);
    if (path.startsWith('?goto=') && !body) return { messages: server.messages, hasMore: false, entries: server.entries };
    if (path.startsWith('related')) return server.related;
    if (path === 'messages') {
      if (server.answer instanceof Error) throw server.answer;
      return server.answer;
    }
    if (path === 'entries') return entry(50, body.kind, 'confermata', body.text, { byAi: false, createdBy: 'io', createdByFullName: 'Io', decidedBy: 'io', decidedAt: new Date().toISOString() });
    if (path.endsWith('/decision')) { const id = Number(path.split('/')[1]); const base = server.entries.find(e => e.id === id); return { ...base, status: body.decision, text: body.text ?? base.text, decidedBy: 'io', decidedByFullName: 'Io', decidedAt: new Date().toISOString() }; }
    if (path.endsWith('/share') || path.endsWith('/unshare')) { const id = Number(path.split('/')[1]); const base = server.entries.find(e => e.id === id); return { ...base, shared: path.endsWith('/share') }; }
    if (path.endsWith('/inherit')) { const id = Number(path.split('/')[1]); const base = server.related.find(e => e.id === id); return { ...base, id: 77, goto: 'goto-1', status: 'proposta', sourceEntryId: base.id, byAi: false }; }
    return {};
  });
});
const openLists = async () => { const toggle = await screen.findByRole('button', { name: /Conoscenza dell’iniziativa/ }); if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle); return toggle; };
const reply = (proposals = [], questions = []) => ({ question: { id: 10, role: 'user', mine: true, text: 'q', createdAt: new Date().toISOString(), author: 'io', authorFullName: 'Io' },
  answer: { id: 11, role: 'assistant', text: 'Serve l’idempotenza', createdAt: new Date().toISOString(), author: 'ai' }, proposals, questions });

test('shows the stored conversation and groups the entries by status', async () => {
  server.messages = [{ id: 1, role: 'user', mine: false, author: 'lucia', authorFullName: 'Lucia Bianchi', text: 'Il chiamante ritenta', createdAt: new Date().toISOString() }];
  server.entries = [entry(1, 'razionale', 'proposta', 'Evita duplicati'), entry(2, 'vincolo', 'confermata', 'Solo ambiente TEST', { decidedAt: new Date().toISOString(), decidedBy: 'x' })];
  render(<Harness />);
  expect(await screen.findByText('Il chiamante ritenta')).toBeInTheDocument();
  expect(screen.getByText('Lucia Bianchi')).toBeInTheDocument();
  await openLists();
  expect(screen.getByRole('tab', { name: /Da confermare/ })).toHaveTextContent('1');
  expect(screen.getByRole('tab', { name: /Confermate/ })).toHaveTextContent('1');
  await waitFor(() => expect(known).toHaveLength(2));
});

test('without a GOTO or title it explains what to do and never calls the server', () => {
  render(<RationalePanel initiative={{ system: 'NPSO' }} />);
  expect(screen.getByText(/Compila il codice GOTO o il titolo/)).toBeInTheDocument();
  expect(rationaleRequest).not.toHaveBeenCalled();
});

test('asking the AI sends the initiative context and shows the proposals to confirm', async () => {
  server.answer = reply([entry(5, 'vincolo', 'proposta', 'Nessun cambio allo schema')], ['Chi gestisce i duplicati?']);
  render(<Harness />);
  const box = await screen.findByLabelText('Messaggio per l’AI');
  fireEvent.change(box, { target: { value: '  Perché serve? ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' }));
  expect(await screen.findByText('Serve l’idempotenza')).toBeInTheDocument();
  const sent = server.calls.find(([path]) => path === 'messages')[1];
  expect(sent).toMatchObject({ goto: 'GOTO-1', question: 'Perché serve?', system: 'NPSO', interventions: [{ id: 'OTT-4', title: 'Invio' }] });
  expect(screen.getByText('Nessun cambio allo schema')).toBeInTheDocument();
  expect(screen.getByText(/1 nuova voce proposta/)).toBeInTheDocument();
  expect(screen.getByText('Chi gestisce i duplicati?')).toBeInTheDocument();
  expect(box).toHaveValue('');
  expect(known.filter(e => e.status === 'confermata')).toHaveLength(0);
});

test('a failed AI request keeps the user message that the server stored and explains the error', async () => {
  const error = new Error('Il servizio AI non è raggiungibile. Il tuo messaggio è stato salvato.'); error.saved = { id: 9, role: 'user', mine: true, text: 'Domanda salvata', createdAt: new Date().toISOString() };
  server.answer = error;
  render(<Harness />);
  fireEvent.change(await screen.findByLabelText('Messaggio per l’AI'), { target: { value: 'Domanda salvata' } });
  fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Il tuo messaggio è stato salvato');
  expect(screen.getByText('Domanda salvata')).toBeInTheDocument();
});

test('confirming a proposal makes it available as knowledge, with the text the user refined', async () => {
  server.entries = [entry(1, 'razionale', 'proposta', 'Evita duplicati')];
  render(<Harness />);
  await openLists();
  const text = await screen.findByLabelText('Testo della voce 1');
  fireEvent.change(text, { target: { value: 'Evita duplicati della prenotazione' } });
  fireEvent.click(screen.getByRole('button', { name: 'Conferma' }));
  await waitFor(() => expect(known.find(e => e.id === 1).status).toBe('confermata'));
  expect(server.calls.find(([path]) => path === 'entries/1/decision')[1]).toEqual({ decision: 'confermata', text: 'Evita duplicati della prenotazione' });
  expect(await screen.findByText('Evita duplicati della prenotazione')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Confermate/, selected: true })).toBeInTheDocument();
});

test('discarding keeps the entry as history and removes it from the knowledge', async () => {
  server.entries = [entry(1, 'razionale', 'proposta', 'Non vale')];
  render(<Harness />);
  await openLists();
  fireEvent.click(await screen.findByRole('button', { name: 'Scarta' }));
  await waitFor(() => expect(known.find(e => e.id === 1).status).toBe('scartata'));
  fireEvent.click(screen.getByRole('tab', { name: /Scartate/ }));
  expect(screen.getByText('Non vale')).toBeInTheDocument();
});

test('revoking a confirmed entry asks for confirmation first', async () => {
  server.entries = [entry(2, 'vincolo', 'confermata', 'Solo TEST', { decidedAt: new Date().toISOString(), decidedBy: 'x' })];
  window.confirm = jest.fn(() => false);
  render(<Harness />);
  await openLists();
  fireEvent.click(await screen.findByRole('button', { name: 'Revoca' }));
  expect(window.confirm).toHaveBeenCalled();
  expect(server.calls.some(([path]) => path.endsWith('/decision'))).toBe(false);
  window.confirm = jest.fn(() => true);
  fireEvent.click(screen.getByRole('button', { name: 'Revoca' }));
  await waitFor(() => expect(known.find(e => e.id === 2).status).toBe('revocata'));
});

test('a manual entry is validated and added as confirmed knowledge', async () => {
  render(<Harness />);
  await openLists();
  fireEvent.click(await screen.findByRole('button', { name: /Aggiungi una voce a mano/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi come confermata' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Il testo è obbligatorio');
  fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'decisione' } });
  fireEvent.change(screen.getByLabelText('Intervento (facoltativo)'), { target: { value: 'OTT-4' } });
  fireEvent.change(screen.getByLabelText('Testo'), { target: { value: 'Si usa la coda esistente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi come confermata' }));
  await waitFor(() => expect(known.find(e => e.id === 50)?.status).toBe('confermata'));
  expect(server.calls.find(([path]) => path === 'entries')[1]).toMatchObject({ goto: 'GOTO-1', kind: 'decisione', interventionId: 'OTT-4', text: 'Si usa la coda esistente' });
});

test('knowledge confirmed on other initiatives of the same system can be taken as a proposal', async () => {
  server.related = [entry(30, 'vincolo', 'confermata', 'Timeout massimo 5 secondi', { goto: 'goto-9', gotoLabel: 'GOTO-9' })];
  render(<Harness />);
  await openLists();
  fireEvent.click(await screen.findByRole('tab', { name: /Da altre iniziative/ }));
  expect(await screen.findByText('Timeout massimo 5 secondi')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Riprendi in questa iniziativa' }));
  await waitFor(() => expect(known.find(e => e.id === 77)?.status).toBe('proposta'));
  fireEvent.click(screen.getByRole('tab', { name: /Da altre iniziative/ }));
  expect(screen.queryByText('Timeout massimo 5 secondi')).not.toBeInTheDocument();
});

test('an invalid message is refused before reaching the server', async () => {
  render(<Harness />);
  const box = await screen.findByLabelText('Messaggio per l’AI');
  expect(screen.getByRole('button', { name: 'Invia all’AI' })).toBeDisabled();
  fireEvent.change(box, { target: { value: 'x'.repeat(4001) } });
  fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Massimo 4000');
  expect(server.calls.some(([path]) => path === 'messages')).toBe(false);
});

test('an empty conversation shows only the writing area: no suggested questions and no placeholder message', async () => {
  const { container } = render(<Harness />);
  const box = await screen.findByLabelText('Messaggio per l’AI');
  expect(box).toHaveAttribute('placeholder', 'Scrivi qui il tuo messaggio per l’AI…');
  expect(screen.queryByText(/Nessun messaggio/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Inizia con una di queste domande/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Perché servono questi interventi e cosa succede/)).not.toBeInTheDocument();
  expect(container.querySelector('.rat-desk')).not.toHaveClass('has-messages');
  expect(container.querySelector('.rat-desk')).toContainElement(box);
});

test('once there are messages the history and the writing area share the same desk', async () => {
  server.messages = [{ id: 1, role: 'user', mine: true, text: 'Primo messaggio', createdAt: new Date().toISOString(), author: 'io', authorFullName: 'Io' }];
  const { container } = render(<Harness />);
  const box = await screen.findByLabelText('Messaggio per l’AI');
  await screen.findByText('Primo messaggio');
  const desk = container.querySelector('.rat-desk');
  expect(desk).toHaveClass('has-messages');
  expect(desk).toContainElement(box);
  expect(desk).toContainElement(screen.getByText('Primo messaggio'));
});

test('clicking the empty part of the desk puts the cursor in the writing box', async () => {
  const { container } = render(<Harness />);
  const box = await screen.findByLabelText('Messaggio per l’AI');
  fireEvent.click(container.querySelector('.rat-desk'));
  expect(box).toHaveFocus();
});

afterEach(() => jest.restoreAllMocks());

beforeEach(() => { jest.spyOn(window, 'confirm').mockReturnValue(true); });

describe('the lists in one row, the conversation as the protagonist', () => {
  test('the four lists are collapsed in ONE row at first; the row shows how many items each holds and opens on click', async () => {
    server.entries = [entry(1, 'razionale', 'proposta', 'Evita duplicati'), entry(2, 'vincolo', 'confermata', 'Solo TEST', { decidedAt: new Date().toISOString(), decidedBy: 'x' }), entry(3, 'razionale', 'scartata', 'Non vale')];
    server.related = [entry(30, 'vincolo', 'confermata', 'Timeout 5 secondi', { goto: 'goto-9', gotoLabel: 'GOTO-9' })];
    render(<Harness />);
    const row = await screen.findByRole('button', { name: /Conoscenza dell’iniziativa/ });
    await waitFor(() => expect(row).toHaveTextContent(/Da altre iniziative\s*1/)); expect(row).toHaveTextContent(/Da confermare\s*1/); expect(row).toHaveTextContent(/Confermate\s*1/); expect(row).toHaveTextContent(/Scartate\s*1/);
    expect(row).toHaveAttribute('aria-expanded', 'false'); expect(screen.queryByRole('tab')).not.toBeInTheDocument(); expect(screen.queryByText('Evita duplicati')).not.toBeInTheDocument();
    fireEvent.click(row); expect(row).toHaveAttribute('aria-expanded', 'true'); expect(screen.getAllByRole('tab')).toHaveLength(4); expect(await screen.findByText('Evita duplicati')).toBeInTheDocument();
    fireEvent.click(row); expect(row).toHaveAttribute('aria-expanded', 'false'); expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
  test('the conversation comes first and the row of lists comes after it in the page', async () => {
    render(<Harness />); const row = await screen.findByRole('button', { name: /Conoscenza dell’iniziativa/ }); const desk = screen.getByLabelText('Cronologia della conversazione');
    expect(desk.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  test('when the AI proposes something the row opens by itself: there is something to decide', async () => {
    server.answer = reply([entry(5, 'vincolo', 'proposta', 'Nessuna modifica allo schema')]);
    render(<Harness />); await screen.findByRole('button', { name: /Conoscenza dell’iniziativa/ });
    fireEvent.change(await screen.findByLabelText('Messaggio per l’AI'), { target: { value: 'Quali vincoli?' } }); fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' }));
    expect(await screen.findByText('Nessuna modifica allo schema')).toBeInTheDocument(); expect(screen.getByRole('button', { name: /Conoscenza dell’iniziativa/ })).toHaveAttribute('aria-expanded', 'true');
  });
  test('when the AI proposes nothing the row stays as the user left it', async () => {
    server.answer = reply([]); render(<Harness />); const row = await screen.findByRole('button', { name: /Conoscenza dell’iniziativa/ });
    fireEvent.change(await screen.findByLabelText('Messaggio per l’AI'), { target: { value: 'Ciao' } }); fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' }));
    await screen.findByText('Serve l’idempotenza'); expect(row).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('attachments to a question: source code and pasted data', () => {
  const TOKEN = 'ghp_' + '0123456789abcdefghijABCDEFGHIJ0123';
  const asked = () => server.calls.filter(([path]) => path === 'messages');
  const ask = async text => { fireEvent.change(await screen.findByLabelText('Messaggio per l’AI'), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' })); };
  const paste = async (name, text) => { fireEvent.click(await screen.findByRole('button', { name: /Incolla dati/ })); const form = screen.getByRole('form', { name: 'Incolla dati' }); fireEvent.change(within(form).getByLabelText(/Cos’è/), { target: { value: name } }); fireEvent.change(within(form).getByLabelText('Testo'), { target: { value } }); fireEvent.click(within(form).getByRole('button', { name: 'Allega alla prossima domanda' })); };
  let value; const setValue = v => { value = v; };
  beforeEach(() => { value = ''; });
  const pasteData = async (name, text) => { fireEvent.click(await screen.findByRole('button', { name: /Incolla dati/ })); const form = screen.getByRole('form', { name: 'Incolla dati' }); fireEvent.change(within(form).getByLabelText(/Cos’è/), { target: { value: name } }); fireEvent.change(within(form).getByLabelText('Testo'), { target: { value: text } }); fireEvent.click(within(form).getByRole('button', { name: 'Allega alla prossima domanda' })); };

  test('pasted data becomes a visible chip, goes with the NEXT question only, and the AI is told what was sent', async () => {
    server.answer = { ...reply(), attachments: { sent: [{ kind: 'dati', name: 'Query di ieri' }], dropped: [], notes: [] } };
    render(<Harness />); await pasteData('Query di ieri', 'ID;STATO\n1;OK\n2;KO');
    expect(screen.getByText(/Query di ieri/)).toBeInTheDocument(); await ask('Cosa vedi nei dati?');
    await waitFor(() => expect(asked()).toHaveLength(1)); expect(asked()[0][1].attachments).toEqual([expect.objectContaining({ kind: 'dati', name: 'Query di ieri', text: 'ID;STATO\n1;OK\n2;KO' })]);
    expect(await screen.findByText(/1 allegato inviato all’AI/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Rimuovi l’allegato Query di ieri/ })).not.toBeInTheDocument();
    server.answer = reply(); await ask('Altra domanda'); await waitFor(() => expect(asked()).toHaveLength(2)); expect(asked()[1][1].attachments).toEqual([]);
  });
  test('data with a credential is refused at the moment of pasting, naming the line, and nothing is attached', async () => {
    render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: /Incolla dati/ })); const form = screen.getByRole('form', { name: 'Incolla dati' });
    fireEvent.change(within(form).getByLabelText('Testo'), { target: { value: 'riga uno\nconnessione: ' + TOKEN } }); fireEvent.click(within(form).getByRole('button', { name: 'Allega alla prossima domanda' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/token GitHub alla riga 2/); expect(document.body.textContent).not.toContain(TOKEN);
    fireEvent.click(within(form).getByRole('button', { name: 'Annulla' })); await ask('domanda'); await waitFor(() => expect(asked()).toHaveLength(1)); expect(asked()[0][1].attachments).toEqual([]);
  });
  test('an attachment can be removed before sending', async () => {
    render(<Harness />); await pasteData('Da togliere', 'dato'); fireEvent.click(screen.getByRole('button', { name: /Rimuovi l’allegato Da togliere/ }));
    expect(screen.queryByText(/Da togliere/)).not.toBeInTheDocument(); await ask('ciao'); await waitFor(() => expect(asked()).toHaveLength(1)); expect(asked()[0][1].attachments).toEqual([]);
  });
  test('text longer than the limit is refused with a clear message', async () => {
    render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: /Incolla dati/ })); const form = screen.getByRole('form', { name: 'Incolla dati' });
    fireEvent.change(within(form).getByLabelText('Testo'), { target: { value: 'x'.repeat(4001) } }); fireEvent.click(within(form).getByRole('button', { name: 'Allega alla prossima domanda' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('supera 4000 caratteri');
  });
  test('the server reporting a dropped attachment is shown to the user, with the reason and without the content', async () => {
    server.answer = { ...reply(), attachments: { sent: [], dropped: [{ name: 'Db.java', reason: 'password scritta in chiaro', line: 4 }], notes: [] } };
    render(<Harness />); await pasteData('Db.java', 'class A {}'); await ask('guarda'); expect(await screen.findByText(/non inviato: «Db.java» \(password scritta in chiaro, riga 4\)/)).toBeInTheDocument();
  });
  test('without a folder the panel explains what to do; with a folder a chip shows it and it can be disconnected', async () => {
    const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
    const input = { files: [file('mio-progetto/src/Invio.java', 'class Invio {}'), file('mio-progetto/src/Altro.java', 'class Altro {}')], setAttribute: jest.fn(), click: jest.fn() };
    const original = document.createElement.bind(document); let taken = false; jest.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'input' && !taken ? ((taken = true), input) : original(tag)));
    render(<Harness />); expect(await screen.findByText(/Scegli la cartella una volta sola/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seleziona cartella sorgenti' })); expect(input.setAttribute).toHaveBeenCalledWith('webkitdirectory', ''); act(() => input.onchange());
    expect(await screen.findByText(/2 file · /)).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Aggiungi o aggiorna una cartella' })).toBeInTheDocument(); expect(screen.queryByText(/Scegli la cartella una volta sola/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Rimuovi la cartella mio-progetto/ })); await waitFor(() => expect(screen.queryByText(/2 file · /)).not.toBeInTheDocument()); document.createElement.mockRestore();
  });
  test('the question is accompanied by the excerpts of the files that match it, with path and lines, and the sampling limit is declared', async () => {
    const { webcrypto } = require('crypto'); const { TextEncoder: TE } = require('util'); if (!globalThis.TextEncoder) globalThis.TextEncoder = TE; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
    const input = { files: [file('p/src/InvioService.java', 'class InvioService {\n  void ritenta() { retry(3); }\n}'), file('p/src/Altro.java', 'class Altro {}')], setAttribute: jest.fn(), click: jest.fn() };
    const original = document.createElement.bind(document); let taken = false; jest.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'input' && !taken ? ((taken = true), input) : original(tag)));
    server.answer = { ...reply(), attachments: { sent: [{ kind: 'sorgente', name: 'p/src/InvioService.java' }], dropped: [], notes: [] } };
    render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: 'Seleziona cartella sorgenti' })); act(() => input.onchange()); await screen.findByText(/2 file · /);
    await ask('Dove si ritenta nell invio?'); await waitFor(() => expect(asked()).toHaveLength(1));
    const sentItems = asked()[0][1].attachments; expect(sentItems[0]).toMatchObject({ kind: 'sorgente', name: 'p/src/InvioService.java', startLine: 1 }); expect(sentItems[0].text).toContain('retry(3)');
    expect(await screen.findByText(/Campione limitato: letti 2 file su 2, 1 con le parole della domanda, 1 estratti inviati, non analisi completa/)).toBeInTheDocument(); document.createElement.mockRestore();
  });
  test('the user can say where to look, and sees which files went to the AI and why', async () => {
    const { webcrypto } = require('crypto'); const { TextEncoder: TE } = require('util'); if (!globalThis.TextEncoder) globalThis.TextEncoder = TE; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
    const input = { files: [file('p/src/PrintRulesH7.java', 'class PrintRulesH7 {\n  // H7: stampa solo con esito doganale\n}'), file('p/src/Altro.java', 'class Altro {}')], setAttribute: jest.fn(), click: jest.fn() };
    const original = document.createElement.bind(document); let taken = false; jest.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'input' && !taken ? ((taken = true), input) : original(tag)));
    server.answer = reply(); render(<Harness />);
    expect(screen.queryByLabelText(/Cerca nel codice/)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Seleziona cartella sorgenti' })); act(() => input.onchange()); await screen.findByText(/2 file · /);
    fireEvent.change(screen.getByLabelText(/Cerca nel codice/), { target: { value: 'PrintRules' } });
    await ask('Cosa succede alla stampa?'); await waitFor(() => expect(asked()).toHaveLength(1));
    const sent = asked()[0][1].attachments; expect(sent.map(a => a.name)).toEqual(['p/src/PrintRulesH7.java']);
    expect(Object.keys(sent[0])).not.toContain('why');
    fireEvent.click(await screen.findByText(/File inviati all’AI nell’ultima domanda \(1\)/));
    expect(await screen.findByText('p/src/PrintRulesH7.java')).toBeInTheDocument(); expect(screen.getByText(/contiene o ha nel nome:.*print/)).toBeInTheDocument();
    expect(screen.getByText(/Parole cercate:.*printrules/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Rimuovi la cartella p/ })); await waitFor(() => expect(screen.queryByLabelText(/Cerca nel codice/)).not.toBeInTheDocument()); expect(screen.queryByText(/File inviati all’AI/)).not.toBeInTheDocument();
  });
  test('on a folder of hundreds of files the file with the rule is found and the reading message is gone afterwards', async () => {
    const { webcrypto } = require('crypto'); const { TextEncoder: TE } = require('util'); if (!globalThis.TextEncoder) globalThis.TextEncoder = TE; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
    const many = Array.from({ length: 300 }, (_, i) => file(`p/src/C${i}.java`, `class C${i} {}`)); many.push(file('p/src/PrintRulesH7.java', 'class PrintRulesH7 { /* h7 */ }'));
    const input = { files: many, setAttribute: jest.fn(), click: jest.fn() };
    const original = document.createElement.bind(document); let taken = false; jest.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'input' && !taken ? ((taken = true), input) : original(tag)));
    server.answer = reply(); render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: 'Seleziona cartella sorgenti' })); act(() => input.onchange()); await screen.findByText(/301 file · /);
    await ask('stampa H7'); await waitFor(() => expect(asked()).toHaveLength(1));
    expect(asked()[0][1].attachments.map(a => a.name)).toEqual(['p/src/PrintRulesH7.java']);
    expect(screen.queryByText(/Leggo la cartella/)).not.toBeInTheDocument();
  });
  test('if reading the folder fails while saving it, the message says so and nothing half-saved remains', async () => {
    const { webcrypto } = require('crypto'); const { TextEncoder: TE } = require('util'); if (!globalThis.TextEncoder) globalThis.TextEncoder = TE; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => { if (path.endsWith('Zboom.java')) throw new Error('lettura fallita'); return text; } }); return f; };
    const many = Array.from({ length: 300 }, (_, i) => file(`p/src/C${i}.java`, `class C${i} {}`)); many.push(file('p/src/Zboom.java', 'x'));
    const input = { files: many, setAttribute: jest.fn(), click: jest.fn() };
    const original = document.createElement.bind(document); let taken = false; jest.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'input' && !taken ? ((taken = true), input) : original(tag)));
    server.answer = reply(); render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: 'Seleziona cartella sorgenti' })); act(() => input.onchange());
    expect(await screen.findByText(/lettura fallita/)).toBeInTheDocument(); expect(screen.queryByText(/Salvo \d+ file/)).not.toBeInTheDocument(); expect(screen.queryByRole('list', { name: /Cartelle/ })).not.toBeInTheDocument();
    expect(await (await import('./sourceLibrary')).listFolders()).toEqual([]); document.createElement.mockRestore();
  });
  test('clicking or typing in "Cerca nel codice" keeps the cursor there: the desk does not pull the focus back to the question box', async () => {
    const { webcrypto } = require('crypto'); const { TextEncoder: TE } = require('util'); if (!globalThis.TextEncoder) globalThis.TextEncoder = TE; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
    const input = { files: [file('p/src/A.java', 'class A {}')], setAttribute: jest.fn(), click: jest.fn() };
    const original = document.createElement.bind(document); let taken = false; jest.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'input' && !taken ? ((taken = true), input) : original(tag)));
    server.answer = reply(); render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: 'Seleziona cartella sorgenti' })); act(() => input.onchange()); await screen.findByText(/1 file · /);
    const terms = screen.getByLabelText(/Cerca nel codice/); terms.focus(); fireEvent.click(terms); expect(terms).toHaveFocus();
    fireEvent.click(screen.getByText(/Cerca nel codice/, { selector: 'label' })); expect(document.activeElement).not.toBe(screen.getByLabelText('Messaggio per l’AI'));
    fireEvent.change(terms, { target: { value: 'H7 PrintRules' } }); expect(terms).toHaveValue('H7 PrintRules');
    fireEvent.click(screen.getByRole('list', { name: 'Cronologia della conversazione' })); expect(screen.getByLabelText('Messaggio per l’AI')).toHaveFocus();
  });
  test('with a folder, the panel says what to ask and offers examples that fill the question box without sending it', async () => {
    const { webcrypto } = require('crypto'); const { TextEncoder: TE } = require('util'); if (!globalThis.TextEncoder) globalThis.TextEncoder = TE; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
    const input = { files: [file('p/src/A.java', 'class A {}')], setAttribute: jest.fn(), click: jest.fn() };
    const original = document.createElement.bind(document); let taken = false; jest.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'input' && !taken ? ((taken = true), input) : original(tag)));
    server.answer = reply(); render(<Harness />); await screen.findByRole('button', { name: 'Seleziona cartella sorgenti' });
    expect(screen.queryByText(/Cosa chiedere/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seleziona cartella sorgenti' })); act(() => input.onchange()); await screen.findByText(/1 file · /);
    expect(screen.getByText(/Cosa chiedere/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Quali condizioni impediscono la stampa dell’etichetta H7/ }));
    expect(screen.getByLabelText('Messaggio per l’AI')).toHaveValue('Quali condizioni impediscono la stampa dell’etichetta H7?'); expect(asked()).toHaveLength(0);
  });
  test('layout: the tools sit OUTSIDE the tall conversation area, so they can never squeeze it; the history can be folded and opened again', async () => {
    server.messages = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, goto: 'goto-1', role: i % 2 ? 'assistant' : 'user', text: `messaggio ${i + 1}`, createdAt: new Date().toISOString(), author: 'io', authorFullName: 'Io', mine: !(i % 2) }));
    render(<Harness />); const history = await screen.findByRole('list', { name: 'Cronologia della conversazione' }); const desk = history.closest('.rat-desk');
    expect(desk.contains(screen.getByRole('region', { name: 'Sorgenti e dati per la domanda' }))).toBe(false);
    expect(desk.contains(screen.getByRole('button', { name: /Incolla dati/ }))).toBe(false); expect(desk.contains(screen.getByRole('button', { name: 'Seleziona cartella sorgenti' }))).toBe(false);
    expect([...desk.children].map(child => child.className.split(' ')[0])).toEqual(['rat-history-bar', 'rat-messages', 'rat-form']);
    expect(screen.getByText('6 messaggi')).toBeInTheDocument(); expect(desk).not.toHaveClass('is-history-closed');
    fireEvent.click(screen.getByRole('button', { name: 'Nascondi la cronologia' })); expect(desk).toHaveClass('is-history-closed'); expect(screen.getByRole('button', { name: 'Mostra la cronologia' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Messaggio per l’AI')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mostra la cronologia' })); expect(desk).not.toHaveClass('is-history-closed'); expect(screen.getByText('messaggio 1')).toBeInTheDocument();
  });
  test('layout: with a folder already saved the tools are folded and summarised, with none they are open to guide the first use; the user can always change it', async () => {
    const { saveSelection, inspectSelection } = require('./sourceLibrary'); const f = (path, text) => ({ name: path.split('/').pop(), size: text.length, lastModified: 1, webkitRelativePath: path, text: async () => text });
    render(<Harness />); const toggle = await screen.findByRole('button', { name: /Sorgenti e dati per la domanda/ }); expect(toggle).toHaveAttribute('aria-expanded', 'true'); expect(toggle).toHaveTextContent('nessuna cartella salvata');
    cleanup(); await saveSelection({ selection: inspectSelection([f('item/A.java', 'a'), f('item/B.java', 'b')]) }); resetSourceLibrary();
    render(<Harness />); const folded = await screen.findByRole('button', { name: /Sorgenti e dati per la domanda/ });
    await waitFor(() => expect(folded).toHaveTextContent('1 di 1 cartella attive, 2 file')); expect(folded).toHaveAttribute('aria-expanded', 'false'); expect(screen.queryByRole('button', { name: /Incolla dati/ })).not.toBeInTheDocument();
    fireEvent.click(folded); expect(screen.getByRole('button', { name: /Incolla dati/ })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Aggiungi o aggiorna una cartella' })).toBeInTheDocument();
    fireEvent.click(folded); expect(screen.queryByRole('button', { name: /Incolla dati/ })).not.toBeInTheDocument();
  });
  test('the applications chosen for the initiative are shown with their components, and the ones with no file here are marked', async () => {
    const { saveSelection, inspectSelection } = require('./sourceLibrary'); const f = (path, text) => ({ name: path.split('/').pop(), size: text.length, lastModified: 1, webkitRelativePath: path, text: async () => text });
    await saveSelection({ selection: inspectSelection([f('ILP/ILP_frontend/src/a.ts', 'a'), f('ILP/item-service/pom.xml', 'b')]) }); resetSourceLibrary();
    const apps = [{ name: 'ILP', code: 'ILP', components: ['ILP_frontend', 'ILP_BACKEND_item-service', 'ILP_BACKEND_hu-transport-app'], totalComponents: 3, totalFiles: 5447, technologies: ['Java'] }];
    render(<RationalePanel initiative={initiative} interventions={[]} applications={apps} />);
    await screen.findByRole('button', { name: /Sorgenti e dati per la domanda/ });
    const summary = await screen.findByText(/2 di 3 componenti con file/); expect(summary).toHaveTextContent('5.447 file nella scheda');
    const box = summary.closest('details'); expect(box).toHaveAttribute('open');
    expect(within(box).getByText('ILP_BACKEND_hu-transport-app').closest('li')).toHaveClass('is-missing'); expect(within(box).getByText('ILP_BACKEND_item-service').closest('li')).toHaveClass('is-read'); expect(within(box).getByText('ILP_frontend').closest('li')).toHaveClass('is-read');
    expect(within(box).getByText(/senza file, salva anche la sua cartella|componenti senza file/i, { exact: false })).toBeInTheDocument();
  });
  test('the question carries the chosen applications with how many files each component has here, and never their content', async () => {
    const { saveSelection, inspectSelection } = require('./sourceLibrary'); const f = (path, text) => ({ name: path.split('/').pop(), size: text.length, lastModified: 1, webkitRelativePath: path, text: async () => text });
    await saveSelection({ selection: inspectSelection([f('ILP/item-service/Servizio.java', 'class Servizio { void h7() {} }')]) }); resetSourceLibrary();
    const apps = [{ name: 'ILP', code: 'ILP', components: ['ILP_BACKEND_item-service', 'ILP_BACKEND_print-app'], totalComponents: 2, technologies: ['Java'] }];
    server.answer = reply(); render(<RationalePanel initiative={initiative} interventions={[]} applications={apps} />);
    await screen.findByText(/1 di 2 componenti con file/); await ask('Dove si stampa H7?'); await waitFor(() => expect(asked()).toHaveLength(1));
    const sentApps = asked()[0][1].applications; expect(sentApps).toHaveLength(1); expect(sentApps[0]).toMatchObject({ name: 'ILP', components: ['ILP_BACKEND_item-service', 'ILP_BACKEND_print-app'], totalComponents: 2 });
    expect(sentApps[0].filesByComponent).toEqual([{ component: 'ILP_BACKEND_item-service', files: 1 }, { component: 'ILP_BACKEND_print-app', files: 0 }]);
    expect(JSON.stringify(sentApps)).not.toContain('class Servizio');
  });
  test('without applications the panel shows nothing about them and sends none', async () => {
    server.answer = reply(); render(<Harness />); await screen.findByRole('button', { name: /Sorgenti e dati per la domanda/ }); expect(screen.queryByLabelText('Applicativi dell’iniziativa')).not.toBeInTheDocument();
    await ask('ciao'); await waitFor(() => expect(asked()).toHaveLength(1)); expect(asked()[0][1].applications).toEqual([]);
  });
  test('an application whose technical sheet lists no components says so instead of showing an empty list', async () => {
    render(<RationalePanel initiative={initiative} interventions={[]} applications={[{ name: 'BEP', code: '', components: [], totalComponents: 0, technologies: ['Java'] }]} />);
    expect(await screen.findByText(/nessun componente nella scheda tecnica/)).toBeInTheDocument();
  });
  test('an answer cut by the AI service is shown whole up to the cut, with the notice apart and visible', async () => {
    const cutText = 'Impatto sul processo. Rischi principali: una diversa risolu';
    server.messages = [{ id: 1, goto: 'goto-1', role: 'assistant', text: cutText + '\n\n⚠ Risposta interrotta: il servizio AI ha raggiunto il limite di lunghezza. Chiedi di continuare.', createdAt: new Date().toISOString(), author: 'ai', authorFullName: 'Assistente AI', mine: false }];
    render(<Harness />); const list = await screen.findByRole('list', { name: 'Cronologia della conversazione' });
    expect(await within(list).findByText(cutText)).toBeInTheDocument(); const warn = within(list).getByRole('note'); expect(warn).toHaveTextContent('Risposta interrotta'); expect(warn).not.toHaveTextContent('Impatto sul processo');
  });
  test('a long answer is shown in full: nothing is cut by the screen', async () => {
    const long = Array.from({ length: 200 }, (_, i) => `Frase ${i} dell'analisi di impatto.`).join(' ');
    server.messages = [{ id: 1, goto: 'goto-1', role: 'assistant', text: long, createdAt: new Date().toISOString(), author: 'ai', authorFullName: 'Assistente AI', mine: false }];
    render(<Harness />); const list = await screen.findByRole('list', { name: 'Cronologia della conversazione' });
    await waitFor(() => expect(list.textContent).toContain('Frase 199 dell\'analisi di impatto.')); expect(within(list).queryByRole('note')).not.toBeInTheDocument();
  });
  test('only a notice at the very end of the message is a notice: the same words in the middle of an answer are just text', () => {
    expect(splitNotice('Testo.\n\n⚠ Risposta interrotta: x')).toEqual({ body: 'Testo.', notice: '⚠ Risposta interrotta: x' });
    expect(splitNotice('Testo.\n\n⚠ Risposta accorciata: superava 20.000 caratteri.')).toEqual({ body: 'Testo.', notice: '⚠ Risposta accorciata: superava 20.000 caratteri.' });
    const middle = 'Prima.\n\n⚠ Risposta interrotta: citata\n\nPoi continua il testo.'; expect(splitNotice(middle)).toEqual({ body: middle, notice: '' });
    expect(splitNotice('Nessun avviso')).toEqual({ body: 'Nessun avviso', notice: '' }); expect(splitNotice(null)).toEqual({ body: null, notice: '' }); expect(splitNotice('')).toEqual({ body: '', notice: '' });
  });
  const REAL_REQUEST = "Vorrei un'analisi approfondita di impatto e una descrizione funzionale dell'as-is e del desiderata chiara per il PUNTO1 e che dessi un nome a ciascuno dei punti";
  const typeInBox = value => fireEvent.change(screen.getByLabelText('Messaggio per l’AI'), { target: { value } });
  test('while the user writes a request that asks for many things at once, an advice appears with the parts to choose from', async () => {
    render(<Harness />); await screen.findByLabelText('Messaggio per l’AI');
    expect(screen.queryByRole('note', { name: 'Consiglio per questa richiesta' })).not.toBeInTheDocument();
    typeInBox('Dove si decide la stampa H7?'); expect(screen.queryByRole('note', { name: 'Consiglio per questa richiesta' })).not.toBeInTheDocument();
    typeInBox(REAL_REQUEST); const advice = await screen.findByRole('note', { name: 'Consiglio per questa richiesta' });
    expect(advice).toHaveTextContent('Questa richiesta chiede più cose insieme'); expect(advice).toHaveTextContent('poco spazio');
    ['Un nome per ciascun punto', 'As-is (come funziona oggi)', 'To-be / desiderata (come deve funzionare)', 'Analisi di impatto'].forEach(label => expect(within(advice).getByRole('button', { name: label })).toBeInTheDocument());
    typeInBox('Dove si decide la stampa H7?'); expect(screen.queryByRole('note', { name: 'Consiglio per questa richiesta' })).not.toBeInTheDocument();   // si scrive una cosa sola: il consiglio sparisce
  });
  test('choosing a part replaces the request with that part alone, does NOT send it, and the question then goes out as that one part', async () => {
    server.answer = reply(); render(<Harness />); await screen.findByLabelText('Messaggio per l’AI'); typeInBox(REAL_REQUEST);
    fireEvent.click(await within(await screen.findByRole('note', { name: 'Consiglio per questa richiesta' })).findByRole('button', { name: 'As-is (come funziona oggi)' }));
    expect(screen.getByLabelText('Messaggio per l’AI').value).toMatch(/funzionamento attuale \(as-is\) del PUNTO 1/); expect(asked()).toHaveLength(0);
    expect(screen.queryByRole('note', { name: 'Consiglio per questa richiesta' })).not.toBeInTheDocument();            // la richiesta ora e' di una parte sola
    fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' })); await waitFor(() => expect(asked()).toHaveLength(1)); expect(asked()[0][1].question).toMatch(/\(as-is\) del PUNTO 1/); expect(asked()[0][1].question).not.toMatch(/to-be|impatto/i);
  });
  test('the advice can be closed, and the wide request can still be sent as it is', async () => {
    server.answer = reply(); render(<Harness />); await screen.findByLabelText('Messaggio per l’AI'); typeInBox(REAL_REQUEST);
    fireEvent.click(await screen.findByRole('button', { name: 'Chiudi il consiglio' })); expect(screen.queryByRole('note', { name: 'Consiglio per questa richiesta' })).not.toBeInTheDocument(); expect(screen.getByLabelText('Messaggio per l’AI')).toHaveValue(REAL_REQUEST);
    fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' })); await waitFor(() => expect(asked()).toHaveLength(1)); expect(asked()[0][1].question).toBe(REAL_REQUEST);
  });
  test('a closed advice comes back if the request changes into another wide one', async () => {
    render(<Harness />); await screen.findByLabelText('Messaggio per l’AI'); typeInBox(REAL_REQUEST); fireEvent.click(await screen.findByRole('button', { name: 'Chiudi il consiglio' }));
    typeInBox(REAL_REQUEST + ' e anche i rischi'); expect(await screen.findByRole('note', { name: 'Consiglio per questa richiesta' })).toBeInTheDocument();
  });
  test('the advice never blocks sending: the send button works with it on screen', async () => {
    server.answer = reply(); render(<Harness />); await screen.findByLabelText('Messaggio per l’AI'); typeInBox(REAL_REQUEST); await screen.findByRole('note', { name: 'Consiglio per questa richiesta' });
    expect(screen.getByRole('button', { name: 'Invia all’AI' })).toBeEnabled();
  });
  test('after a cut answer a button offers to continue, and pressing it sends the continuation request', async () => {
    server.messages = [{ id: 1, goto: 'goto-1', role: 'assistant', text: 'Impatto sul processo.\n\n⚠ Risposta interrotta: il servizio AI ha raggiunto il limite di lunghezza.', createdAt: new Date().toISOString(), author: 'ai', authorFullName: 'Assistente AI', mine: false }];
    server.answer = reply(); render(<Harness />); const group = await screen.findByRole('group', { name: 'La risposta dell’AI si è interrotta' });
    fireEvent.click(within(group).getByRole('button', { name: 'Continua dal punto in cui si è fermata' })); await waitFor(() => expect(asked()).toHaveLength(1));
    expect(asked()[0][1].question).toMatch(/Continua dal punto esatto in cui ti sei fermato, senza ripetere/);
  });
  test('the continue button is NOT there after a normal answer, or after a long answer that was shortened by the server', async () => {
    server.messages = [{ id: 1, goto: 'goto-1', role: 'assistant', text: 'Risposta normale e completa.', createdAt: new Date().toISOString(), author: 'ai', authorFullName: 'Assistente AI', mine: false }];
    const first = render(<Harness />); await screen.findByText('Risposta normale e completa.'); expect(screen.queryByRole('group', { name: 'La risposta dell’AI si è interrotta' })).not.toBeInTheDocument(); first.unmount();
    server.messages = [{ id: 1, goto: 'goto-1', role: 'assistant', text: 'Lunga.\n\n⚠ Risposta accorciata: superava 20.000 caratteri.', createdAt: new Date().toISOString(), author: 'ai', authorFullName: 'Assistente AI', mine: false }];
    render(<Harness />); await screen.findByText('Lunga.'); expect(screen.queryByRole('group', { name: 'La risposta dell’AI si è interrotta' })).not.toBeInTheDocument();
  });
  test('the continue button is only for the LAST message: once the conversation moved on it is gone', async () => {
    server.messages = [{ id: 1, goto: 'goto-1', role: 'assistant', text: 'Taglio.\n\n⚠ Risposta interrotta: x', createdAt: new Date().toISOString(), author: 'ai', authorFullName: 'Assistente AI', mine: false },
      { id: 2, goto: 'goto-1', role: 'user', text: 'ok', createdAt: new Date().toISOString(), author: 'io', authorFullName: 'Io', mine: true }];
    render(<Harness />); await screen.findByText('ok'); expect(screen.queryByRole('group', { name: 'La risposta dell’AI si è interrotta' })).not.toBeInTheDocument();
  });
  test('a source file containing a credential is kept out of the copy and never sent: the user is told which one and where', async () => {
    const { webcrypto } = require('crypto'); const { TextEncoder: TE } = require('util'); if (!globalThis.TextEncoder) globalThis.TextEncoder = TE; Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const file = (path, text) => { const f = new File([text], path.split('/').pop()); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: async () => text }); return f; };
    const input = { files: [file('p/src/Config.java', 'class Config {\n  String token = "' + TOKEN + '";\n}'), file('p/src/Config2.java', 'class Config2 {}')], setAttribute: jest.fn(), click: jest.fn() };
    const original = document.createElement.bind(document); let taken = false; jest.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'input' && !taken ? ((taken = true), input) : original(tag)));
    server.answer = reply(); render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: 'Seleziona cartella sorgenti' })); act(() => input.onchange()); await screen.findByText(/1 file · /);
    expect(await screen.findByText(/1 file non salvato perché contiene una credenziale/)).toBeInTheDocument(); expect(document.body.textContent).not.toContain(TOKEN);
    await ask('Guarda config'); await waitFor(() => expect(asked()).toHaveLength(1));
    expect(JSON.stringify(asked()[0][1])).not.toContain(TOKEN); expect(asked()[0][1].attachments.map(a => a.name)).toEqual(['p/src/Config2.java']); document.createElement.mockRestore();
  });
});

describe('connection to a Poste environment', () => {
  beforeEach(() => localStorage.clear());
  test('the box explains that the app cannot open the VPN, and that the result of a query is pasted instead', async () => {
    render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: /Collegamento a un ambiente Poste/ }));
    const box = screen.getByRole('region', { name: 'Collegamento a un ambiente Poste' }); expect(box).toHaveTextContent('non può aprire la tua VPN'); expect(box).toHaveTextContent('incolli qui il risultato'); expect(box).toHaveTextContent('restano solo nel tuo browser');
  });
  test('the notes are saved in this browser as they are typed and found again next time', async () => {
    const first = render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: /Collegamento a un ambiente Poste/ }));
    fireEvent.change(screen.getByLabelText('Ambiente'), { target: { value: 'Collaudo NPSO' } }); fireEvent.change(screen.getByLabelText('VPN'), { target: { value: 'VPN Poste, profilo Sviluppo' } });
    expect(JSON.parse(localStorage.getItem('mev-rationale-connection-notes'))).toMatchObject({ environment: 'Collaudo NPSO', vpn: 'VPN Poste, profilo Sviluppo' }); first.unmount();
    render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: /Collegamento a un ambiente Poste/ })); expect(screen.getByLabelText('Ambiente')).toHaveValue('Collaudo NPSO');
  });
  test('the notes never reach the server, not even with the question', async () => {
    server.answer = reply(); render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: /Collegamento a un ambiente Poste/ })); fireEvent.change(screen.getByLabelText('Ambiente'), { target: { value: 'Collaudo NPSO' } });
    fireEvent.change(await screen.findByLabelText('Messaggio per l’AI'), { target: { value: 'ciao' } }); fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' })); await waitFor(() => expect(server.calls.some(([p]) => p === 'messages')).toBe(true));
    expect(JSON.stringify(server.calls)).not.toContain('Collaudo NPSO');
  });
  test('a credential typed in the notes is flagged without repeating it', async () => {
    render(<Harness />); fireEvent.click(await screen.findByRole('button', { name: /Collegamento a un ambiente Poste/ })); fireEvent.change(screen.getByLabelText('Database o servizio'), { target: { value: 'oracle://utente:Segreta99@db/NPSO' } });
    const alert = await screen.findByRole('alert'); expect(alert).toHaveTextContent('non scrivere credenziali'); expect(alert).not.toHaveTextContent('Segreta99');
  });
});


test('a confirmed voice written in the app can be SHARED with the other initiatives, and taken back', async () => {
  server.entries = [entry(21, 'razionale', 'confermata', 'Il batch notturno gestisce i resi', { byAi: false, shared: false })];
  render(<Harness />);
  await openLists();
  fireEvent.click(await screen.findByRole('tab', { name: /Confermate/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Condividi con le altre iniziative' }));
  await waitFor(() => expect(server.calls.some(([path]) => path === 'entries/21/share')).toBe(true));
  expect(await screen.findByText(/Condivisa: la trovi nella Conoscenza storica AI/)).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: /Condivisa con le altre iniziative · Ritira/ }));
  await waitFor(() => expect(server.calls.some(([path]) => path === 'entries/21/unshare')).toBe(true));
  expect(await screen.findByText('Non più condivisa con le altre iniziative.')).toBeInTheDocument();
});
test('a voice that came from the history import is NOT offered for sharing (it is already knowledge)', async () => {
  server.entries = [entry(22, 'razionale', 'confermata', 'Da una nota importata', { byAi: false, sourceFile: 'projects/x/ilp-a.md' })];
  render(<Harness />);
  await openLists();
  fireEvent.click(await screen.findByRole('tab', { name: /Confermate/ }));
  await screen.findByText('Da una nota importata');
  expect(screen.queryByRole('button', { name: /Condividi con le altre iniziative/ })).toBeNull();
});
