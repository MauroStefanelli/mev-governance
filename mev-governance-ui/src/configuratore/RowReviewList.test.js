import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import RowReviewList from './RowReviewList';
import { detailReviewInput, detailReviewSignature } from './offerDetailReview';

const catalog = [{ id: 239, nome: 'Servizio/API', prezzi: { MODIFICA: { Medio: 400 } } }, { id: 242, nome: 'Stored procedure', prezzi: { MODIFICA: { Medio: 100 } } }];
const mk = (n, over = {}) => ({ key: `row-${n}`, id: n % 2 ? 239 : 242, imported: true, interventionId: n <= 3 ? 'INT-A' : 'INT-B', type: 'MODIFICA', complexity: 'Medio', qty: 1, unit: 360, original: { unit: 360, catalogId: 239 }, detail: { detailDescription: `Attività numero ${n}`, componentApplication: `comp-${n}` }, ...over });
const items = [1, 2, 3, 4, 5].map(n => mk(n));
const lines = items.map((item, index) => ({ item, index, price: 400, original: item.original, difference: 40 }));
const review = (item, index, status, reason, over = {}) => ({ [detailReviewInput(item, catalog, [], 'c', '2', index).rowId]: { status, reason, signature: detailReviewSignature(detailReviewInput(item, catalog, [], 'c', '2', index)), ...over } });
const reviews = { ...review(items[0], 0, 'coerente', 'Va bene così'), ...review(items[1], 1, 'non_coerente', 'La voce non c’entra con l’attività'), ...review(items[2], 2, 'da_verificare', 'Mancano i criteri', { suggestion: 'Chiedi a Poste' }) };
const props = { lines, catalog, interventions: [], contractId: 'c', lot: '2', reviews, rationale: [], showEconomics: false };
const rowsShown = () => [...document.querySelectorAll('button.rrl-row')];
const open = index => { fireEvent.click(rowsShown()[index]); return screen.getByRole('dialog'); };

