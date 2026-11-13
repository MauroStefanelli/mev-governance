import { webcrypto } from 'crypto';
import { activitySourceContext } from './activitySourceContext';

test('samples code with exact source references and hashes while excluding build paths', async () => {
  Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto });
  const { TextEncoder } = require('util'); global.TextEncoder = TextEncoder;
  const source = { name: 'Api.java', webkitRelativePath: 'NPSO/src/Api.java', size: 100, text: async () => 'class Api {\n void accettazione() {}\n}' };
  const result = await activitySourceContext([source, { ...source, webkitRelativePath: 'NPSO/target/Api.java' }], 'accettazione');
  expect(result.files).toHaveLength(1);
  expect(result.files[0]).toMatchObject({ path: 'NPSO/src/Api.java', startLine: 1, endLine: 3 });
  expect(result.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.coverage.notice).toContain('non analisi completa');
});

test('reads and hashes each file once when several activities share a folder', async () => {
  Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto });
  const { TextEncoder } = require('util'); global.TextEncoder = TextEncoder;
  const { createSourceCache } = require('./activitySourceContext');
  const text = jest.fn(async () => 'class Api {\n void accettazione() {}\n void spedizione() {}\n}');
  const file = { name: 'Api.java', webkitRelativePath: 'NPSO/src/Api.java', size: 100, text };
  const cache = createSourceCache();
  const first = await activitySourceContext([file], 'accettazione', cache);
  const second = await activitySourceContext([file], 'spedizione', cache);
  expect(text).toHaveBeenCalledTimes(1);
  expect(second.files[0].sha256).toBe(first.files[0].sha256);
  expect(second.files[0].path).toBe('NPSO/src/Api.java');
  await activitySourceContext([file], 'accettazione');
  expect(text).toHaveBeenCalledTimes(2);
});

