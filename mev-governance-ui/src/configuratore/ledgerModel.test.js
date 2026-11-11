import { toImportRows, checkLedgerFile, previewSummary, hasWork, buildUpdate, filterLabel, eventKind, outcomeOf, statusLabel, ledgerFacts, sha256Hex, readFileText, initiativeFromLedger, MAX_LEDGER_FILE } from './ledgerModel';

test('parsed rows are shaped for the server: dates stay ISO and a date makes the free text redundant', () => {
  const rows = toImportRows([{ goto: null, title: 'T', system: 'BEP', pmPoste: 'Mollo', status: 'approvata', release: 'R01', plannedRelease: null, collaudoDate: '2026-11-25', collaudoText: '25/11/2026', notes: null, released: null, missing: null, amounts: [{ text: '1 €', value: 1, extra: 'x' }] }]);
  expect(rows[0]).toMatchObject({ goto: null, collaudoDate: '2026-11-25', collaudoText: null, amounts: [{ text: '1 €', value: 1 }] });
  expect(rows[0].amounts[0]).not.toHaveProperty('extra');
  expect(toImportRows([{ title: 'T', system: 'S', status: 'x', collaudoDate: null, collaudoText: 'prossimo mese' }])[0].collaudoText).toBe('prossimo mese');
});

test('only a small Markdown file is accepted, with the reason otherwise', () => {
  expect(checkLedgerFile({ name: 'STATO.md', size: 5000 })).toBe('');
  expect(checkLedgerFile({ name: 'STATO.MARKDOWN', size: 5000 })).toBe('');
  expect(checkLedgerFile({ name: 'a.txt', size: 10 })).toBe('');
  expect(checkLedgerFile({ name: 'a.xlsx', size: 10 })).toMatch(/Markdown/);
  expect(checkLedgerFile({ name: 'a.md', size: 0 })).toMatch(/vuoto/);
  expect(checkLedgerFile({ name: 'a.md', size: MAX_LEDGER_FILE + 1 })).toMatch(/1 MB/);
  expect(checkLedgerFile(null)).toMatch(/Seleziona/);
});

test('the preview is summarised in words and only offers to import when something would change', () => {
  expect(previewSummary({ created: 2, updated: 1, unchanged: 24, skipped: 0 })).toBe('2 nuove · 1 aggiornata · 24 invariate');
  expect(previewSummary({ created: 1, updated: 0, unchanged: 0, skipped: 3 })).toBe('1 nuova · 3 scartate');
  expect(previewSummary({ created: 0, updated: 0, unchanged: 0, skipped: 0 })).toBe('Nessuna riga');
  expect(previewSummary(null)).toBe('');
  expect(hasWork({ created: 0, updated: 0, unchanged: 27, skipped: 0 })).toBe(false);
  expect(hasWork({ created: 0, updated: 1, unchanged: 26, skipped: 0 })).toBe(true);
  expect(hasWork(null)).toBe(false);
  expect(outcomeOf('nuova').label).toBe('Nuova'); expect(outcomeOf('boh').label).toBe('Invariata');
});

test('an edit sends only what changed, with the revision the user saw, and nothing when nothing changed', () => {
  const item = { revision: 4, status: 'approvata', title: 'T', goto: '145999', pmPoste: 'Sugamiele', release: 'R01', plannedRelease: null, notes: 'ok', released: null, missing: null };
  expect(buildUpdate(item, {})).toBeNull();
  expect(buildUpdate(item, { status: 'approvata', notes: ' ok ' })).toBeNull();
  expect(buildUpdate(item, { status: 'rilasciata' })).toEqual({ expectedRevision: 4, status: 'rilasciata' });
  expect(buildUpdate(item, { notes: 'nuovo' })).toEqual({ expectedRevision: 4, notes: 'nuovo', notesProvided: true });
  expect(buildUpdate(item, { notes: '' })).toEqual({ expectedRevision: 4, notes: '', notesProvided: true });
  expect(buildUpdate(item, { plannedRelease: 'R04.2027' })).toMatchObject({ plannedReleaseProvided: true });
  expect(buildUpdate({ ...item, goto: null }, { goto: '147001' })).toMatchObject({ goto: '147001', gotoProvided: true });
});

test('filters, status, events and the closed-state line have readable labels', () => {
  expect(filterLabel({ status: '', q: '' }, 27, 27)).toBe('27 iniziative');
  expect(filterLabel({ status: 'rilasciata', q: 'bep' }, 27, 3)).toBe('3 di 27 iniziative · 2 filtri attivi');
  expect(filterLabel({ status: 'x' }, 5, 1)).toContain('1 filtro attivo');
  expect(statusLabel('in-analisi')).toBe('In analisi / stima'); expect(statusLabel('boh')).toBe('boh'); expect(statusLabel(null)).toBe('—');
  expect(eventKind('stato').label).toBe('Cambio di stato'); expect(eventKind('altro')).toEqual({ label: 'altro', tone: 'neutral' });
  expect(ledgerFacts({}, 0)).toBe('Nessuna iniziativa');
  expect(ledgerFacts({ rilasciata: 8, 'in-approvazione': 12, 'in-analisi': 1 }, 27)).toBe('27 iniziative · 8 rilasciate · 13 in corso');
});

test('the file fingerprint is stable and differs when the text differs', async () => {
  const { TextEncoder } = require('util'); global.TextEncoder = global.TextEncoder || TextEncoder;
  const { webcrypto } = require('crypto'); Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto });
  const a = await sha256Hex('uno'); const b = await sha256Hex('uno'); const c = await sha256Hex('due');
  expect(a).toMatch(/^[a-f0-9]{64}$/); expect(a).toBe(b); expect(a).not.toBe(c);
});

test('a file is read as text with Blob.text when available and with FileReader otherwise, accents included', async () => {
  const withText = { text: jest.fn(async () => 'già') };
  expect(await readFileText(withText)).toBe('già'); expect(withText.text).toHaveBeenCalled();
  const plain = new File(['perché è così'], 'a.md', { type: 'text/markdown' });
  Object.defineProperty(plain, 'text', { value: undefined });
  expect(await readFileText(plain)).toBe('perché è così');
});

test('handing a record to the Configuratore carries only the identifying fields and never a TBD as code', () => {
  expect(initiativeFromLedger({ goto: '145480', title: 'Add-on', system: 'NPSO', release: 'R01.2027', pmPoste: 'Lerro', notes: 'x', status: 'approvata' }))
    .toEqual({ code: '145480', title: 'Add-on', system: 'NPSO', release: 'R01.2027', pmPoste: 'Lerro' });
  expect(initiativeFromLedger({ goto: 'TBD', gotoPlaceholder: true, title: 'T', system: 'BEP' }).code).toBe('');
  expect(initiativeFromLedger({ goto: '1', title: 'T', plannedRelease: 'R02.2027' }).release).toBe('R02.2027');
  expect(initiativeFromLedger(null)).toEqual({ code: '', title: '', system: '', release: '', pmPoste: '' });
});
