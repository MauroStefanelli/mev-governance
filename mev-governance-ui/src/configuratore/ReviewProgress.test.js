import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReviewProgress from './ReviewProgress';
import ReviewBrain from './ReviewBrain';

const entry = (rowId, status, extra = {}) => ({ rowId, interventionId: extra.interventionId ?? 'I1', activity: extra.activity ?? `Attivita ${rowId}`, catalogName: extra.catalogName ?? 'Servizio/API', review: status ? { status, reason: extra.reason ?? `motivo ${rowId}`, suggestion: extra.suggestion ?? '' } : null });
const base = { open: true, phase: 'running', done: 0, total: 10, entries: Array.from({ length: 10 }, (_, i) => entry(String(i), null)), onClose: jest.fn(), onStop: jest.fn() };

describe('the brain', () => {
  test.each([[0, 0], [37, 37], [100, 100], [180, 100], [-5, 0], ['x', 0], [undefined, 0]])('%s is shown as %s%%', (given, shown) => {
    render(<ReviewBrain percent={given} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', `Avanzamento ${shown}%`);
  });
  test('the colour level rises with the percentage and the circuit traces light up one by one', () => {
    const { container, rerender } = render(<ReviewBrain percent={0} />);
    const level = () => Number(container.querySelector('.rb-level').getAttribute('y'));
    const lit = () => container.querySelectorAll('.rb-node.is-on').length;
    const traces = () => container.querySelectorAll('.rb-trace.is-on').length;
    const at0 = [level(), lit(), traces()];
    rerender(<ReviewBrain percent={50} />); const at50 = [level(), lit(), traces()];
    rerender(<ReviewBrain percent={100} />); const at100 = [level(), lit(), traces()];
    expect(at0).toEqual([196, 0, 0]);
    expect(at50[0]).toBeLessThan(at0[0]); expect(at100[0]).toBeLessThan(at50[0]);
    expect(at50[1]).toBeGreaterThan(0); expect(at100[1]).toBeGreaterThan(at50[1]); expect(at100[1]).toBe(13); expect(at100[2]).toBe(13);
    expect(at50[1]).toBe(at50[2]);                                   // ogni nodo acceso ha la sua traccia accesa
    expect(at100[0]).toBeCloseTo(18, 5);
  });
  test('it is a brain, not a blob: cortex, cerebellum, brain stem and the folds (sulci)', () => {
    const { container } = render(<ReviewBrain percent={40} />);
    expect(container.querySelectorAll('.rb-tissue')).toHaveLength(3);          // corteccia, cervelletto, tronco encefalico
    expect(container.querySelectorAll('.rb-outline')).toHaveLength(3);
    expect(container.querySelectorAll('.rb-sulcus').length).toBeGreaterThanOrEqual(12);
  });
  test('the colours are the tissue (pink) and the electronics (cyan fill, gold traces), set as variables so each state can change them', () => {
    const css = require('fs').readFileSync(require('path').join(__dirname, 'reviewBrain.css'), 'utf8');
    expect(css).toMatch(/--rb-t1: #f3c9c6/); expect(css).toMatch(/--rb-b: #35d0e8/); expect(css).toMatch(/--rb-trace: #f4b942/);
    expect(css).toMatch(/\.rb-ok \{[^}]*--rb-b: #3fd18a/); expect(css).toMatch(/\.rb-bad \{[^}]*--rb-b: #f08a3c/);
  });
  test('it breathes only while working', () => {
    const { container, rerender } = render(<ReviewBrain percent={30} pulse />); expect(container.firstChild).toHaveClass('is-pulsing');
    rerender(<ReviewBrain percent={30} />); expect(container.firstChild).not.toHaveClass('is-pulsing');
  });
  test('the drawing is decorative: the text carries the information', () => expect(render(<ReviewBrain percent={10} />).container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true'));
});

describe('while the AI works', () => {
  test('it shows the real progress (rows verified out of rows to verify), a progress bar and a Stop button; no Close button', () => {
    render(<ReviewProgress {...base} done={5} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('L’AI sta ragionando sulle righe');
    expect(screen.getByText('5 di 10 righe verificate (50%)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avanzamento della verifica' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByRole('img', { name: 'Avanzamento della verifica: 50%' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Interrompi la verifica' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chiudi' })).toBeNull();
    expect(screen.getByText(/Non chiudere la pagina/)).toBeInTheDocument();
  });
  test('at the start nothing has emerged yet: no empty statistics, only the progress', () => {
    render(<ReviewProgress {...base} />);
    expect(screen.getByText('0 di 10 righe verificate (0%)')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Righe per stato' })).toBeNull();
  });
  test('as the first rows arrive, the counts and «Cosa sta emergendo» appear with what the AI wrote', () => {
    const entries = base.entries.map((e, i) => i === 0 ? entry('0', 'non_coerente', { interventionId: 'I7', reason: 'Il tipo MODIFICA non è coerente con una nuova pagina', suggestion: 'Usare REALIZZAZIONE, criterio «Numero Campi > 20»' }) : i === 1 ? entry('1', 'coerente') : e);
    render(<ReviewProgress {...base} done={5} entries={entries} />);
    const stats = screen.getByRole('group', { name: 'Righe per stato' });
    expect(within(stats).getByText('Possibili incoerenze').previousSibling).toHaveTextContent('1');
    expect(within(stats).getByText('Coerenti').previousSibling).toHaveTextContent('1');
    expect(within(stats).getByText('In attesa').previousSibling).toHaveTextContent('8');
    expect(screen.getByText('Cosa sta emergendo')).toBeInTheDocument();
    expect(screen.getByText('Il tipo MODIFICA non è coerente con una nuova pagina')).toBeInTheDocument();
    expect(screen.getByText(/Usare REALIZZAZIONE, criterio «Numero Campi > 20»/)).toBeInTheDocument();
    expect(screen.queryByText('Verifica completata')).toBeNull();
  });
  test('Stop calls the stop handler', () => { const onStop = jest.fn(); render(<ReviewProgress {...base} onStop={onStop} />); fireEvent.click(screen.getByRole('button', { name: 'Interrompi la verifica' })); expect(onStop).toHaveBeenCalledTimes(1); });
  test('Escape does NOT close it while it is working', () => { const onClose = jest.fn(); render(<ReviewProgress {...base} onClose={onClose} />); fireEvent.keyDown(document, { key: 'Escape' }); expect(onClose).not.toHaveBeenCalled(); });
});

describe('when it is done', () => {
  const entries = [entry('1', 'coerente'), entry('2', 'da_verificare', { interventionId: 'I2', catalogName: 'Realizzazione schema (DDL)', reason: 'Servono più dettagli', suggestion: 'Confermare il numero di tabelle' }),
    entry('3', 'non_coerente', { interventionId: 'I3', catalogName: 'Realizzazione schema (DDL)', reason: 'Tipo non coerente' }), entry('4', 'coerente')];
  const done = { ...base, phase: 'done', done: 4, total: 4, entries };
  test('it says it is completed, gives the verdict and the counts', () => {
    render(<ReviewProgress {...done} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Verifica completata');
    expect(screen.getByText('4 di 4 righe verificate (100%)')).toBeInTheDocument();
    expect(screen.getByText('Ci sono righe con una possibile incoerenza.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Avanzamento della verifica: 100%' })).toBeInTheDocument();
    expect(screen.getByText(/50% delle righe verificate è coerente con il catalogo · 2 interventi con righe da controllare/)).toBeInTheDocument();
  });
  test('it lists the rows to check, the most serious first, with what the AI said and what to do', () => {
    render(<ReviewProgress {...done} />);
    const items = within(screen.getByText('Righe da controllare').closest('div')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Possibili incoerenze'); expect(items[0]).toHaveTextContent('Tipo non coerente');
    expect(items[1]).toHaveTextContent('Da verificare'); expect(items[1]).toHaveTextContent('Cosa fare: Confermare il numero di tabelle');
  });
  test('it points to the catalog voices to look at first', () => {
    render(<ReviewProgress {...done} />);
    const block = screen.getByText('Voci di catalogo da guardare per prime').closest('div');
    expect(within(block).getByText('Realizzazione schema (DDL)')).toBeInTheDocument(); expect(within(block).getByText(/2 righe da controllare, 1 con possibile incoerenza/)).toBeInTheDocument();
  });
  test('«all coherent» is said only when really all rows are coherent', () => {
    render(<ReviewProgress {...done} entries={[entry('1', 'coerente'), entry('2', 'coerente')]} total={2} done={2} />);
    expect(screen.getByText('Tutte le righe verificate sono coerenti con il catalogo.')).toBeInTheDocument();
    expect(screen.getByText(/Nessuna riga richiede un intervento/)).toBeInTheDocument();
  });
  test('the Close button closes it, and Escape too', () => {
    const onClose = jest.fn(); render(<ReviewProgress {...done} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Interrompi la verifica' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' })); fireEvent.keyDown(document, { key: 'Escape' }); expect(onClose).toHaveBeenCalledTimes(2);
  });
  test('it always repeats that the judgement must be confirmed by the analyst', () => { render(<ReviewProgress {...done} />); expect(screen.getByText(/Giudizio AI da confermare dall’analista/)).toBeInTheDocument(); });
});

describe('when it stops', () => {
  const entries = [entry('1', 'coerente'), entry('2', 'da_verificare'), entry('3', null)];
  const stopped = (error, extra = {}) => render(<ReviewProgress {...base} phase="stopped" done={2} total={3} entries={entries} error={error} onResume={jest.fn()} onRestart={jest.fn()} {...extra} />);
  test('it explains the CAUSE in plain words, keeps the technical detail, and says how many rows are already done', () => {
    stopped('Errore HTTP 502');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Verifica interrotta');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Il servizio AI non ha risposto in tempo'); expect(alert).toHaveTextContent('Dettaglio tecnico: Errore HTTP 502');
    expect(alert).toHaveTextContent('2 di 3 righe sono già verificate e sono state conservate'); expect(alert).toHaveTextContent('continua dalle altre 1');
    expect(screen.getByText('2 di 3 righe verificate (67%) · 1 riga ancora da verificare')).toBeInTheDocument();      // la percentuale e' delle righe davvero verificate
  });
  test.each([
    ['Hai interrotto la verifica.', 'Hai premuto «Interrompi la verifica»'], ['Chiave AI non configurata o non valida', 'ha rifiutato l’accesso'], ['Errore HTTP 429', 'limite di richieste'],
    ['Risposta AI incompleta: mancano le verifiche per riga.', 'formato non utilizzabile'], ['qualcosa di strano', 'si è fermata per un errore'],
  ])('«%s» is explained as «%s»', (error, cause) => { stopped(error); expect(screen.getByRole('alert')).toHaveTextContent(cause); });
  test('it offers «Riprendi», «Verifica tutto da capo» and «Chiudi»; each calls its own handler', () => {
    const onResume = jest.fn(), onRestart = jest.fn(), onClose = jest.fn();
    stopped('Errore HTTP 502', { onResume, onRestart, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Riprendi: verifica le 1 riga mancante' })); fireEvent.click(screen.getByRole('button', { name: 'Verifica tutto da capo' })); fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect([onResume, onRestart, onClose].map(f => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
  test('a key problem tells where to fix it, and the advice does not promise a fix by retrying', () => {
    stopped('Chiave AI non configurata o non valida'); expect(screen.getByRole('alert')).toHaveTextContent('Profilo utente → «API Key AI»');
  });
});
describe('when it resumes and when some rows could not be verified', () => {
  test('while running again it says how many rows are NOT redone, and the progress starts from where it was', () => {
    render(<ReviewProgress {...base} done={15} total={45} resumed alreadyDone={15} entries={Array.from({ length: 45 }, (_, i) => entry(String(i), i < 15 ? 'coerente' : null))} />);
    expect(screen.getByText('Riprende da dove si era fermata: 15 righe già verificate non vengono rifatte.')).toBeInTheDocument();
    expect(screen.getByText('15 di 45 righe verificate (33%)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  });
  test('a first run does not claim to be a resume', () => { render(<ReviewProgress {...base} done={0} />); expect(screen.queryByText(/Riprende da dove si era fermata/)).toBeNull(); });
  test('done with a row NOT verified: it is «Verifica incompleta», never 100%, never «tutte coerenti», and «Riprendi» appears with the missing rows', () => {
    const entries = [entry('1', 'coerente'), entry('2', 'error', { reason: 'Risposta AI incompleta' })];
    render(<ReviewProgress {...base} phase="done" done={2} total={2} entries={entries} failedRows={['2']} onResume={jest.fn()} onRestart={jest.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Verifica incompleta'); expect(screen.getByRole('dialog')).not.toHaveTextContent('Verifica completata');
    expect(screen.getByRole('img', { name: 'Avanzamento della verifica: 50%' })).toBeInTheDocument();
    expect(screen.getByText('1 di 2 righe verificate (50%) · 1 riga ancora da verificare')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('La verifica non è completa: 1 riga non è stata verificata');
    expect(screen.queryByText('Tutte le righe verificate sono coerenti con il catalogo.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Riprendi: verifica le 1 riga mancante' })).toBeInTheDocument();
  });
  test('«phase done» is NOT trusted: with a row still waiting the window says «incompleta» even if the caller says it is done', () => {
    render(<ReviewProgress {...base} phase="done" done={3} total={3} entries={[entry('1', 'coerente'), entry('2', 'coerente'), entry('3', null)]} onResume={jest.fn()} onRestart={jest.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Verifica incompleta'); expect(screen.getByRole('img', { name: 'Avanzamento della verifica: 67%' })).toBeInTheDocument();
    expect(screen.getByText(/2 di 3 righe verificate \(67%\) · 1 riga ancora da verificare/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riprendi: verifica le 1 riga mancante' })).toBeInTheDocument();
  });
  test('every row verified so far is coherent but some are missing: it does NOT say «Tutte le righe verificate sono coerenti», it says the verification is not complete', () => {
    render(<ReviewProgress {...base} phase="done" done={3} total={3} entries={[entry('1', 'coerente'), entry('2', 'coerente'), entry('3', null)]} onResume={jest.fn()} onRestart={jest.fn()} />);
    expect(screen.queryByText('Tutte le righe verificate sono coerenti con il catalogo.')).toBeNull();
    expect(screen.getByText('Alcune righe non sono state ancora verificate.')).toBeInTheDocument();      // il verdetto parla delle righe mancanti, non di «coerenza» generale
    expect(screen.queryByText(/Nessuna riga richiede un intervento/)).toBeNull();
  });
  test('«phase stopped» is NOT trusted either: if every row has a valid judgement it is complete and offers no «Riprendi»', () => {
    render(<ReviewProgress {...base} phase="stopped" done={2} total={2} error="x" entries={[entry('1', 'coerente'), entry('2', 'da_verificare')]} onResume={jest.fn()} onRestart={jest.fn()} />);
    const window_ = document.querySelector('[role=dialog],[role=alertdialog]');
    expect(window_).toHaveTextContent('Verifica completata'); expect(window_).not.toHaveTextContent('Verifica interrotta'); expect(screen.queryByRole('button', { name: /Riprendi/ })).toBeNull();
    expect(screen.queryByText(/Dettaglio tecnico/)).toBeNull();      // nessun errore da mostrare: non manca nulla
    expect(screen.getByRole('img', { name: 'Avanzamento della verifica: 100%' })).toBeInTheDocument();
  });
  test('every row with a valid judgement and nothing missing: 100% and completed', () => {
    render(<ReviewProgress {...base} phase="done" done={2} total={2} entries={[entry('1', 'coerente'), entry('2', 'non_coerente')]} onResume={jest.fn()} onRestart={jest.fn()} />);
    expect(screen.getByRole('img', { name: 'Avanzamento della verifica: 100%' })).toBeInTheDocument(); expect(screen.getByRole('dialog')).toHaveTextContent('Verifica completata');
  });
  test('a clean completion offers «Verifica tutto da capo» but not «Riprendi»', () => {
    render(<ReviewProgress {...base} phase="done" done={2} total={2} entries={[entry('1', 'coerente'), entry('2', 'coerente')]} onResume={jest.fn()} onRestart={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Riprendi dalle righe non verificate' })).toBeNull(); expect(screen.getByRole('button', { name: 'Verifica tutto da capo' })).toBeInTheDocument();
  });
});
test('closed: nothing is rendered', () => { const { container } = render(<ReviewProgress {...base} open={false} />); expect(container).toBeEmptyDOMElement(); });

describe('the real wiring in the Configuratore', () => {
  const fs = require('fs'); const path = require('path');
  const page = fs.readFileSync(path.join(__dirname, '..', 'pages', 'ConfiguratorePage.js'), 'utf8');
  test('both verification cards (passo 1 and passo 3) open the window (the automatic review after the Excel import does not)', () => {
    expect(page.match(/onReview=\{options => runDetailReview\(items, catalog, importedInterventions, lot, true, !!options\?\.force\)\}/g)).toHaveLength(2);
    expect(page.match(/onRestartReview=\{\(\) => runDetailReview\(items, catalog, importedInterventions, lot, true, true\)\}/g)).toHaveLength(2);
    expect(page).toMatch(/void runDetailReview\(parsed\.items, importLot \? effectiveCatalog\(importLot\) : catalog, parsed\.interventions, parsed\.lot \|\| lot\)/);
  });
  test('the window gets the REAL progress, the rows and the reason of a failure', () => {
    expect(page).toMatch(/<ReviewProgress open=\{reviewWindow\.open\} phase=\{reviewWindow\.phase\} done=\{reviewWindow\.done\} total=\{reviewWindow\.total\} entries=\{reviewWindow\.rows\} error=\{reviewWindow\.error\} resumed=\{reviewWindow\.resumed\} alreadyDone=\{reviewWindow\.alreadyDone\} failedRows=\{reviewWindow\.failedRows\}/);
    expect(page).toMatch(/showResults\(results, finished\)/);
    expect(page).toMatch(/setReviewWindow\(previous => \(\{ \.\.\.previous, phase: 'stopped', error: reason \}\)\)/);
    expect(page).toMatch(/phase: allFailed \? 'stopped' : 'done', done: total, failedRows/);
  });
  test('Stop makes the running review stop (the job number changes) and tells the user', () => {
    expect(page).toMatch(/onStop=\{\(\) => \{ detailReviewJob\.current\+\+; setDetailReviewBusy\(false\)/);
    expect(page).toMatch(/Hai interrotto la verifica\./);
  });
});
