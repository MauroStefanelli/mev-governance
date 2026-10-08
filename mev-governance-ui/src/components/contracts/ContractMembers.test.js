import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  await waitFor(() => expect(service.addUtenteAmbiente).toHaveBeenCalledWith(10, 2, ['Editor']));
});
test('requires explicit role save and preserves a failed change for retry', async () => {
  service.updateUtenteAmbienteRuolo.mockRejectedValue(new Error('Salvataggio non riuscito'));
  render(<ContractMembers ambiente={ambiente} allUsers={users} />); await screen.findByText('Anna Rossi');
  const picker = within(screen.getByRole('group', { name: 'Ruoli di anna' }));
  fireEvent.click(picker.getByLabelText('Client'));
  expect(service.updateUtenteAmbienteRuolo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Salva ruoli' }));
  await waitFor(() => expect(service.updateUtenteAmbienteRuolo).toHaveBeenCalledWith(10, 1, ['Editor', 'Client']));
  expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito');
  expect(picker.getByLabelText('Client')).toBeChecked();
  expect(picker.getByLabelText('Editor')).toBeChecked();
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

test('SuperAdmin is never offered as a contract role or account to assign', async () => {
  render(<ContractMembers ambiente={ambiente} allUsers={[...users, { id: 3, username: 'super', role: 'SuperAdmin' }]} />);
  await screen.findByText('Anna Rossi');
  expect(screen.queryByRole('option', { name: /super/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('SuperAdmin')).not.toBeInTheDocument();
});
test('requires at least one role and submits all selected roles for a new member', async () => {
  render(<ContractMembers ambiente={ambiente} allUsers={users} />); await screen.findByText('Anna Rossi');
  fireEvent.change(screen.getByLabelText('Account da aggiungere'), { target: { value: '2' } });
  const picker = within(screen.getByRole('group', { name: 'Ruoli nel contratto' }));
  fireEvent.click(picker.getByLabelText('Editor'));
  expect(screen.getByRole('button', { name: 'Aggiungi utente' })).toBeDisabled();
  fireEvent.click(picker.getByLabelText('Developer')); fireEvent.click(picker.getByLabelText('Client'));
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi utente' }));
  await waitFor(() => expect(service.addUtenteAmbiente).toHaveBeenCalledWith(10, 2, ['Developer', 'Client']));
});
