import { saveInitiativeSnapshot, verifiedPlanSnapshot } from './saveInitiativeSnapshot';
import { saveAndClose } from './saveAndClose';
import { workspaceRequest } from '../services/mevService';
jest.mock('../services/mevService', () => ({ workspaceRequest: jest.fn() }));
const plans = { 'detail-29': { aiProposal: { analysis: { solution: 'Attività 29', acceptance: 'Test 29' } } } };
const body = { payload: { initiative: { code: 'GOTO', title: 'Test' }, developmentPlans: plans } };
beforeEach(() => workspaceRequest.mockReset());
test('Save and Close persists Activity 29 in both offer and shared revision', async () => {
  workspaceRequest.mockResolvedValueOnce([{ version: 1, payload: JSON.stringify({ decisions: [], estimate: { developmentPlans: {} } }) }]);
  workspaceRequest.mockImplementationOnce(async (path, request) => ({ version: 2, payload: JSON.stringify(request.state) }));
  const offerSave = jest.fn(async request => ({ payload: JSON.stringify(request.payload) }));
  const close = jest.fn();
  await saveAndClose(async () => { await saveInitiativeSnapshot(body, { goto: 'GOTO', version: 1, analysis: { decisions: [] } }, offerSave); return true; }, close);
  const saved = workspaceRequest.mock.calls[1][1].state;
  expect(saved.estimate.developmentPlans['detail-29'].aiProposal.analysis.solution).toBe('Attività 29');
  expect(close).toHaveBeenCalled();
  expect(offerSave).toHaveBeenCalledWith(body);
});
test('rejects a success response that omitted plans', async () => {
  workspaceRequest.mockResolvedValueOnce([]);
  await expect(saveInitiativeSnapshot(body, null, async () => ({ payload: {} }))).rejects.toThrow('non ha confermato');
  expect(workspaceRequest).toHaveBeenCalledTimes(1);
});
test('reports partial save and prevents closing on revision conflict', async () => {
  workspaceRequest.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Conflitto'));
  await expect(saveInitiativeSnapshot(body, null, async () => ({ payload: body.payload }))).rejects.toThrow('Offerta salvata, ma storico non aggiornato');
});
test('compares JSONB plans independent of object property ordering', () => {
  expect(verifiedPlanSnapshot({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
});
