import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HELP } from '../configuratore/helpTopics';
import { PAGE_MANUALS } from '../components/help/pageManuals';

// Servizi finti: ogni funzione risponde con un elenco vuoto. Le pagine si montano davvero; si verifica che il «?» ci sia dove deve, si apra e nomini le cose giuste.
jest.mock('../services/mevService', () => new Proxy({}, { get: (_, name) => (name === '__esModule' ? true : (global.__svc[name] ??= jest.fn(async () => (name.startsWith('get') ? (name === 'getConsumoTow' ? [] : []) : {})))) }));
beforeAll(() => { global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; global.__svc = {}; HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; });
beforeEach(() => { localStorage.clear(); localStorage.setItem('role', 'Admin'); localStorage.setItem('token', 't'); global.__svc = {}; window.HTMLElement.prototype.scrollIntoView = jest.fn(); window.confirm = jest.fn(() => false);
  global.__svc.getMevList = jest.fn(async () => []); global.__svc.getMevOptions = jest.fn(async () => ({ pmPoste: [] })); global.__svc.getLastAlign = jest.fn(async () => null); global.__svc.getConsumoTow = jest.fn(async () => [{ id: 1, towContratto: 'BASE', nomeTow: 'TOW01.1', valoreUnitario: 100, valoreTotale: 1000, approvato: 10, ordinato: 5, impegnato: 2, residuo: 3, qta: 10, categoria: 'Task' }]);
  global.__svc.offeredCatalogLots = jest.fn(async () => []);
  global.__svc.getTowImpatto = jest.fn(async () => null); global.__svc.getRtiSocieta = jest.fn(async () => []); global.__svc.getReleaseSchedules = jest.fn(async () => ({ records: [] })); global.__svc.getReleaseProgress = jest.fn(async () => []); global.__svc.getConfiguratoreContracts = jest.fn(async () => []); global.__svc.getConfiguratoreRecords = jest.fn(async () => ({ records: [] })); });

const SRC = path.resolve(__dirname, '..');
const help = name => screen.findByRole('button', { name: `Come si usa: ${name}` });
const opens = async name => { const button = await help(name); fireEvent.click(button); const panel = screen.getByRole('dialog', { name: `Come si usa: ${name}` }); expect(button).toHaveAttribute('aria-expanded', 'true'); return panel; };

describe('each page with a «?» (mounted for real)', () => {
  test('Grafici: next to the title, and it says what the grouping buttons are', async () => {
    const ChartPage = require('./ChartPage').default; render(<ChartPage rows={[]} ambienteId={1} />);
    const panel = await opens('Grafici'); expect(panel).toHaveTextContent('«Release»'); expect(panel).toHaveTextContent('Mostra tutti'); expect(panel).toHaveTextContent('Eliminato');
  });
  test('Gestione Team: next to the title, and it names the real import and search labels', async () => {
    const TeamPage = require('./TeamPage').default; render(<TeamPage ambienteId={1} role="Admin" roles={['Admin']} onUnauthorized={() => {}} />);
    const panel = await opens('Gestione Team'); expect(panel).toHaveTextContent('Importa Excel'); expect(panel).toHaveTextContent('Cerca risorsa, ambito, specialità…'); expect(panel).toHaveTextContent('non si può annullare');
  });
  test('Report Avanzamenti: next to the title, with the warning that only Admin and SuperAdmin change and delete', async () => {
    const ReportPage = require('./ReportAvanzamentiPage').default; render(<ReportPage ambienteId="1" role="Admin" roles={['Admin']} />);
    const panel = await opens('Report Avanzamenti Attività'); expect(panel).toHaveTextContent('Salva tutto'); expect(panel).toHaveTextContent('Solo Admin e SuperAdmin');
  });
  test('Contratti TOW: next to «Monitoraggio contratto»', async () => {
    const ContrattiPage = require('./ContrattiPage').default; render(<ContrattiPage ambienteId={1} role="Admin" onUnauthorized={() => {}} />);
    const panel = await opens('Monitoraggio contratto'); expect(panel).toHaveTextContent('Ricalcola'); expect(panel).toHaveTextContent('Pianificazione Release');
  });
  test('Voci di catalogo offerti: next to the title of the page', async () => {
    const Page = require('./OfferedCatalogPage').default; render(<Page />); const panel = await opens('Voci di catalogo offerti'); expect(panel).toHaveTextContent('Scarica il modello Excel'); expect(panel).toHaveTextContent('rifiutato per intero');
  });
  test('MEV: the «?» of the page, and the one of «Carica Excel e Allinea Dati» ONLY for Admin and SuperAdmin', async () => {
    const MevPage = require('./MevPage').default; const view = render(<MevPage onUnauthorized={() => {}} onRowsChange={() => {}} ambienteId={1} />);
    const panel = await opens('MEV · Quadro economico'); expect(panel).toHaveTextContent('Totale Fornitura'); expect(panel).toHaveTextContent('Esporta Excel'); fireEvent.keyDown(document, { key: 'Escape' });
    expect(await help('Carica Excel e Allinea Dati')).toBeInTheDocument(); view.unmount();
    localStorage.setItem('role', 'Editor'); render(<MevPage onUnauthorized={() => {}} onRowsChange={() => {}} ambienteId={1} />); await help('MEV · Quadro economico');
    expect(screen.queryByRole('button', { name: 'Come si usa: Carica Excel e Allinea Dati' })).toBeNull();                      // an Editor does not see the buttons, so the help about them is not shown either
  });
  test('MEV-CAP: next to the title, and it says the total counts only the «Approvato»', async () => {
    const MevCapPage = require('./MevCapPage').default; render(<MevCapPage onUnauthorized={() => {}} onRowsChange={() => {}} ambienteId={1} />);
    const panel = await opens('MEV-CAP · Gestione attività'); expect(panel).toHaveTextContent('Approvato'); expect(panel).toHaveTextContent('Nuovo GoTo');
  });
});

