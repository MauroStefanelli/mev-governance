import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
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
  expect(await screen.findByText(/Non ci sono ancora interventi/)).toBeVisible();
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
    // due modi di importare, accanto: la Tabella di Offerta (come prima) e l'Estimatore Catalogo
    expect(document.querySelectorAll('input[type="file"][accept=".xlsx"]')).toHaveLength(2);
    const estimator = screen.getByText('Importa da Estimatore Catalogo').closest('label');
    expect(dataRow).toContainElement(estimator);
    expect(estimator).toHaveClass('init-import');
    expect(button.nextElementSibling).toBe(estimator);
    expect(screen.getByLabelText('Importa da Estimatore Catalogo')).toHaveAttribute('accept', '.xlsx');
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
    expect(within(dialog).queryByLabelText('Archivio della cartella')).not.toBeInTheDocument();
    unmount();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Conoscenza storica AI/ }));
    expect(await screen.findByLabelText('Archivio della cartella')).toBeInTheDocument();
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


// ---- the application chosen for the initiative is the system the AI is told about ----
const ILP_APP = { id: 'application-1', name: 'ILP', code: 'ILP', systemAliases: ['ILP'], languages: ['Java'], databases: ['PostgreSQL'], extraTechnologies: [], notes: 'NOTA RISERVATA', codeUrl: '/Users/x/ILP',
  techProfile: { components: ['ILP_frontend', 'ILP_BACKEND_item-service', 'ILP_BACKEND_hu-transport-app'], technologies: ['Java'], frameworks: ['Angular'], integrations: ['Kafka'], totalFiles: 5447 } };
const chooseApplication = async name => {
  const select = await screen.findByDisplayValue('+ Aggiungi applicativo…');
  const option = [...select.querySelectorAll('option')].find(o => o.textContent.startsWith(name)); fireEvent.change(select, { target: { value: option.value } });
};

test('choosing an application fills the Sistema field, so the AI is told which system the initiative is about', async () => {
  service.getSharedApplications.mockImplementation(async () => [ILP_APP]);
  service.rationaleRequest.mockImplementation(async path => (String(path).startsWith('related') ? [] : path === 'messages' ? { question: { id: 1, role: 'user', text: 'q', createdAt: new Date().toISOString(), mine: true }, answer: { id: 2, role: 'assistant', text: 'ok', createdAt: new Date().toISOString() }, proposals: [], questions: [] } : { messages: [], hasMore: false, entries: [] }));
  mount(); await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '145480' } });
  expect(screen.queryByTitle('Valorizzato dal file Excel importato')).not.toBeInTheDocument();       // Sistema vuoto prima della scelta
  await chooseApplication('ILP');
  expect(await screen.findByTitle('Valorizzato dal file Excel importato')).toHaveValue('ILP');         // ora e' compilato
  fireEvent.click(row('Razionali e vincoli con l’AI')); await screen.findByLabelText('Messaggio per l’AI');
  fireEvent.change(screen.getByLabelText('Messaggio per l’AI'), { target: { value: 'Dove si stampa H7?' } }); fireEvent.click(screen.getByRole('button', { name: 'Invia all’AI' }));
  await waitFor(() => expect(service.rationaleRequest.mock.calls.some(([path]) => path === 'messages')).toBe(true));
  const body = service.rationaleRequest.mock.calls.find(([path]) => path === 'messages')[1];
  expect(body.system).toBe('ILP'); expect(body.applications).toHaveLength(1); expect(body.applications[0]).toMatchObject({ name: 'ILP', totalComponents: 3, technologies: expect.arrayContaining(['Java', 'Angular']) });
  expect(body.applications[0].filesByComponent.every(row => row.files === 0)).toBe(true);
  expect(JSON.stringify(body)).not.toContain('NOTA RISERVATA'); expect(JSON.stringify(body)).not.toContain('/Users/x/ILP');
});

test('removing the application clears the Sistema field it had filled and stops sending it', async () => {
  service.getSharedApplications.mockImplementation(async () => [ILP_APP]);
  mount(); await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '145480' } }); await chooseApplication('ILP');
  await screen.findByTitle('Valorizzato dal file Excel importato'); fireEvent.click(screen.getByRole('button', { name: '×' }));
  await waitFor(() => expect(screen.queryByTitle('Valorizzato dal file Excel importato')).not.toBeInTheDocument());
});

