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
