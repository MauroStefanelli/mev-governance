import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SOLUTION_FIELDS, MAX_FIELD, MAX_SUMMARY, solutionRows, solutionProgress, withField, withSummary, validateSolution, solutionMarkdown, solutionFileName } from './solutionModel';
import { loadSolution, saveSolution } from './solutionStore';
import { displayName, relativeTime } from './developmentCollaboration';
import './solutionPanel.css';

const download = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click();
  setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 1000);
};

// The proposed solution of each intervention: read-only context from the offer and the confirmed rationale,
// editable text written by the team, shared and saved on the server, exportable as Markdown for Visual Studio Code.
export default function SolutionPanel({ initiative, contractId, lot, interventions = [], knowledge = [], applications = [], canEdit = true, author = '', onProgress }) {
  const code = String(initiative?.code || initiative?.title || '').trim();
  const [solution, setSolution] = useState({ entries: {}, summary: '' });
  const [saved, setSaved] = useState({ entries: {}, summary: '' });
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState('all');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!code || !contractId) return;
    setLoading(true); setError('');
    try {
      const result = await loadSolution(contractId, code);
      if (!alive.current) return;
      setSolution(result.solution); setSaved(result.solution); setRevision(result.revision);
    } catch (e) { if (alive.current) setError(`Soluzione non disponibile: ${e.message}`); } finally { if (alive.current) setLoading(false); }
  }, [code, contractId]);
  useEffect(() => { setSolution({ entries: {}, summary: '' }); setSaved({ entries: {}, summary: '' }); setRevision(0); setOpenId(null); setNotice(''); setError(''); load(); }, [load]);

  const rows = useMemo(() => solutionRows(interventions, solution), [interventions, solution]);
  const progress = solutionProgress(rows);
  const dirty = JSON.stringify({ e: solution.entries, s: solution.summary || '' }) !== JSON.stringify({ e: saved.entries, s: saved.summary || '' });
  useEffect(() => { onProgress?.({ ...progress, dirty, revision }); }, [progress.total, progress.filled, progress.orphans, dirty, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (id, key, value) => { setSolution(previous => withField(previous, id, key, value)); setNotice(''); };
  const save = async () => {
    const problem = validateSolution(solution);
    if (problem) { setError(problem); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await saveSolution({ contractId, lot, initiative, solution, revision, author });
      if (!alive.current) return;
      const next = { ...solution, updatedBy: result.updatedBy, updatedAt: result.updatedAt };
      setSolution(next); setSaved(next); setRevision(result.revision);
      setNotice(`Soluzione salvata e confermata dal server (revisione ${result.revision}).`);
    } catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setSaving(false); }
  };
  const reload = async () => {
    if (dirty && !window.confirm('Ricaricare la soluzione salvata? Le modifiche non salvate di questa pagina andranno perse.')) return;
    await load(); setNotice('Soluzione ricaricata dall’ultimo salvataggio.');
  };
  const exportMd = () => download(solutionFileName(initiative), solutionMarkdown({ initiative, interventions, solution, knowledge, applications }));

  const visible = rows.filter(row => filter === 'all' || (filter === 'filled' ? row.filled : !row.filled));
  const idle = !code;
  const noInterventions = !idle && !rows.length;

  return <div className="sol" aria-label="Soluzione proposta per gli interventi">
    {idle ? <p className="sol-lock" role="status"><span aria-hidden="true">🔒</span> Apri o crea un’iniziativa (codice GOTO o titolo) per descrivere la soluzione.</p> : <>
      <div className="sol-intro">
        <p>Per ogni intervento dell’offerta puoi descrivere come si realizza, i vincoli, le ipotesi e le verifiche. Il testo è condiviso con il team e si scarica come file Markdown da aprire in Visual Studio Code. Qui sotto trovi già i dettagli dell’intervento e i razionali confermati: sono di sola lettura.</p>
        <div className="sol-actions">
          {canEdit && <button type="button" className="sol-primary" onClick={save} disabled={saving || !dirty || loading}>{saving ? 'Salvataggio…' : 'Salva soluzione'}</button>}
          <button type="button" onClick={exportMd} disabled={loading || !rows.length}>Scarica MD per Visual Studio Code</button>
          <button type="button" onClick={reload} disabled={loading || saving}>↻ Ricarica</button>
          {dirty && <span className="sol-dirty" role="status">Modifiche non salvate</span>}
        </div>
        {dirty && <p className="sol-hint">Il file scaricato contiene anche le modifiche non ancora salvate che vedi in pagina.</p>}
      </div>
      {error && <p className="sol-error" role="alert">{error}</p>}
      {notice && <p className="sol-notice" role="status">{notice}</p>}
      {loading && <p className="sol-empty" role="status">Caricamento della soluzione…</p>}
      {noInterventions && !loading && <p className="sol-empty">L’offerta non ha ancora interventi. Importa la Tabella di Offerta (pulsante «Importa Tabella di Offerta» in alto) e qui comparirà un intervento per riga.</p>}

      {!!rows.length && <>
        <label className="sol-summary">Sintesi generale della soluzione
          <textarea rows={3} value={solution.summary || ''} maxLength={MAX_SUMMARY + 200} disabled={!canEdit} placeholder="In poche righe: l’idea complessiva della soluzione per l’intera iniziativa."
            onChange={event => { setSolution(withSummary(solution, event.target.value)); setNotice(''); }} />
          <small>{(solution.summary || '').length}/{MAX_SUMMARY}</small></label>
        <div className="sol-filter" role="group" aria-label="Filtra gli interventi">
          {[['all', `Tutti (${rows.length})`], ['filled', `Con soluzione (${progress.filled})`], ['empty', `Da descrivere (${progress.total - progress.filled})`]].map(([id, label]) =>
            <button type="button" key={id} aria-pressed={filter === id} className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label}</button>)}
          {progress.orphans > 0 && <span className="sol-orphan-note">{progress.orphans} non più nell’offerta</span>}
        </div>
        {!visible.length && <p className="sol-empty">Nessun intervento in questo filtro.</p>}
        <ul className="sol-list">
          {visible.map(row => { const open = openId === row.id; const rationale = knowledge.filter(entry => entry.status === 'confermata' && (!entry.interventionId || String(entry.interventionId) === row.id));
            return <li key={row.id} className={`sol-item${open ? ' is-open' : ''}${row.orphan ? ' is-orphan' : ''}`}>
              <button type="button" className="sol-item-head" aria-expanded={open} onClick={() => setOpenId(open ? null : row.id)}>
                <span className="sol-id">{row.id}</span>
                <span className="sol-item-title">{row.title || 'Senza titolo'}{row.system ? <small> · {row.system}</small> : null}</span>
                <span className={`sol-flag ${row.orphan ? 'sol-flag-warn' : row.filled ? 'sol-flag-ok' : ''}`}>{row.orphan ? 'Non più nell’offerta' : row.filled ? 'Soluzione descritta' : 'Da descrivere'}</span>
                <span aria-hidden="true">{open ? '▾' : '▸'}</span></button>
              {open && <div className="sol-item-body">
                <div className="sol-context" aria-label={`Dettagli dell’intervento ${row.id}`}>
                  <h4>Dettagli dell’intervento <small>di sola lettura</small></h4>
                  {row.orphan && <p className="sol-warn">Questo intervento non è più presente nell’offerta. La soluzione scritta è conservata: verifica se è ancora valida.</p>}
                  {row.description && <p><b>Descrizione</b><br />{row.description}</p>}
                  {row.activity && <p><b>Attività</b><br />{row.activity}</p>}
                  {row.requirements && <p><b>Copertura requisiti</b><br />{row.requirements}</p>}
                  {row.mappings.length > 0 && <div className="sol-table-wrap" role="region" aria-label={`Attività dell’intervento ${row.id}`} tabIndex={0}><table><thead><tr><th>Voce di catalogo</th><th>Tipo</th><th>Complessità</th><th>Q.tà</th><th>Componente</th><th>Tecnologia</th></tr></thead>
                    <tbody>{row.mappings.map((m, index) => <tr key={index}><td>{m.name}</td><td>{m.type}</td><td>{m.complexity}</td><td>{m.qty || ''}</td><td>{m.component}</td><td>{m.technology}</td></tr>)}</tbody></table></div>}
                  {rationale.length > 0 && <div className="sol-rationale"><b>Razionali e vincoli confermati</b><ul>{rationale.map(entry => <li key={entry.id}><i>{entry.kind}</i> {entry.text}</li>)}</ul></div>}
                  {!row.description && !row.activity && !row.requirements && !row.mappings.length && !rationale.length && !row.orphan && <p className="sol-hint">Nessun dettaglio importato per questo intervento.</p>}
                </div>
                <div className="sol-fields">
                  <h4>Soluzione <small>{canEdit ? 'modificabile' : 'sola lettura'}</small></h4>
                  {SOLUTION_FIELDS.map(([key, label, hint]) => <div className="sol-field" key={key}><label htmlFor={`sol-${row.id}-${key}`}>{label}</label><small className="sol-field-hint" id={`sol-${row.id}-${key}-hint`}>{hint}</small>
                    <textarea id={`sol-${row.id}-${key}`} aria-describedby={`sol-${row.id}-${key}-hint`} rows={key === 'approach' ? 6 : 3} value={row.entry[key]} disabled={!canEdit} maxLength={MAX_FIELD + 500} onChange={event => edit(row.id, key, event.target.value)} />
                    {row.entry[key].length > MAX_FIELD * 0.9 && <small className={row.entry[key].length > MAX_FIELD ? 'sol-over' : ''}>{row.entry[key].length}/{MAX_FIELD}</small>}</div>)}
                </div>
              </div>}
            </li>; })}
        </ul>
      </>}
      {solution.updatedBy && <p className="sol-meta">Ultimo salvataggio: {displayName({ fullName: solution.updatedBy })}{solution.updatedAt ? ` · ${relativeTime(solution.updatedAt)}` : ''} · revisione {revision}</p>}
    </>}
  </div>;
}
