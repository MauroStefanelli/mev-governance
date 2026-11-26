import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfiguratorePage from './ConfiguratorePage';
import * as service from '../services/mevService';
import { estimatorWorkbook } from '../configuratore/estimatorFixture';
import { euro } from '../utils';

jest.mock('../services/mevService', () => {
  const answers = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getConfiguratoreContracts: [], getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getTowImpatto: null, getReleaseSchedules: [] };
  const cache = {};
  return new Proxy({}, { get: (_, name) => { if (name === '__esModule') return true; if (!cache[name]) cache[name] = jest.fn(async () => (name in answers ? answers[name] : {})); return cache[name]; } });
});
jest.mock('../configuratore/InitiativeConversation', () => () => null);

const catalog = [{ id: 239, nome: 'Servizio/API/Microservizio', ambito: 'Backend', descrizione: 'x', prezzi: { MODIFICA: { Semplice: 120, Medio: 360, Complesso: 600 }, REALIZZAZIONE: { Semplice: 900, Medio: 1200, Complesso: 4050 } } }];
const TOW_PRICES = { 'TOW02.1': 3607, 'TOW02.2': 9018, 'TOW02.3': 3156, 'TOW02.4': 1202, 'TOW02.6': 6443 };
const contracts = [{ contractId: 'poste-tet-2025', name: 'Poste TeT', lots: [{ lotId: '2', name: 'Lotto 2', active: true, catalog, towPrices: TOW_PRICES, tow5Share: 65, codiceContratto: 'C1' }] }];
const A = { id: 'abc-001', titolo: 'Modifica servizio', attivita: 'x', sistema: 'NPSO', tow5: 2040 };
const D = [{ id: 'abc-001', catalogId: 239, driver: 'Servizio/API/Microservizio', type: 'MODIFICA', complexity: 'Medio', qty: 10, price: 360 }];
const euroText = text => text.replace(/\s/g, ' ');
const money = n => euro.format(n).replace(/\s/g, ' ');       // lo stesso formato dell'app (punto delle migliaia)

beforeEach(() => {
  localStorage.clear(); window.HTMLElement.prototype.scrollIntoView = jest.fn();
  const defaults = { getMevOptions: { pmPoste: [] }, getConfiguratoreRecords: { records: [] }, getSharedApplications: null, workspaceRequest: [], workspaceDocument: [], getConsumoTow: [], getReleaseSchedules: [] };
  Object.keys(defaults).forEach(name => service[name].mockReset().mockImplementation(async () => defaults[name]));
  service.rationaleRequest.mockReset().mockImplementation(async path => (String(path).startsWith('related') ? [] : { messages: [], hasMore: false, entries: [] }));
  service.libraryRequest.mockReset().mockImplementation(async () => ({ documents: [], folders: [], historical: 0, pendingIndex: 0, limit: 300, ocrAvailable: true }));
  service.historyImportRequest.mockReset().mockImplementation(async path => (String(path).startsWith('pending') ? { entries: [], hasMore: false, total: 0, bySystem: [] } : { filesRead: 0, withProposals: 0 }));
  service.ledgerRequest.mockReset().mockImplementation(async path => (/^\d+$/.test(String(path)) ? {} : { initiatives: [] }));
  service.developmentRequest.mockReset().mockImplementation(async path => (path === 'presence' ? { users: [], messages: [], lastWorked: null } : String(path).startsWith('chat') ? { messages: [], hasMore: false } : {}));
  service.getConfiguratoreContracts.mockReset().mockResolvedValue(contracts);
  service.getTowImpatto.mockReset().mockResolvedValue(null);
  service.reviewOfferDetails.mockReset().mockImplementation(context => Promise.resolve({ analysis: { reviews: context.rows.map(row => ({ rowId: row.rowId, status: 'coerente', reason: 'ok' })) }, model: 'm' }));
});
const toRevision = async () => {
  render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Developer" roles={['Developer']} />);
  const input = await screen.findByLabelText('Importa da Estimatore Catalogo');
  await act(async () => { fireEvent.change(input, { target: { files: [await estimatorWorkbook({ interventions: [A], details: D })] } }); });
  await waitFor(() => expect(screen.getByLabelText('Codice GOTO')).toHaveValue('999001'));
  // la % di impatto parte da 0 finche' non si imposta (passo Offerta): la si imposta come farebbe l'utente, cosi' i TOW .1/.3/.4 hanno un importo calcolato
  fireEvent.click(await screen.findByRole('button', { name: /3\. Offerta/ }));
  const percents = await screen.findAllByLabelText(/% impatto/);
  [16, 13, 6].forEach((value, i) => fireEvent.change(percents[i], { target: { value: String(value) } }));
  fireEvent.click(await screen.findByRole('button', { name: /4\. Revisione/ }));
  return screen.findByRole('region', { name: 'TOW dell’offerta' });
};
const card = (box, key) => within(box).getByText(key, { selector: 'strong' }).closest('li');
const total = () => screen.getByText('Totale offerta').nextElementSibling.textContent.replace(/\s/g, ' ');

