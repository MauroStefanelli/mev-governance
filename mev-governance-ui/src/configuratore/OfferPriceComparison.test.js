import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import OfferPriceComparison from './OfferPriceComparison';
import { detailReviewInput, detailReviewSignature } from './offerDetailReview';
const item = { key:'row-1', id:239, imported:true, interventionId:'INT-1', type:'MODIFICA', complexity:'Medio',qty:1,unit:360,original:{unit:360,total:360} };
const catalog = [{id:239,prezzi:{MODIFICA:{Medio:400}}}];
const expandInterventions = () => {
  fireEvent.click(screen.getByText('Interventi', { selector: 'summary' }));
  fireEvent.click(screen.getByText('INT-1', { selector: 'summary strong' }));
};
const openRow = (index = 0) => { fireEvent.click(document.querySelectorAll('button.rrl-row')[index]); return screen.getByRole('dialog'); };
test('the list shows the prices only in the detail of a row, and nothing ever changes a price by itself (the «Usa catalogo» button is gone)', () => {
  const onApply = jest.fn();
  render(<OfferPriceComparison items={[item]} catalog={catalog} contractName="Sistema" lot="2" onApply={onApply} />);
  expandInterventions();
  expect(screen.queryByRole('button', { name: /Usa catalogo|Applica prezzo/ })).toBeNull(); expect(screen.queryByRole('columnheader', { name: 'Azione' })).toBeNull();
  const dialog = openRow(); expect(dialog).not.toHaveTextContent('Prezzo catalogo');                              // without «Mostra dettagli e importi» the prices are not shown
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi il dettaglio' }));
  fireEvent.click(screen.getByRole('button', { name: /Mostra dettagli e importi/ }));
  const detail = openRow(); expect(detail).toHaveTextContent('Prezzo Excel'); expect(detail).toHaveTextContent('360,00 €'); expect(detail).toHaveTextContent('Prezzo catalogo'); expect(detail).toHaveTextContent('400,00 €'); expect(detail).toHaveTextContent('Differenza unitaria'); expect(detail).toHaveTextContent('40,00 €');
  expect(onApply).not.toHaveBeenCalled();
});
test('shows per-row AI rationale in the detail and marks the row stale in the list after changing complexity', () => {
  const signature = detailReviewSignature(detailReviewInput(item, catalog, [], 'system', '2', 0));
  const reviews = { 'row-1': { signature, status: 'da_verificare', reason: 'Manca il criterio di complessità', suggestion: 'Verificare il requisito' } };
  const view = render(<OfferPriceComparison items={[item]} catalog={catalog} contractId="system" lot="2" reviews={reviews} />);
  expandInterventions();
  expect(document.querySelector('.rrl-row')).toHaveTextContent('Manca il criterio di complessità');             // the list says it in one line
  const dialog = openRow(); expect(within(dialog).getByRole('region', { name: 'Verifica AI attività / catalogo' })).toHaveTextContent('Manca il criterio di complessità'); expect(dialog).toHaveTextContent('Verificare il requisito');
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi il dettaglio' }));
  view.rerender(<OfferPriceComparison items={[{ ...item, complexity: 'Complesso' }]} catalog={catalog} contractId="system" lot="2" reviews={reviews} />);
  expect(document.querySelector('.rrl-row')).toHaveTextContent('Da aggiornare'); expect(document.querySelector('.rrl-row')).toHaveClass('rrl-stale');
  expect(openRow()).toHaveTextContent('Da aggiornare: dati modificati dopo la verifica');
});
test('missing catalog prices stay explicit', () => {
  render(<OfferPriceComparison items={[item]} catalog={[]} lot="2" />);
  expect(screen.getByRole('alert')).toHaveTextContent('1 righe senza prezzo');
});
test('groups activities by intervention or catalog and toggles the economic details without changing data', () => {
  render(<OfferPriceComparison items={[item, { ...item, key: 'row-2', interventionId: 'INT-2' }]} catalog={[{ ...catalog[0], nome: 'API' }]} lot="2" />);
  expandInterventions();
  expect(screen.getByRole('button', { name: /Apri il dettaglio: INT-1/ })).toBeVisible(); expect(screen.getByRole('button', { name: /Apri il dettaglio: INT-2/ })).not.toBeVisible();      // INT-2 is in a group that is still closed
  fireEvent.click(screen.getByRole('button', { name: 'Voce catalogo' }));
  fireEvent.click(screen.getByText('Voci catalogo', { selector: 'summary' }));
  fireEvent.click(screen.getByText('API', { selector: 'summary strong' }));
  expect(document.querySelectorAll('button.rrl-row')).toHaveLength(2);
  expect(screen.getByRole('button', { name: /Apri il dettaglio: INT-1/ })).toBeVisible(); expect(screen.getByRole('button', { name: /Apri il dettaglio: INT-2/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Mostra dettagli e importi/ })); expect(openRow()).toHaveTextContent('Prezzo Excel');
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi il dettaglio' }));
  fireEvent.click(screen.getByRole('button', { name: /Nascondi dettagli e importi/ })); expect(openRow()).not.toHaveTextContent('Prezzo Excel');
});
test('associates legacy Excel codes with a different system catalog identifier explicitly', () => {
 const onAssign=jest.fn();
 render(<OfferPriceComparison items={[{...item,original:{...item.original,catalogId:239}}]} catalog={[{id:'driver-api',nome:'Servizio API',prezzi:{MODIFICA:{Medio:400}}}]} lot="2" onAssign={onAssign}/>);
 fireEvent.click(screen.getByText('Associare i codici Excel alle Voci Catalogo del contratto'));
 fireEvent.change(screen.getByRole('combobox',{name:'Voce contratto per ID Excel 239'}),{target:{value:'driver-api'}});
 expect(onAssign).not.toHaveBeenCalled();
  expect(screen.getByText('Associazione attuale')).toBeInTheDocument();
  expect(screen.getByText('Voce contrattuale scelta: Servizio API')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Conferma associazione · 1 attività · ID Excel 239'}));
 expect(onAssign).toHaveBeenCalledWith(239,'driver-api');
});