describe('every «?» on the other pages', () => {
  const PAGES = [['grafici', 'ChartPage'], ['team', 'TeamPage'], ['report', 'ReportAvanzamentiPage'], ['contratti', 'ContrattiPage'], ['consumoTow', 'ConsumoTowAdminPage'], ['tools', 'ToolsPage'], ['archivio', 'ContractArchivePage'],
    ['catalogoOfferto', 'OfferedCatalogPage'], ['gare', 'GarePage'], ['admin', 'AdminPage'], ['dbconfig', 'DbConfigPage'], ['mevPagina', 'MevPage'], ['mevcapPagina', 'MevCapPage']];
  test.each(PAGES)('«%s» is wired in %s.js and the page imports the topic it uses', (key, file) => {
    const source = fs.readFileSync(path.join(SRC, 'pages', `${file}.js`), 'utf8'); expect(source).toMatch(new RegExp(`HELP\\.${key}\\b`)); expect(source).toContain('configuratore/helpTopics');
  });
  test('the three pages that put their title in a shared component pass the topic down', () => {
    expect(fs.readFileSync(path.join(SRC, 'components/mev/MevTableView.js'), 'utf8')).toMatch(/help && <HelpHint topic=\{help\}/);
  });
  test('the topics that sit on a dark band (Admin, Gare) are on a white disc, so the blue «?» is readable', () => {
    ['AdminPage.js', 'GarePage.js'].forEach(file => expect(fs.readFileSync(path.join(SRC, 'pages', file), 'utf8')).toMatch(/background: "#fff", borderRadius: "50%"[^>]*><HelpHint/));
  });
  // A label like «Importa Excel» exists on several pages: the generic check cannot tell whether it is still on THE page the help is about. For every page, each button the help quotes must be in that page's own source.
  const OWN = { grafici: ['ChartPage', ['Mostra tutti', 'Release', 'Applicativo', 'Anno']], team: ['TeamPage', ['Importa Excel', 'Cerca risorsa, ambito, specialità…', 'Nuovo membro', 'Modifica membro']],
    report: ['ReportAvanzamentiPage', ['Salva tutto', 'Importa da Excel', 'Elimina dati', 'Applica']], contratti: ['ContrattiPage', ['Ricalcola', 'Pianificazione Release', 'Importa Excel']], consumoTow: ['ConsumoTowAdminPage', ['Ricalcola da MEV', 'Nuovo Contratto', 'Modifica', 'RTI & SUBCO']],
    tools: ['ToolsPage', ['Carica Ordine', 'Carica Verbale', 'Ordini Caricati', 'Verbali Caricati', 'Esporta in Excel', 'Sveglia Parser']], mevPagina: ['MevPage', ['Totale Fornitura', 'Totale ODA', 'Da Ordinare', 'Totale SUBCO', 'Esporta Excel', 'Reset filtri']],
    mevAllineamento: ['MevPage', ['Carica Excel', 'Allinea Dati', 'Annulla ultimo Align']], mevcapPagina: ['MevCapPage', ['Nuovo GoTo', 'Esporta Excel', 'Colonne fisse']], gare: ['GarePage', ['Nuova Gara', 'Carica e analizza capitolato PDF', 'Genera bozza di risposta per il lotto']],
    admin: ['AdminPage', ['Nuovo Utente', 'Utenti e Ruoli', 'Funzioni e Permessi App', 'Salva permessi', 'Reset MEV + ConsumoTow']], dbconfig: ['DbConfigPage', ['Test connessione', 'Salva configurazione', 'Riavvia Backend', 'Impostazioni Applicazione', 'Azzera dati DB']] };
  test.each(Object.entries(OWN))('«%s»: every button the help quotes is really in the source of its own page', (key, [file, labels]) => {
    const source = fs.readFileSync(path.join(SRC, 'pages', `${file}.js`), 'utf8').replace(/[’‘]/g, "'") + (key === 'mevPagina' || key === 'mevcapPagina' ? fs.readFileSync(path.join(SRC, 'components/mev/MevTableView.js'), 'utf8') : '');
    labels.forEach(label => { expect(source).toContain(label.replace(/[’‘]/g, "'")); expect(HELP[key].lead + HELP[key].steps.join(' ') + (HELP[key].tip || '')).toContain(label.replace(/[’‘]/g, "'").replace(/^Applica$/, 'Applica')); });
  });
  test('each topic of another page points to a chapter of the manual of THAT page (the link works on the page itself)', () => {
    const owner = { grafici: 'chart', team: 'team', report: 'reportavanzamenti', contratti: 'contratti', consumoTow: 'consumotow', tools: 'tools', archivio: 'superadmin', catalogoOfferto: 'catalogoofferto', gare: 'gara', admin: 'admin', dbconfig: 'dbconfig', mevPagina: 'mev', mevAllineamento: 'mev', mevcapPagina: 'mevcap' };
    Object.entries(owner).forEach(([key, page]) => { const chapters = PAGE_MANUALS[page].chapters.map(c => c.title); expect(chapters.some(t => t === HELP[key].chapter || t.startsWith(HELP[key].chapter))).toBe(true); });
  });
  test('the dangerous operations are named in the help of the page where they live, with «non si annulla / irreversibile»', () => {
    expect(HELP.admin.tip).toMatch(/Reset MEV \+ ConsumoTow/); expect(HELP.admin.tip).toMatch(/non si annulla/); expect(HELP.consumoTow.tip).toMatch(/non si può annullare/); expect(HELP.dbconfig.tip).toMatch(/Azzera dati DB/); expect(HELP.dbconfig.tip).toMatch(/non si annulla/);
    expect(HELP.mevAllineamento.tip).toMatch(/Annulla ultimo Align/); expect(HELP.team.tip).toMatch(/non si può annullare/); expect(HELP.report.tip).toMatch(/non si annulla/); expect(HELP.archivio.tip).toMatch(/non si annulla/);
  });
});

