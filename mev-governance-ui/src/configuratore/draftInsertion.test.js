import { draftPatch, insertionBlocker, planInsertion, applyInsertion, undoInsertion } from './draftInsertion';

const proposal = (solution = 'Sol', acceptance = 'Crit', paths = ['a.java']) => ({ analysis: { solution, acceptance }, evidence: paths.map(path => ({ path })) });
const acts = n => Array.from({ length: n }, (_, i) => ({ key: `d${i + 1}`, number: i + 1 }));

test('copies solution, criteria and cited files, keeping the sheet out of verified states', () => {
  expect(draftPatch({}, proposal('S', 'C', ['a.java', 'a.java', 'b.java']))).toMatchObject({ files: 'a.java\nb.java', solution: 'S', acceptance: 'C', status: 'Da analizzare' });
});

test('a proposal without citations never blanks files the analyst wrote', () => {
  expect(draftPatch({ files: 'mio/File.java' }, proposal('S', 'C', [])).files).toBe('mio/File.java');
  expect(draftPatch({}, proposal('S', 'C', [])).files).toBe('');
});

test('explains why each sheet is skipped', () => {
  const p = proposal();
  expect(insertionBlocker({}, false)).toBe('senza proposta AI');
  expect(insertionBlocker({ aiProposal: { analysis: { solution: 1 } } }, false)).toBe('senza proposta AI');
  expect(insertionBlocker({ aiProposal: p, status: 'Verificata' }, true)).toMatch(/Verificata/);
  expect(insertionBlocker({ aiProposal: p, status: 'In sviluppo' }, true)).toMatch(/In sviluppo/);
  expect(insertionBlocker({ aiProposal: p, generatedCode: { files: [{}] } }, true)).toMatch(/file generati/);
  expect(insertionBlocker({ aiProposal: p, solution: 'Sol', acceptance: 'Crit' }, true)).toBe('bozza già inserita');
  expect(insertionBlocker({ aiProposal: p, solution: 'scritta a mano' }, false)).toBe('scheda già compilata');
  expect(insertionBlocker({ aiProposal: p, solution: 'scritta a mano' }, true)).toBeNull();
  expect(insertionBlocker({ aiProposal: p }, false)).toBeNull();
});

test('plans only the selected sheets and reports the skipped ones with their reason', () => {
  const plans = { d1: { aiProposal: proposal() }, d2: { aiProposal: proposal(), files: 'x' }, d3: {}, d4: { aiProposal: proposal() } };
  const result = planInsertion(acts(4), plans, new Set(['d1', 'd2', 'd3']), false);
  expect(result.eligible.map(a => a.number)).toEqual([1]);
  expect(result.skipped).toEqual([{ key: 'd2', number: 2, reason: 'scheda già compilata' }, { key: 'd3', number: 3, reason: 'senza proposta AI' }]);
});

test('applies only to eligible sheets and leaves every other sheet untouched', () => {
  const plans = { d1: { aiProposal: proposal('S1') }, d2: { aiProposal: proposal('S2'), status: 'Verificata', solution: 'ok', verification: 'test' }, d3: { solution: 'mia' } };
  const { next, before } = applyInsertion(plans, ['d1', 'd2', 'd3']);
  expect(next.d1.solution).toBe('S1');
  expect(next.d2).toBe(plans.d2);
  expect(next.d3).toBe(plans.d3);
  expect(Object.keys(before)).toEqual(['d1']);
});

test('keeps the proposal, the evidence and the other fields of an updated sheet', () => {
  const plans = { d1: { aiProposal: proposal('S1'), verification: 'nota', codeTarget: { application: 'NPSO' } } };
  const { next } = applyInsertion(plans, ['d1']);
  expect(next.d1.aiProposal).toBe(plans.d1.aiProposal);
  expect(next.d1.verification).toBe('nota');
  expect(next.d1.codeTarget).toEqual({ application: 'NPSO' });
  expect(next.d1.aiDraft).toBeDefined();
});

test('undo restores the inserted sheets and keeps any edit made to them afterwards', () => {
  const plans = { d1: { aiProposal: proposal('S1') }, d2: { aiProposal: proposal('S2') }, d3: { solution: 'altro' } };
  const { next, before, after } = applyInsertion(plans, ['d1', 'd2']);
  const edited = { ...next, d2: { ...next.d2, solution: 'ritoccata a mano' }, d3: { solution: 'modificata dopo' } };
  const { next: restored, kept } = undoInsertion(edited, before, after);
  expect(restored.d1).toBe(plans.d1);
  expect(restored.d2.solution).toBe('ritoccata a mano');
  expect(restored.d3.solution).toBe('modificata dopo');
  expect(kept).toEqual(['d2']);
});

test('running the insertion twice changes nothing the second time', () => {
  const plans = { d1: { aiProposal: proposal('S1') } };
  const first = applyInsertion(plans, ['d1']);
  expect(Object.keys(applyInsertion(first.next, ['d1']).before)).toEqual([]);
});
