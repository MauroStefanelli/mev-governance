import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import PageManual, { HeaderManual, manualKey } from './PageManual';
import { PAGE_MANUALS } from './pageManuals';
import { forRole, readerRole, readerLabel, ROLES } from './manualRoles';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
  HTMLElement.prototype.scrollTo = jest.fn();
});
afterEach(cleanup);

const open = (page, role, roles = []) => { render(<PageManual page={page} role={role} roles={roles} />); fireEvent.click(screen.getByRole('button', { name: /Manuale d’uso/ })); return screen.getByRole('dialog'); };
const chaptersFor = (page, role) => forRole(PAGE_MANUALS[page].chapters, role);
const textOf = (page, role) => chaptersFor(page, role).flatMap(c => [c.intro, ...c.steps, c.note, ...(c.fields ? c.fields.rows.flat() : []), ...(c.warnings ? c.warnings.flat() : [])]).filter(Boolean).join('\n');

describe('forRole', () => {
  const chapters = [
    { title: 'A', subtitle: '', steps: ['per tutti', { text: 'solo admin', roles: ['Admin'] }, { text: 'client e editor', roles: ['Client', 'Editor'] }], fields: { caption: 'c', rows: [['x', 'tutti'], ['y', 'admin', ['Admin']]] }, warnings: [['p', 'f', ['Client']], ['q', 'g']] },
    { title: 'B', subtitle: '', roles: ['Admin'], steps: ['solo per admin'] },
    { title: 'C', subtitle: '', steps: [{ text: 'solo admin', roles: ['Admin'] }] },
  ];
  test('keeps what is for everybody and what is for the reader, and nothing else', () => {
    const client = forRole(chapters, 'Client'); const admin = forRole(chapters, 'Admin');
    expect(client.map(c => c.title)).toEqual(['A']); expect(client[0].steps).toEqual(['per tutti', 'client e editor']);
    expect(client[0].fields.rows).toEqual([['x', 'tutti']]); expect(client[0].warnings).toEqual([['p', 'f'], ['q', 'g']]);
    expect(admin.map(c => c.title)).toEqual(['A', 'B', 'C']); expect(admin[0].steps).toEqual(['per tutti', 'solo admin']); expect(admin[0].warnings).toEqual([['q', 'g']]);
  });
  test('a chapter left without steps disappears, and steps are always plain text', () => {
    expect(forRole(chapters, 'Client').map(c => c.title)).not.toContain('C');
    forRole(chapters, 'Admin').forEach(c => c.steps.forEach(step => expect(typeof step).toBe('string')));
  });
  test('a chapter or a step with an empty list of roles is for everybody; one with roles is never for a reader without a role', () => {
    const list = [{ title: 'V', subtitle: '', roles: [], steps: [{ text: 'vuoto', roles: [] }, 'x'] }, { title: 'R', subtitle: '', roles: ['Client'], steps: ['solo client'] }];
    expect(forRole(list, 'Admin').map(c => c.title)).toEqual(['V']); expect(forRole(list, 'Admin')[0].steps).toEqual(['vuoto', 'x']);
    expect(forRole(list, undefined).map(c => c.title)).toEqual(['V']); expect(forRole(list, null).map(c => c.title)).toEqual(['V']); expect(forRole(list, 'Client').map(c => c.title)).toEqual(['V', 'R']);
  });
  test('a row of a table or a warning for a role is hidden from the others, and a reader without role sees none of them', () => {
    const list = [{ title: 'T', subtitle: '', steps: ['a'], fields: { caption: 'c', rows: [['solo admin', 'x', ['Admin']]] }, warnings: [['solo client', 'y', ['Client']]] }];
    expect(forRole(list, 'Client')[0].fields).toBeUndefined(); expect(forRole(list, 'Client')[0].warnings).toEqual([['solo client', 'y']]);
    expect(forRole(list, undefined)[0].fields).toBeUndefined(); expect(forRole(list, undefined)[0].warnings).toBeUndefined(); expect(forRole(list, 'Admin')[0].fields.rows).toEqual([['solo admin', 'x']]);
  });
  test('without a known role only what is for everybody is shown', () => {
    const none = forRole(chapters, ''); expect(none[0].steps).toEqual(['per tutti']); expect(none.map(c => c.title)).toEqual(['A']);
  });
  test('the input is not modified', () => { const copy = JSON.stringify(chapters); forRole(chapters, 'Client'); expect(JSON.stringify(chapters)).toBe(copy); });
});

