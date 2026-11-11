import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SectionRow from './SectionRow';

function Harness({ keepMounted = false, status, onMount = () => {} }) {
  const [open, setOpen] = useState(false);
  const Child = () => { onMount(); return <p>Contenuto della sezione</p>; };
  return <SectionRow number="3" title="Razionali" facts={['2 confermate', '', null, '1 proposta']} status={status} open={open} onToggle={() => setOpen(v => !v)} keepMounted={keepMounted}><Child /></SectionRow>;
}

test('the closed row already shows number, title and the facts, skipping empty ones', () => {
  render(<Harness />);
  const toggle = screen.getByRole('button', { name: /Razionali/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveTextContent('3');
  expect(toggle).toHaveTextContent('2 confermate');
  expect(toggle).toHaveTextContent('1 proposta');
  expect(toggle.querySelectorAll('.secrow-fact')).toHaveLength(2);
});

test('clicking the row opens and closes the content', () => {
  render(<Harness />);
  expect(screen.queryByText('Contenuto della sezione')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Razionali/ }));
  expect(screen.getByRole('button', { name: /Razionali/ })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Contenuto della sezione')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Razionali/ }));
  expect(screen.getByRole('button', { name: /Razionali/ })).toHaveAttribute('aria-expanded', 'false');
});

test('a closed section does not build its content, unless it keeps work in progress', () => {
  const mounted = jest.fn();
  const { unmount } = render(<Harness onMount={mounted} />);
  expect(mounted).not.toHaveBeenCalled();
  unmount();
  const kept = jest.fn();
  render(<Harness keepMounted onMount={kept} />);
  expect(kept).toHaveBeenCalled();
  expect(screen.getByText('Contenuto della sezione', { selector: 'p' })).not.toBeVisible();
});

test('the toggle controls its body and shows the status chip', () => {
  render(<Harness status="Bloccato" />);
  const toggle = screen.getByRole('button', { name: /Razionali/ });
  expect(toggle).toHaveTextContent('Bloccato');
  expect(document.getElementById(toggle.getAttribute('aria-controls'))).toBeInTheDocument();
});
