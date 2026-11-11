import { SOLUTION_FIELDS, FIELD_KEYS, MAX_FIELD, MAX_SUMMARY, emptyEntry, isEmptyEntry, interventionList, solutionRows, solutionProgress, validateEntry, validateSolution, withField, withSummary, solutionMarkdown, solutionFileName } from './solutionModel';

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

test('only confirmed rationale is included, tied to its intervention or general', () => {
  const knowledge = [
    { status: 'confermata', kind: 'vincolo', text: 'Nessuna modifica allo schema', interventionId: 'OTT-1' },
    { status: 'confermata', kind: 'razionale', text: 'Regola generale' },
    { status: 'proposta', kind: 'vincolo', text: 'PROPOSTA-NON-CONFERMATA' },
    { status: 'revocata', kind: 'vincolo', text: 'REVOCATA' },
    { status: 'confermata', kind: 'vincolo', text: 'Solo per altro', interventionId: 'OTT-2' },
  ];
  const md = solutionMarkdown({ initiative: { code: 'G' }, interventions, solution: {}, knowledge });
  const first = md.slice(md.indexOf('### 1.'), md.indexOf('### 2.'));
  expect(first).toContain('Nessuna modifica allo schema');
  expect(first).not.toContain('Solo per altro');
  expect(md).toContain('## Razionali e vincoli generali dell’iniziativa');
  expect(md).toContain('Regola generale');
  ['PROPOSTA-NON-CONFERMATA', 'REVOCATA'].forEach(word => expect(md).not.toContain(word));
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
