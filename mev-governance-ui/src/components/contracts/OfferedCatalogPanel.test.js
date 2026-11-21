import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OfferedCatalogPanel, { discountOf } from './OfferedCatalogPanel';
import * as service from '../../services/mevService';
import { catalogFor } from '../../configuratore/developmentRecord';
import lotto2 from '../../configuratore/__fixtures__/lotto2Catalogo.json';

jest.mock('../../services/mevService');
const lotInfo = (extra = {}) => ({ contractId: 'poste-tet-2025', contractName: 'Poste TeT', lotId: '2', lotName: 'Lotto 2', tenderCount: 27, offered: { count: 0, meta: null }, ...extra });
const file = new File(['x'], 'offerto.xlsx');
const okPreview = { ok: true, format: 'Foglio catalogo con prezzi offerti (ID di catalogo, Descrizione semplice/medio/complesso)', errors: [], warnings: ['Riga 2 (ID 236), «Realizzazione Medio»: il prezzo offerto 3000 supera la base d\'asta 2800.'],
  rows: [{ id: '236', ambito: 'Frontend', nome: 'Realizzazione Single Page Application', descrizione: 'Descrizione del driver dal file', descrizioni: { Semplice: '- Numero Campi min uguale= 10', Medio: '- >10 Numero Campi', Complesso: '- Numero Campi > 20' }, prezzi: ['REALIZZAZIONE', 'MODIFICA'].flatMap(tipo => ['Semplice', 'Medio', 'Complesso'].map(fascia => ({ tipo, fascia, gara: 2800, offerto: 1400 }))) }] };
const pick = () => fireEvent.change(screen.getByLabelText('File Excel del catalogo offerto'), { target: { files: [file] } });
beforeEach(() => { jest.resetAllMocks(); window.confirm = jest.fn(() => true); global.URL.createObjectURL = jest.fn(() => 'blob:x'); global.URL.revokeObjectURL = jest.fn(); jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); });

test('the discount is computed from tender and offered price', () => {
  expect(discountOf(2800, 1400)).toBe(50);
  expect(discountOf(1200, 1100)).toBe(8.33);
  expect(discountOf(0, 100)).toBeNull();
  expect(discountOf(100, null)).toBeNull();
});

test('a lot the user may not manage says so and offers nothing', async () => {
  service.offeredCatalogLots.mockResolvedValue([]);
  render(<OfferedCatalogPanel contractId="altro" lotId="2" />);
  expect(await screen.findByText(/Non hai il permesso di gestire il catalogo offerto di questo lotto/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Scarica il modello/ })).toBeNull();
});