describe('the link «Apri il capitolo completo del manuale →» opens the manual OF THE PAGE you are on, at the right chapter', () => {
  const PageManual = require('../components/help/PageManual').default;
  test('Grafici: the manual of the top bar opens on «Leggere i grafici»', async () => {
    const ChartPage = require('./ChartPage').default; render(<><PageManual page="chart" role="Admin" roles={['Admin']} /><ChartPage rows={[]} ambienteId={1} /></>);
    const panel = await opens('Grafici'); fireEvent.click(within(panel).getByRole('button', { name: 'Apri il capitolo completo del manuale →' }));
    expect(document.querySelector('dialog.tow-manual h3')).toHaveTextContent('Leggere i grafici'); expect(document.querySelector('dialog.tow-manual h2')).toHaveTextContent('Grafici');
  });
  test('Team: the manual opens on «Risorse del team»', async () => {
    const TeamPage = require('./TeamPage').default; render(<><PageManual page="team" role="Admin" roles={['Admin']} /><TeamPage ambienteId={1} role="Admin" roles={['Admin']} onUnauthorized={() => {}} /></>);
    const panel = await opens('Gestione Team'); fireEvent.click(within(panel).getByRole('button', { name: 'Apri il capitolo completo del manuale →' })); expect(document.querySelector('dialog.tow-manual h3')).toHaveTextContent('Risorse del team');
  });
  test('only the manual that HAS the chapter opens (the page shows one manual in the bar, but the Home and the Configuratore are never opened by mistake)', async () => {
    const ChartPage = require('./ChartPage').default; render(<><PageManual page="chart" role="Admin" roles={['Admin']} /><ChartPage rows={[]} ambienteId={1} /></>);
    const panel = await opens('Grafici'); fireEvent.click(within(panel).getByRole('button', { name: 'Apri il capitolo completo del manuale →' })); expect(document.querySelectorAll('dialog.tow-manual')).toHaveLength(1);
  });
  test('a role that cannot see a chapter of the manual: nothing opens and nothing breaks (the little panel just closes)', async () => {
    const ChartPage = require('./ChartPage').default; render(<><PageManual page="chart" role="Client" roles={['Client']} /><ChartPage rows={[]} ambienteId={1} /></>);
    const panel = await opens('Grafici'); expect(() => fireEvent.click(within(panel).getByRole('button', { name: 'Apri il capitolo completo del manuale →' }))).not.toThrow();
  });
});
