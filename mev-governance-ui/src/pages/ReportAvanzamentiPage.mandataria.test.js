import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReportAvanzamentiPage from './ReportAvanzamentiPage';
import * as service from '../services/mevService';

jest.mock('../services/mevService', () => new Proxy({}, { get: (_, name) => (name === '__esModule' ? true : (service_mocks[name] ??= jest.fn(async () => []))) }));
const service_mocks = {};

// Report Avanzamenti ha una sua copia della logica che traduce la «x» dell'Excel in Mandataria/Mandante. Con la tabella RTI & SUBCO di PRODUZIONE
// (la riga 2 e' Levia HUB, una SUBCO; IET e' la riga 3) la «x» di IET faceva comparire Levia HUB nella colonna Mandataria/Mandante.
const PROD_RTI = [{ id: 1, ruolo: 'Mandataria', societa: 'Capgemini Italia S.p.A.' }, { id: 2, ruolo: 'SUBCO', societa: 'Levia HUB S.p.A.' }, { id: 3, ruolo: 'Mandante', societa: 'IET' }, { id: 4, ruolo: 'SUBCO', societa: 'Logica Informatica S.r.L.' }];

beforeEach(() => {
  Object.keys(service_mocks).forEach(key => delete service_mocks[key]);
  const mev = [{ id: 282, excelId: 282, goTo: '142379', applicativo: 'BEP', descrizione: 'Gestione FC Jolly', stato: 'Approvato', capgemini: '["Capgemini Italia S.p.A.","IET"]', iet: 'x', importoExcel: 100 },
    { id: 5, excelId: 5, goTo: 'G5', applicativo: 'ILP', descrizione: 'Altra', stato: 'Approvato', capgemini: 'x', iet: 'x', importoExcel: 50 }];
  service_mocks.getMevList = jest.fn(async () => mev); service_mocks.getRtiSocieta = jest.fn(async () => PROD_RTI);
  service_mocks.getReleaseSchedules = jest.fn(async () => ({ records: [{ id: 'a', title: 'R.26_05' }] })); service_mocks.getReleaseProgress = jest.fn(async () => []);
});

test('the Mandataria/Mandante column shows Capgemini and IET, and never the SUBCO of row 2', async () => {
  render(<ReportAvanzamentiPage ambienteId="1" role="Admin" roles={['Admin']} />);
  await screen.findByText('142379');
  const rows = screen.getAllByRole('row').filter(row => /142379|G5/.test(row.textContent));
  expect(rows.length).toBe(2);
  rows.forEach(row => { expect(within(row).queryByText(/Levia HUB/)).not.toBeInTheDocument(); expect(row.textContent).toContain('Capgemini Italia S.p.A.'); expect(row.textContent).toContain('IET'); });
});
