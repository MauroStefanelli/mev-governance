import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportedInterventionGroup from './ImportedInterventionGroup';

test('collapses components by intervention and recalculates header total from current rows', () => {
  const intervention = { id: 'ottsped-001', titolo: 'Strutture dati', mappings: [{ sourceRowId: 'r1', qty: 1, unit: 100 }, { sourceRowId: 'r2', qty: 2, unit: 50 }] };
  const view = render(<ImportedInterventionGroup intervention={intervention} items={[]}><p>Realizzazione stored procedure o equivalente</p></ImportedInterventionGroup>);
  expect(screen.getByText('200,00 €')).toBeVisible();
  expect(screen.getByText('Realizzazione stored procedure o equivalente')).not.toBeVisible();
  fireEvent.click(screen.getByText('ID_INTERVENTO ottsped-001'));
  expect(screen.getByText('Realizzazione stored procedure o equivalente')).toBeVisible();
  view.rerender(<ImportedInterventionGroup intervention={intervention} items={[{ sourceRowId: 'r1', qty: 3, unit: 200 }]}><p>Componente</p></ImportedInterventionGroup>);
  expect(screen.getByText('700,00 €')).toBeVisible();
});
test('does not present missing prices as zero', () => {
  render(<ImportedInterventionGroup intervention={{ id: 'I1', mappings: [{ sourceRowId: 'r1', qty: 1, unit: 100 }] }} items={[{ sourceRowId: 'r1', qty: 1, unit: null }]} />);
  expect(screen.getByText('Non disponibile')).toBeVisible();
});
