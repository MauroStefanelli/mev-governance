import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReviewLauncher, { launcherCopy } from './ReviewLauncher';
import { reviewStatus } from './reviewPlan';

const sig = input => JSON.stringify(input);
const rows = n => Array.from({ length: n }, (_, i) => ({ rowId: String(i), v: 1 }));
const ok = (input, status = 'coerente') => ({ rowId: input.rowId, status, reason: 'ok', signature: sig(input) });
const statusOf = (n, reviews) => reviewStatus(rows(n), reviews, sig);
const verified = (n, upTo) => Object.fromEntries(rows(n).slice(0, upTo).map(r => [r.rowId, ok(r)]));
const show = (status, props = {}) => render(<ReviewLauncher status={status} busy={false} onStart={jest.fn()} onRestart={jest.fn()} {...props} />);

describe('the button and the card follow the real state', () => {
  test('nothing verified: «Verifica con l’AI», says how many rows, 0%', () => {
    show(statusOf(45, {}));
    expect(screen.getByRole('heading')).toHaveTextContent('45 righe da verificare');
    expect(screen.getByRole('button', { name: 'Verifica con l’AI' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByRole('button', { name: /Riprendi|Rifai|da capo/ })).toBeNull();
  });
  test('15 of 45 verified: it says so, shows 33%, the button is «Riprendi la verifica (30 righe)» and «Verifica tutto da capo» is offered apart', () => {
    show(statusOf(45, verified(45, 15)));
    expect(screen.getByRole('heading')).toHaveTextContent('15 di 45 righe verificate');
    expect(screen.getByText(/Mancano 30: 30 mai verificate\./)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByRole('button', { name: 'Riprendi la verifica (30 righe)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verifica tutto da capo' })).toBeInTheDocument();
    expect(screen.getByText('Le 15 già verificate non vengono rifatte.')).toBeInTheDocument();
  });
  test('only the rows changed after the verification: the button says «Aggiorna le N righe modificate»', () => {
    const reviews = { ...verified(10, 10), '2': ok({ rowId: '2', v: 99 }), '5': ok({ rowId: '5', v: 99 }) };
    show(statusOf(10, reviews));
    expect(screen.getByRole('button', { name: 'Aggiorna le 2 righe modificate' })).toBeInTheDocument();
    expect(screen.getByText(/2 modificate dopo la verifica/)).toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent('8 di 10 righe verificate');
  });
  test('a single changed row uses the singular', () => {
    show(statusOf(5, { ...verified(5, 5), '1': ok({ rowId: '1', v: 99 }) }));
    expect(screen.getByRole('button', { name: 'Aggiorna la riga modificata' })).toBeInTheDocument();
  });
  test('rows that failed and rows never verified are both counted and named', () => {
    const reviews = { ...verified(10, 6), '6': { rowId: '6', status: 'error', reason: 'x', signature: sig({ rowId: '6', v: 1 }) } };
    show(statusOf(10, reviews));
    expect(screen.getByText('Mancano 4: 1 non riuscita, 3 mai verificate.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riprendi la verifica (4 righe)' })).toBeInTheDocument();
  });
  test('all verified: green, 100%, «Tutte le N righe sono verificate», and only the secondary «Rifai la verifica»', () => {
    const { container } = show(statusOf(8, verified(8, 8)));
    expect(screen.getByRole('heading')).toHaveTextContent('Tutte le 8 righe sono verificate');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    const button = screen.getByRole('button', { name: 'Rifai la verifica' });
    expect(button).not.toHaveClass('rl-btn-primary');
    expect(container.firstChild).toHaveClass('rl-ok');
    expect(screen.queryByRole('button', { name: /Riprendi|Aggiorna/ })).toBeNull();
  });
  test('«Tutte … verificate» is NEVER said while one row is missing', () => {
    show(statusOf(8, verified(8, 7)));
    expect(screen.getByRole('heading')).not.toHaveTextContent('Tutte');
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '100');
  });
  test('no rows: nothing to start', () => {
    show(statusOf(0, {}));
    expect(screen.getByRole('heading')).toHaveTextContent('Nessuna riga da verificare');
    expect(screen.queryByRole('button')).toBeNull();
  });
  test('while working the button is disabled and the card says the AI is working', () => {
    show(statusOf(45, verified(45, 15)), { busy: true });
    expect(screen.getByRole('heading')).toHaveTextContent('L’AI sta verificando le righe');
    expect(screen.getByRole('button', { name: 'Verifica in corso…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Verifica tutto da capo' })).toBeNull();
  });
});
describe('what the buttons ask for', () => {
  test('«Verifica con l’AI» and «Riprendi» do NOT force; «Rifai la verifica» and «da capo» DO', () => {
    const onStart = jest.fn(), onRestart = jest.fn();
    const a = show(statusOf(10, {}), { onStart, onRestart }); fireEvent.click(screen.getByRole('button', { name: 'Verifica con l’AI' })); expect(onStart).toHaveBeenLastCalledWith({ force: false }); a.unmount();
    const b = show(statusOf(10, verified(10, 4)), { onStart, onRestart }); fireEvent.click(screen.getByRole('button', { name: 'Riprendi la verifica (6 righe)' })); expect(onStart).toHaveBeenLastCalledWith({ force: false });
    fireEvent.click(screen.getByRole('button', { name: 'Verifica tutto da capo' })); expect(onRestart).toHaveBeenCalledTimes(1); b.unmount();
    show(statusOf(10, verified(10, 10)), { onStart, onRestart }); fireEvent.click(screen.getByRole('button', { name: 'Rifai la verifica' })); expect(onStart).toHaveBeenLastCalledWith({ force: true });
  });
});
test('the card always repeats that the judgement must be confirmed by the analyst', () => { show(statusOf(3, {})); expect(screen.getByText(/Giudizio AI da confermare dall’analista/)).toBeInTheDocument(); });
test('the brain of the card shows the REAL percentage', () => {
  show(statusOf(45, verified(45, 15)));
  expect(within(screen.getByRole('region')).getByRole('img', { name: 'Righe verificate: 33%' })).toBeInTheDocument();
});
test('launcherCopy never throws on an empty status', () => { expect(() => launcherCopy({ total: 0 }, false)).not.toThrow(); expect(launcherCopy({ total: 0 }, true).tone).toBe('busy'); });

test('every row was verified but ALL changed afterwards: it is not a first run — it says «da aggiornare» and why', () => {
  show(statusOf(4, Object.fromEntries(rows(4).map(r => [r.rowId, ok({ ...r, v: 99 })]))));
  expect(screen.getByRole('heading')).toHaveTextContent('4 righe da aggiornare');
  expect(screen.getByText(/Erano già verificate, ma i dati sono cambiati dopo/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Aggiorna tutte le 4 righe' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Verifica con l’AI' })).toBeNull();
});
test('a single row that changed says «la riga»', () => {
  show(statusOf(1, { '0': ok({ rowId: '0', v: 99 }) }));
  expect(screen.getByRole('button', { name: 'Aggiorna la riga' })).toBeInTheDocument(); expect(screen.getByRole('heading')).toHaveTextContent('1 riga da aggiornare');
});
