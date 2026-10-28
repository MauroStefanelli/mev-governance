import { render, screen } from '@testing-library/react';
import App from './App';

test('renders login prompt', () => {
  render(<App />);
  const prompt = screen.getByText(/Accedi con le tue credenziali/i);
  expect(prompt).toBeInTheDocument();
});
