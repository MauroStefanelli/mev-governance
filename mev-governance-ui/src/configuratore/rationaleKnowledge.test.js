import { validateText, initiativeCode, mergeById, groupEntries, knowledgeForAi, knowledgeMarkdown, entriesForIntervention, countByKind, notYetTaken, indexRationaleSummary, kindLabel, MAX_ENTRY } from './rationaleKnowledge';

const entry = (id, kind, status, text = `t${id}`, extra = {}) => ({ id, kind, status, text, ...extra });

test('texts are validated before they are sent', () => {
  expect(validateText('   ', 10)).toMatchObject({ ok: false });
  expect(validateText(null, 10)).toMatchObject({ ok: false });
  expect(validateText('  ok  ', 10)).toEqual({ ok: true, value: 'ok' });
  expect(validateText('x'.repeat(11), 10).ok).toBe(false);
  expect(validateText('x'.repeat(MAX_ENTRY), MAX_ENTRY).ok).toBe(true);
});

test('the initiative code follows the same identity as the rest of the app', () => {
  expect(initiativeCode({ code: ' 145480 ', title: 'x' })).toBe('145480');
  expect(initiativeCode({ title: 'Solo titolo' })).toBe('Solo titolo');
  expect(initiativeCode({})).toBe('');
  expect(initiativeCode(null)).toBe('');
});

test('merging by id keeps order and drops duplicates', () => {
  expect(mergeById([{ id: 2 }, { id: 5 }], [{ id: 3 }, { id: 5, v: 'new' }]).map(i => i.id)).toEqual([2, 3, 5]);
  expect(mergeById([{ id: 5 }], [{ id: 5, v: 'new' }])[0].v).toBe('new');
});

test('entries are grouped by status, newest first, with discarded and revoked kept apart', () => {
  const groups = groupEntries([entry(1, 'razionale', 'proposta'), entry(2, 'vincolo', 'confermata'), entry(3, 'vincolo', 'scartata'), entry(4, 'razionale', 'proposta'), entry(5, 'decisione', 'revocata')]);
  expect(groups.proposals.map(e => e.id)).toEqual([4, 1]);
  expect(groups.confirmed.map(e => e.id)).toEqual([2]);
  expect(groups.discarded.map(e => e.id)).toEqual([3, 5]);
});

test('only confirmed entries become knowledge for the AI', () => {
  const list = [entry(1, 'razionale', 'proposta'), entry(2, 'vincolo', 'confermata', 'Nessun cambio DB', { decidedByFullName: 'Anna Rossi' }), entry(3, 'decisione', 'revocata'), entry(4, 'vincolo', 'confermata', 'x', { sourceEntryId: 9 })];
  const knowledge = knowledgeForAi(list);
  expect(knowledge.map(k => k.text)).toEqual(['Nessun cambio DB', 'x']);
  expect(knowledge[0].decidedBy).toBe('Anna Rossi');
  expect(knowledge[1].fromInitiative).toMatch(/altra iniziativa/);
  expect(knowledgeForAi(undefined)).toEqual([]);
});

test('the markdown for documents lists confirmed entries by kind and is empty when there are none', () => {
  expect(knowledgeMarkdown([entry(1, 'razionale', 'proposta')])).toBe('');
  const md = knowledgeMarkdown([entry(1, 'vincolo', 'confermata', 'Solo TEST'), entry(2, 'razionale', 'confermata', 'Evita duplicati', { interventionId: 'OTT-4' })]);
  expect(md).toContain('## Razionali e vincoli confermati');
  expect(md.indexOf('### Razionali')).toBeLessThan(md.indexOf('### Vincoli'));
  expect(md).toContain('- Evita duplicati _(intervento OTT-4)_');
  expect(md).not.toContain('### Decisioni');
});

test('an entry tied to an intervention applies to it, an untied one to the whole initiative', () => {
  const list = [entry(1, 'vincolo', 'confermata', 'generale'), entry(2, 'razionale', 'confermata', 'su A', { interventionId: 'A' }), entry(3, 'razionale', 'confermata', 'su B', { interventionId: 'B' }), entry(4, 'razionale', 'proposta', 'non confermata', { interventionId: 'A' })];
  expect(entriesForIntervention(list, 'A').map(e => e.id)).toEqual([1, 2]);
  expect(entriesForIntervention(list, 'zzz').map(e => e.id)).toEqual([1]);
});

test('counts confirmed entries by kind', () => {
  expect(countByKind([entry(1, 'vincolo', 'confermata'), entry(2, 'vincolo', 'confermata'), entry(3, 'razionale', 'proposta')])).toEqual({ razionale: 0, vincolo: 2, decisione: 0 });
});

test('related entries already taken are not offered twice', () => {
  const related = [{ id: 10 }, { id: 11 }, { id: 12 }];
  const mine = [entry(1, 'vincolo', 'proposta', 't', { sourceEntryId: 10 }), entry(2, 'vincolo', 'scartata', 't', { sourceEntryId: 11 })];
  expect(notYetTaken(related, mine).map(e => e.id)).toEqual([11, 12]);
  expect(notYetTaken(undefined, mine)).toEqual([]);
});

test('summaries are matched regardless of case and spaces; labels have a safe default', () => {
  expect(indexRationaleSummary([{ goto: 'goto-1', confirmed: 2 }])['goto-1'].confirmed).toBe(2);
  expect(indexRationaleSummary(null)).toEqual({});
  expect(kindLabel('vincolo')).toBe('Vincolo');
  expect(kindLabel('boh')).toBe('Voce');
});
