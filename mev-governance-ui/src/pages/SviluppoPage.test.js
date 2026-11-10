import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
const openFirst = async () => { render(<SviluppoPage ambienteId={1} codiceContratto="C1" />); fireEvent.click(await screen.findByText('Invio prenotazione')); await screen.findByLabelText('Percorso di sviluppo'); };
const bar = () => document.querySelector('.dev-steps');
const goToSheets = () => fireEvent.click(within(bar()).getByRole('button', { name: /Schede/ }));

test('lists evaluated initiatives with their progress and explains the six phases', async () => {
  render(<SviluppoPage ambienteId={1} codiceContratto="C1" />);
  expect(await screen.findByText('Invio prenotazione')).toBeInTheDocument();
  expect(screen.getByText('Da avviare')).toBeInTheDocument();
  expect(within(screen.getByLabelText('Le fasi del percorso')).getAllByRole('listitem')).toHaveLength(6);
});

test('opens on the sources phase for a new development and points to the next step', async () => {
  await openFirst();
  expect(screen.getByRole('region', { name: 'Fase: Fonti' })).toBeInTheDocument();
  expect(screen.getByText('/src/npso')).toBeInTheDocument();
  expect(screen.getByText(/cartella dei sorgenti/, { selector: '.dev-next-box p' })).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').filter(li => li.querySelector('.dev-step'))).toHaveLength(6);
  expect(screen.queryByText(/Importo/)).not.toBeInTheDocument();
});

test('the phase bar and the pager move between phases and mark the current one', async () => {
  await openFirst();
  goToSheets();
  expect(screen.getByRole('region', { name: 'Fase: Schede' })).toBeInTheDocument();
  expect(within(bar()).getByRole('button', { name: /Schede/, current: 'step' })).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Cambio fase' })).getByRole('button', { name: /Progetto/ }));
  expect(screen.getByRole('region', { name: 'Fase: Progetto' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Mostra le regole/ }));
  expect(screen.getByRole('region', { name: 'Regole della fase Progetto' })).toHaveTextContent('Una decisione è documentata solo con scelta, fonte e referente');
});

test('saves, closes and reopens with the same sheet content, and Save and close stays open on failure', async () => {
  await openFirst();
  goToSheets();
  fireEvent.click(screen.getByText('Attività 2'));
  fireEvent.change(screen.getAllByLabelText('Soluzione tecnica')[0], { target: { value: 'Soluzione salvata' } });
  service.upsertConfiguratoreRecord.mockRejectedValueOnce(new Error('rete'));
  fireEvent.click(screen.getByText('Salva e chiudi'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Salvataggio non riuscito: rete');
  expect(screen.getByLabelText('Percorso di sviluppo')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Salva e chiudi'));
  await screen.findByLabelText('Iniziative da sviluppare');
  expect(store).toHaveLength(1);
  expect(await screen.findByText('Avviato')).toBeInTheDocument();
  expect(screen.getByText(/0\/2 schede/)).toBeInTheDocument();
  fireEvent.click(await screen.findByText('Invio prenotazione'));
  await screen.findByLabelText('Percorso di sviluppo');
  expect(screen.getByRole('region', { name: 'Fase: Schede' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Attività 2'));
  await waitFor(() => expect(screen.getAllByLabelText('Soluzione tecnica')[0]).toHaveValue('Soluzione salvata'));
});

test('an edited sheet updates the progress and unsaved state immediately', async () => {
  await openFirst();
  goToSheets();
  fireEvent.click(screen.getByText('Attività 1'));
  expect(screen.getByText('0/2 definite')).toBeInTheDocument();
  fireEvent.change(screen.getAllByLabelText('File coinvolti (uno per riga, percorso relativo)')[0], { target: { value: 'a.java' } });
  fireEvent.change(screen.getAllByLabelText('Soluzione tecnica')[0], { target: { value: 'sol' } });
  fireEvent.change(screen.getAllByLabelText('Criteri di accettazione')[0], { target: { value: 'crit' } });
  expect(screen.getByText('1/2 definite')).toBeInTheDocument();
  expect(screen.getByText('Modifiche non salvate')).toBeInTheDocument();
  expect(screen.getByText('Salva sviluppo')).toBeEnabled();
});

test('the delivery phase lists what is still missing before the package is useful', async () => {
  await openFirst();
  fireEvent.click(within(bar()).getByRole('button', { name: /Consegna/ }));
  fireEvent.click(screen.getByRole('button', { name: /Mostra le regole/ }));
  const guide = screen.getByRole('region', { name: 'Regole della fase Consegna' });
  expect(guide).toHaveTextContent('○ Sviluppo salvato');
  expect(guide).toHaveTextContent('○ Branch indicato');
  fireEvent.change(screen.getByLabelText('Branch suggerito'), { target: { value: 'feature/x' } });
  expect(screen.getByRole('region', { name: 'Regole della fase Consegna' })).toHaveTextContent('✓ Branch indicato');
});
