import { saveInitiativeSnapshot, verifiedPlanSnapshot, ownRevisionsSince, conflictMessage } from './saveInitiativeSnapshot';
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

describe('who made the history move on', () => {
  const rev = (version, author, extra = {}) => ({ version, author, createdAt: '2026-11-17T09:30:00Z', payload: JSON.stringify({ title: 'T', decisions: [], estimate: { total: version }, ...extra }) });
  const context = { goto: 'GOTO', version: 1, analysis: { title: 'T', decisions: [] } };
  test('revisions written by the same user, with the analysis the page holds, are not a conflict (the estimate and the title change at every save)', () => {
    expect(ownRevisionsSince([rev(3, 'MSTEFANE'), rev(2, 'mstefane'), rev(1, 'MSTEFANE')], context, 'mstefane')).toBe(true);
  });
  test('a colleague in between is a conflict, even if the user saved after the colleague', () => {
    expect(ownRevisionsSince([rev(3, 'MSTEFANE'), rev(2, 'MFABBRI'), rev(1, 'MSTEFANE')], context, 'mstefane')).toBe(false);
  });
  test('the user own revision that changed the analysis (another tab) is a conflict, so typed work is never overwritten', () => {
    expect(ownRevisionsSince([rev(2, 'MSTEFANE', { toBe: 'scritto da un’altra scheda' }), rev(1, 'MSTEFANE')], context, 'mstefane')).toBe(false);
  });
  test('without a known user nothing is taken for the user own', () => {
    expect(ownRevisionsSince([rev(2, 'MSTEFANE'), rev(1, 'MSTEFANE')], context, '')).toBe(false);
    expect(ownRevisionsSince([rev(1, 'MSTEFANE')], context, 'mstefane')).toBe(false);
    expect(ownRevisionsSince([rev(2, '')], context, '')).toBe(false); expect(ownRevisionsSince([rev(2, undefined)], context, '')).toBe(false);
  });
  test('the message says who, when and which version', () => {
    const text = conflictMessage([rev(3, 'MSTEFANE'), rev(2, 'MFABBRI'), rev(1, 'MSTEFANE')], context, 'mstefane');
    expect(text).toContain('MFABBRI ha aggiornato lo storico il 17/11'); expect(text).toContain('versione 2, la tua pagina è ferma alla 1'); expect(text).toContain('il lavoro corrente è conservato');
    expect(conflictMessage([rev(2, 'MSTEFANE', { toBe: 'x' }), rev(1, 'MSTEFANE')], context, 'mstefane')).toContain('Hai già salvato un’altra versione');
  });
});
test('two saves started together run one after the other', async () => {
  const order = []; let release;
  workspaceRequest.mockImplementation(async (path, request) => { if (!request) { order.push('read'); return []; } order.push('write'); await new Promise(resolve => { release = resolve; }); return { version: 1, payload: JSON.stringify(request.state) }; });
  const offer = async request => ({ payload: JSON.stringify(request.payload) });
  const first = saveInitiativeSnapshot(body, null, offer); const second = saveInitiativeSnapshot(body, null, offer);
  await new Promise(resolve => setTimeout(resolve, 20)); expect(order).toEqual(['read', 'write']);
  release(); await first; await new Promise(resolve => setTimeout(resolve, 20)); expect(order).toEqual(['read', 'write', 'read', 'write']);
  release(); await second;
});
test('a failed save does not block the next one', async () => {
  workspaceRequest.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('rete'));
  await expect(saveInitiativeSnapshot(body, null, async () => ({ payload: body.payload }))).rejects.toThrow();
  workspaceRequest.mockResolvedValueOnce([]).mockImplementationOnce(async (path, request) => ({ version: 1, payload: JSON.stringify(request.state) }));
  await expect(saveInitiativeSnapshot(body, null, async () => ({ payload: body.payload }))).resolves.toBeTruthy();
});
