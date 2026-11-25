import { percentDone, countByStatus, attentionRows, catalogHotspots, summarize, STATUS_ORDER } from './reviewSummary';

const row = (rowId, status, extra = {}) => ({ rowId, interventionId: extra.interventionId ?? 'I1', activity: extra.activity ?? `Attivita ${rowId}`, catalogName: extra.catalogName ?? 'Servizio/API/Microservizio',
  review: status ? { status, reason: extra.reason ?? `motivo ${rowId}`, suggestion: extra.suggestion ?? '', model: extra.model } : null });

describe('percentage of the work done', () => {
  test.each([[0, 10, 0], [5, 10, 50], [10, 10, 100], [1, 3, 33], [2, 3, 67], [7, 5, 100], [-2, 5, 0], [3, 0, 0], ['x', 5, 0], [undefined, undefined, 0]])('%s of %s = %s%%', (done, total, expected) => expect(percentDone(done, total)).toBe(expected));
});
describe('count by status', () => {
  const reviews = { a: { status: 'coerente' }, b: { status: 'da_verificare' }, c: { status: 'non_coerente' }, d: { status: 'error' }, f: { status: 'qualcosa-di-strano' } };
  test('a row with no result is WAITING, never counted as coherent', () => {
    expect(countByStatus(['a', 'b', 'c', 'd', 'e'], reviews)).toEqual({ coerente: 1, da_verificare: 1, non_coerente: 1, error: 1, waiting: 1 });
  });
  test('an unknown status is not counted as coherent either', () => expect(countByStatus(['f'], reviews)).toMatchObject({ coerente: 0, waiting: 1 }));
  test('the counts always add up to the number of rows', () => {
    const c = countByStatus(['a', 'b', 'c', 'd', 'e', 'f'], reviews); expect(Object.values(c).reduce((x, y) => x + y, 0)).toBe(6);
  });
});
describe('rows that need attention', () => {
  const entries = [row('1', 'coerente'), row('2', 'da_verificare', { interventionId: 'I2' }), row('3', 'non_coerente', { interventionId: 'I10' }), row('4', 'error', { interventionId: 'I1' }), row('5', 'non_coerente', { interventionId: 'I2' }), row('6', null)];
  test('coherent and not-yet-checked rows are left out; the most serious come first', () => {
    const list = attentionRows(entries);
    expect(list.map(r => r.rowId)).toEqual(['5', '3', '2', '4']);
    expect(list.map(r => r.status)).toEqual(['non_coerente', 'non_coerente', 'da_verificare', 'error']);
  });
  test('within the same severity the interventions are in natural order (I2 before I10)', () => expect(attentionRows(entries).slice(0, 2).map(r => r.interventionId)).toEqual(['I2', 'I10']));
  test('it keeps only what the AI wrote, cut for reading; nothing is invented when there is no suggestion', () => {
    const [first] = attentionRows([row('9', 'da_verificare', { reason: 'x'.repeat(400), suggestion: '' })]);
    expect(first.reason.length).toBeLessThanOrEqual(260); expect(first.reason.endsWith('…')).toBe(true); expect(first.suggestion).toBe('');
  });
  test('the list is limited', () => expect(attentionRows(Array.from({ length: 20 }, (_, i) => row(String(i), 'non_coerente')), { limit: 4 })).toHaveLength(4));
  test('it never throws on empty input', () => { expect(attentionRows(undefined)).toEqual([]); expect(attentionRows([])).toEqual([]); });
});
describe('catalog voices to look at first', () => {
  test('counted from the rows that need attention, most serious first', () => {
    const entries = [row('1', 'da_verificare', { catalogName: 'A' }), row('2', 'da_verificare', { catalogName: 'A' }), row('3', 'non_coerente', { catalogName: 'B' }), row('4', 'coerente', { catalogName: 'A' }), row('5', 'da_verificare', { catalogName: 'C' })];
    expect(catalogHotspots(entries)).toEqual([{ name: 'B', count: 1, bad: 1 }, { name: 'A', count: 2, bad: 0 }, { name: 'C', count: 1, bad: 0 }]);
  });
  test('coherent rows and rows with no voice do not count', () => expect(catalogHotspots([row('1', 'coerente'), row('2', 'da_verificare', { catalogName: '' })])).toEqual([]));
});
describe('the whole summary', () => {
  test('verdict: bad if any possible inconsistency, warn if only to verify, ok if all coherent, partial if some are still waiting', () => {
    expect(summarize([row('1', 'coerente'), row('2', 'non_coerente')]).verdict).toBe('bad');
    expect(summarize([row('1', 'coerente'), row('2', 'da_verificare')]).verdict).toBe('warn');
    expect(summarize([row('1', 'coerente'), row('2', 'error')]).verdict).toBe('warn');
    expect(summarize([row('1', 'coerente'), row('2', 'coerente')]).verdict).toBe('ok');
    expect(summarize([row('1', 'coerente'), row('2', null)]).verdict).toBe('partial');
    expect(summarize([]).verdict).toBe('empty');
  });
  test('«all coherent» is NOT claimed while rows are missing or failed', () => {
    expect(summarize([row('1', 'coerente'), row('2', null)]).verdict).not.toBe('ok');
    expect(summarize([row('1', 'coerente'), row('2', 'error')]).verdict).not.toBe('ok');
  });
  test('the numbers: rows reviewed, to check, share of coherent ones, interventions involved, models', () => {
    const s = summarize([row('1', 'coerente', { model: 'm1' }), row('2', 'da_verificare', { interventionId: 'I2', model: 'm1' }), row('3', 'non_coerente', { interventionId: 'I2' }), row('4', 'non_coerente', { interventionId: 'I3' }), row('5', null)]);
    expect(s).toMatchObject({ total: 5, reviewed: 4, toCheck: 3, percentCoherent: 25, interventionsToCheck: 2, models: ['m1'] });
    expect(s.counts).toMatchObject({ coerente: 1, da_verificare: 1, non_coerente: 2, waiting: 1 });
  });
  test('the order of the statuses is fixed', () => expect(STATUS_ORDER).toEqual(['non_coerente', 'da_verificare', 'error', 'coerente']));
});
