import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import OfferedCatalogTable from './OfferedCatalogTable';
import * as service from '../../services/mevService';

jest.mock('../../services/mevService');
const serverRow = (id, extra = {}) => ({ id, ambito: 'Frontend', nome: `Voce ${id}`, descrizioneGara: 'di gara', covered: true,
  prezziGara: { REALIZZAZIONE: { Semplice: 1200, Medio: 2800, Complesso: 4800 }, MODIFICA: { Semplice: 280, Medio: 840, Complesso: 1400 } },
  descrizione: `Driver ${id}`, descrizioni: { Semplice: 'S', Medio: 'M', Complesso: 'C' },
  prezzi: { REALIZZAZIONE: { Semplice: 600, Medio: 1400, Complesso: 2400 }, MODIFICA: { Semplice: 140, Medio: 420, Complesso: 700 } }, ...extra });
const table = (rows = [serverRow(236), serverRow(239)], extra = {}) => ({ stamp: '2026-11-21T10:00:00.000Z', loaded: true, meta: { fileName: 'catalogo.xlsx', importedAt: '2026-11-21T10:00:00.000Z', importedByFullName: 'Anna Rossi' }, rows, ...extra });
beforeEach(() => { jest.resetAllMocks(); });

test('not loaded yet: it says so and shows no table', async () => {
  service.offeredCatalogTable.mockResolvedValue(table([], { loaded: false }));
  render(<OfferedCatalogTable contractId="c" lotId="2" />);
  expect(await screen.findByText(/non è ancora stato caricato/)).toBeInTheDocument();
  expect(screen.queryByRole('table')).toBeNull();
});
test('shows every voice with the columns in the requested order, ID/Ambito/Voce as plain text and the rest editable', async () => {
  service.offeredCatalogTable.mockResolvedValue(table());
  render(<OfferedCatalogTable contractId="c" lotId="2" />);
  const grid = await screen.findByRole('table');
  expect(within(grid).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['ID', 'Ambito', 'Voce', 'Descrizione Driver', 'Descrizione Semplice', 'Descrizione Medio', 'Descrizione Complesso',
    'Realizzazione Semplice', 'Realizzazione Medio', 'Realizzazione Complesso', 'Modifica Semplice', 'Modifica Medio', 'Modifica Complesso']);
  expect(within(grid).getAllByRole('row')).toHaveLength(3);
  expect(screen.getByText('Voce 236')).toBeInTheDocument();
  expect(screen.queryByLabelText('Voce voce 236')).toBeNull();                 // la Voce non e' un campo
  expect(screen.getByLabelText('Descrizione Driver voce 236')).toHaveValue('Driver 236');
  expect(screen.getByLabelText('Realizzazione Medio voce 236')).toHaveValue('1400');
  expect(screen.getAllByText(/gara 2\.800,00/).length).toBeGreaterThan(0);     // la base d'asta sotto ogni prezzo
  expect(screen.getByText(/2 voci · da catalogo\.xlsx · aggiornato il .* da Anna Rossi/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Salva le modifiche/ })).toBeDisabled();
});
test('editing enables saving, highlights the cell and sends id, descriptions and prices (not name or ambit) with the version stamp', async () => {
  service.offeredCatalogTable.mockResolvedValue(table());
  service.saveOfferedCatalogTable.mockResolvedValue({ count: 2, warnings: [] });
  render(<OfferedCatalogTable contractId="c" lotId="2" />);
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Realizzazione Medio voce 236'), { target: { value: '1.500,50' } });
  fireEvent.change(screen.getByLabelText('Descrizione Medio voce 239'), { target: { value: 'Testo nuovo' } });
  expect(screen.getByRole('button', { name: 'Salva le modifiche (2)' })).toBeEnabled();
  expect(screen.getByText(/Hai modifiche non salvate/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Salva le modifiche (2)' }));
  await waitFor(() => expect(service.saveOfferedCatalogTable).toHaveBeenCalledTimes(1));
  const [contractId, lot, stamp, rows] = service.saveOfferedCatalogTable.mock.calls[0];
  expect([contractId, lot, stamp]).toEqual(['c', '2', '2026-11-21T10:00:00.000Z']);
  expect(rows).toHaveLength(2);
  expect(rows[0].prezzi.REALIZZAZIONE.Medio).toBe('1.500,50');
  expect(rows[1].descrizioni.Medio).toBe('Testo nuovo');
  expect(Object.keys(rows[0]).sort()).toEqual(['descrizione', 'descrizioni', 'id', 'prezzi']);
  expect(await screen.findByText(/Modifiche salvate: 2 voci/)).toBeInTheDocument();
  expect(service.offeredCatalogTable).toHaveBeenCalledTimes(2);                // dopo il salvataggio la tabella si rilegge
});
test('a wrong price is flagged in the cell and saving is blocked without calling the server', async () => {
  service.offeredCatalogTable.mockResolvedValue(table());
  render(<OfferedCatalogTable contractId="c" lotId="2" />);
  await screen.findByRole('table');
  const field = screen.getByLabelText('Modifica Medio voce 236');
  fireEvent.change(field, { target: { value: 'abc' } });
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(field).toHaveAttribute('title', expect.stringMatching(/non è un importo/));
  fireEvent.click(screen.getByRole('button', { name: /Salva le modifiche/ }));
  expect(await screen.findByText(/Non posso salvare \(1 problemi\)/)).toBeInTheDocument();
  expect(screen.getByText(/ID 236 · Modifica Medio: non è un importo/)).toBeInTheDocument();
  expect(service.saveOfferedCatalogTable).not.toHaveBeenCalled();
});
test('an empty price where the tender has one is refused locally; above the base is only a warning and saves', async () => {
  service.offeredCatalogTable.mockResolvedValue(table([serverRow(236)]));
  service.saveOfferedCatalogTable.mockResolvedValue({ count: 1, warnings: ['x'] });
  render(<OfferedCatalogTable contractId="c" lotId="2" />);
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Realizzazione Semplice voce 236'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /Salva le modifiche/ }));
  expect(await screen.findByText(/manca il prezzo offerto/)).toBeInTheDocument();
  expect(service.saveOfferedCatalogTable).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Realizzazione Semplice voce 236'), { target: { value: '9999' } });
  expect(screen.getByText(/1 prezzi da controllare/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Salva le modifiche/ }));
  await waitFor(() => expect(service.saveOfferedCatalogTable).toHaveBeenCalledTimes(1));
});
test('a conflict (somebody saved meanwhile) is shown and the user keeps what he typed', async () => {
  service.offeredCatalogTable.mockResolvedValue(table());
  service.saveOfferedCatalogTable.mockRejectedValue(Object.assign(new Error('Il catalogo offerto è stato modificato da un altro utente dopo che lo hai aperto. Ricarica la tabella e rifai le modifiche: nulla è stato salvato.'), { errors: [] }));
  render(<OfferedCatalogTable contractId="c" lotId="2" />);
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Realizzazione Medio voce 236'), { target: { value: '1500' } });
  fireEvent.click(screen.getByRole('button', { name: /Salva le modifiche/ }));
  expect(await screen.findByText(/modificato da un altro utente/)).toBeInTheDocument();
  expect(screen.getByLabelText('Realizzazione Medio voce 236')).toHaveValue('1500');
  expect(screen.getByRole('button', { name: /Salva le modifiche/ })).toBeEnabled();
});
test('the server errors of a save are listed', async () => {
  service.offeredCatalogTable.mockResolvedValue(table());
  service.saveOfferedCatalogTable.mockRejectedValue(Object.assign(new Error('Ci sono errori: nessuna modifica è stata salvata.'), { errors: ['Voce 1 (ID 236): x'] }));
  render(<OfferedCatalogTable contractId="c" lotId="2" />);
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Descrizione Driver voce 236'), { target: { value: 'altro' } });
  fireEvent.click(screen.getByRole('button', { name: /Salva le modifiche/ }));
  expect(await screen.findByText('Voce 1 (ID 236): x')).toBeInTheDocument();
});
test('"Annulla le modifiche" brings back the saved values', async () => {
  service.offeredCatalogTable.mockResolvedValue(table());
  render(<OfferedCatalogTable contractId="c" lotId="2" />);
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Descrizione Driver voce 236'), { target: { value: 'altro' } });
  fireEvent.click(screen.getByRole('button', { name: 'Annulla le modifiche' }));
  expect(screen.getByLabelText('Descrizione Driver voce 236')).toHaveValue('Driver 236');
  expect(screen.getByRole('button', { name: /Salva le modifiche/ })).toBeDisabled();
});
test('a descriptions field is limited to 2000 characters', async () => {
  service.offeredCatalogTable.mockResolvedValue(table([serverRow(236)]));
  render(<OfferedCatalogTable contractId="c" lotId="2" />);
  await screen.findByRole('table');
  expect(screen.getByLabelText('Descrizione Driver voce 236')).toHaveAttribute('maxLength', '2000');
});

test('the save bar says there is nothing to save, then warns (and changes look) once something is edited', async () => {
  service.offeredCatalogTable.mockResolvedValue(table([serverRow(236)]));
  const { container } = render(<OfferedCatalogTable contractId="c" lotId="2" />);
  await screen.findByRole('table');
  const bar = () => container.querySelector('.oc-savebar');
  expect(bar()).not.toHaveClass('is-dirty');
  expect(screen.getByText('Nessuna modifica da salvare.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Realizzazione Medio voce 236'), { target: { value: '1500' } });
  expect(bar()).toHaveClass('is-dirty');
  expect(screen.getByText(/Hai modifiche non salvate: le celle cambiate sono evidenziate in giallo/)).toBeInTheDocument();
  expect(screen.getByLabelText('Realizzazione Medio voce 236').closest('td')).toHaveClass('is-changed');
  expect(screen.getByLabelText('Realizzazione Semplice voce 236').closest('td')).not.toHaveClass('is-changed');
  fireEvent.change(screen.getByLabelText('Realizzazione Medio voce 236'), { target: { value: '1400' } });
  expect(bar()).not.toHaveClass('is-dirty');      // tornando al valore salvato non resta nulla da salvare
});
