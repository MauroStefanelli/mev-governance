import fs from 'fs';
import { parseInitiativeLedger, parseItalianDate, amountsIn, rowKey, isPlaceholderGoto, statusFromHeading, STATUSES } from './initiativeLedgerParser';

const REAL = '/Users/MSTEFANE/Downloads/STATO_INIZIATIVE_20261111.md';
const real = fs.existsSync(REAL) ? fs.readFileSync(REAL, 'utf8') : null;
const maybe = real ? test : test.skip;

maybe('the real file: 27 rows in six statuses, as the file\'s own summary says', () => {
  const result = parseInitiativeLedger(real);
  expect(result.errors).toEqual([]);
  expect(result.rows).toHaveLength(27);
  expect(result.counts).toEqual({ rilasciata: 8, parziale: 2, approvata: 3, 'in-approvazione': 12, 'in-analisi': 1, 'cr-da-stimare': 1 });
  expect(result.warnings).toEqual([]);
  expect(result.meta).toEqual({ updatedAt: '2026-11-11', pmCap: 'Fabbri', source: expect.stringContaining('ultima lista') });
});

maybe('the real file: every row has a distinct identity even when GOTO and system repeat', () => {
  const { rows } = parseInitiativeLedger(real);
  expect(new Set(rows.map(r => r.key)).size).toBe(27);
  expect(rows.filter(r => r.goto === '145999' && r.system === 'IPER/IPERSUITE')).toHaveLength(3);
  expect(rows.filter(r => r.goto === '146023').map(r => `${r.system}:${r.status}`).sort()).toEqual(['BEP:approvata', 'BEP:in-approvazione', 'NPSO:approvata', 'NPSO:in-analisi', 'IPER/IPERSUITE:rilasciata'].sort());
});

maybe('the real file: unassigned GOTO are marked, not turned into a code', () => {
  const { rows } = parseInitiativeLedger(real);
  const tbd = rows.filter(r => r.gotoPlaceholder);
  expect(tbd).toHaveLength(5);
  tbd.forEach(r => expect(r.goto).toBeNull());
  expect(tbd.map(r => r.title)).toContain('Gestione messaggi referral N99');
});

maybe('the real file: dates, release and amounts are read, and a dash stays empty', () => {
  const { rows } = parseInitiativeLedger(real);
  const upu = rows.find(r => r.goto === '145480');
  expect(upu).toMatchObject({ pmPoste: 'Lerro', release: 'R01.2027', collaudoDate: '2027-11-09'.replace('2027', '2026'), status: 'rilasciata', system: 'NPSO' });
  const tup = rows.find(r => r.title.startsWith('TUP') && r.system === 'ILP');
  expect(tup.release).toBeNull(); expect(tup.collaudoDate).toBeNull(); expect(tup.notes).toBeNull();
  const postaeasy = rows.find(r => r.title.startsWith('PostaEasy'));
  expect(postaeasy.amounts).toEqual([{ text: '15.493,18 €', value: 15493.18 }]);
  const zonos = rows.find(r => r.goto === '146023' && r.status === 'in-analisi');
  expect(zonos.amounts.map(a => a.value)).toEqual([19800.73]);
});

maybe('the real file: partially released rows keep what is released and what is missing', () => {
  const { rows } = parseInitiativeLedger(real);
  const parziali = rows.filter(r => r.status === 'parziale');
  expect(parziali).toHaveLength(2);
  parziali.forEach(r => { expect(r.released).toBeTruthy(); expect(r.missing).toBeTruthy(); });
  expect(parziali.find(r => r.goto === '146738').missing).toContain('IPC PDDP Inbound 2.0.0');
});

maybe('the real file: planned release is kept apart from the actual one', () => {
  const { rows } = parseInitiativeLedger(real);
  const approv = rows.filter(r => r.status === 'in-approvazione');
  expect(approv.find(r => r.title === 'DHL CONNECT Label specification updates').plannedRelease).toBe('proposta R04.2027');
  expect(approv.every(r => r.release === null)).toBe(true);
});

