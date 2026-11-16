import { systemNames, addAppToSystem, removeAppFromSystem, applicationBrief, applicationBriefs, componentNames, componentCoverage, MAX_APPLICATIONS } from './applicationContext';

const COMPONENTS = ['ILP_frontend', 'ILP_backend-libraries', 'ILP_general', 'ILP_BACKEND_registry-app', 'ILP_BACKEND_profile-app', 'ILP_BACKEND_print-app', 'ILP_BACKEND_hu-transport-app', 'ILP_BACKEND_advise-app', 'ILP_BACKEND_transport-app', 'ILP_BACKEND_item-service', 'ILP_BACKEND_aggregate-app', 'ILP_BACKEND_direct-injection-aggregate-app'];
const ILP = { id: 'application-1', name: 'ILP', code: 'ILP', systemAliases: ['ILP'], languages: ['Java', 'TypeScript'], databases: ['PostgreSQL'], extraTechnologies: ['x'], notes: 'NOTA LIBERA RISERVATA', codeUrl: '/Users/mauro/ILP',
  techProfile: { components: COMPONENTS, technologies: ['Java', 'C#'], frameworks: ['Spring / Spring Boot', 'Angular'], databases: ['PostgreSQL', 'Oracle'], integrations: ['REST HTTP', 'Kafka'], interfaces: ['Web UI'], infrastructure: ['Docker'], totalFiles: 5447, summary: 'ILP è un applicativo ...', catalogSignals: [{ name: 'Producer' }] } };

describe('the Sistema field and the chosen applications', () => {
  test('a list of systems is read from the field however it is separated', () => { expect(systemNames('IPERSUITE, IPER')).toEqual(['IPERSUITE', 'IPER']); expect(systemNames('A;B\nC')).toEqual(['A', 'B', 'C']); expect(systemNames('')).toEqual([]); expect(systemNames(null)).toEqual([]); });
  test('choosing an application fills an empty Sistema', () => { expect(addAppToSystem('', 'ILP')).toBe('ILP'); });
  test('what came from the Excel is kept and the application is added after it', () => { expect(addAppToSystem('NPSO', 'ILP')).toBe('NPSO, ILP'); });
  test('the same application is never added twice, whatever the case or the accents', () => { expect(addAppToSystem('ILP', 'ilp')).toBe('ILP'); expect(addAppToSystem('Applicazione', 'Applicazióne')).toBe('Applicazione'); });
  test('a blank name changes nothing', () => { expect(addAppToSystem('NPSO', '   ')).toBe('NPSO'); expect(addAppToSystem('NPSO', null)).toBe('NPSO'); });
  test('removing an application removes only its own name: the names from the Excel stay', () => { expect(removeAppFromSystem('NPSO, ILP', 'ILP', [])).toBe('NPSO'); expect(removeAppFromSystem('ILP', 'ILP', [])).toBe(''); });
  test('removing one of two applications with the same name keeps the name', () => { expect(removeAppFromSystem('ILP', 'ILP', ['ilp'])).toBe('ILP'); });
  test('removing an application that was never in the field changes nothing', () => { expect(removeAppFromSystem('NPSO', 'ILP', [])).toBe('NPSO'); });
});

describe('what is told to the AI about an application', () => {
  test('the name, the technologies, the databases, the integrations and the components of the application', () => {
    const brief = applicationBrief(ILP);
    expect(brief).toMatchObject({ name: 'ILP', code: 'ILP', aliases: ['ILP'], integrations: ['REST HTTP', 'Kafka'], interfaces: ['Web UI'], infrastructure: ['Docker'], totalComponents: 12, totalFiles: 5447 });
    expect(brief.components).toEqual(COMPONENTS); expect(brief.technologies).toEqual(expect.arrayContaining(['Java', 'TypeScript', 'C#', 'Angular'])); expect(brief.databases).toEqual(['PostgreSQL', 'Oracle']);
  });
  test('technologies are not repeated when the application and its profile both list them', () => { const brief = applicationBrief(ILP); expect(brief.technologies.filter(t => t === 'Java')).toHaveLength(1); });
  test('never the free note, the local path, the signals of the catalogue or anything not on the list', () => {
    const text = JSON.stringify(applicationBrief(ILP)); expect(text).not.toContain('NOTA LIBERA'); expect(text).not.toContain('/Users/mauro'); expect(text).not.toContain('Producer'); expect(Object.keys(applicationBrief(ILP)).sort()).toEqual(['aliases', 'code', 'components', 'databases', 'infrastructure', 'integrations', 'interfaces', 'name', 'summary', 'technologies', 'totalComponents', 'totalFiles']);
  });
  test('an application without a technical profile still gives its name and what the user typed', () => { const brief = applicationBrief({ name: 'BEP', languages: ['Java'] }); expect(brief).toMatchObject({ name: 'BEP', technologies: ['Java'], components: [], totalComponents: 0 }); });
  test('sizes are limited so a huge profile cannot flood the question', () => {
    const big = applicationBrief({ name: 'X'.repeat(500), techProfile: { components: Array.from({ length: 300 }, (_, i) => `c${i}`), technologies: Array.from({ length: 100 }, (_, i) => `t${i}`), summary: 'y'.repeat(5000) } });
    expect(big.name.length).toBe(80); expect(big.components).toHaveLength(40); expect(big.totalComponents).toBe(300); expect(big.technologies).toHaveLength(20); expect(big.summary.length).toBe(400);
  });
  test('the chosen applications come in the order of choice, a missing one is skipped, and there are at most four', () => {
    const apps = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, name: id.toUpperCase() }));
    expect(applicationBriefs(apps, ['b', 'zzz', 'a']).map(b => b.name)).toEqual(['B', 'A']); expect(applicationBriefs(apps, ['a', 'b', 'c', 'd', 'e', 'f'])).toHaveLength(MAX_APPLICATIONS);
    expect(applicationBriefs([], ['a'])).toEqual([]); expect(applicationBriefs(apps, null)).toEqual([]);
  });
  test('ids are compared as text: a number and a string with the same digits are the same application', () => { expect(applicationBriefs([{ id: 7, name: 'SEVEN' }], ['7']).map(b => b.name)).toEqual(['SEVEN']); });
});

