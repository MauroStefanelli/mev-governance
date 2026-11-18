import fs from 'fs';
import path from 'path';

// Il backup di PROD e' la rete di sicurezza del rilascio: se qualcuno ne indebolisce le protezioni, questo test lo dice.
// Non esegue lo script (servirebbe PROD): legge il testo e ne fissa le garanzie.
const ROOT = path.resolve(__dirname, '..', '..');
const script = fs.readFileSync(path.join(ROOT, 'scripts', 'backup-prod.sh'), 'utf8');
const release = fs.readFileSync(path.join(ROOT, 'RELEASE.md'), 'utf8');
const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

describe('scripts/backup-prod.sh', () => {
  test('reads PROD only: every query goes through a read-only transaction, and read-only is PROVED before anything is downloaded', () => {
    expect(script).toContain('begin read only; $1; rollback;');
    expect(script).toMatch(/create temp table zz_probe_ro/); expect(script).toContain('read-only transaction');
    expect(script.indexOf('create temp table zz_probe_ro')).toBeLessThan(script.indexOf('--format=custom'));
  });
  test('it never writes to PROD: no INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE is sent to the production URL', () => {
    const lines = script.split('\n').filter(line => line.includes('$PROD_DATABASE_URL'));
    lines.forEach(line => expect(line).not.toMatch(/\b(insert|update|delete|drop|alter|truncate|create table)\b/i));
    expect(script).not.toMatch(/pg_restore[^\n]*\$PROD_DATABASE_URL/);
  });
  test('the schema name is validated, because it ends up in a command', () => {
    expect(script).toContain("case \"$SCHEMA\" in ''|*[!A-Za-z0-9_]*) die");
  });
  test('it refuses a copy it cannot trust: too small, unreadable, with fewer tables than PROD, or a restore that does not match', () => {
    expect(script).toMatch(/\[ "\$SIZE" -gt 5000 \] \|\| \{ rm -f "\$FILE"; die "il file e' troppo piccolo/); expect(script).toContain('troppo piccolo'); expect(script).toContain('pg_restore" --list'); expect(script).toContain('meno tabelle di PROD'); expect(script).toContain('il ripristino NON coincide con PROD');
    expect(script).toContain('diff -q "$COUNTS" "$RESTORED"');
  });
  test('it restores into a throwaway LOCAL Postgres, never into the production URL', () => {
    expect(script).toMatch(/L="postgresql:\/\/postgres@localhost:\$PGPORT_TMP"/); expect(script).toContain('--dbname="$L/restoretest"'); expect(script).toContain('PGSSLMODE=disable');
  });
  test('the copy is private, outside the repository, and carries a checksum', () => {
    expect(script).toContain('chmod 700 "$OUT"'); expect(script).toContain('chmod 600 "$FILE"'); expect(script).toContain('.sha256'); expect(script).toContain('$HOME/mev-backup-prod');
  });
  test('the error messages never print the connection string (it contains the password)', () => {
    expect(script).toContain('scrub() { sed -E'); expect(script).not.toMatch(/echo[^\n]*\$PROD_DATABASE_URL|log[^\n]*\$PROD_DATABASE_URL|die[^\n]*\$PROD_DATABASE_URL/);
  });
});

describe('RELEASE.md: the PROD procedure', () => {
  test('the backup comes before the merge, and the merge is tried on a test branch first', () => {
    const i = s => release.indexOf(s);
    expect(i('scripts/backup-prod.sh')).toBeGreaterThan(-1); expect(i('Copia di sicurezza di PROD')).toBeLessThan(i('git merge develop'));
    expect(release.indexOf('COPIA DI SICUREZZA di PROD')).toBeLessThan(release.indexOf('→ merge su main')); expect(release).not.toContain('git merge develop main');
    expect(i('release/prod-prova')).toBeGreaterThan(-1); expect(i('release/prod-prova')).toBeLessThan(release.lastIndexOf('git push origin main'));
  });
  test('it warns about what is risky: conflicts on main, «Annulla ultimo Align» and the admin password', () => {
    expect(release).toMatch(/Flusso di lavoro consigliato\s+```\s+sviluppo[^`]*COPIA DI SICUREZZA di PROD \(scripts\/backup-prod\.sh\)[^`]*merge su un branch di prova[^`]*```/);
    const steps = release.slice(release.indexOf('## Come rilasciare in PROD'));
    expect(steps).toMatch(/git checkout -b release\/prod-prova\s+git merge develop/); expect(steps).toMatch(/git merge --no-ff release\/prod-prova/);
    expect(steps.indexOf('Passo 2')).toBeLessThan(steps.indexOf('Passo 3')); expect(steps.indexOf('Passo 3')).toBeLessThan(steps.indexOf('Passo 4'));
    expect(release).toContain('conflitto'); expect(release).toContain('«Annulla ultimo Align» cancella righe'); expect(release).toContain('ADMIN_PASSWORD');
  });
  test('it no longer tells to merge and push without checks', () => {
    expect(release).not.toMatch(/git checkout main\ngit pull origin main\ngit merge develop --no-ff -m "release: merge develop → main vX\.Y"\ngit push origin main/);
  });
});

test('backup files can never be committed by mistake', () => {
  expect(ignore).toContain('*.dump'); expect(ignore).toContain('mev-backup-prod/'); expect(ignore).toContain('*.righe.txt');
});
