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
