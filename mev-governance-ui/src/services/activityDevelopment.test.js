import { prepareActivityDevelopment } from './mevService';

afterEach(() => { delete global.fetch; });
test('explains a missing backend endpoint rather than blaming AI', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 404, ok: false, json: async () => { throw new Error('empty'); } });
  await expect(prepareActivityDevelopment({})).rejects.toThrow('Aggiorna su Render il backend DEV');
});
test('preserves provider error details for an endpoint that exists', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 502, ok: false, json: async () => ({ message: 'Risposta AI incompleta' }) });
  await expect(prepareActivityDevelopment({})).rejects.toThrow('Risposta AI incompleta');
});
