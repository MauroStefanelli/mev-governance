import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DocumentLibrary from './LibraryPanel';
import { libraryRequest, workspaceDocument } from '../services/mevService';
jest.mock('../services/mevService', () => ({ libraryRequest: jest.fn(), workspaceDocument: jest.fn() }));

const initiative = { code: 'GOTO-1', title: 'Invio prenotazione' };
const doc = (extra = {}) => ({ id: 'd1', groupId: 'g1', fileName: 'requisiti.pdf', extension: 'pdf', category: 'Requisiti cliente', size: 204800, sha256: 'a', author: 'anna', createdAt: new Date().toISOString(), version: 1, versions: 1,
  aiEnabled: true, indexStatus: 'ready', indexedChars: 900, isMemory: false, canDelete: true, ...extra });
let server;
beforeEach(() => {
  server = { documents: [doc()], historical: 0, pendingIndex: 0, calls: [] };
  libraryRequest.mockReset().mockImplementation(async (path, options = {}) => {
    server.calls.push([path, options]);
    if (path.endsWith('/upload')) return { results: [...options.form.getAll('files')].map(file => ({ fileName: file.name, ok: !file.name.startsWith('dup'), message: file.name.startsWith('dup') ? 'Già presente: stesso contenuto.' : '' })) };
    if (path.includes('/search')) return { terms: ['timeout'], truncated: false, results: [{ document: doc({ id: 'd9', fileName: 'note.txt' }), nameMatch: false, score: 9, snippets: [{ location: 'riga 4', text: 'Il timeout massimo è di 5 secondi' }] }] };
    if (path.endsWith('/ask')) return server.answer || { answer: 'Il timeout è di 5 secondi [1]', citations: [], noSources: false, model: 'm', sources: [{ n: 1, fileName: 'note.txt', version: 2, category: 'Requisiti cliente', location: 'riga 4', text: 'Il timeout massimo è di 5 secondi' }] };
    if (path.endsWith('/history')) return { versions: [{ id: 'd2', version: 2, fileName: 'requisiti_v2.pdf', size: 3000, author: 'luca', createdAt: new Date().toISOString(), isCurrent: true }, { id: 'd1', version: 1, fileName: 'requisiti.pdf', size: 2000, author: 'anna', createdAt: new Date().toISOString(), isCurrent: false }], events: [{ id: 1, action: 'nuova versione', detail: 'v1 → v2', actor: 'luca', at: new Date().toISOString(), version: 2 }] };
    if (options.method === 'PUT' || options.method === 'DELETE' || path.endsWith('/versions') || path.endsWith('/reindex')) return path.endsWith('/reindex') ? { indexed: 1, remaining: 0 } : {};
    return { documents: server.documents, folders: [], categories: [], historical: server.historical, pendingIndex: server.pendingIndex, limit: 300 };
  });
  workspaceDocument.mockReset().mockResolvedValue(new Blob(['x']));
  window.URL.createObjectURL = jest.fn(() => 'blob:x'); window.URL.revokeObjectURL = jest.fn();
});
const calls = predicate => server.calls.filter(([path, options]) => predicate(path, options));

test('without an open initiative the workspace is locked and never calls the server', () => {
  render(<DocumentLibrary initiative={{}} />);
  expect(screen.getByText(/Apri o crea un’iniziativa/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Carica Documenti' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Workspace documentale dell’iniziativa')).toHaveAttribute('aria-disabled', 'true');
  expect(libraryRequest).not.toHaveBeenCalled();
});

test('with only a title the workspace is available, like the other initiative features', async () => {
  render(<DocumentLibrary initiative={{ title: 'Solo titolo' }} />);
  expect(await screen.findByRole('button', { name: 'Carica Documenti' })).toBeInTheDocument();
  expect(libraryRequest).toHaveBeenCalledWith(encodeURIComponent('Solo titolo'));
});

test('lists the documents with format, size, version, author, index state and AI use', async () => {
  render(<DocumentLibrary initiative={initiative} />);
  expect(await screen.findByText('requisiti.pdf')).toBeInTheDocument();
  expect(screen.getByText(/200 KB · v1/)).toBeInTheDocument();
  expect(screen.getByText('Indicizzato')).toBeInTheDocument();
  expect(screen.getByText('Usato dall’AI')).toBeInTheDocument();
  expect(screen.getByLabelText('Formato PDF')).toHaveTextContent('pdf');
});