const small = `# Stato

| | |
|---|---|
| Aggiornato al | 01/02/2026 |
| PM CAP | Rossi |

## 1. Approvate

| GOTO | Titolo | Sistema | PM Poste | Release | Rilascio al collaudo | Note |
|---|---|---|---|---|---|---|
| 100 | Prima | NPSO | Bianco | R01 | 05/03/2026 | ok |
| TBD | Seconda | BEP | Mollo | — | — | — |

## 2. Riepilogo

| Stato | Numero di righe |
|---|---|
| Approvate | 2 |
| **Totale** | **2** |
`;

test('a small file is read with metadata, rows and no warnings when the summary matches', () => {
  const result = parseInitiativeLedger(small);
  expect(result.errors).toEqual([]); expect(result.warnings).toEqual([]);
  expect(result.rows.map(r => [r.goto, r.title, r.status])).toEqual([['100', 'Prima', 'approvata'], [null, 'Seconda', 'approvata']]);
  expect(result.meta.updatedAt).toBe('2026-02-01');
});

test('a summary that disagrees with the rows is reported, not hidden', () => {
  const result = parseInitiativeLedger(small.replace('| Approvate | 2 |', '| Approvate | 5 |').replace('**2**', '**9**'));
  expect(result.warnings.some(w => w.includes('dichiara 5 righe «Approvata», ma ne ho lette 2'))).toBe(true);
  expect(result.declared).toMatchObject({ approvata: 5, totale: 9 });
  expect(result.warnings.some(w => w.includes('9 righe in totale'))).toBe(true);
});

test('a row with the wrong number of columns is skipped with its line number', () => {
  const result = parseInitiativeLedger(small.replace('| 100 | Prima | NPSO | Bianco | R01 | 05/03/2026 | ok |', '| 100 | Prima | NPSO |'));
  expect(result.rows).toHaveLength(1);
  expect(result.warnings.some(w => /Riga \d+: 3 colonne invece di 7/.test(w))).toBe(true);
});

test('a row without title or system is skipped, not imported half-empty', () => {
  const result = parseInitiativeLedger(small.replace('| 100 | Prima | NPSO |', '| 100 |  | NPSO |'));
  expect(result.rows).toHaveLength(1);
  expect(result.warnings.some(w => w.includes('titolo o sistema mancanti'))).toBe(true);
});

test('the same GOTO, system and title twice in a file is an error, because it would merge two rows', () => {
  const result = parseInitiativeLedger(small.replace('| TBD | Seconda | BEP | Mollo | — | — | — |', '| 100 | Prima | NPSO | Bianco | R01 | — | — |'));
  expect(result.errors.some(e => e.includes('stessa iniziativa'))).toBe(true);
});

test('a table without GOTO and Titolo is rejected with a clear reason', () => {
  const result = parseInitiativeLedger('## 1. Approvate\n\n| Nome | Altro |\n|---|---|\n| a | b |\n');
  expect(result.rows).toHaveLength(0);
  expect(result.errors.some(e => e.includes('colonne GOTO e Titolo'))).toBe(true);
});

test('unknown columns are ignored with a warning instead of failing the import', () => {
  const result = parseInitiativeLedger('## 1. Approvate\n\n| GOTO | Titolo | Sistema | Colore |\n|---|---|---|---|\n| 1 | A | NPSO | blu |\n');
  expect(result.rows).toHaveLength(1);
  expect(result.warnings.some(w => w.includes('Colore'))).toBe(true);
});

test('empty and non-initiative files give a clear error and never throw', () => {
  ['', '   ', 'solo testo', '# Titolo\n\nniente tabelle'].forEach(input => { const r = parseInitiativeLedger(input); expect(r.rows).toEqual([]); expect(r.errors.length).toBeGreaterThan(0); });
  expect(() => parseInitiativeLedger(null)).not.toThrow();
  expect(() => parseInitiativeLedger(undefined)).not.toThrow();
});

test('Windows line endings and a byte order mark do not change the result', () => {
  const a = parseInitiativeLedger(small);
  const b = parseInitiativeLedger('﻿' + small.replace(/\n/g, '\r\n'));
  expect(b.rows.map(r => r.key)).toEqual(a.rows.map(r => r.key));
});

test('an escaped pipe inside a cell does not split the column', () => {
  const result = parseInitiativeLedger('## 1. Approvate\n\n| GOTO | Titolo | Sistema |\n|---|---|---|\n| 1 | A \\| B | NPSO |\n');
  expect(result.rows[0].title).toBe('A | B');
});

