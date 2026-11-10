import { loadDevelopmentState, saveDevelopmentState, activitySignature, activityChanges, developmentRecordKey } from './developmentRecord';
import { getConfiguratoreRecords, upsertConfiguratoreRecord } from '../services/mevService';
jest.mock('../services/mevService', () => ({ getConfiguratoreRecords: jest.fn(), upsertConfiguratoreRecord: jest.fn(), getSharedApplications: jest.fn() }));

const evaluation = { initiative: { code: 'GOTO1', title: 'Titolo' }, lot: '2', contractId: 'C1', items: [{ sourceRowId: 'detail-29', interventionId: 'I1', reason: 'R' }] };
const offer = { record_key: 'C1|2|initiative|goto1', contract_id: 'C1', lot_id: '2', payload: JSON.stringify(evaluation) };
const plans = { 'detail-29': { aiProposal: { analysis: { solution: 'Soluzione 29', acceptance: 'Test 29' } }, status: 'Soluzione definita' } };
let store;
beforeEach(() => {
  store = [];
  getConfiguratoreRecords.mockReset().mockImplementation(async params => ({ records: store.filter(r => r.entity_type === params.entity_type) }));
  upsertConfiguratoreRecord.mockReset().mockImplementation(async body => {
    const saved = { ...body, payload: JSON.stringify(body.payload) };
    store = [...store.filter(r => r.record_key !== body.record_key), saved]; return saved;
  });
});

test('Activity 29 survives save, close and reopening from the offer record', async () => {
  const first = await loadDevelopmentState(offer);
  expect(first.source).toBe('new');
  const revision = await saveDevelopmentState(first, { plans, preparation: { name: 'p' }, delivery: { tool: 'vscode', branch: 'b', notes: '', tests: '' }, activities: activitySignature([]) });
  expect(revision).toBe(1);
  const reopened = await loadDevelopmentState(offer);
  expect(reopened.source).toBe('saved');
  expect(reopened.plans['detail-29'].aiProposal.analysis.solution).toBe('Soluzione 29');
  expect(reopened.delivery.branch).toBe('b');
  expect(store[0].entity_type).toBe('implementation_plan');
  expect(store[0].record_key).toBe(developmentRecordKey('C1', '2', 'GOTO1'));
});

test('offering saved again does not touch the development record', async () => {
  const first = await loadDevelopmentState(offer);
  await saveDevelopmentState(first, { plans, preparation: {}, delivery: {}, activities: [] });
  const newer = { ...offer, payload: JSON.stringify({ ...evaluation, developmentPlans: {}, items: [] }) };
  expect((await loadDevelopmentState(newer)).plans['detail-29'].aiProposal.analysis.solution).toBe('Soluzione 29');
});

test('plans saved in the old Configuratore evaluation are offered as a starting point', async () => {
  const legacy = { ...offer, payload: JSON.stringify({ ...evaluation, developmentPlans: plans }) };
  const state = await loadDevelopmentState(legacy);
  expect(state.source).toBe('legacy');
  expect(state.plans['detail-29'].status).toBe('Soluzione definita');
});

test('a colleague save after opening blocks the write and keeps the user work', async () => {
  const mine = await loadDevelopmentState(offer);
  const theirs = await loadDevelopmentState(offer);
  await saveDevelopmentState(theirs, { plans: {}, preparation: {}, delivery: {}, activities: [] });
  await expect(saveDevelopmentState(mine, { plans, preparation: {}, delivery: {}, activities: [] })).rejects.toThrow('Un collega ha salvato');
  expect(upsertConfiguratoreRecord).toHaveBeenCalledTimes(1);
});

test('does not report success when the server omits the plans', async () => {
  const state = await loadDevelopmentState(offer);
  upsertConfiguratoreRecord.mockImplementationOnce(async body => ({ ...body, payload: JSON.stringify({ revision: 1, plans: {} }) }));
  await expect(saveDevelopmentState(state, { plans, preparation: {}, delivery: {}, activities: [] })).rejects.toThrow('non ha confermato');
});

test('refuses an evaluation with neither GOTO nor title', async () => {
  await expect(loadDevelopmentState({ ...offer, payload: JSON.stringify({ initiative: {} }) })).rejects.toThrow('né GOTO né titolo');
});

test('reports changed, added and removed activities after the offer is re-imported', () => {
  const saved = [{ key: 'a', interventionId: 'I', description: 'uno' }, { key: 'b', interventionId: 'I', description: 'due' }];
  const now = [{ key: 'a', interventionId: 'I', description: 'uno modificato' }, { key: 'c', interventionId: 'I', description: 'tre' }];
  expect(activityChanges(saved, now)).toEqual({ changed: ['a'], added: ['c'], removed: ['b'] });
  expect(activityChanges(null, now)).toEqual({ changed: [], added: [], removed: [] });
});