// ---- the whole path the user asked for: no Offer Table, shared rationale, an application, interventions proposed by the AI and confirmed, the file for Visual Studio Code ----
test('without an Offer Table: the rationale is confirmed, the AI proposes the interventions tied to the catalogue, the team confirms one and the file for Visual Studio Code is built', async () => {
  service.getSharedApplications.mockImplementation(async () => [ILP_APP]);
  const confirmedEntry = { id: 7, goto: 'goto-1', kind: 'vincolo', status: 'confermata', text: 'Mantenere l’esclusione del CHA per le PDDP', byAi: false, createdBy: 'io', createdByFullName: 'Io', createdAt: new Date().toISOString(), decidedBy: 'io', decidedAt: new Date().toISOString() };
  service.rationaleRequest.mockImplementation(async path => (String(path).startsWith('related') ? [] : { messages: [], hasMore: false, entries: [confirmedEntry] }));
  service.proposeInterventions.mockReset().mockResolvedValue({ interventions: [{ title: 'Adeguare la stampa H7', description: 'Consentire la stampa immediata', activity: 'Stampa', system: 'ILP', components: ['ILP_BACKEND_print-app'], rationaleIds: [7],
    mappings: [{ catalogId: 236, name: 'Realizzazione Single Page Application', ambit: 'Frontend', type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 2, unit: 4800, component: 'ILP_frontend', technology: 'Angular', why: 'maschera' }] }], rejected: [], notes: [], missing: [] });
  const urls = []; const blobs = []; window.URL.createObjectURL = jest.fn(blob => { blobs.push(blob); return 'blob:x'; }); window.URL.revokeObjectURL = jest.fn(); jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { urls.push(this.download); });
  mount(); await waitFor(() => expect(sectionButtons()).toHaveLength(7));
  fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: 'GOTO-1' } }); fireEvent.change(screen.getByLabelText('Titolo', { selector: 'input' }), { target: { value: 'Stampa LDV gialle' } });
  await chooseApplication('ILP'); await screen.findByTitle('Valorizzato dal file Excel importato');
  fireEvent.click(row('Soluzione'));
  const ask = await screen.findByRole('button', { name: 'Proponi gli interventi con l’AI' });
  await waitFor(() => expect(ask).toBeEnabled());
  expect(screen.getByText(/Non serve la Tabella di Offerta/)).toBeInTheDocument(); expect(screen.queryByText(/L’offerta non ha ancora interventi/)).not.toBeInTheDocument();
  fireEvent.click(ask); await waitFor(() => expect(service.proposeInterventions).toHaveBeenCalledTimes(1));
  const body = service.proposeInterventions.mock.calls[0][0];
  expect(body).toMatchObject({ goto: 'GOTO-1', system: 'ILP', applications: [{ name: 'ILP', totalComponents: 3 }] }); expect(body.catalog.length).toBeGreaterThan(5); expect(body.catalog.every(entry => entry.id > 0 && entry.nome && entry.prezzi)).toBe(true);
  fireEvent.click(within(await screen.findByRole('article', { name: 'Intervento proposto P-1' })).getByRole('button', { name: 'Conferma l’intervento' }));
  expect(await screen.findByRole('button', { name: /P-1.*Adeguare la stampa H7/ })).toBeInTheDocument();
  await waitFor(() => expect(row('Soluzione')).toHaveTextContent('1 intervento proposto confermato'));
  fireEvent.click(screen.getByRole('button', { name: 'Scarica MD per Visual Studio Code' })); await waitFor(() => expect(blobs).toHaveLength(1));
  const md = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blobs[0]); });
  expect(urls[0]).toMatch(/^SOLUZIONE_GOTO-1/); expect(md).toContain('P-1 — Adeguare la stampa H7'); expect(md).toContain('Mantenere l’esclusione del CHA per le PDDP'); expect(md).toContain('- [ ] Realizzare: Realizzazione Single Page Application'); expect(md).toContain('ILP_BACKEND_print-app');
});


