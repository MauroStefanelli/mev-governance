import { offerWorkbookDetails, offerTowQuantities } from './OfferWorkbookExport';
jest.mock('../services/mevService', () => ({ exportOfferWorkbook: jest.fn(), offerTemplateStatus: jest.fn(), uploadOfferTemplate: jest.fn(), downloadOfferTemplate: jest.fn(), restoreOfferTemplate: jest.fn() }));

test('exports selected contractual prices rather than example or imported prices', () => {
  const details = offerWorkbookDetails([{ id: 239, interventionId: 'I1', type: 'MODIFICA', complexity: 'Medio', qty: 2, unit: 999 }],
    [{ id: 239, nome: 'API', prezzi: { MODIFICA: { Medio: 75 } } }]);
  expect(details[0]).toMatchObject({ interventionId: 'I1', unitPrice: 75, quantity: 2 });
});

test('calculates automatic TOW quantities from contractual percentages and apportions manual TOW', () => {
  const details = [{ interventionId: 'I1', quantity: 2, unitPrice: 100 }, { interventionId: 'I2', quantity: 1, unitPrice: 100 }];
  const context = { lot: '2', percentages: { 1: 16, 3: 13, 4: 6 }, multiplier: 1.5, prices: { 'TOW02.1': 10, 'TOW02.3': 20, 'TOW02.4': 30 }, tow: { 'TOW02.2': 3 } };
  const first = offerTowQuantities(details, 'I1', context);
  const second = offerTowQuantities(details, 'I2', context);
  expect(first[1]).toBeCloseTo(4.8); expect(first[3]).toBeCloseTo(1.95); expect(first[4]).toBeCloseTo(.6);
  expect(first[2]).toBe(2); expect(second[2]).toBe(1);
  expect((first[1] + second[1]) * 10).toBeCloseTo(300 * 1.5 * .16);
});

test('requires configured percentages but accepts explicit zero', () => {
  const context = { lot: '2', prices: { 'TOW02.1': 10, 'TOW02.3': 20, 'TOW02.4': 30 } };
  expect(() => offerTowQuantities([], 'I1', context)).toThrow('Percentuale contrattuale');
  expect(offerTowQuantities([], 'I1', { ...context, percentages: { 1: 0, 3: 0, 4: 0 } })).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
});
test('does not silently export zero for missing contractual prices', () => {
  expect(() => offerWorkbookDetails([{ id: 239 }], [])).toThrow('prezzo del contratto mancante');
});

