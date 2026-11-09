import React, { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Panel from './ActivityDevelopmentPanel';
import { activitySourceContext } from './activitySourceContext';
import { prepareActivityDevelopment } from '../services/mevService';
jest.mock('./activitySourceContext', () => ({ activitySourceContext: jest.fn() }));
jest.mock('../services/mevService', () => ({ prepareActivityDevelopment: jest.fn() }));

test('edits a per-row plan and shows configured NPSO repository without claiming it was read', () => {
  const selectFiles = jest.fn();
  function View() {
    const [plans, setPlans] = useState({});
    return <Panel items={[{ sourceRowId: 'r1', interventionId: 'I1', reason: 'API' }]} plans={plans} onChange={setPlans} applications={[{ name: 'NPSO', codeUrl: '/src/npso' }]} onSelectFiles={selectFiles} />;
  }
  render(<View />);
  fireEvent.click(screen.getByText('Attività 1'));
  expect(screen.getByText('/src/npso')).toBeVisible();
  expect(within(screen.getByLabelText('Stato attività 1')).getByRole('option', { name: 'Pronta per sviluppo' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('File coinvolti (uno per riga, percorso relativo)'), { target: { value: 'src/Api.java' } });
  fireEvent.change(screen.getByLabelText('Soluzione tecnica'), { target: { value: 'Aggiornare API' } });
  fireEvent.change(screen.getByLabelText('Criteri di accettazione'), { target: { value: 'Validazione richiesta' } });
  expect(within(screen.getByLabelText('Stato attività 1')).getByRole('option', { name: 'Pronta per sviluppo' })).not.toBeDisabled();
  fireEvent.click(screen.getByText('Seleziona cartella sorgenti per questa sessione'));
  expect(selectFiles).toHaveBeenCalled();
});

test('Activity 29 proposal survives serialized save and reopening without local source permission', async () => {
  activitySourceContext.mockResolvedValue({ files: [{ path: 'src/Api.java', startLine: 1, endLine: 10, sha256: 'abc', text: 'class Api {}' }], coverage: { notice: 'Campione letto' } });
  prepareActivityDevelopment.mockResolvedValue({ analysis: { solution: 'Soluzione attività 29', acceptance: 'Test attività 29', evidence: [{ path: 'src/Api.java', startLine: 1, endLine: 2, reason: 'API' }] } });
  const items = Array.from({ length: 29 }, (_, i) => ({ sourceRowId: `detail-${i + 1}`, interventionId: 'I1', reason: `Requisito ${i + 1}` }));
  let savedPlans = {};
  function View() {
    const [plans, setPlans] = useState({});
    return <><button onClick={() => { savedPlans = JSON.parse(JSON.stringify(plans)); }}>Salva test</button><Panel items={items} plans={plans} onChange={setPlans} applications={[]} sourceFiles={[{ name: 'Api.java' }]} /></>;
  }
  const view = render(<View />);
  fireEvent.click(screen.getByText('Attività 29'));
  const activity = screen.getByText('Attività 29').closest('details');
  fireEvent.click(within(activity).getByText('Prepara scheda con AI'));
  await screen.findByText('Soluzione attività 29');
  fireEvent.click(screen.getByText('Salva test'));
  expect(savedPlans['detail-29'].aiProposal.analysis.solution).toBe('Soluzione attività 29');
  view.unmount();
  render(<Panel items={items} plans={savedPlans} onChange={() => {}} applications={[]} sourceFiles={[]} />);
  fireEvent.click(screen.getByText('Attività 29'));
  expect(screen.getByText('Soluzione attività 29')).toBeVisible();
  expect(within(screen.getByText('Attività 29').closest('details')).getByText('Prepara scheda con AI')).toBeDisabled();
});
