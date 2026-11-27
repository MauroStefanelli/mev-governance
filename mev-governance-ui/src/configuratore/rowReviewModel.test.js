import { rowState, shortDescription, shortReason, summarize, sortRows, filterRows, SEVERITY } from './rowReviewModel';

describe('the state of a row', () => {
  test('no judgement, a current judgement, a stale one and an unknown status', () => {
    expect(rowState(undefined, false)).toBe('none'); expect(rowState({ status: 'coerente' }, false)).toBe('coerente'); expect(rowState({ status: 'non_coerente' }, true)).toBe('stale'); expect(rowState({ status: 'boh' }, false)).toBe('none');
  });
  test('the most urgent first: incoherent, to check, error, stale, none, coherent', () => {
    expect(Object.keys(SEVERITY).sort((a, b) => SEVERITY[a] - SEVERITY[b])).toEqual(['non_coerente', 'da_verificare', 'error', 'stale', 'none', 'coerente']);
  });
});
describe('the short description of a row', () => {
  test('the description of the activity first, then the reason, then the component, then the intervention', () => {
    expect(shortDescription({ detail: { detailDescription: 'Invio della prenotazione' }, reason: 'altro' })).toBe('Invio della prenotazione');
    expect(shortDescription({ detail: {}, reason: 'Il motivo' })).toBe('Il motivo'); expect(shortDescription({ detail: { componentApplication: 'API' } })).toBe('API'); expect(shortDescription({ interventionTitle: 'Titolo' })).toBe('Titolo');
    expect(shortDescription({})).toBe('Nessuna descrizione');
  });
  test('it never exceeds the size and collapses blanks and new lines', () => {
    const text = shortDescription({ detail: { detailDescription: `riga uno\n\n   riga   due ${'x'.repeat(300)}` } }, 60); expect(text.length).toBeLessThanOrEqual(60); expect(text.endsWith('…')).toBe(true); expect(text).not.toMatch(/\n|  /);
    expect(shortDescription({ detail: { detailDescription: 'corta' } }, 60)).toBe('corta');
  });
  test('the reason of the AI is shortened the same way, and empty when there is no judgement', () => {
    expect(shortReason(undefined)).toBe(''); expect(shortReason({ reason: 'a'.repeat(400) }, 100).length).toBe(100); expect(shortReason({ reason: ' ok ' })).toBe('ok');
  });
});
describe('counting, sorting and filtering', () => {
  const rows = [{ state: 'coerente', position: 0 }, { state: 'non_coerente', position: 1 }, { state: 'none', position: 2 }, { state: 'da_verificare', position: 3 }, { state: 'coerente', position: 4 }, { state: 'stale', position: 5 }];
  test('counts per state, with the total', () => { expect(summarize(rows)).toEqual({ all: 6, coerente: 2, non_coerente: 1, none: 1, da_verificare: 1, stale: 1 }); });
  test('sorted by urgency, and by the order of the file within the same state', () => { expect(sortRows(rows, true).map(r => r.position)).toEqual([1, 3, 5, 2, 0, 4]); });
  test('or in the order of the file', () => { expect(sortRows([...rows].reverse(), false).map(r => r.position)).toEqual([0, 1, 2, 3, 4, 5]); });
  test('sorting never changes the input', () => { const copy = JSON.stringify(rows); sortRows(rows, true); expect(JSON.stringify(rows)).toBe(copy); });
  test('filters: all, the ones to look at, one state', () => {
    expect(filterRows(rows, 'all')).toHaveLength(6); expect(filterRows(rows, 'attention').map(r => r.position)).toEqual([1, 3, 5]); expect(filterRows(rows, 'coerente')).toHaveLength(2); expect(filterRows(rows, 'none')).toHaveLength(1);
  });
});
