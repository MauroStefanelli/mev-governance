import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfiguratorePage from './ConfiguratorePage';
import * as service from '../services/mevService';

jest.mock('../services/mevService', () => {
  const answers = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getConfiguratoreContracts: [], getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getTowImpatto: null, getReleaseSchedules: [] };
  const cache = {};
  return new Proxy({}, { get: (_, name) => { if (name === '__esModule') return true; if (!cache[name]) cache[name] = jest.fn(async () => (name in answers ? answers[name] : {})); return cache[name]; } });
});
jest.mock('../configuratore/InitiativeConversation', () => () => null);

const catalog = [
  { id: 239, nome: 'Servizio/API/Microservizio', ambito: 'Backend', descrizione: 'Un servizio', prezzi: { REALIZZAZIONE: { Semplice: 900, Medio: 1200, Complesso: 4050 }, MODIFICA: { Semplice: 120, Medio: 360, Complesso: 600 } } },
  { id: 242, nome: 'Stored procedure', ambito: 'Database', descrizione: 'Una stored', prezzi: { REALIZZAZIONE: { Semplice: 120, Medio: 300, Complesso: 600 } } },
];
const contracts = [{ contractId: 'poste-tet-2025', name: 'Poste TeT', lots: [{ lotId: '2', name: 'Lotto 2', active: true, catalog, towPrices: { 'TOW02.1': 3607, 'TOW02.3': 3156, 'TOW02.4': 1202, 'TOW02.2': 9018 }, tow5Share: 65, codiceContratto: 'C1' }] }];
const map = (catalogId, name, type, complexity, qty) => ({ catalogId, name, ambit: 'Backend', type, complexity, qty, unit: 100, component: 'api', technology: 'Java', why: 'perche' });
const prop = (id, title, status, mappings) => ({ id, title, description: 'desc', activity: 'att', system: 'NPSO', requirements: '', rationaleIds: [], components: [], mappings, rejectedMappings: [], status, byAi: true });

let stored; let solutionRevision;
beforeEach(() => {
  localStorage.clear(); window.HTMLElement.prototype.scrollIntoView = jest.fn();
  stored = [prop('P-1', 'Nuovo servizio invio', 'proposto', [map(239, 'Servizio/API/Microservizio', 'REALIZZAZIONE', 'Medio', 2), map(242, 'Stored procedure', 'REALIZZAZIONE', 'Semplice', 1)])]; solutionRevision = 1;
  const defaults = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getReleaseSchedules: [] };
  Object.keys(defaults).forEach(name => service[name].mockReset().mockImplementation(async () => defaults[name]));
  service.getConfiguratoreContracts.mockReset().mockResolvedValue(contracts);
  service.getTowImpatto.mockReset().mockResolvedValue(null);
  const solutionRecord = () => ({ record_key: 'C1|solution|777001', entity_type: 'initiative_solution', payload: JSON.stringify({ revision: solutionRevision, entries: {}, summary: '', proposed: stored }) });
  service.getConfiguratoreRecords.mockReset().mockImplementation(async params => ({ records: params.entity_type === 'initiative_solution' ? [solutionRecord()] : [] }));
  service.upsertConfiguratoreRecord.mockReset().mockImplementation(async body => {
    if (body.entity_type === 'initiative_solution') { stored = JSON.parse(JSON.stringify(body.payload.proposed)); solutionRevision = body.payload.revision; }          // the server keeps what it was sent
    return { ...body, payload: JSON.stringify(body.payload) };
  });
  service.rationaleRequest.mockReset().mockImplementation(async path => (String(path).startsWith('related') ? [] : { messages: [], hasMore: false, entries: [] }));
  service.libraryRequest.mockReset().mockImplementation(async () => ({ documents: [], folders: [], historical: 0, pendingIndex: 0, limit: 300, ocrAvailable: true }));
  service.historyImportRequest.mockReset().mockImplementation(async path => (String(path).startsWith('pending') ? { entries: [], hasMore: false, total: 0, bySystem: [] } : {}));
  service.ledgerRequest.mockReset().mockImplementation(async path => (/^\d+$/.test(String(path)) ? {} : { initiatives: [] }));
  service.developmentRequest.mockReset().mockImplementation(async path => (path === 'presence' ? { users: [], messages: [], lastWorked: null } : { messages: [], hasMore: false }));
});

