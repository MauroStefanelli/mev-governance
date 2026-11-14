import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const entry = fs.readFileSync(path.join(root, 'entrypoint.sh'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const compose = fs.readFileSync(path.resolve(root, '..', 'docker-compose.qnap.yml'), 'utf8');
const example = fs.readFileSync(path.resolve(root, '..', '.env.qnap.example'), 'utf8');
const gitignore = fs.readFileSync(path.resolve(root, '..', '.gitignore'), 'utf8');
const importScript = fs.readFileSync(path.resolve(root, '..', 'scripts', 'qnap-db-import.sh'), 'utf8');
const renderScript = fs.readFileSync(path.resolve(root, '..', 'scripts', 'qnap_render_compose.py'), 'utf8');

describe('the frontend image: Render keeps working, the NAS gets a proxy', () => {
  test('without BACKEND_URL the browser still calls REACT_APP_API_URL directly (Render, unchanged)', () => {
    expect(entry).toMatch(/if \[ -n "\$BACKEND_URL" \]; then\s+API_URL=""\s+else\s+API_URL="\$\{REACT_APP_API_URL\}"/);
    expect(entry).toMatch(/if \[ -z "\$BACKEND_URL" \]; then[\s\S]*?exec nginx -g "daemon off;"\s+fi/);
  });
  test('with BACKEND_URL the page calls its own address and /api is forwarded, with the original path and query', () => {
    expect(entry).toContain('API_URL=""');
    expect(entry).toContain('location /api/');
    expect(entry).toContain('proxy_pass \\$backend\\$request_uri;');
  });
  test('the backend name is resolved at each request, so the frontend starts even if the backend is not up yet', () => {
    expect(entry).toMatch(/resolver \$\{RESOLVER\}/); expect(entry).toContain('set \\$backend "${BACKEND_URL}"');
  });
  test('HTTP and HTTPS are both served, with the certificate mounted or self-generated with the address in subjectAltName', () => {
    expect(entry).toMatch(/listen \$\{HTTP_PORT\};/); expect(entry).toMatch(/listen \$\{HTTPS_PORT\} ssl;/);
    expect(entry).toContain('/certs/server.crt'); expect(entry).toContain('openssl req -x509'); expect(entry).toMatch(/openssl req -x509[^\n]*\\\n[^\n]*-addext "subjectAltName=\$\{SAN\}"/);
  });
  test('uploads up to the largest the backend accepts (50 MB) go through the proxy', () => { expect(entry).toMatch(/MAX_BODY="\$\{MAX_BODY:-60m\}"/); });
  test('the image has openssl (alpine nginx does not) and exposes both ports', () => { expect(dockerfile).toMatch(/apk add --no-cache openssl/); expect(dockerfile).toMatch(/EXPOSE 80 8443/); });
  test('the default nginx.conf still serves the app as before', () => { expect(fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8')).toContain('try_files $uri $uri/ /index.html'); });
});

describe('the NAS compose: no secret in the repository, only the frontend on the network', () => {
  test('passwords and keys come from the .env file, and the compose refuses to start without them', () => {
    ['POSTGRES_PASSWORD', 'JWT_KEY', 'ADMIN_PASSWORD'].forEach(name => expect(compose).toMatch(new RegExp(`${name}: \\$\\{${name}:\\?`)));
    ['Admin2025', 'Mev2025', 'SuperSecret', 'supabase.co'].forEach(secret => expect(compose).not.toContain(secret));
    expect(compose).not.toMatch(/postgresql:\/\/[^$\s]+:[^$\s]+@/);
  });
  test('the web app is the only thing open to the network by default; the database port is bound to the NAS itself unless the user opens it', () => {
    expect(compose).toContain('"${PG_BIND:-127.0.0.1}:${PG_PORT:-5433}:5432"');
    const published = compose.split('\n').filter(line => /^\s+- "[^"]*:[^"]*:\d+"$/.test(line) && !line.includes('/') && !line.trim().startsWith('#')); expect(published).toHaveLength(3);
    expect(compose).toMatch(/BACKEND_URL: http:\/\/backend:5000/);
    ['pdf-parser', 'backend', 'db-import'].forEach(name => expect(compose.slice(compose.indexOf(`  ${name}:`), compose.indexOf('\n\n', compose.indexOf(`  ${name}:`)) + 1)).not.toMatch(/^\s+ports:/m));
  });
  test('the example file closes the database port by default (127.0.0.1) and explains how to open it', () => { expect(example).toMatch(/^PG_BIND=127\.0\.0\.1$/m); expect(example).toMatch(/^PG_PORT=5433$/m); });
  test('it uses the develop images (the ones with the recent functions)', () => { expect(compose.match(/:\$\{IMAGE_TAG:-dev\}/g)).toHaveLength(3); });
  test('the example file has every variable the compose needs, empty for the secrets, and .env itself is git-ignored', () => {
    ['NAS_HOST', 'HTTP_PORT', 'HTTPS_PORT', 'POSTGRES_PASSWORD', 'PG_DIR', 'SOURCE_DATABASE_URL', 'IMPORT_MODE', 'DB_SCHEMA', 'JWT_KEY', 'ADMIN_PASSWORD'].forEach(name => expect(example).toMatch(new RegExp(`^${name}=`, 'm')));
    ['POSTGRES_PASSWORD', 'SOURCE_DATABASE_URL', 'JWT_KEY', 'ADMIN_PASSWORD'].forEach(name => expect(example).toMatch(new RegExp(`^${name}=$`, 'm')));
    expect(gitignore).toMatch(/^\.env$/m);
  });
});

describe('the database on the NAS: copied once from Render, never lost by a restart', () => {
  test('Postgres 17 (the version of the source), data on a NAS folder, no published port, started only when healthy', () => {
    expect(compose).toMatch(/postgres:\n\s+image: postgres:17-alpine/); expect(compose).toMatch(/\$\{PG_DIR:-[^}]*\}:\/var\/lib\/postgresql\/data/); expect(compose).toMatch(/healthcheck:[\s\S]*?pg_isready/);
  });
  test('the backend starts only after the database is healthy AND the import has finished successfully', () => {
    expect(compose).toMatch(/backend:[\s\S]*?depends_on:\s+postgres:\s+condition: service_healthy\s+db-import:\s+condition: service_completed_successfully/);
  });
  test('the importer never keeps running and never restarts by itself', () => { expect(compose).toMatch(/db-import:[\s\S]*?restart: "no"/); });
  test('the backend talks to the NAS database, not to Supabase, on the internal network', () => { expect(compose).toMatch(/DATABASE_DIRECT_URL: postgresql:\/\/\$\{POSTGRES_USER:-mev\}:\$\{POSTGRES_PASSWORD\}@postgres:5432/); });
  test('default mode is "once": a restart or an update never overwrites data written on the NAS', () => {
    expect(compose).toContain('IMPORT_MODE: ${IMPORT_MODE:-once}'); expect(importScript).toMatch(/MODE="\$\{IMPORT_MODE:-once\}"/);
    expect(importScript).toMatch(/"\$MODE" = "once" \] && \[ "\$TABLES" -gt 0 \] && \[ "\$USERS" -gt 0 \]/);
  });
  test('the copy is atomic: one transaction, stop at the first error, so a failure leaves the NAS database as it was', () => { expect(importScript).toMatch(/pg_restore[^\n]*--single-transaction[^\n]*--exit-on-error/); });
  test('only the app schema is copied (never Supabase auth/storage), with a safe name, and without Supabase roles or owners', () => {
    expect(importScript).toMatch(/pg_dump[^\n]*--schema="\$SCHEMA"[^\n]*--no-owner[^\n]*--no-privileges/); expect(importScript).toMatch(/\*\[!a-zA-Z0-9_\]\*/);
    ['anon', 'authenticated', 'service_role'].forEach(role => expect(importScript).toContain(role));
  });
  test('SSL is required for the origin only, never for the internal NAS database', () => {
    expect(importScript).not.toMatch(/^export PGSSLMODE/m); expect(importScript).toMatch(/PGSSLMODE="\$SRC_SSL"[^\n]*pg_dump/); expect(importScript).toMatch(/PGSSLMODE=disable[^\n]*pg_restore/);
  });
  test('an error message never prints the origin URL (it holds the password)', () => { expect(importScript).toMatch(/scrub\(\) \{ sed/); expect(importScript).toMatch(/pg_dump[\s\S]*?scrub < \/tmp\/dump\.err/); });
  test('the file pasted in Container Station carries the script inside (no folder to mount), with every $ doubled for Compose', () => {
    expect(renderScript).toMatch(/def embed_import_script/); expect(renderScript).toContain("script.replace('$', '$$')"); expect(compose).toContain('./scripts/qnap-db-import.sh:/import.sh:ro');
  });
  test('every secret is quoted in the pasted file, including the new database password', () => { ['POSTGRES_PASSWORD', 'SOURCE_DATABASE_URL', 'PGPASSWORD', 'DATABASE_DIRECT_URL'].forEach(name => expect(renderScript).toContain(`'${name}'`)); });
});

