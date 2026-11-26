import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import lotto2 from './__fixtures__/lotto2Catalogo.json';
import { estimatorWorkbook } from './estimatorFixture';
import { parseEstimatorWorkbook, isEstimator, isNoteRow, classifyRows, readEstimator, PHASES } from './estimatorImport';
import { parseInitiativeWorkbook, readWorkbookSheets } from './configuratoreCore';
import EstimatorImportReport from './EstimatorImportReport';

const A = { id: 'abc-001', titolo: 'Modifica del servizio di stampa', descrizione: 'd', attivita: 'Si modifica il servizio', sistema: 'NPSO', tow1: 0.14, tow3: 0.13, tow4: 0.157, tow5: 2040, hours: [0, 52, 0, 0], cap: 5200, poste: 3135.8, delta: -2064.2 };
const B = { id: 'abc-002', titolo: 'Nuova pagina', attivita: 'Nuova pagina con 25 campi', sistema: 'IPER', tow1: 0.5, tow5: 1000, hours: [4.8, 16, 1.6, 1.6], cap: 3000, poste: 3126.58, delta: 126.58 };
const D = [
  { id: 'abc-001', catalogId: 239, driver: 'Servizio/API/Microservizio', type: 'MODIFICA', complexity: 'Semplice', qty: 1, price: 120 },
  { id: 'abc-001', catalogId: 239, driver: 'Servizio/API/Microservizio', type: 'MODIFICA', complexity: 'Medio', qty: 3, price: 360 },
  { id: 'abc-002', catalogId: 236, driver: 'Realizzazione Single Page Application', type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 1, price: 4800, ambit: 'Frontend' },
];
const build = (extra = {}) => estimatorWorkbook({ interventions: [A, B], details: D, placeholders: 20, ...extra });