test('dates are accepted only when they are real calendar dates', () => {
  expect(parseItalianDate('05/11/2026')).toBe('2026-11-05');
  expect(parseItalianDate('5/1/2026')).toBe('2026-01-05');
  expect(parseItalianDate('31/02/2026')).toBeNull();
  expect(parseItalianDate('13/13/2026')).toBeNull();
  expect(parseItalianDate('R01.2027')).toBeNull();
  expect(parseItalianDate('')).toBeNull();
  expect(parseItalianDate(null)).toBeNull();
});

test('amounts are found in Italian format and a missing amount stays missing', () => {
  expect(amountsIn('stima 15.493,18 €')).toEqual([{ text: '15.493,18 €', value: 15493.18 }]);
  expect(amountsIn('19.800,73 € e 1.000 €').map(a => a.value)).toEqual([19800.73, 1000]);
  expect(amountsIn('12 € subito')).toEqual([{ text: '12 €', value: 12 }]);
  expect(amountsIn('nessun importo')).toEqual([]);
  expect(amountsIn(null)).toEqual([]);
});

test('the identity of a row ignores case, accents and spacing, and treats unassigned GOTO alike', () => {
  expect(rowKey({ goto: '145999', system: 'IPER/IPERSUITE', title: 'Validazione itmatt outbound' })).toBe(rowKey({ goto: ' 145999 ', system: 'iper/ipersuite', title: 'validazione  ITMATT outbound' }));
  expect(rowKey({ goto: 'TBD', system: 'BEP', title: 'X' })).toBe(rowKey({ goto: null, system: 'BEP', title: 'x' }));
  expect(rowKey({ goto: '1', system: 'BEP', title: 'X' })).not.toBe(rowKey({ goto: '2', system: 'BEP', title: 'X' }));
  expect(rowKey({ goto: '1', system: 'BEP', title: 'X' })).not.toBe(rowKey({ goto: '1', system: 'NPSO', title: 'X' }));
  expect(isPlaceholderGoto('TBD')).toBe(true); expect(isPlaceholderGoto('tbd')).toBe(true); expect(isPlaceholderGoto('145999')).toBe(false); expect(isPlaceholderGoto(null)).toBe(true);
});

test('every status heading is recognised with or without its number, and unknown ones are not', () => {
  ['1. Rilasciate', 'Rilasciate parzialmente', '3. Approvate', 'In approvazione', '5. In analisi / stima', 'In analisi', 'CR da stimare'].forEach(h => expect(statusFromHeading(h)).not.toBeNull());
  expect(statusFromHeading('7. Riepilogo')).toBeNull(); expect(statusFromHeading('Indice')).toBeNull(); expect(statusFromHeading('Altro')).toBeNull();
  expect(statusFromHeading('Rilasciate').id).toBe('rilasciata'); expect(statusFromHeading('Rilasciate parzialmente').id).toBe('parziale');
  expect(new Set(STATUSES.map(s => s.id)).size).toBe(6);
});

maybe('the real file: a changed summary is caught on every status, not only the total', () => {
  for (const [label, count] of [['Rilasciate', 8], ['Rilasciate parzialmente', 2], ['Approvate', 3], ['In approvazione', 12], ['In analisi / stima', 1], ['CR da stimare', 1]]) {
    const tampered = real.replace(new RegExp(`\\| ${label.replace(/[/]/g, '\\/')} \\| ${count} \\|`), `| ${label} | ${count + 1} |`);
    expect(tampered).not.toBe(real);
    const result = parseInitiativeLedger(tampered);
    expect(result.warnings.some(w => w.includes(`dichiara ${count + 1} righe`))).toBe(true);
  }
});

test('a file saved with a byte-order mark and Windows line endings is read exactly like a clean one', () => {
  const clean = '# Stato delle iniziative\n\n## 1. Approvate\n\n| GOTO | Titolo | Sistema |\n|---|---|---|\n| 145480 | Add-on | NPSO |\n';
  const windows = '\uFEFF' + clean.replace(/\n/g, '\r\n');
  const a = parseInitiativeLedger(clean); const b = parseInitiativeLedger(windows);
  expect(b.rows).toEqual(a.rows);
  expect(b.rows).toHaveLength(1);
  expect(b.rows[0]).toMatchObject({ goto: '145480', system: 'NPSO' });
});
