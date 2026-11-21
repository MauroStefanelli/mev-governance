import React, { useState } from 'react';
import { resolveCatalogEntry } from './catalogReconciliation';
import { hasOfferedCatalog, realignPreview, applyRealign } from './offeredCatalog';
import { euro } from '../utils';

// «Riallinea ai prezzi offerti»: the unit prices saved in an initiative come from the offer file and are NOT recalculated when the offered catalog is loaded.
// This shows what would change (nothing is touched), and replaces the prices only after an explicit confirmation.
export default function RealignOfferedPrices({ items, lot, onApply }) {
  const [open, setOpen] = useState(false);
  if (!hasOfferedCatalog(lot) || !(items || []).length) return null;
  const preview = realignPreview(items, lot, resolveCatalogEntry);
  const diff = preview.totalAfter - preview.totalBefore;
  return <section className="offer-realign" aria-label="Riallinea ai prezzi offerti" style={{ background: '#fffbea', border: '1px solid #f3d98b', borderRadius: 8, padding: 14, margin: '12px 0' }}>
    <strong>Prezzi offerti disponibili per questo lotto</strong>
    <p style={{ margin: '6px 0', fontSize: 13 }}>I prezzi di questa iniziativa sono quelli salvati: non cambiano da soli. {preview.changed > 0
      ? `${preview.changed} righe hanno un prezzo diverso da quello offerto.` : 'Tutte le righe hanno già il prezzo offerto.'}</p>
    {preview.changed > 0 && <>
      {!open && <button type="button" onClick={() => setOpen(true)}>Riallinea ai prezzi offerti…</button>}
      {open && <div role="group" aria-label="Anteprima riallineamento">
        <p style={{ fontSize: 13 }}>Totale a catalogo ora <strong>{euro.format(preview.totalBefore)}</strong> · con i prezzi offerti <strong>{euro.format(preview.totalAfter)}</strong> · differenza <strong>{euro.format(diff)}</strong>.
          {preview.unmatched > 0 ? ` ${preview.unmatched} righe senza prezzo offerto restano come sono.` : ''}</p>
        <p style={{ fontSize: 12, color: '#7a4b00' }}>Cambiano soltanto i prezzi unitari delle righe elencate; quantità, tipo e complessità restano. Dopo la conferma salva la valutazione per renderlo definitivo.</p>
        <ul style={{ maxHeight: 180, overflow: 'auto', fontSize: 12 }}>{preview.rows.filter(row => row.changes).map((row, i) => <li key={row.item.key ?? i}>
          {row.item.interventionId ? `${row.item.interventionId} · ` : ''}{row.item.detail?.name || `Voce ${row.item.id}`} · {row.item.type} {row.item.complexity} · {euro.format(row.current ?? 0)} → <strong>{euro.format(row.next)}</strong></li>)}</ul>
        <button type="button" onClick={() => { onApply(applyRealign(preview)); setOpen(false); }}>Conferma: usa i prezzi offerti per {preview.changed} righe</button>{' '}
        <button type="button" onClick={() => setOpen(false)}>Annulla</button>
      </div>}
    </>}
  </section>;
}
