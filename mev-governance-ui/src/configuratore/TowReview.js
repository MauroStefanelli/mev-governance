import React from 'react';
import { euro } from '../utils';
import { AUTO, MANUAL, autoTowRow, amountOf, roundUp, roundingPreview } from './towModel';
import './towReview.css';

const qtyText = value => (value == null ? '—' : Number(value).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 3 }));
const delta = value => `${value >= 0 ? '+' : '−'}${euro.format(Math.abs(value))}`;

// I TOW della Revisione: per ognuno si vedono gli EURO calcolati e, sotto, i TOW PREVISTI (le quantita'); le quantita' si possono cambiare e gli euro si ricalcolano (quantita' x
// prezzo unitario), con un tasto che le porta per ECCESSO al multiplo di 0,05 (1,441 -> 1,45). Gli euro mostrati sono quelli di `computed` e delle quantita' scelte (gli stessi del totale dell'offerta):
// qui non si ricalcola nulla da soli, si mostrano e si cambiano le quantita' scelte in `tow`.
//
// `computed` = gli euro che darebbe la sola % di impatto; `prices` = prezzi unitari.
export default function TowReview({ lot, computed, prices, tow, onChange, onRoundAll, onResetAuto, readOnly = false }) {
  const rows = [
    ...AUTO.map(n => { const key = `TOW0${lot}.${n}`; return { n, key, kind: 'auto', ...autoTowRow({ key, computedAmount: computed[key] ?? 0, unitPrice: prices[key], tow }) }; }),
    ...MANUAL.map(n => { const key = `TOW0${lot}.${n}`; const price = Number(prices[key] || tow?.[`${key}_price`]) || 0; const quantity = Number(tow?.[key]) || 0;
      return { n, key, kind: 'manual', source: 'manuale', quantity, computedQuantity: quantity, amount: amountOf(quantity, price), computedAmount: amountOf(quantity, price), unitPrice: price || null }; }),
  ];
  const preview = roundingPreview(rows);
  const totalTow = rows.reduce((sum, row) => sum + row.amount, 0);
  const anyChosen = rows.some(row => row.kind === 'auto' && row.source === 'scelta');
  return <section className="tr" aria-label="TOW dell’offerta">
    <header className="tr-head">
      <div><p className="tr-eyebrow">TOW · Lotto {lot}</p><h3>TOW previsti e importi</h3>
        <p className="tr-sub">Sotto ogni importo trovi i <strong>TOW previsti</strong> (le quantità). Cambiali e gli euro si ricalcolano: quantità × prezzo unitario.</p></div>
      <div className="tr-total"><span>Totale TOW</span><strong>{euro.format(totalTow)}</strong></div>
    </header>
    <ul className="tr-grid">{rows.map(row => {
      const edited = row.kind === 'auto' && row.source === 'scelta';
      const noPrice = !row.unitPrice;
      const rounded = row.quantity == null ? null : roundUp(row.quantity);
      const canRound = rounded != null && Math.abs(rounded - row.quantity) > 1e-9 && !noPrice;
      return <li key={row.key} className={`tr-card${edited ? ' is-edited' : ''}${noPrice ? ' is-noprice' : ''}`}>
        <div className="tr-top"><strong>{row.key}</strong><span className="tr-tag">{row.kind === 'manual' ? 'Manuale' : edited ? 'Quantità scelta' : 'Calcolato dalla %'}</span></div>
        <div className="tr-amount" aria-label={`Importo ${row.key}`}>{euro.format(row.amount)}</div>
        {edited && Math.abs(row.amount - row.computedAmount) > 0.005 && <div className="tr-diff">{delta(row.amount - row.computedAmount)} rispetto al calcolo dalla %</div>}
        <div className="tr-qty">
          <label><span>TOW previsti</span>
            <input type="number" min="0" step="0.05" inputMode="decimal" aria-label={`TOW previsti ${row.key}`} disabled={readOnly || noPrice}
              value={row.quantity == null ? '' : Number(row.quantity.toFixed(3))}
              onChange={event => onChange(row.key, event.target.value === '' ? null : Math.max(0, Number(event.target.value)))} /></label>
          <button type="button" className="tr-round" disabled={readOnly || !canRound} onClick={() => onChange(row.key, rounded)} title={canRound ? `${qtyText(row.quantity)} → ${qtyText(rounded)}` : 'Già a un multiplo di 0,05'}>Arrotonda per eccesso</button>
        </div>
        {row.kind === 'auto' && !edited && row.amount === 0 && !noPrice && <div className="tr-zero">Importo a zero: la % di impatto è 0. Imposta la % nel passo Offerta o scrivi qui la quantità.</div>}
        <div className="tr-meta">{noPrice ? 'Prezzo unitario non disponibile: la quantità non si può calcolare.' : `${euro.format(row.unitPrice)} / unità`}
          {edited && row.computedQuantity != null && <span> · dalla % sarebbero {qtyText(row.computedQuantity)}</span>}</div>
        {edited && <button type="button" className="tr-reset" disabled={readOnly} onClick={() => onResetAuto(row.key)}>Torna al calcolo dalla %</button>}
      </li>;
    })}</ul>
    <footer className="tr-foot">
      <button type="button" className="tr-roundall" disabled={readOnly || preview.changed === 0} onClick={onRoundAll}>Arrotonda tutti i TOW per eccesso{preview.changed ? ` (${preview.changed})` : ''}</button>
      <span className="tr-hint" role="status">{preview.changed ? `Porta ${preview.changed} ${preview.changed === 1 ? 'quantità' : 'quantità'} al multiplo di 0,05 superiore: l’offerta sale di ${euro.format(preview.extra)}.` : 'Tutte le quantità sono già a un multiplo di 0,05.'}</span>
      {anyChosen && <button type="button" className="tr-resetall" disabled={readOnly} onClick={() => onResetAuto(null)}>Torna al calcolo dalla % per tutti</button>}
    </footer>
    <p className="tr-note">Per TOW .1, .3 e .4 una quantità scelta prende il posto del calcolo dalla percentuale di impatto; i TOW .2 e .6 sono già a quantità. Salva la valutazione per conservare le quantità.</p>
  </section>;
}