test('it is a LIST: one row per activity with the outcome, a short description and a line of the AI — not a wide table', () => {
  render(<RowReviewList {...props} />);
  expect(screen.queryByRole('table')).toBeNull(); expect(rowsShown()).toHaveLength(5);
  const first = rowsShown()[0]; expect(first).toHaveTextContent('Incoerenza'); expect(first).toHaveTextContent('Attività numero 2'); expect(first).toHaveTextContent('La voce non c’entra con l’attività');
  expect(document.querySelectorAll('.rrl-badge-none')).toHaveLength(2); expect(rowsShown()[2]).toHaveTextContent('Nessun esito: avvia la verifica');
});
test('the rows to look at come first; the checkbox puts them back in the order of the file', () => {
  render(<RowReviewList {...props} />);
  expect(rowsShown().map(b => b.className.replace('rrl-row', '').trim().replace('rrl-', ''))).toEqual(['non_coerente', 'da_verificare', 'none', 'none', 'coerente']);      // the coherent one goes last
  fireEvent.click(screen.getByRole('checkbox', { name: /Prima quelle da guardare/ })); expect(rowsShown()[0]).toHaveTextContent('Attività numero 1');
});
test('the filters narrow the list and show how many rows each has', () => {
  render(<RowReviewList {...props} />);
  const group = screen.getByRole('group', { name: 'Filtra le righe per esito' }); expect(within(group).getByRole('button', { name: /Tutte 5/ })).toBeInTheDocument(); expect(within(group).getByRole('button', { name: /Da guardare 2/ })).toBeInTheDocument();
  fireEvent.click(within(group).getByRole('button', { name: /Incoerenti 1/ })); expect(rowsShown()).toHaveLength(1); expect(rowsShown()[0]).toHaveTextContent('Attività numero 2');
  fireEvent.click(within(group).getByRole('button', { name: /Coerenti 1/ })); expect(rowsShown()[0]).toHaveTextContent('Attività numero 1');
});
test('a click opens the detail in a window; Escape, the cross and the backdrop close it, and the focus goes back to the row', () => {
  render(<RowReviewList {...props} />);
  const row = rowsShown()[0]; row.focus(); open(0); expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(row).toHaveFocus();
  open(0); fireEvent.click(screen.getByRole('button', { name: 'Chiudi il dettaglio' })); expect(screen.queryByRole('dialog')).toBeNull();
  open(0); fireEvent.mouseDown(document.querySelector('.rrd-backdrop')); expect(screen.queryByRole('dialog')).toBeNull();
});
test('the detail has the three columns: «Intervento / attività» and «Voce catalogo» FIXED on the left, «Verifica AI attività / catalogo» alone on the right', () => {
  render(<RowReviewList {...props} />); const dialog = open(0);
  const fixed = dialog.querySelector('.rrd-fixed'); const ai = within(dialog).getByRole('region', { name: 'Verifica AI attività / catalogo' });
  expect(within(fixed).getByRole('region', { name: 'Intervento / attività' })).toBeInTheDocument(); expect(within(fixed).getByRole('region', { name: 'Voce catalogo' })).toBeInTheDocument();
  expect(fixed.contains(ai)).toBe(false);                                                // the AI column is NOT inside the fixed part: it is the only one that scrolls
  expect(ai).toHaveAttribute('tabindex', '0');                                           // reachable and scrollable from the keyboard
  expect(ai).toHaveTextContent('La voce non c’entra con l’attività'); expect(within(fixed).getByRole('region', { name: 'Intervento / attività' })).toHaveTextContent('comp-2'); expect(within(fixed).getByRole('region', { name: 'Voce catalogo' })).toHaveTextContent('Servizio/API'.replace('Servizio/API', 'Stored procedure'));
});
test('the detail of a row shows the price columns only when «Mostra dettagli e importi» is on', () => {
  const view = render(<RowReviewList {...props} />); expect(open(0)).not.toHaveTextContent('Prezzo catalogo'); fireEvent.click(screen.getByRole('button', { name: 'Chiudi il dettaglio' }));
  view.rerender(<RowReviewList {...props} showEconomics />); const dialog = open(0); expect(dialog).toHaveTextContent('Prezzo Excel'); expect(dialog).toHaveTextContent('400,00 €'); expect(dialog).toHaveTextContent('40,00 €');
});
test('previous and next move through the rows in the order of the list, and stop at the ends', () => {
  render(<RowReviewList {...props} />); open(0);
  expect(screen.getByText('Riga 1 di 5')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Riga precedente' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Riga successiva' })); expect(screen.getByText('Riga 2 di 5')).toBeInTheDocument(); expect(screen.getByRole('dialog')).toHaveTextContent('Mancano i criteri');
  fireEvent.click(screen.getByRole('button', { name: 'Riga precedente' })); expect(screen.getByRole('dialog')).toHaveTextContent('La voce non c’entra con l’attività');
  for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Riga successiva' })); expect(screen.getByText('Riga 5 di 5')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Riga successiva' })).toBeDisabled();
});
test('the detail follows the filter: next and previous stay inside the filtered rows', () => {
  render(<RowReviewList {...props} />); fireEvent.click(screen.getByRole('button', { name: /Da guardare 2/ })); open(0);
  expect(screen.getByText('Riga 1 di 2')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Riga successiva' })); expect(screen.getByText('Riga 2 di 2')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Riga successiva' })).toBeDisabled();
});
test('the Tab key stays inside the window (the page behind is not reachable)', () => {
  render(<RowReviewList {...props} />); const dialog = open(0);
  const focusable = [...dialog.querySelectorAll('button:not([disabled]), [tabindex="0"], input, select, textarea')]; const last = focusable[focusable.length - 1]; last.focus();
  fireEvent.keyDown(document, { key: 'Tab' }); expect(focusable[0]).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
});
test('the page behind does not scroll while the window is open, and does again after', () => {
  render(<RowReviewList {...props} />); open(0); expect(document.body.style.overflow).toBe('hidden'); fireEvent.click(screen.getByRole('button', { name: 'Chiudi il dettaglio' })); expect(document.body.style.overflow).not.toBe('hidden');
});
test('the redo button of the intervention is in the detail, closes it and asks for THAT intervention', () => {
  const onReviewIntervention = jest.fn(); render(<RowReviewList {...props} onReviewIntervention={onReviewIntervention} />); open(0);
  fireEvent.click(screen.getByRole('button', { name: /Rifai la verifica dell’intervento INT-A/ })); expect(onReviewIntervention).toHaveBeenCalledWith('INT-A'); expect(screen.queryByRole('dialog')).toBeNull();
});
test('the rationale area is in the detail only when the page can manage rationales', () => {
  const onAddRationale = jest.fn(); const view = render(<RowReviewList {...props} />); open(0); expect(screen.queryByText('Razionali che l’AI legge per questa riga')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Chiudi il dettaglio' }));
  view.rerender(<RowReviewList {...props} onAddRationale={onAddRationale} />); open(0); expect(screen.getByText('Razionali che l’AI legge per questa riga')).toBeInTheDocument();
});
test('a row without judgement says so in the detail, and «Analisi in corso» while the AI works', () => {
  const view = render(<RowReviewList {...props} />); open(3); expect(screen.getByRole('dialog')).toHaveTextContent('Verifica da eseguire'); fireEvent.click(screen.getByRole('button', { name: 'Chiudi il dettaglio' }));
  view.rerender(<RowReviewList {...props} reviewBusy />); open(3); expect(screen.getByRole('dialog')).toHaveTextContent('Analisi in corso');
});
test('the window closes by itself when its row disappears', () => {
  const view = render(<RowReviewList {...props} />); open(0); view.rerender(<RowReviewList {...props} lines={[]} />); expect(screen.queryByRole('dialog')).toBeNull();
});

// ---- «Usa catalogo» is gone, and the two left columns stay still. jsdom does not apply CSS, so the layout rules are checked in the stylesheet itself.
describe('what was asked, written in the code', () => {
  const fs = require('fs'); const path = require('path');
  const css = fs.readFileSync(path.join(__dirname, 'rowReviewList.css'), 'utf8');
  const rule = selector => { const m = new RegExp('(^|\\n|\\})\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css); return m ? m[2] : ''; };
  test('there is no «Usa catalogo» button, nor an «Azione» column, anywhere in the list and in the detail', () => {
    render(<RowReviewList {...props} showEconomics />); expect(screen.queryByRole('button', { name: /Usa catalogo|Applica prezzo/ })).toBeNull(); open(0);
    expect(screen.queryByRole('button', { name: /Usa catalogo|Applica prezzo/ })).toBeNull(); expect(screen.queryByText('Azione')).toBeNull(); expect(screen.queryByRole('columnheader')).toBeNull();
    ['RowReviewList.js', 'OfferPriceComparison.js'].forEach(file => expect(fs.readFileSync(path.join(__dirname, file), 'utf8')).not.toMatch(/Usa catalogo|Applica prezzo catalogo/));
  });
  test('the body is a grid with the fixed part on the left and the AI on the right', () => { expect(rule('.rrd-body')).toMatch(/display:\s*grid/); expect(rule('.rrd-body')).toMatch(/grid-template-columns/); expect(rule('.rrd-body')).toMatch(/min-height:\s*0/); });
  test('the AI column scrolls by itself, and the window never scrolls as a whole', () => {
    expect(rule('.rrd-ai')).toMatch(/overflow-y:\s*auto/); expect(rule('.rrd-ai')).toMatch(/min-height:\s*0/); expect(rule('.rrd')).toMatch(/overflow:\s*hidden/); expect(rule('.rrd')).toMatch(/display:\s*flex/); expect(rule('.rrd')).toMatch(/flex-direction:\s*column/);
    expect(rule('.rrd-body')).not.toMatch(/overflow-y:\s*auto|overflow:\s*auto|overflow-y:\s*scroll/);       // the body does not scroll: otherwise the two left columns would move with the AI
  });
  test('the two left columns are one fixed block that does not move when the AI column scrolls: it scrolls only on its own if it is taller than the screen', () => { expect(rule('.rrd-fixed')).toMatch(/overflow-y:\s*auto/); expect(rule('.rrd-fixed')).toMatch(/min-height:\s*0/); });
  test('on a phone everything becomes one column that scrolls together (two scrolling panes in a narrow screen would be unusable)', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 760px)')); expect(phone).toMatch(/\.rrd-body \{ display: block; overflow-y: auto; \}/); expect(phone).toMatch(/\.rrd-ai \{ overflow: visible; \}/);
  });
  test('the window fits the screen: it is never taller than the viewport', () => { expect(rule('.rrd')).toMatch(/height:\s*min\(\d+px,\s*calc\(100vh/); });
});
