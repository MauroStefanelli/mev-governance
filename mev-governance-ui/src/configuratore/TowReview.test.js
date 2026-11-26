import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TowReview from './TowReview';

const prices = { 'TOW02.1': 3607, 'TOW02.3': 3156, 'TOW02.4': 1202, 'TOW02.2': 9018, 'TOW02.6': 6443 };
const setup = (over = {}) => {
  const handlers = { onChange: jest.fn(), onRoundAll: jest.fn(), onResetAuto: jest.fn() };
  render(<TowReview lot="2" calculation={{ autoTow: { 'TOW02.1': 5230.15, 'TOW02.3': 410.28, 'TOW02.4': 0 } }} computed={{ 'TOW02.1': 5000, 'TOW02.3': 410.28, 'TOW02.4': 0 }}
    prices={prices} tow={{ 'TOW02.1_qty': 1.45 }} {...handlers} {...over} />);
  return handlers;
};
const card = key => screen.getByText(key, { selector: 'strong' }).closest('li');

test('a chosen quantity shows the difference in euro from the calculation by %, and the unchanged ones show none', () => {
  setup();
  expect(card('TOW02.1')).toHaveTextContent('rispetto al calcolo dalla %'); expect(card('TOW02.1')).toHaveTextContent('230,15');
  expect(card('TOW02.3')).not.toHaveTextContent('rispetto al calcolo dalla %');
});
test('read only: every field and every button is disabled and nothing is called', () => {
  const h = setup({ readOnly: true });
  screen.getAllByRole('spinbutton').forEach(input => expect(input).toBeDisabled());
  screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled());
  expect(h.onChange).not.toHaveBeenCalled();
});
test('editable: the buttons call the handlers with the right values', () => {
  const h = setup();
  fireEvent.change(within(card('TOW02.3')).getByLabelText('TOW previsti TOW02.3'), { target: { value: '1.441' } });
  expect(h.onChange).toHaveBeenCalledWith('TOW02.3', 1.441);
  fireEvent.click(within(card('TOW02.1')).getByRole('button', { name: 'Torna al calcolo dalla %' })); expect(h.onResetAuto).toHaveBeenCalledWith('TOW02.1');
  fireEvent.click(screen.getByRole('button', { name: 'Torna al calcolo dalla % per tutti' })); expect(h.onResetAuto).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByRole('button', { name: /Arrotonda tutti i TOW per eccesso/ })); expect(h.onRoundAll).toHaveBeenCalled();
});
