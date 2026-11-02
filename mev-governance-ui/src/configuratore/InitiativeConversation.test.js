import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InitiativeConversation from './InitiativeConversation';
import { workspaceRequest } from '../services/mevService';
jest.mock('../services/mevService', () => ({ workspaceRequest: jest.fn() }));
const exchange = { id: 'exchange-1', author: 'analista', revision: 2, createdAt: '2026-11-02T12:00:00Z', model: 'modello', question: 'Quali impatti?', answer: JSON.stringify({ proposta: 'Verificare API', fonti: ['document:1 riga 2'] }) };
beforeEach(() => workspaceRequest.mockReset());

test('reopens shared conversation and proposes a decision without approving it', async () => {
  workspaceRequest.mockResolvedValue([exchange]);
  const decide = jest.fn();
  render(<InitiativeConversation code="GOTO-1" version={2} canEdit onDecision={decide} />);
  await screen.findByText('Quali impatti?');
  fireEvent.click(screen.getByText('Porta la proposta nelle decisioni da valutare'));
  expect(decide).toHaveBeenCalledWith({ text: 'Verificare API', source: 'conversation:exchange-1 · workspace:GOTO-1:v2' });
});

test('sends the question against the saved revision and displays the persisted exchange', async () => {
  workspaceRequest.mockResolvedValueOnce([]).mockResolvedValueOnce(exchange);
  render(<InitiativeConversation code="GOTO-1" version={2} canEdit />);
  await screen.findByText('Confronto AI condiviso · 0 scambi');
  fireEvent.change(screen.getByLabelText('Domanda per l’AI'), { target: { value: 'Quali impatti?' } });
  fireEvent.click(screen.getByText('Invia e salva lo scambio'));
  await screen.findByText('Verificare API');
  expect(workspaceRequest).toHaveBeenCalledWith('GOTO-1/conversation', { question: 'Quali impatti?', expectedVersion: 2 });
  expect(screen.getByLabelText('Domanda per l’AI')).toHaveValue('');
});

test('blocks sending unsaved changes and preserves the question on service failure', async () => {
  workspaceRequest.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Servizio non disponibile'));
  const view = render(<InitiativeConversation code="GOTO-1" version={2} canEdit dirty />);
  expect(screen.getByText('Invia e salva lo scambio')).toBeDisabled();
  view.rerender(<InitiativeConversation code="GOTO-1" version={2} canEdit dirty={false} />);
  fireEvent.change(screen.getByLabelText('Domanda per l’AI'), { target: { value: 'Domanda da conservare' } });
  fireEvent.click(screen.getByText('Invia e salva lo scambio'));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Domanda per l’AI')).toHaveValue('Domanda da conservare');
});