describe('recognising an Estimator', () => {
  test('a file with the INIZIATIVA sheet and ID_INTERVENTO is an Estimator', async () => expect(isEstimator(await readWorkbookSheets((await build()).arrayBuffer ? await (await build()).arrayBuffer() : null))).toBe(true));
  test('a Tabella di Offerta (no INIZIATIVA sheet) is NOT, and the error says which button to use', async () => {
    const file = await build({ withInitiative: false });
    expect(isEstimator(await readWorkbookSheets(await file.arrayBuffer()))).toBe(false);
    await expect(parseEstimatorWorkbook(file, lotto2)).rejects.toThrow(/non sembra un Estimatore Catalogo.*Importa Tabella di Offerta/);
  });
  test('an Estimator without the detail sheet is refused with a clear message', async () => { await expect(parseEstimatorWorkbook(await build({ withDetail: false }), lotto2)).rejects.toThrow(/Manca il foglio «DettaglioInterventi»/); });
  test('a file that is not an xlsx at all is refused', async () => { await expect(parseEstimatorWorkbook({ name: 'x.xlsx', arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, lotto2)).rejects.toThrow(); });
});

describe('the WRONG sheet the old import would read (hidden first sheet «COSTI INTERNI»)', () => {
  test('the Tabella di Offerta import takes the first sheet: the interventions of ANOTHER initiative and a wrong code', async () => {
    const parsed = await parseInitiativeWorkbook(await build(), lotto2);
    expect(parsed.code).toBe('XXXXXX'); expect(parsed.interventions.map(i => i.id)).toContain('AltraIniziativa');
  });
  test('the Estimator import takes INIZIATIVA: the right code, title and interventions, and none of the other initiative', async () => {
    const parsed = await parseEstimatorWorkbook(await build(), lotto2);
    expect(parsed.code).toBe('999001'); expect(parsed.title).toBe('Iniziativa di prova');
    expect(parsed.interventions.map(i => i.id)).toEqual(['abc-001', 'abc-002']);
    expect(parsed.interventions.map(i => i.id)).not.toContain('AltraIniziativa');
    expect(parsed.lot).toBe('2');
  });
});

describe('the same result as the Tabella di Offerta for the activities', () => {
  test('rows, type, complexity, quantity, price, catalog voice and the original values are the same as the Offer Table import would give', async () => {
    const parsed = await parseEstimatorWorkbook(await build(), lotto2);
    expect(parsed.items).toHaveLength(3);
    const [first, second, third] = parsed.items;
    expect(first).toMatchObject({ id: 239, type: 'MODIFICA', complexity: 'Semplice', qty: 1, unit: 120, interventionId: 'abc-001', imported: true });
    expect(second).toMatchObject({ id: 239, type: 'MODIFICA', complexity: 'Medio', qty: 3, unit: 360 });
    expect(third).toMatchObject({ id: 236, type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 1, unit: 4800, interventionId: 'abc-002' });
    expect(first.original).toMatchObject({ catalogId: 239, type: 'MODIFICA', complexity: 'Semplice', qty: 1, unit: 120 });
    expect(first.detail).toMatchObject({ componentApplication: 'componente-x', technology: 'Java', ambit: 'Backend' });
    expect(new Set(parsed.items.map(i => i.key)).size).toBe(3);
  });
  test('the interventions carry title, activity, system and TOW like the Offer Table ones', async () => {
    const parsed = await parseEstimatorWorkbook(await build(), lotto2);
    expect(parsed.interventions[0]).toMatchObject({ id: 'abc-001', titolo: 'Modifica del servizio di stampa', attivita: 'Si modifica il servizio', sistema: 'NPSO', tow5: 2040 });
    expect(parsed.interventions[0].mappings).toHaveLength(2); expect(parsed.interventions[1].mappings).toHaveLength(1);
    expect(parsed.systems).toBe('NPSO, IPER');
  });
  test('with a Tabella di Offerta layout the SAME function (parseInitiativeWorkbook) is unchanged by the option', async () => {
    const file = await build({ hiddenFirst: false });
    const viaOption = await parseInitiativeWorkbook(file, lotto2, { sheetName: 'INIZIATIVA' });
    const viaEstimator = await parseEstimatorWorkbook(file, lotto2);
    expect(viaOption.interventions.map(i => i.id)).toEqual(expect.arrayContaining(['abc-001', 'abc-002']));
    expect(viaEstimator.items.map(i => [i.id, i.type, i.complexity, i.qty, i.unit])).toEqual(viaOption.items.map(i => [i.id, i.type, i.complexity, i.qty, i.unit]));
  });
  test('an unknown sheet name is an error', async () => { await expect(parseInitiativeWorkbook(await build(), lotto2, { sheetName: 'NON-ESISTE' })).rejects.toThrow(/Non trovo il foglio «NON-ESISTE»/); });
});

describe('what is NOT an intervention', () => {
  test('empty placeholders («Intervento-21»…) and the notes at the bottom are left out and counted', async () => {
    const parsed = await parseEstimatorWorkbook(await build({ placeholders: 20 }), lotto2);
    const { summary, skipped } = parsed.estimator;
    expect(summary).toMatchObject({ interventions: 2, placeholders: 20, notes: 6, activities: 3 });      // 6 righe di note con un ID nella prima colonna (la fixture imita i file veri)
    expect(skipped.placeholders).toHaveLength(20); expect(skipped.placeholders[0]).toBe('Intervento-21');
    expect(skipped.notes).toEqual(expect.arrayContaining(['ESCLUSIONI', 'ESCL_01', 'Ambito']));
    expect(parsed.interventions.map(i => i.id)).not.toEqual(expect.arrayContaining(['ESCLUSIONI']));
  });
  test.each(['LISTINO TOW (come da Offerta Economica dichiarata in sede di Accordo Quadro)', 'Ambito', 'ESCLUSIONI', 'ESCL_01', 'ESCL_12', 'Sviluppo Software e Manutenzioni Evolutive Straordinarie ad hoc ', 'Totale', 'NOTE'])('«%s» is a note', id => expect(isNoteRow(id)).toBe(true));
  test.each(['abc-001', 'MNPRES-001', 'Intervento 1', 'HandlingFees', 'tgcevo-001', 'Rientri sicurezza'])('«%s» is NOT a note', id => expect(isNoteRow(id)).toBe(false));
  test('a placeholder with a TITLE is a real intervention (the user wrote something: nothing is lost)', () => {
    const r = classifyRows([{ id: 'Intervento-21', titolo: 'Lo uso davvero', descrizione: '', attivita: '', sistema: '', requisiti: '', tow5: 0, hours: { Analisi: 0, Sviluppo: 0, Collaudo: 0, Produzione: 0 } }], new Set());
    expect(r.interventions).toHaveLength(1); expect(r.placeholders).toHaveLength(0); expect(r.withoutActivities).toHaveLength(1);
  });
  test('a placeholder with only HOURS is an intervention; with only activities in the detail it is an intervention', () => {
    const empty = { titolo: '', descrizione: '', attivita: '', sistema: '', requisiti: '', tow5: 0 };
    expect(classifyRows([{ id: 'X1', ...empty, hours: { Analisi: 0, Sviluppo: 8, Collaudo: 0, Produzione: 0 } }], new Set()).interventions).toHaveLength(1);
    expect(classifyRows([{ id: 'X2', ...empty, hours: null }], new Set(['x2'])).interventions).toHaveLength(1);
    expect(classifyRows([{ id: 'X3', ...empty, hours: null }], new Set()).placeholders).toHaveLength(1);
  });
  test('the detail is matched to the intervention ignoring case and spaces', () => {
    const r = classifyRows([{ id: ' MNPRES-001 ', titolo: '', descrizione: '', attivita: '', sistema: '', requisiti: '', tow5: 0, hours: null }], new Set(['mnpres-001']));
    expect(r.interventions).toHaveLength(1);
  });
});

describe('the interventions without activities, and the activities without intervention (import and report)', () => {
  test('an intervention with content but no row in DettaglioInterventi is imported WITHOUT rows and reported', async () => {
    const parsed = await parseEstimatorWorkbook(await estimatorWorkbook({ interventions: [A, { ...B, id: 'abc-003' }], details: D.filter(d => d.id === 'abc-001') }), lotto2);
    expect(parsed.interventions.map(i => i.id)).toEqual(['abc-001', 'abc-003']);
    expect(parsed.estimator.summary.withoutActivities).toEqual(['abc-003']);
    expect(parsed.interventions[1].mappings).toHaveLength(0);
  });
  test('an activity whose intervention is not in INIZIATIVA is reported, not silently lost', async () => {
    const parsed = await parseEstimatorWorkbook(await estimatorWorkbook({ interventions: [A], details: [...D.filter(d => d.id === 'abc-001'), { ...D[2], id: 'fantasma-9' }] }), lotto2);
    expect(parsed.estimator.summary.orphanActivities).toEqual(['fantasma-9']);
  });
  test('a file with interventions but no valid activity at all is refused', async () => {
    await expect(parseEstimatorWorkbook(await estimatorWorkbook({ interventions: [A], details: [] }), lotto2)).rejects.toThrow(/Nessuna attività valida|Quantità di catalogo non riconosciute/);
  });
});

describe('the man-hours per phase', () => {
  test('are read for each intervention (Analisi, Sviluppo, Collaudo, Produzione) and totalled', async () => {
    const parsed = await parseEstimatorWorkbook(await build(), lotto2);
    expect(parsed.interventions[0].hours).toEqual({ Analisi: 0, Sviluppo: 52, Collaudo: 0, Produzione: 0 });
    expect(parsed.interventions[1].hours).toEqual({ Analisi: 4.8, Sviluppo: 16, Collaudo: 1.6, Produzione: 1.6 });
    const { hours, totalHours } = parsed.estimator.summary;
    expect(hours).toEqual({ Analisi: 4.8, Sviluppo: 68, Collaudo: 1.6, Produzione: 1.6 }); expect(totalHours).toBeCloseTo(76, 5);
    expect(parsed.estimator.hasHours).toBe(true); expect(parsed.estimator.rate).toBe(800);
  });
  test('the hours written in a row that is NOT an intervention are NOT counted (a template with leftover numbers must not inflate the total)', async () => {
    // i segnaposto qui hanno 99 ore ciascuno ma nessun titolo, attivita' o dettaglio: il file e' un modello con numeri residui
    const parsed = await parseEstimatorWorkbook(await build({ placeholders: 5, placeholderHours: [99, 99, 99, 99] }), lotto2);
    expect(parsed.estimator.summary.totalHours).toBeCloseTo(76 + 5 * 4 * 99, 5);        // con le ore residue il segnaposto HA contenuto (ore): e' un intervento
    expect(parsed.interventions).toHaveLength(7);
  });
  test('placeholders with NO hours do not change the total', async () => {
    expect((await parseEstimatorWorkbook(await build({ placeholders: 30 }), lotto2)).estimator.summary.totalHours).toBeCloseTo(76, 5);
  });
  test('the hours of a NOTE row are never counted, even when the note has numbers', () => {
    const { summarizeEstimator } = require('./estimatorImport');
    const hours = { Analisi: 0, Sviluppo: 50, Collaudo: 0, Produzione: 0 };
    const summary = summarizeEstimator({ interventions: [{ id: 'a', hours: { Analisi: 1, Sviluppo: 2, Collaudo: 3, Produzione: 4 } }], placeholders: [{ id: 'p', hours }], notes: [{ id: 'ESCLUSIONI', hours }], withoutActivities: [] });
    expect(summary.totalHours).toBe(10); expect(summary.hours).toEqual({ Analisi: 1, Sviluppo: 2, Collaudo: 3, Produzione: 4 });
  });
  test('the CAP / POSTE / DELTA values are kept with the intervention, and never used to change a price or a total', async () => {
    const parsed = await parseEstimatorWorkbook(await build(), lotto2);
    expect(parsed.interventions[0].estimateValues).toEqual({ cap: 5200, poste: 3135.8, delta: -2064.2 });
    expect(parsed.items.map(i => i.unit)).toEqual([120, 360, 4800]);       // i prezzi restano quelli del dettaglio
    expect(parsed.items.map(i => i.original.unit)).toEqual([120, 360, 4800]);
    expect(parsed.interventions.map(i => i.unit)).toEqual([undefined, undefined]);      // nessun prezzo sull'intervento
    expect(parsed.items.map(i => i.unit * i.qty).reduce((a, b) => a + b, 0)).toBe(120 + 1080 + 4800);
  });
  test('a file without the hour columns imports the same and says so', async () => {
    const parsed = await parseEstimatorWorkbook(await build({ hours: false }), lotto2);
    expect(parsed.estimator.hasHours).toBe(false); expect(parsed.interventions[0].hours).toBeUndefined(); expect(parsed.items).toHaveLength(3);
  });
  test('the four phases are the ones asked for', () => expect(PHASES).toEqual(['Analisi', 'Sviluppo', 'Collaudo', 'Produzione']));
});

describe('code and title', () => {
  test('an EMPTY «Codice:» does not take the title line as the code (it used to give «Titolo: Bonifica SGT»)', async () => {
    const parsed = await parseEstimatorWorkbook(await build({ meta: 'Interventi Iniziativa \nCodice: \nTitolo:  Bonifica SGT' }), lotto2);
    expect(parsed.code).toBe(''); expect(parsed.title).toBe('Bonifica SGT');
  });
  test('a code in the file is read as written (also a non numeric one)', async () => {
    expect((await parseEstimatorWorkbook(await build({ meta: 'Interventi Iniziativa \nCodice: 142226 (ex 138512)\nTitolo:  Ottimizzazione' }), lotto2)).code).toBe('142226 (ex 138512)');
    expect((await parseEstimatorWorkbook(await build({ meta: 'Interventi Iniziativa \nCodice: TBD\nTitolo: x' }), lotto2)).code).toBe('TBD');
  });
});

describe('readEstimator on its own', () => {
  test('finds the header, the lot from the TOW columns, the rate and the hour columns', async () => {
    const sheets = await readWorkbookSheets(await (await build()).arrayBuffer());
    const r = readEstimator(sheets);
    expect(r).toMatchObject({ sheet: 'INIZIATIVA', lot: '2', rate: 800, hasHours: true });
    expect(r.found.map(f => f.id).slice(0, 2)).toEqual(['abc-001', 'abc-002']);
  });
});

describe('the report shown after the import', () => {
  const report = async (extra) => { const parsed = await parseEstimatorWorkbook(await build(extra), lotto2); return { fileName: parsed.fileName, code: parsed.code, title: parsed.title, ...parsed.estimator }; };
  test('says what came in, what was left out, and the hours — calculated from the file', async () => {
    const onClose = jest.fn(); render(<EstimatorImportReport report={await report()} onClose={onClose} />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('GOTO 999001 · Iniziativa di prova');
    const numbers = screen.getByRole('list', { name: 'Numeri dell’import' });
    expect(numbers).toHaveTextContent('2interventi'); expect(numbers).toHaveTextContent('3attività'); expect(numbers).toHaveTextContent('20segnaposto vuoti saltati'); expect(numbers).toHaveTextContent('6righe di note saltate');
    const hoursBox = screen.getByRole('group', { name: 'Ore uomo per fase' });
    expect(hoursBox).toHaveTextContent('Sviluppo68'); expect(hoursBox).toHaveTextContent('Totale76'); expect(hoursBox).toHaveTextContent('solo informative: non cambiano prezzi né totali');
    expect(screen.getByText(/Tariffa media del file: 800 €\/ora/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi il riepilogo dell’import' })); expect(onClose).toHaveBeenCalled();
  });
  test('lists what was left out when opened', async () => {
    render(<EstimatorImportReport report={await report()} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Cosa è stato lasciato fuori'));
    expect(screen.getByText(/Intervento-21/)).toBeInTheDocument(); expect(screen.getByText(/ESCLUSIONI/)).toBeInTheDocument();
  });
  test('warns about interventions without activities and about orphan activities', async () => {
    const parsed = await parseEstimatorWorkbook(await estimatorWorkbook({ interventions: [A, { ...B, id: 'abc-003' }], details: [...D.filter(d => d.id === 'abc-001'), { ...D[2], id: 'fantasma-9' }] }), lotto2);
    render(<EstimatorImportReport report={{ fileName: parsed.fileName, code: parsed.code, title: parsed.title, ...parsed.estimator }} onClose={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('1 intervento senza attività in «DettaglioInterventi»: abc-003'); expect(alert).toHaveTextContent('Sono importati lo stesso, senza righe');
    expect(alert).toHaveTextContent('1 attività in «DettaglioInterventi» con un ID che non c’è in «INIZIATIVA»: fantasma-9');
  });
  test('no warning when everything matches, and a file without hours says so', async () => {
    render(<EstimatorImportReport report={await report({ hours: false, placeholders: 0, notes: false })} onClose={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull(); expect(screen.queryByRole('group', { name: 'Ore uomo per fase' })).toBeNull();
    expect(screen.getByText(/non ha le colonne delle ore uomo/)).toBeInTheDocument(); expect(screen.queryByText('Cosa è stato lasciato fuori')).toBeNull();
  });
});

describe('the hours shown in the box of each intervention', () => {
  const { InterventionHours } = require('./ImportedInterventionGroup');
  test('an intervention imported from the Estimator shows its hours by phase and the total', async () => {
    const parsed = await parseEstimatorWorkbook(await build(), lotto2);
    render(<InterventionHours hours={parsed.interventions[1].hours} />);
    const box = screen.getByLabelText('Ore uomo dell’intervento');
    expect(box).toHaveTextContent('Analisi 4,8'); expect(box).toHaveTextContent('Sviluppo 16'); expect(box).toHaveTextContent('Collaudo 1,6'); expect(box).toHaveTextContent('Produzione 1,6'); expect(box).toHaveTextContent('Totale 24');
  });
  test('the box of an intervention shows the hours when the intervention has them, and the group uses the component', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'ImportedInterventionGroup.js'), 'utf8');
    expect(src).toMatch(/<InterventionHours hours=\{intervention\.hours\} \/>/);
  });
  test('an intervention from a Tabella di Offerta (no hours) shows nothing', () => { const { container } = render(<InterventionHours hours={undefined} />); expect(container).toBeEmptyDOMElement(); });
  test('the group of an intervention carries the hours into its summary', () => {
    const Group = require('./ImportedInterventionGroup').default;
    render(<Group intervention={{ id: 'abc-001', titolo: 'T', mappings: [], hours: { Analisi: 0, Sviluppo: 52, Collaudo: 0, Produzione: 0 } }} items={[]}><i /></Group>);
    expect(screen.getByLabelText('Ore uomo dell’intervento')).toHaveTextContent('Sviluppo 52');
  });
});
