import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfiguratorePage from './ConfiguratorePage';
import * as service from '../services/mevService';

jest.mock('../services/mevService', () => {
  const answers = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getConfiguratoreContracts: [], getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getTowImpatto: null, getReleaseSchedules: [] };
  const cache = {};
  return new Proxy({}, { get: (_, name) => {
    if (name === '__esModule') return true;
    if (!cache[name]) cache[name] = jest.fn(async () => (name in answers ? answers[name] : {}));
    return cache[name];
  } });
});
jest.mock('../configuratore/InitiativeConversation', () => () => null);

const SECTIONS = ['Dati iniziativa', 'Workspace documentale', 'Razionali e vincoli con l’AI', 'Soluzione', 'Analisi condivisa', 'Codice sorgente', 'Conoscenza dell’Iniziativa'];
const sectionButtons = () => [...document.querySelectorAll('.secrow-toggle')];
const row = title => sectionButtons().find(button => button.textContent.includes(title));
const mount = () => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Developer" roles={['Developer']} />);

const answers = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getConfiguratoreContracts: [], getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getTowImpatto: null, getReleaseSchedules: [] };
beforeEach(() => {
  localStorage.clear();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  Object.keys(answers).forEach(name => service[name].mockReset().mockImplementation(async () => answers[name]));
  service.rationaleRequest.mockReset().mockImplementation(async path => (String(path).startsWith('related') ? [] : { messages: [], hasMore: false, entries: [] }));
  service.libraryRequest.mockReset();
  service.historyImportRequest.mockReset().mockImplementation(async path => (String(path).startsWith('pending') ? { entries: [], hasMore: false, total: 0, bySystem: [] } : { filesRead: 0, withProposals: 0, pending: 0, confirmed: 0 }));
  service.ledgerRequest.mockReset().mockImplementation(async path => (/^\d+$/.test(String(path)) ? {} : { initiatives: [{ id: 5, key: 'k', goto: '145480', gotoPlaceholder: false, title: 'Add-on collaudo', system: 'NPSO', pmPoste: 'Lerro', status: 'approvata', release: 'R01.2027', revision: 1, archived: false, amounts: [] }], total: 1, shown: 1, counts: { approvata: 1 }, systems: ['NPSO'], pms: ['Lerro'], releases: ['R01.2027'], canWork: true }));
  service.rationaleRequest.mockImplementation(async path => (String(path).startsWith('related') ? [] : { messages: [], hasMore: false, entries: [] }));
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
  fireEvent.click(row('Conoscenza dell’Iniziativa'));
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

describe('Dati iniziativa: import button and PM Poste', () => {
  const field = name => screen.getByLabelText(name, { selector: 'select,input' });
  const openData = async () => { mount(); await waitFor(() => expect(sectionButtons()).toHaveLength(7)); };

  test('the offer import button lives inside Dati iniziativa, small, and not above the sections', async () => {
    await openData();
    const dataRow = row('Dati iniziativa').closest('.secrow');
    const button = screen.getByText('Importa Tabella di Offerta').closest('label');
    expect(dataRow).toContainElement(button);
    expect(button).toHaveClass('init-import');
    expect(button.compareDocumentPosition(sectionButtons()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeFalsy();
    expect(document.querySelectorAll('input[type="file"][accept=".xlsx"]')).toHaveLength(1);
  });

  test('the import button is still usable when the card is reopened, and the file input accepts only xlsx', async () => {
    await openData();
    const input = document.querySelector('input[type="file"][accept=".xlsx"]');
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  test('PM Poste sits next to Release and offers the names MEV and MEV-CAP already use', async () => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario', 'Bianchi Anna', 'rossi mario'] });
    await openData();
    const pm = await screen.findByLabelText('PM Poste', { selector: 'select' });
    const labels = [...document.querySelectorAll('.secrow label')].map(l => l.firstChild?.textContent?.trim());
    expect(labels.indexOf('PM Poste')).toBe(labels.indexOf('Release') + 1);
    expect([...pm.options].map(o => o.textContent)).toEqual(['— nessuno —', 'Bianchi Anna', 'Rossi Mario', 'Altro (testo libero)…']);
  });

  test('choosing a PM fills the initiative and appears in the closed row', async () => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario', 'Bianchi Anna'] });
    await openData();
    fireEvent.change(await screen.findByLabelText('PM Poste', { selector: 'select' }), { target: { value: 'Rossi Mario' } });
    expect(field('PM Poste')).toHaveValue('Rossi Mario');
    expect(row('Dati iniziativa')).toHaveTextContent('PM Rossi Mario');
  });

  test('"other" opens a free-text box for a project manager not yet in MEV', async () => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario'] });
    await openData();
    fireEvent.change(await screen.findByLabelText('PM Poste', { selector: 'select' }), { target: { value: '__altro__' } });
    const free = await screen.findByLabelText('PM Poste (testo libero)');
    fireEvent.change(free, { target: { value: 'Verdi Luca' } });
    expect(row('Dati iniziativa')).toHaveTextContent('PM Verdi Luca');
    expect(screen.getByLabelText('PM Poste', { selector: 'select' })).toHaveValue('__altro__');
  });

  test('if MEV options are not available PM Poste still works as a text field', async () => {
    service.getMevOptions.mockRejectedValue(new Error('401'));
    await openData();
    const input = await screen.findByLabelText('PM Poste', { selector: 'input' });
    fireEvent.change(input, { target: { value: 'Solo Testo' } });
    expect(input).toHaveValue('Solo Testo');
    expect(row('Dati iniziativa')).toHaveTextContent('PM Solo Testo');
  });

  test('a new initiative starts with no PM Poste', async () => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario'] });
    await openData();
    expect(await screen.findByLabelText('PM Poste', { selector: 'select' })).toHaveValue('');
    expect(row('Dati iniziativa')).not.toHaveTextContent('PM ');
  });
});

describe('PM Poste survives reopening a saved offer', () => {
  const saved = pm => ({ record_key: 'C1|2|initiative|goto-9', entity_type: 'initiative_evaluation', contract_id: 'C1', lot_id: '2', title: 'GOTO-9 · Invio',
    payload: JSON.stringify({ version: 6, lot: '2', initiative: { code: 'GOTO-9', title: 'Invio', system: 'NPSO', contractType: '', release: '', pmPoste: pm, requirements: '', description: '' }, items: [], importedInterventions: [] }) });

  test.each([['a listed name', 'Rossi Mario', 'select'], ['a name MEV does not list', 'Verdi Luca', 'select']])('reopening an offer saved with %s restores it', async (label, pm) => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario', 'Bianchi Anna'] });
    service.getConfiguratoreRecords.mockImplementation(async params => ({ records: params.entity_type === 'initiative_evaluation' ? [saved(pm)] : [] }));
    mount();
    await waitFor(() => expect(sectionButtons()).toHaveLength(7));
    fireEvent.click(await screen.findByRole('button', { name: /Archivio iniziative/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Seleziona iniziativa GOTO-9 Invio' }));
    await waitFor(() => expect(row('Dati iniziativa')).toHaveTextContent(`PM ${pm}`));
    expect(screen.getByLabelText('PM Poste', { selector: 'select' })).toHaveValue(pm === 'Rossi Mario' ? 'Rossi Mario' : '__altro__');
    if (pm !== 'Rossi Mario') expect(screen.getByLabelText('PM Poste (testo libero)')).toHaveValue('Verdi Luca');
  });

  test('an offer saved before PM Poste existed opens with the field empty, not undefined', async () => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario'] });
    const old = saved(undefined); const parsed = JSON.parse(old.payload); delete parsed.initiative.pmPoste; old.payload = JSON.stringify(parsed);
    service.getConfiguratoreRecords.mockImplementation(async params => ({ records: params.entity_type === 'initiative_evaluation' ? [old] : [] }));
    mount();
    await waitFor(() => expect(sectionButtons()).toHaveLength(7));
    fireEvent.click(await screen.findByRole('button', { name: /Archivio iniziative/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Seleziona iniziativa GOTO-9 Invio' }));
    await waitFor(() => expect(row('Dati iniziativa')).toHaveTextContent('GOTO GOTO-9'));
    expect(screen.getByLabelText('PM Poste', { selector: 'select' })).toHaveValue('');
    expect(row('Dati iniziativa')).not.toHaveTextContent('PM ');
  });
});

describe('PM Poste survives reopening a shared analysis revision', () => {
  const revision = pm => ({ id: 7, goto: 'GOTO-9', version: 3, author: 'anna', createdAt: '2026-05-04T10:00:00Z', reason: 'r',
    payload: JSON.stringify({ title: 'Invio', system: 'NPSO', decisions: [], estimate: { initiative: { code: 'GOTO-9', title: 'Invio', system: 'NPSO', pmPoste: pm }, items: [], importedInterventions: [] } }) });

  test('the PM Poste saved in the revision snapshot comes back when the analysis is reopened', async () => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario', 'Bianchi Anna'] });
    service.workspaceRequest.mockImplementation(async path => (path === '' ? [revision('Bianchi Anna')] : []));
    mount();
    await waitFor(() => expect(sectionButtons()).toHaveLength(7));
    fireEvent.click(await screen.findByRole('button', { name: /Archivio iniziative/ }));
    fireEvent.click(await screen.findByText('Revisione 3', { exact: false }));
    await waitFor(() => expect(row('Dati iniziativa')).toHaveTextContent('PM Bianchi Anna'));
    expect(screen.getByLabelText('PM Poste', { selector: 'select' })).toHaveValue('Bianchi Anna');
  });

  test('a revision whose PM Poste was typed in the old analysis field is not lost', async () => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario', 'Bianchi Anna'] });
    const legacy = revision(undefined); const parsed = JSON.parse(legacy.payload); delete parsed.estimate.initiative.pmPoste; parsed.pmPoste = 'Rossi Mario'; legacy.payload = JSON.stringify(parsed);
    service.workspaceRequest.mockImplementation(async path => (path === '' ? [legacy] : []));
    mount();
    await waitFor(() => expect(sectionButtons()).toHaveLength(7));
    fireEvent.click(await screen.findByRole('button', { name: /Archivio iniziative/ }));
    fireEvent.click(await screen.findByText('Revisione 3', { exact: false }));
    await waitFor(() => expect(row('Dati iniziativa')).toHaveTextContent('PM Rossi Mario'));
    expect(screen.getByLabelText('PM Poste', { selector: 'select' })).toHaveValue('Rossi Mario');
  });

  test('the PM Poste of the initiative wins over an old analysis value when both exist', async () => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario', 'Bianchi Anna'] });
    const both = revision('Bianchi Anna'); const parsed = JSON.parse(both.payload); parsed.pmPoste = 'Rossi Mario'; both.payload = JSON.stringify(parsed);
    service.workspaceRequest.mockImplementation(async path => (path === '' ? [both] : []));
    mount();
    await waitFor(() => expect(sectionButtons()).toHaveLength(7));
    fireEvent.click(await screen.findByRole('button', { name: /Archivio iniziative/ }));
    fireEvent.click(await screen.findByText('Revisione 3', { exact: false }));
    await waitFor(() => expect(row('Dati iniziativa')).toHaveTextContent('PM Bianchi Anna'));
  });

  test('a revision saved before PM Poste existed opens with the field empty', async () => {
    service.getMevOptions.mockResolvedValue({ pmPoste: ['Rossi Mario'] });
    const old = revision(undefined); const parsed = JSON.parse(old.payload); delete parsed.estimate.initiative.pmPoste; old.payload = JSON.stringify(parsed);
    service.workspaceRequest.mockImplementation(async path => (path === '' ? [old] : []));
    mount();
    await waitFor(() => expect(sectionButtons()).toHaveLength(7));
    fireEvent.click(await screen.findByRole('button', { name: /Archivio iniziative/ }));
    fireEvent.click(await screen.findByText('Revisione 3', { exact: false }));
    await waitFor(() => expect(row('Dati iniziativa')).toHaveTextContent('GOTO GOTO-9'));
    expect(screen.getByLabelText('PM Poste', { selector: 'select' })).toHaveValue('');
  });
});

describe('Storico delle iniziative', () => {
  test('the icon sits in the page header next to the manual and shows the total without opening', async () => {
    mount();
    const trigger = await screen.findByRole('button', { name: /Storico iniziative/ });
    expect(trigger.closest('.tow-heading-top')).not.toBeNull();
    expect(await screen.findByText('1 iniziative')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Storico delle iniziative' })).not.toBeInTheDocument();
  });

  test('"Apri nel Configuratore" fills the identifying fields of the initiative from the ledger record', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Storico iniziative/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Storico delle iniziative' });
    service.ledgerRequest.mockImplementation(async path => (/^\d+$/.test(String(path)) ? { initiative: { id: 5, goto: '145480', gotoPlaceholder: false, title: 'Add-on collaudo', system: 'NPSO', pmPoste: 'Lerro', status: 'approvata', release: 'R01.2027', revision: 1, amounts: [] }, events: [] } : {}));
    fireEvent.click(await within(dialog).findByRole('button', { name: /Add-on collaudo/ }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Apri nel Configuratore' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Storico delle iniziative' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByDisplayValue('145480')).toBeInTheDocument());
    expect(screen.getAllByDisplayValue('Add-on collaudo').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('PM Poste', { selector: 'input' })).toHaveValue('Lerro');
    expect(row('Dati iniziativa')).toHaveTextContent('145480');
  });

  test('a user who cannot work on initiatives sees the ledger but not the import', async () => {
    render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Client" roles={['Client']} />);
    fireEvent.click(await screen.findByRole('button', { name: /Storico iniziative/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Storico delle iniziative' });
    expect(await within(dialog).findByText('Add-on collaudo')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Importa file .md' })).not.toBeInTheDocument();
  });

  test('the historical knowledge import is offered only to those who can work on initiatives', async () => {
    const { unmount } = render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Client" roles={['Client']} />);
    fireEvent.click(await screen.findByRole('button', { name: /Conoscenza storica AI/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Conoscenza storica AI' });
    expect(within(dialog).queryByLabelText('Zip della cartella')).not.toBeInTheDocument();
    unmount();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Conoscenza storica AI/ }));
    expect(await screen.findByLabelText('Zip della cartella')).toBeInTheDocument();
  });
  test('the historical knowledge button sits in the page header next to the history', async () => {
    mount();
    const history = await screen.findByRole('button', { name: /Storico iniziative/ });
    const knowledge = await screen.findByRole('button', { name: /Conoscenza storica AI/ });
    expect(knowledge.parentElement).toBe(history.parentElement); expect(knowledge.closest('.tow-heading-top')).not.toBeNull();
  });
});

describe('one list of contracts (the system contract lives in the Archivio)', () => {
  const cat = n => Array.from({ length: n }, (_, i) => ({ id: `V${i}`, ambito: 'A', nome: `Voce ${i}`, prezzi: { REALIZZAZIONE: { Semplice: 100, Medio: 200, Complesso: 300 }, MODIFICA: { Semplice: 50, Medio: 100, Complesso: 150 } } }));
  const system = { contractId: 'poste-tet-2025', name: 'Poste Italiane – Tracciatura e Logistica Integrata', builtin: true, lots: [
    { lotId: '1', name: 'Lotto 1 – Postali', active: false, catalog: cat(3), towPrices: {} },
    { lotId: '2', name: 'Lotto 2 – TOW', active: true, catalog: cat(27), towPrices: { 'TOW02.1': 1, 'TOW02.2': 2, 'TOW02.3': 3, 'TOW02.4': 4, 'TOW02.5': 5 }, codiceContratto: 'C1' }] };
  const catalogSelect = () => screen.findByLabelText('Contratto del catalogo');
  const openResources = async () => { mount(); const select = await catalogSelect(); return select; };

  test('the contract is offered ONCE, with its real name, and no "built-in" or "incluso nell\'app" wording anywhere', async () => {
    service.getConfiguratoreContracts.mockResolvedValue([system]);
    const select = await openResources();
    await waitFor(() => expect([...select.options].map(o => o.textContent)).toEqual(['Poste Italiane – Tracciatura e Logistica Integrata']));
    expect(document.body.textContent).not.toMatch(/built-in|incluso nell’app|catalogo di sistema/i);
  });
  test('the environment code picks the right contract and the active Lotto 2 by itself', async () => {
    service.getConfiguratoreContracts.mockResolvedValue([system]);
    const select = await openResources(); await waitFor(() => expect(select).toHaveValue('poste-tet-2025'));
    const lot = screen.getByLabelText('Lotto catalogo'); await waitFor(() => expect(lot).toHaveValue('2'));
    expect([...lot.options].map(o => o.textContent)).toEqual(['Lotto 2 – TOW']);
  });
  test('with other contracts present the system one is still listed once and the others follow', async () => {
    service.getConfiguratoreContracts.mockResolvedValue([system, { contractId: 'altro', name: 'Altro contratto', lots: [{ lotId: '1', name: 'L1', active: true, catalog: cat(2), towPrices: {} }] }]);
    const select = await openResources();
    await waitFor(() => expect([...select.options].map(o => o.value)).toEqual(['poste-tet-2025', 'altro']));
  });
  test('when the Archivio does not hold the system contract the bundled copy is a clearly marked safety net', async () => {
    service.getConfiguratoreContracts.mockResolvedValue([{ contractId: 'altro', name: 'Altro contratto', lots: [{ lotId: '1', name: 'L1', active: true, catalog: cat(2), towPrices: {} }] }]);
    const select = await openResources();
    await waitFor(() => expect([...select.options].map(o => o.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/Poste TeT · copia di riserva/)])));
    expect(document.body.textContent).not.toMatch(/built-in|incluso nell’app/i);
  });

  test('reopening a saved offer keeps the catalog locked, explains why and says how to unlock it', async () => {
    const saved = { Id: 'r1', record_key: 'C1|2|initiative|145480', record_key_: 'x', title: '145480 · Add-on', lot_id: '2', payload: JSON.stringify({ version: 6, lot: '2', catalogSource: { contractId: 'poste-tet-2025', lot: '2' },
      initiative: { code: '145480', title: 'Add-on', system: 'NPSO' }, items: [{ key: 'a', id: 'V1', type: 'REALIZZAZIONE', complexity: 'Medio', qty: 1, selected: true }, { key: 'b', id: 'V2', type: 'MODIFICA', complexity: 'Semplice', qty: 2, selected: true }] }) };
    service.getConfiguratoreContracts.mockResolvedValue([system]);
    service.getConfiguratoreRecords.mockImplementation(async params => (params?.entity_type === 'initiative_evaluation' ? { records: [saved] } : { records: [] }));
    mount(); fireEvent.click(await screen.findByRole('button', { name: /Archivio iniziative/ })); fireEvent.click(await screen.findByRole('button', { name: /Seleziona iniziativa 145480/ }));
    const select = await screen.findByLabelText('Contratto del catalogo'); await waitFor(() => expect(select).toBeDisabled()); expect(screen.getByLabelText('Lotto catalogo')).toBeDisabled();
    const note = await screen.findByText(/Catalogo e lotto non si possono cambiare/);
    expect(note).toHaveTextContent('2 voci aggiunte'); expect(note).toHaveTextContent('rimuovi tutte le voci dal passo Offerta'); expect(note).toHaveTextContent('+ Nuova Iniziativa'); expect(note).not.toHaveTextContent(/built-in|Poste TeT/);
  });
  test('with no rows the catalog choice is free and no lock message is shown', async () => {
    service.getConfiguratoreContracts.mockResolvedValue([system]); mount();
    const select = await screen.findByLabelText('Contratto del catalogo'); expect(select).toBeEnabled(); expect(screen.queryByText(/Catalogo e lotto non si possono cambiare/)).not.toBeInTheDocument();
  });
});

