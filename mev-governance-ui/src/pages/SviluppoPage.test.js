import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SviluppoPage from './SviluppoPage';
import * as service from '../services/mevService';

jest.mock('../services/mevService', () => ({
  getConfiguratoreRecords: jest.fn(), getConfiguratoreContracts: jest.fn(), upsertConfiguratoreRecord: jest.fn(), getSharedApplications: jest.fn(),
  analyzeDevelopmentWithAi: jest.fn(), prepareActivityDevelopment: jest.fn(), generateActivityCode: jest.fn(),
}));
const evaluation = { initiative: { code: 'GOTO1', title: 'Invio prenotazione', system: 'NPSO' }, lot: '2', contractId: 'C1',
  items: [{ sourceRowId: 'detail-1', interventionId: 'I1', reason: 'Prima attività' }, { sourceRowId: 'detail-2', interventionId: 'I1', reason: 'Seconda attività' }] };
const offer = { record_key: 'C1|2|initiative|goto1', entity_type: 'initiative_evaluation', contract_id: 'C1', lot_id: '2', title: 'GOTO1', updated_at: '2026-01-02T10:00:00Z', payload: JSON.stringify(evaluation) };
let store;
beforeEach(() => {
  store = [];
  Object.values(service).forEach(fn => fn.mockReset?.());
  service.getConfiguratoreContracts.mockResolvedValue([]);
  service.getSharedApplications.mockResolvedValue([{ id: 'a', name: 'NPSO', codeUrl: '/src/npso' }]);
  service.getConfiguratoreRecords.mockImplementation(async params => ({ records: params.entity_type === 'initiative_evaluation' ? [offer] : store.filter(r => r.entity_type === params.entity_type) }));
  service.upsertConfiguratoreRecord.mockImplementation(async body => { const saved = { ...body, payload: JSON.stringify(body.payload) }; store = [...store.filter(r => r.record_key !== body.record_key), saved]; return saved; });
});
const openFirst = async () => { render(<SviluppoPage ambienteId={1} codiceContratto="C1" />); fireEvent.click(await screen.findByText(/GOTO1 · Invio prenotazione/)); await screen.findByLabelText('Schede di sviluppo per attività'); };

test('lists evaluated initiatives and opens the development sheets for the chosen one', async () => {
  await openFirst();
  expect(screen.getByText('Schede di sviluppo · 2 attività')).toBeInTheDocument();
  expect(screen.getByText('/src/npso')).toBeInTheDocument();
  expect(screen.queryByText(/Importo/)).not.toBeInTheDocument();
});

test('saves, closes and reopens with the same sheet content, and Save and close stays open on failure', async () => {
  await openFirst();
  fireEvent.click(screen.getByText('Attività 2'));
  fireEvent.change(screen.getAllByLabelText('Soluzione tecnica')[0], { target: { value: 'Soluzione salvata' } });
  service.upsertConfiguratoreRecord.mockRejectedValueOnce(new Error('rete'));
  fireEvent.click(screen.getByText('Salva e chiudi'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito: rete');
  expect(screen.getByLabelText('Schede di sviluppo per attività')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Salva e chiudi'));
  await screen.findByLabelText('Iniziative da sviluppare');
  expect(store).toHaveLength(1);
  fireEvent.click(await screen.findByText(/GOTO1 · Invio prenotazione/));
  await screen.findByLabelText('Schede di sviluppo per attività');
  fireEvent.click(screen.getByText('Attività 2'));
  await waitFor(() => expect(screen.getAllByLabelText('Soluzione tecnica')[0]).toHaveValue('Soluzione salvata'));
});

test('warns about unsaved changes and keeps the exported package consistent with the page', async () => {
  await openFirst();
  fireEvent.click(screen.getByText('Attività 1'));
  fireEvent.change(screen.getAllByLabelText('Soluzione tecnica')[0], { target: { value: 'Non ancora salvata' } });
  expect(screen.getByText(/Modifiche non salvate/)).toBeInTheDocument();
  expect(screen.getByText('Salva sviluppo')).toBeEnabled();
});
