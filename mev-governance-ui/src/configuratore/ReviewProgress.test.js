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
  test('the colour level rises with the percentage and the synapses light up one by one', () => {
    const { container, rerender } = render(<ReviewBrain percent={0} />);
    const level = () => Number(container.querySelector('.rb-level').getAttribute('y'));
    const lit = () => container.querySelectorAll('.rb-node.is-on').length;
    const at0 = [level(), lit()];
    rerender(<ReviewBrain percent={50} />); const at50 = [level(), lit()];
    rerender(<ReviewBrain percent={100} />); const at100 = [level(), lit()];
    expect(at0).toEqual([150, 0]);
    expect(at50[0]).toBeLessThan(at0[0]); expect(at100[0]).toBeLessThan(at50[0]);
    expect(at50[1]).toBeGreaterThan(0); expect(at100[1]).toBeGreaterThan(at50[1]); expect(at100[1]).toBe(15);
    expect(at100[0]).toBeCloseTo(14, 5);
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
    expect(screen.getByText('4 di 4 righe verificate')).toBeInTheDocument();
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
  test('it keeps the dialog with the reason, says what was kept, and still shows what had been verified', () => {
    const entries = [entry('1', 'coerente'), entry('2', 'da_verificare'), entry('3', null)];
    render(<ReviewProgress {...base} phase="stopped" done={2} total={3} entries={entries} error="Verifica AI non riuscita. Controlla la configurazione AI personale e riprova" />);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Verifica interrotta');
    expect(screen.getByRole('alert')).toHaveTextContent('Verifica AI non riuscita'); expect(screen.getByRole('alert')).toHaveTextContent('Le righe già verificate sono state conservate');
    expect(screen.getByText('2 di 3 righe verificate prima dell’interruzione')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chiudi' })).toBeInTheDocument();
  });
});
test('closed: nothing is rendered', () => { const { container } = render(<ReviewProgress {...base} open={false} />); expect(container).toBeEmptyDOMElement(); });

describe('the real wiring in the Configuratore', () => {
  const fs = require('fs'); const path = require('path');
  const page = fs.readFileSync(path.join(__dirname, '..', 'pages', 'ConfiguratorePage.js'), 'utf8');
  test('both «Verifica / aggiorna coerenza AI delle righe» buttons open the window (the automatic review after the Excel import does not)', () => {
    expect(page.match(/onReview=\{\(\) => runDetailReview\(items, catalog, importedInterventions, lot, true\)\}/g)).toHaveLength(2);
    expect(page).toMatch(/void runDetailReview\(parsed\.items, importLot \? effectiveCatalog\(importLot\) : catalog, parsed\.interventions, parsed\.lot \|\| lot\)/);
  });
  test('the window gets the REAL progress, the rows and the reason of a failure', () => {
    expect(page).toMatch(/<ReviewProgress open=\{reviewWindow\.open\} phase=\{reviewWindow\.phase\} done=\{reviewWindow\.done\} total=\{reviewWindow\.total\} entries=\{reviewWindow\.rows\} error=\{reviewWindow\.error\}/);
    expect(page).toMatch(/showResults\(results, Math\.min\(offset \+ 5, rows\.length\)\)/);
    expect(page).toMatch(/if \(withWindow\) setReviewWindow\(previous => \(\{ \.\.\.previous, phase: 'stopped', error: e\.message \}\)\)/);
    expect(page).toMatch(/phase: 'done', done: rows\.length/);
  });
  test('Stop makes the running review stop (the job number changes) and tells the user', () => {
    expect(page).toMatch(/onStop=\{\(\) => \{ detailReviewJob\.current\+\+; setDetailReviewBusy\(false\)/);
    expect(page).toMatch(/Hai interrotto la verifica\./);
  });
});
