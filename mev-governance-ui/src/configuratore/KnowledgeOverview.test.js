import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import KnowledgeOverview from './KnowledgeOverview';

const rationale = [
  { id: 1, kind: 'vincolo', status: 'confermata', text: 'Nessuna modifica allo schema', interventionId: 'OTT-1' },
  { id: 2, kind: 'razionale', status: 'confermata', text: 'Evita duplicati' },
  { id: 3, kind: 'decisione', status: 'proposta', text: 'PROPOSTA-NON-CONFERMATA' },
  { id: 4, kind: 'vincolo', status: 'revocata', text: 'REVOCATA' },
];

test('summarises documents, rationale, solution and the imported offer, and opens the right section', () => {
  const open = jest.fn();
  render(<KnowledgeOverview initiative={{ code: 'G1' }} rationale={rationale} solution={{ total: 4, filled: 1 }} interventions={[{}, {}]} mappingCount={9} library="5 documenti" onOpen={open} />);
  expect(screen.getByText('5 documenti')).toBeInTheDocument();
  expect(screen.getByText('2 confermati')).toBeInTheDocument();
  expect(screen.getByText(/1 razionali · 1 vincoli · 0 decisioni · 1 da confermare/)).toBeInTheDocument();
  expect(screen.getByText('1 di 4 interventi')).toBeInTheDocument();
  expect(screen.getByText('2 interventi')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Soluzione/ }));
  expect(open).toHaveBeenCalledWith('soluzione');
  fireEvent.click(screen.getByRole('button', { name: /Razionali e vincoli/ }));
  expect(open).toHaveBeenCalledWith('razionali');
});

test('lists only confirmed entries, never proposals or revoked ones', () => {
  render(<KnowledgeOverview initiative={{ code: 'G1' }} rationale={rationale} />);
  const box = screen.getByLabelText('Voci confermate');
  expect(box).toHaveTextContent('Nessuna modifica allo schema');
  expect(box).toHaveTextContent('intervento OTT-1');
  expect(box).toHaveTextContent('Evita duplicati');
  ['PROPOSTA-NON-CONFERMATA', 'REVOCATA'].forEach(word => expect(box).not.toHaveTextContent(word));
});

test('without an initiative the cards that need one are disabled', () => {
  render(<KnowledgeOverview initiative={{}} />);
  expect(screen.getByRole('button', { name: /Documenti/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Soluzione/ })).toBeDisabled();
  expect(screen.queryByLabelText('Voci confermate')).not.toBeInTheDocument();
});

test('it shows an unsaved-solution warning and the imported offer total', () => {
  render(<KnowledgeOverview initiative={{ code: 'G1' }} solution={{ total: 2, filled: 2, dirty: true }} tow5Total={12345.5} />);
  expect(screen.getByText('Ci sono modifiche non salvate.')).toBeInTheDocument();
  expect(screen.getByText(/TOW \.5/)).toHaveTextContent('12.345,50');
});
