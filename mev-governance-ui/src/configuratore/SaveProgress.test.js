import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SaveProgress, { SAVE_STEPS, stepState } from './SaveProgress';
import { saveInitiativeSnapshot } from './saveInitiativeSnapshot';
import * as mevService from '../services/mevService';

jest.mock('../services/mevService');

test('nothing is shown when idle', () => { const { container } = render(<SaveProgress phase="idle" />); expect(container).toBeEmptyDOMElement(); });
test('while saving it says so, lists the real steps and tells the user not to close the page', () => {
  render(<SaveProgress phase="saving" step="offer" title="Salvataggio dell’iniziativa in corso" />);
  expect(screen.getByRole('dialog')).toHaveTextContent('Salvataggio dell’iniziativa in corso');
  expect(screen.getByText(/Non chiudere la pagina/)).toBeInTheDocument();
  SAVE_STEPS.forEach(step => expect(screen.getByText(step.label)).toBeInTheDocument());
  expect(screen.getByText('Salvo l’offerta').closest('li')).toHaveAttribute('aria-current', 'step');
  expect(screen.getByText('Controllo lo storico condiviso').closest('li')).toHaveClass('is-done');
  expect(screen.getByText('Aggiorno lo storico').closest('li')).toHaveClass('is-todo');
});
test('the steps are done, doing or to do depending on where the save is', () => {
  expect(SAVE_STEPS.map(s => stepState('waiting', s.id))).toEqual(['todo', 'todo', 'todo']);
  expect(SAVE_STEPS.map(s => stepState('history', s.id))).toEqual(['doing', 'todo', 'todo']);
  expect(SAVE_STEPS.map(s => stepState('offer', s.id))).toEqual(['done', 'doing', 'todo']);
  expect(SAVE_STEPS.map(s => stepState('revision', s.id))).toEqual(['done', 'done', 'doing']);
  expect(SAVE_STEPS.map(s => stepState('done', s.id))).toEqual(['done', 'done', 'done']);
});
test('when it is done it says so', () => { render(<SaveProgress phase="done" />); expect(screen.getByRole('dialog')).toHaveTextContent('Salvataggio completato'); expect(screen.queryByText(/Non chiudere la pagina/)).toBeNull(); });
test('a failure stays on screen with the reason, says the work is not lost, and needs an explicit click', () => {
  const dismiss = jest.fn();
  render(<SaveProgress phase="failed" message="Un collega ha salvato una nuova revisione." onDismiss={dismiss} />);
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Salvataggio non riuscito');
  expect(screen.getByText('Un collega ha salvato una nuova revisione.')).toBeInTheDocument();
  expect(screen.getByText(/L’iniziativa resta aperta/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ho capito' })); expect(dismiss).toHaveBeenCalledTimes(1);
});

describe('the real save reports its steps', () => {
  const body = { payload: { initiative: { code: '146023', title: 'T', system: '' }, developmentPlans: {} } };
  test('in order: history, offer, revision', async () => {
    const steps = [];
    mevService.workspaceRequest.mockReset().mockImplementation(async (path, post) => post ? { payload: JSON.stringify({ estimate: { developmentPlans: {} } }), version: 2 } : [{ version: 1, payload: '{}' }]);
    await saveInitiativeSnapshot(body, null, async () => ({ payload: { developmentPlans: {} } }), name => steps.push(name));
    expect(steps).toEqual(['waiting', 'history', 'offer', 'revision']);
  });
  test('a progress callback that throws never makes the save fail', async () => {
    mevService.workspaceRequest.mockReset().mockImplementation(async (path, post) => post ? { payload: JSON.stringify({ estimate: { developmentPlans: {} } }), version: 2 } : [{ version: 1, payload: '{}' }]);
    await expect(saveInitiativeSnapshot(body, null, async () => ({ payload: { developmentPlans: {} } }), () => { throw new Error('boom'); })).resolves.toBeDefined();
  });
});
