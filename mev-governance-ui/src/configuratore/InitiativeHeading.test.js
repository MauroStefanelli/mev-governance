import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import InitiativeHeading from './InitiativeHeading';

test('keeps identity and contract context in the persistent header and updates when initiative changes', () => {
  const view = render(<InitiativeHeading initiative={{}} contractId="4490015980" lot="2" catalogCount={27} />);
  expect(screen.getByRole('banner', { name: 'Iniziativa corrente' })).toHaveClass('tow-sticky-heading');
  expect(screen.getByText('Nuova iniziativa')).toBeInTheDocument();
  view.rerender(<InitiativeHeading initiative={{ code: '145480', title: 'Interventi UPU' }} contractId="4490015980" lot="2" catalogCount={27} />);
  expect(screen.getByText('145480')).toBeInTheDocument();
  expect(screen.getByText('Interventi UPU')).toBeInTheDocument();
  expect(screen.getByText('Contratto 4490015980')).toBeInTheDocument();
});
