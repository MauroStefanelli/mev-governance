import { developmentActivities, importedGapSuggestions, developmentMarkdown } from './developmentActivityModel';

test('keeps 29 distinct activities even if all use the same driver', () => {
  const items = Array.from({ length: 29 }, (_, i) => ({ sourceRowId: `detail-${i + 1}`, id: 'driver-api', interventionId: 'I1', reason: `Attività ${i + 1}` }));
  const activities = developmentActivities(items);
  expect(activities).toHaveLength(29);
  expect(new Set(activities.map(a => a.key)).size).toBe(29);
  expect(developmentMarkdown(activities, { 'detail-1': { files: 'src/test.java', solution: 'Soluzione', acceptance: 'Test API' } }, [{ name: 'NPSO', codeUrl: '/repo/npso' }])).toContain('/repo/npso');
});
test('does not suggest technologies/history absent from imported requirements or duplicate covered drivers', () => {
  const entry = { id: 'sql', nome: 'Realizzazione stored procedure o equivalente', ambito: 'Database' };
  expect(importedGapSuggestions([{ id: 'I1', titolo: 'Modifica schermata', mappings: [] }], [entry])).toEqual([]);
  expect(importedGapSuggestions([{ id: 'I1', attivita: entry.nome, mappings: [{ catalogId: 242, name: entry.nome, ambit: 'Database' }] }], [entry])).toEqual([]);
  expect(importedGapSuggestions([{ id: 'I1', attivita: entry.nome, mappings: [] }], [entry])[0]).toMatchObject({ selected: false, interventionId: 'I1', id: 'sql' });
});
