import { exportMev } from './mevService';

// L'export della tabella MEV («Esporta Excel»). La colonna «Imp. Subco» c'e' nella tabella e nel totale in alto: deve esserci anche nel file, subito dopo «Subco».
// Era una correzione fatta solo su main (PROD) e il rilascio da develop l'avrebbe persa.
const written = {};
jest.mock('xlsx', () => {
  const real = jest.requireActual('xlsx');
  return { ...real, writeFile: jest.fn((workbook, name) => { written.name = name; written.rows = real.utils.sheet_to_json(workbook.Sheets.MEV, { header: 1 }); }) };
});

const rows = [
  { excelId: 1, goTo: 'G1', applicativo: 'NPSO', descrizione: 'd', annoCompetenza: 2026, stato: 'Approvato', importoExcel: 100, rda: 'R', capgemini: 'c', iet: 'i', subco: 'ACME', impSubco: 12.5, pAnno: 2026, pRelease: 'R1', pImporto: 90, pNote: 'n' },
  { excelId: 2, goTo: 'G2', applicativo: 'ILP', descrizione: 'd2', annoCompetenza: 2026, stato: 'Approvato', importoExcel: 200 },
];

test('the exported file has «Imp. Subco» right after «Subco», with the value of each row (empty when there is none)', async () => {
  await exportMev(rows, {});
  const [header, first, second] = written.rows;
  const subco = header.indexOf('Subco');
  expect(header).toContain('Imp. Subco'); expect(header.indexOf('Imp. Subco')).toBe(subco + 1);
  expect(first[header.indexOf('Imp. Subco')]).toBe(12.5); expect(first[header.indexOf('Subco')]).toBe('ACME');
  expect(second[header.indexOf('Imp. Subco')] ?? '').toBe('');
});
test('the columns that were already exported are still there, in the same order', async () => {
  await exportMev(rows, {});
  expect(written.rows[0]).toEqual(['ID', 'GoTo', 'Applicativo', 'Descrizione', 'Anno Competenza', 'Stato', 'Importo Fornitura', 'RDA', 'Cap', 'IET', 'Subco', 'Imp. Subco', 'P Anno', 'P Release', 'P Importo', 'P Note']);
});
