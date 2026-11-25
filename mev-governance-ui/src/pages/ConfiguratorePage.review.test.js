import React from 'react';
import JSZip from 'jszip';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfiguratorePage from './ConfiguratorePage';
import * as service from '../services/mevService';
import { worksheetXml } from '../configuratore/configuratoreCore';

jest.mock('../services/mevService', () => {
  const answers = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getConfiguratoreContracts: [], getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getTowImpatto: null, getReleaseSchedules: [] };
  const cache = {};
  return new Proxy({}, { get: (_, name) => {
    if (name === '__esModule') return true;
    if (!cache[name]) cache[name] = jest.fn(async () => (name in answers ? answers[name] : {}));
    return cache[name];
  } });
});
jest.mock('../configuratore/InitiativeConversation', () => () => null);

const catalog = [{ id: 239, nome: 'Servizio/API/Microservizio', ambito: 'Backend', descrizione: 'Un servizio', prezzi: { REALIZZAZIONE: { Semplice: 900, Medio: 1200, Complesso: 4050 }, MODIFICA: { Medio: 360, Semplice: 120, Complesso: 600 } } },
  { id: 242, nome: 'Stored procedure', ambito: 'Database', descrizione: 'Una stored', prezzi: { REALIZZAZIONE: { Semplice: 120, Medio: 300, Complesso: 600 } } }];
const contracts = [{ contractId: 'poste-tet-2025', name: 'Poste TeT', lots: [{ lotId: '2', name: 'Lotto 2', active: true, catalog, towPrices: {}, codiceContratto: 'C1' }] }];
const detail = (id, price, complexity, type, group = 'MNPRES-001') => [group, 'componente', 'Java', 'Business Logic', `Attivita ${group} ${id} ${complexity}`, id, 'Backend', catalog.find(c => c.id === id).nome, type, complexity, 1, price, price];
async function file(details) {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="145480" r:id="r1"/><sheet name="DettaglioInterventi" r:id="r2"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', worksheetXml([['Interventi\nCodice: 145480\nTitolo: Iniziativa pilota'], ['ID_INTERVENTO', 'Titolo', 'Descrizione', 'Attività', 'Sistema', 'Copertura Requisiti', '', '', 'Quantità TOW RTI'], ['', '', '', '', '', '', '', '', 'TOW 02.1', 'TOW 02.2', 'TOW 02.3', 'TOW 02.4', 'TOW 02.5'],
    ['MNPRES-001', 'Intervento uno', '', 'Attività uno', 'NPSO', 'REQ-1', '', '', .5, 0, .5, .6, 100], ['', '', '', '', '', '', '', 'TOTALE TOW']]));
  zip.file('xl/worksheets/sheet2.xml', worksheetXml([['ID Intervento', 'Componente-applicativo', 'Tecnologia', 'Unità', 'Descrizione Intervento', 'ID di catalogo', 'Ambito driver', 'Nome Driver', 'Tipo Intervento2', 'Complessità', 'Quantità', 'Prezzo Unitario', 'Prezzo Totale'], ...details]));
  const data = await zip.generateAsync({ type: 'arraybuffer' });
  return { name: 'pilota.xlsx', arrayBuffer: async () => data };
}