describe('the Excel model of the Offer Table in the Revisione step', () => {
  const mountAs = roles => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role={roles[0]} roles={roles} />);
  const open = async () => { await waitFor(() => expect(sectionButtons()).toHaveLength(7)); fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: 'G1' } }); fireEvent.click(screen.getByRole('button', { name: /4\. Revisione/ })); return screen.findByLabelText('Generazione Tabella di offerta'); };
  beforeEach(() => { service.offerTemplateStatus.mockReset().mockResolvedValue({ current: { Version: 2, FileName: 'Tabella Offerta.xlsx', UploadedBy: 'anna', UploadedByFullName: 'Anna Rossi', UploadedAt: '2026-11-13T09:30:00Z' }, previous: [] }); });
  test('a developer sees the model of the lot and can update it', async () => {
    mountAs(['Developer']); const section = await open();
    expect(await within(section).findByText(/versione 2 · salvato da Anna Rossi/)).toBeInTheDocument();
    expect(within(section).getByText('Aggiorna il modello (nuova versione)')).toBeInTheDocument();
    expect(service.offerTemplateStatus).toHaveBeenCalledWith('2');
  });
  test('a Bid Manager sees the model and can export from it, but cannot update it', async () => {
    mountAs(['Bid Manager']); const section = await open();
    expect(await within(section).findByText(/versione 2 · salvato da Anna Rossi/)).toBeInTheDocument();
    expect(within(section).queryByText('Aggiorna il modello (nuova versione)')).not.toBeInTheDocument();
  });
});

