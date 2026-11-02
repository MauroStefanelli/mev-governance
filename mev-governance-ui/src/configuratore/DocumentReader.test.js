import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DocumentReader from './DocumentReader';

test('paginates long extracts and selects the original indices after searching', () => {
  const passages = Array.from({ length: 25 }, (_, index) => ({ location: `pagina ${index + 1}`, text: `Requisito ${index + 1}` }));
  const select = jest.fn();
  render(<DocumentReader document={{ fileName: 'specifica.pdf' }} extraction={{ status: 'ready', message: 'Da verificare', passages }} selected={[]} onSelect={select} canEdit />);
  expect(screen.getAllByRole('checkbox')).toHaveLength(12);
  fireEvent.click(screen.getByText('Successive'));
  expect(screen.getByLabelText('Includi pagina 13')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Requisito 25' } });
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  fireEvent.click(screen.getByText('Seleziona sezioni visibili'));
  expect(select).toHaveBeenCalledWith([24]);
});
