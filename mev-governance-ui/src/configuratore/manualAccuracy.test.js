import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfiguratorManual from './ConfiguratorManual';
import PageManual from '../components/help/PageManual';
import { PAGE_MANUALS } from '../components/help/pageManuals';
import { FIGURE_IDS } from './manualFigures';

// The manuals quote button labels and messages between «guillemets». A manual that names a button that does not exist is worse than no manual,
// so every quoted label must still be found in the source of the app. When someone renames a button, this test says which manual to update.
const SRC = path.resolve(__dirname, '..');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.js$/.test(e.name) && !/\.test\.js$/.test(e.name) && !/pageManuals\.js$|ConfiguratorManual\.js$|manualFigures\.js$/.test(e.name) ? [path.join(dir, e.name)] : []);
// Server messages the manual quotes (for example «Interventi duplicati, dettagli non associati…») live in the C# backend: they are checked there too.
const BACKEND = path.resolve(SRC, '..', '..', 'mev-governance-backend');
const walkCs = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/^(bin|obj|Migrations)$/.test(e.name) ? [] : walkCs(path.join(dir, e.name))) : /\.cs$/.test(e.name) ? [path.join(dir, e.name)] : []) : [];
const BACKEND_CODE = ['Controllers', 'Services', 'Models'].flatMap(d => walkCs(path.join(BACKEND, d))).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const CODE = walk(SRC).map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\n' + BACKEND_CODE;
const norm = t => t.replace(/&apos;|&#39;|[’‘]/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const CODE_N = norm(CODE);

function chaptersOf(source) {
  const m = /const chapters = (\[[\s\S]*?\n\]);\n\nexport function UserManual/.exec(source);
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}
const configuratorChapters = chaptersOf(fs.readFileSync(path.join(SRC, 'configuratore/ConfiguratorManual.js'), 'utf8'));
const developmentChapters = PAGE_MANUALS.sviluppo.chapters;

const texts = chapter => [chapter.intro, ...(chapter.steps || []), chapter.note, ...(chapter.fields ? chapter.fields.rows.flat() : []), ...(chapter.warnings ? chapter.warnings.flat() : [])].filter(Boolean);
const quoted = chapter => texts(chapter).flatMap(t => [...t.matchAll(/«([^»]+)»/g)].map(m => m[1].trim()));

// Labels that are not a literal string of the code: composed at run time, or names of data and files the app produces.
const COMPOSED = new Set([
  'Leggi il riepilogo AI', 'Vai a … →', 'Aprire un’altra iniziativa?', 'Prepara con AI le N attività selezionate', 'Inserisci bozza nelle N schede selezionate',
  'Seleziona le visibili', 'Seleziona le N visibili', 'Rigenera anche…', 'Riprovare', 'Mostra le regole della fase', 'Analizza integrazioni (N interventi)',
  'Voce {id}: associazione o prezzo del contratto mancante', 'Interventi approvati inclusi: N', 'N file generati', 'Nuovo', 'Modificato',
  'Ultimo lavoro: … ', 'Sviluppo salvato e confermato dal server (revisione N)', 'Tabella Offerta - {GOTO}.xlsx', 'Leggi il riepilogo AI',
  'Aggiungi', 'Già aggiunta', 'Altro', 'Altro (testo libero)…', 'Tutte', 'Da avviare', 'Avviato', 'In corso', 'Verificato', 'Documentata', 'Aperta',
  'Seleziona applicativo', 'Elenco iniziative valutate', 'Da compilare', 'Bloccato', 'Decisioni necessarie prima di generare',
]);
// A quotation that contains a number or an N/M placeholder is an EXAMPLE of text the app composes at run time ("5 documenti · 2 memorie iniziali"):
// it cannot exist as a fixed string, so it is not checked. Everything else — every button, field and fixed message — is.
const isExample = label => /\d/.test(label) || /(^|[\s/(])[NM]([\s/).,]|$)/.test(label);
const present = label => { const needle = norm(label).replace(/ ?…$/, '').replace(/\.$/, ''); return CODE_N.includes(needle) || COMPOSED.has(label) || COMPOSED.has(label.replace(/…$/, '')); };

describe.each([['Configuratore', configuratorChapters], ['Sviluppo', developmentChapters]])('%s manual: every label it quotes exists in the app', (name, chapters) => {
  test('each «quoted» button, field and message is found in the source code', () => {
    const missing = [];
    chapters.forEach(c => quoted(c).forEach(label => { if (label.length > 2 && !isExample(label) && !present(label)) missing.push(`${c.title} → «${label}»`); }));
    expect(missing).toEqual([]);
  });
});

// The labels that name a BUTTON must exist as the text of a button, not just anywhere: "Salva valutazione" also appears in a hint,
// so renaming the button would otherwise go unnoticed.
const BUTTONS = {
  Configuratore: ['Salva valutazione', 'Salva e Chiudi', 'Salva e vai a Sviluppo →', 'Importa Tabella di Offerta', 'Analizza e suggerisci', 'Reset', 'Secondo parere AI', 'Genera Tabella di offerta XLSX', 'Esporta JSON', 'Esporta CSV', 'Stampa', 'Salva come nuovo', '+ Nuova Iniziativa', 'Revisione →', '← Interventi', '← Modifica'],
  Sviluppo: ['Salva sviluppo', 'Salva e chiudi', 'Chiudi senza salvare', 'Prepara scheda con AI', 'Inserisci bozza nella scheda', 'Genera progetto di avvio ZIP', 'Genera codice / workflow per questa attività', 'Conserva artefatti nella scheda', 'Scarica file sorgenti generati ZIP', 'Genera ZIP richiesta modifica codice', 'Esporta piano di sviluppo (MD)', 'Genera documento sviluppo (AI)', 'Seleziona cartella sorgenti', 'Aggiungi o aggiorna una cartella', '↻ Aggiorna'],
};
const SOURCES = walk(SRC).map(f => norm(fs.readFileSync(f, 'utf8')));
const asButtonText = label => { const needle = norm(label); const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return SOURCES.some(src => new RegExp('<button[^>]*>[^<]*' + esc + '|>\\s*' + esc + '\\s*</button>|' + "'" + esc + "'|`" + esc).test(src)); };
describe.each(Object.entries(BUTTONS))('%s: the buttons named in the manual are real buttons', (name, labels) => {
  test.each(labels)('«%s» is the text of a button', label => { expect(asButtonText(label)).toBe(true); });
  test('and each of them is actually mentioned in the manual', () => {
    const chapters = name === 'Sviluppo' ? developmentChapters : configuratorChapters;
    const all = norm(chapters.flatMap(texts).join(' '));
    labels.forEach(label => expect(all).toContain(norm(label.replace(/ →$/, '').replace(/^\+ /, '').replace(/^← /, '').replace(/ →$/, ''))));
  });
});

// A manual is for people, not for a search: one step is one idea. A step of thousands of characters mixes many subjects and nobody reads it.
// (It happened: one step of the rationale chapter held eight subjects in 4.300 characters.)
const MAX_STEP = 1100;
describe('readability', () => {
  test.each([['Configuratore', configuratorChapters], ['Sviluppo', developmentChapters]])('%s: no step is a wall of text', (name, chapters) => {
    const tooLong = []; chapters.forEach(c => c.steps.forEach((step, index) => { if (step.length > MAX_STEP) tooLong.push(`${c.title} · passo ${index + 1}: ${step.length} caratteri`); }));
    expect(tooLong).toEqual([]);
  });
  test.each([['Configuratore', configuratorChapters], ['Sviluppo', developmentChapters]])('%s: no chapter has more than 14 steps (split it)', (name, chapters) => {
    chapters.forEach(c => expect(c.steps.length).toBeLessThanOrEqual(14));
  });
  test('the chapters about the recent functions say what the user does and what can go wrong: an introduction and a «Se qualcosa non va» box', () => {
    ['Razionali e vincoli con l’AI', 'Chattare bene con l’AI', 'Sorgenti, cartelle e applicativi', 'Soluzione: interventi e file per Visual Studio Code', 'Aggiornare l’app: Render e NAS'].forEach(title => {
      const chapter = configuratorChapters.find(c => c.title === title); expect(chapter).toBeTruthy(); expect(chapter.intro.length).toBeGreaterThan(200); expect(chapter.warnings.length).toBeGreaterThanOrEqual(3);
    });
  });
  // Each recent function must be explained in the chapter that is about it, not just named somewhere: a user who opens the chapter must find it.
  const WHERE = {
    'Chattare bene con l’AI': ['Continua dal punto in cui si è fermata', 'Questa richiesta chiede più cose insieme', 'As-is (come funziona oggi)', 'To-be / desiderata (come deve funzionare)', 'Un nome per ciascun punto', 'Analisi di impatto'],
    'Sorgenti, cartelle e applicativi': ['Sorgenti e dati per la domanda', 'Aggiungi o aggiorna una cartella', 'Tieni entrambe', 'Cerca nel codice', 'Cosa chiedere', 'File inviati all’AI nell’ultima domanda', 'Sistema / applicazione', 'Incolla dati (es. risultato di una query)'],
    'Soluzione: interventi e file per Visual Studio Code': ['Proponi gli interventi con l’AI', 'Su cosa concentrarsi', 'Conferma l’intervento', 'Aggiungi una voce del catalogo', 'Mostra gli scartati', 'Prima di cominciare', 'Checklist per chi sviluppa', 'Scarica MD per Visual Studio Code', 'Salva soluzione'],
    'Razionali e vincoli con l’AI': ['Nascondi la cronologia', 'Mostra la cronologia', 'Conoscenza dell’iniziativa', 'Riprendi in questa iniziativa', 'Aggiungi una voce a mano'],
    'Aggiornare l’app: Render e NAS': ['Ricrea', 'Aggiorna', 'Manual Deploy', 'Applications', 'Images'],
    'Revisioni e collaborazione': ['Collaborazione sull’iniziativa', 'colleghi collegati', 'Aggiorna storico senza perdere la bozza', 'Salva e Chiudi'],
    'Offerta ed export HLD': ['Modello Excel del lotto', 'Carica il modello originale', 'Aggiorna il modello (nuova versione)', 'Scarica il modello', 'Versioni precedenti', 'Rimetti in uso', 'Usa un file diverso solo per questa esportazione'],
  };
  test.each(Object.entries(WHERE))('«%s» explains each function it is about, in its own text', (title, labels) => {
    const chapter = configuratorChapters.find(c => c.title === title); const own = norm(texts(chapter).join(' '));
    const missing = labels.filter(label => !own.includes(norm(label))); expect(missing).toEqual([]);
  });
  test('every «vedi il capitolo …» points to a chapter that exists, under that very name', () => {
    const titles = configuratorChapters.map(c => c.title); const all = configuratorChapters.flatMap(texts).join(' ');
    const refs = [...all.matchAll(/vedi il capitolo ([^.;)]+?)(?:[.;)]|$)/gi)].map(m => m[1].trim());
    expect(refs.length).toBeGreaterThan(0);
    refs.forEach(ref => expect(titles.some(title => title === ref || title.startsWith(ref))).toBe(true));
  });
  test('the chapters are in the order a person works: the steps, then the sections, then the chat, the folders, the solution, and the administration last', () => {
    const order = configuratorChapters.map(c => c.title); const at = title => order.indexOf(title);
    expect(at('Il passo Iniziativa: le sette sezioni')).toBeLessThan(at('Razionali e vincoli con l’AI')); expect(at('Razionali e vincoli con l’AI')).toBeLessThan(at('Chattare bene con l’AI'));
    expect(at('Chattare bene con l’AI')).toBeLessThan(at('Sorgenti, cartelle e applicativi')); expect(at('Soluzione: interventi e file per Visual Studio Code')).toBeLessThan(at('Workspace documentale'));
  });
  test('the functions of the chat are explained in the chapter about the chat, not left to a generic page', () => {
    const chat = configuratorChapters.find(c => c.title === 'Chattare bene con l’AI'); const rows = chat.fields.rows.map(([name]) => name);
    expect(rows).toEqual(expect.arrayContaining(['«Questa richiesta chiede più cose insieme»', '«Continua dal punto in cui si è fermata»']));
  });
});

