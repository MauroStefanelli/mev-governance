import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ContractArchivePage from './ContractArchivePage';
import * as service from '../services/mevService';

jest.mock('../services/mevService', () => ({
  getConfiguratoreContracts: jest.fn(), updateConfiguratoreLot: jest.fn(), deleteConfiguratoreContract: jest.fn(), mergeConfiguratoreContracts: jest.fn(),
  importConfiguratoreContract: jest.fn(), uploadConfiguratoreContractLot: jest.fn(), getGare: jest.fn(), importaGaraComContratto: jest.fn(),
  getAmbientiUtenti: jest.fn(), addUtenteAmbiente: jest.fn(), removeUtenteAmbiente: jest.fn(), updateUtenteAmbienteRuolo: jest.fn(),
}));
const ambienti = [{ id: 10, codiceContratto: 'MEV-A', descrizione: 'Ambiente A' }];
const contracts = [
  { contractId: 'a', name: 'Contratto Alpha', builtin: true, lots: [{ lotId: '1', name: 'Sviluppo', active: true, codiceContratto: 'MEV-A' }, { lotId: '2', name: 'Supporto', active: false }] },
  { contractId: 'b', name: 'Contratto Beta', builtin: true, lots: [{ lotId: '1', name: 'Manutenzione', active: true, codiceContratto: 'MEV-A' }] },
  { contractId: 'c', name: 'Contratto Gamma', builtin: true, lots: [{ lotId: '1', name: 'Nuovi servizi', active: true }] },
];
beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); service.getConfiguratoreContracts.mockResolvedValue(contracts); service.updateConfiguratoreLot.mockResolvedValue({}); service.getAmbientiUtenti.mockResolvedValue([]); window.confirm = jest.fn(() => true); });
const open = async () => { render(<ContractArchivePage ambienti={ambienti} />); return await screen.findByRole('heading', { name: 'Contratto Alpha' }); };
test('search selects the matching contract and keeps the directory usable with no results', async () => {
  await open(); fireEvent.change(screen.getByLabelText('Cerca contratto'), { target: { value: 'Manutenzione' } });
  expect(screen.getByRole('heading', { name: 'Contratto Beta' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Cerca contratto'), { target: { value: 'nessuno' } });
  expect(screen.getByText(/Nessun contratto trovato/)).toBeInTheDocument();
});
test('blocks deletion and deactivation of the last active lot', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Disattiva' }));
  expect(service.updateConfiguratoreLot).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole('button', { name: 'Elimina', exact: true })[0]);
  expect(service.updateConfiguratoreLot).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();
});
test('manual code replaces selected environment and success stays visible', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Collegamenti MEV' }));
  fireEvent.change(screen.getByLabelText('Codice MEV lotto 1'), { target: { value: 'MEV-NEW' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Salva', exact: true })[0]);
  await waitFor(() => expect(service.updateConfiguratoreLot).toHaveBeenCalledWith('a', '1', { codiceContratto: 'MEV-NEW' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Codice Contratto salvato');
  fireEvent.click(screen.getByRole('button', { name: 'Contratti e Accessi' }));
  expect(screen.getByRole('button', { name: 'Configura collegamenti' })).toBeInTheDocument();
});
test('uses saved MEV links for members and filters unlinked configurations', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: /Utenti e ruoli|Contratti e Accessi/ }));
  await waitFor(() => expect(service.getAmbientiUtenti).toHaveBeenCalledWith(10));
  fireEvent.change(screen.getByLabelText('Mostra'), { target: { value: 'unlinked' } });
  const directory = screen.getByRole('complementary', { name: 'Elenco contratti' });
  expect(within(directory).queryByText('Contratto Alpha')).not.toBeInTheDocument();
  expect(within(directory).getByText('Contratto Gamma')).toBeInTheDocument();
  expect(within(directory).queryByText('Contratto Beta')).not.toBeInTheDocument();
});
test('selecting a gara requires a separate import action and keeps the result visible', async () => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  const gara = { id: 7, nome: 'Gara Demo', capitolato: { lotti: [{ nome: 'Sviluppo' }] } };
  service.getGare.mockResolvedValue([gara]); service.importaGaraComContratto.mockResolvedValue({ message: 'Contratto importato.' });
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Importa da Gara' }));
  fireEvent.click(await screen.findByRole('button', { name: /Gara Demo/ }));
  expect(service.importaGaraComContratto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Importa gara selezionata' }));
  await waitFor(() => expect(service.importaGaraComContratto).toHaveBeenCalledWith(expect.objectContaining({ garaId: 7 })));
  expect(await screen.findByRole('status')).toHaveTextContent('Contratto importato.');
});

test('dragging reorders contracts, preserves selection and restores saved order', async () => {
  const { unmount } = render(<ContractArchivePage ambienti={ambienti} />);
  await screen.findByRole('heading', { name: 'Contratto Alpha' });
  const directory = screen.getByRole('complementary', { name: 'Elenco contratti' });
  const alpha = within(directory).getByRole('button', { name: /Contratto Alpha/ });
  const beta = within(directory).getByRole('button', { name: /Contratto Beta/ });
  const dataTransfer = { setData: jest.fn() };
  fireEvent.dragStart(beta, { dataTransfer }); fireEvent.dragOver(alpha, { dataTransfer }); fireEvent.drop(alpha, { dataTransfer });
  expect(JSON.parse(localStorage.getItem('mev-contract-archive-order'))).toEqual(['b', 'a', 'c']);
  expect(screen.getByRole('heading', { name: 'Contratto Alpha' })).toBeInTheDocument();
  unmount(); render(<ContractArchivePage ambienti={ambienti} />);
  expect(await screen.findByRole('heading', { name: 'Contratto Beta' })).toBeInTheDocument();
});
test('documents show saved names and imported data independently of new file selection', async () => {
  service.getConfiguratoreContracts.mockResolvedValue([{ ...contracts[0], rulesFile: 'capitolato.pdf', lots: [{ lotId: '2', name: 'Logistica', priceFile: 'listino.xlsx', catalogFile: 'catalogo.pdf', towPrices: { 'TOW02.1': 100 }, catalog: [{ id: '1' }] }] }]);
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Documenti' }));
  expect(screen.getByText('capitolato.pdf')).toBeInTheDocument();
  expect(screen.getByText('listino.xlsx')).toBeInTheDocument();
  expect(screen.getByText('catalogo.pdf')).toBeInTheDocument();
  expect(screen.getByText('1 prezzi disponibili')).toBeInTheDocument();
  expect(screen.getByText('1 voci disponibili')).toBeInTheDocument();
});

test('catalog displays separate saved Realizzazione and Modifica auction prices', async () => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  service.getConfiguratoreContracts.mockResolvedValue([{ ...contracts[0], lots: [{ lotId: '2', name: 'Logistica', catalog: [{ id: 'app', nome: 'Driver', prezzi: { REALIZZAZIONE: { Semplice: 100, Medio: 200, Complesso: 300 }, MODIFICA: { Semplice: 10, Medio: 20, Complesso: 30 } } }] }] }]);
  await open(); fireEvent.click(screen.getByRole('button', { name: '1 voci catalogo' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByText(/Base d(?:'|&apos;|’)?asta REALIZZAZIONE/)).toBeInTheDocument();
  expect(dialog.getByText(/Base d(?:'|&apos;|’)?asta MODIFICA/)).toBeInTheDocument();
  [100, 200, 300, 10, 20, 30].forEach(value => expect(dialog.getByText(new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value).replace(/\s/g, ' '))).toBeInTheDocument());
});

describe('deleting a duplicate contract', () => {
  const cat = n => Array.from({ length: n }, (_, i) => ({ id: i }));
  const dup = [
    { contractId: 'tet', name: 'Tracciatura e Logistica Integrata', lots: [{ lotId: '2', name: 'Lotto 2', active: true, towPrices: { a: 1, b: 2, c: 3, d: 4, e: 5 }, catalog: cat(27), priceFile: 'Listino.pdf', catalogFile: 'Catalogo.pdf' }] },
    { contractId: 'aq', name: 'Accordo Quadro per la fornitura di Servizi Professionali', lots: [{ lotId: '2', name: 'Lotto 2', active: true, towPrices: {}, catalog: cat(27), priceFile: '(importato da gara x)', catalogFile: '(importato da gara x)' }] },
    { contractId: 'poste-tet-2025', name: 'Poste TeT (built-in)', builtin: true, lots: [{ lotId: '1', name: 'Lotto 1', active: true, towPrices: { a: 1 }, catalog: cat(3) }] },
  ];
  const preview = { fromContractId: 'aq', toContractId: 'tet', canRemove: true, lots: [{ lotId: '2', action: 'nessuna', reason: 'Il lotto di destinazione ha già tutto: non cambia.' }], sharedApplications: [], references: [], blockers: [], notes: [] };
  beforeEach(() => { HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); }); HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); }); service.getConfiguratoreContracts.mockResolvedValue(dup); service.mergeConfiguratoreContracts.mockResolvedValue(preview); });
  const openAq = async () => { render(<ContractArchivePage ambienti={ambienti} />); await screen.findByRole('heading', { name: 'Tracciatura e Logistica Integrata' }); fireEvent.click(await screen.findByRole('button', { name: /Accordo Quadro/ })); return screen.findByRole('heading', { name: /^Accordo Quadro per/ }); };

  test('the page points out the probable duplicate and marks the incomplete contract', async () => {
    await openAq();
    expect(screen.getByRole('note')).toHaveTextContent(/Possibile duplicato: .*Tracciatura e Logistica Integrata.*Accordo Quadro/);
    expect(screen.getByText('Dati incompleti')).toBeInTheDocument();
  });
  test('"Elimina contratto…" no longer deletes at once: it opens the dialog and nothing is sent to the old delete', async () => {
    await openAq(); fireEvent.click(screen.getByRole('button', { name: 'Elimina contratto…' }));
    expect(await screen.findByRole('dialog', { name: /Elimina «Accordo Quadro/ })).toBeInTheDocument(); expect(service.deleteConfiguratoreContract).not.toHaveBeenCalled(); expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(service.mergeConfiguratoreContracts).toHaveBeenCalledWith('aq', 'tet', { preview: true }));
  });
  test('the complete contract is the one proposed to stay; the system one is listed after it, marked', async () => {
    await openAq(); fireEvent.click(screen.getByRole('button', { name: 'Elimina contratto…' })); const dialog = await screen.findByRole('dialog', { name: /Elimina «Accordo Quadro/ });
    const select = within(dialog).getByLabelText('Il contratto che resta'); expect(select).toHaveValue('tet'); expect([...select.options].map(o => o.value)).toEqual(['tet', 'poste-tet-2025']);
  });
  test('after confirming, the list is reloaded from the server, the kept contract is selected and the result is announced', async () => {
    service.mergeConfiguratoreContracts.mockImplementation(async (f, t, o) => (o?.preview ? preview : { message: 'Dati spostati ed eliminato il contratto.', fromContractId: 'aq', toContractId: 'tet', repointed: 2 }));
    await openAq(); fireEvent.click(screen.getByRole('button', { name: 'Elimina contratto…' })); const dialog = await screen.findByRole('dialog', { name: /Elimina «Accordo Quadro/ });
    await within(dialog).findByLabelText('Cosa succede'); service.getConfiguratoreContracts.mockResolvedValue([dup[0], dup[2]]);
    fireEvent.click(within(dialog).getByLabelText(/Ho letto cosa succede/)); fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina il contratto' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Dati spostati ed eliminato il contratto\. 2 valutazioni ricollegate/);
    expect(await screen.findByRole('heading', { name: 'Tracciatura e Logistica Integrata' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /^Accordo Quadro/ })).not.toBeInTheDocument();
  });
  test('the built-in contract has no delete button', async () => {
    render(<ContractArchivePage ambienti={ambienti} />); await screen.findByRole('heading', { name: 'Tracciatura e Logistica Integrata' }); fireEvent.click(await screen.findByRole('button', { name: /Poste TeT \(built-in\)/ }));
    await screen.findByRole('heading', { name: /Poste TeT/ }); expect(screen.queryByRole('button', { name: 'Elimina contratto…' })).not.toBeInTheDocument(); expect(screen.getByText('Contratto di sistema')).toBeInTheDocument();
  });
});
