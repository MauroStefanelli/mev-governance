import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveCatalogEntry } from './catalogReconciliation';
import { detailReviewInput, detailReviewSignature } from './offerDetailReview';
import { entriesForIntervention } from './rationaleKnowledge';
import RowRationale from './RowRationale';
import { LABELS, SHORT, rowState, shortDescription, shortReason, summarize, sortRows, filterRows } from './rowReviewModel';
import { euro } from '../utils';
import './rowReviewList.css';

const money = value => value == null ? 'Non disponibile' : euro.format(value);
const FILTERS = [['all', 'Tutte'], ['attention', 'Da guardare'], ['non_coerente', 'Incoerenti'], ['da_verificare', 'Da verificare'], ['stale', 'Da aggiornare'], ['coerente', 'Coerenti'], ['none', 'Da eseguire']];

// Le righe verificate dall'AI come ELENCO: una riga = una attivita', con il suo esito e una breve descrizione. Un click apre una finestra con tutto il dettaglio, nella quale le due
// colonne di sinistra (Intervento / attivita' e Voce catalogo) restano ferme e scorre solo la «Verifica AI attivita' / catalogo».
export default function RowReviewList({ lines, catalog, interventions, contractId, lot, reviews, reviewBusy, rationale, showEconomics, builtin,
  onAddRationale, onShareRationale, onReviewIntervention, canEditRationale = true, groupTitle = '' }) {
  const [filter, setFilter] = useState('all');
  const [bySeverity, setBySeverity] = useState(true);
  const [openKey, setOpenKey] = useState(null);
  const rows = useMemo(() => lines.map(line => {
    const { item, index } = line;
    const input = detailReviewInput(item, catalog, interventions, contractId, lot, index, entriesForIntervention(rationale, item.interventionId));
    const review = reviews[input.rowId]; const stale = !!review && review.signature !== detailReviewSignature(input);
    return { ...line, key: String(item.key ?? index), position: index, review, stale, state: rowState(review, stale), entry: resolveCatalogEntry(item, catalog) };
  }), [lines, catalog, interventions, contractId, lot, reviews, rationale]);
  const counts = summarize(rows);
  const visible = sortRows(filterRows(rows, filter), bySeverity);
  const current = rows.find(row => row.key === openKey) || null;
  const position = current ? visible.findIndex(row => row.key === current.key) : -1;
  // Se la riga aperta sparisce (per esempio dopo un filtro), la finestra si chiude da sola: non resta aperta su qualcosa che non c'e' piu'.
  useEffect(() => { if (openKey && !rows.some(row => row.key === openKey)) setOpenKey(null); }, [rows, openKey]);

  return <div className="rrl">
    <div className="rrl-tools">
      <div className="rrl-filters" role="group" aria-label="Filtra le righe per esito">
        {FILTERS.filter(([id]) => id === 'all' || (counts[id] || (id === 'attention' && ['non_coerente', 'da_verificare', 'error', 'stale'].some(s => counts[s])))).map(([id, label]) => {
          const n = id === 'all' ? counts.all : id === 'attention' ? ['non_coerente', 'da_verificare', 'error', 'stale'].reduce((sum, s) => sum + (counts[s] || 0), 0) : counts[id] || 0;
          return <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} <span>{n}</span></button>;
        })}
      </div>
      <label className="rrl-sort"><input type="checkbox" checked={bySeverity} onChange={event => setBySeverity(event.target.checked)} /> Prima quelle da guardare</label>
    </div>
    {visible.length === 0 ? <p className="rrl-empty">Nessuna riga con questo esito.</p> : <ul className="rrl-list" aria-label={groupTitle ? `Righe di ${groupTitle}` : 'Righe verificate'}>
      {visible.map(row => <li key={row.key}>
        <button type="button" className={`rrl-row rrl-${row.state}`} onClick={() => setOpenKey(row.key)} aria-label={`Apri il dettaglio: ${row.item.interventionId || 'attività'} · ${row.entry?.nome || row.item.detail?.name || row.item.id}`}>
          <span className={`rrl-badge rrl-badge-${row.state}`}>{SHORT[row.state]}</span>
          <span className="rrl-main">
            <strong>{row.item.interventionId || 'Senza ID intervento'}{row.item.detail?.componentApplication ? ` · ${row.item.detail.componentApplication}` : ''}</strong>
            <span className="rrl-desc">{shortDescription(row.item)}</span>
            <span className="rrl-cat">{row.entry?.nome || row.item.detail?.name || row.item.id}</span>
          </span>
          <span className="rrl-ai">{row.review ? shortReason(row.review) : <em>Nessun esito: avvia la verifica.</em>}</span>
          <span className="rrl-go" aria-hidden="true">›</span>
        </button>
      </li>)}
    </ul>}
    {current && <RowReviewDialog row={current} total={visible.length} position={position} showEconomics={showEconomics} builtin={builtin} reviewBusy={reviewBusy} rationale={rationale}
      onAddRationale={onAddRationale} onShareRationale={onShareRationale} onReviewIntervention={onReviewIntervention && (id => { setOpenKey(null); onReviewIntervention(id); })} canEditRationale={canEditRationale}
      onClose={() => setOpenKey(null)} onPrev={position > 0 ? () => setOpenKey(visible[position - 1].key) : null} onNext={position >= 0 && position < visible.length - 1 ? () => setOpenKey(visible[position + 1].key) : null} />}
  </div>;
}

