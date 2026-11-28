import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkflowButton from './WorkflowButton';
import { configuratorFlow } from './workflowModel';

const flow = configuratorFlow({ code: '146023', systemChosen: true, catalogReady: true, confirmedRationales: 2 });
const open = (props = {}) => { const onGo = jest.fn(); render(<WorkflowButton flow={flow} title="Come preparare" subtitle="Sotto" onGo={onGo} {...props} />); return onGo; };
const dialog = () => screen.getByRole('dialog');

test('the button shows the progress and the next step WITHOUT opening anything', () => {
  open(); const button = screen.getByRole('button', { name: /Percorso passo dopo passo/ });
  expect(button).toHaveTextContent('Prossimo: Fatti proporre gli interventi'); expect(button).toHaveTextContent(`${flow.percent}%`); expect(screen.queryByRole('dialog')).toBeNull();
});
test('it opens a modal dialog with a title, a progress bar with the right value and every step as a list item', () => {
  open(); fireEvent.click(screen.getByRole('button', { name: /Percorso passo dopo passo/ }));
  expect(dialog()).toHaveAttribute('aria-modal', 'true'); expect(within(dialog()).getByRole('heading', { name: 'Come preparare' })).toBeInTheDocument();
  expect(within(dialog()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(flow.percent)); expect(within(dialog()).getAllByRole('listitem')).toHaveLength(8);
});
test('the next step is marked with aria-current and is the only one', () => {
  open(); fireEvent.click(screen.getByRole('button', { name: /Percorso/ }));
  const current = dialog().querySelectorAll('[aria-current="step"]'); expect(current).toHaveLength(1); expect(current[0]).toHaveTextContent('Fatti proporre gli interventi');
});
test('every step shows its state in words, not only with a colour', () => {
  open(); fireEvent.click(screen.getByRole('button', { name: /Percorso/ }));
  ['Fatto', 'Prossimo passo', 'Facoltativo', 'In attesa'].forEach(label => expect(within(dialog()).getAllByText(label).length).toBeGreaterThan(0));
});
test('«Vai qui» on the next step closes the dialog and hands the step to the page', () => {
  const onGo = open(); fireEvent.click(screen.getByRole('button', { name: /Percorso/ }));
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Vai qui →' })); expect(onGo).toHaveBeenCalledTimes(1); expect(onGo.mock.calls[0][0].id).toBe('interventions'); expect(screen.queryByRole('dialog')).toBeNull();
});
test('a step that is waiting offers «Apri questo passo» (not the primary «Vai qui») and says what is needed first', () => {
  open(); fireEvent.click(screen.getByRole('button', { name: /Percorso/ }));
  expect(within(dialog()).getAllByText(/Prima:/).length).toBeGreaterThan(0); expect(dialog()).toHaveTextContent('conferma almeno un intervento'); expect(within(dialog()).getAllByRole('button', { name: 'Apri questo passo' }).length).toBeGreaterThan(0); expect(within(dialog()).getAllByRole('button', { name: 'Vai qui →' })).toHaveLength(1);
});
test('a done step can be reviewed', () => { const onGo = open(); fireEvent.click(screen.getByRole('button', { name: /Percorso/ })); fireEvent.click(within(dialog()).getAllByRole('button', { name: 'Rivedi' })[0]); expect(onGo.mock.calls[0][0].id).toBe('identify'); });
test('without permission to edit there are no «go» buttons, but the path is still readable', () => {
  open({ canGo: false }); fireEvent.click(screen.getByRole('button', { name: /Percorso/ })); expect(within(dialog()).queryByRole('button', { name: /Vai qui|Apri questo passo|Rivedi/ })).toBeNull(); expect(within(dialog()).getAllByRole('listitem')).toHaveLength(8);
});
test('Escape and ✕ close it, and the focus goes back to the button that opened it', () => {
  open(); const trigger = screen.getByRole('button', { name: /Percorso/ }); trigger.focus(); fireEvent.click(trigger); expect(within(dialog()).getByRole('button', { name: 'Chiudi il percorso' })).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(trigger).toHaveFocus();
  fireEvent.click(trigger); fireEvent.click(within(dialog()).getByRole('button', { name: 'Chiudi il percorso' })); expect(screen.queryByRole('dialog')).toBeNull();
});
test('Tab does not leave the dialog (it wraps from the last button to the first)', () => {
  open(); fireEvent.click(screen.getByRole('button', { name: /Percorso/ })); const buttons = within(dialog()).getAllByRole('button'); buttons[buttons.length - 1].focus();
  fireEvent.keyDown(document, { key: 'Tab' }); expect(buttons[0]).toHaveFocus(); buttons[0].focus(); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(buttons[buttons.length - 1]).toHaveFocus();
});
test('the page behind does not scroll while it is open, and scrolls again after', () => {
  open(); fireEvent.click(screen.getByRole('button', { name: /Percorso/ })); expect(document.body.style.overflow).toBe('hidden'); fireEvent.keyDown(document, { key: 'Escape' }); expect(document.body.style.overflow).not.toBe('hidden');
});
test('a click on the dark background closes it, a click inside does not', () => {
  open(); fireEvent.click(screen.getByRole('button', { name: /Percorso/ })); fireEvent.mouseDown(dialog()); expect(screen.getByRole('dialog')).toBeInTheDocument(); fireEvent.mouseDown(dialog().parentElement); expect(screen.queryByRole('dialog')).toBeNull();
});
test('when everything is done the dialog says so and still names the last step', () => {
  const done = configuratorFlow({ code: '1', systemChosen: true, catalogReady: true, confirmedRationales: 1, interventionsConfirmed: 1, offerItems: 1, offerVisited: true, saved: true });
  open({ flow: done }); expect(screen.getByRole('button', { name: /Percorso/ })).toHaveTextContent('Tutto fatto'); fireEvent.click(screen.getByRole('button', { name: /Percorso/ }));
  expect(dialog()).toHaveTextContent('Tutti i passi obbligatori sono fatti'); expect(dialog()).toHaveTextContent('Ultimo passo: Passa a Sviluppo');
});
