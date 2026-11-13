import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IDBFactory } from 'fake-indexeddb';
import useSourceLibrary from './useSourceLibrary';
import SourceLibraryPanel from './SourceLibraryPanel';
import { resetSourceLibrary, listFolders } from './sourceLibrary';

const TOKEN = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const file = (path, text, modified = 1000) => { const f = new File([text], path.split('/').pop(), { lastModified: modified }); Object.defineProperty(f, 'webkitRelativePath', { value: path }); Object.defineProperty(f, 'text', { value: jest.fn(async () => text) }); return f; };
let chooser; let seen;
function Harness() { const library = useSourceLibrary(); seen = library; return <><SourceLibraryPanel library={library} /><output aria-label="file disponibili">{library.files.map(f => f.webkitRelativePath).join(',')}</output></>; }
// what the browser does when the user picks a folder
const pickNext = files => { chooser = { files, setAttribute: jest.fn(), click: jest.fn() }; };
const choose = async () => { fireEvent.click(await screen.findByRole('button', { name: /Seleziona cartella sorgenti|Aggiungi o aggiorna una cartella/ })); await act(async () => { chooser.onchange(); }); };
const available = () => screen.getByLabelText('file disponibili').textContent;

beforeEach(() => {
  global.indexedDB = new IDBFactory(); resetSourceLibrary(); localStorage.setItem('XUSER', 'mario');
  const original = document.createElement.bind(document); jest.spyOn(document, 'createElement').mockImplementation(tag => { if (tag === 'input' && chooser && !chooser.taken) { chooser.taken = true; return chooser; } return original(tag); });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { jest.restoreAllMocks(); chooser = null; });

test('the folder is chosen once and is found again when the page is opened again, without choosing it', async () => {
  const first = render(<Harness />); expect(await screen.findByText(/Scegli la cartella una volta sola/)).toBeInTheDocument();
  pickNext([file('item/src/A.java', 'class A {}'), file('item/src/B.java', 'class B {}')]); await choose();
  expect(await screen.findByText(/2 file · /)).toBeInTheDocument(); expect(available()).toBe('item/src/A.java,item/src/B.java');
  first.unmount(); resetSourceLibrary();     // the page is closed; the browser keeps its storage
  chooser = null; render(<Harness />);
  expect(await screen.findByRole('checkbox', { name: /item/ })).toBeChecked(); expect(screen.getByText(/2 file · /)).toBeInTheDocument();
  await waitFor(() => expect(available()).toBe('item/src/A.java,item/src/B.java')); expect(await seen.files[0].text()).toBe('class A {}');
});

test('choosing a folder already saved shows what would change and lets the user update, integrate or keep both', async () => {
  render(<Harness />); await screen.findByText(/Scegli la cartella una volta sola/);
  pickNext([file('item/A.java', 'class A {}'), file('item/B.java', 'class B {}')]); await choose(); await screen.findByText(/2 file · /);
  const a = file('item/A.java', 'class A {}'); const b = file('item/B.java', 'class B { int x; }', 2000); const c = file('item/C.java', 'class C {}');
  pickNext([a, b, c]); await choose();
  const box = await screen.findByRole('group', { name: 'Cartella già salvata' });
  expect(box).toHaveTextContent(/1 file nuovo, 1 modificato, 1 invariato, 0 non più presenti/); expect(a.text).not.toHaveBeenCalled();
  fireEvent.click(within(box).getByRole('button', { name: /^Integra/ }));
  expect(await screen.findByText(/salvata: 1 file nuovo, 1 aggiornato/)).toBeInTheDocument(); expect(a.text).not.toHaveBeenCalled();
  await waitFor(() => expect(available()).toBe('item/A.java,item/B.java,item/C.java'));
});

test('integrating a subfolder keeps what was already there; updating makes the copy equal to the new selection', async () => {
  render(<Harness />); await screen.findByText(/Scegli la cartella una volta sola/);
  pickNext([file('item/A.java', 'a'), file('item/B.java', 'b')]); await choose(); await screen.findByText(/2 file · /);
  pickNext([file('item/C.java', 'c')]); await choose(); fireEvent.click(within(await screen.findByRole('group', { name: 'Cartella già salvata' })).getByRole('button', { name: /^Integra/ }));
  await waitFor(() => expect(available()).toBe('item/A.java,item/B.java,item/C.java'));
  pickNext([file('item/A.java', 'a'), file('item/D.java', 'd')]); await choose(); const box = await screen.findByRole('group', { name: 'Cartella già salvata' });
  expect(box).toHaveTextContent(/2 non più presenti/); fireEvent.click(within(box).getByRole('button', { name: /^Aggiorna/ }));
  await waitFor(() => expect(available()).toBe('item/A.java,item/D.java'));
});

test('keeping both saves a second folder under another name', async () => {
  render(<Harness />); await screen.findByText(/Scegli la cartella una volta sola/);
  pickNext([file('item/A.java', 'a')]); await choose(); await screen.findByText(/1 file · /);
  pickNext([file('item/B.java', 'b')]); await choose(); fireEvent.click(within(await screen.findByRole('group', { name: 'Cartella già salvata' })).getByRole('button', { name: /^Tieni entrambe/ }));
  expect(await screen.findByRole('checkbox', { name: /item \(2\)/ })).toBeInTheDocument(); await waitFor(() => expect(available()).toBe('item/A.java,item (2)/B.java'));
});

test('cancelling the choice leaves everything as it was', async () => {
  render(<Harness />); await screen.findByText(/Scegli la cartella una volta sola/); pickNext([file('item/A.java', 'a')]); await choose(); await screen.findByText(/1 file · /);
  pickNext([file('item/B.java', 'b')]); await choose(); fireEvent.click(within(await screen.findByRole('group', { name: 'Cartella già salvata' })).getByRole('button', { name: 'Annulla' }));
  expect(screen.queryByRole('group', { name: 'Cartella già salvata' })).not.toBeInTheDocument(); expect(available()).toBe('item/A.java');
});

test('a folder can be switched off without deleting it, and removed only after confirming; the disk is never touched', async () => {
  render(<Harness />); await screen.findByText(/Scegli la cartella una volta sola/); pickNext([file('item/A.java', 'a')]); await choose(); await screen.findByText(/1 file · /);
  fireEvent.click(screen.getByRole('checkbox')); await waitFor(() => expect(available()).toBe('')); expect(screen.getByRole('checkbox', { name: /item/ })).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox')); await waitFor(() => expect(available()).toBe('item/A.java'));
  window.confirm.mockReturnValueOnce(false); fireEvent.click(screen.getByRole('button', { name: /Rimuovi la cartella item/ })); expect(await listFolders()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /Rimuovi la cartella item/ })); await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()); expect(await listFolders()).toEqual([]);
  expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining('I file sul tuo disco non vengono toccati'));
});

