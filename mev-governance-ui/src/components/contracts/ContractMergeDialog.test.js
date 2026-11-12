import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContractMergeDialog from './ContractMergeDialog';
import { mergeConfiguratoreContracts } from '../../services/mevService';
jest.mock('../../services/mevService', () => ({ mergeConfiguratoreContracts: jest.fn() }));

const cat = n => Array.from({ length: n }, (_, i) => ({ id: i }));
const keep = { contractId: 'tet', name: 'Tracciatura e Logistica Integrata', lots: [{ lotId: '2', active: true, towPrices: { a: 1, b: 2, c: 3, d: 4, e: 5 }, catalog: cat(27), priceFile: 'Listino.pdf' }] };
const drop = { contractId: 'aq', name: 'Accordo Quadro per la fornitura di Servizi Professionali', lots: [{ lotId: '2', active: true, towPrices: {}, catalog: cat(27), priceFile: '(importato da gara x)' }] };
const builtin = { contractId: 'poste-tet-2025', name: 'Poste TeT (built-in)', builtin: true, lots: [] };
const nothingToMove = { fromContractId: 'aq', toContractId: 'tet', canRemove: true, lots: [{ lotId: '2', action: 'nessuna', reason: 'Il lotto di destinazione ha già tutto: non cambia.', fromPrices: 0, toPrices: 5, fromCatalog: 27, toCatalog: 27 }], sharedApplications: [], references: [], blockers: [], notes: [] };
const withChanges = { ...nothingToMove, lots: [{ lotId: '2', action: 'completa', reason: 'Completa solo ciò che manca: listino TOW (5 prezzi).' }], sharedApplications: [{ lotKey: '2', action: 'completa', fromApps: 3, toApps: 1, added: 2 }], references: [{ recordKey: 'k', title: '145480 · Prova', entityType: 'initiative_evaluation', field: 'catalogSource.contractId' }] };

beforeEach(() => {
  mergeConfiguratoreContracts.mockReset().mockImplementation(async (from, to, { preview } = {}) => preview ? nothingToMove : { message: 'Dati spostati ed eliminato il contratto.', fromContractId: from, toContractId: to, repointed: 0 });
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); }); HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});
const open = (props = {}) => { const onClose = jest.fn(); const onDone = jest.fn(); render(<ContractMergeDialog contract={drop} contracts={[keep, drop, builtin]} onClose={onClose} onDone={onDone} {...props} />); return { onClose, onDone, dialog: screen.getByRole('dialog', { hidden: true }) }; };

