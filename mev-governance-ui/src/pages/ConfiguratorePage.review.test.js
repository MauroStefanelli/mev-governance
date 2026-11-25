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
// Importa l'Excel e porta al passo 3. La verifica che parte da sola dopo l'import viene fatta rispondere (`autoFinish`) oppure lasciata appesa,
// cosi' ogni test parte dalla situazione che vuole provare.
const importAndGoToOffer = async (rows, { autoFinish = true } = {}) => {
  mount();
  const input = await waitFor(() => { const el = document.querySelector('input[type="file"][accept=".xlsx"]'); expect(el).toBeInTheDocument(); return el; });
  await act(async () => { fireEvent.change(input, { target: { files: [await file(rows)] } }); });
  await waitFor(() => expect(gates.length).toBeGreaterThan(0));
  if (autoFinish) { while (gates.length) { const g = gates.shift(); await act(async () => { g.resolve(); }); } }
  fireEvent.click(await screen.findByRole('button', { name: /3\. Offerta/ }));
  return screen.findByRole('region', { name: 'Verifica AI delle righe' });
};
const card = () => screen.getByRole('region', { name: 'Verifica AI delle righe' });
const eightRows = () => [...Array.from({ length: 7 }, () => detail(239, 1200, 'Medio', 'REALIZZAZIONE')), detail(242, 300, 'Medio', 'REALIZZAZIONE')].map((row, i) => { row[4] = `Attivita numero ${i + 1}`; return row; });
const dlg = () => screen.getByRole('dialog');
const dialogOrAlert = () => document.querySelector('[role=dialog],[role=alertdialog]');
// «Rifai la verifica» dalla scheda: parte dalla prima riga, come la prima volta.
const startFull = async () => {
  await importAndGoToOffer(eightRows());
  gates.length = 0; service.reviewOfferDetails.mockClear();
  fireEvent.click(within(card()).getByRole('button', { name: 'Rifai la verifica' }));
  await waitFor(() => expect(dialogOrAlert()).toHaveTextContent('L’AI sta ragionando sulle righe'));
};
const stopAfterFirstBatch = async () => {
  await startFull();
  await waitFor(() => expect(gates).toHaveLength(1));
  await act(async () => { gates.shift().resolve(); });                                  // 5 righe verificate
  await waitFor(() => expect(dialogOrAlert()).toHaveTextContent('5 di 8 righe verificate'));
  await waitFor(() => expect(gates).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Interrompi la verifica' }));
  return screen.findByRole('alertdialog');
};

test('the automatic review after the Excel import does NOT open the window', async () => {
  mount();
  const input = await waitFor(() => { const el = document.querySelector('input[type="file"][accept=".xlsx"]'); expect(el).toBeInTheDocument(); return el; });
  await act(async () => { fireEvent.change(input, { target: { files: [await file(eightRows())] } }); });
  await waitFor(() => expect(gates.length).toBeGreaterThan(0));
  expect(screen.queryByRole('dialog')).toBeNull();
  while (gates.length) { const g = gates.shift(); await act(async () => { g.resolve(); }); }
});

describe('the card of the verification tells the truth about the rows', () => {
  test('all rows verified: it says so, 100%, and the button is «Rifai la verifica» (no AI call by itself)', async () => {
    await importAndGoToOffer(eightRows());
    expect(card()).toHaveTextContent('Tutte le 8 righe sono verificate');
    expect(within(card()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(within(card()).getByRole('button', { name: 'Rifai la verifica' })).toBeInTheDocument();
    expect(within(card()).queryByRole('button', { name: /Riprendi/ })).toBeNull();
  });
  test('nothing verified yet (the automatic review after the import did not answer): «Verifica con l’AI», «8 righe da verificare», 0%', async () => {
    await importAndGoToOffer(eightRows(), { autoFinish: false });
    fireEvent.click(screen.getByRole('button', { name: /Interrompi|Verifica in corso/ }));
    expect(card()).toBeInTheDocument();
  });
  test('after a stop it says «5 di 8 righe verificate» and the button becomes «Riprendi la verifica (3 righe)»', async () => {
    const stopped = await stopAfterFirstBatch();
    fireEvent.click(within(stopped).getByRole('button', { name: 'Chiudi' }));
    expect(card()).toHaveTextContent('5 di 8 righe verificate');
    expect(card()).toHaveTextContent('Mancano 3');
    expect(within(card()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
    expect(within(card()).getByRole('button', { name: 'Riprendi la verifica (3 righe)' })).toBeInTheDocument();
    expect(within(card()).getByRole('button', { name: 'Verifica tutto da capo' })).toBeInTheDocument();
    expect(card()).toHaveTextContent('Le 5 già verificate non vengono rifatte.');
  });
});

describe('the window never says «completed» or 100% when rows are missing', () => {
  test('after a stop: title «Verifica interrotta», the real percentage (63%), and «Riprendi» WITH the number of missing rows', async () => {
    const stopped = await stopAfterFirstBatch();
    expect(stopped).toHaveTextContent('Verifica interrotta');
    expect(stopped).not.toHaveTextContent('Verifica completata');
    expect(within(stopped).getByRole('img', { name: 'Avanzamento della verifica: 63%' })).toBeInTheDocument();
    expect(stopped).toHaveTextContent('5 di 8 righe verificate (63%) · 3 righe ancora da verificare');
    expect(stopped).toHaveTextContent('Hai premuto «Interrompi la verifica».');
    expect(stopped).toHaveTextContent('5 di 8 righe sono già verificate'); expect(stopped).toHaveTextContent('continua dalle altre 3');
    expect(within(stopped).getByRole('button', { name: 'Riprendi: verifica le 3 righe mancanti' })).toBeInTheDocument();
    expect(within(stopped).getByRole('button', { name: 'Verifica tutto da capo' })).toBeInTheDocument();
  });
  test('a late answer that arrives AFTER the stop does not turn the window into «completed»', async () => {
    const stopped = await stopAfterFirstBatch();
    await act(async () => { gates.shift()?.resolve(); });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Verifica interrotta');
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('Verifica completata');
    expect(within(stopped).queryByRole('img', { name: 'Avanzamento della verifica: 100%' })).toBeNull();
  });
});

test('«Rifai la verifica» shows the REAL progress batch by batch (5 rows at a time) and then the summary', async () => {
  await startFull();
  expect(within(dlg()).getByText('0 di 8 righe verificate (0%)')).toBeInTheDocument();
  await waitFor(() => expect(gates).toHaveLength(1));
  expect(gates[0].rows).toHaveLength(5);
  verdicts = { [gates[0].rows[1].rowId]: { status: 'non_coerente', reason: 'La complessità Medio non è coerente con il criterio «Più di 30 tabelle».', suggestion: 'Usare Complesso' }, [gates[0].rows[3].rowId]: { status: 'da_verificare', reason: 'Mancano i requisiti' } };
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('5 di 8 righe verificate (63%)'));
  expect(within(dlg()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
  expect(dlg()).toHaveTextContent('Cosa sta emergendo');
  expect(dlg()).toHaveTextContent('Cosa fare: Usare Complesso');
  await waitFor(() => expect(gates).toHaveLength(1)); expect(gates[0].rows).toHaveLength(3);
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
  expect(dlg()).toHaveTextContent('8 di 8 righe verificate (100%)');
  expect(within(dlg()).getByRole('img', { name: 'Avanzamento della verifica: 100%' })).toBeInTheDocument();
  expect(dlg()).toHaveTextContent('Ci sono righe con una possibile incoerenza.');
  expect(within(dlg()).queryByRole('button', { name: /Riprendi/ })).toBeNull();           // tutte verificate: niente da riprendere
  fireEvent.click(within(dlg()).getByRole('button', { name: 'Chiudi' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(card()).toHaveTextContent('Tutte le 8 righe sono verificate');
});

test('RESUMING after a stop does NOT start from the beginning: it asks the AI only for the 3 rows not verified yet', async () => {
  const stopped = await stopAfterFirstBatch();
  gates.length = 0; service.reviewOfferDetails.mockClear();
  fireEvent.click(within(stopped).getByRole('button', { name: 'Riprendi: verifica le 3 righe mancanti' }));
  await waitFor(() => expect(dialogOrAlert()).toHaveTextContent('L’AI sta ragionando sulle righe'));
  expect(dlg()).toHaveTextContent('Riprende da dove si era fermata: 5 righe già verificate non vengono rifatte.');
  expect(within(dlg()).getByText('5 di 8 righe verificate (63%)')).toBeInTheDocument();
  await waitFor(() => expect(gates).toHaveLength(1));
  expect(gates[0].rows).toHaveLength(3);
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
  expect(dlg()).toHaveTextContent('8 di 8 righe verificate (100%)');
  expect(service.reviewOfferDetails).toHaveBeenCalledTimes(1);
});

test('the main button of the card, after a stop, resumes too (same as «Riprendi» in the window)', async () => {
  const stopped = await stopAfterFirstBatch();
  fireEvent.click(within(stopped).getByRole('button', { name: 'Chiudi' }));
  gates.length = 0; service.reviewOfferDetails.mockClear();
  fireEvent.click(within(card()).getByRole('button', { name: 'Riprendi la verifica (3 righe)' }));
  await waitFor(() => expect(gates).toHaveLength(1));
  expect(gates[0].rows).toHaveLength(3);
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
});

test('a group that fails is tried again, and then row by row; the window says it is INCOMPLETE and offers to retry only the missing row', async () => {
  await startFull();
  await waitFor(() => expect(gates).toHaveLength(1));
  const badRow = gates[0].rows[2].rowId;
  const err = () => new Error('Risposta AI incompleta: mancano le verifiche per riga.');
  await act(async () => { gates.shift().reject(err()); });
  await waitFor(() => expect(gates).toHaveLength(1)); expect(gates[0].rows).toHaveLength(5);
  await act(async () => { gates.shift().reject(err()); });
  for (let i = 0; i < 5; i += 1) {
    await waitFor(() => expect(gates).toHaveLength(1)); expect(gates[0].rows).toHaveLength(1);
    const isBad = gates[0].rows[0].rowId === badRow;
    await act(async () => { const g = gates.shift(); if (isBad) g.reject(err()); else g.resolve(); });
  }
  await waitFor(() => expect(gates).toHaveLength(1)); expect(gates[0].rows).toHaveLength(3);
  await act(async () => { gates.shift().resolve(); });
  await waitFor(() => expect(dialogOrAlert()).toHaveTextContent('Verifica incompleta'));
  const d = dialogOrAlert();
  expect(d).not.toHaveTextContent('Verifica completata');
  expect(d).toHaveTextContent('7 di 8 righe verificate (88%) · 1 riga ancora da verificare');
  expect(within(d).queryByRole('img', { name: 'Avanzamento della verifica: 100%' })).toBeNull();
  expect(d).toHaveTextContent('La verifica non è completa: 1 riga non è stata verificata');
  expect(within(d).getByRole('button', { name: 'Riprendi: verifica le 1 riga mancante' })).toBeInTheDocument();
});

test('a definitive error (AI key) stops at once, explains it, and still offers to resume once fixed', async () => {
  await startFull();
  await waitFor(() => expect(gates).toHaveLength(1));
  await act(async () => { gates.shift().reject(new Error('Chiave AI non configurata o non valida. Vai su Profilo → API Key AI.')); });
  const failed = await screen.findByRole('alertdialog');
  expect(failed).toHaveTextContent('Verifica interrotta');
  expect(failed).toHaveTextContent('L’AI ha rifiutato l’accesso'); expect(failed).toHaveTextContent('Dettaglio tecnico: Chiave AI non configurata o non valida');
  expect(failed).not.toHaveTextContent('Verifica completata');
  expect(within(failed).getByRole('button', { name: 'Riprendi: verifica le 8 righe mancanti' })).toBeInTheDocument();
  expect(gates).toHaveLength(0);
  expect(service.reviewOfferDetails).toHaveBeenCalledTimes(1);
});

test('when the AI fails for every row the window stops with the reason (it does not claim completion)', async () => {
  await startFull();
  const fail = () => act(async () => { gates.shift().reject(new Error('Errore HTTP 502')); });
  await waitFor(() => expect(gates).toHaveLength(1)); await fail(); await waitFor(() => expect(gates).toHaveLength(1)); await fail();
  for (let i = 0; i < 5; i += 1) { await waitFor(() => expect(gates).toHaveLength(1)); await fail(); }
  await waitFor(() => expect(gates).toHaveLength(1)); await fail(); await waitFor(() => expect(gates).toHaveLength(1)); await fail();
  for (let i = 0; i < 3; i += 1) { await waitFor(() => expect(gates).toHaveLength(1)); await fail(); }
  const stopped = await screen.findByRole('alertdialog');
  expect(stopped).toHaveTextContent('Verifica interrotta'); expect(stopped).toHaveTextContent('non ha risposto in tempo');
  expect(stopped).not.toHaveTextContent('Verifica completata');
  expect(stopped).toHaveTextContent('0 di 8 righe verificate (0%)');
});


// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// I razionali dalla colonna «Verifica AI attività / catalogo», e la verifica di UN intervento.
// Due interventi (A: 5 righe, B: 3 righe) per vedere che «rifai questo intervento» non tocca l'altro.
const twoInterventions = () => {
  const rowsA = Array.from({ length: 5 }, (_, i) => { const r = detail(239, 1200, 'Medio', 'REALIZZAZIONE', 'MNPRES-001'); r[4] = `Attivita A${i + 1}`; return r; });
  const rowsB = Array.from({ length: 3 }, (_, i) => { const r = detail(242, 300, 'Medio', 'REALIZZAZIONE', 'MNPRES-002'); r[4] = `Attivita B${i + 1}`; return r; });
  return [...rowsA, ...rowsB];
};
const twoFile = async () => {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="145480" r:id="r1"/><sheet name="DettaglioInterventi" r:id="r2"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', worksheetXml([['Interventi\nCodice: 145480\nTitolo: Iniziativa pilota'], ['ID_INTERVENTO', 'Titolo', 'Descrizione', 'Attività', 'Sistema', 'Copertura Requisiti', '', '', 'Quantità TOW RTI'], ['', '', '', '', '', '', '', '', 'TOW 02.1', 'TOW 02.2', 'TOW 02.3', 'TOW 02.4', 'TOW 02.5'],
    ['MNPRES-001', 'Intervento A', '', 'Attività A', 'NPSO', 'REQ-1', '', '', .5, 0, .5, .6, 100], ['MNPRES-002', 'Intervento B', '', 'Attività B', 'NPSO', 'REQ-2', '', '', .5, 0, .5, .6, 100], ['', '', '', '', '', '', '', 'TOTALE TOW']]));
  zip.file('xl/worksheets/sheet2.xml', worksheetXml([['ID Intervento', 'Componente-applicativo', 'Tecnologia', 'Unità', 'Descrizione Intervento', 'ID di catalogo', 'Ambito driver', 'Nome Driver', 'Tipo Intervento2', 'Complessità', 'Quantità', 'Prezzo Unitario', 'Prezzo Totale'], ...twoInterventions()]));
  const data = await zip.generateAsync({ type: 'arraybuffer' });
  return { name: 'pilota.xlsx', arrayBuffer: async () => data };
};
let saved;
const withRationaleServer = () => {
  saved = [];
  service.rationaleRequest.mockReset().mockImplementation(async (path, body) => {
    const p = String(path);
    if (p.startsWith('related')) return [];
    if (p === 'entries') { const e = { id: 100 + saved.length, goto: body.goto, kind: body.kind, text: body.text, interventionId: body.interventionId, status: 'confermata', shared: false }; saved.push(e); return e; }
    const m = /^entries\/(\d+)\/(share|unshare)$/.exec(p);
    if (m) { const e = saved.find(x => x.id === Number(m[1])); e.shared = m[2] === 'share'; return { ...e }; }
    return { messages: [], hasMore: false, entries: [] };
  });
};
const goToOfferWithTwo = async () => {
  withRationaleServer();
  mount();
  const input = await waitFor(() => { const el = document.querySelector('input[type="file"][accept=".xlsx"]'); expect(el).toBeInTheDocument(); return el; });
  await act(async () => { fireEvent.change(input, { target: { files: [await twoFile()] } }); });
  await waitFor(() => expect(gates.length).toBeGreaterThan(0));
  while (gates.length) { await act(async () => { gates.shift().resolve(); }); }
  fireEvent.click(await screen.findByRole('button', { name: /3\. Offerta/ }));
  await screen.findByRole('region', { name: 'Verifica AI delle righe' });
  gates.length = 0; service.reviewOfferDetails.mockClear();
};
const openAllGroups = () => document.querySelectorAll('details.offer-activity-group').forEach(d => { d.open = true; });
const addRationaleOnFirstRow = async (text, interventionLabel) => {
  openAllGroups();
  const forms = await screen.findAllByRole('button', { name: '+ Aggiungi un razionale' });
  fireEvent.click(forms[0]);
  fireEvent.change(screen.getByLabelText('Ragionamento'), { target: { value: text } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salva il razionale' })); });
};

describe('rationales from the column «Verifica AI attività / catalogo»', () => {
  test('every verified row shows the rationale area and the button to redo ITS intervention', async () => {
    await goToOfferWithTwo();
    openAllGroups();
    expect((await screen.findAllByText('Razionali che l’AI legge per questa riga')).length).toBe(8);
    expect(screen.getAllByRole('button', { name: 'Rifai la verifica dell’intervento MNPRES-001' }).length).toBe(5);
    expect(screen.getAllByRole('button', { name: 'Rifai la verifica dell’intervento MNPRES-002' }).length).toBe(3);
  });

  test('writing a rationale saves it (confirmed) on the server for the right intervention, and the rows of THAT intervention become «to update», the others do not', async () => {
    await goToOfferWithTwo();
    await addRationaleOnFirstRow('Si aggiunge un campo a una pagina esistente: è una MODIFICA semplice.');
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ kind: 'razionale', interventionId: 'MNPRES-001', status: 'confermata' });
    expect(service.rationaleRequest).toHaveBeenCalledWith('entries', expect.objectContaining({ goto: expect.any(String), text: 'Si aggiunge un campo a una pagina esistente: è una MODIFICA semplice.', interventionId: 'MNPRES-001' }));
    await waitFor(() => expect(card()).toHaveTextContent('3 di 8 righe verificate'));          // le 5 righe dell'intervento A sono da rifare, le 3 di B no
    expect(card()).toHaveTextContent('Mancano 5: 5 modificate dopo la verifica');
    expect(within(card()).getByRole('button', { name: 'Aggiorna le 5 righe modificate' })).toBeInTheDocument();
    expect(screen.getAllByText('Da aggiornare: dati modificati dopo la verifica').length).toBe(5);
    expect(service.reviewOfferDetails).not.toHaveBeenCalled();                                 // salvare un razionale NON chiama l'AI da solo
  });

  test('«Rifai la verifica dell’intervento B» (already verified) says so and does NOT call the AI; the 5 rows of A, which are to update, are left alone', async () => {
    await goToOfferWithTwo();
    await addRationaleOnFirstRow('Ragionamento A.');
    await waitFor(() => expect(card()).toHaveTextContent('3 di 8 righe verificate'));         // A e' da aggiornare, B e' a posto
    gates.length = 0; service.reviewOfferDetails.mockClear();
    openAllGroups();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rifai la verifica dell’intervento MNPRES-002' })[0]);
    await waitFor(() => expect(dialogOrAlert()).toHaveTextContent('3 di 3 righe verificate (100%)'));      // la finestra parla delle 3 righe di B
    expect(service.reviewOfferDetails).not.toHaveBeenCalled();                                  // B e' gia' verificata: l'AI non viene richiamata
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Chiudi' }));
    expect(card()).toHaveTextContent('3 di 8 righe verificate');                                // A resta da aggiornare: non e' stata toccata
  });
  test('«Rifai la verifica dell’intervento B» with force (from the window) redoes only the 3 rows of B, never the 5 of A', async () => {
    await goToOfferWithTwo();
    await addRationaleOnFirstRow('Ragionamento A.');
    await waitFor(() => expect(card()).toHaveTextContent('3 di 8 righe verificate'));
    gates.length = 0; service.reviewOfferDetails.mockClear();
    openAllGroups();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rifai la verifica dell’intervento MNPRES-002' })[0]);
    await waitFor(() => expect(dialogOrAlert()).toHaveTextContent('3 di 3 righe verificate (100%)'));
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Verifica tutto da capo' }));
    await waitFor(() => expect(gates).toHaveLength(1));
    expect(gates[0].rows).toHaveLength(3);                                                        // «da capo» resta sull'intervento B: non allarga il lavoro alle 5 righe di A
    expect(gates[0].rows.every(r => r.intervention.id === 'MNPRES-002')).toBe(true);
    await act(async () => { gates.shift().resolve(); });
    await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
  });

  test('«Rifai la verifica dell’intervento» asks the AI ONLY for the rows of that intervention, and the AI receives the new rationale', async () => {
    await goToOfferWithTwo();
    await addRationaleOnFirstRow('Il campo si aggiunge a una pagina che esiste già.');
    await waitFor(() => expect(card()).toHaveTextContent('3 di 8 righe verificate'));
    gates.length = 0; service.reviewOfferDetails.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rifai la verifica dell’intervento MNPRES-001' })[0]);
    await waitFor(() => expect(gates).toHaveLength(1));
    expect(gates[0].rows).toHaveLength(5);                                                      // solo le 5 righe di A: le 3 di B non vengono rimandate
    expect(gates[0].rows.every(r => r.intervention.id === 'MNPRES-001')).toBe(true);
    const sent = service.reviewOfferDetails.mock.calls[0][0].rows[0];
    expect(sent.confirmedRationale).toEqual([expect.objectContaining({ text: 'Il campo si aggiunge a una pagina che esiste già.', kind: 'razionale' })]);
    expect(dlg()).toHaveTextContent('L’AI sta ragionando sulle righe');
    await act(async () => { gates.shift().resolve(); });
    await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
    expect(dlg()).toHaveTextContent('5 di 5 righe verificate (100%)');                         // la finestra parla delle righe di QUELL'intervento
    expect(service.reviewOfferDetails).toHaveBeenCalledTimes(1);
  });

  test('after redoing one intervention the whole verification is complete again; B was never asked', async () => {
    await goToOfferWithTwo();
    await addRationaleOnFirstRow('Ragionamento A.');
    await waitFor(() => expect(card()).toHaveTextContent('3 di 8 righe verificate'));
    gates.length = 0; service.reviewOfferDetails.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rifai la verifica dell’intervento MNPRES-001' })[0]);
    await waitFor(() => expect(gates).toHaveLength(1)); await act(async () => { gates.shift().resolve(); });
    await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Chiudi' }));
    expect(card()).toHaveTextContent('Tutte le 8 righe sono verificate');
    expect(service.reviewOfferDetails).toHaveBeenCalledTimes(1);
  });

  test('«Aggiorna le N righe modificate» (all interventions) redoes only the changed rows, in one go', async () => {
    await goToOfferWithTwo();
    await addRationaleOnFirstRow('Ragionamento A.');
    await waitFor(() => expect(within(card()).getByRole('button', { name: 'Aggiorna le 5 righe modificate' })).toBeInTheDocument());
    gates.length = 0; service.reviewOfferDetails.mockClear();
    fireEvent.click(within(card()).getByRole('button', { name: 'Aggiorna le 5 righe modificate' }));
    await waitFor(() => expect(gates).toHaveLength(1)); expect(gates[0].rows).toHaveLength(5);
    await act(async () => { gates.shift().resolve(); });
    await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata'));
  });

  test('a rationale for the WHOLE initiative makes every row «to update»', async () => {
    await goToOfferWithTwo(); openAllGroups();
    fireEvent.click((await screen.findAllByRole('button', { name: '+ Aggiungi un razionale' }))[0]);
    fireEvent.change(screen.getByLabelText('Vale per'), { target: { value: 'iniziativa' } });
    fireEvent.change(screen.getByLabelText('Ragionamento'), { target: { value: 'Vale per tutto il lotto.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salva il razionale' })); });
    await waitFor(() => expect(saved).toHaveLength(1)); expect(saved[0].interventionId).toBeNull();
    // nessuna riga ha piu' un giudizio valido: la scheda torna allo stato «da verificare» (non «0 di 8»)
    await waitFor(() => expect(card()).toHaveTextContent('8 righe da aggiornare'));
    expect(card()).toHaveTextContent('Erano già verificate, ma i dati sono cambiati');
    expect(within(card()).getByRole('button', { name: 'Aggiorna tutte le 8 righe' })).toBeInTheDocument();
    expect(screen.getAllByText('Da aggiornare: dati modificati dopo la verifica').length).toBe(8);
  });

  test('sharing a rationale calls the server, shows it as shared, and does NOT make the rows «to update»', async () => {
    await goToOfferWithTwo();
    await addRationaleOnFirstRow('Da riusare su altre iniziative.');
    await waitFor(() => expect(saved).toHaveLength(1));
    // dopo il salvataggio le righe di A sono da aggiornare: le rifacciamo, cosi' si vede che la condivisione non cambia nulla
    gates.length = 0; fireEvent.click(screen.getAllByRole('button', { name: 'Rifai la verifica dell’intervento MNPRES-001' })[0]);
    await waitFor(() => expect(gates).toHaveLength(1)); await act(async () => { gates.shift().resolve(); });
    await waitFor(() => expect(dlg()).toHaveTextContent('Verifica completata')); fireEvent.click(within(dlg()).getByRole('button', { name: 'Chiudi' }));
    openAllGroups();
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Condividi con le altre iniziative' })[0]); });
    await waitFor(() => expect(service.rationaleRequest).toHaveBeenCalledWith('entries/100/share', {}));
    expect(saved[0].shared).toBe(true);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Condiviso · Ritira/ }).length).toBeGreaterThan(0));
    expect(card()).toHaveTextContent('Tutte le 8 righe sono verificate');                       // condividere non e' un nuovo ragionamento
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /Condiviso · Ritira/ })[0]); });
    await waitFor(() => expect(service.rationaleRequest).toHaveBeenCalledWith('entries/100/unshare', {}));
  });
});