test('before the import it says the lot uses the tender prices and offers the Excel model', async () => {
  service.offeredCatalogLots.mockResolvedValue([lotInfo()]);
  service.downloadOfferedCatalogTemplate.mockResolvedValue(new Blob(['x']));
  render(<OfferedCatalogPanel contractId="poste-tet-2025" lotId="2" />);
  expect(await screen.findByText(/non è ancora stato caricato: il lotto usa i prezzi di gara/)).toBeInTheDocument();
  expect(screen.getByText(/27 voci/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Rimuovi/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Scarica il modello Excel' }));
  await waitFor(() => expect(service.downloadOfferedCatalogTemplate).toHaveBeenCalledWith('poste-tet-2025', '2'));
});

test('the file is only CHECKED first: nothing is saved until the user confirms, and the comparison with the tender prices is shown', async () => {
  service.offeredCatalogLots.mockResolvedValue([lotInfo()]);
  service.previewOfferedCatalog.mockResolvedValue(okPreview);
  render(<OfferedCatalogPanel contractId="poste-tet-2025" lotId="2" />);
  await screen.findByRole('button', { name: 'Scarica il modello Excel' });
  expect(screen.getByRole('button', { name: 'Controlla il file' })).toBeDisabled();
  pick();
  fireEvent.click(screen.getByRole('button', { name: 'Controlla il file' }));
  expect(await screen.findByText(/Il file è corretto: 1 voci/)).toBeInTheDocument();
  expect(service.previewOfferedCatalog).toHaveBeenCalledWith(file, 'poste-tet-2025', '2');
  expect(service.importOfferedCatalog).not.toHaveBeenCalled();
  expect(screen.getAllByText(/sconto 50%/).length).toBeGreaterThan(0);
  expect(screen.getByText(/supera la base d'asta/)).toBeInTheDocument();
});

test('confirming saves, reloads the state and tells the user', async () => {
  service.offeredCatalogLots.mockResolvedValueOnce([lotInfo()]).mockResolvedValue([lotInfo({ offered: { count: 27, meta: { fileName: 'offerto.xlsx', importedAt: '2026-11-21T10:00:00Z', importedByFullName: 'Anna Rossi' } } })]);
  service.previewOfferedCatalog.mockResolvedValue(okPreview);
  service.importOfferedCatalog.mockResolvedValue({ count: 27 });
  render(<OfferedCatalogPanel contractId="poste-tet-2025" lotId="2" />);
  await screen.findByRole('button', { name: 'Scarica il modello Excel' });
  pick(); fireEvent.click(screen.getByRole('button', { name: 'Controlla il file' }));
  fireEvent.click(await screen.findByRole('button', { name: /Salva il catalogo offerto \(1 voci\)/ }));
  expect(await screen.findByText('Catalogo offerto salvato: 27 voci.')).toBeInTheDocument();
  expect(service.importOfferedCatalog).toHaveBeenCalledWith(file, 'poste-tet-2025', '2');
  expect(await screen.findByText(/offerto\.xlsx · caricato il .* da Anna Rossi/)).toBeInTheDocument();
});

test('a file with errors lists them all, offers no save button, and nothing is sent to save', async () => {
  service.offeredCatalogLots.mockResolvedValue([lotInfo()]);
  service.previewOfferedCatalog.mockResolvedValue({ ok: false, errors: ['Riga 2: l\'ID 99999 non esiste nel catalogo di gara di questo lotto.', 'Mancano 1 voci del catalogo di gara: ID 239.'], warnings: [], rows: [] });
  render(<OfferedCatalogPanel contractId="poste-tet-2025" lotId="2" />);
  await screen.findByRole('button', { name: 'Scarica il modello Excel' });
  pick(); fireEvent.click(screen.getByRole('button', { name: 'Controlla il file' }));
  expect(await screen.findByText(/Il file non può essere salvato \(2 problemi\)/)).toBeInTheDocument();
  expect(screen.getByText(/l'ID 99999 non esiste/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Salva il catalogo offerto/ })).toBeNull();
  expect(service.importOfferedCatalog).not.toHaveBeenCalled();
});

test('the errors the server sends when saving are shown too', async () => {
  service.offeredCatalogLots.mockResolvedValue([lotInfo()]);
  service.previewOfferedCatalog.mockResolvedValue(okPreview);
  const failure = Object.assign(new Error('Il file contiene errori: nessuna voce è stata salvata.'), { errors: ['Riga 5: x'], warnings: [] });
  service.importOfferedCatalog.mockRejectedValue(failure);
  render(<OfferedCatalogPanel contractId="poste-tet-2025" lotId="2" />);
  await screen.findByRole('button', { name: 'Scarica il modello Excel' });
  pick(); fireEvent.click(screen.getByRole('button', { name: 'Controlla il file' }));
  fireEvent.click(await screen.findByRole('button', { name: /Salva il catalogo offerto/ }));
  expect(await screen.findByText(/nessuna voce è stata salvata/)).toBeInTheDocument();
  expect(screen.getByText('Riga 5: x')).toBeInTheDocument();
});

test('removing asks for confirmation and says the lot is back to the tender prices', async () => {
  service.offeredCatalogLots.mockResolvedValueOnce([lotInfo({ offered: { count: 27, meta: { fileName: 'a.xlsx' } } })]).mockResolvedValue([lotInfo()]);
  service.removeOfferedCatalog.mockResolvedValue({});
  render(<OfferedCatalogPanel contractId="poste-tet-2025" lotId="2" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Rimuovi il catalogo offerto' }));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/tornerà a usare i prezzi di gara/));
  expect(await screen.findByText(/il lotto usa di nuovo i prezzi di gara/)).toBeInTheDocument();
  expect(service.removeOfferedCatalog).toHaveBeenCalledWith('poste-tet-2025', '2');
  window.confirm = jest.fn(() => false); service.removeOfferedCatalog.mockClear();
  service.offeredCatalogLots.mockResolvedValue([lotInfo({ offered: { count: 27, meta: {} } })]);
});

// ---- il collegamento con il resto dell'app: le pagine che leggono il catalogo usano quello effettivo ----
const src = f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
test('the Configuratore, Sviluppo and the lot of the contract all read the EFFECTIVE catalog (offered when present)', () => {
  expect(src('pages/ConfiguratorePage.js')).toMatch(/const catalog = useMemo\(\(\) => effectiveCatalog\(activeLot\), \[activeLot\]\)/);
  expect(src('pages/ConfiguratorePage.js')).toMatch(/offeredCatalog: l\.offeredCatalog \|\| \[\]/);
  expect(src('pages/ConfiguratorePage.js')).toMatch(/parseInitiativeWorkbook\(file, effectiveCatalog\(importLot\)\)/);
  expect(src('configuratore/developmentRecord.js')).toMatch(/return effectiveCatalog\(lot\)/);
  const offeredLot = { lotId: '2', active: true, catalog: lotto2, offeredCatalog: [{ id: 236, prezzi: { REALIZZAZIONE: { Semplice: 1, Medio: 2, Complesso: 3 }, MODIFICA: { Semplice: 4, Medio: 5, Complesso: 6 } } }] };
  const withOffered = catalogFor([{ contractId: 'c', lots: [offeredLot] }], null, { contractId: 'c', lot: '2' }).find(e => e.id === 236);
  const tenderOnly = catalogFor([{ contractId: 'c', lots: [{ ...offeredLot, offeredCatalog: undefined }] }], null, { contractId: 'c', lot: '2' }).find(e => e.id === 236);
  expect(withOffered.prezzi.REALIZZAZIONE.Medio).toBe(2);
  expect(withOffered.nome).toBe('Realizzazione Single Page Application');
  expect(tenderOnly.prezzi.REALIZZAZIONE.Medio).toBe(2800);
});
test('the Admin reaches the page from the Home and from a route; the SuperAdmin finds a tab in the Archivio', () => {
  expect(src('pages/HomePage.js')).toMatch(/id: "catalogoofferto"[\s\S]*?roles: \["Admin"\]/);
  expect(src('App.js')).toMatch(/page === "catalogoofferto"\s+&& hasRole\("Admin", "SuperAdmin"\)/);
  expect(src('pages/ContractArchivePage.js')).toMatch(/\['offered', 'Voci di catalogo offerti'\]/);
});

test('the preview says which format was recognised and that the descriptions will be saved, and shows them', async () => {
  service.offeredCatalogLots.mockResolvedValue([lotInfo()]);
  service.previewOfferedCatalog.mockResolvedValue(okPreview);
  render(<OfferedCatalogPanel contractId="poste-tet-2025" lotId="2" />);
  await screen.findByRole('button', { name: 'Scarica il modello Excel' });
  expect(screen.getByText(/caricalo così com’è: le altre colonne vengono ignorate/)).toBeInTheDocument();
  expect(screen.getByText(/Le colonne «Descrizione Driver», «Descrizione Semplice», «Descrizione Medio» e «Descrizione Complesso» sono facoltative/)).toBeInTheDocument();
  pick(); fireEvent.click(screen.getByRole('button', { name: 'Controlla il file' }));
  expect(await screen.findByText(/Formato riconosciuto: Foglio catalogo con prezzi offerti/)).toBeInTheDocument();
  expect(screen.getByText(/Descrizioni semplice\/medio\/complesso trovate per 1 voci: vengono salvate con i prezzi/)).toBeInTheDocument();
  expect(screen.getByText(/Descrizione del driver trovata per 1 voci: sostituisce quella di gara nel catalogo in uso/)).toBeInTheDocument();
  expect(screen.getByText('Descrizione del driver')).toBeInTheDocument();
  expect(screen.getByText('Descrizione del driver dal file')).toBeInTheDocument();
  expect(screen.getByText('Descrizioni per complessità')).toBeInTheDocument();
  expect(screen.getByText('- Numero Campi min uguale= 10')).toBeInTheDocument();
});
test('the Archivio shows the descriptions by complexity of the offered catalog under the voice, and the Configuratore in the voice detail', () => {
  expect(src('pages/ContractArchivePage.js')).toMatch(/Descrizione per complessità \(dal catalogo offerto\)/);
  expect(src('pages/ContractArchivePage.js')).toMatch(/Driver:<\/strong> \{driverText\}/);
  expect(src('pages/ContractArchivePage.js')).toMatch(/offered: l\.offeredCatalog \|\| \[\]/);
  expect(src('pages/ConfiguratorePage.js')).toMatch(/cc\.descrizioni && \["Semplice", "Medio", "Complesso"\]/);
});