describe('saving twice in a row never conflicts with yourself', () => {
  let revisions; let posts;
  const toastText = () => document.body.textContent;
  const mountAs = () => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Developer" roles={['Developer']} />);
  beforeEach(() => {
    localStorage.setItem('XUSER', 'MSTEFANE');
    revisions = [{ id: 1, version: 1, author: 'MSTEFANE', createdAt: '2026-11-17T09:00:00Z', reason: 'Prima', payload: JSON.stringify({ title: 'T', system: '', decisions: [], estimate: {} }) }]; posts = [];
    service.workspaceRequest.mockReset().mockImplementation(async (path, body) => {
      if (String(path).startsWith('related')) return [];
      if (!body) return [...revisions].sort((a, b) => b.version - a.version);
      const latest = Math.max(...revisions.map(revision => revision.version));
      if (body.expectedVersion !== latest) throw Object.assign(new Error('Un collega ha salvato una nuova revisione. Confrontala prima di salvare.'), { status: 409 });
      posts.push(body); const saved = { id: revisions.length + 1, version: body.expectedVersion + 1, author: 'MSTEFANE', createdAt: new Date().toISOString(), reason: body.reason, payload: JSON.stringify(body.state) };
      revisions.push(saved); return saved;
    });
    service.developmentRequest.mockReset().mockImplementation(async path => (path === 'presence' ? { users: [], messages: [], lastWorked: null } : path.startsWith('chat') ? { messages: [], hasMore: false } : {}));
    service.upsertConfiguratoreRecord.mockReset().mockImplementation(async body => ({ ...body, payload: JSON.stringify(body.payload) }));
  });
  const openInitiative = async () => {
    mountAs(); await waitFor(() => expect(sectionButtons()).toHaveLength(7));
    fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value: '146023' } });
    await waitFor(() => expect(service.workspaceRequest).toHaveBeenCalledWith('146023/revisions'));
    await waitFor(() => expect(screen.getAllByText(/Revisione di lavoro: 1/).length).toBeGreaterThan(0));
  };
  test('going to Revisione saves a draft, and Save and Close right after it is not a conflict', async () => {
    await openInitiative();
    fireEvent.click(screen.getByRole('button', { name: /4\. Revisione/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Salva e Chiudi' }));
    await waitFor(() => expect(posts.length > 1 || /Salvataggio non riuscito/.test(toastText())).toBe(true));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(toastText()).not.toContain('Salvataggio non riuscito'); expect(posts.map(post => post.expectedVersion)).toEqual([1, 2]);
  });
  test('Save and Close shows a progress window right away, keeps the page open and closes it only when the save succeeded', async () => {
    await openInitiative();
    // Il server e' lento: la finestra deve restare visibile finche' non risponde.
    let answer; service.upsertConfiguratoreRecord.mockImplementation(body => new Promise(resolve => { answer = () => resolve({ ...body, payload: JSON.stringify(body.payload) }); }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva e Chiudi' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Salvataggio dell’iniziativa in corso');
    expect(screen.getByRole('button', { name: /Salvataggio…/ })).toBeDisabled();
    await waitFor(() => expect(answer).toBeDefined());
    expect(screen.getByRole('dialog')).toHaveTextContent('Salvo l’offerta');
    expect(screen.getByText('Controllo lo storico condiviso').closest('li')).toHaveClass('is-done');
    answer();
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Salvataggio completato'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 3000 });
    expect(screen.getByRole('button', { name: 'Salva e Chiudi' })).toBeEnabled();
  });
  test('Save and Close that fails leaves a window with the reason and does not close the initiative', async () => {
    await openInitiative();
    revisions.push({ id: 9, version: 2, author: 'MFABBRI', createdAt: '2026-11-17T09:30:00Z', reason: 'Altro', payload: JSON.stringify({ title: 'T', system: '', decisions: [], estimate: {} }) });
    fireEvent.click(screen.getByRole('button', { name: 'Salva e Chiudi' }));
    const failed = await screen.findByRole('alertdialog');
    expect(failed).toHaveTextContent('Salvataggio non riuscito');
    expect(failed).toHaveTextContent('MFABBRI ha aggiornato lo storico');
    expect(screen.getByLabelText('Codice GOTO')).toHaveValue('146023');
    fireEvent.click(screen.getByRole('button', { name: 'Ho capito' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Salva e Chiudi' })).toBeEnabled();
    expect(screen.getByLabelText('Codice GOTO')).toHaveValue('146023');
  });
  test('two clicks in the same instant start ONE save (the guard works even before the page redraws)', async () => {
    await openInitiative();
    let answer; service.upsertConfiguratoreRecord.mockImplementation(body => new Promise(resolve => { answer = () => resolve({ ...body, payload: JSON.stringify(body.payload) }); }));
    const button = screen.getByRole('button', { name: 'Salva e Chiudi' });
    act(() => { button.click(); button.click(); button.click(); });
    await waitFor(() => expect(answer).toBeDefined());
    answer();
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Salvataggio completato'));
    expect(service.upsertConfiguratoreRecord).toHaveBeenCalledTimes(1);
  });
  test('a second click on Save and Close while it is saving does not start a second save', async () => {
    await openInitiative();
    const button = screen.getByRole('button', { name: 'Salva e Chiudi' });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Salvataggio completato'));
    expect(service.upsertConfiguratoreRecord).toHaveBeenCalledTimes(1);
  });
  test('two saves started together are done one after the other, each from the version the previous one made', async () => {
    await openInitiative();
    fireEvent.click(screen.getByRole('button', { name: /4\. Revisione/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva e Chiudi' }));
    await waitFor(() => expect(posts.length > 1 || /Salvataggio non riuscito/.test(toastText())).toBe(true));
    expect(toastText()).not.toContain('Salvataggio non riuscito'); expect(posts.map(post => post.expectedVersion)).toEqual([1, 2]);
  });
  test('a real colleague save is still reported, with who saved and when', async () => {
    await openInitiative();
    revisions.push({ id: 9, version: 2, author: 'MFABBRI', createdAt: '2026-11-17T09:30:00Z', reason: 'Altro', payload: JSON.stringify({ title: 'T', system: '', decisions: [], estimate: {} }) });
    fireEvent.click(screen.getByRole('button', { name: /4\. Revisione/ }));
    await waitFor(() => expect(toastText()).toContain('Salvataggio non riuscito'));
    expect(toastText()).toContain('MFABBRI ha aggiornato lo storico il 17/11'); expect(toastText()).toContain('versione 2, la tua pagina è ferma alla 1'); expect(posts).toHaveLength(0);
  });
});

describe('who else works on the same GOTO, and the chat', () => {
  const colleague = { username: 'mfabbri', fullName: 'Marco Fabbri', isMe: false }; const me = { username: 'mstefane', fullName: 'Mauro Stefanelli', isMe: true };
  let presence;
  const mountAs = roles => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role={roles[0]} roles={roles} />);
  const typeGoto = async value => { await waitFor(() => expect(sectionButtons()).toHaveLength(7)); fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value } }); };
  const panel = () => document.querySelector('.dev-collab');
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true }); localStorage.setItem('XUSER', 'mstefane');
    presence = { users: [me, colleague], messages: [{ id: 1, author: 'mfabbri', authorFullName: 'Marco Fabbri', createdAt: new Date().toISOString(), text: 'Sto rivedendo le TOW', mine: false }], lastWorked: { by: 'mfabbri', fullName: 'Marco Fabbri', at: new Date().toISOString(), isMe: false } };
    service.developmentRequest.mockReset().mockImplementation(async (path, body) => {
      if (path === 'presence') return presence; if (String(path).startsWith('chat') && !body) return { messages: presence.messages, hasMore: false };
      if (path === 'chat') return { id: 2, author: 'mstefane', authorFullName: 'Mauro Stefanelli', createdAt: new Date().toISOString(), text: body.text, mine: true }; return {};
    });
  });
  afterEach(() => { jest.useRealTimers(); });
  const settle = async () => { await act(async () => { jest.advanceTimersByTime(1500); }); };
  test('with no GOTO nothing is shown and nothing is registered', async () => {
    mountAs(['Developer']); await waitFor(() => expect(sectionButtons()).toHaveLength(7)); await settle();
    expect(panel()).toBeNull(); expect(service.developmentRequest).not.toHaveBeenCalledWith('presence', expect.anything());
  });
  test('typing the GOTO shows the colleagues connected to it and their chat, once the code has settled', async () => {
    mountAs(['Developer']); await typeGoto('146023');
    expect(panel()).toBeNull(); await settle();
    expect(await screen.findByText('1 collega collegato')).toBeInTheDocument();
    expect(screen.getByText(/Marco Fabbri sta lavorando su questa iniziativa/)).toBeInTheDocument(); expect(screen.getByText(/L’analisi e la stima si salvano per intero: coordinatevi nella chat prima di salvare, altrimenti il salvataggio di uno può essere rifiutato/)).toBeInTheDocument();
    expect(screen.queryByText('Sto rivedendo le TOW')).not.toBeInTheDocument(); expect(document.querySelector('.dev-collab-toggle')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(document.querySelector('.dev-collab-toggle'));
    expect(await screen.findByText('Sto rivedendo le TOW')).toBeInTheDocument(); expect(screen.getByText(/è la stessa di Sviluppo iniziative: è conservata per questo codice GOTO/)).toBeInTheDocument(); expect(document.body.textContent).not.toContain('Le schede si salvano per intero');
    expect(service.developmentRequest).toHaveBeenCalledWith('presence', expect.objectContaining({ goto: '146023' }));
  });
  test('the code is not registered while it is still being typed', async () => {
    mountAs(['Developer']); await waitFor(() => expect(sectionButtons()).toHaveLength(7));
    for (const value of ['1', '14', '146', '1460']) { fireEvent.change(screen.getByLabelText('Codice GOTO'), { target: { value } }); await act(async () => { jest.advanceTimersByTime(300); }); }
    await settle();
    const goto = service.developmentRequest.mock.calls.filter(([path]) => path === 'presence').map(([, body]) => body.goto);
    expect(goto.length).toBeGreaterThan(0); expect(new Set(goto)).toEqual(new Set(['1460']));
  });
  test('a message sent from the Configuratore goes to the chat of that GOTO', async () => {
    mountAs(['Developer']); await typeGoto('146023'); await settle(); await screen.findByText('1 collega collegato'); fireEvent.click(document.querySelector('.dev-collab-toggle')); await screen.findByText('Sto rivedendo le TOW');
    fireEvent.change(screen.getByLabelText('Messaggio per i colleghi'), { target: { value: 'Salvo io' } }); fireEvent.click(screen.getByRole('button', { name: 'Invia' }));
    await waitFor(() => expect(service.developmentRequest).toHaveBeenCalledWith('chat', { goto: '146023', text: 'Salvo io' }));
  });
  test('who joins later is announced with a notice, and the page keeps working', async () => {
    presence = { ...presence, users: [me] }; mountAs(['Developer']); await typeGoto('146023'); await settle(); await screen.findByText('Nessun altro collegato');
    presence = { ...presence, users: [me, colleague] }; await act(async () => { jest.advanceTimersByTime(16000); });
    expect(await screen.findByText('1 collega collegato')).toBeInTheDocument(); expect(document.body.textContent).toContain('Marco Fabbri si è collegato a questa iniziativa.');
  });
  test('a Bid Manager and a Client do not appear in the chat', async () => {
    mountAs(['Bid Manager']); await typeGoto('146023'); await settle(); expect(panel()).toBeNull();
    expect(service.developmentRequest).not.toHaveBeenCalledWith('presence', expect.anything());
  });
  test('a confirmed save tells the colleagues who worked last on this GOTO', async () => {
    service.workspaceRequest.mockReset().mockImplementation(async (path, body) => (String(path).startsWith('related') ? [] : !body ? [] : { id: 1, version: 1, author: 'mstefane', createdAt: new Date().toISOString(), reason: body.reason, payload: JSON.stringify(body.state) }));
    service.upsertConfiguratoreRecord.mockReset().mockImplementation(async body => ({ ...body, payload: JSON.stringify(body.payload) }));
    mountAs(['Developer']); await typeGoto('146023'); await settle(); await screen.findByText('1 collega collegato');
    fireEvent.click(screen.getByRole('button', { name: /4\. Revisione/ }));
    await waitFor(() => expect(service.developmentRequest).toHaveBeenCalledWith('worked', { goto: '146023' }));
  });
  test('a failed save does not tell anybody that work was done', async () => {
    service.workspaceRequest.mockReset().mockImplementation(async (path, body) => { if (String(path).startsWith('related')) return []; if (!body) return []; throw new Error('rete'); });
    service.upsertConfiguratoreRecord.mockReset().mockImplementation(async body => ({ ...body, payload: JSON.stringify(body.payload) }));
    mountAs(['Developer']); await typeGoto('146023'); await settle(); await screen.findByText('1 collega collegato');
    fireEvent.click(screen.getByRole('button', { name: /4\. Revisione/ })); await waitFor(() => expect(document.body.textContent).toContain('Salvataggio non riuscito'));
    expect(service.developmentRequest).not.toHaveBeenCalledWith('worked', expect.anything());
  });
  test('the notices of the panel use the page toast and the toast does not restart the panel at every render', async () => {
    mountAs(['Developer']); await typeGoto('146023'); await settle(); await screen.findByText('1 collega collegato');
    const first = service.developmentRequest.mock.calls.filter(([path]) => path === 'presence').length;
    fireEvent.change(screen.getByLabelText('Titolo', { selector: 'input' }), { target: { value: 'abc' } }); fireEvent.change(screen.getByLabelText('Titolo', { selector: 'input' }), { target: { value: 'abcd' } });
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(service.developmentRequest.mock.calls.filter(([path]) => path === 'presence').length).toBe(first);
  });
});

describe('deleting a saved initiative from the archive of the Configuratore', () => {
  const record = { Id: 'rec-1', record_key: 'C1|2|initiative|goto-9', entity_type: 'initiative_evaluation', contract_id: 'C1', lot_id: '2', title: 'GOTO-9 · Invio',
    payload: JSON.stringify({ version: 6, lot: '2', initiative: { code: 'GOTO-9', title: 'Invio', system: 'NPSO' }, items: [], importedInterventions: [] }) };
  const mountAs = roles => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role={roles[0]} roles={roles} />);
  const openArchive = async roles => { mountAs(roles); await waitFor(() => expect(sectionButtons()).toHaveLength(7)); fireEvent.click(await screen.findByRole('button', { name: /Archivio iniziative/ })); await screen.findByRole('button', { name: 'Seleziona iniziativa GOTO-9 Invio' }); };
  const trash = () => screen.queryByRole('button', { name: 'Elimina iniziativa GOTO-9' });
  let confirmSpy;
  beforeEach(() => {
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    service.getConfiguratoreRecords.mockImplementation(async params => ({ records: params.entity_type === 'initiative_evaluation' ? [record] : [] }));
    service.deleteConfiguratoreRecord.mockReset().mockResolvedValue({ deleted: true, developmentDeleted: 1 });
  });
  afterEach(() => confirmSpy.mockRestore());

  test.each([['Developer'], ['Admin'], ['SuperAdmin']])('a %s sees the delete button', async role => { await openArchive([role]); expect(trash()).toBeInTheDocument(); });
  test.each([['Manager'], ['Bid Manager'], ['Client'], ['Editor']])('a %s does NOT see it', async role => { await openArchive([role]); expect(trash()).toBeNull(); });
  test('it asks with the window that says what disappears and what stays — not with the browser confirm — and deletes nothing yet', async () => {
    await openArchive(['Developer']); fireEvent.click(trash());
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('GOTO-9'); expect(dialog).toHaveTextContent('lo sviluppo salvato'); expect(dialog).toHaveTextContent('Resta');
    expect(confirmSpy).not.toHaveBeenCalled(); expect(service.deleteConfiguratoreRecord).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' })); expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(service.deleteConfiguratoreRecord).not.toHaveBeenCalled();
  });
  test('it does not open the initiative when the delete button is pressed', async () => {
    await openArchive(['Developer']); fireEvent.click(trash()); await screen.findByRole('alertdialog');
    expect(screen.getByLabelText('Codice GOTO')).toHaveValue('');
  });
  test('confirming deletes THAT record, closes the window, reloads the archive and says so', async () => {
    await openArchive(['Developer']); fireEvent.click(trash());
    service.getConfiguratoreRecords.mockImplementation(async () => ({ records: [] }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    await waitFor(() => expect(service.deleteConfiguratoreRecord).toHaveBeenCalledWith('rec-1'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.body).toHaveTextContent('Iniziativa eliminata'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Seleziona iniziativa GOTO-9 Invio' })).toBeNull());
  });
  test('an initiative a colleague already deleted: the window says so (no false «eliminata») and the archive is reloaded', async () => {
    service.deleteConfiguratoreRecord.mockResolvedValue({ deleted: false, developmentDeleted: 0 });
    await openArchive(['Developer']); fireEvent.click(trash());
    const loads = service.getConfiguratoreRecords.mock.calls.length;
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('non risulta più salvata');
    expect(document.body).not.toHaveTextContent('Iniziativa eliminata');
    await waitFor(() => expect(service.getConfiguratoreRecords.mock.calls.length).toBeGreaterThan(loads));
  });
  test('a failed deletion keeps the window open with the reason, and the initiative stays listed', async () => {
    service.deleteConfiguratoreRecord.mockRejectedValue(new Error('Errore eliminazione record configuratore'));
    await openArchive(['Developer']); fireEvent.click(trash());
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore eliminazione record configuratore');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Seleziona iniziativa GOTO-9 Invio' })).toBeInTheDocument();
  });
});

describe('deleting an initiative from «Analisi condivise e revisioni» (where an imported initiative lives)', () => {
  const revision = { id: 7, goto: '146023', version: 2, author: 'io', createdAt: '2026-01-02T10:00:00Z', reason: 'x', payload: JSON.stringify({ title: 'Invio prenotazione', system: 'NPSO', decisions: [], estimate: {} }) };
  const offer = { Id: 'rec-1', record_key: 'C1|2|initiative|146023', entity_type: 'initiative_evaluation', contract_id: 'C1', lot_id: '2', title: 'x', payload: JSON.stringify({ initiative: { code: '146023', title: 'Invio prenotazione' }, items: [], version: 1 }) };
  const other = { Id: 'rec-2', record_key: 'C1|2|initiative|999', entity_type: 'initiative_evaluation', contract_id: 'C1', lot_id: '2', title: 'y', payload: JSON.stringify({ initiative: { code: '999', title: 'Altra' }, items: [], version: 1 }) };
  const mountAs = roles => render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role={roles[0]} roles={roles} />);
  const openArchive = async roles => { mountAs(roles); await waitFor(() => expect(sectionButtons()).toHaveLength(7)); fireEvent.click(await screen.findByRole('button', { name: /Archivio iniziative/ })); await screen.findByText('Analisi condivise e revisioni'); };
  const sharedTrash = () => document.querySelector('.workspace-library-item [aria-label="Elimina iniziativa 146023"]');
  let rows;
  beforeEach(() => {
    rows = [revision];
    service.workspaceRequest.mockReset().mockImplementation(async path => (String(path).startsWith('related') ? [] : String(path) === '' ? rows : []));
    service.getConfiguratoreRecords.mockReset().mockImplementation(async params => ({ records: params.entity_type === 'initiative_evaluation' ? [offer, other] : [] }));
    service.deleteWorkspace.mockReset().mockResolvedValue({ deleted: 2 });
    service.deleteConfiguratoreRecord.mockReset().mockResolvedValue({ deleted: true, developmentDeleted: 1 });
  });

  test.each([['Admin'], ['Developer'], ['SuperAdmin']])('a %s sees the ✕ on the shared analysis', async role => { await openArchive([role]); expect(sharedTrash()).not.toBeNull(); });
  test.each([['Manager'], ['Bid Manager'], ['Client'], ['Editor']])('a %s does NOT', async role => { await openArchive([role]); expect(sharedTrash()).toBeNull(); });
  test('the ✕ is not inside the row button, and pressing it does not open the analysis', async () => {
    await openArchive(['Developer']);
    expect(sharedTrash().closest('button.workspace-library-row')).toBeNull();
    fireEvent.click(sharedTrash()); const dialog = await screen.findByRole('alertdialog');
    expect(screen.getByLabelText('Codice GOTO')).toHaveValue('');
    expect(dialog).toHaveTextContent('146023'); expect(dialog).toHaveTextContent('tutte le revisioni condivise'); expect(dialog).toHaveTextContent('l’offerta salvata con lo stesso GOTO'); expect(dialog).toHaveTextContent('solo un SuperAdmin');
    expect(service.deleteWorkspace).not.toHaveBeenCalled();
  });
  test('confirming deletes the shared revisions AND the saved offer of THAT GOTO only (not the other initiative), then reloads both lists', async () => {
    await openArchive(['Developer']); fireEvent.click(sharedTrash());
    rows = []; service.getConfiguratoreRecords.mockImplementation(async () => ({ records: [other] }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    await waitFor(() => expect(service.deleteWorkspace).toHaveBeenCalledWith('146023'));
    await waitFor(() => expect(service.deleteConfiguratoreRecord).toHaveBeenCalledTimes(1)); expect(service.deleteConfiguratoreRecord).toHaveBeenCalledWith('rec-1');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.body).toHaveTextContent('Iniziativa eliminata'));
    await waitFor(() => expect(screen.queryByText('Invio prenotazione')).toBeNull());
  });
  test('when the analysis is refused (approved), NOTHING is deleted — not even the saved offer — and the reason is shown', async () => {
    service.deleteWorkspace.mockRejectedValue(new Error('Questa analisi ha una revisione approvata: le può eliminare solo un SuperAdmin.'));
    await openArchive(['Admin']); fireEvent.click(sharedTrash());
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('solo un SuperAdmin');
    expect(service.deleteConfiguratoreRecord).not.toHaveBeenCalled(); expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
  test('when the saved offer fails after the analysis went, it says exactly that and retrying does not fail on the analysis already gone', async () => {
    service.deleteConfiguratoreRecord.mockRejectedValueOnce(new Error('Errore eliminazione record configuratore'));
    await openArchive(['Developer']); fireEvent.click(sharedTrash());
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le revisioni condivise sono state eliminate, ma l’offerta salvata no');
    service.deleteWorkspace.mockResolvedValue({ deleted: 0 });
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Elimina definitivamente' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull()); expect(service.deleteConfiguratoreRecord).toHaveBeenCalledTimes(2);
  });
  test('an analysis with no saved offer says only the revisions go', async () => {
    service.getConfiguratoreRecords.mockImplementation(async () => ({ records: [other] }));
    await openArchive(['Developer']); fireEvent.click(sharedTrash());
    const dialog = await screen.findByRole('alertdialog'); expect(dialog).not.toHaveTextContent('con lo stesso GOTO');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina definitivamente' }));
    await waitFor(() => expect(service.deleteWorkspace).toHaveBeenCalledWith('146023')); expect(service.deleteConfiguratoreRecord).not.toHaveBeenCalled();
  });
});
