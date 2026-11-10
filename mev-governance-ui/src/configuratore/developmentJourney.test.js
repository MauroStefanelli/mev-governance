import { computeJourney, activityNextStep, isDefined, stateAllowed, developmentSummary, PHASES } from './developmentJourney';

const acts = n => Array.from({ length: n }, (_, i) => ({ key: `d${i + 1}`, number: i + 1, item: { interventionId: 'I1' } }));
const full = { files: 'a.java', solution: 's', acceptance: 'c' };
const base = { activities: acts(3), plans: {}, applications: [{ name: 'NPSO' }], files: [], techProfile: null };
const phase = (journey, id) => journey.phases.find(p => p.id === id);

test('a sheet is defined only with files, solution and acceptance criteria', () => {
  expect(isDefined(full)).toBe(true);
  expect(isDefined({ ...full, files: ' ' })).toBe(false);
  expect(isDefined({ solution: 's', acceptance: 'c' })).toBe(false);
  expect(isDefined(undefined)).toBe(false);
});

test('status rules match the state selector of the sheet', () => {
  expect(stateAllowed('Pronta per sviluppo', {})).toBe(false);
  expect(stateAllowed('Pronta per sviluppo', full)).toBe(true);
  expect(stateAllowed('Verificata', full)).toBe(false);
  expect(stateAllowed('Verificata', { ...full, verification: 'dotnet test OK' })).toBe(true);
});

test('with nothing done the first required gap is the sources, then the sheets', () => {
  const none = computeJourney({ ...base, applications: [] });
  expect(none.next.phase).toBe('fonti');
  expect(none.next.text).toMatch(/Nessun applicativo/);
  const noFolder = computeJourney(base);
  expect(noFolder.next.phase).toBe('fonti');
  expect(noFolder.next.text).toMatch(/cartella dei sorgenti/);
  const withFolder = computeJourney({ ...base, files: [{}] });
  expect(withFolder.next.phase).toBe('schede');
  expect(withFolder.next.text).toMatch(/3 su 3/);
});

test('counts defined sheets and never counts an AI proposal as a defined sheet', () => {
  const journey = computeJourney({ ...base, files: [{}], plans: { d1: full, d2: { aiProposal: { analysis: {} } } } });
  const sheets = phase(journey, 'schede');
  expect(sheets.done).toBe(1); expect(sheets.total).toBe(3); expect(sheets.status).toBe('partial');
  expect(sheets.extra).toBe('1 con proposta AI');
  expect(sheets.missing).toEqual([2, 3]);
});

test('generation is waiting until some sheet is ready, and optional phases never block the next step', () => {
  const journey = computeJourney({ ...base, files: [{}], plans: { d1: full, d2: full, d3: full }, delivery: { branch: 'b', tests: 't' }, approvedCount: 2, revision: 1 });
  expect(phase(computeJourney({ ...base, files: [{}] }), 'codice').status).toBe('waiting');
  expect(phase(journey, 'codice').optional).toBe(true);
  expect(journey.next.phase).toBe('verifica');
  expect(phase(journey, 'consegna').status).toBe('complete');
});

test('delivery needs a saved state, approved interventions, branch and test commands', () => {
  const unsaved = computeJourney({ ...base, files: [{}], plans: { d1: full }, delivery: { branch: 'b', tests: 't' }, approvedCount: 1, revision: 1, dirty: true });
  expect(phase(unsaved, 'consegna').missing).toEqual(['Sviluppo salvato']);
  const empty = computeJourney({ ...base, files: [{}], plans: { d1: full, d2: full, d3: full } });
  expect(empty.next.phase).toBe('consegna');
  expect(empty.next.text).toMatch(/sviluppo salvato.*interventi approvati/);
});

test('everything required done leaves no next step', () => {
  const plans = Object.fromEntries(['d1', 'd2', 'd3'].map(k => [k, { ...full, status: 'Verificata', verification: 'ok' }]));
  const journey = computeJourney({ ...base, files: [{}], plans, delivery: { branch: 'b', tests: 't' }, approvedCount: 1, revision: 2 });
  expect(journey.next).toBeNull();
  expect(phase(journey, 'verifica').status).toBe('complete');
});

test('a project with no data is empty, and decisions need choice, source and owner', () => {
  expect(phase(computeJourney(base), 'progetto').status).toBe('empty');
  const decisions = { runtime: { choice: 'c', source: 's', owner: 'o' }, input: { choice: 'c' } };
  const journey = computeJourney({ ...base, preparation: { name: 'n', objective: 'o', decisions } });
  expect(phase(journey, 'progetto').summary).toBe('1/10 decisioni');
});

test('zero activities never divides by zero', () => {
  const journey = computeJourney({ ...base, activities: [] });
  expect(Number.isFinite(journey.overall)).toBe(true);
  expect(phase(journey, 'schede').summary).toBe('Nessuna attività');
});

test('each phase explains purpose, inputs, outputs and rules', () => {
  PHASES.forEach(p => { expect(p.purpose).toBeTruthy(); expect(p.needs.length).toBeGreaterThan(0); expect(p.produces.length).toBeGreaterThan(0); expect(p.rules.length).toBeGreaterThan(0); });
});

test('suggests the next step for a single activity', () => {
  expect(activityNextStep({}).text).toMatch(/Prepara una proposta/);
  expect(activityNextStep({ aiProposal: {} }).text).toMatch(/Leggi la proposta/);
  expect(activityNextStep(full).phase).toBe('codice');
  expect(activityNextStep({ ...full, generatedCode: { files: [{}] } }).phase).toBe('verifica');
  expect(activityNextStep({ status: 'Verificata' }).text).toMatch(/verificata/);
});

test('list summary reports progress from a saved development record', () => {
  expect(developmentSummary(null, 5)).toBeNull();
  expect(developmentSummary({ revision: 2, plans: { a: full, b: { ...full, status: 'Verificata' } } }, 4)).toMatchObject({ defined: 2, verified: 1, total: 4, state: 'In corso' });
  expect(developmentSummary({ revision: 1, plans: {} }, 4).state).toBe('Avviato');
  expect(developmentSummary({ revision: 3, plans: { a: { status: 'Verificata' } } }, 1).state).toBe('Verificato');
});

test('overall progress ignores optional phases and the per-session folder', () => {
  const journey = computeJourney({ ...base, files: [{}], plans: { d1: full } });
  // sheets 1/3, delivery 0, verification 0 -> 11%: sources and optional phases do not dilute or inflate it
  expect(journey.overall).toBe(11);
});

test('after a reload with defined sheets the journey does not ask again for the folder', () => {
  const journey = computeJourney({ ...base, plans: { d1: full, d2: full, d3: full }, revision: 1 });
  expect(phase(journey, 'fonti').status).toBe('partial');
  expect(journey.next.phase).toBe('consegna');
});
