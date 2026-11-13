import fs from 'fs';
import zlib from 'zlib';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util';
import JSZip from 'jszip';
import { archiveKind, topKey, listTar, openArchive } from './archiveReader';

beforeEach(() => { if (!globalThis.TextEncoder) globalThis.TextEncoder = NodeTextEncoder; if (!globalThis.TextDecoder) globalThis.TextDecoder = NodeTextDecoder; });

// A minimal TAR writer for the tests: ustar headers of 512 bytes, data padded to 512, two empty blocks at the end.
const pad = (n, to = 512) => Buffer.alloc(Math.ceil(n / to) * to - n);
function header(name, size, type = '0', prefix = '') {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8'); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136); h.write('        ', 148); h.write(type, 156); h.write('ustar\0', 257); h.write('00', 263);
  if (prefix) h.write(prefix, 345, 155, 'utf8');
  let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}
function tar(entries) {
  const parts = [];
  for (const e of entries) {
    const data = Buffer.from(e.data ?? '', 'utf8');
    if (e.longName) { const ln = Buffer.from(e.longName + '\0'); parts.push(header('././@LongLink', ln.length, 'L'), ln, pad(ln.length)); }
    parts.push(header(e.name, e.type === '5' ? 0 : data.length, e.type || '0', e.prefix || ''), ...(e.type === '5' ? [] : [data, pad(data.length)]));
  }
  parts.push(Buffer.alloc(1024)); return Buffer.concat(parts);
}
const asFile = (buffer, name) => { const f = new File([buffer], name); Object.defineProperty(f, 'arrayBuffer', { value: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }); return f; };
const read = async (archive, path) => archive.files.get(path)();

describe('format detection and paths', () => {
  test('the format comes from the name, in any case; anything else is not recognised', () => {
    expect(archiveKind('a.zip')).toBe('zip'); expect(archiveKind('A.TAR.GZ')).toBe('targz'); expect(archiveKind('b.tgz')).toBe('targz'); expect(archiveKind('c.tar')).toBe('tar');
    expect(archiveKind('d.rar')).toBe(''); expect(archiveKind('e.tar.gz.zip')).toBe('zip'); expect(archiveKind('')).toBe(''); expect(archiveKind(undefined)).toBe('');
  });
  test('one extra top folder is dropped, a leading "./" too, but a path that does not contain projects/ is kept as is', () => {
    expect(topKey('projects/-home-m/memory/a.md')).toBe('projects/-home-m/memory/a.md'); expect(topKey('backup-1/projects/-home-m/a.md')).toBe('projects/-home-m/a.md');
    expect(topKey('./projects/x/a.md')).toBe('projects/x/a.md'); expect(topKey('./backup/projects/x/a.md')).toBe('projects/x/a.md'); expect(topKey('altro/cartella/a.md')).toBe('altro/cartella/a.md');
  });
});

describe('reading a TAR', () => {
  test('regular files are listed with their exact content, directories are skipped', async () => {
    const archive = await openArchive(asFile(tar([{ name: 'projects/', type: '5' }, { name: 'projects/a/ilp-uno.md', data: 'Prima nota: perché è così.' }, { name: 'projects/a/npso-due.md', data: 'Seconda' }]), 'b.tar'));
    expect([...archive.files.keys()]).toEqual(['projects/a/ilp-uno.md', 'projects/a/npso-due.md']); expect(archive.format).toBe('tar');
    expect(await read(archive, 'projects/a/ilp-uno.md')).toBe('Prima nota: perché è così.');
  });
  test('accents and a file whose size is not a multiple of 512 are read exactly (padding is not part of the content)', async () => {
    const body = 'è'.repeat(700); const archive = await openArchive(asFile(tar([{ name: 'projects/x/a.md', data: body }, { name: 'projects/x/b.md', data: 'dopo' }]), 'b.tar'));
    expect(await read(archive, 'projects/x/a.md')).toBe(body); expect(await read(archive, 'projects/x/b.md')).toBe('dopo');
  });
  test('an empty file is listed and read as empty', async () => {
    const archive = await openArchive(asFile(tar([{ name: 'projects/x/vuota.md', data: '' }, { name: 'projects/x/b.md', data: 'ok' }]), 'b.tar'));
    expect(await read(archive, 'projects/x/vuota.md')).toBe(''); expect(await read(archive, 'projects/x/b.md')).toBe('ok');
  });
  test('a name longer than 100 characters, written the GNU way or with a ustar prefix, is rebuilt', async () => {
    const dir = 'projects/-home-mfabbri-opencode-github-repositories-ilp/memory'; const file = 'ilp-' + 'molto-lungo-'.repeat(8) + 'fine.md'; const full = dir + '/' + file;
    const gnu = await openArchive(asFile(tar([{ name: 'x', longName: full, data: 'gnu' }]), 'b.tar')); expect(await read(gnu, full)).toBe('gnu');
    const prefixed = await openArchive(asFile(tar([{ name: file.slice(0, 90), prefix: dir, data: 'ustar' }]), 'b.tar')); expect(await read(prefixed, dir + '/' + file.slice(0, 90))).toBe('ustar');
  });
  test('symbolic links, devices and other special entries are skipped, never followed', async () => {
    const archive = await openArchive(asFile(tar([{ name: 'projects/x/link.md', type: '2' }, { name: 'projects/x/dev', type: '3' }, { name: 'projects/x/ok.md', data: 'vero' }]), 'b.tar'));
    expect([...archive.files.keys()]).toEqual(['projects/x/ok.md']);
  });
  test('the same path twice is reported as a duplicate and the first one wins', async () => {
    const archive = await openArchive(asFile(tar([{ name: 'projects/x/a.md', data: 'prima' }, { name: 'projects/x/a.md', data: 'seconda' }]), 'b.tar'));
    expect(archive.duplicates).toEqual(['projects/x/a.md']); expect(await read(archive, 'projects/x/a.md')).toBe('prima');
  });
  test('an archive cut in the middle of a file is refused with a clear message instead of returning half a note', () => {
    const whole = tar([{ name: 'projects/x/a.md', data: 'a'.repeat(2000) }]);
    expect(() => listTar(new Uint8Array(whole.subarray(0, 900)))).toThrow('danneggiato o incompleto');
  });
  test('garbage that is not a TAR yields no files, not a crash', () => { expect(listTar(new Uint8Array(0))).toEqual([]); expect(listTar(new Uint8Array(1024))).toEqual([]); });
});

