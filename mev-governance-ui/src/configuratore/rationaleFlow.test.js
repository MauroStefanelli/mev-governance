import JSZip from 'jszip';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildCodeChangeRequest, implementationMarkdown } from './developmentPackages';
import { buildProjectPackage, newProjectPreparation } from './projectPackage';
import Panel from './ActivityDevelopmentPanel';
import { activitySourceContext } from './activitySourceContext';
import { prepareActivityDevelopment } from '../services/mevService';
jest.mock('./activitySourceContext', () => ({ activitySourceContext: jest.fn(), createSourceCache: () => new Map() }));
jest.mock('../services/mevService', () => ({ prepareActivityDevelopment: jest.fn(), generateActivityCode: jest.fn(), rationaleRequest: jest.fn() }));

const knowledge = [
  { id: 1, kind: 'vincolo', status: 'confermata', text: 'Nessuna modifica allo schema SAPLES', interventionId: 'OTT-4', decidedByFullName: 'Anna Rossi' },
  { id: 2, kind: 'razionale', status: 'confermata', text: 'Il chiamante può ritentare l’invio' },
  { id: 3, kind: 'decisione', status: 'proposta', text: 'PROPOSTA-NON-CONFERMATA' },
  { id: 4, kind: 'vincolo', status: 'scartata', text: 'SCARTATA' },
  { id: 5, kind: 'vincolo', status: 'revocata', text: 'REVOCATA' },
  { id: 6, kind: 'vincolo', status: 'confermata', text: 'Solo per altro intervento', interventionId: 'ALTRO' },
];
const evaluation = { initiative: { code: 'G1', title: 'Titolo', system: 'NPSO' }, contractId: 'C', lot: '2',
  items: [{ sourceRowId: 'd1', interventionId: 'OTT-4', imported: true, qty: 1, detail: { detailDescription: 'Attività uno' } }], importedInterventions: [], suggestions: [] };
const loaded = { evaluation, lot: '2', contractId: 'C' };
const files = zip => Object.keys(zip.files);
const text = async (zip, name) => zip.file(name).async('string');

test('the code-change ZIP carries only confirmed knowledge, in the request, plan and its own document', async () => {
  const { zip } = buildCodeChangeRequest({ loaded, plans: {}, delivery: { tool: 'vscode', branch: 'b', notes: '', tests: '' }, applications: [], approved: [{ id: 1, name: 'x' }], files: [{ name: 'A.java', webkitRelativePath: 'R/A.java' }], techProfile: null, knowledge });
  expect(files(zip)).toContain('RAZIONALI_E_VINCOLI.md');
  const document = await text(zip, 'RAZIONALI_E_VINCOLI.md');
  expect(document).toContain('Nessuna modifica allo schema SAPLES');
  const request = JSON.parse(await text(zip, 'richiesta_modifica_codice.json'));
  expect(request.confirmedRationale.map(entry => entry.text)).toEqual(['Nessuna modifica allo schema SAPLES', 'Il chiamante può ritentare l’invio', 'Solo per altro intervento']);
  for (const name of ['RAZIONALI_E_VINCOLI.md', 'richiesta_modifica_codice.json', 'piano_sviluppo.md']) {
    const content = await text(zip, name);
    ['PROPOSTA-NON-CONFERMATA', 'SCARTATA', 'REVOCATA'].forEach(word => expect(content).not.toContain(word));
  }
  expect(await text(zip, 'piano_sviluppo.md')).toContain('Razionali e vincoli confermati');
});

test('without confirmed knowledge the ZIP has no empty rationale document', () => {
  const { zip } = buildCodeChangeRequest({ loaded, plans: {}, delivery: { tool: 'vscode', branch: '', notes: '', tests: '' }, applications: [], approved: [{ id: 1 }], files: [{ name: 'A.java', webkitRelativePath: 'R/A.java' }], techProfile: null, knowledge: [knowledge[2]] });
  expect(files(zip)).not.toContain('RAZIONALI_E_VINCOLI.md');
  expect(implementationMarkdown({ loaded, delivery: {}, approved: [], knowledge: [] })).not.toContain('Razionali e vincoli');
});

test('the project package records confirmed knowledge in the manifest and in the docs', async () => {
  const result = await buildProjectPackage({ initiative: evaluation.initiative, preparation: { ...newProjectPreparation(), name: 'svc', objective: 'Obiettivo' }, items: evaluation.items, plans: {}, applications: [], workspaceContext: null, branch: '', knowledge });
  const manifest = JSON.parse(await result.zip.file('progetto.json').async('string'));
  expect(manifest.confirmedRationale).toHaveLength(3);
  expect(await result.zip.file('docs/RAZIONALI_E_VINCOLI.md').async('string')).toContain('Il chiamante può ritentare');
  expect(await result.zip.file('docs/RAZIONALI_E_VINCOLI.md').async('string')).not.toContain('SCARTATA');
});

describe('AI preparation of an activity sheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activitySourceContext.mockResolvedValue({ files: [{ path: 'A.java', startLine: 1, endLine: 5, sha256: 'abc', text: 'x' }], coverage: { notice: 'c' } });
    prepareActivityDevelopment.mockResolvedValue({ analysis: { solution: 's', acceptance: 'a', evidence: [] } });
  });
  function View() {
    const [plans, setPlans] = useState({});
    return <Panel items={evaluation.items} plans={plans} onChange={setPlans} applications={[]} onSelectFiles={() => {}} sourceFiles={[{ name: 'A.java' }]} knowledge={knowledge} />;
  }
  test('sends the AI only the confirmed knowledge that applies to the intervention of the activity', async () => {
    render(<View />);
    fireEvent.click(screen.getByText('Attività 1'));
    fireEvent.click(screen.getByText('Prepara scheda con AI'));
    await waitFor(() => expect(prepareActivityDevelopment).toHaveBeenCalled());
    const sent = prepareActivityDevelopment.mock.calls[0][0].confirmedRationale.map(entry => entry.text);
    expect(sent).toEqual(['Nessuna modifica allo schema SAPLES', 'Il chiamante può ritentare l’invio']);
  });
  test('shows the same knowledge inside the activity so the developer sees what guides it', () => {
    render(<View />);
    fireEvent.click(screen.getByText('Attività 1'));
    const box = screen.getByLabelText('Razionali e vincoli confermati per questa attività');
    expect(box).toHaveTextContent('Nessuna modifica allo schema SAPLES');
    expect(box).not.toHaveTextContent('Solo per altro intervento');
    expect(box).not.toHaveTextContent('PROPOSTA-NON-CONFERMATA');
  });
});