test('files with a credential are not saved, the user is told which one and the value is never on screen', async () => {
  render(<Harness />); await screen.findByText(/Scegli la cartella una volta sola/);
  pickNext([file('item/A.java', 'class A {}'), file('item/application-prod.yml', `a: 1\nkey: ${TOKEN}`)]); await choose();
  expect(await screen.findByText(/1 file non salvato perché contiene una credenziale/)).toBeInTheDocument(); expect(screen.getByText('item/application-prod.yml')).toBeInTheDocument();
  expect(screen.getByText(/riga 2: token GitHub/)).toBeInTheDocument(); expect(document.body.textContent).not.toContain(TOKEN); expect(available()).toBe('item/A.java');
});

test('a folder with nothing readable says why instead of saving an empty folder', async () => {
  render(<Harness />); await screen.findByText(/Scegli la cartella una volta sola/); pickNext([file('item/logo.png', 'x'), file('item/node_modules/a/i.js', 'x')]); await choose();
  expect(await screen.findByRole('alert')).toHaveTextContent(/non contiene file di codice leggibili/); expect(await listFolders()).toEqual([]);
});

test('without usable storage the panel says the folders are not kept', async () => {
  delete global.indexedDB; resetSourceLibrary(); render(<Harness />); pickNext([file('item/A.java', 'a')]); await choose();
  expect(await screen.findByText(/Questo browser non permette di conservare i file/)).toBeInTheDocument(); await waitFor(() => expect(available()).toBe('item/A.java'));
});

test('another user of the same browser does not see these folders', async () => {
  const mine = render(<Harness />); await screen.findByText(/Scegli la cartella una volta sola/); pickNext([file('item/A.java', 'a')]); await choose(); await screen.findByText(/1 file · /); mine.unmount();
  localStorage.setItem('XUSER', 'luisa'); resetSourceLibrary(); chooser = null; render(<Harness />); expect(await screen.findByText(/Scegli la cartella una volta sola/)).toBeInTheDocument(); expect(available()).toBe('');
});

test('while a large folder is saved the panel shows how far it is, and the message is gone at the end', async () => {
  render(<Harness />); await screen.findByText(/Scegli la cartella una volta sola/);
  let release; const slow = new File(['class F150 {}'], 'F150.java'); Object.defineProperty(slow, 'webkitRelativePath', { value: 'big/F150.java' }); Object.defineProperty(slow, 'text', { value: () => new Promise(resolve => { release = () => resolve('class F150 {}'); }) });
  const many = Array.from({ length: 200 }, (_, i) => (i === 150 ? slow : file(`big/F${i}.java`, `class F${i} {}`)));
  pickNext(many); fireEvent.click(await screen.findByRole('button', { name: /Seleziona cartella sorgenti/ })); await act(async () => { chooser.onchange(); });
  expect(await screen.findByText(/Salvo \d+ file su 200…/)).toBeInTheDocument();
  await act(async () => { release(); }); expect(await screen.findByText(/200 file · /)).toBeInTheDocument(); expect(screen.queryByText(/Salvo \d+ file su/)).not.toBeInTheDocument();
});