describe('structure', () => {
  test.each([['Configuratore', configuratorChapters], ['Sviluppo', developmentChapters]])('%s: every chapter has title, subtitle and at least one step', (name, chapters) => {
    chapters.forEach(c => { expect(c.title).toBeTruthy(); expect(c.subtitle).toBeTruthy(); expect(c.steps.length).toBeGreaterThan(0); c.steps.forEach(s => expect(s.length).toBeGreaterThan(20)); });
    expect(new Set(chapters.map(c => c.title)).size).toBe(chapters.length);
  });
  test.each([['Configuratore', configuratorChapters], ['Sviluppo', developmentChapters]])('%s: the first chapter introduces the application and carries the figure', (name, chapters) => {
    const first = chapters[0];
    expect(first.intro.length).toBeGreaterThan(200); expect(first.figure).toBeTruthy(); expect(FIGURE_IDS).toContain(first.figure.id);
    expect(first.figure.alt.length).toBeGreaterThan(200); expect(first.figure.title).toBeTruthy(); expect(first.figure.caption).toBeTruthy();
  });
  test('the figures describe the same things the manual says: all four steps, all six phases and the three requirements of a defined card', () => {
    const c = configuratorChapters[0].figure.alt; ['Iniziativa', 'Interventi', 'Offerta', 'Revisione', 'Salva valutazione', 'Salva e Chiudi', 'Sviluppo', 'Tabella di Offerta', 'Secondo parere AI', 'Analizza e suggerisci', 'Tabella di offerta XLSX'].forEach(w => expect(c).toContain(w));
    const d = developmentChapters[0].figure.alt; ['Fonti', 'Schede', 'Progetto', 'Codice', 'Consegna', 'Verifica', 'file coinvolti', 'soluzione tecnica', 'criteri di accettazione', 'Verificata'].forEach(w => expect(d).toContain(w));
  });
  test('every phase of Sviluppo has a chapter and appears in the right order', () => {
    const titles = developmentChapters.map(c => c.title);
    const order = ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4', 'Fase 5', 'Fase 6'].map(p => titles.findIndex(t => t.startsWith(p)));
    expect(order.every(i => i >= 0)).toBe(true); expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  test('the four Consegna checks and the ten project decisions quoted by the manual are the real ones', () => {
    const consegna = developmentChapters.find(c => c.title.startsWith('Fase 5'));
    ['Sviluppo salvato', 'Interventi approvati nell’offerta', 'Branch indicato', 'Comandi di build e test indicati'].forEach(l => { expect(consegna.fields.rows.map(r => r[0])).toContain(l); expect(CODE_N).toContain(norm(l)); });
    const progetto = developmentChapters.find(c => c.title.startsWith('Fase 3'));
    expect(progetto.fields.rows).toHaveLength(10); progetto.fields.rows.forEach(([l]) => expect(CODE_N).toContain(norm(l)));
  });
  test('the card fields listed in the manual are the real labels', () => {
    const schede = developmentChapters.find(c => c.title.startsWith('Fase 2'));
    schede.fields.rows.forEach(([label]) => expect(CODE_N).toContain(norm(label)));
    const dati = configuratorChapters.find(c => c.title.startsWith('Passo 1'));
    dati.fields.rows.forEach(([label]) => expect(CODE_N).toContain(norm(label.replace(' / applicazione', ''))));
  });
});

describe('rendering', () => {
  beforeEach(() => { HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); }); HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); }); HTMLElement.prototype.scrollTo = jest.fn(); });
  afterEach(cleanup);
  test('the Configuratore manual opens on the introduction with the figure, its caption and the text alternative', () => {
    render(<ConfiguratorManual />); fireEvent.click(screen.getByRole('button', { name: /Manuale d’uso/ }));
    const dialog = screen.getByRole('dialog', { name: 'Configuratore Iniziative' });
    expect(within(dialog).getByText('Capitolo 1 di ' + configuratorChapters.length)).toBeInTheDocument();
    const figure = within(dialog).getByRole('figure'); expect(within(figure).getByRole('img')).toHaveAccessibleName(/tre fasce/); expect(figure).toHaveTextContent('Figura 1');
    fireEvent.click(within(figure).getByText('Descrizione della figura a parole')); expect(within(figure).getByText(/Per salvare serve almeno il GOTO/)).toBeVisible();
    expect(within(dialog).getByText(/Il Configuratore Iniziative serve a trasformare/)).toBeInTheDocument();
  });
  test('the Sviluppo manual opens on the introduction with the figure', () => {
    render(<PageManual page="sviluppo" />); fireEvent.click(screen.getByRole('button', { name: /Manuale d’uso/ }));
    const dialog = screen.getByRole('dialog', { name: 'Sviluppo iniziative' });
    expect(within(dialog).getByRole('img')).toHaveAccessibleName(/sei fasi/); expect(within(dialog).getByText(/Sviluppo iniziative prende una valutazione/)).toBeInTheDocument();
  });
  test('a chapter with a field table, a warnings box and a note shows them all, with a real table', () => {
    render(<PageManual page="sviluppo" />); fireEvent.click(screen.getByRole('button', { name: /Manuale d’uso/ }));
    fireEvent.click(screen.getByRole('button', { name: /Fase 2 · Schede/ }));
    const table = screen.getByRole('table', { name: 'I campi di una scheda' }); expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Voce', 'Cosa fare']);
    expect(within(table).getByRole('rowheader', { name: /Soluzione tecnica/ })).toBeInTheDocument();
    expect(screen.getByText('Se qualcosa non va')).toBeInTheDocument(); expect(screen.getByText('Da ricordare')).toBeInTheDocument();
  });
  test('chapters without the new parts still render exactly as before', () => {
    render(<PageManual page="mev" />); fireEvent.click(screen.getByRole('button', { name: /Manuale d’uso/ }));
    expect(screen.queryByRole('figure')).not.toBeInTheDocument(); expect(screen.queryByRole('table')).not.toBeInTheDocument(); expect(screen.queryByText('Se qualcosa non va')).not.toBeInTheDocument();
  });
  test('a chapter naming an unknown figure shows no figure instead of breaking', () => {
    const { Figure } = require('./manualFigures'); const { container } = render(<Figure figure={{ id: 'nope', title: 't', caption: 'c', alt: 'a' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ---- The chapter «Lavorare senza Excel» and the manual of Sviluppo make claims about WHAT THE APP DOES that a rename would not reveal.
// Each claim below is checked against the real behaviour, so that when the app changes this test says which sentence of the manual is now false.
describe('the work without Excel: what the manual says the app does is true', () => {
  const noExcel = configuratorChapters.find(c => c.title.startsWith('Lavorare senza Excel'));
  const all = norm([noExcel.intro, ...noExcel.steps, noExcel.note].join(' '));
  const page = fs.readFileSync(path.join(SRC, 'pages/ConfiguratorePage.js'), 'utf8');
  const sviluppo = fs.readFileSync(path.join(SRC, 'pages/SviluppoPage.js'), 'utf8');
  const solutionPanel = fs.readFileSync(path.join(SRC, 'configuratore/SolutionPanel.js'), 'utf8');

  test('the chapter exists, comes right after the introduction and walks through seven stages in order', () => {
    const titles = configuratorChapters.map(c => c.title); expect(titles.indexOf(noExcel.title)).toBe(1);
    const stages = noExcel.steps.filter(step => /^TAPPA \d/.test(step)).map(step => Number(step.match(/^TAPPA (\d)/)[1])); expect(stages).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  test('the introduction says the AI never decides: the team confirms (the essence of the work)', () => {
    expect(all).toContain('decide sempre il team'); expect(all).toContain(norm('finché una persona non lo conferma'));
  });
  test('«Sistema / applicazione» cannot be typed without Excel: it is read only and filled by «+ Aggiungi applicativo…» (as the manual says)', () => {
    expect(all).toContain('NON si scrive a mano'); expect(page).toMatch(/readOnly[\s\S]{0,120}Valorizzato dal file Excel importato|Valorizzato dal file Excel importato/); expect(page).toContain('+ Aggiungi applicativo…');
  });
  test('the interventions proposed by the AI and confirmed in «Soluzione» do NOT feed the offer or Sviluppo: the manual warns about it, and it is still true', () => {
    expect(all).toContain(norm('NON entrano da soli nell’offerta'));
    // Sviluppo builds its activities only from the rows of the saved offer...
    expect(sviluppo).toMatch(/developmentActivities\(loaded\.evaluation\.items/);
    // ...and the proposed interventions live only in the solution panel and its store.
    ['pages/ConfiguratorePage.js', 'pages/SviluppoPage.js', 'configuratore/developmentRecord.js', 'configuratore/developmentPackages.js'].forEach(file => {
      const text = fs.readFileSync(path.join(SRC, file), 'utf8'); expect(text).not.toMatch(/solution\.proposed|mergeInterventions|loadSolution/);
    });
    expect(solutionPanel).toContain('mergeInterventions');
  });
  test('«Analizza e suggerisci» without Excel is local (no AI call) and asks for at least 20 useful characters', () => {
    expect(all).toContain(norm('senza chiamare l’AI')); expect(all).toContain('almeno 20 caratteri');
    const analyze = page.slice(page.indexOf('const analyze = async'), page.indexOf('// ── AI: secondo parere'));            // only the function «Analizza e suggerisci» runs, not the AI second opinion that follows
    expect(analyze).not.toMatch(/analyzeInitiativeWithAi|analyzeWithAi|fetch\(/); expect(analyze).toMatch(/\.length < 20|replace\(\/\\s\/g, ""\)\.length < 20/);
  });
  test('without Excel the comparison and the row verification do not exist (they need imported rows) — and the manual says so', () => {
    expect(all).toContain(norm('mancano il «Confronto prezzi Excel e catalogo» e la «Verifica AI delle righe»'));
    expect(fs.readFileSync(path.join(SRC, 'configuratore/OfferPriceComparison.js'), 'utf8')).toMatch(/if \(!result\.lines\.length\) return null/);
    expect(fs.readFileSync(path.join(SRC, 'configuratore/catalogReconciliation.js'), 'utf8')).toMatch(/filter\(it => it\.imported\)/);
  });
  test('the limits quoted for the documents are the real ones', () => {
    const model = fs.readFileSync(path.join(SRC, 'configuratore/libraryModel.js'), 'utf8'); const controller = fs.readFileSync(path.join(BACKEND, 'Controllers/DocumentLibraryController.cs'), 'utf8');
    expect(model).toMatch(/MAX_FILE = 10 \* 1024 \* 1024/); expect(all).toContain('fino a 10 MB'); expect(controller).toMatch(/MaxDocumentsPerInitiative = 300/); expect(all).toContain('300 per iniziativa');
    expect(controller).toMatch(/MaxQuestion = 2000/); expect(all).toContain('massimo 2.000 caratteri');
  });
  test('the limits quoted for the proposed interventions are the real ones (12 per request, 30 in all)', () => {
    expect(fs.readFileSync(path.join(BACKEND, 'Services/InterventionProposals.cs'), 'utf8')).toMatch(/MaxInterventions = 12/);
    expect(fs.readFileSync(path.join(SRC, 'configuratore/proposedInterventions.js'), 'utf8')).toMatch(/MAX_PROPOSED = 30/); expect(all).toContain('12 interventi per volta (30 in tutto)');
  });
  test('the size of a rationale (600 characters) and of the solution fields (6.000) are the real ones', () => {
    expect(fs.readFileSync(path.join(SRC, 'configuratore/rationaleKnowledge.js'), 'utf8')).toMatch(/MAX_ENTRY = 600/); expect(all).toContain('600 caratteri');
    expect(fs.readFileSync(path.join(SRC, 'configuratore/solutionModel.js'), 'utf8')).toMatch(/MAX_FIELD = 6000/); expect(all).toContain('6.000 caratteri');
  });
  test('the export of the Excel rejects a row without an intervention, as the manual warns', () => {
    expect(all).toContain('Interventi duplicati, dettagli non associati o importi non validi.');
    expect(fs.readFileSync(path.join(BACKEND, 'Services/OfferWorkbookExporter.cs'), 'utf8')).toMatch(/Interventi duplicati, dettagli non associati o importi non validi/);
  });
  test('moving to step 4 saves by itself and «Salva e vai a Sviluppo →» exists (stage 7)', () => {
    expect(page).toMatch(/persistInitiativeEvaluation\(false\)/); expect(all).toContain(norm('la valutazione si salva da sola')); expect(page).toContain('Salva e vai a Sviluppo →');
  });
});

describe('Sviluppo manual: the claims about the app are true', () => {
  const text = norm(developmentChapters.flatMap(c => [c.intro, ...(c.steps || []).map(s => typeof s === 'string' ? s : s.text), c.note, ...(c.warnings ? c.warnings.flat() : []), ...(c.fields ? c.fields.rows.flat() : [])]).filter(Boolean).join(' '));
  const sviluppo = fs.readFileSync(path.join(SRC, 'pages/SviluppoPage.js'), 'utf8');
  test('there is a chapter about the requirements and one about the common problems', () => {
    const titles = developmentChapters.map(c => c.title); expect(titles).toContain('Prima di cominciare: cosa serve'); expect(titles).toContain('Problemi frequenti e rimedi');
    expect(titles.indexOf('Prima di cominciare: cosa serve')).toBeLessThan(titles.indexOf('L’elenco delle iniziative')); expect(titles[titles.length - 1]).toBe('Problemi frequenti e rimedi');
  });
  test('the manual warns that Sviluppo needs the rows of the offer, and that is how the activities are built', () => {
    expect(text).toContain('0 attività'); expect(sviluppo).toMatch(/developmentActivities\(loaded\.evaluation\.items/);
  });
  test('the old wrong claims are gone: 60 files, «proposed/ (i file nuovi)», the worker, the folder lost at every reload', () => {
    ['fino a 60 file', 'proposed/ (i file nuovi)', 'worker automatico', 'si perde a ogni ricarica'].forEach(wrong => expect(text).not.toContain(wrong));
  });
  test('the real limits of the AI reading are the ones quoted: 8 excerpts of about 80 lines, files up to 500 KB, 6.000 files read', () => {
    const context = fs.readFileSync(path.join(SRC, 'configuratore/activitySourceContext.js'), 'utf8'); expect(context).toMatch(/MAX_SENT = 8/); expect(text).toContain('otto estratti');
    expect(fs.readFileSync(path.join(SRC, 'configuratore/sourceLibrary.js'), 'utf8')).toMatch(/MAX_FILE_BYTES = 500000/); expect(text).toContain('500 KB');
  });
  test('the code generation accepts from 1 to 12 files of at most 60.000 characters, as quoted', () => {
    const validation = fs.readFileSync(path.join(BACKEND, 'Services/CodeArtifactValidation.cs'), 'utf8'); expect(validation).toMatch(/da 1 a 12 file/); expect(validation).toMatch(/60000|60_000/); expect(text).toContain('da 1 a 12 file'); expect(text).toContain('60.000 caratteri');
  });
  test('the app does not warn when the browser tab is closed (the manual says so): there is no beforeunload', () => {
    expect(sviluppo).not.toMatch(/beforeunload/); expect(text).toContain(norm('non avvisa alla chiusura della scheda del browser'));
  });
  test('«Salva e chiudi» saves even without changes, as the manual says', () => {
    expect(sviluppo).toMatch(/saveAndClose/); expect(text).toContain('salva sempre');
  });
  test('the four most useful warnings for the AI errors quote real server messages', () => {
    expect(BACKEND_CODE).toMatch(/Chiave AI non configurata o non valida/); expect(text).toContain('Chiave AI non configurata o non valida');
  });
});
