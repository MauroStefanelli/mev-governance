import "./offerPriceComparison.css";
import React, { useState } from 'react';
import { reconcileCatalog, resolveCatalogEntry } from './catalogReconciliation';
import { detailReviewInput, detailReviewSignature } from './offerDetailReview';
const money = value => value == null ? 'Non disponibile' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
export default function CatalogReconciliation({ items, catalog, contractName, lot, builtin, onApply, onAssign, recovery, contractId, interventions = [], reviews = {}, reviewBusy, reviewProgress, onReview }) {
  const [choices, setChoices] = useState({});
  const [view, setView] = useState('interventions');
  const [showEconomics, setShowEconomics] = useState(false);
  const result = reconcileCatalog(items, catalog);
  const groups = new Map();
  result.lines.forEach((line, index) => {
    const entry = resolveCatalogEntry(line.item, catalog);
    const id = view === 'interventions' ? String(line.item.interventionId || 'Senza ID intervento') : String(entry?.id ?? line.item.id);
    const title = view === 'interventions' ? id : String(entry?.nome || line.item.detail?.name || id);
    if (!groups.has(id)) groups.set(id, { title, lines: [] });
    groups.get(id).lines.push({ ...line, index });
  });
  const originalCodes = [...new Set(result.lines.map(l => l.original?.catalogId).filter(Boolean))];
  if (!result.lines.length) return null;
  return <section className="offer-price-comparison" aria-label="Confronto prezzi Excel e catalogo" style={{ background: '#fff', padding: 16, border: '1px solid #cbd5e1', borderRadius: 8, margin: '16px 0' }}>
    <header className="offer-comparison-heading"><div><span className="offer-comparison-eyebrow">Validazione tecnica ed economica</span><h2>Confronto Excel e Voci Catalogo</h2><p>{contractName || 'Contratto non selezionato'} · Lotto {lot}{builtin ? ' · Catalogo predefinito: verificare il contratto di sistema' : ''}</p></div><span className="offer-comparison-count">{result.lines.length} righe importate</span></header>
    <div className="offer-comparison-totals"><div><span>Totale originale Excel</span><strong>{money(result.originalTotal)}</strong></div><div><span>Totale base d’asta catalogo · quantità correnti</span><strong>{money(result.catalogTotal)}</strong></div><p>Leggi prima la verifica AI di ciascuna attività, poi confronta gli importi e scegli se applicare il prezzo contrattuale.</p></div>
    {!!result.missing && <p role="alert">{result.missing} righe senza prezzo di catalogo valido: il confronto complessivo non è disponibile. Le righe sono conservate.</p>}
    {recovery && <p role="status">{recovery.recoveredPrices} prezzi di base d’asta recuperati dal catalogo della gara collegata {recovery.garaId}. I prezzi già presenti nel contratto sono conservati.</p>}
    <details className="offer-comparison-help"><summary>Come leggere il confronto</summary><p>Il riferimento della stima è la base d’asta delle Voci Catalogo del contratto selezionato. I prezzi offerti della gara sono separati. I prezzi originali restano conservati. Il confronto riguarda il dettaglio a catalogo (TOW .5), non le altre TOW. Applica un prezzo solo dopo aver verificato il contratto.</p></details>
    {onAssign && !builtin && <details><summary>Associare i codici Excel alle Voci Catalogo del contratto</summary>
      <p>L’associazione vale per le righe di questa offerta con lo stesso codice originale. I prezzi in uso restano invariati finché non scegli «Usa catalogo».</p>
      {originalCodes.map(code => <div key={code} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
        <label>ID Excel {code} <select aria-label={`Voce contratto per ID Excel ${code}`} value={choices[code] || ''} onChange={e => setChoices(prev => ({ ...prev, [code]: e.target.value }))}>
          <option value="">Seleziona la voce del contratto</option>
          {catalog.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.id}</option>)}
        </select></label>
        <button type="button" disabled={!catalog.some(c => String(c.id) === choices[code])} onClick={() => onAssign(code, choices[code])}>Associa righe ID Excel {code}</button>
      </div>)}
    </details>}
    {onReview && <div className="offer-review-toolbar"><button type="button" disabled={reviewBusy} onClick={onReview}>{reviewBusy ? 'Verifica AI in corso…' : 'Verifica / aggiorna coerenza AI delle righe'}</button><span role="status">{reviewProgress}</span><p>Giudizio AI sulla coerenza attività/catalogo, da confermare dall’analista. Non modifica interventi, complessità o prezzi.</p></div>}
    <div className="offer-view-toolbar">
      <div className="offer-view-switch" role="group" aria-label="Raggruppa confronto">
        <button type="button" aria-pressed={view === 'interventions'} onClick={() => setView('interventions')}>Interventi</button>
        <button type="button" aria-pressed={view === 'catalog'} onClick={() => setView('catalog')}>Voce catalogo</button>
      </div>
      <button type="button" className={`offer-economics-toggle${showEconomics ? ' is-active' : ''}`} aria-expanded={showEconomics} onClick={() => setShowEconomics(value => !value)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 12h2m4 0h2m-8 4h2m4 0h2"/></svg>
        {showEconomics ? 'Nascondi dettagli e importi' : 'Mostra dettagli e importi'}<span aria-hidden="true">{showEconomics ? '−' : '+'}</span>
      </button>
    </div>
    <details className="offer-group-directory" key={view}><summary>{view === 'interventions' ? 'Interventi' : 'Voci catalogo'} <span>{groups.size} gruppi · seleziona per esplorare le attività</span></summary>
    {[...groups.entries()].map(([id, group]) => <details className="offer-activity-group" key={id}>
      <summary><strong>{group.title}</strong><span>{group.lines.length} attività associate</span></summary>
    <div className="offer-price-scroll" role="region" aria-label={`Dettaglio confronto ${group.title}`} tabIndex={0}><table className={`offer-price-table${showEconomics ? '' : ' offer-price-table-compact'}`}>
      <colgroup>{[300, 180, 460, ...(showEconomics ? [140, 75, 120, 125, 130, 125] : []), 130].map((width,i) => <col key={i} style={{ width }} />)}</colgroup>
      <thead><tr>{['Intervento / attività', 'Voce catalogo', 'Verifica AI attività / catalogo', ...(showEconomics ? ['Tipo / complessità', 'Quantità', 'Prezzo Excel', 'Prezzo catalogo', 'Differenza unitaria', 'Prezzo in uso'] : []), 'Azione'].map((h, i) => <th key={h} scope="col" className={i === 2 ? 'offer-ai-heading' : undefined}>{h}</th>)}</tr></thead>
      <tbody>{group.lines.map(({ item, price, original, difference, index }) => {
        const input = detailReviewInput(item, catalog, interventions, contractId, lot, index);
        const review = reviews[input.rowId];
        const stale = review && review.signature !== detailReviewSignature(input);
        const labels = { coerente: 'Coerente secondo AI', da_verificare: 'Da verificare', non_coerente: 'Possibile incoerenza', error: 'Verifica non disponibile' };
        return <tr key={item.key ?? index} style={{ borderTop: '1px solid #e2e8f0' }}>
        <td style={{ padding: 8, minWidth: 230 }}><strong>{item.interventionId}</strong><div>{item.detail?.componentApplication}</div><div>{item.detail?.detailDescription || item.reason}</div></td>
        <td className="offer-price-code"><strong>{resolveCatalogEntry(item, catalog)?.nome || item.detail?.name || item.id}</strong><div className="offer-row-identity"><span>ID Excel {original?.catalogId ?? item.id}</span><span>ID Intervento {item.interventionId || 'Non indicato'}</span></div></td>
        <td className="offer-ai-review"><div className="offer-ai-card">{review ? <><strong className={`offer-ai-status ${stale ? 'stale' : review.status}`}>{stale ? 'Da aggiornare: dati modificati dopo la verifica' : labels[review.status]}</strong><div className="offer-ai-reason">{review.reason}</div>{review.suggestion && <div className="offer-ai-suggestion"><b>Indicazione per l’analista</b><p>{review.suggestion}</p></div>}{review.evidence && <details><summary>Evidenze utilizzate</summary><p>{review.evidence}</p></details>}{review.model && <small>{review.model} · {new Date(review.reviewedAt).toLocaleString('it-IT')}</small>}</> : <div className="offer-ai-empty"><strong>{reviewBusy ? 'Analisi in corso' : 'Verifica da eseguire'}</strong><p>{reviewBusy ? 'L’esito di questa attività apparirà qui.' : 'Avvia la verifica AI per confrontare attività, voce e complessità.'}</p></div>}</div></td>
        {showEconomics && <><td><span className="offer-type">{item.type}</span><div className="offer-complexity">{item.complexity}</div></td><td className="offer-price-number">{item.qty}</td>
        <td className="offer-price-number">{money(original?.unit)}</td><td className="offer-price-number">{money(price)}</td><td className="offer-price-number">{money(difference)}</td><td className="offer-price-number">{money(item.unit)}</td>
        </>}
        <td><button type="button" disabled={price == null || builtin} onClick={() => onApply(item.key, price)} aria-label={`Applica prezzo catalogo riga ${index + 1}`}>Usa catalogo</button></td>
      </tr>; })}</tbody>
    </table></div></details>)}</details>
  </section>;
}
