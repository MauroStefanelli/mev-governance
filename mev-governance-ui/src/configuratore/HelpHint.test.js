import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import HelpHint, { openManualAt, placePanel } from './HelpHint';
import { HELP } from './helpTopics';
import ConfiguratorManual from './ConfiguratorManual';

const topic = HELP.datiIniziativa;
const norm = t => t.replace(/&apos;|&#39;|[’‘]/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

describe('the «?» button', () => {
  test('is a labelled button that is closed at first, and opens a short panel with what to do here', () => {
    render(<HelpHint topic={topic} label="Dati iniziativa" />);
    const button = screen.getByRole('button', { name: 'Come si usa: Dati iniziativa' }); expect(button).toHaveAttribute('aria-expanded', 'false'); expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button); const panel = screen.getByRole('dialog', { name: 'Come si usa: Dati iniziativa' });
    expect(button).toHaveAttribute('aria-expanded', 'true'); expect(panel).toHaveTextContent(topic.title); expect(panel).toHaveTextContent(topic.lead);
    topic.steps.forEach(step => expect(panel).toHaveTextContent(step)); expect(within(panel).getAllByRole('listitem')).toHaveLength(topic.steps.length);
  });
  test('shows the warning when the topic has one, and nothing when it has none', () => {
    const { unmount } = render(<HelpHint topic={HELP.datiIniziativa} label="x" />); fireEvent.click(screen.getByRole('button')); expect(screen.getByRole('dialog')).toHaveTextContent('Attenzione:'); unmount();
    render(<HelpHint topic={HELP.stepOfferta} label="y" />); fireEvent.click(screen.getByRole('button')); expect(screen.getByRole('dialog')).not.toHaveTextContent('Attenzione:');
  });
  test('the button again, «Chiudi l’aiuto», Escape and a click outside all close it; Escape gives the focus back to the «?»', () => {
    render(<div><HelpHint topic={topic} label="a" /><p>fuori</p></div>); const button = screen.getByRole('button', { name: /Come si usa/ });
    fireEvent.click(button); fireEvent.click(button); expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button); fireEvent.click(screen.getByRole('button', { name: 'Chiudi l’aiuto' })); expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button); fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(button).toHaveFocus();
    fireEvent.click(button); fireEvent.mouseDown(screen.getByText('fuori')); expect(screen.queryByRole('dialog')).toBeNull();
  });
  test('a click inside the panel does not close it, and does not reach the row it sits next to', () => {
    const onRow = jest.fn(); render(<div onClick={onRow}><HelpHint topic={topic} label="a" /></div>);
    fireEvent.click(screen.getByRole('button', { name: /Come si usa/ })); fireEvent.click(screen.getByText(topic.lead)); expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(onRow).not.toHaveBeenCalled();
  });
  test('the focus moves into the panel when it opens (keyboard users are not lost)', () => {
    render(<HelpHint topic={topic} label="a" />); fireEvent.click(screen.getByRole('button', { name: /Come si usa/ })); expect(screen.getByRole('button', { name: 'Chiudi l’aiuto' })).toHaveFocus();
  });
  test('only one panel is open at a time: opening another closes the first (a click outside the first)', () => {
    render(<div><HelpHint topic={HELP.datiIniziativa} label="Dati iniziativa" /><HelpHint topic={HELP.soluzione} label="Soluzione" /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Come si usa: Dati iniziativa' })); fireEvent.mouseDown(screen.getByRole('button', { name: 'Come si usa: Soluzione' })); fireEvent.click(screen.getByRole('button', { name: 'Come si usa: Soluzione' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1); expect(screen.getByRole('dialog')).toHaveTextContent('Soluzione');
  });
  test('renders nothing without a topic (a missing key never breaks the page)', () => { const { container } = render(<HelpHint topic={undefined} label="x" />); expect(container).toBeEmptyDOMElement(); });
});

