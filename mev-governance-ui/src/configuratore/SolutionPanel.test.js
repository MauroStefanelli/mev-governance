import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SolutionPanel from './SolutionPanel';
import { loadSolution, saveSolution } from './solutionStore';
import { proposeInterventions } from '../services/mevService';
import REAL_CATALOG from './__fixtures__/lotto2Catalogo.json';
jest.mock('./solutionStore', () => ({ loadSolution: jest.fn(), saveSolution: jest.fn() }));
jest.mock('../services/mevService', () => ({ proposeInterventions: jest.fn() }));

const initiative = { code: 'GOTO-1', title: 'Invio prenotazione', system: 'NPSO' };
const interventions = [
  { id: 'OTT-1', titolo: 'Invio prenotazione', descrizione: 'Esporre il servizio', attivita: 'Sviluppo API', sistema: 'NPSO', requisiti: 'REQ-4', mappings: [{ name: 'Servizio REST', type: 'REALIZZAZIONE', complexity: 'Medio', qty: 2, componentApplication: 'Gateway', technology: 'Java' }] },
  { id: 'OTT-2', titolo: 'Notifiche', mappings: [] },
];
const knowledge = [{ id: 1, kind: 'vincolo', status: 'confermata', text: 'Nessuna modifica allo schema', interventionId: 'OTT-1', decidedByFullName: 'Anna Rossi', decidedAt: '2026-05-04T10:00:00Z' }, { id: 2, kind: 'razionale', status: 'proposta', text: 'PROPOSTA-NON-CONFERMATA', byAi: true }, { id: 3, kind: 'vincolo', status: 'revocata', text: 'REVOCATA' }, { id: 4, kind: 'decisione', status: 'scartata', text: 'SCARTATA' }];
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
  expect(within(details).queryAllByRole('textbox')).toHaveLength(0);
  const confirmed = screen.getByLabelText('Razionali e vincoli confermati per OTT-1');
  expect(confirmed).toHaveTextContent('Nessuna modifica allo schema');
  expect(confirmed).toHaveTextContent(/confermata da Anna Rossi/);
  expect(confirmed).not.toHaveTextContent('PROPOSTA-NON-CONFERMATA');
  const unverified = screen.getByLabelText('Proposte da confermare per OTT-1');
  expect(unverified).toHaveTextContent('Da confermare — proposte non verificate');
  expect(unverified).toHaveTextContent('PROPOSTA-NON-CONFERMATA');
  expect(unverified).toHaveTextContent(/proposta dall’AI, non ancora confermata/);
  ['REVOCATA', 'SCARTATA'].forEach(word => expect(details).not.toHaveTextContent(word));
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
  expect(md).toMatch(/\| Servizio REST \| [^|]* \| REALIZZAZIONE \| Medio \| 2 \| [^|]* \| Gateway \| Java \|/);
  expect(md).toContain('Nessuna modifica allo schema');
  expect(md).toContain('`/src/npso`');
  expect(md).toContain('confermata da Anna Rossi');
  expect(md).toContain('Da confermare — proposte non verificate');
  expect(md).toContain('PROPOSTA-NON-CONFERMATA');
  expect(md).toContain('trattarle come ipotesi, non come requisiti');
  ['REVOCATA', 'SCARTATA'].forEach(word => expect(md).not.toContain(word));
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
  expect(await screen.findByText(/Non ci sono ancora interventi/)).toBeInTheDocument();   // non e' piu' un vicolo cieco: si puo' anche chiedere gli interventi all'AI
  expect(screen.getByText(/farti proporre gli interventi dall’AI/)).toBeInTheDocument();
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

test('a strip above the list says how much the solution draws from Razionali e vincoli, and flags what is unverified', async () => {
  render(<SolutionPanel {...props} />);
  const feed = await screen.findByLabelText('Informazioni dei Razionali e vincoli usate dalla soluzione');
  expect(feed).toHaveTextContent('1 confermati (1 vincoli · 0 decisioni · 0 razionali)');
  expect(feed).toHaveTextContent('1 proposte ancora da confermare (non verificate)');
});