const open = async () => {
  render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Developer" roles={['Developer']} onNavigate={() => {}} />);
  await waitFor(() => expect(screen.getByLabelText('Codice GOTO')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '777001' } });
  fireEvent.change(screen.getByLabelText('Titolo', { selector: 'input' }), { target: { value: 'Servizio invio' } });
  const row = await screen.findByRole('region', { name: 'Soluzione' }); fireEvent.click(within(row).getAllByRole('button').find(button => button.classList.contains('secrow-toggle')));
  return screen.findByRole('region', { name: 'Interventi proposti dall’AI' });
};
const goToOffer = async () => { fireEvent.click(screen.getByRole('button', { name: /3\. Offerta/ })); await screen.findByText('Totale catalogo', { exact: false }); };
const offerRows = () => [...document.querySelectorAll('tbody tr')].filter(row => row.querySelector('select') && /ID \d+/.test(row.textContent));

test('confirming a proposed intervention puts its catalogue rows in the offer, grouped under the intervention, with the right type, complexity and quantity', async () => {
  const panel = await open();
  expect(panel).toHaveTextContent('0 confermati');
  fireEvent.click(within(panel).getByRole('button', { name: 'Conferma l’intervento' }));
  await waitFor(() => expect(document.body).toHaveTextContent('2 voci sono entrate nell’offerta'));
  await goToOffer();
  const group = [...document.querySelectorAll('div')].find(el => /ID_INTERVENTO:\s*P-1/.test(el.textContent) && el.children.length > 0 && el.textContent.length < 120);
  expect(group).toBeTruthy(); expect(group).toHaveTextContent('2 voci'); fireEvent.click(screen.getByRole('button', { name: 'Espandi tutti' }));
  await waitFor(() => expect(offerRows()).toHaveLength(2));
  const rows = offerRows();
  expect(rows[0]).toHaveTextContent('Servizio/API/Microservizio'); expect(within(rows[0]).getAllByRole('combobox')[0]).toHaveValue('REALIZZAZIONE'); expect(within(rows[0]).getAllByRole('combobox')[1]).toHaveValue('Medio');
  expect(within(rows[0]).getAllByRole('spinbutton')[0]).toHaveValue(2);
  expect(document.body).toHaveTextContent('Totale catalogo');
});

const proposals = () => screen.getByRole('region', { name: 'Interventi proposti dall’AI' });
const confirmIt = async () => { fireEvent.click(within(proposals()).getByRole('button', { name: 'Conferma l’intervento' })); await waitFor(() => expect(document.body).toHaveTextContent(/voc[ei] (è|sono) entrat[ae] nell’offerta/)); };
const goToSolution = async () => { fireEvent.click(screen.getByRole('button', { name: /1\. Iniziativa/ })); await waitFor(() => expect(screen.getByRole('region', { name: 'Soluzione' })).toBeInTheDocument()); const head = within(screen.getByRole('region', { name: 'Soluzione' })).getAllByRole('button').find(button => button.classList.contains('secrow-toggle')); if (head.getAttribute('aria-expanded') === 'false') fireEvent.click(head); await screen.findByRole('region', { name: 'Interventi proposti dall’AI' }); };
const expandOffer = async () => { await goToOffer(); fireEvent.click(screen.getByRole('button', { name: 'Espandi tutti' })); await waitFor(() => expect(document.querySelector('tbody')).toBeTruthy()); };
const saved = () => service.upsertConfiguratoreRecord.mock.calls.map(call => call[0]).filter(body => body.entity_type === 'initiative_evaluation').at(-1);

test('the total of the offer follows the confirmation: 2 x 1.200 + 1 x 120 = 2.520', async () => {
  await open(); await confirmIt(); await goToOffer();
  expect(screen.getByText(/Totale catalogo/)).toHaveTextContent('2.520,00');
});

test('an intervention already confirmed in the saved solution brings its rows into the offer when the solution loads, once', async () => {
  stored[0].status = 'confermato';
  await open(); await waitFor(() => expect(proposals()).toHaveTextContent('1 confermati'));
  await expandOffer(); expect(offerRows()).toHaveLength(2);
});

