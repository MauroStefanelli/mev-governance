import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InitiativeDocuments, { documentReference } from './InitiativeDocuments';
import { workspaceDocument, workspaceRequest } from '../services/mevService';
jest.mock('../services/mevService', () => ({ workspaceDocument: jest.fn(), workspaceRequest: jest.fn() }));
const document = { id: 'doc-1', fileName: 'requisiti.md', size: 100, sha256: 'abc123', author: 'analista', createdAt: '2026-11-02T12:00:00Z' };
beforeEach(() => { workspaceDocument.mockReset(); workspaceRequest.mockReset(); });

test('loads persisted originals and links their stable reference to analysis sources', async () => {
  workspaceDocument.mockResolvedValue([document]);
  const useSource = jest.fn();
  render(<InitiativeDocuments code="145480" canEdit onUseSource={useSource} />);
  await screen.findByText('requisiti.md');
  fireEvent.click(screen.getByText('Collega alle fonti dell’analisi'));
  expect(useSource).toHaveBeenCalledWith(documentReference(document));
  expect(workspaceDocument).toHaveBeenCalledWith('145480');
});

test('uploads the original file and refreshes the persisted document list', async () => {
  workspaceDocument.mockResolvedValueOnce([]).mockResolvedValueOnce(document).mockResolvedValueOnce([document]);
  render(<InitiativeDocuments code="145480" canEdit onUseSource={() => {}} />);
  await screen.findByText('Nessun documento caricato.');
  const file = new File(['requisito'], 'requisiti.md', { type: 'text/markdown' });
  fireEvent.change(screen.getByLabelText('Carica documento iniziativa'), { target: { files: [file] } });
  await screen.findByText('requisiti.md');
  expect(workspaceDocument).toHaveBeenCalledWith('145480', { file });
});

test('supervisors can consult originals without upload or source-edit actions', async () => {
  workspaceDocument.mockResolvedValue([document]);
  render(<InitiativeDocuments code="145480" canEdit={false} />);
  await screen.findByText('requisiti.md');
  expect(screen.queryByLabelText('Carica documento iniziativa')).not.toBeInTheDocument();
  expect(screen.queryByText('Collega alle fonti dell’analisi')).not.toBeInTheDocument();
});

test('previews extracted passages and only includes them in AI after explicit selection', async () => {
  workspaceDocument.mockResolvedValue([document]);
  const extraction = { status: 'ready', message: 'Testo da verificare', passages: [{ location: 'riga 1', text: 'Requisito API' }] };
  workspaceRequest.mockResolvedValue(extraction);
  const useExtract = jest.fn();
  render(<InitiativeDocuments code="145480" canEdit onUseExtract={useExtract} />);
  await screen.findByText('requisiti.md');
  fireEvent.click(screen.getByText('Estrai testo'));
  await screen.findByText('Requisito API');
  expect(workspaceRequest).toHaveBeenCalledWith('145480/documents/doc-1/extraction', {});
  expect(useExtract).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Usa estratto nel contesto AI'));
  expect(useExtract).toHaveBeenCalledWith(document, extraction);
});
