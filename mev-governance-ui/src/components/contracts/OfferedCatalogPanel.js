import React, { useCallback, useEffect, useState } from 'react';
import { offeredCatalogLots, downloadOfferedCatalogTemplate, previewOfferedCatalog, importOfferedCatalog, removeOfferedCatalog } from '../../services/mevService';
import { euro } from '../../utils';
import OfferedCatalogTable from './OfferedCatalogTable';

const save = (blob, name) => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
const when = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
export const discountOf = (base, offered) => base > 0 && offered != null ? Math.round((1 - offered / base) * 10000) / 100 : null;
const percent = value => value == null ? '—' : `${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
const BAND_ORDER = ['REALIZZAZIONE', 'MODIFICA'];
const label = cell => `${cell.tipo === 'REALIZZAZIONE' ? 'Realizzazione' : 'Modifica'} ${cell.fascia}`;

// «Voci di catalogo offerti»: the prices offered after the award, voice by voice. The tender catalog is never replaced: the offered prices are kept next to it
// and, once loaded, are the ones the Configuratore uses. A file with even one error is refused as a whole.
export default function OfferedCatalogPanel({ contractId, lotId, onChanged }) {
  const [lots, setLots] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);   // cambia dopo un import o una rimozione: la tabella si ricarica
  const load = useCallback(async () => { try { setLots(await offeredCatalogLots()); setError(''); } catch (e) { setError(e.message); setLots([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const lot = (lots || []).find(entry => entry.contractId === contractId && String(entry.lotId) === String(lotId));
  const run = async action => { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { setError(e.message); if (e.errors?.length) setPreview({ ok: false, errors: e.errors, warnings: e.warnings || [], rows: [] }); } finally { setBusy(false); } };
  const download = () => run(async () => save(await downloadOfferedCatalogTemplate(contractId, lotId), `catalogo-offerto-${contractId}-lotto-${lotId}.xlsx`));
  const choose = event => { setFile(event.target.files?.[0] || null); setPreview(null); setNotice(''); setError(''); };
  const check = () => run(async () => setPreview(await previewOfferedCatalog(file, contractId, lotId)));
  const importFile = () => run(async () => { const result = await importOfferedCatalog(file, contractId, lotId); setNotice(`Catalogo offerto salvato: ${result.count} voci.`); setFile(null); setPreview(null); setVersion(v => v + 1); await load(); onChanged?.(); });
  const remove = () => { if (!window.confirm('Rimuovere il catalogo offerto? Il lotto tornerà a usare i prezzi di gara. Il catalogo di gara non viene toccato.')) return; run(async () => { await removeOfferedCatalog(contractId, lotId); setNotice('Catalogo offerto rimosso: il lotto usa di nuovo i prezzi di gara.'); setVersion(v => v + 1); await load(); onChanged?.(); }); };

  if (lots === null) return <p role="status">Caricamento…</p>;
  if (!lot) return <section className="ca-offered" aria-label="Voci di catalogo offerti"><h3>Voci di catalogo offerti</h3><p className="ca-caption">Non hai il permesso di gestire il catalogo offerto di questo lotto: puoi farlo solo sui lotti del contratto su cui lavori.</p>{error && <p role="alert">{error}</p>}</section>;
  const meta = lot.offered?.meta;
  const has = (lot.offered?.count || 0) > 0;
  return <section className="ca-offered" aria-label="Voci di catalogo offerti" style={{ border: '1px solid #dce5ef', borderRadius: 12, padding: 16, background: '#fbfcfe' }}>
    <style>{'.ca-offered button{min-height:36px;padding:6px 12px;cursor:pointer}.ca-offered button:disabled{cursor:not-allowed}.ca-offered input[type=file]{max-width:100%}'}</style>
    <h3>Voci di catalogo offerti</h3>
    <p className="ca-caption">Dopo l’aggiudicazione valgono i prezzi <strong>offerti</strong>, non la base d’asta. Caricali qui da un file Excel: restano accanto al catalogo di gara, che non viene modificato, e il Configuratore usa quelli offerti.</p>
    <p style={{ fontSize: 13 }}>Catalogo di gara: <strong>{lot.tenderCount} voci</strong>. {has
      ? <>Catalogo offerto: <strong>{lot.offered.count} voci</strong>{meta?.fileName ? ` · ${meta.fileName}` : ''}{meta?.importedAt ? ` · caricato il ${when(meta.importedAt)}` : ''}{meta?.importedByFullName || meta?.importedBy ? ` da ${meta.importedByFullName || meta.importedBy}` : ''}.</>
      : 'Il catalogo offerto non è ancora stato caricato: il lotto usa i prezzi di gara.'}</p>
    <ol style={{ fontSize: 13, paddingLeft: 18 }}>
      <li>Se hai già il foglio del catalogo con i prezzi offerti (colonne «ID di catalogo», «Nome Driver», «P. OFFERTO REALIZZAZIONE», «PREZZO OFFERTO MODIFICA» ed eventualmente «Descrizione semplice/medio/complesso»), caricalo così com’è: le altre colonne vengono ignorate.</li>
      <li>Altrimenti <button type="button" disabled={busy || !lot.tenderCount} onClick={download}>Scarica il modello Excel</button>: contiene già ID, ambito e nome di ogni voce di gara; compili i prezzi offerti nelle celle gialle, senza cambiare ID, nomi dei fogli e intestazioni. Le colonne «Descrizione Driver», «Descrizione Semplice», «Descrizione Medio» e «Descrizione Complesso» sono facoltative: la descrizione del driver sostituisce quella di gara.</li>
      <li><label>File compilato <input type="file" aria-label="File Excel del catalogo offerto" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={choose} /></label>{' '}
        <button type="button" disabled={busy || !file} onClick={check}>Controlla il file</button></li>
    </ol>
    {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#166534' }}>{notice}</p>}
    {preview && <div aria-label="Esito del controllo">
      {preview.errors?.length > 0 && <div role="alert" style={{ color: '#b00020' }}><strong>Il file non può essere salvato ({preview.errors.length} problemi):</strong><ul>{preview.errors.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      {preview.warnings?.length > 0 && <div style={{ color: '#7a4b00' }}><strong>Da controllare (non bloccano il salvataggio):</strong><ul>{preview.warnings.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      {preview.ok && <>
        <p style={{ color: '#166534' }}><strong>Il file è corretto: {preview.rows.length} voci.</strong>{preview.format ? ` Formato riconosciuto: ${preview.format}.` : ''}{preview.rows.some(row => row.descrizione) ? ` Descrizione del driver trovata per ${preview.rows.filter(row => row.descrizione).length} voci: sostituisce quella di gara nel catalogo in uso.` : ''}{preview.rows.some(row => row.descrizioni) ? ` Descrizioni semplice/medio/complesso trovate per ${preview.rows.filter(row => row.descrizioni).length} voci: vengono salvate con i prezzi.` : ''} Ecco il confronto con la base d’asta; il salvataggio sostituisce l’eventuale catalogo offerto già caricato.</p>
        <div style={{ maxHeight: 320, overflow: 'auto' }}><table className="ca-table" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr><th>ID</th><th>Voce</th>{BAND_ORDER.flatMap(t => ['Semplice', 'Medio', 'Complesso'].map(b => <th key={t + b}>{label({ tipo: t, fascia: b })}<br />gara → offerto</th>))}</tr></thead>
          <tbody>{preview.rows.map(row => <tr key={row.id}><td>{row.id}</td><td>{row.nome}{row.descrizione && <details><summary>Descrizione del driver</summary><p style={{ margin: '4px 0', fontSize: 11 }}>{row.descrizione}</p></details>}{row.descrizioni && <details><summary>Descrizioni per complessità</summary>{['Semplice', 'Medio', 'Complesso'].filter(f => row.descrizioni[f]).map(f => <p key={f} style={{ margin: '4px 0', fontSize: 11 }}><strong>{f}:</strong> {row.descrizioni[f]}</p>)}</details>}</td>{BAND_ORDER.flatMap(t => ['Semplice', 'Medio', 'Complesso'].map(b => { const cell = row.prezzi.find(p => p.tipo === t && p.fascia === b); return <td key={t + b} style={{ textAlign: 'right' }}>{cell?.gara != null ? euro.format(cell.gara) : '—'} → <strong>{cell?.offerto != null ? euro.format(cell.offerto) : '—'}</strong>{discountOf(cell?.gara, cell?.offerto) != null && <div style={{ color: '#52657d' }}>sconto {percent(discountOf(cell.gara, cell.offerto))}</div>}</td>; }))}</tr>)}</tbody>
        </table></div>
        <p><button type="button" disabled={busy} onClick={importFile}>Salva il catalogo offerto ({preview.rows.length} voci)</button></p>
      </>}
    </div>}
    {has && <OfferedCatalogTable contractId={contractId} lotId={lotId} reloadKey={version} onSaved={load} />}
    {has && <p><button type="button" disabled={busy} onClick={remove}>Rimuovi il catalogo offerto</button> <span className="ca-caption">Il lotto torna ai prezzi di gara; le iniziative già salvate non cambiano.</span></p>}
    <p className="ca-caption">Le iniziative già salvate non cambiano da sole: nel Configuratore, aprendo l’iniziativa, compare «Riallinea ai prezzi offerti» con l’anteprima dei totali.</p>
  </section>;
}