// Una risposta dell'AI per ogni riga ricevuta, scelta dal test per rowId; il server «risponde» solo quando il test lo decide, cosi' si vede la finestra mentre lavora.
let gates; let verdicts;
const verdict = row => verdicts[row.rowId] || { status: 'coerente', reason: 'Coerente con il criterio.' };
beforeEach(() => {
  localStorage.clear(); window.HTMLElement.prototype.scrollIntoView = jest.fn(); gates = []; verdicts = {};
  const defaults = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getReleaseSchedules: [] };
  Object.keys(defaults).forEach(name => service[name].mockReset().mockImplementation(async () => defaults[name]));
  service.rationaleRequest.mockReset().mockImplementation(async path => (String(path).startsWith('related') ? [] : { messages: [], hasMore: false, entries: [] }));
  service.libraryRequest.mockReset().mockImplementation(async () => ({ documents: [], folders: [], historical: 0, pendingIndex: 0, limit: 300, ocrAvailable: true }));
  service.historyImportRequest.mockReset().mockImplementation(async path => (String(path).startsWith('pending') ? { entries: [], hasMore: false, total: 0, bySystem: [] } : { filesRead: 0, withProposal: 0 }));
  service.ledgerRequest.mockReset().mockImplementation(async path => (/^\d+$/.test(String(path)) ? {} : { initiatives: [] }));
  service.developmentRequest.mockReset().mockImplementation(async path => (path === 'presence' ? { users: [], messages: [], lastWorked: null } : String(path).startsWith('chat') ? { messages: [], hasMore: false } : {}));
  service.getConfiguratoreContracts.mockReset().mockResolvedValue(contracts);
  service.getTowImpatto.mockReset().mockResolvedValue(null);
  service.reviewOfferDetails.mockReset().mockImplementation(context => new Promise((resolve, reject) => {
    gates.push({ resolve: () => resolve({ analysis: { reviews: context.rows.map(row => ({ rowId: row.rowId, ...verdict(row) })) }, model: 'gpt-test', reviewedAt: '2026-11-21T10:00:00Z' }), reject, rows: context.rows });
  }));
});
const mount = () => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Developer" roles={['Developer']} />);
// Importa l'Excel e porta al passo 3. La verifica che parte da sola dopo l'import viene fatta rispondere (`autoFinish`) oppure lasciata appesa
// e poi interrotta, cosi' ogni test parte dalla situazione che vuole provare.
const importAndGoToOffer = async (rows, { autoFinish = true } = {}) => {
  mount();
  const input = await waitFor(() => { const el = document.querySelector('input[type="file"][accept=".xlsx"]'); expect(el).toBeInTheDocument(); return el; });
  await act(async () => { fireEvent.change(input, { target: { files: [await file(rows)] } }); });
  await waitFor(() => expect(gates.length).toBeGreaterThan(0));
  if (autoFinish) { while (gates.length) { const g = gates.shift(); await act(async () => { g.resolve(); }); } }
  fireEvent.click(await screen.findByRole('button', { name: /3\. Offerta/ }));
  return screen.findByRole('button', { name: /Verifica \/ aggiorna coerenza AI delle righe|Verifica AI in corso/ });
};
// «Verifica tutto da capo» dalla finestra: parte dalla prima riga, come la prima volta.
const startFull = async () => {
  const button = await importAndGoToOffer(eightRows());
  gates.length = 0; service.reviewOfferDetails.mockClear();
  fireEvent.click(button);
  await screen.findByRole('dialog');
  expect(screen.getByRole('dialog')).toHaveTextContent('Verifica completata');       // le 8 righe sono gia' verificate: non c'e' nulla da rifare
  fireEvent.click(screen.getByRole('button', { name: 'Verifica tutto da capo' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('L’AI sta ragionando sulle righe'));
};
const eightRows = () => [...Array.from({ length: 7 }, (_, i) => detail(239, 1200, 'Medio', 'REALIZZAZIONE')), detail(242, 300, 'Medio', 'REALIZZAZIONE')].map((row, i) => { row[4] = `Attivita numero ${i + 1}`; return row; });

const rowsN = n => Array.from({ length: n }, (_, i) => { const row = detail(i % 2 ? 242 : 239, 1200, 'Medio', 'REALIZZAZIONE'); row[4] = `Attivita numero ${i + 1}`; return row; });
const dlg = () => screen.getByRole('dialog');

test('the automatic review after the Excel import does NOT open the window', async () => {
  mount();
  const input = await waitFor(() => { const el = document.querySelector('input[type="file"][accept=".xlsx"]'); expect(el).toBeInTheDocument(); return el; });
  await act(async () => { fireEvent.change(input, { target: { files: [await file(eightRows())] } }); });
  await waitFor(() => expect(gates.length).toBeGreaterThan(0));
  expect(screen.queryByRole('dialog')).toBeNull();
  while (gates.length) { const g = gates.shift(); await act(async () => { g.resolve(); }); }
});

test('when every row is already verified the button does NOT call the AI again: it says so', async () => {
  const button = await importAndGoToOffer(eightRows());
  service.reviewOfferDetails.mockClear(); gates.length = 0;
  fireEvent.click(button);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Verifica completata');
  expect(dlg()).toHaveTextContent('8 di 8 righe verificate');
  expect(service.reviewOfferDetails).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Verifica tutto da capo' })).toBeInTheDocument();
});

test('the window shows the REAL progress batch by batch (5 rows at a time) and then the summary', async () => {
  await startFull();
  expect(within(dlg()).getByText('0 di 8 righe verificate (0%)')).toBeInTheDocument();
  expect(within(dlg()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await waitFor(() => expect(gates).toHaveLength(1));
  expect(gates[0].rows).toHaveLength(5);
  verdicts = { [gates[0].rows[1].rowId]: { status: 'non_coerente', reason: 'La complessità Medio non è coerente con il criterio «Più di 30 tabelle».', suggestion: 'Usare Complesso' }, [gates[0].rows[3].rowId]: { status: 'da_verificare', reason: 'Mancano i requisiti' } };
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('5 di 8 righe verificate (63%)'));
  expect(within(dlg()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
  expect(dlg()).toHaveTextContent('Cosa sta emergendo');
  expect(dlg()).toHaveTextContent('La complessità Medio non è coerente con il criterio «Più di 30 tabelle».');
  expect(dlg()).toHaveTextContent('Cosa fare: Usare Complesso');
  await waitFor(() => expect(gates).toHaveLength(1));
  expect(gates[0].rows).toHaveLength(3);
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
  expect(dlg()).toHaveTextContent('8 di 8 righe verificate');
  expect(dlg()).toHaveTextContent('Ci sono righe con una possibile incoerenza.');
  expect(dlg()).toHaveTextContent('gpt-test');
  fireEvent.click(within(dlg()).getByRole('button', { name: 'Chiudi' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getAllByText('Possibile incoerenza').length).toBeGreaterThan(0);
});

test('Stop ends the work, keeps what was verified, says it was the user, and the window offers to resume', async () => {
  await startFull();
  await waitFor(() => expect(gates).toHaveLength(1));
  await act(async () => { gates.shift().resolve(); });                       // il primo gruppo (5 righe) e' verificato
  await waitFor(() => expect(dlg()).toHaveTextContent('5 di 8 righe verificate'));
  await waitFor(() => expect(gates).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Interrompi la verifica' }));
  const stopped = await screen.findByRole('alertdialog');
  expect(stopped).toHaveTextContent('Verifica interrotta'); expect(stopped).toHaveTextContent('Hai premuto «Interrompi la verifica».');
  expect(stopped).toHaveTextContent('5 di 8 righe sono già verificate'); expect(stopped).toHaveTextContent('continua dalle altre 3');
  await act(async () => { gates.shift().resolve(); });                       // la risposta in volo arriva dopo: non cambia nulla
  expect(screen.getByRole('alertdialog')).toHaveTextContent('5 di 8 righe sono già verificate');
  expect(within(stopped).getByRole('button', { name: 'Riprendi dalle righe non verificate' })).toBeInTheDocument();
});

test('RESUMING after a stop does NOT start from the beginning: it asks the AI only for the rows not verified yet', async () => {
  await startFull();
  await waitFor(() => expect(gates).toHaveLength(1));
  const firstBatch = gates[0].rows.map(r => r.rowId);
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(gates).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Interrompi la verifica' }));
  await screen.findByRole('alertdialog'); gates.length = 0; service.reviewOfferDetails.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Riprendi dalle righe non verificate' }));
  await waitFor(() => expect(dlg()).toHaveTextContent('L’AI sta ragionando sulle righe'));
  expect(dlg()).toHaveTextContent('Riprende da dove si era fermata: 5 righe già verificate non vengono rifatte.');
  expect(within(dlg()).getByText('5 di 8 righe verificate (63%)')).toBeInTheDocument();      // l'avanzamento riparte dal punto raggiunto, non da 0
  await waitFor(() => expect(gates).toHaveLength(1));
  const asked = gates[0].rows.map(r => r.rowId);
  expect(asked).toHaveLength(3);
  expect(asked.some(id => firstBatch.includes(id))).toBe(false);               // nessuna delle 5 righe gia' fatte e' stata rimandata all'AI
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
  expect(dlg()).toHaveTextContent('8 di 8 righe verificate');
  expect(service.reviewOfferDetails).toHaveBeenCalledTimes(1);
});

test('«Verifica tutto da capo» asks the AI for ALL the rows again', async () => {
  await startFull();
  await waitFor(() => expect(gates).toHaveLength(1));
  expect(gates[0].rows).toHaveLength(5);
  await act(async () => { gates.shift().resolve(); }); await waitFor(() => expect(gates).toHaveLength(1)); expect(gates[0].rows).toHaveLength(3);
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
});

test('a group that fails is tried again, and then row by row: one bad row does not lose the others', async () => {
  await startFull();
  await waitFor(() => expect(gates).toHaveLength(1));
  const badRow = gates[0].rows[2].rowId;
  await act(async () => { gates.shift().reject(new Error('Risposta AI incompleta: mancano le verifiche per riga.')); });      // 1° tentativo del gruppo
  await waitFor(() => expect(gates).toHaveLength(1)); expect(gates[0].rows).toHaveLength(5);                                       // 2° tentativo: stesso gruppo
  await act(async () => { gates.shift().reject(new Error('Risposta AI incompleta: mancano le verifiche per riga.')); });
  for (let i = 0; i < 5; i += 1) {                                                                                                    // poi una riga alla volta
    await waitFor(() => expect(gates).toHaveLength(1)); expect(gates[0].rows).toHaveLength(1);
    const isBad = gates[0].rows[0].rowId === badRow;
    await act(async () => { const g = gates.shift(); if (isBad) g.reject(new Error('Risposta AI incompleta: mancano le verifiche per riga.')); else g.resolve(); });
  }
  await waitFor(() => expect(gates).toHaveLength(1)); expect(gates[0].rows).toHaveLength(3);
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
  expect(dlg()).toHaveTextContent('7 di 8 righe verificate · 1 non verificate');      // 7 verificate davvero, 1 no: non si dice «8 di 8»
  expect(dlg()).not.toHaveTextContent('8 di 8 righe verificate');
  expect(screen.getByRole('alert')).toHaveTextContent('1 riga non è stata verificata dopo un nuovo tentativo');
  expect(within(dlg()).getByRole('button', { name: 'Riprendi dalle righe non verificate' })).toBeInTheDocument();
});

test('a definitive error (AI key) stops at once: it does not waste time trying the other groups, and says what to do', async () => {
  await startFull();
  await waitFor(() => expect(gates).toHaveLength(1));
  await act(async () => { gates.shift().reject(new Error('Chiave AI non configurata o non valida. Vai su Profilo → API Key AI.')); });
  const failed = await screen.findByRole('alertdialog');
  expect(failed).toHaveTextContent('Verifica interrotta');
  expect(failed).toHaveTextContent('L’AI ha rifiutato l’accesso');
  expect(failed).toHaveTextContent('API Key AI');
  expect(failed).toHaveTextContent('Dettaglio tecnico: Chiave AI non configurata o non valida');
  expect(gates).toHaveLength(0);                                                    // nessun secondo tentativo, nessuna riga singola
  expect(service.reviewOfferDetails).toHaveBeenCalledTimes(1);
});

test('when the AI fails for every row the window stops with the reason (it does not claim completion)', async () => {
  await startFull();
  const fail = () => act(async () => { gates.shift().reject(new Error('Errore HTTP 502')); });
  await waitFor(() => expect(gates).toHaveLength(1)); await fail(); await waitFor(() => expect(gates).toHaveLength(1)); await fail();      // gruppo da 5, due tentativi
  for (let i = 0; i < 5; i += 1) { await waitFor(() => expect(gates).toHaveLength(1)); await fail(); }                                          // le 5 righe singole
  await waitFor(() => expect(gates).toHaveLength(1)); await fail(); await waitFor(() => expect(gates).toHaveLength(1)); await fail();      // gruppo da 3, due tentativi
  for (let i = 0; i < 3; i += 1) { await waitFor(() => expect(gates).toHaveLength(1)); await fail(); }
  const stopped = await screen.findByRole('alertdialog');
  expect(stopped).toHaveTextContent('Verifica interrotta'); expect(stopped).toHaveTextContent('non ha risposto in tempo');
});

test('RESUMING uses the judgements saved by the LAST run, not the ones the page had when the button was drawn (stale closure)', async () => {
  await startFull();
  await waitFor(() => expect(gates).toHaveLength(1));
  await act(async () => { gates.shift().resolve(); });                       // 5 righe verificate in questa esecuzione
  await waitFor(() => expect(dlg()).toHaveTextContent('5 di 8 righe verificate'));
  await waitFor(() => expect(gates).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Interrompi la verifica' }));
  const stopped = await screen.findByRole('alertdialog');
  // «Riprendi» e' la funzione disegnata quando la finestra e' apparsa (0 righe verificate): deve comunque vedere le 5 appena fatte
  gates.length = 0; service.reviewOfferDetails.mockClear();
  fireEvent.click(within(stopped).getByRole('button', { name: 'Riprendi dalle righe non verificate' }));
  await waitFor(() => expect(gates).toHaveLength(1));
  expect(gates[0].rows).toHaveLength(3);                                      // non 8: le 5 appena verificate non vengono rifatte
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
  expect(service.reviewOfferDetails).toHaveBeenCalledTimes(1);
});
