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
const CODE = walk(SRC).map(f => fs.readFileSync(f, 'utf8')).join('\n');
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
  Sviluppo: ['Salva sviluppo', 'Salva e chiudi', 'Chiudi senza salvare', 'Prepara scheda con AI', 'Inserisci bozza nella scheda', 'Genera progetto di avvio ZIP', 'Genera codice / workflow per questa attività', 'Conserva artefatti nella scheda', 'Scarica file sorgenti generati ZIP', 'Genera ZIP richiesta modifica codice', 'Esporta piano di sviluppo (MD)', 'Genera documento sviluppo (AI)', 'Seleziona cartella sorgenti', 'Cambia cartella', '↻ Aggiorna'],
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
