import fs from 'fs';
import path from 'path';

// scripts/import-dev-to-prod.py scrive nei dati di PRODUZIONE: se qualcuno ne indebolisce le protezioni, questo test lo dice.
// Non esegue lo script (servirebbero due database): legge il testo e fissa le garanzie che contano.
const script = fs.readFileSync(path.resolve(__dirname, '..', '..', 'scripts', 'import-dev-to-prod.py'), 'utf8');
// Si controlla il codice, non la documentazione: si toglie la stringa di descrizione iniziale (tra i primi due """) e i commenti.
const first = script.indexOf('"""'); const code = script.slice(script.indexOf('"""', first + 3) + 3);
const sqlText = code.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');

describe('scripts/import-dev-to-prod.py', () => {
  test('writes nothing unless asked: the default is a dry run that ends in ROLLBACK, and COMMIT only comes with --commit', () => {
    expect(script).toContain("add('COMMIT;\\n' if args.commit else 'ROLLBACK;\\n')"); expect(script).toContain("'--commit', action='store_true'");
  });
  test('only adds rows: no UPDATE, DELETE, DROP, TRUNCATE, ALTER or INSERT ... SELECT on the destination', () => {
    const forbidden = sqlText.match(/\b(UPDATE|DELETE\s+FROM|DROP\s+(TABLE|SCHEMA|DATABASE)|TRUNCATE|ALTER\s+TABLE)\b/gi);
    expect(forbidden).toBeNull();
    expect(sqlText).toMatch(/COPY "\{S\}"\."\{table\}"|COPY "\{S\}"\./);
  });
  test('the source is only read, always inside a read-only transaction', () => {
    expect(script).toContain("'BEGIN READ ONLY'"); expect(script).toContain('read_only=True');
    expect(script).not.toMatch(/psql\(SRC_URL, \[['"]-f['"]/);
  });
  test('everything is one transaction on the destination, with a lock timeout so it gives up instead of waiting', () => {
    expect(script).toContain("add('\\\\set ON_ERROR_STOP on\\nBEGIN;"); expect(script).toContain("lock_timeout = \\'10s\\'"); expect(script.match(/BEGIN;/g)).toHaveLength(1);
  });
  test('refuses to import into tables that already have rows, and keys that already exist', () => {
    expect(script).toContain("non e'' vuota: non importo"); expect(script).toContain("una chiave da importare esiste gia");
  });
  test('rows that were already there must stay identical: a fingerprint before and after, and an exception if it changes', () => {
    expect(script).toContain('CREATE TEMP TABLE _before'); expect(script).toContain("la tabella % e'' cambiata, e non doveva: annullo"); expect(script).toContain("sono cambiate: annullo");
  });
  test('the contract, the lots, the shared applications and the Report Avanzamenti data are NOT imported', () => {
    const types = script.match(/PC_ENTITY_TYPES = \(([^)]*)\)/)[1];
    ['contract', 'contract_lot', 'shared_applications', 'release_calendar', 'release_progress', 'gara'].forEach(type => expect(types).not.toContain(`'${type}'`));
    ['initiative_evaluation', 'initiative_solution', 'implementation_plan', 'technical_analysis', 'code_change_request', 'implementation_report'].forEach(type => expect(types).toContain(`'${type}'`));
  });
  test('the test initiatives are left out', () => { expect(script).toContain("TEST_GOTOS = ('test-workspace-001', 'xxxxxx')"); expect(script).toContain('4490015980|2|initiative|testworkspace001'); expect(script).toContain('4490015980|2|initiative|xxxxxx'); });
  test('application ids of the source are translated to the ones of the destination by name, and it stops if one has no match', () => {
    expect(script).toContain('by_name = {n: i for i, n in dst_apps.items()}'); expect(script).toContain("restano identificativi di applicativi che nella destinazione non esistono");
  });
  test('the original ids are kept (the data point to each other) and the id sequences are moved after them', () => {
    expect(script).toContain('setval(seq, (SELECT max("Id")'); expect(script).not.toMatch(/OVERRIDING|DEFAULT VALUES/);
  });
  test('afterwards the destination is read back and compared with what was meant to be written', () => { expect(script).toContain('got == raw'); expect(script).toContain('NON usare questa importazione'); });
  test('the tables must have the same columns on both sides, or it stops', () => { expect(script).toContain('non ha le stesse colonne (nello stesso ordine) in origine e destinazione: mi fermo'); });
  test('errors never print the connection string', () => { expect(script).toContain('def scrub(text)'); expect(script).toContain('scrub(proc.stderr'); });
});
