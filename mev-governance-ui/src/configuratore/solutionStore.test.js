import { loadSolution, saveSolution, solutionRecordKey, SOLUTION_ENTITY } from './solutionStore';
import { getConfiguratoreRecords, upsertConfiguratoreRecord } from '../services/mevService';
jest.mock('../services/mevService', () => ({ getConfiguratoreRecords: jest.fn(), upsertConfiguratoreRecord: jest.fn() }));

let store;
const initiative = { code: 'GOTO-1', title: 'Invio' };
beforeEach(() => {
  store = [];
  getConfiguratoreRecords.mockReset().mockImplementation(async params => ({ records: store.filter(r => r.entity_type === params.entity_type && r.contract_id === params.contract_id) }));
  upsertConfiguratoreRecord.mockReset().mockImplementation(async body => { const saved = { ...body, payload: JSON.stringify(body.payload) }; store = [...store.filter(r => r.record_key !== body.record_key), saved]; return saved; });
});
const save = (solution, revision = 0, extra = {}) => saveSolution({ contractId: 'C1', lot: '2', initiative, solution, revision, author: 'Anna Rossi', ...extra });

test('a new initiative starts with an empty solution at revision zero', async () => {
  expect(await loadSolution('C1', 'GOTO-1')).toEqual({ solution: { entries: {}, summary: '', proposed: [] }, revision: 0, exists: false });
  expect(await loadSolution('C1', '  ')).toMatchObject({ revision: 0, exists: false });
  expect(getConfiguratoreRecords).toHaveBeenCalledTimes(1);
});

test('what is saved is exactly what is loaded later, with author and revision', async () => {
  const solution = { entries: { 'OTT-1': { approach: 'Coda con retry', tests: 'Retry' } }, summary: 'Sintesi' };
  const result = await save(solution);
  expect(result).toMatchObject({ revision: 1, updatedBy: 'Anna Rossi' });
  expect(store[0]).toMatchObject({ entity_type: SOLUTION_ENTITY, record_key: solutionRecordKey('C1', 'GOTO-1'), title: 'GOTO-1 · Soluzione' });
  const loaded = await loadSolution('C1', 'goto-1');
  expect(loaded.revision).toBe(1);
  expect(loaded.solution.entries['OTT-1'].approach).toBe('Coda con retry');
  expect(loaded.solution).toMatchObject({ summary: 'Sintesi', updatedBy: 'Anna Rossi' });
});

test('the initiative code is case-insensitive so everyone reaches the same record', async () => {
  expect(solutionRecordKey('C1', ' GOTO-1 ')).toBe(solutionRecordKey('C1', 'goto-1'));
  expect(solutionRecordKey('C1', 'A')).not.toBe(solutionRecordKey('C2', 'A'));
});

test('a colleague who saved first wins: the late save is refused and nothing is written', async () => {
  await save({ entries: { 'OTT-1': { approach: 'Versione di Lucia' } } }, 0);
  const writes = upsertConfiguratoreRecord.mock.calls.length;
  await expect(save({ entries: { 'OTT-1': { approach: 'Versione di Anna' } } }, 0)).rejects.toThrow('Un collega ha salvato');
  expect(upsertConfiguratoreRecord.mock.calls.length).toBe(writes);
  expect(JSON.parse(store[0].payload).entries['OTT-1'].approach).toBe('Versione di Lucia');
});

test('saving on the current revision moves forward one step each time', async () => {
  await save({ entries: { 'OTT-1': { approach: 'A' } } }, 0);
  await save({ entries: { 'OTT-1': { approach: 'B' } } }, 1);
  expect((await loadSolution('C1', 'GOTO-1')).revision).toBe(2);
});

test('it refuses to save without an initiative or with text that is too long', async () => {
  await expect(saveSolution({ contractId: 'C1', lot: '2', initiative: {}, solution: { entries: {} }, revision: 0 })).rejects.toThrow('GOTO');
  await expect(save({ entries: { 'OTT-1': { approach: 'x'.repeat(6001) } } })).rejects.toThrow('supera');
  expect(upsertConfiguratoreRecord).not.toHaveBeenCalled();
});

test('success is not declared when the server returns something different', async () => {
  upsertConfiguratoreRecord.mockImplementationOnce(async body => ({ ...body, payload: JSON.stringify({ ...body.payload, entries: {} }) }));
  await expect(save({ entries: { 'OTT-1': { approach: 'A' } } })).rejects.toThrow('non ha confermato');
});