describe('reading a TAR.GZ and a ZIP', () => {
  const entries = [{ name: 'projects/-home-m/memory/ilp-a.md', data: 'Nota A' }, { name: 'projects/-home-m/memory/npso-b.md', data: 'Nota B' }];
  test('a tar.gz and a tgz give the same notes as the plain tar', async () => {
    const raw = tar(entries); const gz = zlib.gzipSync(raw);
    for (const name of ['b.tar.gz', 'b.tgz']) { const a = await openArchive(asFile(gz, name)); expect(a.format).toBe('targz'); expect([...a.files.keys()]).toEqual(entries.map(e => e.name)); expect(await read(a, entries[1].name)).toBe('Nota B'); }
  });
  test('the extra top folder of a backup directory is ignored in every format', async () => {
    const wrapped = entries.map(e => ({ ...e, name: 'backup-2026/' + e.name })); const a = await openArchive(asFile(zlib.gzipSync(tar(wrapped)), 'b.tar.gz'));
    expect([...a.files.keys()]).toEqual(entries.map(e => e.name));
    const zip = new JSZip(); wrapped.forEach(e => zip.file(e.name, e.data)); const z = await openArchive(asFile(await zip.generateAsync({ type: 'nodebuffer' }), 'b.zip')); expect([...z.files.keys()].sort()).toEqual(entries.map(e => e.name).sort());
    expect(await read(z, entries[0].name)).toBe('Nota A');
  });
  test('a file named .tar.gz that is not gzip is refused with a message that says so', async () => {
    await expect(openArchive(asFile(Buffer.from('questo non è un archivio'), 'b.tar.gz'))).rejects.toThrow('manca l’intestazione gzip');
  });
  test('a truncated gzip is refused as damaged, not read as empty', async () => {
    const gz = zlib.gzipSync(tar(entries)); await expect(openArchive(asFile(gz.subarray(0, Math.floor(gz.length / 2)), 'b.tar.gz'))).rejects.toThrow(/danneggiato|incompleto/);
  });
  test('a zip that is not a zip, an unknown format and a missing file are each refused with their own reason', async () => {
    await expect(openArchive(asFile(Buffer.from('xx'), 'b.zip'))).rejects.toThrow('non è uno zip leggibile');
    await expect(openArchive(asFile(Buffer.from('xx'), 'b.rar'))).rejects.toThrow('.zip, .tar.gz, .tgz o .tar'); await expect(openArchive(null)).rejects.toThrow('Scegli l’archivio');
  });
  test('an archive over the size limit is refused before it is opened', async () => {
    const big = new File(['x'], 'b.tar.gz'); Object.defineProperty(big, 'size', { value: 700 * 1024 * 1024 }); await expect(openArchive(big)).rejects.toThrow('supera');
  });
});

describe('on the real backup', () => {
  const REAL = '/Users/MSTEFANE/Downloads/claude-backup-20261111-143450.tar.gz';
  (fs.existsSync(REAL) ? test : test.skip)('the real tar.gz gives 507 entries, 384 notes, and the first note is the same as in the zip', async () => {
    const buffer = fs.readFileSync(REAL); const a = await openArchive(asFile(buffer, 'claude-backup-20261111-143450.tar.gz'));
    expect(a.files.size).toBe(507); expect([...a.files.keys()].filter(k => /\.md$/i.test(k))).toHaveLength(384); expect(a.duplicates).toEqual([]);
    expect(await read(a, 'projects/-home-mfabbri-opencode-github-repositories-ilp/memory/ilp.md')).toMatch(/camel/i);
  }, 120000);
});
