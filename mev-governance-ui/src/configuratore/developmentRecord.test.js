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

describe('applications of an initiative', () => {
  const { loadApplicationsFor, applicationScope, applicationDiagnosis } = require('./developmentRecord');
  const { getSharedApplications } = require('../services/mevService');
  const bep = { id: 'b', name: 'BEP', codeUrl: '/src/bep' };
  beforeEach(() => getSharedApplications.mockReset());

  test('looks under the catalog contract the estimate was built on, not the environment code', async () => {
    getSharedApplications.mockImplementation(async (contract, lot) => (contract === 'poste-tet-2025' && lot === '2' ? [bep] : null));
    const apps = await loadApplicationsFor({ catalogSource: { contractId: 'poste-tet-2025', lot: '2' } }, { contractId: '4490015980', lot: '2' });
    expect(apps).toEqual([bep]);
    expect(getSharedApplications).toHaveBeenCalledWith('poste-tet-2025', '2');
  });

  test('also includes applications saved under the environment scope, without duplicates', async () => {
    getSharedApplications.mockImplementation(async (contract) => (contract === '4490015980' ? [bep, { id: 'x', code: 'AP-1', name: 'Altra' }] : [{ id: 'y', code: 'AP-1', name: 'Altra' }]));
    const apps = await loadApplicationsFor({ catalogSource: { contractId: 'altro-contratto', lot: '2' } }, { contractId: '4490015980', lot: '2' });
    expect(apps.map(app => app.name)).toEqual(['Altra', 'BEP']);
  });

  test('finds an application added in the environment scope even when the catalog scope has the built-in defaults', async () => {
    getSharedApplications.mockImplementation(async (contract) => (contract === '4490015980' ? [bep] : null));
    const apps = await loadApplicationsFor({ catalogSource: { contractId: 'poste-tet-2025', lot: '2' } }, { contractId: '4490015980', lot: '2' });
    expect(apps.some(app => app.name === 'BEP')).toBe(true);
    expect(apps.length).toBeGreaterThan(1);
  });

  test('uses the environment scope for evaluations saved without a catalog source', async () => {
    getSharedApplications.mockResolvedValue([bep]);
    await loadApplicationsFor({}, { contractId: '4490015980', lot: '2' });
    expect(getSharedApplications).toHaveBeenCalledWith('4490015980', '2');
    expect(applicationScope({}, { contractId: 'C', lot: 3 })).toEqual({ contractId: 'C', lot: '3' });
  });

  describe('which applications belong to an initiative (real case: TBD · cr post uat, empty System, ILP chosen)', () => {
    const { applicationsForInitiative } = require('./developmentRecord');
    const { applicationContextFor } = require('./configuratoreCore');
    const APPS = ['NPSO', 'ILP', 'IPER', 'IPERSUITE', 'SAP LES'].map((name, i) => ({ id: `application-${i}`, name, code: '', systemAliases: [name] }));
    const names = list => list.map(app => app.name);
    test('an initiative with an empty System but a chosen application has that application', () => {
      expect(names(applicationsForInitiative({ initiative: { system: '' }, selectedAppIds: ['application-1'] }, APPS, '2'))).toEqual(['ILP']);
    });
    test('chosen applications and the ones named in System are both kept, once each', () => {
      expect(names(applicationsForInitiative({ initiative: { system: 'ILP, NPSO' }, selectedAppIds: ['application-1'] }, APPS, '2'))).toEqual(['ILP', 'NPSO']);
    });
    test('a chosen application that no longer exists is ignored, not an error', () => {
      expect(applicationsForInitiative({ initiative: { system: '' }, selectedAppIds: ['gone'] }, APPS, '2')).toEqual([]);
      expect(applicationsForInitiative({}, APPS, '2')).toEqual([]);
    });
    test('IPER finds IPER and not IPERSUITE, and every name of the System field is read on its own', () => {
      expect(names(applicationContextFor('IPER', APPS))).toEqual(['IPER']);
      expect(names(applicationContextFor('IPERSUITE', APPS))).toEqual(['IPERSUITE']);
      expect(names(applicationContextFor('IPER, IPERSUITE', APPS))).toEqual(['IPER', 'IPERSUITE']);
      expect(names(applicationContextFor('NPSO; ILP', APPS))).toEqual(['NPSO', 'ILP']);
      expect(names(applicationContextFor('SAP LES', APPS))).toEqual(['SAP LES']);
    });
    test('a looser name still finds its application when no exact name exists', () => {
      expect(names(applicationContextFor('SAP', APPS))).toEqual(['SAP LES']);
      expect(applicationContextFor('', APPS)).toEqual([]);
    });
  });

  test('the diagnosis names the contract, and says what is missing when the System is empty', () => {
    const apps = [{ name: 'NPSO' }, { name: 'ILP' }];
    const named = applicationDiagnosis('BEP', apps, { contractId: 'poste-tet-2025', lot: '2' }, 'Poste Italiane – Tracciatura e Logistica Integrata');
    expect(named).toContain('«Poste Italiane – Tracciatura e Logistica Integrata»'); expect(named).not.toContain('poste-tet-2025');
    expect(applicationDiagnosis('BEP', apps, { contractId: 'poste-tet-2025', lot: '2' })).toContain('«poste-tet-2025»');
    const empty = applicationDiagnosis('', apps, { contractId: 'C', lot: '2' }, 'Contratto C');
    expect(empty).toContain('non ha un Sistema'); expect(empty).toContain('+ Aggiungi applicativo…'); expect(empty).not.toContain('alias'); expect(empty).not.toContain('«»');
  });

  test('the diagnosis says where it looked and what it found', () => {
    expect(applicationDiagnosis('BEP', [], { contractId: 'C', lot: '2' })).toContain('nessun applicativo configurato');
    const text = applicationDiagnosis('BEP', [{ name: 'NPSO' }, { name: 'IPER' }], { contractId: 'C', lot: '2' });
    expect(text).toContain('NPSO, IPER'); expect(text).toContain('alias');
  });
});
