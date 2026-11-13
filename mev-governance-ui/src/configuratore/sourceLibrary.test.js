import { IDBFactory } from 'fake-indexeddb';
import { inspectSelection, diffSelection, skipReason, saveSelection, listFolders, savedFiles, removeFolder, removeAll, setActive, resetSourceLibrary, getBackend,
  isPersistent, MAX_FOLDERS, MAX_FILES } from './sourceLibrary';

const file = (path, text, modified = 1000) => ({ name: path.split('/').pop(), size: text.length, lastModified: modified, webkitRelativePath: path, text: jest.fn(async () => text) });
const TOKEN = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const sel = (...files) => inspectSelection(files);
// a new browser session: the page is gone, the storage of the browser is not
const newSession = () => { resetSourceLibrary(); };

beforeEach(() => { global.indexedDB = new IDBFactory(); localStorage.setItem('XUSER', 'mario'); newSession(); });

describe('what enters the copy', () => {
  test('only source files, never build folders, big files, images', () => {
    const s = sel(file('app/src/A.java', 'class A {}'), file('app/node_modules/x/i.js', 'x'), file('app/target/B.class', 'b'), file('app/logo.png', 'png'), { ...file('app/src/Big.java', 'x'), size: 600000 });
    expect(s.entries.map(e => e.path)).toEqual(['app/src/A.java']); expect(s).toMatchObject({ name: 'app', ignored: 3, tooBig: 1, total: 5 });
  });
  test('a configuration file with a credential is refused, source code that only talks about passwords is not', () => {
    expect(skipReason('application-prod.yml', `spring:\n  token: ${TOKEN}`)).toMatchObject({ line: 2 });
    expect(skipReason('application.properties', 'db.password=Sup3rS3greta!x')).not.toBeNull();
    expect(skipReason('Login.java', 'class Login { String password = req.getParameter("password"); }')).toBeNull();
    expect(skipReason('TokenService.java', 'String token = jwtService.create(user);')).toBeNull();
    expect(skipReason('Client.java', `String t = "${TOKEN}";`)).toMatchObject({ line: 1 });
    expect(skipReason('Key.java', 'String k = "-----BEGIN RSA PRIVATE KEY-----";')).not.toBeNull();
    expect(skipReason('application.yml', 'server:\n  port: 8080')).toBeNull();
  });
});

describe('comparing a saved folder with a new selection', () => {
  const saved = { files: [{ path: 'a/X.java', size: 5, lastModified: 1 }, { path: 'a/Y.java', size: 5, lastModified: 1 }, { path: 'a/Gone.java', size: 5, lastModified: 1 }], skipped: [{ path: 'a/c.yml', size: 9, lastModified: 3 }] };
  const entry = (path, size, lastModified) => ({ path, size, lastModified });
  test('new, changed (size or date), same, removed and still-refused are told apart', () => {
    const d = diffSelection(saved, [entry('a/X.java', 5, 1), entry('a/Y.java', 6, 1), entry('a/Z.java', 1, 1), entry('a/c.yml', 9, 3)]);
    expect(d.same.map(e => e.path)).toEqual(['a/X.java']); expect(d.changed.map(e => e.path)).toEqual(['a/Y.java']); expect(d.added.map(e => e.path)).toEqual(['a/Z.java']);
    expect(d.removed).toEqual(['a/Gone.java']); expect(d.stillRefused.map(e => e.path)).toEqual(['a/c.yml']);
  });
  test('a date change alone counts as changed', () => { expect(diffSelection(saved, [entry('a/X.java', 5, 2)]).changed).toHaveLength(1); });
  test('a refused file that changes is looked at again', () => { expect(diffSelection(saved, [entry('a/c.yml', 9, 4)]).added).toHaveLength(1); });
});

