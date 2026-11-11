import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SolutionPanel from './SolutionPanel';
import { loadSolution, saveSolution } from './solutionStore';
jest.mock('./solutionStore', () => ({ loadSolution: jest.fn(), saveSolution: jest.fn() }));

const initiative = { code: 'GOTO-1', title: 'Invio prenotazione', system: 'NPSO' };
const interventions = [
  { id: 'OTT-1', titolo: 'Invio prenotazione', descrizione: 'Esporre il servizio', attivita: 'Sviluppo API', sistema: 'NPSO', requisiti: 'REQ-4', mappings: [{ name: 'Servizio REST', type: 'REALIZZAZIONE', complexity: 'Medio', qty: 2, componentApplication: 'Gateway', technology: 'Java' }] },
  { id: 'OTT-2', titolo: 'Notifiche', mappings: [] },
];
const knowledge = [{ id: 1, kind: 'vincolo', status: 'confermata', text: 'Nessuna modifica allo schema', interventionId: 'OTT-1' }, { id: 2, kind: 'razionale', status: 'proposta', text: 'PROPOSTA-NON-CONFERMATA' }];
const props = { initiative, contractId: 'C1', lot: '2', interventions, knowledge, applications: [{ name: 'NPSO', codeUrl: '/src/npso' }], author: 'Anna Rossi' };
let blobs; let clicked;
beforeEach(() => {
  loadSolution.mockReset().mockResolvedValue({ solution: { entries: {}, summary: '' }, revision: 0, exists: false });
  saveSolution.mockReset().mockImplementation(async ({ revision }) => ({ revision: revision + 1, updatedBy: 'Anna Rossi', updatedAt: new Date().toISOString() }));
  blobs = []; clicked = [];
  window.URL.createObjectURL = jest.fn(blob => { blobs.push(blob); return 'blob:x'; }); window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicked.push(this.download); });
});
afterEach(() => jest.restoreAllMocks());
const loaded = async () => { await screen.findByRole('button', { name: /OTT-1/ }); await waitFor(() => expect(screen.queryByText('Caricamento della soluzione…')).not.toBeInTheDocument()); };
const openItem = id => fireEvent.click(screen.getByRole('button', { name: new RegExp(id) }));
const readBlob = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });

test('without an open initiative the panel is locked and loads nothing', () => {
  render(<SolutionPanel {...props} initiative={{}} />);
  expect(screen.getByText(/Apri o crea un’iniziativa/)).toBeInTheDocument();
  expect(loadSolution).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /Scarica MD/ })).not.toBeInTheDocument();
});

test('every intervention is a row; opening one shows its details read-only and the confirmed rationale only', async () => {
  render(<SolutionPanel {...props} />);
  await screen.findByRole('button', { name: /OTT-1/ });
  expect(screen.getByRole('button', { name: /OTT-2/ })).toBeInTheDocument();
  openItem('OTT-1');
  const details = screen.getByLabelText('Dettagli dell’intervento OTT-1');
  expect(details).toHaveTextContent('Esporre il servizio');
  expect(details).toHaveTextContent('Sviluppo API');
  expect(details).toHaveTextContent('REQ-4');
  expect(within(details).getByText('Servizio REST')).toBeInTheDocument();
  expect(details).toHaveTextContent('Nessuna modifica allo schema');
  expect(details).not.toHaveTextContent('PROPOSTA-NON-CONFERMATA');
  expect(within(details).queryAllByRole('textbox')).toHaveLength(0);
});