describe('the role the manual is read with', () => {
  test('the widest role wins, whichever is the primary one', () => {
    expect(readerRole('Editor', ['Editor', 'Admin'])).toBe('Admin'); expect(readerRole('Client', ['Client'])).toBe('Client'); expect(readerRole('', ['Developer', 'Editor'])).toBe('Developer');
    expect(readerRole('Client', ['Client', 'Developer'])).toBe('Developer'); expect(readerRole('', [])).toBe(''); expect(readerRole('Sconosciuto', [])).toBe('');
    expect(readerRole('SuperAdmin', ['Admin'])).toBe('SuperAdmin');
  });
  test('the label says which role the manual is for', () => { expect(readerLabel('Client')).toBe('Manuale per il ruolo Client'); expect(readerLabel('')).toBe(''); });
});

describe('what each role reads in the manuals of the real pages', () => {
  test('MEV, as a Client: no word about «Carica Excel» as something to do, and a clear statement of what is missing', () => {
    const client = textOf('mev', 'Client');
    expect(client).toContain('«Esporta Excel» scarica un file'); expect(client).toContain('non vedi «Carica Excel», «Allinea Dati» né «Annulla ultimo Align»');
    expect(client).not.toContain('«Carica Excel» (Admin e SuperAdmin) carica il file'); expect(client).not.toContain('chiede conferma («Riallineare');
  });
  test('MEV, as an Admin: the steps to load and align the Excel are there', () => {
    const admin = textOf('mev', 'Admin');
    expect(admin).toContain('«Carica Excel» (Admin e SuperAdmin) carica il file ufficiale'); expect(admin).toContain('«Allinea Dati» chiede conferma'); expect(admin).toContain('«Annulla ultimo Align» compare solo se');
    expect(admin).not.toContain('non vedi «Carica Excel»');
  });
  test('MEV, as an Editor or Developer: told that loading and aligning are for administrators', () => {
    ['Editor', 'Developer'].forEach(role => { const text = textOf('mev', role); expect(text).toContain('sono riservati agli amministratori'); expect(text).not.toContain('non vedi «Carica Excel»'); expect(text).not.toContain('«Carica Excel» (Admin e SuperAdmin) carica'); });
  });
  test('Report Avanzamenti: the detail is read-only for everybody but Admin and SuperAdmin, and the delete commands are theirs', () => {
    ['Client', 'Editor', 'Developer', 'Bid Manager'].forEach(role => { const text = textOf('reportavanzamenti', role); expect(text).toContain('«Sola lettura»'); expect(text).not.toContain('«Elimina dati riga»'); expect(text).not.toContain('Rinomina release'); expect(text).not.toContain('distintivo «Modificabile»'); });
    ['Admin', 'SuperAdmin'].forEach(role => { const text = textOf('reportavanzamenti', role); expect(text).toContain('distintivo «Modificabile»'); expect(text).toContain('Rinomina release'); expect(text).toContain('Elimina dati riga'); expect(text).not.toContain('distintivo «Sola lettura»'); });
  });
  test('Ordini says the page is read-only and sends administrators to Gestione Ordini; nobody else is told about Strumenti', () => {
    expect(textOf('contratti_interni', 'Client')).toContain('sola consultazione'); expect(textOf('contratti_interni', 'Client')).not.toContain('Gestione Ordini');
    expect(textOf('contratti_interni', 'Admin')).toContain('Gestione Ordini');
  });
  test('only the MEV list is said to be limited to the contracts of a Client: it is the only page where the server does it', () => {
    expect(textOf('mev', 'Client')).toContain('dei contratti che ti sono stati assegnati'); expect(textOf('mev', 'Admin')).not.toContain('dei contratti che ti sono stati assegnati');
    ['contratti', 'contratti_interni', 'reportavanzamenti', 'chart'].forEach(page => ['Client', 'Admin'].forEach(role => expect(textOf(page, role)).not.toMatch(/ti sono stati assegnati|Vedi solo i contratti/)));
  });
  test('Gestione Utenti: the button for the permissions of a Client is described to administrators, the theme button to the SuperAdmin only', () => {
    expect(textOf('admin', 'Admin')).toContain('Gestisci permessi pagine e contratti'); expect(textOf('admin', 'SuperAdmin')).toContain('Gestisci permessi pagine e contratti');
    expect(textOf('admin', 'SuperAdmin')).toContain('Solo tu vedi il pulsante del tema'); expect(textOf('admin', 'Admin')).not.toContain('Solo tu vedi il pulsante del tema');
    expect(textOf('admin', 'Admin')).toContain('la colonna «Modifica» non blocca i pulsanti');
  });
  test('the Team and Charts pages carry the cautions that are true today for a Client, and nobody else gets them', () => {
    expect(textOf('team', 'Client')).toContain('i comandi di modifica risultano disponibili anche per il tuo ruolo'); expect(textOf('team', 'Admin')).not.toContain('anche per il tuo ruolo');
    expect(textOf('chart', 'Client')).toContain('apri prima MEV'); expect(textOf('chart', 'Admin')).not.toContain('apri prima MEV');
    expect(textOf('contratti', 'Client')).toContain('risultano disponibili anche per te'); expect(textOf('contratti', 'Admin')).not.toContain('risultano disponibili anche per te');
  });
  test('the read-only dialog is the same for every role, and the manual of MEV-CAP warns a Client that the card can be saved', () => {
    expect(textOf('mev', 'Admin')).toContain('è in sola lettura, per tutti i ruoli'); expect(textOf('mev', 'Client')).toContain('è in sola lettura, per tutti i ruoli');
    expect(textOf('mevcap', 'Client')).toContain('modifica i dati di tutti gli utenti del contratto'); expect(textOf('mevcap', 'Admin')).not.toContain('modifica i dati di tutti gli utenti del contratto');
  });
});

