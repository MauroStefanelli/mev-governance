import React, { useState } from 'react';
import { KINDS, KIND_ORDER, MAX_ENTRY, validateText } from './rationaleKnowledge';
import './rowRationale.css';

// I razionali di una riga d'offerta, nella colonna «Verifica AI attività / catalogo»: quelli confermati che l'AI legge per giudicare l'intervento, un modo per scriverne uno
// nuovo e, per ognuno, la scelta di CONDIVIDERLO con le altre iniziative (entra nella «Conoscenza storica AI»). Un razionale nuovo e' subito confermato per questa iniziativa e
// cambia cio' che l'AI leggera' alla prossima verifica: la riga risulta «da aggiornare» e «Aggiorna» o «Rifai questo intervento» la rifanno.
// `entries` = tutte le voci dell'iniziativa; `interventionId` = l'intervento della riga; `onAdd(kind, text, interventionId)`, `onShare(entry, shared)`.
export default function RowRationale({ entries = [], interventionId, onAdd, onShare, canEdit = true, busy = false }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('razionale');
  const [text, setText] = useState('');
  const [scope, setScope] = useState('intervento');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const mine = entries.filter(entry => entry.status === 'confermata' && String(entry.interventionId || '') === String(interventionId ?? '') && interventionId);
  const general = entries.filter(entry => entry.status === 'confermata' && !entry.interventionId);
  const shown = [...mine, ...general];
  const check = validateText(text, MAX_ENTRY);
  const save = async event => {
    event.preventDefault();
    if (!check.ok) { setError(check.reason); return; }
    setError(''); setSending(true);
    try { await onAdd(kind, check.value, scope === 'intervento' ? interventionId : null); setText(''); setOpen(false); }
    catch (e) { setError(e.message || 'Non sono riuscito a salvare il razionale.'); }
    finally { setSending(false); }
  };
  const toggleShare = async entry => { setError(''); try { await onShare(entry, !entry.shared); } catch (e) { setError(e.message); } };
  return <div className="rr" aria-label={`Razionali dell’intervento ${interventionId || ''}`.trim()}>
    <div className="rr-head"><strong>Razionali che l’AI legge per questa riga</strong>{shown.length > 0 && <span className="rr-count">{shown.length}</span>}</div>
    {shown.length === 0 && <p className="rr-empty">Nessun razionale per questo intervento. Se conosci il motivo di un tipo o di una complessità, scrivilo: l’AI lo terrà presente.</p>}
    {shown.length > 0 && <ul className="rr-list">{shown.map(entry => <li key={entry.id}>
      <span className={`rr-kind rr-kind-${entry.kind}`}>{KINDS[entry.kind]?.label || 'Voce'}</span>
      <span className="rr-text">{entry.text}{!entry.interventionId && <em> · vale per tutta l’iniziativa</em>}</span>
      {canEdit && onShare && (entry.shared
        ? <button type="button" className="rr-share is-on" onClick={() => toggleShare(entry)} disabled={busy} title="Smetti di condividerlo con le altre iniziative">✓ Condiviso · Ritira</button>
        : <button type="button" className="rr-share" onClick={() => toggleShare(entry)} disabled={busy} title="Lo rende disponibile nella Conoscenza storica AI e alle altre iniziative dello stesso sistema">Condividi con le altre iniziative</button>)}
      {!canEdit && entry.shared && <span className="rr-shared-tag">Condiviso</span>}
    </li>)}</ul>}
    {canEdit && !open && <button type="button" className="rr-add" onClick={() => { setOpen(true); setError(''); }} disabled={busy}>+ Aggiungi un razionale</button>}
    {canEdit && open && <form className="rr-form" onSubmit={save}>
      <div className="rr-row"><label>Tipo<select value={kind} onChange={event => setKind(event.target.value)}>{KIND_ORDER.map(k => <option key={k} value={k}>{KINDS[k].label} — {KINDS[k].hint}</option>)}</select></label>
        {interventionId ? <label>Vale per<select value={scope} onChange={event => setScope(event.target.value)}><option value="intervento">Solo l’intervento {interventionId}</option><option value="iniziativa">Tutta l’iniziativa</option></select></label> : null}</div>
      <label>Ragionamento<textarea value={text} rows={3} maxLength={MAX_ENTRY + 100} onChange={event => { setText(event.target.value); setError(''); }} placeholder="Es.: la pagina esiste già, si aggiunge solo un campo: è una MODIFICA di complessità Semplice." /></label>
      <small className={text.trim().length > MAX_ENTRY ? 'rr-bad' : ''}>{text.trim().length} / {MAX_ENTRY} caratteri</small>
      {error && <p role="alert" className="rr-error">{error}</p>}
      <div className="rr-actions"><button type="submit" className="rr-primary" disabled={sending || !check.ok}>{sending ? 'Salvo…' : 'Salva il razionale'}</button><button type="button" onClick={() => { setOpen(false); setText(''); setError(''); }} disabled={sending}>Annulla</button></div>
      <p className="rr-note">Il razionale è subito confermato per questa iniziativa. Poi rifai la verifica di questo intervento: l’AI lo leggerà.</p>
    </form>}
    {error && !open && <p role="alert" className="rr-error">{error}</p>}
  </div>;
}