test('with no rationale at all the panel tells the user where it comes from', async () => {
  render(<SolutionPanel {...props} knowledge={[]} />);
  expect(await screen.findByText(/Nessuna voce in «Razionali e vincoli con l’AI»/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Informazioni dei Razionali e vincoli usate dalla soluzione')).not.toBeInTheDocument();
});

test('changing the rationale updates the solution immediately, without reloading it', async () => {
  const { rerender } = render(<SolutionPanel {...props} knowledge={[]} />);
  await screen.findByRole('button', { name: /OTT-1/ });
  openItem('OTT-1');
  expect(screen.queryByLabelText('Razionali e vincoli confermati per OTT-1')).not.toBeInTheDocument();
  rerender(<SolutionPanel {...props} knowledge={[{ id: 9, kind: 'vincolo', status: 'confermata', text: 'Appena confermato', interventionId: 'OTT-1' }]} />);
  expect(screen.getByLabelText('Razionali e vincoli confermati per OTT-1')).toHaveTextContent('Appena confermato');
  expect(loadSolution).toHaveBeenCalledTimes(1);
});

// ---- no Offer Table: the AI proposes the interventions, the team confirms them, and the document for Visual Studio Code is built from them ----
const confirmedRationale = [{ id: 7, kind: 'vincolo', status: 'confermata', text: 'Mantenere l’esclusione del CHA per le PDDP', decidedByFullName: 'Anna Rossi', decidedAt: '2026-05-04T10:00:00Z' }, { id: 8, kind: 'razionale', status: 'proposta', text: 'Ancora da decidere', byAi: true }];
const aiAnswer = (over = {}) => ({
  interventions: [
    { title: 'Adeguare la stampa H7', description: 'Consentire la stampa immediata', activity: 'Stampa etichetta', system: 'ILP', requirements: 'Punto 1', components: ['ILP_BACKEND_print-app'], rationaleIds: [7],
      mappings: [{ catalogId: 236, name: 'Realizzazione Single Page Application', ambit: 'Frontend', type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 2, unit: 4800, component: 'ILP_frontend', technology: 'Angular', why: 'maschera di stampa', correction: null }], rejectedMappings: ['la voce di catalogo 77777 non esiste nel catalogo di questo lotto'] },
    { title: 'Bloccare la partenza HU', description: 'Controllo bloccante', mappings: [{ catalogId: 239, name: 'Servizio/API/Microservizio', ambit: 'Backend', type: 'MODIFICA', complexity: 'Medio', qty: 1, unit: 600, component: 'hu-transport-app' }] }],
  rejected: [{ title: 'Senza voci valide', reason: 'x' }], notes: ['Il servizio AI ha raggiunto il limite di lunghezza: l’elenco può essere incompleto.'], missing: ['manca il flusso di conferma partenza'], model: 'm', ...over });
const noTable = { ...props, interventions: [], knowledge: confirmedRationale, catalog: REAL_CATALOG, applicationBriefs: [{ name: 'ILP', components: ['ILP_BACKEND_print-app'] }] };
const generateButton = () => screen.getByRole('button', { name: /Proponi (gli|altri) interventi con l’AI/ });

test('with no Offer Table the panel offers to propose the interventions, and says what it starts from', async () => {
  render(<SolutionPanel {...noTable} />); expect(await screen.findByRole('region', { name: 'Interventi proposti dall’AI' })).toBeInTheDocument();
  expect(screen.getByText(/Non serve la Tabella di Offerta/)).toBeInTheDocument(); expect(generateButton()).toBeEnabled();
  expect(screen.queryByRole('button', { name: /^OTT-/ })).not.toBeInTheDocument();
});
test('without a confirmed rationale it does not ask the AI, and says why', async () => {
  render(<SolutionPanel {...noTable} knowledge={[confirmedRationale[1]]} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' });
  expect(generateButton()).toBeDisabled(); expect(screen.getByText(/serve almeno una voce/)).toHaveTextContent('confermata'); expect(proposeInterventions).not.toHaveBeenCalled();
});
test('without the catalogue of the lot it does not ask the AI, and says why', async () => {
  render(<SolutionPanel {...noTable} catalog={[]} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); expect(generateButton()).toBeDisabled(); expect(screen.getByText(/catalogo interventi del lotto non è disponibile/)).toBeInTheDocument();
});
test('the request carries the catalogue with its prices, the chosen applications, the initiative and the focus, and never the confirmed rationale from the browser', async () => {
  proposeInterventions.mockResolvedValue(aiAnswer()); render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' });
  fireEvent.change(screen.getByLabelText(/Su cosa concentrarsi/), { target: { value: 'solo la stampa H7' } }); fireEvent.click(generateButton());
  await waitFor(() => expect(proposeInterventions).toHaveBeenCalledTimes(1)); const body = proposeInterventions.mock.calls[0][0];
  expect(body).toMatchObject({ goto: 'GOTO-1', system: 'NPSO', lot: '2', focus: 'solo la stampa H7', applications: [{ name: 'ILP' }] }); expect(body.catalog).toHaveLength(27);
  expect(body.catalog[0].prezzi.REALIZZAZIONE.Complesso).toBeGreaterThan(0); expect(JSON.stringify(body)).not.toContain('Mantenere l’esclusione'); expect(body.knowledge).toBeUndefined();
});
test('the proposals appear to be confirmed one by one, with the catalogue rows, the price from the catalogue and what the AI asked for that did not enter', async () => {
  proposeInterventions.mockResolvedValue(aiAnswer()); render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton());
  const first = await screen.findByRole('article', { name: 'Intervento proposto P-1' }); expect(screen.getByRole('article', { name: 'Intervento proposto P-2' })).toBeInTheDocument();
  expect(within(first).getByText(/ipotesi di lavoro, non verificata sul codice/)).toBeInTheDocument(); expect(within(first).getByDisplayValue('Adeguare la stampa H7')).toBeInTheDocument();
  expect(within(first).getByText('Realizzazione Single Page Application', { exact: false })).toBeInTheDocument(); expect(within(first).getByText('9.600,00 €')).toBeInTheDocument(); expect(within(first).getByText(/4\.800,00 € × 2/)).toBeInTheDocument();
  expect(within(first).getByText('ILP_BACKEND_print-app')).toBeInTheDocument(); expect(within(first).getByText(/1 voce proposta dall’AI non è entrata/)).toBeInTheDocument();
  expect(await screen.findByText(/2 interventi proposti: controllali e conferma/)).toBeInTheDocument(); expect(screen.getByText(/Scartati 1/)).toBeInTheDocument(); expect(screen.getByText(/può essere incompleto/)).toBeInTheDocument(); expect(screen.getByText('manca il flusso di conferma partenza')).toBeInTheDocument();
});
test('a proposal is NOT an intervention until the team confirms it: it is not in the list, nor in the document', async () => {
  proposeInterventions.mockResolvedValue(aiAnswer()); render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton()); await screen.findByRole('article', { name: 'Intervento proposto P-1' });
  expect(screen.queryByRole('button', { name: /P-1/ })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Scarica MD per Visual Studio Code' })).toBeDisabled();
});
test('confirming an intervention makes it a row of the solution, ready to describe, and the other proposal stays to be confirmed', async () => {
  proposeInterventions.mockResolvedValue(aiAnswer()); render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton());
  fireEvent.click(within(await screen.findByRole('article', { name: 'Intervento proposto P-1' })).getByRole('button', { name: 'Conferma l’intervento' }));
  expect(await screen.findByRole('button', { name: /P-1.*Adeguare la stampa H7/ })).toBeInTheDocument(); expect(screen.queryByRole('article', { name: 'Intervento proposto P-1' })).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Intervento proposto P-2' })).toBeInTheDocument(); expect(screen.getByText(/1 confermati · 1 da confermare/)).toBeInTheDocument();
  openItem('P-1'); expect(await screen.findByLabelText('Soluzione proposta')).toBeEnabled(); expect(screen.getByRole('region', { name: 'Attività dell’intervento P-1' })).toHaveTextContent('Realizzazione Single Page Application');
});
test('the document for Visual Studio Code is built from the confirmed interventions: catalogue rows, components, checklist, and what is not verified', async () => {
  proposeInterventions.mockResolvedValue(aiAnswer()); render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton());
  fireEvent.click(within(await screen.findByRole('article', { name: 'Intervento proposto P-1' })).getByRole('button', { name: 'Conferma l’intervento' })); await screen.findByRole('button', { name: /P-1/ });
  fireEvent.click(screen.getByRole('button', { name: 'Scarica MD per Visual Studio Code' })); await waitFor(() => expect(blobs).toHaveLength(1)); const md = await readBlob(blobs[0]);
  expect(md).toContain('## Prima di cominciare'); expect(md).toMatch(/Interventi proposti dall’AI e confermati dal team:\*\* 1/); expect(md).toContain('### 1. P-1 — Adeguare la stampa H7'); expect(md).toContain('proposto dall’AI e confermato dal team');
  expect(md).toContain('| Realizzazione Single Page Application | 236 | REALIZZAZIONE | Complesso | 2 | 9.600,00 € | ILP_frontend | Angular |'); expect(md).toContain('- `ILP_BACKEND_print-app`'); expect(md).toContain('- [ ] Realizzare: Realizzazione Single Page Application');
  expect(md).not.toContain('Bloccare la partenza HU'); expect(md).toContain('Mantenere l’esclusione del CHA per le PDDP');
});
test('discarding removes a proposal from the work, and it can be restored', async () => {
  proposeInterventions.mockResolvedValue(aiAnswer()); render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton());
  fireEvent.click(within(await screen.findByRole('article', { name: 'Intervento proposto P-2' })).getByRole('button', { name: 'Scarta' })); await waitFor(() => expect(screen.queryByRole('article', { name: 'Intervento proposto P-2' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Mostra gli scartati \(1\)/ })); fireEvent.click(screen.getByRole('button', { name: 'Ripristina' })); expect(await screen.findByRole('article', { name: 'Intervento proposto P-2' })).toBeInTheDocument();
});
test('an intervention with no valid catalogue row cannot be confirmed; adding a row from the catalogue allows it, and the price follows the catalogue', async () => {
  proposeInterventions.mockResolvedValue({ interventions: [{ title: 'Senza voci', mappings: [] }] }); render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton());
  const card = await screen.findByRole('article', { name: 'Intervento proposto P-1' }); expect(within(card).getByRole('button', { name: 'Conferma l’intervento' })).toBeDisabled(); expect(within(card).getByText('Serve almeno una voce di catalogo.')).toBeInTheDocument();
  fireEvent.change(within(card).getByLabelText('Aggiungi voce di catalogo a P-1'), { target: { value: '236' } }); expect(within(card).getByRole('button', { name: 'Conferma l’intervento' })).toBeEnabled();
  expect(within(card).getByText('2.800,00 €')).toBeInTheDocument();                        // REALIZZAZIONE Medio x 1, dal catalogo
  fireEvent.change(within(card).getByLabelText(/Quantità, Realizzazione/), { target: { value: '3' } }); expect(within(card).getByText('8.400,00 €')).toBeInTheDocument();
  fireEvent.change(within(card).getByLabelText(/Complessità, Realizzazione/), { target: { value: 'Complesso' } }); expect(within(card).getByText('14.400,00 €')).toBeInTheDocument();
});
test('changing a confirmed intervention puts it back to be confirmed again', async () => {
  proposeInterventions.mockResolvedValue(aiAnswer()); render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton());
  fireEvent.click(within(await screen.findByRole('article', { name: 'Intervento proposto P-1' })).getByRole('button', { name: 'Conferma l’intervento' })); await screen.findByRole('button', { name: /P-1/ });
  expect(screen.queryByRole('article', { name: 'Intervento proposto P-1' })).not.toBeInTheDocument();
});
test('confirming an intervention saves the solution by itself and tells the offer; the answer of the server is what the offer follows', async () => {
  const onProposalsEdit = jest.fn();
  proposeInterventions.mockResolvedValue(aiAnswer()); render(<SolutionPanel {...noTable} onProposalsEdit={onProposalsEdit} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton());
  fireEvent.click(within(await screen.findByRole('article', { name: 'Intervento proposto P-1' })).getByRole('button', { name: 'Conferma l’intervento' }));
  await waitFor(() => expect(saveSolution).toHaveBeenCalledTimes(1));
  const sent = saveSolution.mock.calls[0][0].solution; expect(sent.proposed.map(item => [item.id, item.status])).toEqual([['P-1', 'confermato'], ['P-2', 'proposto']]);
  await waitFor(() => expect(onProposalsEdit).toHaveBeenCalledTimes(1)); expect(onProposalsEdit.mock.calls[0][0].map(item => [item.id, item.status])).toEqual([['P-1', 'confermato'], ['P-2', 'proposto']]);
  expect(screen.queryByText('Modifiche non salvate')).not.toBeInTheDocument();
});
test('when the automatic save fails the offer is NOT told, the page says so, and the confirmation stays in the page to retry', async () => {
  const onProposalsEdit = jest.fn(); saveSolution.mockRejectedValueOnce(new Error('Un collega ha salvato la soluzione dopo la tua apertura.'));
  proposeInterventions.mockResolvedValue(aiAnswer()); render(<SolutionPanel {...noTable} onProposalsEdit={onProposalsEdit} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton());
  fireEvent.click(within(await screen.findByRole('article', { name: 'Intervento proposto P-1' })).getByRole('button', { name: 'Conferma l’intervento' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Intervento non portato nell’offerta'); expect(screen.getByRole('alert')).toHaveTextContent('Un collega ha salvato la soluzione');
  expect(onProposalsEdit).not.toHaveBeenCalled(); expect(screen.getByText('Modifiche non salvate')).toBeInTheDocument();
});
test('proposals saved by a colleague are there when the page opens', async () => {
  loadSolution.mockResolvedValue({ solution: { entries: {}, summary: '', proposed: [{ id: 'P-4', title: 'Di Lucia', description: '', activity: '', system: '', requirements: '', rationaleIds: [], components: [], status: 'confermato', byAi: true, mappings: [{ catalogId: 236, name: 'Realizzazione Single Page Application', ambit: 'Frontend', type: 'MODIFICA', complexity: 'Medio', qty: 1, unit: 840, component: '', technology: '', why: '' }] }] }, revision: 3, exists: true });
  render(<SolutionPanel {...noTable} />); expect(await screen.findByRole('button', { name: /P-4.*Di Lucia/ })).toBeInTheDocument();
});
test('an error from the AI is shown and nothing is lost', async () => {
  proposeInterventions.mockRejectedValue(new Error('Il servizio AI non ha risposto nel formato richiesto: riprova.')); render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton());
  expect(await screen.findByRole('alert')).toHaveTextContent('non ha risposto nel formato richiesto'); expect(generateButton()).toBeEnabled();
});
test('a second request does not repeat what was already proposed, and keeps the numbering going', async () => {
  proposeInterventions.mockResolvedValueOnce(aiAnswer()).mockResolvedValueOnce({ interventions: [{ title: 'ADEGUARE LA STAMPA H7', mappings: [] }, { title: 'Nuovo intervento', mappings: aiAnswer().interventions[1].mappings }] });
  render(<SolutionPanel {...noTable} />); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); fireEvent.click(generateButton()); await screen.findByRole('article', { name: 'Intervento proposto P-1' });
  fireEvent.click(generateButton()); expect(await screen.findByRole('article', { name: 'Intervento proposto P-3' })).toBeInTheDocument(); expect(screen.queryByRole('article', { name: 'Intervento proposto P-4' })).not.toBeInTheDocument();
  expect(proposeInterventions.mock.calls[1][0].existingTitles).toEqual(expect.arrayContaining(['Adeguare la stampa H7', 'Bloccare la partenza HU']));
});
test('a person who cannot edit sees the proposals but has no buttons to ask, confirm or discard', async () => {
  loadSolution.mockResolvedValue({ solution: { entries: {}, summary: '', proposed: [{ id: 'P-1', title: 'In revisione', description: '', activity: '', system: '', requirements: '', rationaleIds: [], components: [], status: 'proposto', byAi: true, mappings: [{ catalogId: 236, name: 'Realizzazione Single Page Application', ambit: 'Frontend', type: 'MODIFICA', complexity: 'Medio', qty: 1, unit: 840, component: '', technology: '', why: '' }] }] }, revision: 1, exists: true });
  render(<SolutionPanel {...noTable} canEdit={false} />); const card = await screen.findByRole('article', { name: 'Intervento proposto P-1' });
  expect(screen.queryByRole('button', { name: /Proponi/ })).not.toBeInTheDocument(); expect(within(card).queryByRole('button', { name: 'Conferma l’intervento' })).not.toBeInTheDocument(); expect(within(card).getByDisplayValue('In revisione')).toBeDisabled();
});
test('an intervention of the Offer Table and a proposed one live together in the same list', async () => {
  loadSolution.mockResolvedValue({ solution: { entries: {}, summary: '', proposed: [{ id: 'P-1', title: 'Proposto confermato', description: '', activity: '', system: '', requirements: '', rationaleIds: [], components: [], status: 'confermato', byAi: true, mappings: [{ catalogId: 236, name: 'Realizzazione Single Page Application', ambit: 'Frontend', type: 'MODIFICA', complexity: 'Medio', qty: 1, unit: 840, component: '', technology: '', why: '' }] }] }, revision: 1, exists: true });
  render(<SolutionPanel {...props} knowledge={confirmedRationale} catalog={REAL_CATALOG} />); await screen.findByRole('button', { name: /P-1.*Proposto confermato/ }); const heads = screen.getAllByRole('button', { name: /OTT-1|OTT-2|P-1/ }); expect(heads.map(head => head.textContent.match(/OTT-1|OTT-2|P-1/)[0])).toEqual(['OTT-1', 'OTT-2', 'P-1']);
});

