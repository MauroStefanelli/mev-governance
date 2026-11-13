import { createHash, randomBytes, webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';
import { sha256Bytes, sha256Hex, randomId } from './cryptoCompat';

const reference = bytes => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const withCrypto = (value, run) => { const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto'); Object.defineProperty(globalThis, 'crypto', { value, configurable: true }); return Promise.resolve(run()).finally(() => { if (original) Object.defineProperty(globalThis, 'crypto', original); else delete globalThis.crypto; }); };
beforeAll(() => { if (!globalThis.TextEncoder) globalThis.TextEncoder = NodeTextEncoder; });

describe('SHA-256 in plain JavaScript gives exactly what the native one gives', () => {
  test('the published test vectors', () => {
    expect(hex(sha256Bytes(new Uint8Array(0)))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256Bytes(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256Bytes(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  test('every length around the 64-byte block boundaries (55, 56, 57, 63, 64, 65, 119, 120, 128 ...) and a few hundred more', () => {
    for (let length = 0; length <= 300; length++) { const bytes = randomBytes(length); expect(hex(sha256Bytes(bytes))).toBe(reference(bytes)); }
  });
  test('a large input (3 MB) of every byte value', () => {
    const bytes = new Uint8Array(3 * 1024 * 1024); for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + (i >> 8)) & 255;
    expect(hex(sha256Bytes(bytes))).toBe(reference(bytes));
  });
  test('the one-million-a vector', () => { expect(hex(sha256Bytes(new Uint8Array(1000000).fill(97)))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'); });
});

describe('sha256Hex of a text', () => {
  const samples = ['', 'class A {}', 'riga 1\nriga 2\r\nriga 3', 'perché è già così: àèìòù — “virgolette” €', '日本語のテキスト', '😀 emoji e surrogati', 'x'.repeat(5000)];
  test('equals the native value for each text, with the browser function available', async () => {
    for (const text of samples) await withCrypto(webcrypto, async () => expect(await sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex')));
  });
  test('equals the same value when the page has NO crypto.subtle (plain HTTP): the fingerprint does not depend on how the page was opened', async () => {
    for (const text of samples) await withCrypto({}, async () => expect(await sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex')));
    await withCrypto(undefined, async () => expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
  });
  test('falls back when the native function exists but refuses', async () => {
    await withCrypto({ subtle: { digest: async () => { throw new Error('not allowed'); } } }, async () => expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
  });
  test('a null or undefined text is the empty text', async () => { await withCrypto({}, async () => { expect(await sha256Hex(null)).toBe(await sha256Hex('')); expect(await sha256Hex(undefined)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'); }); });
});

describe('a runtime without TextEncoder', () => {
  test('the hash is still right (manual UTF-8) and never throws', async () => {
    const original = globalThis.TextEncoder; delete globalThis.TextEncoder;
    try {
      for (const text of ['abc', 'perché è già così — €', '😀 emoji']) await withCrypto({}, async () => expect(await sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex')));
    } finally { globalThis.TextEncoder = original; }
  });
  test('whatever happens inside, the answer is an empty string and not an exception', async () => {
    const original = globalThis.TextEncoder; globalThis.TextEncoder = class { encode() { throw new Error('boom'); } };
    try { await withCrypto({}, async () => expect(await sha256Hex('abc')).toBe('')); } finally { globalThis.TextEncoder = original; }
  });
});

describe('random identifiers', () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  test('with randomUUID available it is used', async () => { await withCrypto({ randomUUID: () => 'fixed-uuid' }, async () => expect(randomId()).toBe('fixed-uuid')); });
  test('without randomUUID (plain HTTP) it is a valid version-4 id built from getRandomValues, and ids differ', async () => {
    await withCrypto({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }, async () => { const ids = new Set(Array.from({ length: 500 }, randomId)); expect(ids.size).toBe(500); ids.forEach(id => expect(id).toMatch(V4)); });
  });
  test('with no crypto at all it still produces a valid id', async () => { await withCrypto(undefined, async () => { const id = randomId(); expect(id).toMatch(V4); expect(randomId()).not.toBe(id); }); });
});