test('the dialog names the contract being deleted, says nothing changes until confirmed, and warns that it is incomplete', async () => {
  const { dialog } = open();
  expect(within(dialog).getByRole('heading', { name: /Elimina «Accordo Quadro/ })).toBeInTheDocument(); expect(dialog).toHaveTextContent('Nulla cambia finché non confermi');
  expect(dialog).toHaveTextContent(/Questo contratto è incompleto: Lotto 2: nessun prezzo TOW/);
  await within(dialog).findByLabelText('Cosa succede');
});
test('the contract to keep defaults to the complete one; the system contract is offered too, clearly marked, but never ahead of a complete contract', async () => {
  const { dialog } = open(); const select = within(dialog).getByLabelText('Il contratto che resta');
  expect(select).toHaveValue('tet'); expect([...select.options].map(o => o.textContent)).toEqual(['Tracciatura e Logistica Integrata', 'Poste TeT (built-in) (contratto di sistema)']); await within(dialog).findByLabelText('Cosa succede');
});
test('when the only other contract is the system one it is offered as destination instead of leaving the user stuck', async () => {
  const completeSystem = { contractId: 'poste-tet-2025', name: 'Poste Italiane – Tracciatura e Logistica Integrata', builtin: true, lots: keep.lots };
  const { dialog } = open({ contracts: [drop, completeSystem] });
  const select = within(dialog).getByLabelText('Il contratto che resta'); expect(select).toHaveValue('poste-tet-2025'); expect(select.options[0].textContent).toMatch(/\(contratto di sistema\)/);
  expect(within(dialog).queryByText(/Non c’è un altro contratto/)).not.toBeInTheDocument(); await within(dialog).findByLabelText('Cosa succede');
  expect(mergeConfiguratoreContracts).toHaveBeenCalledWith('aq', 'poste-tet-2025', { preview: true });
});
test('the preview is asked for first, with the preview flag, and nothing is written', async () => {
  const { dialog } = open(); await within(dialog).findByLabelText('Cosa succede');
  expect(mergeConfiguratoreContracts).toHaveBeenCalledTimes(1); expect(mergeConfiguratoreContracts).toHaveBeenCalledWith('aq', 'tet', { preview: true });
});
test('with nothing to move the button says so; the delete button stays off until the user ticks the confirmation', async () => {
  const { dialog } = open(); const plan = await within(dialog).findByLabelText('Cosa succede');
  expect(plan).toHaveTextContent('Non c’è nulla da spostare'); const button = within(dialog).getByRole('button', { name: 'Elimina il contratto' });
  expect(button).toBeDisabled(); fireEvent.click(within(dialog).getByLabelText(/Ho letto cosa succede/)); expect(button).toBeEnabled();
});
test('what would move is listed line by line, and the evaluations that will be relinked are named', async () => {
  mergeConfiguratoreContracts.mockImplementation(async (f, t, o) => (o?.preview ? withChanges : {}));
  const { dialog } = open(); const plan = await within(dialog).findByLabelText('Cosa succede');
  expect(plan).toHaveTextContent('3 elementi verranno spostati'); expect(plan).toHaveTextContent('listino TOW (5 prezzi)'); expect(plan).toHaveTextContent('2 applicativi mancanti vengono aggiunti'); expect(plan).toHaveTextContent('145480 · Prova');
  expect(within(dialog).getByRole('button', { name: 'Sposta i dati ed elimina il contratto' })).toBeDisabled();
});
test('confirming sends the real request (without the preview flag) and reports the result to the page', async () => {
  const { dialog, onDone } = open(); await within(dialog).findByLabelText('Cosa succede');
  fireEvent.click(within(dialog).getByLabelText(/Ho letto cosa succede/)); fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina il contratto' }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(mergeConfiguratoreContracts).toHaveBeenLastCalledWith('aq', 'tet'); expect(onDone.mock.calls[0][0]).toMatchObject({ fromContractId: 'aq', toContractId: 'tet' });
});
test('a blocked plan shows the reasons and offers no way to delete', async () => {
  mergeConfiguratoreContracts.mockImplementation(async (f, t, o) => (o?.preview ? { canRemove: false, blockers: ['Il record «Release 1» (release_calendar) è salvato sotto il contratto da eliminare: spostarlo a mano o eliminarlo prima.'], lots: [], sharedApplications: [], references: [] } : {}));
  const { dialog } = open(); const plan = await within(dialog).findByLabelText('Cosa succede');
  expect(plan).toHaveTextContent('Non si può eliminare questo contratto'); expect(plan).toHaveTextContent('Release 1');
  expect(within(dialog).getByRole('button', { name: /Elimina il contratto|Sposta i dati/ })).toBeDisabled(); expect(within(dialog).queryByLabelText(/Ho letto cosa succede/)).not.toBeInTheDocument();
});
test('a server error at confirmation is shown in the dialog, keeps it open and nothing is reported as done', async () => {
  const { dialog, onDone, onClose } = open(); await within(dialog).findByLabelText('Cosa succede');
  mergeConfiguratoreContracts.mockImplementationOnce(async () => { throw new Error('Dopo lo spostamento risultano ancora dati collegati al contratto da eliminare: non è stato modificato nulla.'); });
  fireEvent.click(within(dialog).getByLabelText(/Ho letto cosa succede/)); fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina il contratto' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('non è stato modificato nulla'); expect(onDone).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  expect(within(dialog).getByRole('button', { name: 'Elimina il contratto' })).toBeEnabled();
});
test('an error while preparing the preview is shown and leaves the delete button off', async () => {
  mergeConfiguratoreContracts.mockImplementation(async () => { throw new Error('Il backend non espone ancora l’unione dei contratti: aggiorna il backend DEV.'); });
  const { dialog } = open(); expect(await within(dialog).findByRole('alert')).toHaveTextContent('aggiorna il backend DEV');
  expect(within(dialog).getByRole('button', { name: /Elimina il contratto/ })).toBeDisabled();
});
test('with no other contract to receive the data, the dialog explains why it cannot delete', () => {
  const { dialog } = open({ contracts: [drop] });
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Non c’è un altro contratto in cui spostare i dati'); expect(within(dialog).queryByRole('button', { name: /Elimina il contratto|Sposta/ })).not.toBeInTheDocument();
  expect(mergeConfiguratoreContracts).not.toHaveBeenCalled();
});
test('Annulla and the close button close without any request', async () => {
  const { dialog, onClose } = open(); await within(dialog).findByLabelText('Cosa succede');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' })); fireEvent.click(within(dialog).getByRole('button', { name: 'Chiudi' }));
  expect(onClose).toHaveBeenCalledTimes(2); expect(mergeConfiguratoreContracts).toHaveBeenCalledTimes(1);
});
test('while the move is in progress nothing can be closed or repeated', async () => {
  let release; mergeConfiguratoreContracts.mockImplementation((f, t, o) => (o?.preview ? Promise.resolve(nothingToMove) : new Promise(resolve => { release = resolve; })));
  const { dialog, onClose } = open(); await within(dialog).findByLabelText('Cosa succede');
  fireEvent.click(within(dialog).getByLabelText(/Ho letto cosa succede/)); fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina il contratto' }));
  expect(await within(dialog).findByRole('button', { name: 'Spostamento in corso…' })).toBeDisabled(); expect(within(dialog).getByRole('button', { name: 'Annulla' })).toBeDisabled(); expect(within(dialog).getByRole('button', { name: 'Chiudi' })).toBeDisabled();
  expect(mergeConfiguratoreContracts.mock.calls.filter(c => !c[2]?.preview)).toHaveLength(1); release({ message: 'ok' }); expect(onClose).not.toHaveBeenCalled();
});
test('pressing Esc while the move is running does not close the dialog; when idle it does', async () => {
  let release; mergeConfiguratoreContracts.mockImplementation((f, t, o) => (o?.preview ? Promise.resolve(nothingToMove) : new Promise(resolve => { release = resolve; })));
  const { dialog, onClose } = open(); await within(dialog).findByLabelText('Cosa succede');
  const cancel = () => { const event = new Event('cancel', { cancelable: true }); dialog.dispatchEvent(event); return event; };
  expect(cancel().defaultPrevented).toBe(false); expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByLabelText(/Ho letto cosa succede/)); fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina il contratto' }));
  await within(dialog).findByRole('button', { name: 'Spostamento in corso…' });
  expect(cancel().defaultPrevented).toBe(true); expect(onClose).toHaveBeenCalledTimes(1); release({ message: 'ok' });
});
