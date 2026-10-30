import { createMevFilters } from './mevFilters';

const fields = { oda: 'bc', kind: 'tipoContratto', amount: 'impSubco', names: r => r.names };
const rows = [
  { bc: 'A', tipoContratto: 'X', impSubco: 0, names: ['Alfa', 'Beta'], note: 'Urgente' },
  { bc: 'B', tipoContratto: 'Y', impSubco: 10, names: ['Gamma'], note: 'Ordinario' },
  { bc: null, tipoContratto: 'X', impSubco: null, names: [], note: '' },
];
test.each([
  [{ kind: ['X'] }, 'oda', ['(vuoto)', 'A']],
  [{ amount: ['0'] }, 'oda', ['A']],
  [{ names: ['Beta'] }, 'oda', ['A']],
  [{ oda: ['(vuoto)'] }, 'names', ['(vuoto)']],
  [{ oda: ['A'] }, 'oda', ['(vuoto)', 'A', 'B']],
  [{ oda: ['A', 'B'] }, 'kind', ['X', 'Y']],
  [{ note: 'URGENTE' }, 'oda', ['A']],
])('compatible options for %j', (filters, key, expected) => {
  const result = createMevFilters(rows, filters, fields, ['note']);
  expect(result.options(key, true)).toEqual(expected);
});
test('zero is a value, while null and whitespace are empty', () => {
  const result = createMevFilters([...rows, { impSubco: '  ' }], {}, fields);
  expect(result.options('amount', true)).toEqual(['(vuoto)', '0', '10']);
  expect(createMevFilters(rows, { names: ['Beta'], amount: ['0'] }, fields).filteredRows).toEqual([rows[0]]);
});
