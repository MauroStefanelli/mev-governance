import { saveImportedRevision } from './importRevision';
import { workspaceRequest } from '../services/mevService';
jest.mock('../services/mevService', () => ({ workspaceRequest: jest.fn() }));
beforeEach(() => workspaceRequest.mockReset());
test('Excel import creates the first persisted revision with the imported estimate', async () => {
  workspaceRequest.mockResolvedValueOnce([]).mockResolvedValueOnce({ version: 1 });
  await saveImportedRevision({ code: '145480', title: 'UPU', system: 'SAP' }, { items: [{ id: 239 }] }, 'offerta.xlsx');
  expect(workspaceRequest).toHaveBeenLastCalledWith('145480/revisions', expect.objectContaining({ expectedVersion: 0,
    state: expect.objectContaining({ title: 'UPU', estimate: { items: [{ id: 239 }] } }) }));
});
test('reimport preserves prior analysis and decisions and uses optimistic concurrency', async () => {
  workspaceRequest.mockResolvedValueOnce([{ version: 3, payload: JSON.stringify({ asIs: 'Analisi', decisions: [{ id: 'approved' }] }) }]).mockRejectedValueOnce(new Error('Conflitto'));
  await expect(saveImportedRevision({ code: '145480', title: 'UPU' }, { items: [] }, 'nuova.xlsx')).rejects.toThrow('Conflitto');
  expect(workspaceRequest).toHaveBeenLastCalledWith('145480/revisions', expect.objectContaining({ expectedVersion: 3,
    state: expect.objectContaining({ asIs: 'Analisi', decisions: [{ id: 'approved' }] }) }));
});
