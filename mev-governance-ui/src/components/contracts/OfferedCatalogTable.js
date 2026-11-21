import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { offeredCatalogTable, saveOfferedCatalogTable } from '../../services/mevService';
import { COLUMNS, toEditable, toPayload, isDirty, changedCells, gara, tableProblems, priceProblem } from '../../configuratore/offeredTable';
import { euro } from '../../utils';
import './offeredCatalog.css';

const when = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const cellValue = (row, col) => col.key.startsWith('descrizioni.') ? row.descrizioni[col.band] : col.kind === 'price' ? row.prezzi[col.type][col.band] : row[col.key];

// La tabella del catalogo offerto gia' importato: tutte le voci, nell'ordine ID, Ambito, Voce, descrizioni, prezzi. ID, Ambito e Voce sono quelli di gara (sola lettura);
// descrizioni e prezzi offerti si modificano qui e si salvano insieme, con gli stessi controlli dell'import da Excel.
export default function OfferedCatalogTable({ contractId, lotId, reloadKey, onSaved }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [original, setOriginal] = useState([]);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setError(''); setProblems([]);
    try {
      const response = await offeredCatalogTable(contractId, lotId);
      const editable = response.rows.map(toEditable);
      setData(response); setRows(editable); setOriginal(editable);
    } catch (e) { setError(e.message); setData({ rows: [], loaded: false }); }
  }, [contractId, lotId]);
  useEffect(() => { load(); }, [load, reloadKey]);

  const dirty = useMemo(() => isDirty(original, rows), [original, rows]);
  const changed = useMemo(() => changedCells(original, rows), [original, rows]);
  const local = useMemo(() => tableProblems(rows), [rows]);

  // Gli errori del server (dopo un tentativo di salvataggio) hanno la precedenza; altrimenti quelli rilevati mentre si scrive, ma solo se c'e' qualcosa da salvare.
  const shown = problems.length > 0 ? problems : (dirty ? local.errors : []);
  const edit = (index, col, value) => { setNotice(''); setRows(prev => prev.map((row, i) => {
    if (i !== index) return row;
    if (col.key.startsWith('descrizioni.')) return { ...row, descrizioni: { ...row.descrizioni, [col.band]: value } };
    if (col.kind === 'price') return { ...row, prezzi: { ...row.prezzi, [col.type]: { ...row.prezzi[col.type], [col.band]: value } } };
    return { ...row, [col.key]: value };
  })); };
  const save = async () => {
    if (local.errors.length) { setProblems(local.errors); return; }
    setBusy(true); setError(''); setProblems([]); setNotice('');
    try {
      const result = await saveOfferedCatalogTable(contractId, lotId, data.stamp, toPayload(rows));
      setNotice(`Modifiche salvate: ${result.count} voci.${result.warnings?.length ? ` ${result.warnings.length} da controllare.` : ''}`);
      await load(); onSaved?.();
    } catch (e) { setError(e.message); if (e.errors?.length) setProblems(e.errors); }
    finally { setBusy(false); }
  };
  const discard = () => { setRows(original); setProblems([]); setNotice(''); setError(''); };

  if (data === null) return <p role="status">Caricamento della tabella…</p>;
  if (!data.loaded) return <p className="oc-sub" role="status">Il catalogo offerto non è ancora stato caricato: quando lo importi da Excel qui trovi tutte le voci, da controllare e modificare.</p>;
  const meta = data.meta || {};
  const shownProblems = shown.slice(0, 12);
  return <section aria-label="Catalogo offerto caricato">
    <div className="oc-tablehead"><h4>Catalogo offerto caricato</h4>
      <p>{rows.length} voci{meta.fileName ? ` · da ${meta.fileName}` : ''}{meta.updatedAt || meta.importedAt ? ` · aggiornato il ${when(meta.updatedAt || meta.importedAt)}` : ''}{meta.updatedByFullName || meta.updatedBy || meta.importedByFullName ? ` da ${meta.updatedByFullName || meta.updatedBy || meta.importedByFullName}` : ''}</p></div>
    <p className="oc-sub" style={{ margin: '0 0 12px' }}>ID, Ambito e Voce sono quelli di gara; descrizioni e prezzi offerti si modificano qui. Sotto ogni prezzo vedi la base d’asta.</p>
    <div className="oc-tablewrap is-tall" role="region" aria-label="Tabella del catalogo offerto" tabIndex={0}>
      <table className="oc-table" style={{ minWidth: 2100 }}>
        <thead><tr>{COLUMNS.map(col => <th key={col.key} scope="col" className={[col.key === 'id' ? 'is-id' : '', col.kind === 'price' ? 'is-num' : ''].join(' ').trim()}>{col.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.id}>
          {COLUMNS.map(col => {
            const flag = changed.has(`${i}|${col.key}`);
            if (col.kind === 'fixed') return <td key={col.key} className={col.key === 'id' ? 'is-id' : col.key === 'nome' ? 'is-name' : ''}>{cellValue(row, col)}</td>;
            if (col.kind === 'text') return <td key={col.key} className={`is-text ${flag ? 'is-changed' : ''}`}>
              <textarea className="oc-textarea" aria-label={`${col.label} voce ${row.id}`} value={cellValue(row, col)} rows={open === `${i}|${col.key}` ? 7 : 2} maxLength={2000} disabled={busy}
                onFocus={() => setOpen(`${i}|${col.key}`)} onBlur={() => setOpen(null)} onChange={e => edit(i, col, e.target.value)}
                placeholder={col.key === 'descrizione' && row.descrizioneGara ? `Gara: ${row.descrizioneGara.slice(0, 80)}${row.descrizioneGara.length > 80 ? '…' : ''}` : ''} /></td>;
            const base = gara(row, col.type, col.band); const problem = priceProblem(cellValue(row, col), base);
            return <td key={col.key} className={`is-price is-num ${flag ? 'is-changed' : ''}`}>
              <input className={`oc-input ${problem.error ? 'is-bad' : problem.warning ? 'is-warn' : ''}`} aria-label={`${col.label} voce ${row.id}`} inputMode="decimal" value={cellValue(row, col)} disabled={busy} onChange={e => edit(i, col, e.target.value)}
                aria-invalid={problem.error ? 'true' : undefined} title={problem.error || problem.warning || ''} />
              <div className="oc-base">gara {base != null ? euro.format(base) : '—'}</div></td>;
          })}</tr>)}</tbody>
      </table>
    </div>
    {shownProblems.length > 0 && <div role="alert" className="oc-msg is-bad" style={{ margin: '12px 0 0' }}><strong>Non posso salvare ({shown.length} problemi):</strong><ul>{shownProblems.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
    {local.warnings.length > 0 && <p className="oc-msg is-warn" style={{ margin: '12px 0 0' }}>{local.warnings.length} prezzi da controllare (non bloccano il salvataggio): {local.warnings.slice(0, 3).join(' · ')}{local.warnings.length > 3 ? '…' : ''}</p>}
    {error && <p role="alert" className="oc-msg is-bad" style={{ margin: '12px 0 0' }}>{error}</p>}
    {notice && <p role="status" className="oc-msg is-ok" style={{ margin: '12px 0 0' }}>{notice}</p>}
    <div className={`oc-savebar ${dirty ? 'is-dirty' : ''}`}>
      {dirty ? <span>Hai modifiche non salvate: le celle cambiate sono evidenziate in giallo.</span> : <span style={{ color: '#5d718a', fontWeight: 500 }}>Nessuna modifica da salvare.</span>}
      <button type="button" className="oc-btn oc-btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Salvataggio…' : `Salva le modifiche${dirty ? ` (${changed.size})` : ''}`}</button>
      <button type="button" className="oc-btn" disabled={busy || !dirty} onClick={discard}>Annulla le modifiche</button>
    </div>
  </section>;
}
