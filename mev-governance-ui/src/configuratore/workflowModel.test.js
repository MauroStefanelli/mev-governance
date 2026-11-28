import { configuratorFlow, developmentFlow, buildFlow, CONFIGURATOR_STEPS, DEVELOPMENT_STEPS, STATE_LABEL } from './workflowModel';
import { computeJourney } from './developmentJourney';

const base = { code: '146023', systemChosen: true, catalogReady: true };
const ids = flow => flow.steps.map(step => step.id);
const state = (flow, id) => flow.steps.find(step => step.id === id).state;

describe('Configuratore: the steps and their order', () => {
  test('there are eight steps, in the order a person works, and they match the manual of «Lavorare senza Excel»', () => {
    expect(CONFIGURATOR_STEPS.map(step => step.id)).toEqual(['identify', 'documents', 'rationales', 'interventions', 'solution', 'offer', 'save', 'handoff']);
    CONFIGURATOR_STEPS.forEach(step => { expect(step.title.length).toBeGreaterThan(5); expect(step.what.length).toBeGreaterThan(20); expect(step.why.length).toBeGreaterThan(20); expect(step.where).toBeTruthy(); expect(step.go).toBeTruthy(); });
  });
  test('only documents and solution are optional; «Passa a Sviluppo» is the final step', () => {
    expect(CONFIGURATOR_STEPS.filter(step => step.optional).map(step => step.id)).toEqual(['documents', 'solution']); expect(CONFIGURATOR_STEPS.filter(step => step.final).map(step => step.id)).toEqual(['handoff']);
  });
});
describe('Configuratore: the state is computed from the data, step by step', () => {
  test('an empty page: the next step is to identify the initiative, everything after it waits', () => {
    const flow = configuratorFlow({}); expect(flow.next.id).toBe('identify'); expect(state(flow, 'identify')).toBe('current'); expect(state(flow, 'rationales')).toBe('blocked'); expect(flow.percent).toBe(0);
  });
  test('the GOTO without an application is NOT identified yet: the application is part of the first step, and the detail says what is missing', () => {
    const flow = configuratorFlow({ code: '1' }); expect(state(flow, 'identify')).toBe('current'); expect(flow.steps[0].detail).toContain('manca l’applicativo'); expect(flow.steps[0].detail).not.toContain('manca il GOTO');
  });
  test('the title alone is enough instead of the GOTO', () => { expect(state(configuratorFlow({ title: 'Invio prenotazione', systemChosen: true }), 'identify')).toBe('done'); });
  test('after the identification the next step is the rationales (documents are optional and never «next»)', () => {
    const flow = configuratorFlow(base); expect(flow.next.id).toBe('rationales'); expect(state(flow, 'documents')).toBe('optional'); expect(flow.percent).toBe(20);   // 1 passo obbligatorio su 5 (identificare, razionali, interventi, offerta, salvare)
  });
  test('a proposal not yet decided does not count: only CONFIRMED voices complete the step, and the detail says how many are waiting', () => {
    const flow = configuratorFlow({ ...base, confirmedRationales: 0, proposedPending: 3 }); expect(state(flow, 'rationales')).toBe('current'); expect(flow.steps[2].detail).toContain('3 proposte da confermare');
  });
  test('the interventions wait for the confirmed rationales, and for the catalogue of the lot: it says which one is missing', () => {
    expect(configuratorFlow(base).steps[3].blockedBy).toBe('servono prima voci confermate');
    expect(configuratorFlow({ code: '1', systemChosen: true, confirmedRationales: 2 }).steps[3].blockedBy).toContain('contratto e lotto');
    expect(configuratorFlow({ ...base, confirmedRationales: 2 }).steps[3].blockedBy).toBeNull();
  });
  test('a PROPOSED intervention does not count, only a confirmed one: and confirming it is what puts the rows into the offer', () => {
    expect(state(configuratorFlow({ ...base, confirmedRationales: 2, interventionsProposed: 2 }), 'interventions')).toBe('current'); expect(state(configuratorFlow({ ...base, confirmedRationales: 2, interventionsConfirmed: 1, offerItems: 3 }), 'interventions')).toBe('done');
  });
  test('the offer step is done only when it has rows AND the person has looked at it (opening the step 3)', () => {
    const rows = { ...base, confirmedRationales: 2, interventionsConfirmed: 1, offerItems: 3 };
    expect(configuratorFlow(rows).next.id).toBe('offer'); expect(state(configuratorFlow({ ...rows, offerVisited: true }), 'offer')).toBe('done'); expect(configuratorFlow({ ...rows, offerVisited: true }).next.id).toBe('save');
  });
  test('an empty offer blocks the offer and the save, with the reason', () => {
    const flow = configuratorFlow({ ...base, confirmedRationales: 2 }); expect(flow.steps.find(s => s.id === 'offer').blockedBy).toContain('conferma almeno un intervento'); expect(flow.steps.find(s => s.id === 'save').blockedBy).toBe('l’offerta è vuota');
  });
  test('the save needs the GOTO: with only the title it says so', () => { expect(configuratorFlow({ title: 'T', systemChosen: true, offerItems: 2, offerVisited: true }).steps.find(s => s.id === 'save').blockedBy).toBe('manca il Codice GOTO'); });
  test('unsaved changes are named as such, not as «never saved»', () => {
    const flow = configuratorFlow({ ...base, confirmedRationales: 2, interventionsConfirmed: 1, offerItems: 3, offerVisited: true, hasChanges: true }); expect(flow.steps.find(s => s.id === 'save').detail).toBe('modifiche non salvate'); expect(state(flow, 'save')).toBe('current');
  });
  test('saved: the hand-over becomes the last step, the progress is 100% and the flow says it is complete', () => {
    const flow = configuratorFlow({ ...base, confirmedRationales: 2, interventionsConfirmed: 1, offerItems: 3, offerVisited: true, saved: true });
    expect(flow.percent).toBe(100); expect(flow.complete).toBe(true); expect(flow.next.id).toBe('handoff'); expect(state(flow, 'handoff')).toBe('current');
  });
  test('the hand-over does not weigh on the percentage and cannot be «done» before saving', () => {
    const early = configuratorFlow({ ...base, confirmedRationales: 2, interventionsConfirmed: 1, offerItems: 3, offerVisited: true }); expect(early.requiredTotal).toBe(5); expect(early.steps.find(s => s.id === 'handoff').state).toBe('blocked'); expect(early.steps.find(s => s.id === 'handoff').blockedBy).toBe('salva prima la valutazione');
  });
  test('there is always ONE next step (never two, never none until everything is done)', () => {
    const cases = [{}, { code: '1' }, base, { ...base, confirmedRationales: 1 }, { ...base, confirmedRationales: 1, interventionsConfirmed: 1, offerItems: 1 }, { ...base, confirmedRationales: 1, interventionsConfirmed: 1, offerItems: 1, offerVisited: true, saved: true }];
    cases.forEach(facts => { const flow = configuratorFlow(facts); expect(flow.steps.filter(s => s.isNext)).toHaveLength(1); expect(flow.next).toBeTruthy(); });
  });
  test('the percentage never goes down when a step is added, and never exceeds 100', () => {
    const path = [{}, { code: '1' }, base, { ...base, confirmedRationales: 1 }, { ...base, confirmedRationales: 1, interventionsConfirmed: 1, offerItems: 1 }, { ...base, confirmedRationales: 1, interventionsConfirmed: 1, offerItems: 1, offerVisited: true }, { ...base, confirmedRationales: 1, interventionsConfirmed: 1, offerItems: 1, offerVisited: true, saved: true }];
    const percents = path.map(facts => configuratorFlow(facts).percent); expect(percents).toEqual([...percents].sort((a, b) => a - b)); expect(Math.max(...percents)).toBe(100); expect(Math.min(...percents)).toBe(0);
  });
  test('missing or strange data never breaks it (undefined, null, negative numbers)', () => {
    expect(() => configuratorFlow()).not.toThrow(); expect(() => configuratorFlow({ documents: null, offerItems: -3, code: null })).not.toThrow(); expect(configuratorFlow({ offerItems: -3 }).steps.find(s => s.id === 'offer').done).toBe(false);
  });
});
describe('the generic builder', () => {
  const steps = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', optional: true }, { id: 'c', title: 'C' }];
  test('the next one is the first REQUIRED step not done, and an optional one is never next', () => {
    const flow = buildFlow(steps, { a: { done: true }, b: { done: false }, c: { done: false } }); expect(flow.next.id).toBe('c'); expect(flow.steps.find(s => s.id === 'b').state).toBe('optional');
  });
  test('a blocked required step is still THE next one, with its reason, and the flow does not pretend it is ready', () => {
    const flow = buildFlow(steps, { a: { done: false }, b: { done: false }, c: { done: false, blockedBy: 'prima A' } }); expect(flow.next.id).toBe('a');
    const blockedFirst = buildFlow(steps, { a: { done: true }, b: { done: false }, c: { done: false, blockedBy: 'prima qualcosa' } }); expect(blockedFirst.next.id).toBe('c'); expect(blockedFirst.next.state).toBe('blocked'); expect(blockedFirst.next.blockedBy).toBe('prima qualcosa');
  });
  test('every state has a label for the person', () => { ['done', 'current', 'todo', 'optional', 'blocked'].forEach(key => expect(STATE_LABEL[key]).toBeTruthy()); });
});

