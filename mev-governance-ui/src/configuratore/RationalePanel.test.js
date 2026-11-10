import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import RationalePanel from './RationalePanel';
import { rationaleRequest } from '../services/mevService';
jest.mock('../services/mevService', () => ({ rationaleRequest: jest.fn() }));

const initiative = { code: 'GOTO-1', title: 'Invio prenotazione', system: 'NPSO', description: 'd' };
const entry = (id, kind, status, text, extra = {}) => ({ id, goto: 'goto-1', kind, status, text, byAi: true, createdBy: 'ai', createdByFullName: 'Assistente AI', createdAt: new Date().toISOString(), ...extra });
let server; let known;
function Harness({ onKnowledge }) {
  return <RationalePanel initiative={initiative} interventions={[{ id: 'OTT-4', titolo: 'Invio' }]} onKnowledge={list => { known = list; onKnowledge?.(list); }} />;
}
beforeEach(() => {
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
    if (path.endsWith('/inherit')) { const id = Number(path.split('/')[1]); const base = server.related.find(e => e.id === id); return { ...base, id: 77, goto: 'goto-1', status: 'proposta', sourceEntryId: base.id, byAi: false }; }
    return {};
  });
});
const reply = (proposals = [], questions = []) => ({ question: { id: 10, role: 'user', mine: true, text: 'q', createdAt: new Date().toISOString(), author: 'io', authorFullName: 'Io' },
  answer: { id: 11, role: 'assistant', text: 'Serve l’idempotenza', createdAt: new Date().toISOString(), author: 'ai' }, proposals, questions });

test('shows the stored conversation and groups the entries by status', async () => {
  server.messages = [{ id: 1, role: 'user', mine: false, author: 'lucia', authorFullName: 'Lucia Bianchi', text: 'Il chiamante ritenta', createdAt: new Date().toISOString() }];
  server.entries = [entry(1, 'razionale', 'proposta', 'Evita duplicati'), entry(2, 'vincolo', 'confermata', 'Solo ambiente TEST', { decidedAt: new Date().toISOString(), decidedBy: 'x' })];
  render(<Harness />);
  expect(await screen.findByText('Il chiamante ritenta')).toBeInTheDocument();
  expect(screen.getByText('Lucia Bianchi')).toBeInTheDocument();
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
  fireEvent.click(await screen.findByRole('button', { name: 'Scarta' }));
  await waitFor(() => expect(known.find(e => e.id === 1).status).toBe('scartata'));
  fireEvent.click(screen.getByRole('tab', { name: /Scartate/ }));
  expect(screen.getByText('Non vale')).toBeInTheDocument();
});

test('revoking a confirmed entry asks for confirmation first', async () => {
  server.entries = [entry(2, 'vincolo', 'confermata', 'Solo TEST', { decidedAt: new Date().toISOString(), decidedBy: 'x' })];
  window.confirm = jest.fn(() => false);
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Revoca' }));
  expect(window.confirm).toHaveBeenCalled();
  expect(server.calls.some(([path]) => path.endsWith('/decision'))).toBe(false);
  window.confirm = jest.fn(() => true);
  fireEvent.click(screen.getByRole('button', { name: 'Revoca' }));
  await waitFor(() => expect(known.find(e => e.id === 2).status).toBe('revocata'));
});

test('a manual entry is validated and added as confirmed knowledge', async () => {
  render(<Harness />);
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
