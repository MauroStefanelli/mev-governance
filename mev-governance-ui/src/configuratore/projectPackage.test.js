import { buildProjectPackage, newProjectPreparation } from './projectPackage';

test('generates a reusable project with every activity and explicit pending decisions', async () => {
  const result = await buildProjectPackage({ initiative: { code: 'NEW-42', title: 'Nuova iniziativa', system: 'ALTRO' },
    preparation: { ...newProjectPreparation(), name: 'nuovo-servizio', objective: 'Inviare dati', decisions: { runtime: { choice: 'Da concordare' } } },
    items: Array.from({ length: 29 }, (_, index) => ({ sourceRowId: `r${index}`, interventionId: 'I1', reason: `Attività ${index}` })),
    plans: { r0: { acceptance: 'Risposta valida' } }, applications: [{ name: 'ALTRO', codeUrl: '/repo/altro' }] });
  expect(result.manifest.activities).toHaveLength(29);
  expect(result.manifest.openDecisions).toHaveLength(10);
  const readme = await result.zip.file('README.md').async('string');
  expect(readme).toContain('NEW-42'); expect(readme).not.toContain('NPSO');
  expect(JSON.parse(await result.zip.file('nuovo-servizio.code-workspace').async('string')).folders).toEqual([{ path: '.' }]);
  expect(JSON.parse(await result.zip.file('tests/piano-test.json').async('string')).activities[0]).toMatchObject({ acceptance: 'Risposta valida', result: 'NON ESEGUITO' });
});

test('documents completed decisions and does not attach context from another initiative', async () => {
  const result = await buildProjectPackage({ initiative: { code: 'B', title: 'Titolo' }, preparation: { name: '../demo', objective: 'Obiettivo', decisions: { runtime: { choice: 'Standard', source: 'ADR-1', owner: 'Team' } } }, items: [{ key: '1' }], plans: {}, applications: [], workspaceContext: { goto: 'A', analysis: { title: 'Estranea' } } });
  expect(result.manifest.analysis).toBeNull();
  expect(result.manifest.openDecisions).toHaveLength(9);
  expect(await result.zip.file('docs/DECISIONI.md').async('string')).toContain('ADR-1');
  expect(Object.keys(result.zip.files).some(path => path.includes('../'))).toBe(false);
});