describe('saving, and finding it again in a later session', () => {
  test('the files are there after the page is closed and opened again, with their text', async () => {
    await saveSelection({ selection: sel(file('item/src/A.java', 'class A { void h7() {} }'), file('item/src/B.java', 'class B {}')) });
    newSession();
    const folders = await listFolders(); expect(folders).toHaveLength(1); expect(folders[0]).toMatchObject({ name: 'item', active: true });
    const files = await savedFiles(folders); expect(files.map(f => f.webkitRelativePath)).toEqual(['item/src/A.java', 'item/src/B.java']);
    expect(await files[0].text()).toBe('class A { void h7() {} }'); expect(files[0]).toMatchObject({ name: 'A.java', size: 24 });
  });
  test('the data is kept in the browser store (not only in memory) and each user has their own', async () => {
    await saveSelection({ selection: sel(file('item/A.java', 'x')) }); expect(await isPersistent()).toBe(true);
    localStorage.setItem('XUSER', 'luisa'); newSession(); expect(await listFolders()).toEqual([]);
    localStorage.setItem('XUSER', 'mario'); newSession(); expect(await listFolders()).toHaveLength(1);
  });
  test('the text is read from the store only when asked', async () => {
    await saveSelection({ selection: sel(file('item/A.java', 'class A {}')) }); newSession();
    const files = await savedFiles(await listFolders()); expect(files[0].text).toEqual(expect.any(Function)); expect(typeof files[0].size).toBe('number');
  });
  test('a file with a credential in its configuration is not stored and is reported with the line, never the value', async () => {
    const { record, skipped } = await saveSelection({ selection: sel(file('item/src/A.java', 'class A {}'), file('item/application-prod.yml', `a: 1\nkey: ${TOKEN}`)) });
    expect(record.files.map(f => f.path)).toEqual(['item/src/A.java']); expect(skipped).toHaveLength(1); expect(skipped[0]).toMatchObject({ path: 'item/application-prod.yml', line: 2 });
    expect(JSON.stringify(record)).not.toContain(TOKEN); newSession(); const back = await savedFiles(await listFolders()); expect(back).toHaveLength(1);
    expect(await (await getBackend()).getText(record.id, 'item/application-prod.yml')).toBeUndefined();
  });
  test('a folder name already taken gets a number, and the paths follow the name', async () => {
    await saveSelection({ selection: sel(file('item/A.java', 'a')) });
    const { record } = await saveSelection({ selection: sel(file('item/B.java', 'b')) });
    expect(record.name).toBe('item (2)'); expect(record.files[0].path).toBe('item (2)/B.java');
  });
  test('there is a limit on how many folders are kept', async () => {
    for (let i = 0; i < MAX_FOLDERS; i++) await saveSelection({ selection: sel(file(`p${i}/A.java`, 'a')) });
    await expect(saveSelection({ selection: sel(file('extra/A.java', 'a')) })).rejects.toThrow(/al massimo/);
  });
  test('a folder with too many files is refused with a clear message and nothing is saved', async () => {
    const many = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ path: `big/F${i}.java`, size: 1, lastModified: 1, file: file(`big/F${i}.java`, 'x') }));
    await expect(saveSelection({ selection: { name: 'big', entries: many, ignored: 0, tooBig: 0 } })).rejects.toThrow(/limite/); expect(await listFolders()).toEqual([]);
  });
});

