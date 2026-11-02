import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InitiativeWorkspace, { changedWorkspaceFields } from './InitiativeWorkspace';
import { workspaceRequest } from '../services/mevService';
jest.mock('../services/mevService', () => ({ workspaceRequest: jest.fn() }));
const revision = { id: 1, version: 1, author: 'analista', createdAt: '2026-11-02T12:00:00Z', reason: 'Prima analisi', payload: JSON.stringify({ title: 'Pilota', system: 'NPSO', decisions: [] }) };
beforeEach(() => { workspaceRequest.mockReset(); });
test('a concurrent save retains the local analysis and the original expected version', async () => {
  workspaceRequest.mockImplementation(path => Promise.resolve(path.includes('related?') ? [] : [revision]));
  render(<InitiativeWorkspace initiative={{ code: '145480' }} roles={['Admin']} onContextChange={() => {}} estimate={{ items: [] }} />);
  await screen.findByText(/Revisione di lavoro: 1/);
  fireEvent.change(screen.getByLabelText('Analisi TO-BE'), { target: { value: 'Soluzione locale' } });
  fireEvent.change(screen.getByLabelText('Modifiche e motivazione della revisione'), { target: { value: 'Impatto API' } });
  workspaceRequest.mockRejectedValueOnce(Object.assign(new Error('Un collega ha salvato una nuova revisione.'), { status: 409 }));
  fireEvent.click(screen.getByText('Salva nuova revisione con stima corrente'));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Analisi TO-BE')).toHaveValue('Soluzione locale');
  expect(workspaceRequest).toHaveBeenCalledWith('145480/revisions', expect.objectContaining({ expectedVersion: 1, reason: 'Impatto API' }));
});
test('supervisors can approve a saved version without editing the analysis', async () => {
  workspaceRequest.mockResolvedValue([revision]);
  render(<InitiativeWorkspace initiative={{ code: '145480' }} roles={['Bid Manager']} onContextChange={() => {}} />);
  await screen.findByText(/Revisione di lavoro: 1/);
  expect(screen.getByLabelText('Analisi TO-BE')).toBeDisabled();
  expect(screen.queryByText('Salva nuova revisione con stima corrente')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Modifiche e motivazione della revisione'), { target: { value: 'Verificata' } });
  workspaceRequest.mockResolvedValueOnce({ ...revision, version: 2 });
  fireEvent.click(screen.getByText('Approva revisione 1'));
  await waitFor(() => expect(workspaceRequest).toHaveBeenCalledWith('145480/revisions', expect.objectContaining({ approve: true, expectedVersion: 1 })));
});
test('version comparison includes decisions and the estimate as well as analyses', () => {
  expect(changedWorkspaceFields({ toBe: 'a', decisions: [], estimate: { total: 1 } }, { toBe: 'b', decisions: [{ text: 'API' }], estimate: { total: 2 } })).toEqual(['toBe', 'decisions', 'estimate']);
});
