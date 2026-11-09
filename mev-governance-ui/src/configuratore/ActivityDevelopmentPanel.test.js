import React, { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Panel from './ActivityDevelopmentPanel';

test('edits a per-row plan and shows configured NPSO repository without claiming it was read', () => {
  const selectFiles = jest.fn();
  function View() {
    const [plans, setPlans] = useState({});
    return <Panel items={[{ sourceRowId: 'r1', interventionId: 'I1', reason: 'API' }]} plans={plans} onChange={setPlans} applications={[{ name: 'NPSO', codeUrl: '/src/npso' }]} onSelectFiles={selectFiles} />;
  }
  render(<View />);
  fireEvent.click(screen.getByText('Attività 1'));
  expect(screen.getByText('/src/npso')).toBeVisible();
  expect(within(screen.getByLabelText('Stato attività 1')).getByRole('option', { name: 'Pronta per sviluppo' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('File coinvolti (uno per riga, percorso relativo)'), { target: { value: 'src/Api.java' } });
  fireEvent.change(screen.getByLabelText('Soluzione tecnica'), { target: { value: 'Aggiornare API' } });
  fireEvent.change(screen.getByLabelText('Criteri di accettazione'), { target: { value: 'Validazione richiesta' } });
  expect(within(screen.getByLabelText('Stato attività 1')).getByRole('option', { name: 'Pronta per sviluppo' })).not.toBeDisabled();
  fireEvent.click(screen.getByText('Seleziona cartella sorgenti per questa sessione'));
  expect(selectFiles).toHaveBeenCalled();
});
