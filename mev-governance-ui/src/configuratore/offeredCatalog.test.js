import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import lotto2 from './__fixtures__/lotto2Catalogo.json';
import { effectiveCatalog, hasOfferedCatalog, offeredComparison, offeredCoverage, realignPreview, applyRealign, catalogBasisLabel } from './offeredCatalog';
import { resolveCatalogEntry, catalogUnitPrice } from './catalogReconciliation';
import { defaultPrice, calc } from './configuratoreCore';
import RealignOfferedPrices from './RealignOfferedPrices';

// Il catalogo di gara e' quello VERO del lotto 2 (27 voci). Il catalogo offerto e' scritto come lo salva il server: solo id + prezzi.
const offered = (factor, only) => lotto2.filter(e => !only || only.includes(e.id)).map(e => ({ id: e.id, prezzi: Object.fromEntries(Object.entries(e.prezzi).map(([t, bands]) => [t, Object.fromEntries(Object.entries(bands).map(([b, v]) => [b, v > 0 ? Math.round(v * factor * 100) / 100 : null]))])) }));
const lot = (extra = {}) => ({ lotId: '2', name: 'Lotto 2', catalog: lotto2, ...extra });

test('without an offered catalog the lot works with the tender prices, exactly as before', () => {
  expect(hasOfferedCatalog(lot())).toBe(false);
  expect(effectiveCatalog(lot())).toBe(lotto2);
  expect(effectiveCatalog(lot({ offeredCatalog: [] }))).toBe(lotto2);
  expect(catalogBasisLabel(lot())).toMatch(/gara/);
});

test('with an offered catalog the prices are the offered ones; names, ambits and descriptions stay the tender ones', () => {
  const catalog = effectiveCatalog(lot({ offeredCatalog: offered(0.5) }));
  expect(catalog).toHaveLength(27);
  const spa = catalog.find(e => e.id === 236);
  expect(spa.prezzi.REALIZZAZIONE.Medio).toBe(1400);   // 2.800 di gara
  expect(spa.prezzi.MODIFICA.Semplice).toBe(140);      // 280 di gara
  expect(spa.nome).toBe('Realizzazione Single Page Application');
  expect(spa.ambito).toBe('Frontend');
  expect(spa.priceBasis).toBe('offerto');
  expect(spa.basePrezzi.REALIZZAZIONE.Medio).toBe(2800);
  expect(lotto2.find(e => e.id === 236).prezzi.REALIZZAZIONE.Medio).toBe(2800);   // il catalogo di gara non e' stato toccato
  expect(catalogBasisLabel(lot({ offeredCatalog: offered(0.5) }))).toBe('Prezzi offerti');
});

test('the catalog the estimate uses really prices the rows with the offered price (defaultPrice and calc)', () => {
  const catalog = effectiveCatalog(lot({ offeredCatalog: offered(0.5) }));
  const row = { id: 236, type: 'REALIZZAZIONE', complexity: 'Medio', qty: 2 };
  expect(catalogUnitPrice(row, catalog)).toBe(1400);
  expect(defaultPrice(row, { catalog, priceMode: 'contract', builtin: false })).toBe(1400);
  expect(catalogUnitPrice(row, lotto2)).toBe(2800);
  const total = c => calc({ items: [{ ...row, unit: defaultPrice(row, { catalog: c, priceMode: 'contract', builtin: false }) }], lot: '2', contractId: 'x', archiveContractId: 'x', tow5Share: 65, towPercentages: {}, tow: {}, discount: 0, contingency: 0, catalog: c, priceMode: 'contract', builtin: false });
  expect(JSON.stringify(total(catalog))).not.toBe(JSON.stringify(total(lotto2)));
});

test('a voice the offered catalog does not cover keeps the tender price; an empty offered price keeps the tender one', () => {
  const catalog = effectiveCatalog(lot({ offeredCatalog: offered(0.5, [236]) }));
  expect(catalog.find(e => e.id === 236).priceBasis).toBe('offerto');
  const other = catalog.find(e => e.id === 239);
  expect(other.priceBasis).toBeUndefined();
  expect(other.prezzi).toEqual(lotto2.find(e => e.id === 239).prezzi);
  const holes = effectiveCatalog(lot({ offeredCatalog: [{ id: 236, prezzi: { REALIZZAZIONE: { Semplice: null, Medio: 1000, Complesso: null }, MODIFICA: {} } }] }));
  expect(holes.find(e => e.id === 236).prezzi.REALIZZAZIONE).toEqual({ Semplice: 1200, Medio: 1000, Complesso: 4800 });
});

test('ids match whether the server sends them as numbers or text', () => {
  const catalog = effectiveCatalog(lot({ offeredCatalog: [{ id: '236', prezzi: { REALIZZAZIONE: { Medio: 777 } } }] }));
  expect(catalog.find(e => e.id === 236).prezzi.REALIZZAZIONE.Medio).toBe(777);
});

test('the comparison shows tender, offered and the discount of every cell', () => {
  const rows = offeredComparison(lot({ offeredCatalog: offered(0.5, [236]) }));
  expect(rows).toHaveLength(27);
  expect(offeredCoverage(lot({ offeredCatalog: offered(0.5, [236]) }))).toBe(1);
  const cell = rows.find(r => r.id === 236).cells.find(c => c.type === 'REALIZZAZIONE' && c.band === 'Medio');
  expect(cell).toMatchObject({ base: 2800, offered: 1400, discount: 50 });
  expect(rows.find(r => r.id === 239).covered).toBe(false);
});