test('the solution fields are editable and the page shows unsaved changes', async () => {
  render(<SolutionPanel {...props} />);
  await screen.findByRole('button', { name: /OTT-1/ });
  expect(screen.getByRole('button', { name: 'Salva soluzione' })).toBeDisabled();
  openItem('OTT-1');
  fireEvent.change(screen.getByLabelText('Soluzione proposta'), { target: { value: 'Usare una coda con retry' } });
  expect(screen.getByText('Modifiche non salvate')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Salva soluzione' })).toBeEnabled();
  expect(screen.getByRole('button', { name: /OTT-1/ })).toHaveTextContent('Soluzione descritta');
  expect(screen.getByRole('button', { name: /OTT-2/ })).toHaveTextContent('Da descrivere');
});

test('saving sends the edited text with the revision that was loaded, and confirms it', async () => {
  loadSolution.mockResolvedValue({ solution: { entries: {}, summary: '' }, revision: 4, exists: true });
  render(<SolutionPanel {...props} />);
  await screen.findByRole('button', { name: /OTT-1/ });
  openItem('OTT-1');
  fireEvent.change(screen.getByLabelText('Soluzione proposta'), { target: { value: 'Coda con retry' } });
  fireEvent.change(screen.getByLabelText(/Sintesi generale/), { target: { value: 'Sintesi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salva soluzione' }));
  expect(await screen.findByText(/salvata e confermata dal server \(revisione 5\)/)).toBeInTheDocument();
  const sent = saveSolution.mock.calls[0][0];
  expect(sent).toMatchObject({ contractId: 'C1', lot: '2', revision: 4, author: 'Anna Rossi' });
  expect(sent.solution.entries['OTT-1'].approach).toBe('Coda con retry');
  expect(sent.solution.summary).toBe('Sintesi');
  expect(screen.queryByText('Modifiche non salvate')).not.toBeInTheDocument();
});

test('a failed or conflicting save keeps the text on the page and says why', async () => {
  saveSolution.mockRejectedValueOnce(new Error('Un collega ha salvato la soluzione dopo la tua apertura.'));
  render(<SolutionPanel {...props} />);
  await screen.findByRole('button', { name: /OTT-1/ });
  openItem('OTT-1');
  fireEvent.change(screen.getByLabelText('Soluzione proposta'), { target: { value: 'Il mio testo importante' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salva soluzione' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Un collega ha salvato');
  expect(screen.getByLabelText('Soluzione proposta')).toHaveValue('Il mio testo importante');
  expect(screen.getByText('Modifiche non salvate')).toBeInTheDocument();
});

test('the download is a Markdown file with the details, the team text, the confirmed rationale and the applications', async () => {
  loadSolution.mockResolvedValue({ solution: { entries: { 'OTT-1': { approach: 'Coda con retry' } }, summary: 'Sintesi generale' }, revision: 1, exists: true });
  render(<SolutionPanel {...props} />);
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Scarica MD per Visual Studio Code' }));
  expect(clicked).toEqual(['SOLUZIONE_GOTO-1.md']);
  const md = await readBlob(blobs[0]);
  expect(md).toContain('# Soluzione · GOTO-1 · Invio prenotazione');
  expect(md).toContain('Sintesi generale');
  expect(md).toContain('### 1. OTT-1 — Invio prenotazione');
  expect(md).toContain('Coda con retry');
  expect(md).toContain('| Servizio REST | REALIZZAZIONE | Medio | 2 | Gateway | Java |');
  expect(md).toContain('Nessuna modifica allo schema');
  expect(md).toContain('`/src/npso`');
  expect(md).not.toContain('PROPOSTA-NON-CONFERMATA');
});

test('the download includes unsaved edits, and the page says so', async () => {
  render(<SolutionPanel {...props} />);
  await screen.findByRole('button', { name: /OTT-1/ });
  openItem('OTT-1');
  fireEvent.change(screen.getByLabelText('Soluzione proposta'), { target: { value: 'Testo non ancora salvato' } });
  expect(screen.getByText(/contiene anche le modifiche non ancora salvate/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Scarica MD per Visual Studio Code' }));
  expect(await readBlob(blobs[0])).toContain('Testo non ancora salvato');
});

test('a read-only user can read and download but not edit or save', async () => {
  loadSolution.mockResolvedValue({ solution: { entries: { 'OTT-1': { approach: 'Già scritta' } }, summary: '' }, revision: 1, exists: true });
  render(<SolutionPanel {...props} canEdit={false} />);
  await loaded();
  expect(screen.queryByRole('button', { name: 'Salva soluzione' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Scarica MD per Visual Studio Code' })).toBeEnabled();
  openItem('OTT-1');
  expect(screen.getByLabelText('Soluzione proposta')).toBeDisabled();
});

test('an offer with no interventions explains what to do and disables the download', async () => {
  render(<SolutionPanel {...props} interventions={[]} />);
  expect(await screen.findByText(/non ha ancora interventi/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Scarica MD per Visual Studio Code' })).toBeDisabled();
});

test('a solution for an intervention that left the offer stays visible and flagged', async () => {
  loadSolution.mockResolvedValue({ solution: { entries: { 'OTT-9': { approach: 'Vecchia idea' } }, summary: '' }, revision: 1, exists: true });
  render(<SolutionPanel {...props} />);
  expect(await screen.findByRole('button', { name: /OTT-9/ })).toHaveTextContent('Non più nell’offerta');
  openItem('OTT-9');
  expect(screen.getByLabelText('Soluzione proposta')).toHaveValue('Vecchia idea');
  expect(screen.getByText(/non è più presente nell’offerta/)).toBeInTheDocument();
});

test('the filter separates described and still-to-describe interventions', async () => {
  loadSolution.mockResolvedValue({ solution: { entries: { 'OTT-1': { approach: 'Fatta' } }, summary: '' }, revision: 1, exists: true });
  render(<SolutionPanel {...props} />);
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: /Da descrivere \(1\)/ }));
  expect(screen.queryByRole('button', { name: /OTT-1/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /OTT-2/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Con soluzione \(1\)/ }));
  expect(screen.getByRole('button', { name: /OTT-1/ })).toBeInTheDocument();
});

test('reloading with unsaved changes asks for confirmation first', async () => {
  render(<SolutionPanel {...props} />);
  await screen.findByRole('button', { name: /OTT-1/ });
  openItem('OTT-1');
  fireEvent.change(screen.getByLabelText('Soluzione proposta'), { target: { value: 'da non perdere' } });
  window.confirm = jest.fn(() => false);
  fireEvent.click(screen.getByRole('button', { name: /Ricarica/ }));
  expect(window.confirm).toHaveBeenCalled();
  expect(loadSolution).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Soluzione proposta')).toHaveValue('da non perdere');
});

test('it reports progress to the page so the closed row can show it', async () => {
  const progress = jest.fn();
  render(<SolutionPanel {...props} onProgress={progress} />);
  await screen.findByRole('button', { name: /OTT-1/ });
  openItem('OTT-1');
  fireEvent.change(screen.getByLabelText('Soluzione proposta'), { target: { value: 'x' } });
  await waitFor(() => expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ total: 2, filled: 1, dirty: true })));
});