describe('the dialog', () => {
  test('a Client sees his chapter list and the role in the subtitle, an Admin sees more', () => {
    const client = open('mev', 'Client', ['Client']); expect(client).toHaveTextContent('Manuale per il ruolo Client');
    const clientChapters = within(screen.getByRole('navigation', { name: 'Indice del manuale' })).getAllByRole('button').length; cleanup();
    const admin = open('mev', 'Admin', ['Admin']); expect(admin).toHaveTextContent('Manuale per il ruolo Admin');
    expect(within(screen.getByRole('navigation', { name: 'Indice del manuale' })).getAllByRole('button').length).toBe(clientChapters);
  });
  test('a user with two roles reads as the widest', () => { const dialog = open('mev', 'Editor', ['Editor', 'Admin']); expect(dialog).toHaveTextContent('Manuale per il ruolo Admin'); });
  test('no step shows as «[object Object]»', () => { ROLES.forEach(role => Object.keys(PAGE_MANUALS).forEach(page => expect(textOf(page, role)).not.toContain('[object Object]'))); });
  test('every step is plain text for every role and page, and no page is left with an empty manual', () => {
    ROLES.forEach(role => Object.keys(PAGE_MANUALS).filter(page => page !== 'configuratore').forEach(page => { const chapters = chaptersFor(page, role); expect(chapters.length).toBeGreaterThan(0); chapters.forEach(c => c.steps.forEach(step => expect(typeof step).toBe('string'))); }));
  });
});