// ---------------------------------------------------------------- Sviluppo
const activities = n => Array.from({ length: n }, (_, i) => ({ key: `a${i}`, number: i + 1, item: { interventionId: 'P-1' } }));
const def = { files: 'a.java', solution: 'x', acceptance: 'y' };
const flowOf = (over = {}, saved = false, n = 2) => {
  const list = activities(n);
  const journey = computeJourney({ activities: list, plans: over.plans || {}, preparation: over.preparation || {}, delivery: over.delivery || {}, applications: over.apps ?? [], files: over.files || [], approvedCount: over.approved ?? n, dirty: !saved, revision: saved ? 1 : 0 });
  return developmentFlow(journey, { activities: n, saved, opened: true });
};
describe('Sviluppo: the steps and their state come from the same journey as the phase bar', () => {
  test('the steps in order, ending with the verification', () => { expect(DEVELOPMENT_STEPS.map(step => step.id)).toEqual(['open', 'sources', 'cards', 'project', 'code', 'save', 'delivery', 'verify']); });
  test('project and code are optional', () => { expect(DEVELOPMENT_STEPS.filter(step => step.optional).map(step => step.id)).toEqual(['project', 'code']); });
  test('just opened: the next step is to link the sources', () => { const flow = flowOf(); expect(flow.next.id).toBe('sources'); expect(state(flow, 'open')).toBe('done'); });
  test('the repository linked: the next step is the cards', () => { expect(flowOf({ apps: [{ id: 1 }], files: ['a'] }).next.id).toBe('cards'); });
  test('the cards defined (file, solution AND criteria): the next step is to SAVE', () => { const flow = flowOf({ apps: [{ id: 1 }], files: ['a'], plans: { a0: def, a1: def } }); expect(flow.next.id).toBe('save'); expect(state(flow, 'cards')).toBe('done'); });
  test('an AI proposal alone does not define a card', () => { expect(flowOf({ apps: [{ id: 1 }], files: ['a'], plans: { a0: { aiProposal: { solution: 'x' } }, a1: {} } }).next.id).toBe('cards'); });
  test('after the save the next step is the delivery, and the delivery was waiting for the save', () => {
    const open = flowOf({ apps: [{ id: 1 }], files: ['a'], plans: { a0: def, a1: def } }); expect(open.steps.find(s => s.id === 'delivery').blockedBy).toBe('salva prima lo sviluppo');
    const saved = flowOf({ apps: [{ id: 1 }], files: ['a'], plans: { a0: def, a1: def } }, true); expect(saved.next.id).toBe('delivery'); expect(saved.steps.find(s => s.id === 'delivery').blockedBy).toBeNull();
  });
  test('delivery done: the next step is the verification, with the evidence', () => { expect(flowOf({ apps: [{ id: 1 }], files: ['a'], plans: { a0: def, a1: def }, delivery: { branch: 'b', tests: 't' } }, true).next.id).toBe('verify'); });
  test('everything verified and saved: 100% and complete', () => {
    const done = { ...def, status: 'Verificata', verification: 'ok' }; const flow = flowOf({ apps: [{ id: 1 }], files: ['a'], plans: { a0: done, a1: done }, delivery: { branch: 'b', tests: 't' } }, true); expect(flow.percent).toBe(100); expect(flow.complete).toBe(true); expect(flow.next).toBeNull();
  });
  test('an offer with no rows: nothing can be done and the reason is the right one (back to the Configuratore)', () => {
    const flow = flowOf({ approved: 0 }, false, 0); expect(flow.steps.find(s => s.id === 'cards').blockedBy).toContain('torna al Configuratore'); expect(flow.next.blockedBy).toContain('torna al Configuratore');
  });
  test('the code generation waits for cards with a solution', () => { expect(flowOf().steps.find(s => s.id === 'code').blockedBy).toBe('servono prima le schede con soluzione e criteri'); });
  test('the percentage agrees with the phases: the same data cannot say two different things', () => {
    const list = activities(2); const params = { activities: list, plans: { a0: def, a1: {} }, applications: [{ id: 1 }], files: ['a'], approvedCount: 2, dirty: true, revision: 0 };
    const journey = computeJourney(params); const flow = developmentFlow(journey, { activities: 2, saved: false, opened: true });
    expect(flow.steps.find(s => s.id === 'cards').done).toBe(journey.phases.find(p => p.id === 'schede').status === 'complete'); expect(flow.steps.find(s => s.id === 'sources').done).toBe(journey.phases.find(p => p.id === 'fonti').status === 'complete');
  });
  test('never breaks with an empty or missing journey', () => { expect(() => developmentFlow(null, {})).not.toThrow(); expect(developmentFlow(null, {}).steps).toHaveLength(8); });
});
