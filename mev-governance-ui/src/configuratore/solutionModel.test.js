import { rationaleContext, rationaleCounts, entryProvenance, KIND_LABEL, SOLUTION_FIELDS, FIELD_KEYS, MAX_FIELD, MAX_SUMMARY, emptyEntry, isEmptyEntry, interventionList, solutionRows, solutionProgress, validateEntry, validateSolution, withField, withSummary, solutionMarkdown, solutionFileName } from './solutionModel';

const interventions = [
  { id: 'OTT-1', titolo: 'Invio prenotazione', descrizione: 'Esporre il servizio', attivita: 'Sviluppo API', sistema: 'NPSO', requisiti: 'REQ-4', mappings: [{ name: 'Servizio REST', type: 'REALIZZAZIONE', complexity: 'Medio', qty: 2, componentApplication: 'Gateway', technology: 'Java', detailDescription: 'dettaglio' }] },
  { id: ' OTT-2 ', titolo: 'Notifiche', mappings: [] },
  { id: '', titolo: 'senza id' },
];

test('interventions are normalized and those without an id are dropped', () => {
  const list = interventionList(interventions);
  expect(list.map(x => x.id)).toEqual(['OTT-1', 'OTT-2']);
  expect(list[0]).toMatchObject({ title: 'Invio prenotazione', system: 'NPSO', requirements: 'REQ-4' });
  expect(list[0].mappings[0]).toMatchObject({ name: 'Servizio REST', component: 'Gateway', technology: 'Java', qty: 2 });
  expect(interventionList(undefined)).toEqual([]);
});

test('every intervention gets a row, filled only when the team wrote something', () => {
  const solution = { entries: { 'OTT-1': { approach: 'Usare una coda' } } };
  const rows = solutionRows(interventions, solution);
  expect(rows.map(r => [r.id, r.filled, r.orphan])).toEqual([['OTT-1', true, false], ['OTT-2', false, false]]);
  expect(rows[0].entry.approach).toBe('Usare una coda');
  expect(Object.keys(rows[1].entry)).toEqual(FIELD_KEYS);
});

test('a solution for an intervention that left the offer is kept and flagged, never dropped', () => {
  const rows = solutionRows(interventions, { entries: { 'OTT-9': { approach: 'Vecchia idea' }, 'OTT-8': { approach: '   ' } } });
  const orphan = rows.find(r => r.id === 'OTT-9');
  expect(orphan).toMatchObject({ orphan: true, filled: true });
  expect(rows.find(r => r.id === 'OTT-8')).toBeUndefined();
  expect(solutionProgress(rows)).toEqual({ total: 2, filled: 0, orphans: 1 });
});

test('editing one field leaves the others and removes an entry that becomes empty', () => {
  let solution = withField({}, 'OTT-1', 'approach', 'A');
  solution = withField(solution, 'OTT-1', 'tests', 'T');
  expect(solution.entries['OTT-1']).toMatchObject({ approach: 'A', tests: 'T', constraints: '' });
  solution = withField(solution, 'OTT-1', 'approach', '');
  expect(solution.entries['OTT-1'].tests).toBe('T');
  solution = withField(solution, 'OTT-1', 'tests', '  ');
  expect(solution.entries['OTT-1']).toBeUndefined();
  expect(isEmptyEntry(emptyEntry())).toBe(true);
  expect(isEmptyEntry(undefined)).toBe(true);
});

test('editing does not mutate the previous state', () => {
  const before = { entries: { 'OTT-1': { ...emptyEntry(), approach: 'A' } }, summary: 'S' };
  const frozen = JSON.stringify(before);
  withField(before, 'OTT-1', 'approach', 'B'); withSummary(before, 'altro');
  expect(JSON.stringify(before)).toBe(frozen);
  expect(withSummary({}, 'x')).toEqual({ entries: {}, summary: 'x' });
});

test('lengths are validated per field and for the summary', () => {
  expect(validateEntry({ approach: 'x'.repeat(MAX_FIELD) })).toBe('');
  expect(validateEntry({ tests: 'x'.repeat(MAX_FIELD + 1) })).toMatch(/Verifiche/);
  expect(validateSolution({ summary: 'x'.repeat(MAX_SUMMARY + 1) })).toMatch(/sintesi/);
  expect(validateSolution({ entries: { 'OTT-1': { notes: 'x'.repeat(MAX_FIELD + 1) } } })).toMatch(/OTT-1/);
  expect(validateSolution({ summary: 'ok', entries: { 'OTT-1': { approach: 'ok' } } })).toBe('');
  expect(validateSolution(undefined)).toBe('');
});

