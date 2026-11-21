import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { offeredCatalogTable, saveOfferedCatalogTable } from '../../services/mevService';
import { COLUMNS, toEditable, toPayload, isDirty, changedCells, gara, tableProblems, priceProblem } from '../../configuratore/offeredTable';
import { euro } from '../../utils';

const when = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
// Solo l'ID resta visibile quando si scorre verso i prezzi: ha larghezza stabile. Fissare anche Ambito/Voce, che hanno larghezza variabile, farebbe sovrapporre le colonne.
const STICKY = { id: { left: 0, minWidth: 64 } };
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
  if (!data.loaded) return <p className="ca-caption" role="status">Il catalogo offerto non è ancora stato caricato: quando lo importi da Excel qui trovi tutte le voci, da controllare e modificare.</p>;
  const meta = data.meta || {};
  return <section aria-label="Catalogo offerto caricato" style={{ marginTop: 14 }}>
    <h4 style={{ margin: '0 0 4px' }}>Catalogo offerto caricato</h4>
    <p className="ca-caption">{rows.length} voci{meta.fileName ? ` · da ${meta.fileName}` : ''}{meta.updatedAt || meta.importedAt ? ` · aggiornato il ${when(meta.updatedAt || meta.importedAt)}` : ''}{meta.updatedByFullName || meta.updatedBy || meta.importedByFullName ? ` da ${meta.updatedByFullName || meta.updatedBy || meta.importedByFullName}` : ''}.
      ID, Ambito e Voce sono quelli di gara; descrizioni e prezzi offerti si modificano qui. Sotto ogni prezzo vedi la base d’asta.</p>
    <div role="region" aria-label="Tabella del catalogo offerto" tabIndex={0} style={{ overflow: 'auto', maxHeight: '65vh', border: '1px solid #dce5ef', borderRadius: 10 }}>
      <table className="ca-table offered-table" style={{ fontSize: 12, borderCollapse: 'separate', borderSpacing: 0, minWidth: 1900 }}>
        <thead><tr>{COLUMNS.map(col => <th key={col.key} scope="col" style={{ position: 'sticky', top: 0, ...(STICKY[col.key] || {}), zIndex: STICKY[col.key] ? 4 : 2, background: '#f1f5fb', borderBottom: '1px solid #dce5ef', padding: '8px 10px', textAlign: col.kind === 'price' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{col.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.id} style={{ background: i % 2 ? '#f9fbfe' : '#fff', verticalAlign: 'top' }}>
          {COLUMNS.map(col => {
            const flag = changed.has(`${i}|${col.key}`);
            if (col.kind === 'fixed') return <td key={col.key} style={{ padding: '8px 10px', borderBottom: '1px solid #eef2f5', fontWeight: col.key === 'id' ? 700 : 400, minWidth: col.key === 'nome' ? 220 : undefined, whiteSpace: col.key === 'nome' ? 'normal' : 'nowrap', color: '#334155', ...(STICKY[col.key] ? { ...STICKY[col.key], position: 'sticky', zIndex: 1, background: i % 2 ? '#f9fbfe' : '#fff' } : {}) }}>{cellValue(row, col)}</td>;
            if (col.kind === 'text') return <td key={col.key} style={{ padding: '6px 8px', borderBottom: '1px solid #eef2f5', minWidth: 230, background: flag ? '#fff7d6' : undefined }}>
              <textarea aria-label={`${col.label} voce ${row.id}`} value={cellValue(row, col)} rows={open === `${i}|${col.key}` ? 7 : 2} maxLength={2000} disabled={busy}
                onFocus={() => setOpen(`${i}|${col.key}`)} onBlur={() => setOpen(null)} onChange={e => edit(i, col, e.target.value)}
                placeholder={col.key === 'descrizione' && row.descrizioneGara ? `Gara: ${row.descrizioneGara.slice(0, 80)}${row.descrizioneGara.length > 80 ? '…' : ''}` : ''}
                style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 12, padding: '6px 8px', border: '1px solid #bac8da', borderRadius: 6, resize: 'vertical' }} /></td>;
            const base = gara(row, col.type, col.band); const problem = priceProblem(cellValue(row, col), base);
            return <td key={col.key} style={{ padding: '6px 8px', borderBottom: '1px solid #eef2f5', minWidth: 118, textAlign: 'right', background: flag ? '#fff7d6' : undefined }}>
              <input aria-label={`${col.label} voce ${row.id}`} inputMode="decimal" value={cellValue(row, col)} disabled={busy} onChange={e => edit(i, col, e.target.value)}
                aria-invalid={problem.error ? 'true' : undefined} title={problem.error || problem.warning || ''}
                style={{ width: '100%', boxSizing: 'border-box', textAlign: 'right', font: 'inherit', fontSize: 12, padding: '6px 8px', border: `1px solid ${problem.error ? '#d63a2f' : problem.warning ? '#d99a1a' : '#bac8da'}`, borderRadius: 6, background: problem.error ? '#fdecec' : '#fff' }} />
              <div style={{ color: '#6b7c93', fontSize: 11, marginTop: 2 }}>gara {base != null ? euro.format(base) : '—'}</div></td>;
          })}</tr>)}</tbody>
      </table>
    </div>
    {shown.length > 0 && <div role="alert" style={{ color: '#b00020', marginTop: 8 }}><strong>Non posso salvare ({shown.length} problemi):</strong><ul>{shown.slice(0, 12).map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
    {local.warnings.length > 0 && <p style={{ color: '#7a4b00', fontSize: 12 }}>{local.warnings.length} prezzi da controllare (non bloccano il salvataggio): {local.warnings.slice(0, 3).join(' · ')}{local.warnings.length > 3 ? '…' : ''}</p>}
    {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#166534' }}>{notice}</p>}
    <p style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" disabled={busy || !dirty} onClick={save} style={{ minHeight: 36, padding: '6px 14px', fontWeight: 700 }}>{busy ? 'Salvataggio…' : `Salva le modifiche${dirty ? ` (${changed.size})` : ''}`}</button>
      <button type="button" disabled={busy || !dirty} onClick={discard} style={{ minHeight: 36, padding: '6px 14px' }}>Annulla le modifiche</button>
      {dirty && <span className="ca-caption">Hai modifiche non salvate: le celle cambiate sono evidenziate in giallo.</span>}
    </p>
  </section>;
}