test('uploads several files at once, into the chosen folder, and reports each outcome', async () => {
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.change(screen.getByLabelText(/Cartella di destinazione/), { target: { value: 'Memorie iniziali' } });
  const files = [new File(['uno'], 'standard.docx'), new File(['due'], 'dup-copia.txt'), new File(['MZ'], 'setup.exe')];
  fireEvent.change(screen.getByLabelText('Carica documenti'), { target: { files } });
  expect(await screen.findByText(/1 caricati, 2 non caricati/)).toBeInTheDocument();
  const upload = calls(path => path.endsWith('/upload'))[0];
  expect(upload[1].form.getAll('files').map(f => f.name)).toEqual(['standard.docx', 'dup-copia.txt']);
  expect(upload[1].form.get('category')).toBe('Memorie iniziali');
  expect(screen.getByText(/setup\.exe/)).toBeInTheDocument();
  expect(screen.getByText(/non è ammesso: è un file eseguibile/)).toBeInTheDocument();
  expect(screen.getByText(/Già presente: stesso contenuto/)).toBeInTheDocument();
});

test('files dropped on the area are uploaded like selected ones', async () => {
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  const zone = screen.getByText('Trascina qui i documenti').closest('.lib-drop');
  fireEvent.dragOver(zone); expect(zone).toHaveClass('is-over');
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'trascinato.pdf')] } });
  await waitFor(() => expect(calls(path => path.endsWith('/upload'))).toHaveLength(1));
  expect(calls(path => path.endsWith('/upload'))[0][1].form.getAll('files')[0].name).toBe('trascinato.pdf');
});

test('a file refused as a duplicate with a different content can be sent as a new version', async () => {
  libraryRequest.mockImplementation(async (path, options = {}) => {
    server.calls.push([path, options]);
    if (path.endsWith('/upload')) return { results: [{ fileName: 'requisiti.pdf', ok: false, message: 'Esiste già un documento chiamato «requisiti.pdf» con contenuto diverso.', canVersion: true, existingGroupId: 'g1' }] };
    return { documents: server.documents, folders: [], historical: 0, pendingIndex: 0, limit: 300 };
  });
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.change(screen.getByLabelText('Carica documenti'), { target: { files: [new File(['v2'], 'requisiti.pdf')] } });
  expect(await screen.findByRole('button', { name: 'Carica come nuova versione' })).toBeInTheDocument();
});

test('a new version is sent with the version the user was looking at', async () => {
  server.documents = [doc({ version: 3, versions: 3 })];
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Sostituisci / nuova versione' }));
  fireEvent.change(screen.getByLabelText('Carica nuova versione'), { target: { files: [new File(['v2'], 'requisiti_v2.pdf')] } });
  await waitFor(() => expect(calls(path => path.endsWith('/versions'))).toHaveLength(1));
  const sent = calls(path => path.endsWith('/versions'))[0];
  expect(sent[0]).toContain('/groups/g1/versions');
  expect(sent[1].form.get('expectedVersion')).toBe('3');
  expect(await screen.findByText(/Nuova versione di «requisiti.pdf» caricata/)).toBeInTheDocument();
});

test('history shows every version and who did what', async () => {
  server.documents = [doc({ version: 2, versions: 2 })];
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.click(screen.getByRole('button', { name: /Storia \(2\)/ }));
  const history = await screen.findByLabelText('Storia di requisiti.pdf');
  expect(within(history).getByText('requisiti_v2.pdf', { exact: false })).toBeInTheDocument();
  expect(within(history).getByText('corrente')).toBeInTheDocument();
  expect(within(history).getByText('Nuova versione')).toBeInTheDocument();
});

