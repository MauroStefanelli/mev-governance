import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfiguratorePage from './ConfiguratorePage';
import * as service from '../services/mevService';
import { estimatorWorkbook } from '../configuratore/estimatorFixture';

jest.mock('../services/mevService', () => {
  const answers = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getConfiguratoreContracts: [], getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getTowImpatto: null, getReleaseSchedules: [] };
  const cache = {};
  return new Proxy({}, { get: (_, name) => { if (name === '__esModule') return true; if (!cache[name]) cache[name] = jest.fn(async () => (name in answers ? answers[name] : {})); return cache[name]; } });
});
jest.mock('../configuratore/InitiativeConversation', () => () => null);

const catalog = [{ id: 239, nome: 'Servizio/API/Microservizio', ambito: 'Backend', descrizione: 'Un servizio', prezzi: { REALIZZAZIONE: { Semplice: 900, Medio: 1200, Complesso: 4050 }, MODIFICA: { Semplice: 120, Medio: 360, Complesso: 600 } } },
  { id: 236, nome: 'Realizzazione Single Page Application', ambito: 'Frontend', descrizione: 'Una SPA', prezzi: { REALIZZAZIONE: { Semplice: 1200, Medio: 2800, Complesso: 4800 }, MODIFICA: { Semplice: 280, Medio: 840, Complesso: 1400 } } }];
const contracts = [{ contractId: 'poste-tet-2025', name: 'Poste TeT', lots: [{ lotId: '2', name: 'Lotto 2', active: true, catalog, towPrices: {}, codiceContratto: 'C1' }] }];
const A = { id: 'abc-001', titolo: 'Modifica del servizio di stampa', attivita: 'Si modifica il servizio', sistema: 'NPSO', tow1: 0.14, tow5: 2040, hours: [0, 52, 0, 0] };
const B = { id: 'abc-002', titolo: 'Nuova pagina', attivita: 'Nuova pagina', sistema: 'IPER', tow1: 0.5, tow5: 1000, hours: [4.8, 16, 1.6, 1.6] };
const D = [
  { id: 'abc-001', catalogId: 239, driver: 'Servizio/API/Microservizio', type: 'MODIFICA', complexity: 'Semplice', qty: 1, price: 120 },
  { id: 'abc-001', catalogId: 239, driver: 'Servizio/API/Microservizio', type: 'MODIFICA', complexity: 'Medio', qty: 3, price: 360 },
  { id: 'abc-002', catalogId: 236, driver: 'Realizzazione Single Page Application', type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 1, price: 4800, ambit: 'Frontend' },
];
let gates;
beforeEach(() => {
  localStorage.clear(); window.HTMLElement.prototype.scrollIntoView = jest.fn(); gates = [];
  const defaults = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getReleaseSchedules: [] };
  Object.keys(defaults).forEach(name => service[name].mockReset().mockImplementation(async () => defaults[name]));
  service.rationaleRequest.mockReset().mockImplementation(async path => (String(path).startsWith('related') ? [] : { messages: [], hasMore: false, entries: [] }));
  service.libraryRequest.mockReset().mockImplementation(async () => ({ documents: [], folders: [], historical: 0, pendingIndex: 0, limit: 300, ocrAvailable: true }));
  service.historyImportRequest.mockReset().mockImplementation(async path => (String(path).startsWith('pending') ? { entries: [], hasMore: false, total: 0, bySystem: [] } : { filesRead: 0, withProposals: 0 }));
  service.ledgerRequest.mockReset().mockImplementation(async path => (/^\d+$/.test(String(path)) ? {} : { initiatives: [] }));
  service.developmentRequest.mockReset().mockImplementation(async path => (path === 'presence' ? { users: [], messages: [], lastWorked: null } : String(path).startsWith('chat') ? { messages: [], hasMore: false } : {}));
  service.getConfiguratoreContracts.mockReset().mockResolvedValue(contracts);
  service.getTowImpatto.mockReset().mockResolvedValue(null);
  service.reviewOfferDetails.mockReset().mockImplementation(context => new Promise(resolve => { gates.push({ rows: context.rows, resolve: () => resolve({ analysis: { reviews: context.rows.map(row => ({ rowId: row.rowId, status: 'coerente', reason: 'ok' })) }, model: 'm' }) }); }));
});
const mount = () => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Developer" roles={['Developer']} />);
const importEstimator = async (file) => { mount(); const input = await screen.findByLabelText('Importa da Estimatore Catalogo'); await act(async () => { fireEvent.change(input, { target: { files: [file] } }); }); };
// L'import NON avvia la verifica AI: si aspetta che l'import sia finito e si controlla che l'AI non sia stata chiamata.
const drain = async () => { await waitFor(() => expect(screen.getByLabelText('Codice GOTO')).toHaveValue('999001')); await act(async () => { await new Promise(r => setTimeout(r, 30)); }); expect(gates).toHaveLength(0); };
// La verifica la chiede l'utente dal passo Offerta; l'AI risponde a tutti i gruppi e si chiude il riepilogo.
const verifyFromOffer = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /3\. Offerta/ }));
  const region = await screen.findByRole('region', { name: 'Verifica AI delle righe' });
  fireEvent.click(within(region).getByRole('button', { name: 'Verifica con l’AI' }));
  await waitFor(() => expect(gates.length).toBeGreaterThan(0));
  const first = gates[0];
  while (/sta ragionando/.test(document.querySelector('[role=dialog]')?.textContent || '')) {
    if (gates.length) await act(async () => { gates.shift().resolve(); }); else await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  }
  const closeSummary = screen.queryByRole('button', { name: 'Chiudi' }); if (closeSummary) fireEvent.click(closeSummary);
  return first;
};

