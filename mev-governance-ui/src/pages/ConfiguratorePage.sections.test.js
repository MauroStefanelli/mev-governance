import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfiguratorePage from './ConfiguratorePage';
import * as service from '../services/mevService';

jest.mock('../services/mevService', () => {
  const answers = { getConfiguratoreRecords: { records: [] }, getConfiguratoreContracts: [], getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getTowImpatto: null, getReleaseSchedules: [] };
  const cache = {};
  return new Proxy({}, { get: (_, name) => {
    if (name === '__esModule') return true;
    if (!cache[name]) cache[name] = jest.fn(async () => (name in answers ? answers[name] : {}));
    return cache[name];
  } });
});
jest.mock('../configuratore/InitiativeConversation', () => () => null);

const SECTIONS = ['Dati iniziativa', 'Workspace documentale', 'Razionali e vincoli con l’AI', 'Soluzione', 'Analisi condivisa', 'Codice sorgente', 'CONOSCENZA DELL’INIZIATIVA'];
const sectionButtons = () => [...document.querySelectorAll('.secrow-toggle')];
const row = title => sectionButtons().find(button => button.textContent.includes(title));
const mount = () => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Developer" roles={['Developer']} />);

const answers = { getConfiguratoreRecords: { records: [] }, getConfiguratoreContracts: [], getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getTowImpatto: null, getReleaseSchedules: [] };
beforeEach(() => {
  localStorage.clear();
  Object.keys(answers).forEach(name => service[name].mockReset().mockImplementation(async () => answers[name]));
  service.rationaleRequest.mockReset(); service.libraryRequest.mockReset();
  service.rationaleRequest.mockImplementation(async () => ({ messages: [], hasMore: false, entries: [] }));
  service.libraryRequest.mockImplementation(async () => ({ documents: [], folders: [], historical: 0, pendingIndex: 0, limit: 300, ocrAvailable: true }));
});

test('the Iniziativa step lists the seven sections in the requested order, each as a single row', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  expect(sectionButtons().map(button => SECTIONS.find(title => button.textContent.includes(title)))).toEqual(SECTIONS);
  expect(sectionButtons().map(button => button.querySelector('.secrow-num').textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
});

test('only the initiative data is open at first; the others are collapsed rows', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  expect(row('Dati iniziativa')).toHaveAttribute('aria-expanded', 'true');
  SECTIONS.slice(1).forEach(title => expect(row(title)).toHaveAttribute('aria-expanded', 'false'));
  expect(screen.getByLabelText('Codice GOTO')).toBeVisible();
});

test('without an initiative the sections that need one are locked and say so in the row', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  ['Workspace documentale', 'Razionali e vincoli con l’AI', 'Soluzione', 'Analisi condivisa'].forEach(title => {
    expect(row(title)).toHaveTextContent(/Bloccat/);
    expect(row(title)).toHaveTextContent(/Apri o crea un’iniziativa|Inserisci il codice GOTO/);
  });
  expect(service.libraryRequest).not.toHaveBeenCalled();
  expect(service.rationaleRequest).not.toHaveBeenCalled();
});

test('typing a GOTO and title unlocks the sections and the rows show their facts', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '145480' } });
  fireEvent.change(screen.getByLabelText('Titolo', { selector: 'input' }), { target: { value: 'Invio prenotazione' } });
  await waitFor(() => expect(row('Dati iniziativa')).toHaveTextContent('GOTO 145480'));
  expect(row('Dati iniziativa')).toHaveTextContent('Invio prenotazione');
  expect(row('Workspace documentale')).not.toHaveTextContent('Bloccat');
  await waitFor(() => expect(row('Workspace documentale')).toHaveTextContent('Nessun documento'));
  expect(row('Razionali e vincoli con l’AI')).toHaveTextContent('Nessuna voce ancora');
});

test('a row opens on click and shows the section; opening one does not close another', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '145480' } });
  fireEvent.change(screen.getByLabelText('Titolo', { selector: 'input' }), { target: { value: 'Invio' } });
  fireEvent.click(row('Workspace documentale'));
  expect(row('Workspace documentale')).toHaveAttribute('aria-expanded', 'true');
  expect(await screen.findByRole('button', { name: 'Carica Documenti' })).toBeVisible();
  fireEvent.click(row('Razionali e vincoli con l’AI'));
  expect(row('Workspace documentale')).toHaveAttribute('aria-expanded', 'true');
  expect(await screen.findByLabelText('Messaggio per l’AI')).toBeVisible();
  fireEvent.click(row('Workspace documentale'));
  expect(row('Workspace documentale')).toHaveAttribute('aria-expanded', 'false');
});

test('data typed in the initiative card is kept when its row is closed and reopened', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '145480' } });
  fireEvent.click(row('Dati iniziativa'));
  expect(row('Dati iniziativa')).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(row('Dati iniziativa'));
  expect(screen.getByLabelText('Codice GOTO')).toHaveValue('145480');
});

test('the solution section opens with the empty-offer guidance when nothing was imported', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '145480' } });
  fireEvent.change(screen.getByLabelText('Titolo', { selector: 'input' }), { target: { value: 'Invio' } });
  fireEvent.click(row('Soluzione'));
  expect(await screen.findByText(/non ha ancora interventi/)).toBeVisible();
});

test('the knowledge section opens with its overview and the cards open the matching section', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '145480' } });
  fireEvent.change(screen.getByLabelText('Titolo', { selector: 'input' }), { target: { value: 'Invio' } });
  fireEvent.click(row('CONOSCENZA DELL’INIZIATIVA'));
  const overview = await screen.findByLabelText('Riepilogo della conoscenza dell’iniziativa');
  fireEvent.click(within(overview).getByRole('button', { name: /Razionali e vincoli/ }));
  expect(row('Razionali e vincoli con l’AI')).toHaveAttribute('aria-expanded', 'true');
});

test('the shared analysis keeps its existing content inside the new row', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '145480' } });
  fireEvent.click(row('Analisi condivisa'));
  expect(await screen.findByLabelText('Workspace collaborativo iniziativa')).toBeVisible();
  expect(await screen.findByText(/Revisione di lavoro/)).toBeInTheDocument();
});

test('the offer import button is still above the sections', async () => {
  mount();
  await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  expect(screen.getByText('Importa Tabella di Offerta')).toBeInTheDocument();
  const importLabel = screen.getByText('Importa Tabella di Offerta').closest('label');
  expect(importLabel.compareDocumentPosition(sectionButtons()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
