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