const toReview = async () => { fireEvent.click(within(proposals()).getByRole('button', { name: 'Rimetti in revisione' })); };
const rowsInOffer = async () => { await goToOffer(); const group = screen.queryByRole('button', { name: 'Espandi tutti' }); if (group) fireEvent.click(group); return offerRows(); };

test('«Rimetti in revisione» takes the UNTOUCHED rows out of the offer; confirming again brings them back: two rows, never four', async () => {
  await open(); await confirmIt();
  await toReview(); await waitFor(() => expect(document.body).toHaveTextContent('2 voci sono uscite dall’offerta'));
  expect(await rowsInOffer()).toHaveLength(0);
  await goToSolution(); await confirmIt(); await waitFor(() => expect(document.body).toHaveTextContent('2 voci sono entrate nell’offerta'));
  expect(await rowsInOffer()).toHaveLength(2);
});

test('discarding an intervention takes its rows out of the offer, and the total goes back to zero', async () => {
  await open(); await confirmIt();
  await toReview(); await waitFor(() => expect(document.body).toHaveTextContent('uscite dall’offerta'));
  fireEvent.click(within(proposals()).getByRole('button', { name: 'Scarta' }));
  expect(await rowsInOffer()).toHaveLength(0); expect(screen.getByText(/Totale catalogo/)).toHaveTextContent('0,00');
});

test('what the team changed by hand in the offer survives: a row with a price of its own is NOT taken out when the intervention goes back in review', async () => {
  await open(); await confirmIt();
  const rows = await rowsInOffer(); expect(rows).toHaveLength(2);
  fireEvent.change(within(rows[0]).getAllByRole('spinbutton')[1], { target: { value: '999' } });               // the unit price of the first row, by hand
  await goToSolution(); await toReview();
  await waitFor(() => expect(document.body).toHaveTextContent('1 voce è uscita dall’offerta'));                  // only the untouched one
  const after = await rowsInOffer(); expect(after).toHaveLength(1); expect(after[0]).toHaveTextContent('Servizio/API/Microservizio');
});

test('a row the team removed by hand does not come back by itself while the intervention wants it; the rest is unaffected', async () => {
  await open(); await confirmIt();
  const rows = await rowsInOffer(); fireEvent.click(within(rows[1]).getByRole('button', { name: '×' }));
  await waitFor(() => expect(offerRows()).toHaveLength(1));
  await goToSolution(); await toReview(); await waitFor(() => expect(document.body).toHaveTextContent('uscita dall’offerta'));
  await goToSolution(); await confirmIt();
  await waitFor(() => expect(document.body).toHaveTextContent('1 voce è entrata nell’offerta'));                // only the one that was not removed by hand
  expect(await rowsInOffer()).toHaveLength(1);
});

test('the rows of the offer are saved with the evaluation, labelled with their intervention, and Sviluppo would build one activity for each', async () => {
  await open(); await confirmIt(); await goToOffer();
  fireEvent.click(screen.getByRole('button', { name: /Revisione →/ })); await waitFor(() => expect(saved()).toBeTruthy());
  const items = saved().payload.items; expect(items).toHaveLength(2);
  expect(items.map(item => item.proposedId)).toEqual(['P-1', 'P-1']); expect(items.map(item => item.interventionId)).toEqual(['P-1', 'P-1']); expect(items.every(item => item.imported === false && item.selected === true)).toBe(true);
  const { developmentActivities } = require('../configuratore/developmentActivityModel'); const { approvedInterventions } = require('../configuratore/developmentPackages');
  expect(developmentActivities(items)).toHaveLength(2); expect(approvedInterventions({ items, suggestions: [] }, catalog)).toHaveLength(2);
});

test('the Excel export accepts the rows of a proposed intervention (they have an intervention id, unlike the rows of «Analizza e suggerisci»)', () => {
  const { offerWorkbookDetails } = require('../configuratore/OfferWorkbookExport'); const { itemFromMapping } = require('../configuratore/proposedToOffer');
  const entry = prop('P-1', 'Nuovo servizio invio', 'confermato', [map(239, 'Servizio/API/Microservizio', 'REALIZZAZIONE', 'Medio', 2)]);
  const details = offerWorkbookDetails([itemFromMapping(entry, entry.mappings[0])], catalog);
  expect(details[0]).toMatchObject({ interventionId: 'P-1', catalogId: '239', quantity: 2 }); expect(details[0].unitPrice).toBe(1200);
});

