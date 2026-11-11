import { normalizePm, pmOptions, isKnownPm, loadPmPoste, pmSelectValue, pmFromSelect, showsFreeText, OTHER } from './pmPoste';
import { getMevOptions } from '../services/mevService';
jest.mock('../services/mevService', () => ({ getMevOptions: jest.fn() }));

test('names are compared ignoring case and extra spaces, and shown as first written', () => {
  expect(normalizePm('  Mario   Rossi ')).toBe('Mario Rossi');
  expect(normalizePm(null)).toBe('');
  expect(pmOptions(['Rossi Mario', 'rossi  mario', 'Bianchi Anna', '', null], '')).toEqual(['Bianchi Anna', 'Rossi Mario']);
});

test('the value already on the initiative is always selectable, even if MEV does not list it', () => {
  expect(pmOptions(['Bianchi Anna'], 'Verdi Luca')).toEqual(['Bianchi Anna', 'Verdi Luca']);
  expect(pmOptions(['Bianchi Anna'], 'bianchi anna')).toEqual(['Bianchi Anna']);
  expect(pmOptions(undefined, 'Solo Io')).toEqual(['Solo Io']);
  expect(pmOptions(undefined, '')).toEqual([]);
});

test('a value is known when it is empty or listed, whatever its case', () => {
  expect(isKnownPm(['Rossi Mario'], '')).toBe(true);
  expect(isKnownPm(['Rossi Mario'], ' rossi mario ')).toBe(true);
  expect(isKnownPm(['Rossi Mario'], 'Verdi')).toBe(false);
  expect(isKnownPm(undefined, 'Verdi')).toBe(false);
});

test('the list comes from the same options as MEV and MEV-CAP, and a failure leaves the field free', async () => {
  getMevOptions.mockResolvedValueOnce({ pmPoste: ['Rossi Mario', 'Bianchi Anna', 'rossi mario'], pmCap: ['Altro'] });
  expect(await loadPmPoste()).toEqual(['Bianchi Anna', 'Rossi Mario']);
  getMevOptions.mockRejectedValueOnce(new Error('401'));
  expect(await loadPmPoste()).toBeNull();
  getMevOptions.mockResolvedValueOnce({});
  expect(await loadPmPoste()).toEqual([]);
});

test('the select shows the listed name, none, or "other" for a free-text value', () => {
  const list = ['Bianchi Anna', 'Rossi Mario'];
  expect(pmSelectValue(list, '')).toBe('');
  expect(pmSelectValue(list, null)).toBe('');
  expect(pmSelectValue(list, 'rossi  mario')).toBe('Rossi Mario');
  expect(pmSelectValue(list, 'Verdi Luca')).toBe(OTHER);
  expect(pmSelectValue(undefined, 'Verdi Luca')).toBe(OTHER);
});

test('choosing a name sets it; choosing "other" keeps a free-text value or starts an empty one', () => {
  const list = ['Bianchi Anna', 'Rossi Mario'];
  expect(pmFromSelect(list, 'Rossi Mario', '')).toBe('Rossi Mario');
  expect(pmFromSelect(list, '', 'Rossi Mario')).toBe('');
  expect(pmFromSelect(list, OTHER, 'Rossi Mario')).toBe('');
  expect(pmFromSelect(list, OTHER, 'Verdi Luca')).toBe('Verdi Luca');
  expect(pmFromSelect(list, OTHER, '')).toBe('');
});

test('the free-text box is offered only with a list, for an unlisted value or after choosing "other"', () => {
  const list = ['Rossi Mario'];
  expect(showsFreeText(list, 'Rossi Mario')).toBe(false);
  expect(showsFreeText(list, '')).toBe(false);
  expect(showsFreeText(list, '', true)).toBe(true);
  expect(showsFreeText(list, 'Verdi Luca')).toBe(true);
  expect(showsFreeText(null, 'Verdi Luca')).toBe(false);
  expect(showsFreeText([], 'Verdi Luca', true)).toBe(false);
});
