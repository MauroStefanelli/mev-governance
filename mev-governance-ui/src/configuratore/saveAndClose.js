export async function saveAndClose(save, close) {
  if (await save() !== true) return false;
  close();
  return true;
}