describe('which components of the application have files in the saved folders', () => {
  test('a folder named like the component, or like its last part, belongs to it', () => {
    expect(componentNames('ILP_BACKEND_hu-transport-app')).toEqual(['ilp_backend_hu-transport-app', 'hu-transport-app']); expect(componentNames('ILP_frontend')).toEqual(['ilp_frontend', 'frontend']);
  });
  test('the real ILP case: only the frontend and item-service were loaded, the other ten components have no files', () => {
    const cov = componentCoverage(applicationBrief(ILP), ['ILP/ILP_frontend/src/app/first-scan/first-scan-container.component.ts', 'ILP/ILP_BACKEND/item-service/pom.xml', 'ILP/ILP_BACKEND/item-service/src/main/java/it/poste/item/service/ItemOutboundValidationService.java']);
    expect(cov.read.map(r => [r.component, r.files])).toEqual([['ILP_frontend', 1], ['ILP_BACKEND_item-service', 2]]);
    expect(cov.missing.map(r => r.component)).toEqual(expect.arrayContaining(['ILP_BACKEND_hu-transport-app', 'ILP_BACKEND_print-app', 'ILP_BACKEND_aggregate-app'])); expect(cov.missing).toHaveLength(10); expect(cov.total).toBe(12);
  });
  test('hu-transport-app is not confused with transport-app, nor aggregate-app with direct-injection-aggregate-app', () => {
    const cov = componentCoverage(applicationBrief(ILP), ['x/hu-transport-app/A.java', 'x/transport-app/B.java', 'x/direct-injection-aggregate-app/C.java']);
    const by = Object.fromEntries(cov.rows.map(r => [r.component.replace('ILP_BACKEND_', ''), r.files]));
    expect(by['hu-transport-app']).toBe(1); expect(by['transport-app']).toBe(1); expect(by['direct-injection-aggregate-app']).toBe(1); expect(by['aggregate-app']).toBe(0);
  });
  test('a Java package or a file with the same name as a component is NOT a folder of the component', () => {
    const cov = componentCoverage(applicationBrief(ILP), ['x/other-service/src/main/java/it/poste/print/PrintRules.java', 'x/other-service/src/transport-app.java']);
    expect(cov.read).toEqual([]);   // «print» come pacchetto e «transport-app.java» come file non attribuiscono nulla
  });
  test('a FILE named exactly like a component (no extension) is not a folder of that component', () => {
    const cov = componentCoverage(applicationBrief(ILP), ['x/y/print-app', 'x/y/item-service', 'ILP_frontend']);
    expect(cov.read).toEqual([]);
  });
  test('a file inside a component inside another is attributed to the innermost', () => {
    const brief = applicationBrief({ name: 'P', techProfile: { components: ['P_outer', 'P_inner'] } });
    const cov = componentCoverage(brief, ['outer/inner/A.java', 'outer/B.java']); expect(Object.fromEntries(cov.rows.map(r => [r.component, r.files]))).toEqual({ P_outer: 1, P_inner: 1 });
  });
  test('case and accents in folder names do not matter', () => { expect(componentCoverage(applicationBrief(ILP), ['ILP/ILP_BACKEND/Item-Service/pom.xml']).read.map(r => r.component)).toEqual(['ILP_BACKEND_item-service']); });
  test('an application without components, or no files, gives an empty and harmless answer', () => {
    expect(componentCoverage(applicationBrief({ name: 'BEP' }), ['a/b.java'])).toMatchObject({ rows: [], read: [], missing: [], total: 0 });
    expect(componentCoverage(applicationBrief(ILP), []).read).toEqual([]); expect(componentCoverage(applicationBrief(ILP), null).missing).toHaveLength(12);
  });
  test('when the profile lists more components than are shown the total is still the real one', () => {
    const brief = applicationBrief({ name: 'Big', techProfile: { components: Array.from({ length: 60 }, (_, i) => `Big_c${i}`) } }); const cov = componentCoverage(brief, []);
    expect(cov.total).toBe(60); expect(cov.shown).toBe(40);
  });
});
