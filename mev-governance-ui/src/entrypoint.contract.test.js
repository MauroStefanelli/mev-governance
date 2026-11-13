import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const entry = fs.readFileSync(path.join(root, 'entrypoint.sh'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const compose = fs.readFileSync(path.resolve(root, '..', 'docker-compose.qnap.yml'), 'utf8');
const example = fs.readFileSync(path.resolve(root, '..', '.env.qnap.example'), 'utf8');
const gitignore = fs.readFileSync(path.resolve(root, '..', '.gitignore'), 'utf8');

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
    ['DATABASE_DIRECT_URL', 'JWT_KEY', 'ADMIN_PASSWORD'].forEach(name => expect(compose).toMatch(new RegExp(`${name}: \\$\\{${name}:\\?`)));
    ['Admin2025', 'Mev2025', 'SuperSecret', 'supabase.co', 'postgresql://'].forEach(secret => expect(compose).not.toContain(secret));
  });
  test('only the frontend publishes ports; Postgres is not on the NAS at all', () => {
    const published = compose.split('\n').filter(line => /^\s+ports:/.test(line) && !line.trim().startsWith('#')); expect(published).toHaveLength(1);
    expect(compose).not.toMatch(/image: postgres/); expect(compose).toMatch(/BACKEND_URL: http:\/\/backend:5000/);
  });
  test('it uses the develop images (the ones with the recent functions)', () => { expect(compose.match(/:\$\{IMAGE_TAG:-dev\}/g)).toHaveLength(3); });
  test('the example file has every variable the compose needs, empty for the secrets, and .env itself is git-ignored', () => {
    ['NAS_HOST', 'HTTP_PORT', 'HTTPS_PORT', 'DATABASE_DIRECT_URL', 'DB_SCHEMA', 'JWT_KEY', 'ADMIN_PASSWORD'].forEach(name => expect(example).toMatch(new RegExp(`^${name}=`, 'm')));
    ['DATABASE_DIRECT_URL', 'JWT_KEY', 'ADMIN_PASSWORD'].forEach(name => expect(example).toMatch(new RegExp(`^${name}=$`, 'm')));
    expect(gitignore).toMatch(/^\.env$/m);
  });
});
