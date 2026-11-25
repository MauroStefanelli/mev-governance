import { reviewIsCurrent, planReview, chunk, isRetryable, VALID_STATUS } from './reviewPlan';

const sig = input => JSON.stringify(input);
const input = (rowId, extra = {}) => ({ rowId, detail: { quantity: 1 }, ...extra });
const done = (i, status = 'coerente') => ({ rowId: i.rowId, status, reason: 'ok', signature: sig(i) });

describe('a row is up to date only with a valid judgement and unchanged data', () => {
  const a = input('a');
  test('a valid judgement with the same data is up to date', () => VALID_STATUS.forEach(status => expect(reviewIsCurrent(done(a, status), a, sig)).toBe(true)));
  test('no judgement, an error or an empty reason are NOT up to date', () => {
    expect(reviewIsCurrent(undefined, a, sig)).toBe(false);
    expect(reviewIsCurrent({ ...done(a), status: 'error' }, a, sig)).toBe(false);
    expect(reviewIsCurrent({ ...done(a), reason: '   ' }, a, sig)).toBe(false);
    expect(reviewIsCurrent({ ...done(a), status: 'boh' }, a, sig)).toBe(false);
  });
  test('data changed after the verification: it must be redone', () => expect(reviewIsCurrent(done(a), { ...a, detail: { quantity: 2 } }, sig)).toBe(false));
});

describe('what to do when the button is pressed again', () => {
  const rows = Array.from({ length: 45 }, (_, i) => input(String(i)));
  const reviews = Object.fromEntries(rows.slice(0, 15).map(r => [r.rowId, done(r)]));
  test('it resumes: the 15 rows already verified are skipped, the other 30 are done', () => {
    const plan = planReview(rows, reviews, sig);
    expect(plan).toMatchObject({ total: 45, alreadyDone: 15, resumed: true, nothingToDo: false });
    expect(plan.todo.map(r => r.rowId)).toEqual(rows.slice(15).map(r => r.rowId));
  });
  test('rows that failed before are redone, rows whose data changed are redone', () => {
    const mixed = { ...reviews, '3': { ...done(rows[3]), status: 'error' }, '4': done({ ...rows[4], detail: { quantity: 9 } }) };
    expect(planReview(rows, mixed, sig).todo.slice(0, 2).map(r => r.rowId)).toEqual(['3', '4']);
    expect(planReview(rows, mixed, sig).alreadyDone).toBe(13);
  });
  test('with nothing verified yet it is a normal full run, not a «resume»', () => expect(planReview(rows, {}, sig)).toMatchObject({ alreadyDone: 0, resumed: false, nothingToDo: false }));
  test('when every row is up to date there is nothing to do (it says so, no AI call)', () => {
    const everything = Object.fromEntries(rows.map(r => [r.rowId, done(r)]));
    expect(planReview(rows, everything, sig)).toMatchObject({ alreadyDone: 45, nothingToDo: true, resumed: false });
  });
  test('«verify everything again» ignores the judgements already there', () => {
    const everything = Object.fromEntries(rows.map(r => [r.rowId, done(r)]));
    expect(planReview(rows, everything, sig, { force: true })).toMatchObject({ alreadyDone: 0, nothingToDo: false });
    expect(planReview(rows, everything, sig, { force: true }).todo).toHaveLength(45);
  });
  test('it never throws on empty input', () => { expect(planReview(undefined, undefined, sig)).toMatchObject({ total: 0, nothingToDo: false }); expect(planReview([], {}, sig).todo).toEqual([]); });
});
test('work is split in groups of 5, the last one smaller', () => { expect(chunk(Array.from({ length: 12 }, (_, i) => i)).map(g => g.length)).toEqual([5, 5, 2]); expect(chunk([])).toEqual([]); });
describe('which errors are worth a new try', () => {
  test.each([['Risposta AI incompleta: mancano le verifiche per riga.', true], ['Verifica AI non riuscita. Controlla la configurazione AI personale e riprova', true], ['Errore HTTP 502', true], ['network error', true]])('%s -> retry %s', (m, r) => expect(isRetryable(m)).toBe(r));
  test.each([['Chiave AI non configurata o non valida', false], ['Errore HTTP 401', false], ['Errore HTTP 403', false], ['Unauthorized', false]])('%s -> NO retry', m => expect(isRetryable(m)).toBe(false));
});

describe('the status of the verification, from the judgements only', () => {
  const { reviewStatus } = require('./reviewPlan');
  const rows = Array.from({ length: 45 }, (_, i) => input(String(i)));
  const verified = n => Object.fromEntries(rows.slice(0, n).map(r => [r.rowId, done(r)]));
  test('15 of 45 verified is 33% and PARTIAL, never complete', () => expect(reviewStatus(rows, verified(15), sig)).toMatchObject({ total: 45, verified: 15, remaining: 30, state: 'partial', percent: 33 }));
  test('nothing verified: none, 0%', () => expect(reviewStatus(rows, {}, sig)).toMatchObject({ verified: 0, state: 'none', percent: 0 }));
  test('all verified: complete, 100%', () => expect(reviewStatus(rows, verified(45), sig)).toMatchObject({ verified: 45, remaining: 0, state: 'complete', percent: 100 }));
  test('100% only when EVERY row is verified: 44 of 45 rounds to 98%, not 100%', () => expect(reviewStatus(rows, verified(44), sig)).toMatchObject({ percent: 98, state: 'partial' }));
  test('a row with an error is NOT verified and is counted as failed; a row never judged is missing', () => {
    const r = { ...verified(10), '10': { ...done(rows[10]), status: 'error' } };
    expect(reviewStatus(rows, r, sig)).toMatchObject({ verified: 10, failed: 1, missing: 34, remaining: 35 });
  });
  test('a judgement whose data changed afterwards is OUTDATED, not verified', () => {
    const r = { ...verified(3), '1': done({ ...rows[1], detail: { quantity: 99 } }) };
    expect(reviewStatus(rows, r, sig)).toMatchObject({ verified: 2, outdated: 1, remaining: 43, state: 'partial' });
  });
  test('the numbers always add up', () => { const s = reviewStatus(rows, { ...verified(7), '8': { ...done(rows[8]), status: 'error' } }, sig); expect(s.verified + s.failed + s.outdated + s.missing).toBe(45); });
  test('no rows: empty', () => { expect(reviewStatus([], {}, sig)).toMatchObject({ state: 'empty', percent: 0 }); expect(reviewStatus(undefined, undefined, sig).state).toBe('empty'); });
});
