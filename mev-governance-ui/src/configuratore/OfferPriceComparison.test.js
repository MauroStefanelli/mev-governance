import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import OfferPriceComparison from './OfferPriceComparison';
const item = { key:'row-1', id:239, imported:true, interventionId:'INT-1', type:'MODIFICA', complexity:'Medio',qty:1,unit:360,original:{unit:360,total:360} };
const catalog = [{id:239,prezzi:{MODIFICA:{Medio:400}}}];
test('shows original and contract prices and only applies a price on explicit click', () => {
  const onApply = jest.fn();
  render(<OfferPriceComparison items={[item]} catalog={catalog} contractName="Sistema" lot="2" onApply={onApply} />);
  expect(screen.getAllByText('360,00 €').length).toBeGreaterThan(0);
  expect(screen.getByText('40,00 €')).toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Applica prezzo catalogo riga 1'}));
  expect(onApply).toHaveBeenCalledWith('row-1',400);
});
test('keeps missing and builtin catalog prices explicit and disables application', () => {
  const view=render(<OfferPriceComparison items={[item]} catalog={[]} lot="2" onApply={jest.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('1 righe senza prezzo');
  expect(screen.getByRole('button')).toBeDisabled();
  view.rerender(<OfferPriceComparison items={[item]} catalog={catalog} lot="2" builtin onApply={jest.fn()} />);
  expect(screen.getByRole('button')).toBeDisabled();
});