describe('the Excel model of the Offer Table is saved once per lot', () => {
  const React = require('react'); const { render, screen, fireEvent, waitFor, within } = require('@testing-library/react'); require('@testing-library/jest-dom');
  const service = require('../services/mevService'); const Component = require('./OfferWorkbookExport').default;
  const model = (version, extra = {}) => ({ Version: version, FileName: 'Tabella Offerta.xlsx', Size: 1000, UploadedBy: 'anna', UploadedByFullName: 'Anna Rossi', UploadedAt: '2026-11-13T09:30:00Z', ...extra });
  const catalog = [{ id: 239, nome: 'API', prezzi: { MODIFICA: { Medio: 75 } } }];
  const props = { initiative: { code: 'G1', title: 'T' }, items: [{ id: 239, interventionId: 'I1', type: 'MODIFICA', complexity: 'Medio', qty: 1 }], interventions: [{ id: 'I1', titolo: 'Uno' }], catalog, lot: '2',
    prices: { 'TOW02.1': 10, 'TOW02.2': 20, 'TOW02.3': 30, 'TOW02.4': 40 }, percentages: { 1: 16, 3: 13, 4: 6 }, multiplier: 1, tow: {}, canManage: true };
  const mountWith = async (status, overrides = {}) => { service.offerTemplateStatus.mockResolvedValue(status); const view = render(<Component {...props} {...overrides} />); await waitFor(() => expect(service.offerTemplateStatus).toHaveBeenCalled()); return view; };
  beforeEach(() => Object.values(service).forEach(fn => fn.mockReset?.()));
  const button = name => screen.getByRole('button', { name });

  test('with no model saved it says so and asks for it once; the export stays disabled', async () => {
    await mountWith({ current: null, previous: [] });
    expect(await screen.findByText(/Nessun modello salvato per questo lotto\. Caricalo qui sotto: serve una volta sola\./)).toBeInTheDocument();
    expect(screen.getByText('Carica il modello originale')).toBeInTheDocument();
    expect(button('Genera Tabella di offerta XLSX')).toBeDisabled();
    expect(service.offerTemplateStatus).toHaveBeenCalledWith('2');
  });
  test('with a model saved it shows which one, who saved it and when, and the export needs no file', async () => {
    await mountWith({ current: model(3), previous: [model(2), model(1)] });
    expect(await screen.findByText(/Tabella Offerta\.xlsx · versione 3 · salvato da Anna Rossi il 13\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Aggiorna il modello (nuova versione)')).toBeInTheDocument();
    expect(button('Genera Tabella di offerta XLSX')).toBeEnabled();
  });
  test('the export starts from the saved model: no file is sent', async () => {
    await mountWith({ current: model(1), previous: [] }); service.exportOfferWorkbook.mockResolvedValue(new Blob(['x']));
    global.URL.createObjectURL = jest.fn(() => 'blob:x'); global.URL.revokeObjectURL = jest.fn();
    await screen.findByText(/versione 1/); fireEvent.click(button('Genera Tabella di offerta XLSX'));
    await waitFor(() => expect(service.exportOfferWorkbook).toHaveBeenCalled());
    expect(service.exportOfferWorkbook.mock.calls[0][0]).toBeNull(); expect(service.exportOfferWorkbook.mock.calls[0][1]).toMatchObject({ code: 'G1', lot: '2' });
  });
  test('a file chosen for one export is used for that export, and is not saved', async () => {
    await mountWith({ current: model(1), previous: [] }); service.exportOfferWorkbook.mockResolvedValue(new Blob(['x']));
    global.URL.createObjectURL = jest.fn(() => 'blob:x'); global.URL.revokeObjectURL = jest.fn();
    await screen.findByText(/versione 1/); fireEvent.click(screen.getByText('Usa un file diverso solo per questa esportazione'));
    const file = new File(['x'], 'prova.xlsx'); fireEvent.change(screen.getByLabelText(/File Excel \(non viene salvato\)/), { target: { files: [file] } });
    expect(screen.getByText(/userò «prova\.xlsx» al posto del modello salvato/)).toBeInTheDocument();
    fireEvent.click(button('Genera Tabella di offerta XLSX')); await waitFor(() => expect(service.exportOfferWorkbook).toHaveBeenCalled());
    expect(service.exportOfferWorkbook.mock.calls[0][0]).toBe(file); expect(service.uploadOfferTemplate).not.toHaveBeenCalled();
  });
  test('uploading saves the model for the lot and reloads what is saved', async () => {
    const view = await mountWith({ current: null, previous: [] });
    service.uploadOfferTemplate.mockResolvedValue({ unchanged: false, current: model(1) }); service.offerTemplateStatus.mockResolvedValue({ current: model(1), previous: [] });
    const file = new File(['x'], 'Tabella Offerta.xlsx'); fireEvent.change(view.container.querySelector('.offer-template-upload input'), { target: { files: [file] } });
    await waitFor(() => expect(service.uploadOfferTemplate).toHaveBeenCalledWith(file, '2'));
    expect(await screen.findByText(/Modello salvato: versione 1\. D’ora in poi ogni esportazione del lotto 2 parte da questo file\./)).toBeInTheDocument();
    expect(await screen.findByText(/versione 1 · salvato da Anna Rossi/)).toBeInTheDocument();
  });
  test('the same file again says no new version was created', async () => {
    const view = await mountWith({ current: model(1), previous: [] }); service.uploadOfferTemplate.mockResolvedValue({ unchanged: true, current: model(1) });
    fireEvent.change(view.container.querySelector('.offer-template-upload input'), { target: { files: [new File(['x'], 'a.xlsx')] } });
    expect(await screen.findByText(/identico al modello in uso: non è stata creata una nuova versione/)).toBeInTheDocument();
  });
  test('after a file is chosen the field is cleared, so the same file can be chosen again after a refusal', async () => {
    const view = await mountWith({ current: model(1), previous: [] }); service.uploadOfferTemplate.mockRejectedValue(new Error('no'));
    const input = view.container.querySelector('.offer-template-upload input'); const file = new File(['x'], 'a.xlsx');
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'C:\\fakepath\\a.xlsx' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(service.uploadOfferTemplate).toHaveBeenCalled()); expect(input.value).toBe('');
  });
  test('a file the server refuses shows the reason and the saved model stays', async () => {
    const view = await mountWith({ current: model(1), previous: [] }); service.uploadOfferTemplate.mockRejectedValue(new Error('Listino del modello non riconosciuto: servono TOW02.1–.4'));
    fireEvent.change(view.container.querySelector('.offer-template-upload input'), { target: { files: [new File(['x'], 'a.xlsx')] } });
    expect(await screen.findByText(/Listino del modello non riconosciuto/)).toBeInTheDocument(); expect(screen.getByText(/versione 1/)).toBeInTheDocument();
  });
  test('previous versions can be downloaded, and put back in use by who can manage the model', async () => {
    await mountWith({ current: model(3), previous: [model(2), model(1)] });
    fireEvent.click(await screen.findByText('Versioni precedenti (2)'));
    service.restoreOfferTemplate.mockResolvedValue({ unchanged: false, current: model(4) });
    fireEvent.click(screen.getAllByRole('button', { name: 'Rimetti in uso' })[0]);
    await waitFor(() => expect(service.restoreOfferTemplate).toHaveBeenCalledWith('2', 2));
    expect(await screen.findByText(/La versione 2 è di nuovo in uso \(salvata come versione 4\)/)).toBeInTheDocument();
    global.URL.createObjectURL = jest.fn(() => 'blob:x'); global.URL.revokeObjectURL = jest.fn(); service.downloadOfferTemplate.mockResolvedValue(new Blob(['x']));
    fireEvent.click(screen.getAllByRole('button', { name: 'Scarica' })[1]); await waitFor(() => expect(service.downloadOfferTemplate).toHaveBeenCalledWith('2', 1));
    fireEvent.click(screen.getAllByRole('button', { name: 'Scarica' })[0]); await waitFor(() => expect(service.downloadOfferTemplate).toHaveBeenCalledWith('2', 2));
    fireEvent.click(screen.getByRole('button', { name: 'Scarica il modello' })); await waitFor(() => expect(service.downloadOfferTemplate).toHaveBeenLastCalledWith('2', undefined));
  });
  test('who cannot manage the model sees it and can export, but cannot change it', async () => {
    await mountWith({ current: model(1), previous: [model(0)] }, { canManage: false });
    await screen.findByText(/versione 1/); fireEvent.click(screen.getByText('Versioni precedenti (1)'));
    expect(screen.queryByText('Aggiorna il modello (nuova versione)')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Rimetti in uso' })).not.toBeInTheDocument();
    expect(button('Scarica il modello')).toBeEnabled(); expect(button('Genera Tabella di offerta XLSX')).toBeEnabled();
  });
  test('without a model, who cannot manage it is told who can, and can still choose a file for this export', async () => {
    await mountWith({ current: null, previous: [] }, { canManage: false });
    expect(await screen.findByText(/Chiedi a un Admin o a uno sviluppatore di caricarlo/)).toBeInTheDocument(); expect(screen.queryByText('Carica il modello originale')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Usa un file diverso solo per questa esportazione'));
    fireEvent.change(screen.getByLabelText(/File Excel \(non viene salvato\)/), { target: { files: [new File(['x'], 'prova.xlsx')] } });
    expect(button('Genera Tabella di offerta XLSX')).toBeEnabled();
  });
  test('if the saved model cannot be read, it says so and a file for this export still works', async () => {
    service.offerTemplateStatus.mockRejectedValue(new Error('Errore di rete')); render(<Component {...props} />);
    expect(await screen.findByText(/Modello non disponibile: Errore di rete/)).toBeInTheDocument(); expect(button('Genera Tabella di offerta XLSX')).toBeDisabled();
  });
  test('an export the server refuses shows the reason', async () => {
    await mountWith({ current: model(1), previous: [] }); service.exportOfferWorkbook.mockRejectedValue(new Error('Nessun modello salvato per il lotto 2'));
    await screen.findByText(/versione 1/); fireEvent.click(button('Genera Tabella di offerta XLSX'));
    expect(await screen.findByText('Nessun modello salvato per il lotto 2')).toBeInTheDocument();
  });
});

test('a quantity chosen in Revisione (TOW previsti) is what the Excel exports, split between the interventions by weight; the others still follow the %', () => {
  const details = [{ interventionId: 'I1', quantity: 2, unitPrice: 100 }, { interventionId: 'I2', quantity: 1, unitPrice: 100 }];
  const context = { lot: '2', percentages: { 1: 16, 3: 13, 4: 6 }, multiplier: 1, prices: { 'TOW02.1': 10, 'TOW02.3': 20, 'TOW02.4': 30 }, tow: { 'TOW02.1_qty': 1.45 } };
  const first = offerTowQuantities(details, 'I1', context); const second = offerTowQuantities(details, 'I2', context);
  expect(first[1] + second[1]).toBeCloseTo(1.45, 9); expect(first[1]).toBeCloseTo(1.45 * 2 / 3, 9);      // TOW .1: la quantita' scelta
  expect(first[3]).toBeCloseTo(200 * 0.13 / 20, 9); expect(first[4]).toBeCloseTo(200 * 0.06 / 30, 9);      // .3 e .4: ancora dalla %
});
test('a chosen quantity of 0 exports 0, and it does not need the contractual % or a price', () => {
  const details = [{ interventionId: 'I1', quantity: 1, unitPrice: 100 }];
  expect(offerTowQuantities(details, 'I1', { lot: '2', percentages: { 3: 0, 4: 0 }, prices: { 'TOW02.3': 20, 'TOW02.4': 30 }, tow: { 'TOW02.1_qty': 0 } })[1]).toBe(0);
});
test('a chosen quantity with an empty catalog total cannot be split and says so', () => {
  expect(() => offerTowQuantities([], 'I1', { lot: '2', percentages: { 3: 0, 4: 0 }, prices: { 'TOW02.3': 20, 'TOW02.4': 30 }, tow: { 'TOW02.1_qty': 2 } })).toThrow('Impossibile ripartire');
});
