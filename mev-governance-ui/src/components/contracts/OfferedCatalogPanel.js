import React, { useCallback, useEffect, useState } from 'react';
import { offeredCatalogLots, downloadOfferedCatalogTemplate, previewOfferedCatalog, importOfferedCatalog, removeOfferedCatalog } from '../../services/mevService';
import { euro } from '../../utils';
import OfferedCatalogTable from './OfferedCatalogTable';
import './offeredCatalog.css';

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
  const [importOpen, setImportOpen] = useState(false);   // tutta la parte di caricamento resta chiusa finche' non si preme Carica / Aggiorna
  const load = useCallback(async () => { try { setLots(await offeredCatalogLots()); setError(''); } catch (e) { setError(e.message); setLots([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const lot = (lots || []).find(entry => entry.contractId === contractId && String(entry.lotId) === String(lotId));
  const run = async action => { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { setError(e.message); if (e.errors?.length) setPreview({ ok: false, errors: e.errors, warnings: e.warnings || [], rows: [] }); } finally { setBusy(false); } };
  const download = () => run(async () => save(await downloadOfferedCatalogTemplate(contractId, lotId), `catalogo-offerto-${contractId}-lotto-${lotId}.xlsx`));
  const choose = event => { setFile(event.target.files?.[0] || null); setPreview(null); setNotice(''); setError(''); };
  const closeImport = () => { setImportOpen(false); setFile(null); setPreview(null); setError(''); };
  const check = () => run(async () => setPreview(await previewOfferedCatalog(file, contractId, lotId)));
  const importFile = () => run(async () => { const result = await importOfferedCatalog(file, contractId, lotId); setNotice(`Catalogo offerto salvato: ${result.count} voci.`); setImportOpen(false); setFile(null); setPreview(null); setVersion(v => v + 1); await load(); onChanged?.(); });
  const remove = () => { if (!window.confirm('Rimuovere il catalogo offerto? Il lotto tornerà a usare i prezzi di gara. Il catalogo di gara non viene toccato.')) return; run(async () => { await removeOfferedCatalog(contractId, lotId); setNotice('Catalogo offerto rimosso: il lotto usa di nuovo i prezzi di gara.'); setVersion(v => v + 1); await load(); onChanged?.(); }); };

  if (lots === null) return <p role="status">Caricamento…</p>;
  if (!lot) return <section className="oc" aria-label="Voci di catalogo offerti"><div className="oc-head"><div className="oc-title"><p className="oc-eyebrow">Catalogo offerto</p><h3>Voci di catalogo offerti</h3></div></div>
    <p className="oc-msg is-warn" style={{ marginTop: 16 }}>Non hai il permesso di gestire il catalogo offerto di questo lotto: puoi farlo solo sui lotti del contratto su cui lavori.</p>{error && <p role="alert" className="oc-msg is-bad">{error}</p>}</section>;
  const meta = lot.offered?.meta;
  const has = (lot.offered?.count || 0) > 0;
  const by = meta?.updatedByFullName || meta?.updatedBy || meta?.importedByFullName || meta?.importedBy;
  const stamp = meta?.updatedAt || meta?.importedAt;
  return <section className="oc" aria-label="Voci di catalogo offerti">
    <div className="oc-head">
      <div className="oc-title">
        <p className="oc-eyebrow">Catalogo offerto</p>
        <h3>{lot.contractName ? `${lot.contractName} · ` : ''}Lotto {lot.lotId}{lot.lotName ? ` — ${lot.lotName}` : ''}</h3>
        <p className="oc-sub">Dopo l’aggiudicazione valgono i prezzi offerti, non la base d’asta. Il catalogo di gara non viene modificato.</p>
      </div>
      <div className="oc-actions">
        {!importOpen && <button type="button" className="oc-btn oc-btn-primary" disabled={busy} aria-expanded="false" onClick={() => { setImportOpen(true); setNotice(''); }}>{has ? 'Aggiorna catalogo' : 'Carica catalogo'}</button>}
        {has && !importOpen && <button type="button" className="oc-btn oc-btn-danger" disabled={busy} onClick={remove}>Rimuovi il catalogo offerto</button>}
      </div>
    </div>

    <div className="oc-stats" role="group" aria-label="Riepilogo del catalogo">
      <div className="oc-stat"><span>Catalogo di gara</span><strong>{lot.tenderCount} voci</strong><small>base d’asta</small></div>
      <div className={`oc-stat ${has ? 'is-ok' : 'is-warn'}`}><span>Catalogo offerto</span><strong>{has ? `${lot.offered.count} voci` : 'Non caricato'}</strong><small>{has ? 'in uso nel Configuratore' : 'il lotto usa i prezzi di gara'}</small></div>
      {has && <div className="oc-stat"><span>Ultimo aggiornamento</span><strong>{stamp ? when(stamp) : '—'}</strong><small>{by ? `da ${by}` : ''}{meta?.fileName ? `${by ? ' · ' : ''}${meta.fileName}` : ''}</small></div>}
    </div>

    {error && !importOpen && <p role="alert" className="oc-msg is-bad">{error}</p>}
    {notice && <p role="status" className="oc-msg is-ok">{notice}</p>}

    {importOpen && <div className="oc-import" role="region" aria-label="Caricamento del catalogo offerto">
      <div className="oc-import-head"><h4>{has ? 'Aggiorna il catalogo offerto' : 'Carica il catalogo offerto'}</h4><button type="button" className="oc-btn" disabled={busy} onClick={closeImport}>Chiudi</button></div>
      <div className="oc-import-body">
        <div className="oc-step"><span className="oc-step-n" aria-hidden="true">1</span><div>
          <h5>Prepara il file Excel</h5>
          <div className="oc-choices">
            <div className="oc-choice"><strong>Hai già il foglio del catalogo con i prezzi offerti?</strong>
              <p>Caricalo così com’è: servono le colonne «ID di catalogo», «Nome Driver», «P. OFFERTO REALIZZAZIONE», «PREZZO OFFERTO MODIFICA» ed eventualmente «Descrizione Driver» e «Descrizione semplice/medio/complesso». Le altre colonne vengono ignorate.</p></div>
            <div className="oc-choice"><strong>Parti dal modello</strong>
              <p>Contiene già ID, ambito e nome di ogni voce di gara; compili i prezzi offerti nelle celle gialle, senza cambiare ID, nomi dei fogli e intestazioni. Le colonne «Descrizione Driver», «Descrizione Semplice», «Descrizione Medio» e «Descrizione Complesso» sono facoltative: la descrizione del driver sostituisce quella di gara.</p>
              <button type="button" className="oc-btn" disabled={busy || !lot.tenderCount} onClick={download}>Scarica il modello Excel</button></div>
          </div></div></div>
        <div className={`oc-step ${file ? 'is-done' : ''}`}><span className="oc-step-n" aria-hidden="true">2</span><div>
          <h5>Scegli il file e controllalo</h5>
          <div className="oc-file">
            <label className="oc-file-pick"><span>{file ? 'Cambia file' : 'Scegli il file Excel'}</span><input type="file" aria-label="File Excel del catalogo offerto" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={choose} /></label>
            {file && <span className="oc-file-name" title={file.name}>{file.name}</span>}
            <button type="button" className="oc-btn oc-btn-primary" disabled={busy || !file} onClick={check}>Controlla il file</button>
          </div>
          <p className="ca-caption" style={{ margin: '8px 0 0' }}>Il controllo non salva nulla: mostra gli errori riga per riga oppure il confronto con la base d’asta.</p></div></div>
        {preview && <div className={`oc-step ${preview.ok ? 'is-done' : ''}`} aria-label="Esito del controllo"><span className="oc-step-n" aria-hidden="true">3</span><div>
          <h5>{preview.ok ? 'Controlla il confronto e salva' : 'Correggi il file e ricontrollalo'}</h5>
          {preview.errors?.length > 0 && <div role="alert" className="oc-msg is-bad" style={{ margin: '0 0 10px' }}><strong>Il file non può essere salvato ({preview.errors.length} problemi):</strong><ul>{preview.errors.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
          {preview.warnings?.length > 0 && <div className="oc-msg is-warn" style={{ margin: '0 0 10px' }}><strong>Da controllare (non bloccano il salvataggio):</strong><ul>{preview.warnings.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
          {preview.ok && <div className="oc-result">
            <p style={{ color: '#166534' }}><strong>Il file è corretto: {preview.rows.length} voci.</strong>{preview.format ? ` Formato riconosciuto: ${preview.format}.` : ''}{preview.rows.some(row => row.descrizione) ? ` Descrizione del driver trovata per ${preview.rows.filter(row => row.descrizione).length} voci: sostituisce quella di gara nel catalogo in uso.` : ''}{preview.rows.some(row => row.descrizioni) ? ` Descrizioni semplice/medio/complesso trovate per ${preview.rows.filter(row => row.descrizioni).length} voci: vengono salvate con i prezzi.` : ''} Ecco il confronto con la base d’asta; il salvataggio sostituisce l’eventuale catalogo offerto già caricato.</p>
            <div className="oc-tablewrap is-short"><table className="oc-table">
              <thead><tr><th className="is-id">ID</th><th>Voce</th>{BAND_ORDER.flatMap(t => ['Semplice', 'Medio', 'Complesso'].map(b => <th className="is-num" key={t + b}>{label({ tipo: t, fascia: b })}<span className="oc-th-sub">gara → offerto</span></th>))}</tr></thead>
              <tbody>{preview.rows.map(row => <tr key={row.id}><td className="is-id">{row.id}</td><td className="is-name">{row.nome}{row.descrizione && <details className="oc-details"><summary>Descrizione del driver</summary><p>{row.descrizione}</p></details>}{row.descrizioni && <details className="oc-details"><summary>Descrizioni per complessità</summary>{['Semplice', 'Medio', 'Complesso'].filter(f => row.descrizioni[f]).map(f => <p key={f}><strong>{f}:</strong> {row.descrizioni[f]}</p>)}</details>}</td>
                {BAND_ORDER.flatMap(t => ['Semplice', 'Medio', 'Complesso'].map(b => { const cell = row.prezzi.find(p => p.tipo === t && p.fascia === b); return <td className="is-num" key={t + b}>{cell?.gara != null ? euro.format(cell.gara) : '—'} → <strong>{cell?.offerto != null ? euro.format(cell.offerto) : '—'}</strong>{discountOf(cell?.gara, cell?.offerto) != null && <div className="oc-discount">sconto {percent(discountOf(cell.gara, cell.offerto))}</div>}</td>; }))}</tr>)}</tbody>
            </table></div>
            <div className="oc-result-actions"><button type="button" className="oc-btn oc-btn-primary" disabled={busy} onClick={importFile}>{busy ? 'Salvataggio…' : `Salva il catalogo offerto (${preview.rows.length} voci)`}</button><button type="button" className="oc-btn" disabled={busy} onClick={closeImport}>Annulla</button></div>
          </div>}
        </div></div>}
        {error && <p role="alert" className="oc-msg is-bad" style={{ margin: 0 }}>{error}</p>}
      </div>
    </div>}

    {!has && !importOpen && <div className="oc-empty"><h4>Il catalogo offerto non è ancora stato caricato</h4>
      <p>Finché non lo carichi, il lotto usa i prezzi di gara. Premi «Carica catalogo» in alto e scegli il file Excel con i prezzi offerti dopo l’aggiudicazione: le voci compariranno qui, pronte da controllare e modificare.</p></div>}

    {has && <div className="oc-body"><OfferedCatalogTable contractId={contractId} lotId={lotId} reloadKey={version} onSaved={load} /></div>}
    <p className="oc-foot">Le iniziative già salvate non cambiano da sole: nel Configuratore, aprendo l’iniziativa, compare «Riallinea ai prezzi offerti» con l’anteprima dei totali.</p>
  </section>;
}