test('each part of the server answer is checked: revision, entries and summary', async () => {
  const tamper = changes => upsertConfiguratoreRecord.mockImplementationOnce(async body => ({ ...body, payload: JSON.stringify({ ...body.payload, ...changes }) }));
  tamper({ revision: 99 }); await expect(save({ entries: { 'OTT-1': { approach: 'A' } } })).rejects.toThrow('non ha confermato');
  tamper({ summary: 'diversa' }); await expect(save({ entries: { 'OTT-1': { approach: 'A' } }, summary: 'originale' })).rejects.toThrow('non ha confermato');
  tamper({ entries: { 'OTT-1': { approach: 'diverso' } } }); await expect(save({ entries: { 'OTT-1': { approach: 'A' } } })).rejects.toThrow('non ha confermato');
});

test('records of other contracts or other kinds are never read as this solution', async () => {
  store = [{ record_key: solutionRecordKey('C1', 'GOTO-1'), entity_type: 'implementation_plan', contract_id: 'C1', payload: JSON.stringify({ entries: { x: 1 }, revision: 9 }) },
    { record_key: solutionRecordKey('C2', 'GOTO-1'), entity_type: SOLUTION_ENTITY, contract_id: 'C2', payload: JSON.stringify({ entries: { y: 1 }, revision: 5 }) }];
  expect(await loadSolution('C1', 'GOTO-1')).toMatchObject({ exists: false, revision: 0 });
});

// ---- the interventions proposed by the AI travel in the same shared record ----
const proposedItem = (over = {}) => ({ id: 'P-1', title: 'Adeguare la stampa H7', description: 'd', activity: 'a', system: 'ILP', requirements: 'r', rationaleIds: [1], components: ['print-app'], status: 'confermato', byAi: true,
  mappings: [{ catalogId: 236, name: 'Realizzazione Single Page Application', ambit: 'Frontend', type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 2, unit: 4800, component: 'frontend', technology: 'Angular', why: 'maschera', correction: null }], rejectedMappings: [], ...over });

test('the proposed interventions are saved with the solution and come back identical, in the same record', async () => {
  await save({ entries: {}, summary: '', proposed: [proposedItem(), proposedItem({ id: 'P-2', title: 'Escludere CHA', status: 'proposto' })] });
  expect(store).toHaveLength(1); expect(JSON.parse(store[0].payload).proposed).toHaveLength(2);
  const loaded = await loadSolution('C1', 'GOTO-1'); expect(loaded.solution.proposed.map(item => [item.id, item.status])).toEqual([['P-1', 'confermato'], ['P-2', 'proposto']]);
  expect(loaded.solution.proposed[0].mappings[0]).toMatchObject({ catalogId: 236, unit: 4800, qty: 2 });
});
test('a solution saved before this feature existed loads with no proposed interventions', async () => {
  store = [{ record_key: solutionRecordKey('C1', 'GOTO-1'), entity_type: SOLUTION_ENTITY, contract_id: 'C1', payload: JSON.stringify({ version: 1, entries: { 'OTT-1': { approach: 'x' } }, summary: 's', revision: 3 }) }];
  expect((await loadSolution('C1', 'GOTO-1')).solution).toMatchObject({ proposed: [], summary: 's' });
});
test('saving without the list of proposed interventions writes an empty one, not nothing', async () => { await save({ entries: {}, summary: 'x' }); expect(JSON.parse(store[0].payload).proposed).toEqual([]); });
test('a server that does not give back the proposed interventions is NOT taken as a success', async () => {
  upsertConfiguratoreRecord.mockImplementationOnce(async body => ({ ...body, payload: JSON.stringify({ ...body.payload, proposed: [] }) }));
  await expect(save({ entries: {}, summary: '', proposed: [proposedItem()] })).rejects.toThrow('Il server non ha confermato');
});
test('a colleague who saved proposals first wins here too', async () => {
  await save({ entries: {}, summary: '', proposed: [proposedItem({ title: 'Di Lucia' })] }, 0);
  await expect(save({ entries: {}, summary: '', proposed: [proposedItem({ title: 'Di Anna' })] }, 0)).rejects.toThrow('Un collega ha salvato');
});
test('what the server returns is put in order again: foreign ids and empty titles never reach the page', async () => {
  store = [{ record_key: solutionRecordKey('C1', 'GOTO-1'), entity_type: SOLUTION_ENTITY, contract_id: 'C1', payload: JSON.stringify({ revision: 1, entries: {}, proposed: [{ id: '145480', title: 'x' }, { id: 'P-1', title: ' ' }, proposedItem({ id: 'P-3' })] }) }];
  expect((await loadSolution('C1', 'GOTO-1')).solution.proposed.map(item => item.id)).toEqual(['P-3']);
});

