import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import PageManual from './PageManual';
import { PAGE_MANUALS, homeManualChapters } from './pageManuals';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
  HTMLElement.prototype.scrollTo = jest.fn();
});
test.each(['mev', 'mevcap', 'contratti', 'contratti_interni', 'reportavanzamenti', 'chart', 'team', 'consumotow', 'tools', 'gara', 'superadmin', 'admin', 'dbconfig', 'configuratore', 'sviluppo'])('opens the contextual manual for %s', page => {
  render(<PageManual page={page} />);
  fireEvent.click(screen.getByRole('button', { name: /Manuale d’uso/ }));
  expect(screen.getByRole('dialog', { name: PAGE_MANUALS[page].title })).toBeVisible();
  expect(screen.getByRole('navigation', { name: 'Indice del manuale' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi manuale' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  cleanup();
});
test('Home guide briefly describes only the sections visible to its user', () => {
  const chapters = homeManualChapters(['mev', 'reportavanzamenti']);
  expect(chapters.map(c => c.title)).toEqual(['Orientarsi nell’app', 'MEV', 'Report Avanzamenti']);
  render(<PageManual page="home" homePages={['mev', 'reportavanzamenti']} />);
  fireEvent.click(screen.getByRole('button', { name: /Guida rapida/ }));
  expect(screen.getByRole('dialog', { name: 'Guida rapida · MEV Governance' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Amministrazione utenti/ })).not.toBeInTheDocument();
});