test('moving, excluding from AI and deleting ask for the right calls, and delete asks for confirmation', async () => {
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.change(screen.getByLabelText('Cartella di requisiti.pdf'), { target: { value: 'Memorie iniziali' } });
  await waitFor(() => expect(calls((path, o) => o.method === 'PUT' && o.body.category)).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Escludi dall’AI' }));
  await waitFor(() => expect(calls((path, o) => o.method === 'PUT' && o.body.aiEnabled === false)).toHaveLength(1));
  window.confirm = jest.fn(() => false);
  fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
  expect(calls((path, o) => o.method === 'DELETE')).toHaveLength(0);
  window.confirm = jest.fn(() => true);
  fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
  await waitFor(() => expect(calls((path, o) => o.method === 'DELETE')).toHaveLength(1));
});

test('the delete button appears only when the user may delete the document', async () => {
  server.documents = [doc({ canDelete: false })];
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  expect(screen.queryByRole('button', { name: 'Elimina' })).not.toBeInTheDocument();
});

test('a read-only user can search and download but not upload, change or ask', async () => {
  render(<DocumentLibrary initiative={initiative} canEdit={false} />);
  await screen.findByText('requisiti.pdf');
  expect(screen.queryByRole('button', { name: 'Carica Documenti' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Elimina' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sostituisci / nuova versione' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Scarica' })).toBeInTheDocument();
  expect(screen.getByLabelText('Domanda sui documenti')).toBeDisabled();
  expect(screen.getByText(/sola consultazione/)).toBeInTheDocument();
});

test('search sends the filters and highlights the match in the excerpt', async () => {
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.change(screen.getByLabelText('Testo da cercare'), { target: { value: 'timeout' } });
  fireEvent.change(screen.getByLabelText('Autore'), { target: { value: 'anna' } });
  fireEvent.change(screen.getByLabelText('Dal'), { target: { value: '2026-01-01' } });
  fireEvent.click(screen.getByLabelText(/Includi versioni precedenti/));
  fireEvent.click(screen.getByRole('button', { name: 'Cerca' }));
  const mark = await screen.findByText('timeout', { selector: 'mark' });
  expect(mark).toBeInTheDocument();
  const query = calls(path => path.includes('/search'))[0][0];
  expect(query).toContain('q=timeout'); expect(query).toContain('author=anna'); expect(query).toContain('from=2026-01-01'); expect(query).toContain('versions=true');
  expect(screen.getByText(/1 documento · 1 con estratti dal contenuto/)).toBeInTheDocument();
});

test('an empty search explains how matching works', async () => {
  libraryRequest.mockImplementation(async (path, options = {}) => path.includes('/search') ? { terms: ['x'], results: [], truncated: false } : { documents: [doc()], folders: [], historical: 0, pendingIndex: 0, limit: 300 });
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.change(screen.getByLabelText('Testo da cercare'), { target: { value: 'inesistente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cerca' }));
  expect(await screen.findByText(/ignora maiuscole e accenti/)).toBeInTheDocument();
});

test('asking the documents shows the answer and the numbered sources it came from', async () => {
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.change(screen.getByLabelText('Domanda sui documenti'), { target: { value: 'Qual è il timeout?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Chiedi' }));
  expect(await screen.findByText('Il timeout è di 5 secondi [1]')).toBeInTheDocument();
  expect(screen.getByText('[1] note.txt · v2 · riga 4')).toBeInTheDocument();
  expect(calls(path => path.endsWith('/ask'))[0][1].body).toEqual({ question: 'Qual è il timeout?' });
});

test('when no document has a pertinent passage the user is told the AI was not asked', async () => {
  server.answer = { answer: 'Nei documenti non ho trovato passaggi pertinenti.', citations: [], sources: [], noSources: true };
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.change(screen.getByLabelText('Domanda sui documenti'), { target: { value: 'Qualcosa di assente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Chiedi' }));
  expect(await screen.findByText(/l’AI non è stata interpellata/)).toBeInTheDocument();
});

test('old attachments can be indexed with one click and the user is told why', async () => {
  server.pendingIndex = 2; server.documents = [doc({ indexStatus: 'pending' })];
  render(<DocumentLibrary initiative={initiative} />);
  expect(await screen.findByText(/2 documenti sono stati caricati prima di questa funzione/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Indicizza ora' }));
  expect(await screen.findByText('Indicizzazione completata.')).toBeInTheDocument();
  expect(calls(path => path.endsWith('/reindex')).length).toBeGreaterThan(0);
});

test('the initial memory folder is highlighted and documents there are marked', async () => {
  server.documents = [doc({ category: 'Memorie iniziali', isMemory: true, fileName: 'standard.docx' })];
  render(<DocumentLibrary initiative={initiative} />);
  expect(await screen.findByText('Memoria iniziale')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /Requisiti cliente/ }));
  expect(screen.queryByText('standard.docx')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /Memorie iniziali/ }));
  expect(screen.getByText('standard.docx')).toBeInTheDocument();
});

test('a server error is shown without losing the list', async () => {
  render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  libraryRequest.mockRejectedValueOnce(new Error('Non hai i permessi per questa operazione.'));
  fireEvent.click(screen.getByRole('button', { name: 'Escludi dall’AI' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Non hai i permessi');
  expect(screen.getByText('requisiti.pdf')).toBeInTheDocument();
});

test('opening another initiative clears the previous results and answers', async () => {
  const { rerender } = render(<DocumentLibrary initiative={initiative} />);
  await screen.findByText('requisiti.pdf');
  fireEvent.change(screen.getByLabelText('Testo da cercare'), { target: { value: 'timeout' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cerca' }));
  await screen.findByText('note.txt');
  server.documents = [doc({ id: 'x1', groupId: 'gx', fileName: 'altra.pdf' })];
  rerender(<DocumentLibrary initiative={{ code: 'GOTO-2', title: 'Altra' }} />);
  await screen.findByText('altra.pdf');
  expect(screen.queryByText('note.txt')).not.toBeInTheDocument();
  expect(screen.queryByText('requisiti.pdf')).not.toBeInTheDocument();
});
