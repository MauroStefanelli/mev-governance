import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContractRepairDialog from './ContractRepairDialog';
import { repairContractLinks } from '../../services/mevService';
import { orphanHeadline, orphanInitiatives, suggestedRepairTarget } from '../../configuratore/contractMergeModel';
jest.mock('../../services/mevService', () => ({ repairContractLinks: jest.fn() }));

const cat = n => Array.from({ length: n }, (_, i) => ({ id: i }));
const tet = { contractId: 'tet', name: 'Poste Italiane – Tracciatura e Logistica Integrata', builtin: true, lots: [{ lotId: '2', active: true, towPrices: { a: 1, b: 2, c: 3, d: 4, e: 5 }, catalog: cat(27) }] };
const other = { contractId: 'altro', name: 'Altro contratto', lots: [{ lotId: '1', active: true, towPrices: {}, catalog: cat(2) }] };
const empty = { contractId: 'vuoto', name: 'Senza lotti attivi', lots: [{ lotId: '1', active: false, towPrices: {}, catalog: [] }] };
const orphans = [{ missingContractId: 'accordo-quadro', lot: '2', revisions: 6, evaluations: 2, goto: ['145480', '146023'] }];
const okPlan = { toContractId: 'tet', toName: tet.name, canRepair: true, blockers: [], orphans, revisions: 6, evaluations: 2 };

beforeEach(() => {
  repairContractLinks.mockReset().mockImplementation(async (to, { preview } = {}) => preview ? okPlan : { message: 'Collegamenti ripristinati.', toContractId: to, revisions: 6, evaluations: 2 });
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); }); HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});
const open = (props = {}) => { const onClose = jest.fn(); const onDone = jest.fn(); render(<ContractRepairDialog orphans={orphans} contracts={[other, tet, empty]} onClose={onClose} onDone={onDone} {...props} />); return { onClose, onDone, dialog: screen.getByRole('dialog', { hidden: true }) }; };

describe('model', () => {
  test('the headline counts revisions and evaluations with the right singular and plural, and says nothing when nothing is broken', () => {
    expect(orphanHeadline(orphans)).toBe('6 revisioni e 2 valutazioni salvate fanno riferimento a un contratto che non esiste più e non si possono aprire.');
    expect(orphanHeadline([{ revisions: 1, evaluations: 0 }])).toMatch(/^1 revisione fanno/);
    expect(orphanHeadline([{ revisions: 0, evaluations: 1 }])).toMatch(/^1 valutazione salvata/);
    expect(orphanHeadline([])).toBe(''); expect(orphanHeadline(undefined)).toBe(''); expect(orphanHeadline([{ revisions: 0, evaluations: 0 }])).toBe('');
  });
  test('the affected initiatives are listed once and sorted', () => {
    expect(orphanInitiatives([{ goto: ['146023', '145480'] }, { goto: ['145480'] }, {}])).toEqual(['145480', '146023']);
  });
  test('the contract proposed as target is the one with the prices, and contracts with no active lot are never proposed', () => {
    expect(suggestedRepairTarget([other, tet])).toBe('tet'); expect(suggestedRepairTarget([tet, other])).toBe('tet'); expect(suggestedRepairTarget([empty])).toBe(''); expect(suggestedRepairTarget([])).toBe('');
  });
});