test('syncing twice changes nothing (same array, no duplicates); an intervention the solution does not know is never deleted blindly', () => {
  const { syncItems, itemFromMapping } = require('../configuratore/proposedToOffer');
  stored[0].status = 'confermato';
  const once = syncItems([], stored, { additiveOnly: true }); expect(once).toHaveLength(2);
  expect(syncItems(once, stored, { additiveOnly: true })).toBe(once); expect(syncItems(once, stored)).toBe(once);
  const entry = prop('P-9', 'x', 'confermato', [map(239, 'S', 'REALIZZAZIONE', 'Medio', 2)]); const rows = [itemFromMapping(entry, entry.mappings[0])];
  expect(syncItems(rows, [], { additiveOnly: true })).toBe(rows); expect(syncItems(rows, [])).toBe(rows);
});

describe('the rules of the synchronisation, on their own', () => {
  const { syncItems, planSync, itemFromMapping, summary } = require('../configuratore/proposedToOffer');
  const entry = status => prop('P-1', 'Servizio', status, [map(239, 'S', 'REALIZZAZIONE', 'Medio', 2), map(242, 'T', 'REALIZZAZIONE', 'Semplice', 1)]);
  const rowsOf = status => entry(status).mappings.map(mapping => itemFromMapping(entry(status), mapping));

  test('a DISCARDED intervention takes ALL its rows out, even the ones touched by hand (a discarded intervention is not wanted at all)', () => {
    const rows = rowsOf('confermato'); rows[0].unit = 999; rows[0].additionalInfo = 'nota mia';                     // touched by hand
    const after = syncItems(rows, [entry('scartato')]);
    expect(after).toHaveLength(0);
  });
  test('an intervention put BACK IN REVIEW takes out only the rows nobody touched', () => {
    const rows = rowsOf('confermato'); rows[0].unit = 999;
    const after = syncItems(rows, [entry('proposto')]); expect(after).toHaveLength(1); expect(after[0].unit).toBe(999);
  });
  test('a line removed from a CONFIRMED intervention takes its row out, the others stay', () => {
    const rows = rowsOf('confermato'); const fewer = entry('confermato'); fewer.mappings = [fewer.mappings[0]];
    expect(syncItems(rows, [fewer]).map(item => item.id)).toEqual([239]);
  });
  test('loading the solution (additiveOnly) NEVER removes a row, whatever the saved state says', () => {
    const rows = rowsOf('confermato');
    expect(syncItems(rows, [entry('scartato')], { additiveOnly: true })).toBe(rows); expect(syncItems(rows, [entry('proposto')], { additiveOnly: true })).toBe(rows); expect(syncItems(rows, [], { additiveOnly: true })).toBe(rows);
    expect(planSync(rows, [entry('scartato')], { additiveOnly: true }).toRemove).toEqual([]);
  });
  test('rows removed by hand are excluded only while the intervention wants them', () => {
    const lines = rowsOf('confermato').map(item => item.proposedLine);
    expect(planSync([], [entry('confermato')], { exclusions: [lines[1]] }).toAdd).toHaveLength(1);
    expect(planSync([], [entry('proposto')], { exclusions: lines }).exclusions).toEqual([]);                       // not wanted any more: the exclusions are dropped
  });
  test('the rows of other interventions, of the Excel and the ones added by hand are never touched', () => {
    const own = { id: 239, type: 'MODIFICA', complexity: 'Medio', qty: 1, key: 'k1', imported: false, interventionId: '__MANUALE__' };
    const excel = { id: 242, type: 'REALIZZAZIONE', complexity: 'Medio', qty: 1, key: 'detail-1', imported: true, interventionId: 'MNPRES-001' };
    const rows = [own, excel, ...rowsOf('confermato')];
    const after = syncItems(rows, [entry('scartato')]); expect(after).toEqual([own, excel]);
  });
  test('the summary counts what is confirmed, what is in the offer and what was touched by hand', () => {
    const rows = rowsOf('confermato'); rows[0].qty = 5;
    expect(summary(rows, [entry('confermato')])).toEqual({ confirmed: 1, lines: 2, inOffer: 2, handEdited: 1 });
  });
});