describe('«Apri il capitolo completo del manuale»', () => {
  beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; });      // jsdom has no <dialog> modal
  test('opens the manual on that chapter, not on the first one', () => {
    render(<><HelpHint topic={HELP.soluzione} label="Soluzione" /><ConfiguratorManual /></>);
    expect(screen.queryByRole('dialog', { name: /Configuratore Iniziative/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Come si usa: Soluzione' })); fireEvent.click(screen.getByRole('button', { name: 'Apri il capitolo completo del manuale →' }));
    const manual = document.querySelector('dialog.tow-manual'); expect(manual).toBeTruthy(); expect(within(manual).getByRole('heading', { level: 3 })).toHaveTextContent('Soluzione: interventi e file per Visual Studio Code');
    expect(screen.queryByRole('dialog', { name: 'Come si usa: Soluzione' })).toBeNull();                     // the little panel is closed
  });
  // Which manual each topic belongs to: the Configuratore, Sviluppo, or the manual of the page itself (the page the «?» is on).
  const MANUAL = { devElenco: 'sviluppo', devFonti: 'sviluppo', devSchede: 'sviluppo', devProgetto: 'sviluppo', devConsegna: 'sviluppo', devCodice: 'sviluppo', devVerifica: 'sviluppo',
    mevPagina: 'mev', mevAllineamento: 'mev', mevcapPagina: 'mevcap', grafici: 'chart', team: 'team', report: 'reportavanzamenti', contratti: 'contratti', consumoTow: 'consumotow', tools: 'tools',
    archivio: 'superadmin', catalogoOfferto: 'catalogoofferto', gare: 'gara', admin: 'admin', dbconfig: 'dbconfig' };
  const titlesOf = key => {
    const which = MANUAL[key]; if (!which) { const source = fs.readFileSync(path.join(__dirname, 'ConfiguratorManual.js'), 'utf8'); return [...source.matchAll(/\{ title: '([^']+)'/g)].map(m => m[1]); }
    return require('../components/help/pageManuals').PAGE_MANUALS[which].chapters.map(c => c.title);
  };
  test('every topic points to a chapter that EXISTS in the manual of its own page (so the link never lands nowhere)', () => {
    const missing = Object.entries(HELP).filter(([key, t]) => t.chapter && !titlesOf(key).some(title => title === t.chapter || title.startsWith(t.chapter))).map(([key, t]) => `${key} → ${t.chapter}`);
    expect(missing).toEqual([]);
  });
  test('every topic of another page has a manual that belongs to it (a topic is never left pointing at the Configuratore by mistake)', () => {
    const { PAGE_MANUALS } = require('../components/help/pageManuals'); Object.entries(MANUAL).forEach(([key, page]) => { expect(HELP[key]).toBeTruthy(); expect(PAGE_MANUALS[page]).toBeTruthy(); });
  });
  test('a request for a chapter that does not exist opens nothing', () => {
    render(<ConfiguratorManual />); act(() => openManualAt('Capitolo che non esiste')); expect(document.querySelector('dialog.tow-manual')).toBeNull();
  });
});

describe('what the help says is true: every label it quotes is a real label of the app', () => {
  const SRC = path.resolve(__dirname, '..');
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.js$/.test(e.name) && !/\.test\.js$/.test(e.name) && !/helpTopics\.js$|pageManuals\.js$|ConfiguratorManual\.js$|manualFigures\.js$/.test(e.name) ? [path.join(dir, e.name)] : []);
  const CODE = norm(walk(SRC).map(file => fs.readFileSync(file, 'utf8')).join('\n'));
  const COMPOSED = new Set(['Come si usa', 'Aiuto']);
  const quoted = t => [...[t.lead, ...t.steps, t.tip || ''].join(' ').matchAll(/«([^»]+)»/g)].map(m => m[1].trim());
  test.each(Object.entries(HELP))('«%s»: each quoted label exists in the code of the app', (key, t) => {
    const missing = quoted(t).filter(label => label.length > 2 && !/\d/.test(label) && !COMPOSED.has(label) && !CODE.includes(norm(label).replace(/ ?…$/, '').replace(/\.$/, '')));
    expect(missing).toEqual([]);
  });
  test('every topic is short enough to read at a glance: a lead, 3 to 4 steps, nothing longer than a few lines', () => {
    Object.entries(HELP).forEach(([key, t]) => { expect(t.lead.length).toBeLessThanOrEqual(190); expect(t.steps.length).toBeGreaterThanOrEqual(3); expect(t.steps.length).toBeLessThanOrEqual(4); t.steps.forEach(step => expect(step.length).toBeLessThanOrEqual(190)); if (t.tip) expect(t.tip.length).toBeLessThanOrEqual(190); });
  });
});


// ---- WHERE the panel goes: the row of a section has overflow: hidden, so a panel drawn inside it was cut off. The panel is now drawn on <body> and placed with window coordinates.
describe('the panel is never cut off', () => {
  test('it is drawn on <body>, outside the row of the section (whose overflow: hidden used to cut it)', () => {
    const { container } = render(<div style={{ overflow: 'hidden' }}><HelpHint topic={topic} label="a" /></div>);
    fireEvent.click(screen.getByRole('button', { name: /Come si usa/ })); const panel = screen.getByRole('dialog');
    expect(container.contains(panel)).toBe(false); expect(panel.parentElement).toBe(document.body);
  });
  test('the same inside the real section row: the panel is not a child of the row', async () => {
    const SectionRow = require('./SectionRow').default;
    const { container } = render(<SectionRow help={HELP.soluzione} number="4" id="s" title="Soluzione" open={false} onToggle={() => {}} facts={[]}><div /></SectionRow>);
    fireEvent.click(screen.getByRole('button', { name: 'Come si usa: Soluzione' })); expect(container.contains(screen.getByRole('dialog'))).toBe(false);
  });
  test('closing removes it from the page (nothing is left on <body>)', () => {
    render(<HelpHint topic={topic} label="a" />); fireEvent.click(screen.getByRole('button', { name: /Come si usa/ })); fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelectorAll('.hh-panel')).toHaveLength(0);
  });
  const view = (width, height) => ({ width, height });
  const anchor = (left, top) => ({ left, top, bottom: top + 32, width: 32 });
  test('desktop: under the button when there is room', () => {
    const place = placePanel(anchor(1190, 100), 400, view(1280, 800)); expect(place).toMatchObject({ mode: 'popover', below: true }); expect(place.top).toBe(100 + 32 + 10);
  });
  test('desktop: above the button when there is no room below but there is above', () => {
    const place = placePanel(anchor(1190, 700), 400, view(1280, 800)); expect(place.below).toBe(false); expect(place.top + place.maxHeight).toBeLessThanOrEqual(700 - 10 + 1);
  });
  test('desktop: with little room everywhere it takes the larger side and scrolls inside, never beyond the screen', () => {
    const place = placePanel(anchor(1190, 150), 600, view(1280, 433)); expect(place.top).toBeGreaterThanOrEqual(12); expect(place.top + place.maxHeight).toBeLessThanOrEqual(433 - 12 + 1); expect(place.maxHeight).toBeLessThan(600);
  });
  test('desktop: always inside the width of the window, even for a button on the far right or far left', () => {
    [0, 5, 400, 1250, 1279].forEach(left => { const place = placePanel(anchor(left, 100), 300, view(1280, 800)); expect(place.left).toBeGreaterThanOrEqual(12); expect(place.left + place.width).toBeLessThanOrEqual(1280 - 12); });
  });
  test('a narrow window shrinks the panel instead of cutting it', () => {
    const place = placePanel(anchor(700, 100), 300, view(761, 800)); expect(place.width).toBeLessThanOrEqual(761 - 24); expect(place.left + place.width).toBeLessThanOrEqual(761 - 12);
  });
  test('phone: a sheet anchored to the bottom, never taller than 80% of the screen', () => {
    const place = placePanel(anchor(300, 100), 900, view(390, 800)); expect(place).toMatchObject({ mode: 'sheet', left: 12, bottom: 12 }); expect(place.maxHeight).toBe(640); expect(place.width).toBe(390 - 24);
  });
  test('the arrow points at the button and stays inside the panel', () => {
    const place = placePanel(anchor(1190, 100), 300, view(1280, 800)); expect(place.arrow).toBeGreaterThanOrEqual(14); expect(place.arrow).toBeLessThanOrEqual(place.width - 30);
  });
  test('the button to the manual is outside the scrolling part, so it stays visible when the text scrolls', () => {
    render(<HelpHint topic={topic} label="a" />); fireEvent.click(screen.getByRole('button', { name: /Come si usa/ }));
    const more = screen.getByRole('button', { name: 'Apri il capitolo completo del manuale →' }); expect(more.closest('.hh-scroll')).toBeNull(); expect(screen.getByText(topic.lead).closest('.hh-scroll')).not.toBeNull();
  });
});
