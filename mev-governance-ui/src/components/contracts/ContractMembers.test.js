import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContractMembers from './ContractMembers';
import * as service from '../../services/mevService';
jest.mock('../../services/mevService', () => ({ getAmbientiUtenti: jest.fn(), addUtenteAmbiente: jest.fn(), removeUtenteAmbiente: jest.fn(), updateUtenteAmbienteRuolo: jest.fn() }));
const ambiente = { id: 10, codiceContratto: 'MEV-A' };
const member = { userId: 1, username: 'anna', fullName: 'Anna Rossi', email: 'anna@example.com', ruolo: 'Editor' };
const users = [{ id: 1, username: 'anna' }, { id: 2, username: 'marco' }];
beforeEach(() => { jest.clearAllMocks(); service.getAmbientiUtenti.mockResolvedValue([member]); service.updateUtenteAmbienteRuolo.mockResolvedValue({}); service.addUtenteAmbiente.mockResolvedValue({}); window.confirm = jest.fn(() => false); });
test('excludes existing members and adds the chosen user to the current MEV contract', async () => {
  render(<ContractMembers ambiente={ambiente} allUsers={users} />); await screen.findByText('Anna Rossi');
  expect(screen.queryByRole('option', { name: 'anna · anna' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Account da aggiungere'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi utente' }));
  await waitFor(() => expect(service.addUtenteAmbiente).toHaveBeenCalledWith(10, 2, 'Editor'));
});
test('requires explicit role save and preserves a failed change for retry', async () => {
  service.updateUtenteAmbienteRuolo.mockRejectedValue(new Error('Salvataggio non riuscito'));
  render(<ContractMembers ambiente={ambiente} allUsers={users} />); await screen.findByText('Anna Rossi');
  fireEvent.change(screen.getByLabelText('Ruolo di anna'), { target: { value: 'Client' } });
  expect(service.updateUtenteAmbienteRuolo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Salva ruolo' }));
  await waitFor(() => expect(service.updateUtenteAmbienteRuolo).toHaveBeenCalledWith(10, 1, 'Client'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito');
  expect(screen.getByLabelText('Ruolo di anna')).toHaveValue('Client');
});
test('cancelled removal does not revoke access', async () => {
  render(<ContractMembers ambiente={ambiente} />); await screen.findByText('Anna Rossi');
  fireEvent.click(screen.getByRole('button', { name: 'Rimuovi accesso' }));
  expect(window.confirm).toHaveBeenCalled(); expect(service.removeUtenteAmbiente).not.toHaveBeenCalled();
});
test('ignores stale membership responses when changing contract', async () => {
  let resolveOld;
  service.getAmbientiUtenti.mockImplementation(id => id === 10 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve([{ ...member, username: 'marco', fullName: 'Marco Bianchi' }]));
  const { rerender } = render(<ContractMembers ambiente={ambiente} />);
  rerender(<ContractMembers ambiente={{ id: 20, codiceContratto: 'MEV-B' }} />);
  await screen.findByText('Marco Bianchi'); resolveOld([member]);
  await waitFor(() => expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument());
});
