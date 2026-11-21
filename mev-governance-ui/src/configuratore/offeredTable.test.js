import { COLUMNS, toEditable, toPayload, isDirty, changedCells, priceProblem, tableProblems, gara } from './offeredTable';

const row = (extra = {}) => ({ id: 236, ambito: 'Frontend', nome: 'Realizzazione Single Page Application', descrizioneGara: 'gara', covered: true,
  prezziGara: { REALIZZAZIONE: { Semplice: 1200, Medio: 2800, Complesso: 4800 }, MODIFICA: { Semplice: 280, Medio: 840, Complesso: 1400 } },
  descrizione: 'Driver', descrizioni: { Semplice: 'S', Medio: 'M', Complesso: 'C' },
  prezzi: { REALIZZAZIONE: { Semplice: 600, Medio: 1400, Complesso: 2400 }, MODIFICA: { Semplice: 140, Medio: 420, Complesso: 700 } }, ...extra });

test('the columns are in the order the user asked for, each once', () => {
  expect(COLUMNS.map(c => c.label)).toEqual(['ID', 'Ambito', 'Voce', 'Descrizione Driver', 'Descrizione Semplice', 'Descrizione Medio', 'Descrizione Complesso',
    'Realizzazione Semplice', 'Realizzazione Medio', 'Realizzazione Complesso', 'Modifica Semplice', 'Modifica Medio', 'Modifica Complesso']);
  expect(new Set(COLUMNS.map(c => c.key)).size).toBe(COLUMNS.length);
});
test('ID, Ambito and Voce are read-only; descriptions are text; the six offered prices are amounts', () => {
  expect(COLUMNS.filter(c => c.kind === 'fixed').map(c => c.label)).toEqual(['ID', 'Ambito', 'Voce']);
  expect(COLUMNS.filter(c => c.kind === 'text')).toHaveLength(4);
  expect(COLUMNS.filter(c => c.kind === 'price')).toHaveLength(6);
});
test('a row becomes editable text and comes back as the payload: id, descriptions, prices - never name or ambit', () => {
  const editable = toEditable(row());
  expect(editable.prezzi.REALIZZAZIONE.Medio).toBe('1400');
  expect(editable.descrizioni.Complesso).toBe('C');
  const payload = toPayload([editable])[0];
  expect(Object.keys(payload).sort()).toEqual(['descrizione', 'descrizioni', 'id', 'prezzi']);
  expect(payload.prezzi.MODIFICA.Semplice).toBe('140');
  expect(payload.nome).toBeUndefined(); expect(payload.ambito).toBeUndefined();
});
test('missing data becomes empty strings, never the word undefined or null', () => {
  const editable = toEditable({ id: 5, nome: 'x', prezziGara: {}, prezzi: null, descrizioni: null, descrizione: null });
  expect(editable.descrizione).toBe(''); expect(editable.descrizioni.Medio).toBe(''); expect(editable.prezzi.MODIFICA.Complesso).toBe('');
});
test('dirty and changed cells are detected, and undoing the edit makes the table clean again', () => {
  const original = [toEditable(row())];
  expect(isDirty(original, original.map(r => ({ ...r })))).toBe(false);
  const edited = [{ ...original[0], prezzi: { ...original[0].prezzi, REALIZZAZIONE: { ...original[0].prezzi.REALIZZAZIONE, Medio: '1500' } }, descrizioni: { ...original[0].descrizioni, Semplice: 'nuova' } }];
  expect(isDirty(original, edited)).toBe(true);
  expect([...changedCells(original, edited)].sort()).toEqual(['0|descrizioni.Semplice', '0|prezzi.REALIZZAZIONE.Medio']);
  expect(isDirty(original, [{ ...edited[0], prezzi: original[0].prezzi, descrizioni: original[0].descrizioni }])).toBe(false);
});
describe('price check while typing (the same rules as the server)', () => {
  test.each([['1400', 2800, {}], ['1.234,50', 5000, {}], ['€ 600', 1200, {}], ['1250.5', 2000, {}], ['0', 0, {}], ['', 0, {}]])('%s with base %s is fine', (raw, base, expected) => expect(priceProblem(raw, base)).toEqual(expected));
  test('an empty price where the tender has one is an error', () => expect(priceProblem('', 2800).error).toMatch(/manca il prezzo offerto/));
  test('text and negative amounts are errors', () => { expect(priceProblem('abc', 100).error).toMatch(/non è un importo/); expect(priceProblem('-5', 100).error).toMatch(/negativo/); expect(priceProblem('12,3,4', 100).error).toBeDefined(); });
  test('above the base and zero where the tender has a price are only warnings', () => { expect(priceProblem('3000', 2800).warning).toMatch(/supera la base/); expect(priceProblem('0', 2800).warning).toMatch(/è 0/); });
});
test('the whole table: errors block, warnings do not, long descriptions are refused', () => {
  const ok = toEditable(row());
  expect(tableProblems([ok])).toEqual({ errors: [], warnings: [] });
  const bad = { ...ok, prezzi: { ...ok.prezzi, MODIFICA: { ...ok.prezzi.MODIFICA, Medio: 'xx' } }, descrizione: 'x'.repeat(2001) };
  const found = tableProblems([bad]);
  expect(found.errors).toEqual(expect.arrayContaining([expect.stringMatching(/ID 236 · Modifica Medio: non è un importo/), expect.stringMatching(/Descrizione Driver: supera 2000/)]));
  expect(tableProblems([{ ...ok, prezzi: { ...ok.prezzi, REALIZZAZIONE: { ...ok.prezzi.REALIZZAZIONE, Medio: '9999' } } }]).warnings[0]).toMatch(/Realizzazione Medio: supera la base/);
});
test('the tender price of a cell is read from the row', () => { expect(gara(row(), 'REALIZZAZIONE', 'Medio')).toBe(2800); expect(gara(row({ prezziGara: {} }), 'MODIFICA', 'Semplice')).toBeNull(); });