// The case that went wrong in real use: a folder with many files, the rules deep inside, the question full of short codes.
describe('a question about rules named by short codes, on a folder with many files', () => {
  const setup = () => { Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto }); const { TextEncoder } = require('util'); global.TextEncoder = TextEncoder; };
  const file = (path, text) => ({ name: path.split('/').pop(), webkitRelativePath: path, size: text.length, text: async () => text });
  const folder = () => [
    file('item-service/pom.xml', '<project><artifactId>item-service</artifactId><dependency>item-core</dependency><camel>4.18.0</camel></project>'),
    ...Array.from({ length: 70 }, (_, i) => file(`item-service/src/service/Servizio${i}.java`, `class Servizio${i} { void esegui() { /* servizio generico ${i} */ } }`)),
    file('item-service/src/service/ItemOutboundValidationService.java', 'class ItemOutboundValidationService {\n  void valida() { aggregateService.call(); }\n}'),
    file('item-service/src/print/PrintRulesH7.java', 'class PrintRulesH7 {\n  boolean canPrint(Item i) {\n    // H7: la stampa è consentita solo se esiste l\'esito doganale\n    return i.isH7();\n  }\n}'),
    file('item-service/src/hu/LdvItaResolver.java', 'class LdvItaResolver {\n  boolean insertInHu(Hu hu, String ldvIta) { return hu.accept(ldvIta); }\n}'),
    file('item-service/src/cha/ChaPddpExclusion.java', 'class ChaPddpExclusion {\n  // CHA escluso per PDDP\n  boolean excluded(Item i) { return i.isPddp(); }\n}'),
    file('item-service/src/hu/HuDeparture.java', 'class HuDeparture {\n  // conferma partenza: blocca la HU\n  void confermaPartenza(Hu hu) { if (hu.hasBlocked()) throw new IllegalStateException(); }\n}'),
  ];
  const question = 'Nel P1 dove sono le condizioni di stampa H7, l\'esclusione CHA per PDDP, il riconoscimento della LDV ITA nell\'inserimento in HU e il blocco della conferma partenza?';

  test('the files that hold the rules are sent, not the first files of the folder or the pom', async () => {
    setup(); const { files, coverage } = await activitySourceContext(folder(), question, new Map());
    const names = files.map(item => item.path.split('/').pop());
    expect(names).toEqual(expect.arrayContaining(['PrintRulesH7.java', 'LdvItaResolver.java', 'ChaPddpExclusion.java', 'HuDeparture.java']));
    expect(names).not.toContain('pom.xml'); expect(names.filter(name => /^Servizio\d+/.test(name))).toEqual([]);
    expect(coverage.eligibleFiles).toBe(76); expect(coverage.sampledFiles).toBe(76); expect(coverage.notOpened).toBe(0);
  });
  test('the excerpt shows the rule, starting near the line that matches', async () => {
    setup(); const { files } = await activitySourceContext(folder(), question, new Map());
    const h7 = files.find(item => item.path.endsWith('PrintRulesH7.java')); expect(h7.text).toContain('la stampa è consentita');
    expect(h7.why.inPath).toContain('h7');
  });
  test('the user can say where to look, and the words typed are used', async () => {
    setup(); const { files, terms } = await activitySourceContext(folder(), 'cosa fa?', new Map(), { extraTerms: 'ChaPddpExclusion' });
    expect(terms).toContain('chapddpexclusion'); expect(files[0].path).toContain('ChaPddpExclusion');
  });
  test('files that share nothing with the question are not sent to fill the sample', async () => {
    setup(); const { files, coverage } = await activitySourceContext(folder(), 'dove sono le regole di H7?', new Map());
    expect(files.length).toBeLessThan(8); expect(files.every(item => item.why.inPath.length + item.why.inText.length > 0)).toBe(true);
    expect(coverage.notice).toContain('scelti per le parole della domanda');
  });
  test('a question with no usable word still shows a little structure and says so, so the AI knows it has not seen the rule', async () => {
    setup(); const { files, coverage } = await activitySourceContext(folder(), 'qual è il senso di tutto?', new Map());
    expect(files).toHaveLength(3); expect(coverage.notice).toContain('Nessun file contiene le parole della domanda'); expect(coverage.notice).toContain('Cerca nel codice');
  });
  test('the pom comes after the code, unless the question is about dependencies', async () => {
    setup();
    const code = await activitySourceContext(folder(), 'item-core stampa H7', new Map()); const order = code.files.map(item => item.path.split('/').pop());
    expect(order.indexOf('pom.xml')).toBeGreaterThan(order.indexOf('PrintRulesH7.java'));
    const deps = await activitySourceContext(folder(), 'quale dipendenza item-core e quale versione camel nel pom?', new Map());
    expect(deps.files[0].path).toContain('pom.xml');
  });
  test('a very large folder is not opened file by file: the files with a term in the path are opened first and the rest is reported', async () => {
    setup(); const many = Array.from({ length: 900 }, (_, i) => file(`big/src/Cls${i}.java`, `class Cls${i} {}`)); many.push(file('big/src/PrintRulesH7.java', 'class PrintRulesH7 { /* h7 */ }'));
    const { files, coverage } = await activitySourceContext(many, 'stampa H7', new Map());
    expect(files[0].path).toContain('PrintRulesH7'); expect(coverage.sampledFiles).toBe(400); expect(coverage.notOpened).toBe(501);
  });

  test('a build file that mentions many terms still comes after the code that mentions fewer, unless the question is about the build', async () => {
    setup(); const files = [file('svc/pom.xml', '<p>h7 stampa cha pddp ldv hu</p>'), file('svc/src/PrintRulesH7.java', 'class PrintRulesH7 { /* stampa */ }'), file('svc/src/Altra.java', 'class Altra {}')];
    const asked = await activitySourceContext(files, 'stampa H7 CHA PDDP LDV HU', new Map()); const order = asked.files.map(item => item.path.split('/').pop());
    expect(order.indexOf('PrintRulesH7.java')).toBeLessThan(order.indexOf('pom.xml')); expect(order).toContain('pom.xml');
  });
  test('when the question is about dependencies the pom is not pushed after the code: it is first when it matches at least as well', async () => {
    setup(); const files = [file('svc/pom.xml', '<dependency>camel</dependency>'), file('svc/src/Note.java', '// camel\nclass Note {}'), file('svc/src/Altra.java', 'class Altra {}')];
    const { files: sent } = await activitySourceContext(files, 'dipendenza versione camel pom', new Map());
    expect(sent[0].path).toContain('pom.xml');
  });
  test('never more than eight excerpts leave, however many files match', async () => {
    setup(); const files = Array.from({ length: 30 }, (_, i) => file(`svc/src/Print${i}.java`, `class Print${i} { /* stampa H7 */ }`));
    const { files: sent, coverage } = await activitySourceContext(files, 'stampa H7', new Map());
    expect(sent).toHaveLength(8); expect(coverage.matchingFiles).toBe(30); expect(coverage.sentFiles).toBe(8);
  });
});