describe('updating a saved folder: only what changed is read', () => {
  const first = () => saveSelection({ selection: sel(file('item/A.java', 'class A {}'), file('item/B.java', 'class B {}'), file('item/C.java', 'class C {}')) });
  test('replace: new files are added, changed ones updated, missing ones removed, unchanged ones are NOT read again', async () => {
    const { record } = await first();
    const a = file('item/A.java', 'class A {}'); const b = file('item/B.java', 'class B { int x; }', 2000); const d = file('item/D.java', 'class D {}');
    const result = await saveSelection({ selection: sel(a, b, d), mode: 'replace', target: record });
    expect(result.diff).toEqual({ added: 1, changed: 1, same: 1, removed: 1, kept: 0 }); expect(a.text).not.toHaveBeenCalled(); expect(b.text).toHaveBeenCalledTimes(1);
    newSession(); const files = await savedFiles(await listFolders()); expect(files.map(f => f.name)).toEqual(['A.java', 'B.java', 'D.java']);
    expect(await files[1].text()).toBe('class B { int x; }'); expect(await (await getBackend()).getText(record.id, 'item/C.java')).toBeUndefined();
  });
  test('merge: what the selection does not contain stays (this is how a second folder or a subfolder is integrated)', async () => {
    const { record } = await first(); const e = file('item/E.java', 'class E {}');
    const result = await saveSelection({ selection: sel(e), mode: 'merge', target: record });
    expect(result.diff).toMatchObject({ added: 1, removed: 0, kept: 3 }); newSession(); expect((await savedFiles(await listFolders())).map(f => f.name)).toEqual(['A.java', 'B.java', 'C.java', 'E.java']);
  });
  test('a file that gained a credential leaves the copy: the old text is deleted', async () => {
    const { record } = await saveSelection({ selection: sel(file('item/application.yml', 'a: 1')) });
    const result = await saveSelection({ selection: sel(file('item/application.yml', `a: 1\nk: ${TOKEN}`, 5000)), mode: 'replace', target: record });
    expect(result.record.files).toEqual([]); expect(result.skipped).toHaveLength(1); expect(await (await getBackend()).getText(record.id, 'item/application.yml')).toBeUndefined();
  });
  test('a refused file that did not change is not read again and stays refused', async () => {
    const { record } = await saveSelection({ selection: sel(file('item/application.yml', `k: ${TOKEN}`)) });
    const again = file('item/application.yml', `k: ${TOKEN}`); const result = await saveSelection({ selection: sel(again), mode: 'replace', target: record });
    expect(again.text).not.toHaveBeenCalled(); expect(result.record.skipped).toHaveLength(1); expect(result.record.files).toEqual([]);
  });
  test('progress is reported', async () => {
    const seen = []; await saveSelection({ selection: sel(...Array.from({ length: 130 }, (_, i) => file(`p/F${i}.java`, 'x'))), onProgress: (d, t) => seen.push([d, t]) });
    expect(seen.at(-1)).toEqual([130, 130]); expect(seen.length).toBeGreaterThan(1);
  });
});

describe('removing and switching off', () => {
  test('removing a folder deletes its record AND its texts, and leaves the others alone', async () => {
    const one = await saveSelection({ selection: sel(file('one/A.java', 'a')) }); await saveSelection({ selection: sel(file('two/B.java', 'b')) });
    await removeFolder(one.record.id); newSession(); expect((await listFolders()).map(f => f.name)).toEqual(['two']);
    expect(await (await getBackend()).getText(one.record.id, 'one/A.java')).toBeUndefined();
  });
  test('removing everything empties the store', async () => { await saveSelection({ selection: sel(file('a/A.java', 'a')) }); await saveSelection({ selection: sel(file('b/B.java', 'b')) }); await removeAll(); expect(await listFolders()).toEqual([]); });
  test('a folder switched off is kept but not offered to the questions; switched on again it is', async () => {
    const { record } = await saveSelection({ selection: sel(file('one/A.java', 'a')) }); await setActive(record.id, false);
    expect(await savedFiles(await listFolders())).toEqual([]); expect(await listFolders()).toHaveLength(1);
    await setActive(record.id, true); expect(await savedFiles(await listFolders())).toHaveLength(1);
  });
});

describe('a browser without usable storage', () => {
  test('everything works in memory and the panel can tell it is not kept', async () => {
    delete global.indexedDB; newSession();
    await saveSelection({ selection: sel(file('item/A.java', 'class A {}')) }); expect(await isPersistent()).toBe(false);
    expect((await savedFiles(await listFolders()))[0].webkitRelativePath).toBe('item/A.java');
  });
  test('a full disk gives a message a person understands', async () => {
    const backend = await getBackend(); const original = backend.putTexts; backend.putTexts = async () => { const e = new Error('x'); e.name = 'QuotaExceededError'; throw e; };
    await expect(saveSelection({ selection: sel(file('item/A.java', 'a')) })).rejects.toThrow(/spazio/); backend.putTexts = original;
  });
});