test('the Markdown carries the initiative, every intervention with its detail, and the team\'s text', () => {
  const md = solutionMarkdown({ initiative: { code: '145480', title: 'Invio SAP', system: 'NPSO', description: 'Descrizione generale' }, interventions, applications: [{ name: 'NPSO', codeUrl: '/src/npso' }],
    solution: { summary: 'Sintesi **chiara**', updatedBy: 'Anna Rossi', updatedAt: '2026-05-04T10:00:00Z', entries: { 'OTT-1': { approach: 'Usare una coda\ncon retry', tests: 'Retry testato' } } }, generatedAt: '2026-05-05T09:00:00Z' });
  expect(md.startsWith('# Soluzione · 145480 · Invio SAP')).toBe(true);
  expect(md).toContain('non è stato verificato sul codice');
  expect(md).toContain('## Descrizione dell’iniziativa');
  expect(md).toContain('## Sintesi della soluzione\n\nSintesi **chiara**');
  expect(md).toContain('- **NPSO** — `/src/npso`');
  expect(md).toContain('### 1. OTT-1 — Invio prenotazione');
  expect(md).toContain('| Servizio REST | REALIZZAZIONE | Medio | 2 | Gateway | Java |');
  expect(md).toContain('**Soluzione proposta**\n\nUsare una coda\ncon retry');
  expect(md).toContain('**Verifiche e criteri di accettazione**\n\nRetry testato');
  expect(md).toContain('1 interventi su 2 con soluzione descritta');
  expect(md).toContain('Ultima modifica | Anna Rossi');
});

test('an intervention without a solution says so instead of inventing one', () => {
  const md = solutionMarkdown({ initiative: { code: 'G' }, interventions, solution: {} });
  expect(md).toContain('_Soluzione non ancora descritta per questo intervento._');
  expect(md).not.toContain('**Soluzione proposta**');
  expect(md).not.toContain('## Sintesi della soluzione');
});

const rationale = [
  { id: 1, kind: 'vincolo', status: 'confermata', text: 'Nessuna modifica allo schema', interventionId: 'OTT-1', decidedByFullName: 'Anna Rossi', decidedAt: '2026-05-04T10:00:00Z', byAi: true },
  { id: 2, kind: 'razionale', status: 'confermata', text: 'Regola generale', createdByFullName: 'Luca Verdi', decidedByFullName: 'Luca Verdi', decidedAt: '2026-05-05T10:00:00Z', byAi: false },
  { id: 3, kind: 'decisione', status: 'proposta', text: 'PROPOSTA-DELL-AI', interventionId: 'OTT-1', byAi: true },
  { id: 4, kind: 'vincolo', status: 'proposta', text: 'PROPOSTA-GENERALE', byAi: true },
  { id: 5, kind: 'vincolo', status: 'revocata', text: 'REVOCATA' },
  { id: 6, kind: 'vincolo', status: 'scartata', text: 'SCARTATA' },
  { id: 7, kind: 'vincolo', status: 'confermata', text: 'Solo per altro intervento', interventionId: 'OTT-2', decidedByFullName: 'Anna Rossi' },
  { id: 8, kind: 'razionale', status: 'confermata', text: 'Ripresa da altra iniziativa', sourceEntryId: 99, decidedByFullName: 'Anna Rossi', byAi: false },
];

test('an intervention sees its own and the general entries, split into confirmed and still to confirm', () => {
  const first = rationaleContext(rationale, 'OTT-1');
  expect(first.confirmed.map(e => e.id)).toEqual([1, 2, 8]);
  expect(first.toConfirm.map(e => e.id)).toEqual([4, 3]);
  const second = rationaleContext(rationale, 'OTT-2');
  expect(second.confirmed.map(e => e.id)).toEqual([7, 2, 8]);
  expect(second.toConfirm.map(e => e.id)).toEqual([4]);
  const other = rationaleContext(rationale, 'ZZZ');
  expect(other.confirmed.map(e => e.id)).toEqual([2, 8]);
});

test('discarded and revoked entries are never part of the context', () => {
  const all = rationaleContext(rationale, null);
  [...all.confirmed, ...all.toConfirm].forEach(entry => expect(['confermata', 'proposta']).toContain(entry.status));
  expect(rationaleContext(undefined, 'OTT-1')).toEqual({ confirmed: [], toConfirm: [] });
});

test('constraints come first, then decisions, then rationale', () => {
  const sorted = rationaleContext([{ id: 1, kind: 'razionale', status: 'confermata' }, { id: 2, kind: 'vincolo', status: 'confermata' }, { id: 3, kind: 'decisione', status: 'confermata' }], null).confirmed;
  expect(sorted.map(e => e.kind)).toEqual(['vincolo', 'decisione', 'razionale']);
});

test('counts cover the whole initiative, including entries tied to interventions', () => {
  expect(rationaleCounts(rationale)).toEqual({ confirmed: 4, toConfirm: 2, byKind: { vincolo: 2, decisione: 0, razionale: 2 } });
  expect(rationaleCounts(undefined)).toEqual({ confirmed: 0, toConfirm: 0, byKind: { vincolo: 0, decisione: 0, razionale: 0 } });
});

