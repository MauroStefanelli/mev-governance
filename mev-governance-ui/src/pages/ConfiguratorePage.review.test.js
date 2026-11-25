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
const importAndGoToOffer = async (rows) => {
  mount();
  const input = await waitFor(() => { const el = document.querySelector('input[type="file"][accept=".xlsx"]'); expect(el).toBeInTheDocument(); return el; });
  await act(async () => { fireEvent.change(input, { target: { files: [await file(rows)] } }); });
  // l'import lancia da solo la verifica: la lasciamo finire, poi si passa al passo 3
  await waitFor(() => expect(gates.length).toBeGreaterThan(0));
  while (gates.length) { const g = gates.shift(); await act(async () => { g.resolve(); }); }
  fireEvent.click(await screen.findByRole('button', { name: /3\. Offerta/ }));
  return screen.findByRole('button', { name: 'Verifica / aggiorna coerenza AI delle righe' });
};
const eightRows = () => [...Array.from({ length: 7 }, (_, i) => detail(239, 1200, 'Medio', 'REALIZZAZIONE')), detail(242, 300, 'Medio', 'REALIZZAZIONE')].map((row, i) => { row[4] = `Attivita numero ${i + 1}`; return row; });

test('the automatic review after the Excel import does NOT open the window', async () => {
  mount();
  const input = await waitFor(() => { const el = document.querySelector('input[type="file"][accept=".xlsx"]'); expect(el).toBeInTheDocument(); return el; });
  await act(async () => { fireEvent.change(input, { target: { files: [await file(eightRows())] } }); });
  await waitFor(() => expect(gates.length).toBeGreaterThan(0));
  expect(screen.queryByRole('dialog')).toBeNull();
  while (gates.length) { const g = gates.shift(); await act(async () => { g.resolve(); }); }
});

test('the button opens the window; it shows the REAL progress batch by batch (5 rows at a time) and then the summary', async () => {
  const button = await importAndGoToOffer(eightRows());
  const rowIds = []; service.reviewOfferDetails.mockClear();
  verdicts = {};
  fireEvent.click(button);
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('L’AI sta ragionando sulle righe');
  expect(within(dialog).getByText('0 di 8 righe verificate (0%)')).toBeInTheDocument();
  expect(within(dialog).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(button).toBeDisabled();
  await waitFor(() => expect(gates).toHaveLength(1));
  expect(gates[0].rows).toHaveLength(5);
  gates[0].rows.forEach(r => rowIds.push(r.rowId));
  verdicts = { [gates[0].rows[1].rowId]: { status: 'non_coerente', reason: 'La complessità Medio non è coerente con il criterio «Più di 30 tabelle».', suggestion: 'Usare Complesso' }, [gates[0].rows[3].rowId]: { status: 'da_verificare', reason: 'Mancano i requisiti' } };
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('5 di 8 righe verificate (63%)'));
  expect(within(screen.getByRole('dialog')).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
  expect(screen.getByRole('dialog')).toHaveTextContent('Cosa sta emergendo');
  expect(screen.getByRole('dialog')).toHaveTextContent('La complessità Medio non è coerente con il criterio «Più di 30 tabelle».');
  expect(screen.getByRole('dialog')).toHaveTextContent('Cosa fare: Usare Complesso');
  expect(screen.getByRole('dialog')).not.toHaveTextContent('Verifica completata');
  await waitFor(() => expect(gates).toHaveLength(1));
  expect(gates[0].rows).toHaveLength(3);
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Verifica completata'));
  const done = screen.getByRole('dialog');
  expect(done).toHaveTextContent('8 di 8 righe verificate');
  expect(done).toHaveTextContent('Ci sono righe con una possibile incoerenza.');
  expect(within(done).getByRole('img', { name: 'Avanzamento della verifica: 100%' })).toBeInTheDocument();
  expect(done).toHaveTextContent('gpt-test');
  fireEvent.click(within(done).getByRole('button', { name: 'Chiudi' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Verifica / aggiorna coerenza AI delle righe' })).toBeEnabled();
  expect(screen.getAllByText('Possibile incoerenza').length).toBeGreaterThan(0);      // il giudizio resta nella tabella, come prima
});

test('Stop ends the work, keeps what was verified and the page stays usable', async () => {
  const button = await importAndGoToOffer(eightRows());
  fireEvent.click(button);
  await screen.findByRole('dialog'); await waitFor(() => expect(gates).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Interrompi la verifica' }));
  const stopped = await screen.findByRole('alertdialog');
  expect(stopped).toHaveTextContent('Verifica interrotta'); expect(stopped).toHaveTextContent('Hai interrotto la verifica.');
  await act(async () => { gates.shift().resolve(); });      // la risposta in volo arriva dopo: non deve riaprire ne' cambiare nulla
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Verifica interrotta');
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Verifica / aggiorna coerenza AI delle righe' })).toBeEnabled();
});

test('a failure of the AI keeps the window open with the reason and what had been verified', async () => {
  const button = await importAndGoToOffer(eightRows());
  fireEvent.click(button);
  await screen.findByRole('dialog'); await waitFor(() => expect(gates).toHaveLength(1));
  await act(async () => { gates.shift().reject(new Error('Verifica AI non riuscita. Controlla la configurazione AI personale e riprova')); });
  const failed = await screen.findByRole('alertdialog');
  expect(failed).toHaveTextContent('Verifica interrotta'); expect(failed).toHaveTextContent('Verifica AI non riuscita. Controlla la configurazione AI personale e riprova');
  expect(failed).toHaveTextContent('Le righe già verificate sono state conservate');
  fireEvent.click(within(failed).getByRole('button', { name: 'Chiudi' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('when every row is coherent it says so, and only then', async () => {
  const button = await importAndGoToOffer(eightRows());
  fireEvent.click(button); await waitFor(() => expect(gates).toHaveLength(1));
  await act(async () => { gates.shift().resolve(); }); await waitFor(() => expect(gates).toHaveLength(1)); await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Verifica completata'));
  expect(screen.getByRole('dialog')).toHaveTextContent('Tutte le righe verificate sono coerenti con il catalogo.');
  expect(screen.getByRole('dialog')).toHaveTextContent('Nessuna riga richiede un intervento');
});
