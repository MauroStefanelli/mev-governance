import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from './HomePage';

const show = (role, roles, appPerms = null) => render(<HomePage username="u" fullName="U" role={role} roles={roles} ambienti={[]} ambienteId={1} onNavigate={() => {}} appPerms={appPerms} />);
test('Sviluppo iniziative is offered to Developer, Admin and SuperAdmin, not to other roles', () => {
  const view = show('Developer', ['Developer']);
  expect(screen.getByText('Sviluppo iniziative')).toBeInTheDocument();
  view.unmount();
  show('Editor', ['Editor']);
  expect(screen.queryByText('Sviluppo iniziative')).not.toBeInTheDocument();
});
test('an administrator can hide the app for a role from the permission matrix', () => {
  show('Developer', ['Developer'], { sviluppo: { canView: false, canEdit: false } });
  expect(screen.queryByText('Sviluppo iniziative')).not.toBeInTheDocument();
});

test.each([['Admin'], ['Developer'], ['SuperAdmin']])('a %s sees both «Configuratore Iniziative» and «Sviluppo iniziative» on the Home', role => {
  show(role, [role]);
  expect(screen.getByText('Configuratore Iniziative')).toBeInTheDocument(); expect(screen.getByText('Sviluppo iniziative')).toBeInTheDocument();
});
test.each([['Editor'], ['Client'], ['Manager'], ['Bid Manager']])('a %s sees neither of them', role => {
  show(role, [role]);
  expect(screen.queryByText('Configuratore Iniziative')).not.toBeInTheDocument(); expect(screen.queryByText('Sviluppo iniziative')).not.toBeInTheDocument();
});
test('an Admin hidden from the apps by the permission matrix does not see them', () => {
  show('Admin', ['Admin'], { configuratore: { canView: false, canEdit: false }, sviluppo: { canView: false, canEdit: false } });
  expect(screen.queryByText('Configuratore Iniziative')).not.toBeInTheDocument(); expect(screen.queryByText('Sviluppo iniziative')).not.toBeInTheDocument();
});

// La card sulla Home e la rotta in App.js devono dire la stessa cosa: una card che porta a una pagina vuota e' peggio di nessuna card.
test('the routes of Configuratore and Sviluppo in App.js let in the same roles as the Home cards (Admin included)', () => {
  const app = require('fs').readFileSync(require('path').join(__dirname, '..', 'App.js'), 'utf8');
  ['configuratore', 'sviluppo'].forEach(page => {
    const line = app.split('\n').find(l => l.includes(`page === "${page}"`));
    expect(line).toMatch(/hasRole\("SuperAdmin", "Developer", "Admin"\)/);
  });
});