test('provenance says who decided, when, whether the AI proposed it and whether it came from another initiative', () => {
  expect(entryProvenance(rationale[0])).toMatch(/confermata da Anna Rossi il .*2026/);
  expect(entryProvenance(rationale[0])).toContain('proposta dall’AI');
  expect(entryProvenance(rationale[1])).toContain('inserita da Luca Verdi');
  expect(entryProvenance(rationale[2])).toBe('proposta dall’AI, non ancora confermata');
  expect(entryProvenance(rationale[7])).toContain('ripresa da un’altra iniziativa');
  expect(entryProvenance({ status: 'proposta' })).toBe('proposta, non ancora confermata');
  expect(KIND_LABEL.vincolo).toBe('Vincolo');
});

test('the Markdown puts confirmed entries as facts and unconfirmed ones in a flagged "to confirm" block, under the right intervention', () => {
  const md = solutionMarkdown({ initiative: { code: 'G' }, interventions, solution: {}, knowledge: rationale });
  const first = md.slice(md.indexOf('### 1.'), md.indexOf('### 2.'));
  const second = md.slice(md.indexOf('### 2.'), md.indexOf('## Razionali e vincoli dell’iniziativa'));
  expect(first).toContain('**Razionali, vincoli e decisioni confermati**');
  expect(first).toContain('**Vincolo**: Nessuna modifica allo schema');
  expect(first).toMatch(/_confermata da Anna Rossi il .*proposta dall’AI_/);
  expect(first).toContain('**⚠ Da confermare — proposte non verificate**');
  expect(first).toContain('PROPOSTA-DELL-AI');
  expect(first).toContain('PROPOSTA-GENERALE');
  expect(first).toContain('vale per tutta l’iniziativa');
  expect(first).not.toContain('Solo per altro intervento');
  expect(second).toContain('Solo per altro intervento');
  expect(second).not.toContain('PROPOSTA-DELL-AI');
  ['REVOCATA', 'SCARTATA'].forEach(word => expect(md).not.toContain(word));
});

test('the unconfirmed block is explicit that those are hypotheses, never requirements', () => {
  const md = solutionMarkdown({ initiative: { code: 'G' }, interventions, solution: {}, knowledge: rationale });
  expect(md).toContain('trattarle come ipotesi, non come requisiti');
  expect(md).not.toMatch(/\*\*Vincolo\*\*: PROPOSTA/);
});

test('the initiative-level section summarises the counts and lists general entries once', () => {
  const md = solutionMarkdown({ initiative: { code: 'G' }, interventions, solution: {}, knowledge: rationale });
  const general = md.slice(md.indexOf('## Razionali e vincoli dell’iniziativa'));
  expect(general).toContain('4 confermati (2 vincoli · 0 decisioni · 2 razionali), 2 proposte ancora da confermare');
  expect(general).toContain('### Validi per tutta l’iniziativa');
  expect(general).toContain('Regola generale');
  expect(general).toContain('### ⚠ Da confermare');
  expect(general).toContain('PROPOSTA-GENERALE');
  expect(general).not.toContain('Nessuna modifica allo schema');
});

test('without any rationale the file has no rationale section and no empty headings', () => {
  const md = solutionMarkdown({ initiative: { code: 'G' }, interventions, solution: {}, knowledge: [] });
  expect(md).not.toContain('## Razionali e vincoli dell’iniziativa');
  expect(md).not.toContain('Da confermare');
  expect(md).not.toContain('confermati**');
});

test('an orphan solution is exported with a warning', () => {
  const md = solutionMarkdown({ initiative: { code: 'G' }, interventions: [], solution: { entries: { 'OTT-9': { approach: 'Vecchia' } } } });
  expect(md).toContain('non è più presente nell’offerta');
  expect(md).toContain('Vecchia');
});

test('table cells escape the pipe so a description cannot break the table', () => {
  const md = solutionMarkdown({ initiative: { code: 'G' }, interventions: [{ id: 'I', mappings: [{ name: 'A|B', type: 'MODIFICA', qty: 1 }] }], solution: {} });
  expect(md).toContain('| A\\|B |');
});

test('the file name is safe and readable', () => {
  expect(solutionFileName({ code: '145480' })).toBe('SOLUZIONE_145480.md');
  expect(solutionFileName({ title: 'Invio prenotazione èçà / SAP' })).toBe('SOLUZIONE_Invio-prenotazione-eca-SAP.md');
  expect(solutionFileName({})).toBe('SOLUZIONE_iniziativa.md');
  expect(solutionFileName({ code: '../../etc/passwd' })).not.toContain('/');
  expect(SOLUTION_FIELDS).toHaveLength(5);
});