test('the dialog explains the damage in numbers, names the initiatives and promises not to touch the content of the revisions', async () => {
  const { dialog } = open();
  expect(dialog).toHaveTextContent('6 revisioni e 2 valutazioni salvate fanno riferimento a un contratto che non esiste più'); expect(dialog).toHaveTextContent('Iniziative coinvolte: 145480, 146023');
  expect(dialog).toHaveTextContent('cambia solo il contratto da cui prende il catalogo'); await within(dialog).findByLabelText('Cosa succede');
});
test('the complete contract is proposed, contracts without an active lot are not offered, and the system contract is marked', async () => {
  const { dialog } = open(); const select = within(dialog).getByLabelText('Il contratto da cui prendere il catalogo');
  expect(select).toHaveValue('tet'); expect([...select.options].map(o => o.value)).toEqual(['altro', 'tet']); expect(select.options[1].textContent).toMatch(/\(contratto di sistema\)/); await within(dialog).findByLabelText('Cosa succede');
});
test('the preview is asked for first and nothing is repaired until the user confirms', async () => {
  const { dialog } = open(); const plan = await within(dialog).findByLabelText('Cosa succede');
  expect(repairContractLinks).toHaveBeenCalledTimes(1); expect(repairContractLinks).toHaveBeenCalledWith('tet', { preview: true });
  expect(plan).toHaveTextContent('8 elementi verranno ricollegati a «Poste Italiane – Tracciatura e Logistica Integrata»'); expect(plan).toHaveTextContent('Decisioni, documenti e stima restano come sono');
  expect(within(dialog).getByRole('button', { name: 'Ricollega' })).toBeDisabled();
});
test('choosing another contract asks for a new preview with that contract', async () => {
  const { dialog } = open(); await within(dialog).findByLabelText('Cosa succede');
  fireEvent.change(within(dialog).getByLabelText('Il contratto da cui prendere il catalogo'), { target: { value: 'altro' } });
  await waitFor(() => expect(repairContractLinks).toHaveBeenCalledWith('altro', { preview: true }));
});
test('after ticking the confirmation, "Ricollega" sends the real request and reports the numbers', async () => {
  const { dialog, onDone } = open(); await within(dialog).findByLabelText('Cosa succede');
  fireEvent.click(within(dialog).getByLabelText(/Ho letto cosa succede/)); fireEvent.click(within(dialog).getByRole('button', { name: 'Ricollega' }));
  await waitFor(() => expect(onDone).toHaveBeenCalled()); expect(repairContractLinks).toHaveBeenLastCalledWith('tet'); expect(onDone.mock.calls[0][0]).toMatchObject({ revisions: 6, evaluations: 2 });
});
test('a lot the chosen contract does not have blocks the repair and the reason is shown', async () => {
  repairContractLinks.mockImplementation(async (to, o) => (o?.preview ? { canRepair: false, toName: 'Altro contratto', blockers: ['Il lotto 2 non esiste nel contratto «Altro contratto»: 8 elementi che usavano «accordo-quadro» non si possono ricollegare senza indovinare.'], orphans, revisions: 0, evaluations: 0 } : {}));
  const { dialog } = open(); const plan = await within(dialog).findByLabelText('Cosa succede');
  expect(plan).toHaveTextContent('Non si può ricollegare a questo contratto'); expect(plan).toHaveTextContent('Il lotto 2 non esiste'); expect(within(dialog).queryByLabelText(/Ho letto cosa succede/)).not.toBeInTheDocument(); expect(within(dialog).getByRole('button', { name: 'Ricollega' })).toBeDisabled();
});
test('a server error at confirmation stays in the dialog and nothing is reported as done', async () => {
  const { dialog, onDone, onClose } = open(); await within(dialog).findByLabelText('Cosa succede');
  repairContractLinks.mockImplementationOnce(async () => { throw new Error('Dopo la riparazione restano collegamenti rotti: non è stato modificato nulla.'); });
  fireEvent.click(within(dialog).getByLabelText(/Ho letto cosa succede/)); fireEvent.click(within(dialog).getByRole('button', { name: 'Ricollega' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('non è stato modificato nulla'); expect(onDone).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled(); expect(within(dialog).getByRole('button', { name: 'Ricollega' })).toBeEnabled();
});
test('an error while preparing the preview is shown and leaves the repair button off', async () => {
  repairContractLinks.mockImplementation(async () => { throw new Error('Il backend non espone ancora la riparazione dei collegamenti: aggiorna il backend DEV.'); });
  const { dialog } = open(); expect(await within(dialog).findByRole('alert')).toHaveTextContent('aggiorna il backend DEV'); expect(within(dialog).getByRole('button', { name: 'Ricollega' })).toBeDisabled();
});
test('with no contract to reconnect to, the dialog says so and offers no way to repair', () => {
  const { dialog } = open({ contracts: [empty] }); expect(within(dialog).getByRole('alert')).toHaveTextContent('Non c’è nessun contratto con un lotto attivo'); expect(within(dialog).queryByRole('button', { name: 'Ricollega' })).not.toBeInTheDocument(); expect(repairContractLinks).not.toHaveBeenCalled();
});
test('while the repair runs nothing can be closed or repeated, and Esc does not close it', async () => {
  let release; repairContractLinks.mockImplementation((to, o) => (o?.preview ? Promise.resolve(okPlan) : new Promise(resolve => { release = resolve; })));
  const { dialog, onClose } = open(); await within(dialog).findByLabelText('Cosa succede');
  fireEvent.click(within(dialog).getByLabelText(/Ho letto cosa succede/)); fireEvent.click(within(dialog).getByRole('button', { name: 'Ricollega' }));
  expect(await within(dialog).findByRole('button', { name: 'Ricollegamento in corso…' })).toBeDisabled(); expect(within(dialog).getByRole('button', { name: 'Annulla' })).toBeDisabled(); expect(within(dialog).getByRole('button', { name: 'Chiudi' })).toBeDisabled();
  const cancel = new Event('cancel', { cancelable: true }); dialog.dispatchEvent(cancel); expect(cancel.defaultPrevented).toBe(true); expect(onClose).not.toHaveBeenCalled();
  expect(repairContractLinks.mock.calls.filter(c => !c[1]?.preview)).toHaveLength(1); release({ message: 'ok', revisions: 0, evaluations: 0 });
});