// ---- iniziativa reale: come e' salvata in PROD (146023): unit salvato diverso dalla gara ----
const saved = [
  { key: 'a', id: 481, type: 'MODIFICA', complexity: 'Medio', qty: 1, unit: 189, detail: { name: 'x' } },
  { key: 'b', id: 242, type: 'REALIZZAZIONE', complexity: 'Semplice', qty: 3, unit: 120 },
  { key: 'c', id: 'driver-e73aa5ced75e1679', type: 'MODIFICA', complexity: 'Semplice', qty: 2, unit: 50 },   // voce che non e' in catalogo
];
test('realign: describes what would change and touches nothing', () => {
  const frozen = JSON.stringify(saved);
  const preview = realignPreview(saved, lot({ offeredCatalog: offered(0.5) }), resolveCatalogEntry);
  const byKey = Object.fromEntries(preview.rows.map(r => [r.item.key, r]));
  expect(byKey.a.next).toBe(lotto2.find(e => e.id === 481).prezzi.MODIFICA.Medio * 0.5);
  expect(byKey.b.next).toBe(150);   // 300 x 0,5
  expect(byKey.b.current).toBe(120);
  expect(byKey.c.next).toBeNull();   // nessuna voce di catalogo: resta com'e'
  expect(byKey.c.changes).toBe(false);
  expect(preview.unmatched).toBe(1);
  expect(preview.changed).toBe(2);
  expect(preview.totalBefore).toBe(189 + 3 * 120 + 2 * 50);
  expect(preview.totalAfter).toBe(byKey.a.next + 3 * 150 + 2 * 50);
  expect(JSON.stringify(saved)).toBe(frozen);
});

test('realign: only rows that change get the new unit; quantity, type and complexity stay; the unmatched row is untouched', () => {
  const preview = realignPreview(saved, lot({ offeredCatalog: offered(0.5) }), resolveCatalogEntry);
  const next = applyRealign(preview);
  expect(next.map(r => r.unit)).toEqual([preview.rows[0].next, 150, 50]);
  expect(next.map(r => [r.qty, r.type, r.complexity])).toEqual(saved.map(r => [r.qty, r.type, r.complexity]));
  expect(next[2]).toBe(saved[2]);
  expect(saved[1].unit).toBe(120);
});

test('realign: without an offered catalog nothing is offered to change, and rows already at the offered price do not change', () => {
  expect(realignPreview(saved, lot(), resolveCatalogEntry).changed).toBe(0);
  const already = [{ key: 'z', id: 242, type: 'REALIZZAZIONE', complexity: 'Semplice', qty: 1, unit: 150 }];
  expect(realignPreview(already, lot({ offeredCatalog: offered(0.5) }), resolveCatalogEntry).changed).toBe(0);
});

test('realign: a voice that is only in the tender catalog (not offered) is NOT realigned to the tender price', () => {
  const preview = realignPreview([{ key: 'q', id: 239, type: 'MODIFICA', complexity: 'Medio', qty: 1, unit: 100 }], lot({ offeredCatalog: offered(0.5, [236]) }), resolveCatalogEntry);
  expect(preview.changed).toBe(0);
  expect(preview.rows[0].next).toBeNull();
});

describe('RealignOfferedPrices panel', () => {
  test('is not shown without an offered catalog or without rows', () => {
    const { container, rerender } = render(<RealignOfferedPrices items={saved} lot={lot()} onApply={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RealignOfferedPrices items={[]} lot={lot({ offeredCatalog: offered(0.5) })} onApply={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
  test('shows the preview and changes nothing until the user confirms', () => {
    const onApply = jest.fn();
    render(<RealignOfferedPrices items={saved} lot={lot({ offeredCatalog: offered(0.5) })} onApply={onApply} />);
    expect(screen.getByText(/2 righe hanno un prezzo diverso/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Riallinea ai prezzi offerti…/ }));
    const group = screen.getByRole('group', { name: 'Anteprima riallineamento' });
    expect(within(group).getByText(/1 righe senza prezzo offerto restano come sono/)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Riallinea ai prezzi offerti…/ }));
    fireEvent.click(screen.getByRole('button', { name: /Conferma: usa i prezzi offerti per 2 righe/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].map(r => r.unit)).toEqual([expect.any(Number), 150, 50]);
  });
  test('says so when every row already has the offered price', () => {
    render(<RealignOfferedPrices items={[{ key: 'z', id: 242, type: 'REALIZZAZIONE', complexity: 'Semplice', qty: 1, unit: 150 }]} lot={lot({ offeredCatalog: offered(0.5) })} onApply={jest.fn()} />);
    expect(screen.getByText(/Tutte le righe hanno già il prezzo offerto/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Riallinea/ })).toBeNull();
  });
});

test('the descriptions by complexity travel with the offered voice and only there', () => {
  const texts = { Semplice: '- Numero Campi min uguale= 10', Medio: '- >10 Numero Campi min = 20', Complesso: '- Numero Campi > 20' };
  const withTexts = effectiveCatalog(lot({ offeredCatalog: [{ ...offered(0.5, [236])[0], descrizioni: texts }, ...offered(0.5, [239])] }));
  expect(withTexts.find(e => e.id === 236).descrizioni).toEqual(texts);
  expect(withTexts.find(e => e.id === 236).descrizione).toBe(lotto2.find(e => e.id === 236).descrizione);   // la descrizione generale resta quella di gara
  expect(withTexts.find(e => e.id === 239).descrizioni).toBeUndefined();
  expect(withTexts.find(e => e.id === 241).descrizioni).toBeUndefined();
  expect(effectiveCatalog(lot({ offeredCatalog: [{ ...offered(0.5, [236])[0], descrizioni: {} }] })).find(e => e.id === 236).descrizioni).toBeUndefined();
  expect(offeredComparison(lot({ offeredCatalog: [{ ...offered(0.5, [236])[0], descrizioni: texts }] })).find(r => r.id === 236).descrizioni).toEqual(texts);
});
