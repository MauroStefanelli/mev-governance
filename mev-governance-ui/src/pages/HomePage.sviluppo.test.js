import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from './HomePage';

const show = (role, roles, appPerms = null) => render(<HomePage username="u" fullName="U" role={role} roles={roles} ambienti={[]} ambienteId={1} onNavigate={() => {}} appPerms={appPerms} />);
test('Sviluppo iniziative is offered to Developer and SuperAdmin, not to other roles', () => {
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
