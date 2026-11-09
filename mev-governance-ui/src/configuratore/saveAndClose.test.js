import { saveAndClose } from './saveAndClose';

test('retains the open initiative when saving fails', async () => {
  const close = jest.fn();
  await expect(saveAndClose(async () => false, close)).resolves.toBe(false);
  expect(close).not.toHaveBeenCalled();
});
test('closes only after confirmed saving', async () => {
  const close = jest.fn();
  await expect(saveAndClose(async () => true, close)).resolves.toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
});