test('«Importa da Estimatore Catalogo» fills the initiative from INIZIATIVA, shows the report with the hours, and the Excel import button is still there', async () => {
  await importEstimator(await estimatorWorkbook({ interventions: [A, B], details: D, placeholders: 20 }));
  const report = await screen.findByRole('status', { name: 'Riepilogo dell’import dall’Estimatore Catalogo' });
  expect(report).toHaveTextContent('GOTO 999001 · Iniziativa di prova');
  expect(within(report).getByRole('list', { name: 'Numeri dell’import' })).toHaveTextContent('2interventi');
  expect(report).toHaveTextContent('20segnaposto vuoti saltati'); expect(report).toHaveTextContent('Totale76');
  expect(screen.getByLabelText('Codice GOTO')).toHaveValue('999001');
  expect(screen.getByLabelText('Titolo', { selector: 'input' })).toHaveValue('Iniziativa di prova');
  expect(screen.getByLabelText('Importa Tabella di Offerta')).toBeInTheDocument();
  await drain();
});

test('the activities arrive in the Offerta step exactly as an Offer Table import would give them; the AI verification runs on them only when asked', async () => {
  await importEstimator(await estimatorWorkbook({ interventions: [A, B], details: D, placeholders: 5 }));
  await drain();
  fireEvent.click(await screen.findByRole('button', { name: /3\. Offerta/ }));
  expect(await screen.findByRole('region', { name: 'Verifica AI delle righe' })).toHaveTextContent('3 righe da verificare');       // non verificate da sole
  const first = await verifyFromOffer();
  expect(first.rows).toHaveLength(3);                                                          // le 3 attivita', e nessun segnaposto
  expect(first.rows.map(r => r.intervention.id).sort()).toEqual(['abc-001', 'abc-001', 'abc-002']);
  expect(first.rows.map(r => r.detail.type + '/' + r.detail.complexity).sort()).toEqual(['MODIFICA/Medio', 'MODIFICA/Semplice', 'REALIZZAZIONE/Complesso']);
  expect(await screen.findByRole('region', { name: 'Verifica AI delle righe' })).toHaveTextContent('Tutte le 3 righe sono verificate');
});

test('a Tabella di Offerta given to the ESTIMATOR button is refused with the right advice, and nothing is changed', async () => {
  await importEstimator(await estimatorWorkbook({ interventions: [A], details: D, withInitiative: false }));
  await waitFor(() => expect(document.body).toHaveTextContent(/Importazione non riuscita: Questo file non sembra un Estimatore Catalogo/));
  expect(screen.getByLabelText('Codice GOTO')).toHaveValue('');
  expect(screen.getByLabelText('Titolo', { selector: 'input' })).toHaveValue('');
  expect(screen.queryByRole('status', { name: 'Riepilogo dell’import dall’Estimatore Catalogo' })).toBeNull();
  expect(gates).toHaveLength(0);
});

