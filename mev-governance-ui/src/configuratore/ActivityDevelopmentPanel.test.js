import React, { useState } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Panel from './ActivityDevelopmentPanel';
import { activitySourceContext } from './activitySourceContext';
import { prepareActivityDevelopment } from '../services/mevService';
jest.mock('./activitySourceContext', () => ({ activitySourceContext: jest.fn(), createSourceCache: () => new Map() }));
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

describe('batch preparation', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ sourceRowId: `d${i + 1}`, interventionId: 'I1', reason: `Requisito ${i + 1}` }));
  const answer = n => ({ analysis: { solution: `Soluzione ${n}`, acceptance: `Criteri ${n}`, evidence: [] } });
  let latest;
  function View({ initial = {}, onSelectFiles = () => {} }) {
    const [plans, setPlans] = useState(initial);
    latest = plans;
    return <Panel items={items} plans={plans} onChange={setPlans} applications={[]} onSelectFiles={onSelectFiles} sourceFiles={[{ name: 'Api.java' }]} />;
  }
  const pick = n => fireEvent.click(screen.getByLabelText(`Seleziona attività ${n}`));
  const run = () => fireEvent.click(screen.getByText(/Prepara con AI le \d+ attività selezionate/));
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    activitySourceContext.mockResolvedValue({ files: [{ path: 'Api.java', startLine: 1, endLine: 5, sha256: 'abc', text: 'x' }], coverage: { notice: 'Campione' } });
  });

  test('prepares only the selected activities, one request each, and never touches the sheet fields', async () => {
    prepareActivityDevelopment.mockImplementation(async ({ activity }) => answer(activity.description.slice(-1)));
    render(<View initial={{ d2: { solution: 'scritta a mano', files: 'a.java' } }} />);
    pick(1); pick(2); pick(4);
    run();
    await screen.findByText(/3 su 3 proposte preparate/);
    expect(prepareActivityDevelopment).toHaveBeenCalledTimes(3);
    expect(latest.d1.aiProposal.analysis.solution).toBe('Soluzione 1');
    expect(latest.d4.aiProposal.analysis.solution).toBe('Soluzione 4');
    expect(latest.d3).toBeUndefined();
    expect(latest.d2.solution).toBe('scritta a mano');
    expect(latest.d2.files).toBe('a.java');
  });

  test('skips activities that already have a proposal unless regeneration is requested', async () => {
    prepareActivityDevelopment.mockImplementation(async () => answer('nuova'));
    render(<View initial={{ d1: { aiProposal: { analysis: { solution: 'vecchia', acceptance: 'v' }, evidence: [], coverage: {} } } }} />);
    pick(1); pick(2);
    expect(screen.getByText('Prepara con AI le 1 attività selezionate')).toBeInTheDocument();
    run();
    await screen.findByText(/1 su 1 proposte preparate/);
    expect(latest.d1.aiProposal.analysis.solution).toBe('vecchia');
  });

  test('regeneration replaces an existing proposal only when the option is on', async () => {
    prepareActivityDevelopment.mockImplementation(async () => answer('nuova'));
    render(<View initial={{ d1: { aiProposal: { analysis: { solution: 'vecchia', acceptance: 'v' }, evidence: [], coverage: {} } } }} />);
    pick(1);
    fireEvent.click(screen.getByLabelText(/Rigenera anche/));
    run();
    await screen.findByText(/1 su 1 proposte preparate/);
    expect(latest.d1.aiProposal.analysis.solution).toBe('Soluzione nuova');
  });

  test('a failure on one activity does not lose the others and can be retried', async () => {
    prepareActivityDevelopment.mockImplementation(async ({ activity }) => { if (activity.description.endsWith('2')) throw new Error('Quota AI esaurita'); return answer(activity.description.slice(-1)); });
    render(<View />);
    pick(1); pick(2); pick(3);
    run();
    await screen.findByText(/2 su 3 proposte preparate/);
    expect(screen.getByText(/Quota AI esaurita/)).toBeInTheDocument();
    expect(latest.d1.aiProposal).toBeDefined(); expect(latest.d3.aiProposal).toBeDefined(); expect(latest.d2).toBeUndefined();
    prepareActivityDevelopment.mockImplementation(async () => answer('2'));
    fireEvent.click(screen.getByText('Riprova le 1 con errore'));
    await waitFor(() => expect(latest.d2?.aiProposal).toBeDefined());
  });

  test('stops after three consecutive failures instead of spending the whole quota', async () => {
    prepareActivityDevelopment.mockRejectedValue(new Error('Servizio AI non disponibile'));
    render(<View />);
    [1, 2, 3, 4, 5].forEach(pick);
    run();
    await screen.findByText(/interrotto dopo errori consecutivi/);
    expect(prepareActivityDevelopment).toHaveBeenCalledTimes(3);
  });

  test('cannot start without a source folder or without a selection', () => {
    render(<Panel items={items} plans={{}} onChange={() => {}} applications={[]} onSelectFiles={() => {}} sourceFiles={[]} />);
    expect(screen.getByText(/Prepara con AI le 0 attività selezionate/)).toBeDisabled();
    expect(screen.getByText('Seleziona prima la cartella dei sorgenti.', { selector: '.dev-batch .dev-hint' })).toBeInTheDocument();
  });

  test('selection helpers pick all visible or only those without a proposal', () => {
    render(<View initial={{ d1: { aiProposal: { analysis: {}, evidence: [], coverage: {} } } }} />);
    const count = () => document.querySelector('.dev-batch-count b').textContent;
    fireEvent.click(screen.getByText('Solo senza proposta'));
    expect(count()).toBe('4');
    fireEvent.click(screen.getByText(/Seleziona le 5 visibili/));
    expect(count()).toBe('5');
    fireEvent.click(screen.getByText('Deseleziona'));
    expect(count()).toBe('0');
  });
});
