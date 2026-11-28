import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfiguratorePage from './ConfiguratorePage';
import * as service from '../services/mevService';

jest.mock('../services/mevService', () => {
  const cache = {};
  return new Proxy({}, { get: (_, name) => { if (name === '__esModule') return true; if (!cache[name]) cache[name] = jest.fn(async () => ({})); return cache[name]; } });
});
jest.mock('../configuratore/InitiativeConversation', () => () => null);

const answers = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getConfiguratoreContracts: [], getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getTowImpatto: null, getReleaseSchedules: [] };
beforeEach(() => {
  localStorage.clear(); window.HTMLElement.prototype.scrollIntoView = jest.fn(); window.scrollTo = jest.fn();
  Object.keys(answers).forEach(name => service[name].mockReset().mockImplementation(async () => answers[name]));
  service.rationaleRequest.mockReset().mockImplementation(async path => (String(path).startsWith('related') ? [] : { messages: [], hasMore: false, entries: [] }));
  service.libraryRequest.mockReset().mockImplementation(async () => ({ documents: [], folders: [], historical: 0, pendingIndex: 0, limit: 300, ocrAvailable: true }));
  service.historyImportRequest.mockReset().mockImplementation(async path => (String(path).startsWith('pending') ? { entries: [], hasMore: false, total: 0, bySystem: [] } : {}));
  service.ledgerRequest.mockReset().mockImplementation(async () => ({ initiatives: [] }));
});
const mount = (role = 'Developer') => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role={role} roles={[role]} onNavigate={jest.fn()} />);
const button = () => screen.getByRole('button', { name: /Percorso passo dopo passo/ });
const dlg = () => screen.getByRole('dialog');

test('the Configuratore has the button, and an empty page says the first step is to identify the initiative', async () => {
  mount(); await waitFor(() => expect(button()).toBeInTheDocument()); expect(button()).toHaveTextContent('Prossimo: Identifica l’iniziativa'); expect(button()).toHaveTextContent('0%');
});
test('it is there on every one of the four steps', async () => {
  mount(); await waitFor(() => expect(button()).toBeInTheDocument());
  ['Interventi', 'Offerta', 'Revisione'].forEach(name => { const nav = screen.queryAllByRole('button', { name: new RegExp(name) })[0]; if (nav) fireEvent.click(nav); expect(button()).toBeInTheDocument(); });
});
test('writing the GOTO and the title moves the progress, by itself, without reopening anything', async () => {
  mount(); await waitFor(() => expect(button()).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '146023' } }); fireEvent.change(screen.getAllByLabelText('Titolo')[0], { target: { value: 'Invio prenotazione' } });
  fireEvent.click(button()); const identify = within(dlg()).getAllByRole('listitem')[0]; expect(identify).toHaveTextContent('manca l’applicativo'); expect(identify).not.toHaveTextContent('manca il GOTO');
});
test('«Vai qui» on the first step opens the section «Dati iniziativa» and scrolls to it', async () => {
  mount(); await waitFor(() => expect(button()).toBeInTheDocument()); fireEvent.click(button());
  fireEvent.click(within(dlg()).getByRole('button', { name: 'Vai qui →' })); expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()); expect(document.getElementById('sezione-dati')).toBeInTheDocument();
  expect(document.getElementById('sezione-dati').querySelector('.secrow-toggle')).toHaveAttribute('aria-expanded', 'true');
});
test('a Manager (who cannot edit) can read the path but has no «go» buttons', async () => {
  mount('Manager'); await waitFor(() => expect(button()).toBeInTheDocument()); fireEvent.click(button()); expect(within(dlg()).queryByRole('button', { name: /Vai qui|Apri questo passo|Rivedi/ })).toBeNull(); expect(within(dlg()).getAllByRole('listitem')).toHaveLength(8);
});
test('opening the path does not call the server or save anything', async () => {
  mount(); await waitFor(() => expect(button()).toBeInTheDocument()); service.upsertConfiguratoreRecord.mockClear(); fireEvent.click(button()); fireEvent.keyDown(document, { key: 'Escape' });
  expect(service.upsertConfiguratoreRecord).not.toHaveBeenCalled();
});

test('«Vai qui» on a step in another part of the page opens THAT section (Razionali), opening step 1 if the person was elsewhere', async () => {
  mount(); await waitFor(() => expect(button()).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '146023' } }); fireEvent.change(screen.getAllByLabelText('Titolo')[0], { target: { value: 'Invio' } });
  fireEvent.click(screen.getByRole('button', { name: /2\. Interventi/ })); fireEvent.click(button());
  const item = [...document.querySelectorAll('.wf-step')].find(li => li.textContent.includes('Parla con l’AI e conferma i razionali')); fireEvent.click(item.querySelector('.wf-go'));
  await waitFor(() => expect(document.getElementById('sezione-razionali').querySelector('.secrow-toggle')).toHaveAttribute('aria-expanded', 'true')); expect(screen.getByLabelText('Codice GOTO')).toBeInTheDocument();
});

test('the documents step counts the documents really uploaded in the workspace, not a text', async () => {
  const documents = [{ id: 1, name: 'a.pdf', isMemory: false, status: 'indexed', searchable: true }, { id: 2, name: 'b.docx', isMemory: false, status: 'indexed', searchable: true }];
  service.libraryRequest.mockReset().mockImplementation(async () => ({ documents, folders: [], historical: 0, pendingIndex: 0, limit: 300, ocrAvailable: true }));
  mount(); await waitFor(() => expect(button()).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '146023' } });
  await waitFor(() => { fireEvent.click(button()); const text = within(dlg()).getAllByRole('listitem')[1].textContent; fireEvent.keyDown(document, { key: 'Escape' }); expect(text).toContain('2 documenti caricati'); });
});