test('the report can be closed, and a new import replaces it', async () => {
  await importEstimator(await estimatorWorkbook({ interventions: [A, B], details: D }));
  const report = await screen.findByRole('status', { name: 'Riepilogo dell’import dall’Estimatore Catalogo' });
  fireEvent.click(within(report).getByRole('button', { name: 'Chiudi il riepilogo dell’import' }));
  expect(screen.queryByRole('status', { name: 'Riepilogo dell’import dall’Estimatore Catalogo' })).toBeNull();
  await drain();
});

test('the lot of the file must exist in the contract: otherwise the import is refused, as for the Offer Table', async () => {
  service.getConfiguratoreContracts.mockReset().mockResolvedValue([{ contractId: 'poste-tet-2025', name: 'Poste TeT', lots: [{ lotId: '1', name: 'Lotto 1', active: true, catalog, towPrices: {}, codiceContratto: 'C1' }] }]);
  await importEstimator(await estimatorWorkbook({ interventions: [A], details: D }));
  await waitFor(() => expect(document.body).toHaveTextContent(/Il lotto del file non è disponibile nel contratto selezionato/));
});

test('the hours of each intervention are shown in the box of the intervention and are SAVED with the evaluation (they come back when it is reopened)', async () => {
  await importEstimator(await estimatorWorkbook({ interventions: [A, B], details: D, placeholders: 3 }));
  await drain();
  fireEvent.click(await screen.findByRole('button', { name: /3\. Offerta/ }));
  await screen.findByRole('region', { name: 'Verifica AI delle righe' });
  fireEvent.click(screen.getByRole('button', { name: /4\. Revisione/ }));
  await waitFor(() => expect(service.upsertConfiguratoreRecord).toHaveBeenCalled());
  const saved = service.upsertConfiguratoreRecord.mock.calls.at(-1)[0].payload;
  expect(saved.importedInterventions.map(i => i.id)).toEqual(['abc-001', 'abc-002']);
  expect(saved.importedInterventions[0].hours).toEqual({ Analisi: 0, Sviluppo: 52, Collaudo: 0, Produzione: 0 });
  expect(saved.importedInterventions[1].hours).toEqual({ Analisi: 4.8, Sviluppo: 16, Collaudo: 1.6, Produzione: 1.6 });
  expect(saved.items).toHaveLength(3);
});


test('the import reads the file with the OFFERED catalog of the lot when there is one: the catalog price of the rows is the offered one, the original price of the file is kept', async () => {
  service.getConfiguratoreContracts.mockReset().mockResolvedValue([{ contractId: 'poste-tet-2025', name: 'Poste TeT', lots: [{ lotId: '2', name: 'Lotto 2', active: true, catalog, towPrices: {}, codiceContratto: 'C1',
    offeredCatalog: [{ id: 239, prezzi: { REALIZZAZIONE: { Semplice: 450, Medio: 600, Complesso: 2025 }, MODIFICA: { Semplice: 60, Medio: 180, Complesso: 300 } } }] }] }]);
  // il file ha le righe SENZA prezzo: allora il prezzo viene dal catalogo, e deve essere quello OFFERTO (60), non quello di gara (120)
  await importEstimator(await estimatorWorkbook({ interventions: [A], details: [{ ...D[0], price: undefined }] }));
  await drain();
  const first = await verifyFromOffer();
  expect(first.rows[0].catalogEntry.id).toBe(239);
  fireEvent.click(await screen.findByRole('button', { name: /4\. Revisione/ }));
  await waitFor(() => expect(service.upsertConfiguratoreRecord).toHaveBeenCalled());
  const saved = service.upsertConfiguratoreRecord.mock.calls.at(-1)[0].payload;
  expect(saved.items[0]).toMatchObject({ id: 239, type: 'MODIFICA', complexity: 'Semplice' });
  expect(saved.items[0].unit).toBe(60);                                   // prezzo OFFERTO (di gara sarebbe 120)
});