test('in Revisione every TOW shows its amount and, under it, the TOW previsti (the quantity) — for the automatic ones and the manual ones', async () => {
  const box = await toRevision();
  ['TOW02.1', 'TOW02.3', 'TOW02.4', 'TOW02.2', 'TOW02.6'].forEach(key => { const c = card(box, key); expect(within(c).getByLabelText(`Importo ${key}`)).toBeInTheDocument(); expect(within(c).getByLabelText(`TOW previsti ${key}`)).toBeInTheDocument(); });
  expect(card(box, 'TOW02.1')).toHaveTextContent('Calcolato dalla %'); expect(card(box, 'TOW02.2')).toHaveTextContent('Manuale');
});

test('the quantity shown is the amount divided by the unit price (amount / price), and it matches the Offerta step', async () => {
  const box = await toRevision();
  const amount = Number(within(card(box, 'TOW02.1')).getByLabelText('Importo TOW02.1').textContent.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  const quantity = Number(within(card(box, 'TOW02.1')).getByLabelText('TOW previsti TOW02.1').value);
  expect(Math.abs(quantity - amount / 3607)).toBeLessThan(0.001);
});

test('changing a quantity recalculates THAT TOW (quantity x price) and the offer total; the others stay', async () => {
  const box = await toRevision();
  const before = total(); const one = within(card(box, 'TOW02.1')).getByLabelText('Importo TOW02.1').textContent; const three = within(card(box, 'TOW02.3')).getByLabelText('Importo TOW02.3').textContent;
  fireEvent.change(within(card(box, 'TOW02.1')).getByLabelText('TOW previsti TOW02.1'), { target: { value: '2' } });
  expect(within(card(box, 'TOW02.1')).getByLabelText('Importo TOW02.1')).toHaveTextContent(euroText(money(2 * 3607)));
  expect(card(box, 'TOW02.1')).toHaveTextContent('Quantità scelta');
  expect(within(card(box, 'TOW02.3')).getByLabelText('Importo TOW02.3').textContent).toBe(three);
  expect(total()).not.toBe(before); expect(one).not.toBe(money(2 * 3607));
});

test('a manual TOW (.2): the quantity changes its amount at the price of the contract', async () => {
  const box = await toRevision();
  fireEvent.change(within(card(box, 'TOW02.2')).getByLabelText('TOW previsti TOW02.2'), { target: { value: '0.5' } });
  expect(within(card(box, 'TOW02.2')).getByLabelText('Importo TOW02.2')).toHaveTextContent(euroText(money(0.5 * 9018)));
});

test('«Arrotonda per eccesso» on one TOW: 1,441 becomes 1,45 and the euro follow', async () => {
  const box = await toRevision();
  const c = card(box, 'TOW02.1');
  fireEvent.change(within(c).getByLabelText('TOW previsti TOW02.1'), { target: { value: '1.441' } });
  fireEvent.click(within(c).getByRole('button', { name: 'Arrotonda per eccesso' }));
  expect(within(c).getByLabelText('TOW previsti TOW02.1')).toHaveValue(1.45);
  expect(within(c).getByLabelText('Importo TOW02.1')).toHaveTextContent(euroText(money(1.45 * 3607)));
  expect(within(c).getByRole('button', { name: 'Arrotonda per eccesso' })).toBeDisabled();          // gia' a un multiplo di 0,05
});

test('«Arrotonda tutti i TOW per eccesso» brings EVERY quantity to a multiple of 0,05, and the offer can only go up', async () => {
  const box = await toRevision();
  const before = Number(total().replace(/[^\d,]/g, '').replace(',', '.'));
  fireEvent.change(within(card(box, 'TOW02.2')).getByLabelText('TOW previsti TOW02.2'), { target: { value: '0.123' } });
  const mid = Number(total().replace(/[^\d,]/g, '').replace(',', '.'));
  fireEvent.click(within(box).getByRole('button', { name: /Arrotonda tutti i TOW per eccesso/ }));
  ['TOW02.1', 'TOW02.3', 'TOW02.4', 'TOW02.2'].forEach(key => { const v = Number(within(card(box, key)).getByLabelText(`TOW previsti ${key}`).value); expect(Math.abs(Math.round(v / 0.05) * 0.05 - v)).toBeLessThan(1e-6); });
  expect(within(card(box, 'TOW02.2')).getByLabelText('TOW previsti TOW02.2')).toHaveValue(0.15);
  const after = Number(total().replace(/[^\d,]/g, '').replace(',', '.'));
  expect(after).toBeGreaterThanOrEqual(mid); expect(after).toBeGreaterThan(before);
  expect(within(box).getByRole('button', { name: /Arrotonda tutti i TOW per eccesso/ })).toBeDisabled();
  expect(box).toHaveTextContent('Tutte le quantità sono già a un multiplo di 0,05.');
});

test('«Torna al calcolo dalla %» gives the TOW back to the % of impact, and the total goes back too', async () => {
  const box = await toRevision(); const before = total();
  fireEvent.change(within(card(box, 'TOW02.1')).getByLabelText('TOW previsti TOW02.1'), { target: { value: '3' } });
  expect(total()).not.toBe(before);
  fireEvent.click(within(card(box, 'TOW02.1')).getByRole('button', { name: 'Torna al calcolo dalla %' }));
  expect(total()).toBe(before); expect(card(box, 'TOW02.1')).toHaveTextContent('Calcolato dalla %');
  fireEvent.change(within(card(box, 'TOW02.3')).getByLabelText('TOW previsti TOW02.3'), { target: { value: '3' } });
  fireEvent.click(within(box).getByRole('button', { name: 'Torna al calcolo dalla % per tutti' }));
  expect(total()).toBe(before);
});

test('the chosen quantities are SAVED with the evaluation (tow) and the total saved is the new one', async () => {
  const box = await toRevision();
  fireEvent.change(within(card(box, 'TOW02.1')).getByLabelText('TOW previsti TOW02.1'), { target: { value: '1.441' } });
  fireEvent.click(within(card(box, 'TOW02.1')).getByRole('button', { name: 'Arrotonda per eccesso' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salva valutazione' })); });
  await waitFor(() => expect(service.upsertConfiguratoreRecord).toHaveBeenCalled());
  const saved = service.upsertConfiguratoreRecord.mock.calls.at(-1)[0].payload;
  expect(saved.tow['TOW02.1_qty']).toBe(1.45);
});

test('a TOW with no unit price cannot be edited and says why (a quantity cannot be turned into euro)', async () => {
  service.getConfiguratoreContracts.mockReset().mockResolvedValue([{ ...contracts[0], lots: [{ ...contracts[0].lots[0], towPrices: { 'TOW02.1': 3607 } }] }]);
  const box = await toRevision();
  const c = card(box, 'TOW02.3');
  expect(within(c).getByLabelText('TOW previsti TOW02.3')).toBeDisabled(); expect(c).toHaveTextContent('Prezzo unitario non disponibile');
  expect(within(c).getByRole('button', { name: 'Arrotonda per eccesso' })).toBeDisabled();
});

test('the rest of the Revisione is still there: totals, notes, row detail and the save buttons', async () => {
  const box = await toRevision(); expect(box).toBeInTheDocument();
  expect(screen.getByText('Revisione offerta')).toBeInTheDocument(); expect(screen.getByText('Dettaglio righe')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Salva valutazione' })).toBeInTheDocument();
});

test('the amounts used by the tests are NOT zero: the check on euro is a real one', async () => {
  const box = await toRevision();
  ['TOW02.1', 'TOW02.3', 'TOW02.4'].forEach(key => expect(within(card(box, key)).getByLabelText(`Importo ${key}`).textContent).not.toMatch(/^0,00/));
  expect(Number(within(card(box, 'TOW02.1')).getByLabelText('TOW previsti TOW02.1').value)).toBeGreaterThan(0);
});
test('with the % of impact at 0 the TOW calculated show 0 and say why, instead of staying silent', async () => {
  render(<ConfiguratorePage onUnauthorized={() => {}} ambienteId={1} codiceContratto="C1" role="Developer" roles={['Developer']} />);
  const input = await screen.findByLabelText('Importa da Estimatore Catalogo');
  await act(async () => { fireEvent.change(input, { target: { files: [await estimatorWorkbook({ interventions: [A], details: D })] } }); });
  await waitFor(() => expect(screen.getByLabelText('Codice GOTO')).toHaveValue('999001'));
  fireEvent.click(await screen.findByRole('button', { name: /4\. Revisione/ }));
  const box = await screen.findByRole('region', { name: 'TOW dell’offerta' });
  expect(card(box, 'TOW02.1')).toHaveTextContent('Importo a zero: la % di impatto è 0');
  fireEvent.change(within(card(box, 'TOW02.1')).getByLabelText('TOW previsti TOW02.1'), { target: { value: '0.5' } });
  expect(card(box, 'TOW02.1')).not.toHaveTextContent('Importo a zero');
});
