import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import RowRationale from './RowRationale';
import { rationaleSignature, rowsAffectedByRationale } from './reviewPlan';
import { detailReviewInput, detailReviewSignature } from './offerDetailReview';
import { entriesForIntervention } from './rationaleKnowledge';

const entry = (id, extra = {}) => ({ id, kind: 'razionale', text: `Ragionamento ${id}`, interventionId: 'I1', status: 'confermata', shared: false, ...extra });
const mount = (props = {}) => render(<RowRationale entries={[]} interventionId="I1" onAdd={jest.fn(async () => {})} onShare={jest.fn(async () => {})} {...props} />);

describe('the rationales of a row', () => {
  test('with none it says so and invites to write one', () => {
    mount();
    expect(screen.getByText(/Nessun razionale per questo intervento/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Aggiungi un razionale' })).toBeInTheDocument();
  });
  test('it lists the confirmed ones of THIS intervention and the general ones; not other interventions\' nor proposals', () => {
    mount({ entries: [entry(1), entry(2, { interventionId: 'I2', text: 'Di un altro intervento' }), entry(3, { interventionId: null, text: 'Vale per tutta l’iniziativa' }), entry(4, { status: 'proposta', text: 'Solo una proposta' }), entry(5, { status: 'revocata', text: 'Revocato' })] });
    expect(screen.getByText('Ragionamento 1')).toBeInTheDocument();
    expect(screen.getByText(/Vale per tutta l’iniziativa/)).toBeInTheDocument();
    expect(screen.queryByText('Di un altro intervento')).toBeNull(); expect(screen.queryByText('Solo una proposta')).toBeNull(); expect(screen.queryByText('Revocato')).toBeNull();
  });
  test('adding one: it asks kind, scope and text, saves it for the intervention and closes the form', async () => {
    const onAdd = jest.fn(async () => {});
    mount({ onAdd });
    fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi un razionale' }));
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'vincolo' } });
    fireEvent.change(screen.getByLabelText('Ragionamento'), { target: { value: 'La pagina esiste già: è una MODIFICA.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva il razionale' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('vincolo', 'La pagina esiste già: è una MODIFICA.', 'I1'));
    await waitFor(() => expect(screen.queryByLabelText('Ragionamento')).toBeNull());
  });
  test('«Tutta l’iniziativa» saves it without an intervention', async () => {
    const onAdd = jest.fn(async () => {});
    mount({ onAdd });
    fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi un razionale' }));
    fireEvent.change(screen.getByLabelText('Vale per'), { target: { value: 'iniziativa' } });
    fireEvent.change(screen.getByLabelText('Ragionamento'), { target: { value: 'Vale per tutto.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva il razionale' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('razionale', 'Vale per tutto.', null));
  });
  test('an empty or too long text is refused before sending', () => {
    const onAdd = jest.fn();
    mount({ onAdd });
    fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi un razionale' }));
    expect(screen.getByRole('button', { name: 'Salva il razionale' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Ragionamento'), { target: { value: 'x'.repeat(601) } });
    expect(screen.getByRole('button', { name: 'Salva il razionale' })).toBeDisabled();
    expect(screen.getByText('601 / 600 caratteri')).toHaveClass('rr-bad');
    expect(onAdd).not.toHaveBeenCalled();
  });
  test('a failure of the server is shown and the text typed is kept', async () => {
    mount({ onAdd: jest.fn(async () => { throw new Error('Esiste già una voce identica per questa iniziativa.'); }) });
    fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi un razionale' }));
    fireEvent.change(screen.getByLabelText('Ragionamento'), { target: { value: 'Duplicato' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva il razionale' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esiste già una voce identica');
    expect(screen.getByLabelText('Ragionamento')).toHaveValue('Duplicato');
  });
  test('Annulla closes the form and forgets the text', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi un razionale' })); fireEvent.change(screen.getByLabelText('Ragionamento'), { target: { value: 'boh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi un razionale' }));
    expect(screen.getByLabelText('Ragionamento')).toHaveValue('');
  });
});

describe('sharing a rationale with the other initiatives', () => {
  test('a not shared one offers «Condividi con le altre iniziative»; pressing it shares', async () => {
    const onShare = jest.fn(async () => {});
    mount({ entries: [entry(1)], onShare });
    fireEvent.click(screen.getByRole('button', { name: 'Condividi con le altre iniziative' }));
    await waitFor(() => expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), true));
  });
  test('a shared one says so and offers to take it back', async () => {
    const onShare = jest.fn(async () => {});
    mount({ entries: [entry(1, { shared: true })], onShare });
    fireEvent.click(screen.getByRole('button', { name: /Condiviso · Ritira/ }));
    await waitFor(() => expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), false));
  });
  test('who cannot edit sees what is shared but cannot share or add', () => {
    mount({ entries: [entry(1, { shared: true }), entry(2)], canEdit: false });
    expect(screen.getByText('Condiviso')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Condividi|Ritira|Aggiungi/ })).toBeNull();
  });
  test('a failed share shows the reason', async () => {
    mount({ entries: [entry(1)], onShare: jest.fn(async () => { throw new Error('Indica il sistema dell\'iniziativa'); }) });
    fireEvent.click(screen.getByRole('button', { name: 'Condividi con le altre iniziative' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Indica il sistema');
  });
});

describe('a new rationale makes the rows «to update» (so the AI really reads it)', () => {
  const item = { key: 'k', id: 239, type: 'MODIFICA', complexity: 'Medio', qty: 1, interventionId: 'I1', detail: { detailDescription: 'Attività' } };
  const catalog = [{ id: 239, nome: 'Servizio', ambito: 'Backend', prezzi: {} }];
  const signed = rationale => detailReviewSignature(detailReviewInput(item, catalog, [], 'c', '2', 0, entriesForIntervention(rationale, item.interventionId)));
  test('adding a rationale of the intervention changes the signature of its rows', () => expect(signed([entry(1)])).not.toBe(signed([])));
  test('editing its text changes it; revoking it changes it; sharing it does NOT (sharing is not a new reasoning)', () => {
    expect(signed([entry(1, { text: 'Altro testo' })])).not.toBe(signed([entry(1)]));
    expect(signed([entry(1, { status: 'revocata' })])).toBe(signed([]));
    expect(signed([entry(1, { shared: true })])).toBe(signed([entry(1)]));
  });
  test('a rationale of ANOTHER intervention leaves this row untouched; a general one touches every row', () => {
    expect(signed([entry(1, { interventionId: 'I2' })])).toBe(signed([]));
    expect(signed([entry(1, { interventionId: null })])).not.toBe(signed([]));
  });
  test('the signature of the rationale texts is stable and ignores order', () => expect(rationaleSignature([entry(2), entry(1)])).toBe(rationaleSignature([entry(1), entry(2)])));
  test('how many rows a rationale affects: its intervention, or all rows when it is general', () => {
    const inputs = [{ intervention: { id: 'I1' } }, { intervention: { id: 'I1' } }, { intervention: { id: 'I2' } }];
    expect(rowsAffectedByRationale(inputs, 'I1')).toBe(2); expect(rowsAffectedByRationale(inputs, null)).toBe(3); expect(rowsAffectedByRationale(inputs, 'I9')).toBe(0);
  });
});
