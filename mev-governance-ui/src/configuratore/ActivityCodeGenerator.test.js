import { codeOriginals } from './ActivityCodeGenerator';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ActivityCodeGenerator from './ActivityCodeGenerator';
import { generateActivityCode } from '../services/mevService';
jest.mock('../services/mevService', () => ({ generateActivityCode: jest.fn() }));

test('reads complete explicitly named originals rather than source snippets', async () => {
  const content = 'class Example {}';
  const result = await codeOriginals([{ name: 'Example.java', webkitRelativePath: 'NPSO/src/Example.java', size: 16, text: async () => content }], 'src/Example.java');
  expect(result).toEqual([{ path: 'src/Example.java', content }]);
});
test('previews real generated contents and only stores artifacts on explicit action', async () => {
  const result = { status: 'generated-unverified', files: [{ path: 'src/A.java', action: 'create', content: 'class A {}', baseSha256: '' }], summary: 'Classe generata', testInstructions: 'Eseguire test' };
  generateActivityCode.mockResolvedValueOnce(result);
  const update = jest.fn();
  render(<ActivityCodeGenerator item={{ reason: 'Nuovo servizio' }} plan={{ solution: 'Una classe', acceptance: 'Test positivo', codeTarget: { application: 'APP', component: 'api', stack: 'Java 8' } }} update={update} applications={[{ name: 'APP' }]} sourceFiles={[]} />);
  fireEvent.click(screen.getByText('Generazione codice / workflow · target applicativo'));
  fireEvent.click(screen.getByText('Genera codice / workflow per questa attività'));
  await screen.findByText('class A {}');
  expect(update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Conserva artefatti nella scheda'));
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'Da verificare', generatedCode: expect.objectContaining({ files: result.files }) }));
});
test('rejects missing and ambiguous paths and supports new files without originals', async () => {
  const files = ['one/src/A.java', 'two/src/A.java'].map(path => ({ name: 'A.java', webkitRelativePath: path, size: 1, text: async () => 'a' }));
  await expect(codeOriginals(files, 'src/A.java')).rejects.toThrow('ambiguo');
  await expect(codeOriginals([], 'missing.java')).rejects.toThrow('non trovato');
  await expect(codeOriginals([], '')).resolves.toEqual([]);
});