// Every «quoted» label of the rewritten manuals must still exist in the code of the app.
describe('the quoted labels exist in the app', () => {
  const SRC = path.resolve(__dirname, '..', '..');
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.js$/.test(e.name) && !/\.test\.js$/.test(e.name) && !/pageManuals\.js$|ConfiguratorManual\.js$|manualFigures\.js$|manualRoles\.js$/.test(e.name) ? [path.join(dir, e.name)] : []);
  const norm = t => t.replace(/&apos;|&#39;|[’‘]/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
  const CODE = norm(walk(SRC).map(f => fs.readFileSync(f, 'utf8')).join('\n'));
  // Messages and texts that the app composes at run time, or that are the result of a confirmation dialog or a sentence of the page: not a literal button.
  const COMPOSED = new Set(['Riallineare i dati MEV con l’Excel ufficiale?', 'Elimina risorsa', 'Elimina dati riga', 'Rinomina release', 'Elimina release dal calendario', 'Importa da Excel', 'Elimina dati', 'Salva tutto', 'Modificabile', 'Sola lettura',
    '— Tutte le release —', 'Release', 'Chiudi', '+ Nuova', 'Avanzamento attività', 'Documenti e aggiornamenti', 'Pianificazione e rilasci', 'Dati MEV', 'Totale Complessivo', 'Totale complessivo', 'GoTo in release', 'Approvati', 'Importo Fornitura', 'Esporta Excel',
    'Applicativo', 'Anno', 'Ordina per', 'Importo CAP', 'Importo ODA', 'Imp. Subco', 'Imp. Lordo', 'Importo Netto', 'Ordinato', 'Da Ordinare', 'Avanzato', 'Da Avanzare', 'Tipo Contratto', 'RIF. Contratto', 'Imp. Fornitura', 'Ordinato (BdO)', 'Fatturato', 'Da fatturare',
    'Valore Totale', 'Approvato', 'Impegnato', 'Residuo', 'Team Attivo', 'Team Destaffato', 'Costo al giorno', 'Costo al mese', 'Risorse attive', 'Modifica membro', 'In Approvazione', 'In Analisi / Stima']);
  const labelsOf = page => [...new Set(chaptersFor(page, 'Admin').flatMap(c => [c.intro, ...c.steps, c.note, ...(c.fields ? c.fields.rows.flat() : []), ...(c.warnings ? c.warnings.flat() : [])]).filter(Boolean).flatMap(t => [...t.matchAll(/«([^»]+)»/g)].map(m => m[1].trim())))];
  const present = label => { const needle = norm(label).replace(/ ?…$/, '').replace(/\.$/, ''); return CODE.includes(needle) || COMPOSED.has(label); };
  test.each(['mev', 'mevcap', 'contratti', 'contratti_interni', 'reportavanzamenti', 'chart', 'team'])('%s: every «quoted» label exists in the code', page => {
    const missing = labelsOf(page).filter(label => label.length > 2 && !/\d/.test(label) && !present(label)); expect(missing).toEqual([]);
  });
});

describe('the manual of the header follows the role', () => {
  test('the key changes with the page and with the reading role, and not with an unrelated role change', () => {
    expect(manualKey('mev', 'Client', ['Client'])).not.toBe(manualKey('mev', 'Admin', ['Admin'])); expect(manualKey('mev', 'Client', [])).not.toBe(manualKey('chart', 'Client', []));
    expect(manualKey('mev', 'Editor', ['Editor', 'Admin'])).toBe(manualKey('mev', 'Admin', ['Admin']));
  });
  test('the header manual is the one for the role it is given, and it is rebuilt when the role changes', () => {
    const view = render(<HeaderManual page="mev" role="Client" roles={['Client']} />); fireEvent.click(screen.getByRole('button', { name: /Manuale d’uso/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Manuale per il ruolo Client'); fireEvent.click(screen.getByRole('button', { name: 'Chiudi manuale' }));
    view.rerender(<HeaderManual page="mev" role="Admin" roles={['Admin']} />); fireEvent.click(screen.getByRole('button', { name: /Manuale d’uso/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Manuale per il ruolo Admin');
  });
  test('App uses the header manual with the role of the user', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '..', '..', 'App.js'), 'utf8');
    expect(app).toMatch(/<HeaderManual page=\{page\} role=\{role\} roles=\{roles\} \/>/);
  });
});
