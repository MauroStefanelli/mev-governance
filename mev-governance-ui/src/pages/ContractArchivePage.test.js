import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ContractArchivePage from './ContractArchivePage';
import * as service from '../services/mevService';

jest.mock('../services/mevService', () => ({
  getConfiguratoreContracts: jest.fn(), updateConfiguratoreLot: jest.fn(), deleteConfiguratoreContract: jest.fn(),
  importConfiguratoreContract: jest.fn(), uploadConfiguratoreContractLot: jest.fn(), getGare: jest.fn(), importaGaraComContratto: jest.fn(),
  getAmbientiUtenti: jest.fn(), addUtenteAmbiente: jest.fn(), removeUtenteAmbiente: jest.fn(), updateUtenteAmbienteRuolo: jest.fn(),
}));
const ambienti = [{ id: 10, codiceContratto: 'MEV-A', descrizione: 'Ambiente A' }];
const contracts = [
  { contractId: 'a', name: 'Contratto Alpha', builtin: true, lots: [{ lotId: '1', name: 'Sviluppo', active: true, codiceContratto: 'MEV-A' }, { lotId: '2', name: 'Supporto', active: false }] },
  { contractId: 'b', name: 'Contratto Beta', builtin: true, lots: [{ lotId: '1', name: 'Manutenzione', active: true, codiceContratto: 'MEV-A' }] },
];
beforeEach(() => { jest.clearAllMocks(); service.getConfiguratoreContracts.mockResolvedValue(contracts); service.updateConfiguratoreLot.mockResolvedValue({}); service.getAmbientiUtenti.mockResolvedValue([]); window.confirm = jest.fn(() => true); });
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
  fireEvent.click(screen.getByRole('button', { name: 'Utenti e ruoli' }));
  expect(screen.getByRole('button', { name: 'Configura collegamenti' })).toBeInTheDocument();
});
test('uses saved MEV links for members and filters unlinked configurations', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Utenti e ruoli' }));
  await waitFor(() => expect(service.getAmbientiUtenti).toHaveBeenCalledWith(10));
  fireEvent.change(screen.getByLabelText('Mostra'), { target: { value: 'unlinked' } });
  const directory = screen.getByRole('complementary', { name: 'Elenco contratti' });
  expect(within(directory).getByText('Contratto Alpha')).toBeInTheDocument();
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