// La finestra del dettaglio di UNA riga. Le due colonne di sinistra restano ferme; scorre solo la colonna dell'AI.
function RowReviewDialog({ row, total, position, showEconomics, reviewBusy, rationale, onAddRationale, onShareRationale, onReviewIntervention, canEditRationale, onClose, onPrev, onNext }) {
  const { item, review, stale, entry, original, price, difference } = row;
  const titleId = useId(); const closeRef = useRef(null); const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; closeRef.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      else if (event.key === 'Tab' && dialogRef.current) {                  // il fuoco resta nella finestra
        const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [onClose]);
  return createPortal(<div className="rrd-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="rrd" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
      <header className="rrd-head">
        <div><span className="rrd-eyebrow">Riga {position + 1} di {total}</span><h2 id={titleId}>{item.interventionId || 'Senza ID intervento'} · {entry?.nome || item.detail?.name || item.id}</h2></div>
        <div className="rrd-nav"><button type="button" onClick={onPrev || undefined} disabled={!onPrev} aria-label="Riga precedente">‹</button><button type="button" onClick={onNext || undefined} disabled={!onNext} aria-label="Riga successiva">›</button>
          <button type="button" ref={closeRef} className="rrd-close" onClick={onClose} aria-label="Chiudi il dettaglio">✕</button></div>
      </header>
      <div className="rrd-body">
        {/* A sinistra le due colonne ferme: scorrono solo se sono piu' alte dello schermo, mai insieme alla colonna dell'AI. */}
        <div className="rrd-fixed">
          <section className="rrd-col rrd-activity" aria-label="Intervento / attività">
            <h3>Intervento / attività</h3>
            <p className="rrd-id">{item.interventionId || 'Senza ID intervento'}</p>
            {item.detail?.componentApplication && <p><b>Componente</b><br />{item.detail.componentApplication}</p>}
            <p><b>Descrizione</b><br />{item.detail?.detailDescription || item.reason || 'Nessuna descrizione'}</p>
            {item.detail?.technology && <p><b>Tecnologia</b><br />{item.detail.technology}</p>}
          </section>
          <section className="rrd-col rrd-catalog" aria-label="Voce catalogo">
            <h3>Voce catalogo</h3>
            <p className="rrd-id">{entry?.nome || item.detail?.name || item.id}</p>
            <div className="rrd-ids"><span>ID Excel {original?.catalogId ?? item.id}</span><span>ID Intervento {item.interventionId || 'Non indicato'}</span></div>
            <dl className="rrd-facts"><div><dt>Tipo</dt><dd>{item.type}</dd></div><div><dt>Complessità</dt><dd>{item.complexity}</dd></div><div><dt>Quantità</dt><dd>{item.qty}</dd></div></dl>
            {showEconomics && <dl className="rrd-facts rrd-money"><div><dt>Prezzo Excel</dt><dd>{money(original?.unit)}</dd></div><div><dt>Prezzo catalogo</dt><dd>{money(price)}</dd></div><div><dt>Differenza unitaria</dt><dd>{money(difference)}</dd></div><div><dt>Prezzo in uso</dt><dd>{money(item.unit)}</dd></div></dl>}
          </section>
        </div>
        {/* A destra l'unica parte che scorre. */}
        <section className="rrd-col rrd-ai" aria-label="Verifica AI attività / catalogo" tabIndex={0}>
          <h3>Verifica AI attività / catalogo</h3>
          {review ? <>
            <strong className={`offer-ai-status ${stale ? 'stale' : review.status}`}>{stale ? 'Da aggiornare: dati modificati dopo la verifica' : LABELS[review.status]}</strong>
            <div className="offer-ai-reason">{review.reason}</div>
            {review.suggestion && <div className="offer-ai-suggestion"><b>Indicazione per l’analista</b><p>{review.suggestion}</p></div>}
            {review.evidence && <details><summary>Evidenze utilizzate</summary><p>{review.evidence}</p></details>}
            {review.model && <small>{review.model} · {new Date(review.reviewedAt).toLocaleString('it-IT')}</small>}
          </> : <div className="offer-ai-empty"><strong>{reviewBusy ? 'Analisi in corso' : 'Verifica da eseguire'}</strong><p>{reviewBusy ? 'L’esito di questa attività apparirà qui.' : 'Avvia la verifica AI per confrontare attività, voce e complessità.'}</p></div>}
          {onAddRationale && <RowRationale entries={rationale} interventionId={item.interventionId} canEdit={canEditRationale} busy={reviewBusy} onAdd={(kind, text, interventionId) => onAddRationale(kind, text, interventionId)} onShare={onShareRationale} />}
          {onReviewIntervention && item.interventionId && <button type="button" className="offer-ai-redo" disabled={reviewBusy} onClick={() => onReviewIntervention(item.interventionId)}>Rifai la verifica dell’intervento {item.interventionId}</button>}
        </section>
      </div>
    </div>
  </div>, document.body);
}
