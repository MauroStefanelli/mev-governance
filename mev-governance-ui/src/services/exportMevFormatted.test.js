import { exportMev, describeFilters } from './mevService';

// «Esporta Excel» di MEV e MEV-CAP: la pagina manda al backend QUALI righe ha davanti dopo i filtri e quale pagina; il file lo scrive il backend.
const rows = [{ id: 11, goTo: 'A' }, { id: 12, goTo: 'B' }, { id: 14, goTo: 'D' }];
let calls; let response;
beforeEach(() => {
  calls = []; localStorage.setItem('jwt', 'token'); localStorage.removeItem('refreshToken');
  URL.createObjectURL = jest.fn(() => 'blob:x'); URL.revokeObjectURL = jest.fn(); HTMLAnchorElement.prototype.click = jest.fn(function () { calls.push({ download: this.download }); });
  response = { ok: true, status: 200, headers: { get: name => (name === 'Content-Disposition' ? 'attachment; filename="Logistica MEV Governance 20261118.xlsx"; filename*=UTF-8\'\'Logistica%20MEV%20Governance%2020261118.xlsx' : null) }, blob: async () => new Blob(['xlsx']), json: async () => ({}) };
  global.fetch = jest.fn(async (url, options) => { calls.push({ url, body: options?.body ? JSON.parse(options.body) : null, method: options?.method }); return response; });
});
afterEach(() => jest.useRealTimers());
const request = () => calls.find(call => call.url);

test('sends the ids of the rows after the filters, the page, and a description of the filters', async () => {
  await exportMev(rows, { stato: ['Approvato'], goTo: [] }, 'mevcap');
  expect(request().url).toMatch(/\/api\/mev\/export$/); expect(request().method).toBe('POST');
  expect(request().body).toEqual({ page: 'mevcap', ids: [11, 12, 14], filters: 'Stato: Approvato' });
});
test('MEV is the default page, and an unknown page name is sent as MEV', async () => {
  await exportMev(rows, {}); expect(request().body.page).toBe('mev');
  calls = []; await exportMev(rows, {}, 'altro'); expect(request().body.page).toBe('mev');
});
test('with every row filtered out it still sends an EMPTY list (the server must not read it as «everything»)', async () => { await exportMev([], {}); expect(request().body.ids).toEqual([]); });
test('rows without an id are not sent', async () => { await exportMev([{ id: 5 }, { goTo: 'senza id' }, { id: null }], {}); expect(request().body.ids).toEqual([5]); });
test('the file is saved with the name the server proposes', async () => { await exportMev(rows, {}); expect(calls.find(call => call.download).download).toBe('Logistica MEV Governance 20261118.xlsx'); });
test('without a name from the server, a name with the page and the date is used', async () => {
  response.headers = { get: () => null }; await exportMev(rows, {}, 'mevcap');
  expect(calls.find(call => call.download).download).toMatch(/^Logistica MEV-CAP Governance \d{8}\.xlsx$/);
});
test('a refused request says why, and no file is saved', async () => {
  response = { ok: false, status: 400, headers: { get: () => null }, json: async () => ({ message: 'Troppe righe da esportare (massimo 20000).' }) };
  await expect(exportMev(rows, {})).rejects.toThrow('Troppe righe da esportare'); expect(calls.some(call => call.download)).toBe(false);
});
test('an expired session is reported as 401 (after the session refresh has failed)', async () => {
  jest.useFakeTimers(); response = { ok: false, status: 401, headers: { get: () => null }, json: async () => ({}) };
  const outcome = expect(exportMev(rows, {})).rejects.toThrow('401');
  for (let i = 0; i < 12; i++) { await Promise.resolve(); jest.advanceTimersByTime(3000); await Promise.resolve(); }
  await outcome; expect(calls.some(call => call.download)).toBe(false);
});
test('a backend that does not have the export yet (404/405) falls back to the basic file, so the button never leaves the user with nothing', async () => {
  const XLSX = require('xlsx'); const write = jest.spyOn(XLSX, 'writeFile').mockImplementation(() => {});
  for (const status of [404, 405]) {
    response = { ok: false, status, headers: { get: () => null }, json: async () => ({}) }; write.mockClear();
    await exportMev([{ id: 1, goTo: 'A', impSubco: 3 }], {}); expect(write).toHaveBeenCalledTimes(1); expect(write.mock.calls[0][1]).toMatch(/^Logistica Mev Governance \d{8}\.xlsx$/);
  }
  write.mockRestore();
});

describe('describeFilters', () => {
  test('lists the active filters with the names shown in the page, and ignores the empty ones', () => {
    const text = describeFilters({ stato: ['Approvato', 'In corso'], applicativo: ['BEP'], goTo: [], pNote: '', annoCompetenza: [2026] });
    expect(text).toContain('Stato: Approvato / In corso'); expect(text).toContain('Applicativo: BEP'); expect(text).toContain('Anno: 2026'); expect(text).not.toContain('GoTo'); expect(text).not.toContain('P Note');
  });
  test('a text filter is shown too, and nothing active gives an empty text', () => { expect(describeFilters({ pNote: 'urgente' })).toBe('P Note: urgente'); expect(describeFilters({})).toBe(''); expect(describeFilters(null)).toBe(''); expect(describeFilters({ stato: [] })).toBe(''); });
});
