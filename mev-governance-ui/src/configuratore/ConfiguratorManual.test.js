import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfiguratorManual from './ConfiguratorManual';

beforeEach(() => {
  HTMLElement.prototype.scrollTo = jest.fn();
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});
test('opens the manual, navigates its chapters and closes without leaving the initiative', () => {
  render(<ConfiguratorManual />);
  fireEvent.click(screen.getByRole('button', { name: /Manuale d’uso/ }));
  expect(screen.getByRole('dialog', { name: 'Configuratore Iniziative' })).toBeVisible();
  const total = screen.getAllByRole('navigation', { name: 'Indice del manuale' })[0].querySelectorAll('button').length;
  expect(total).toBeGreaterThanOrEqual(19);
  const at = title => String(screen.getByRole('button', { name: new RegExp(title) }).querySelector('span').textContent).replace(/^0/, '');
  expect(screen.getByText(`Capitolo 1 di ${total}`)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Catalogo e verifica AI/ }));
  expect(screen.getByText(`Capitolo ${at('Catalogo e verifica AI')} di ${total}`)).toBeInTheDocument();
  expect(screen.getByText(/coerenza AI delle righe/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Dall’Excel al codice/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Storico delle iniziative/ }));
  expect(screen.getByText(`Capitolo ${at('Storico delle iniziative')} di ${total}`)).toBeInTheDocument();
  expect(screen.getByText(/GOTO \+ sistema \+ titolo/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Conoscenza storica dall’AI/ }));
  expect(screen.getByText(`Capitolo ${at('Conoscenza storica dall’AI')} di ${total}`)).toBeInTheDocument();
  expect(screen.getByText(/senza mai riportare il valore/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Revisioni e collaborazione/ }));
  expect(screen.getByText(/applicazione Sviluppo iniziative della Home/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi manuale' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe('hidden');
});
