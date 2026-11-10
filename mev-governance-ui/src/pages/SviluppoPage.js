import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DevelopmentActivities from '../configuratore/ActivityDevelopmentPanel';
import ProjectPreparationPanel from '../configuratore/ProjectPreparationPanel';
import JourneyBar from '../configuratore/JourneyBar';
import CollaborationPanel from '../configuratore/CollaborationPanel';
import { indexSummaries, initiativeKey, activityLine, displayName } from '../configuratore/developmentCollaboration';
import { developmentActivities } from '../configuratore/developmentActivityModel';
import { DEVELOPMENT_ENTITY, parseRecordPayload, loadDevelopmentState, saveDevelopmentState, loadApplicationsFor, catalogFor, applicationsForInitiative, applicationScope, applicationDiagnosis,
  activitySignature, activityChanges, DEFAULT_DELIVERY } from '../configuratore/developmentRecord';
import { computeJourney, developmentSummary, hasCode } from '../configuratore/developmentJourney';
import { approvedInterventions, buildCodeChangeRequest, implementationMarkdown, developmentDocumentMarkdown, downloadBlob, repositorySummary } from '../configuratore/developmentPackages';
import { saveAndClose } from '../configuratore/saveAndClose';
import { getConfiguratoreRecords, getConfiguratoreContracts, analyzeDevelopmentWithAi, developmentRequest } from '../services/mevService';
import { APP_DATA, appNorm, sourceFileAllowed, ignoredSourcePath } from '../configuratore/configuratoreCore';
import '../configuratore/initiativeWorkspace.css';
import '../configuratore/developmentPage.css';

const pick = () => new Promise(resolve => {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true;
  input.setAttribute('webkitdirectory', ''); input.setAttribute('directory', '');
  input.onchange = () => resolve(input.files.length ? [...input.files] : []);
  input.oncancel = () => resolve([]);
  input.click();
});
const stamp = value => value ? new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const unauthorized = error => { try { const status = JSON.parse(error.message).status; return status === 401 || status === 403; } catch { return false; } };

export default function SviluppoPage({ onUnauthorized, ambienteId, codiceContratto }) {
  const [list, setList] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [activity, setActivity] = useState({});
  const [contracts, setContracts] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [loaded, setLoaded] = useState(null);
  const [plans, setPlans] = useState({});
  const [preparation, setPreparation] = useState({});
  const [delivery, setDelivery] = useState(DEFAULT_DELIVERY);
  const [applications, setApplications] = useState([]);
  const [files, setFiles] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState('schede');
  const [showGuide, setShowGuide] = useState(false);
  const opening = useRef(0);
  const contractId = codiceContratto || (ambienteId ? String(ambienteId) : '');

  const refresh = useCallback(async () => {
    setLoadingList(true); setListError('');
    try {
      const [{ records }, catalogs, saved] = await Promise.all([
        getConfiguratoreRecords({ entity_type: 'initiative_evaluation', contract_id: contractId }),
        getConfiguratoreContracts().catch(() => []),
        getConfiguratoreRecords({ entity_type: DEVELOPMENT_ENTITY, contract_id: contractId }).catch(() => ({ records: [] })),
      ]);
      const bySuffix = new Map(saved.records.map(record => [record.record_key || record.recordKey, parseRecordPayload(record)]));
      const result = {};
      records.forEach(record => {
        const evaluation = parseRecordPayload(record);
        const identity = String(evaluation.initiative?.code || evaluation.initiative?.title || '').trim();
        const key = `${record.contract_id || evaluation.contractId}|${record.lot_id || evaluation.lot}|development|${encodeURIComponent(identity.toLowerCase())}`;
        result[record.record_key] = developmentSummary(bySuffix.get(key), (evaluation.items || []).length);
      });
      setList(records); setContracts(catalogs); setSummaries(result);
      developmentRequest('summary').then(entries => setActivity(indexSummaries(entries))).catch(() => setActivity({}));
    } catch (e) { if (unauthorized(e)) return onUnauthorized?.(); setListError(`Elenco iniziative non disponibile: ${e.message}`); }
    finally { setLoadingList(false); }
  }, [contractId, onUnauthorized]);
  useEffect(() => { setLoaded(null); refresh(); }, [refresh]);

  const open = async record => {
    if (dirty && !window.confirm('Aprire un’altra iniziativa? Le modifiche allo sviluppo non salvate andranno perse.')) return;
    const token = ++opening.current; setBusy('open'); setError(''); setMessage('');
    try {
      const state = await loadDevelopmentState(record);
      const apps = await loadApplicationsFor(state.evaluation, { contractId: state.contractId, lot: state.lot });
      if (token !== opening.current) return;
      setLoaded(state); setPlans(state.plans); setPreparation(state.preparation); setDelivery(state.delivery);
      setApplications(apps); setFiles([]); setDirty(false); setPhase(state.source === 'new' ? 'fonti' : 'schede');
      if (state.source === 'legacy') setMessage('Le schede erano salvate nella valutazione del Configuratore. Sono state caricate qui come punto di partenza: salvale in Sviluppo per renderle definitive.');
    } catch (e) { if (token === opening.current) setError(e.message); } finally { if (token === opening.current) setBusy(''); }
  };

  const mark = setter => value => { setter(value); setDirty(true); };
  const editPlans = mark(setPlans); const editPreparation = mark(setPreparation);
  const editDelivery = patch => { setDelivery(previous => ({ ...previous, ...patch })); setDirty(true); };

  const activities = useMemo(() => loaded ? developmentActivities(loaded.evaluation.items || []) : [], [loaded]);
  const changes = useMemo(() => loaded ? activityChanges(loaded.savedActivities, activitySignature(activities)) : null, [loaded, activities]);
  const catalog = useMemo(() => loaded ? catalogFor(contracts, APP_DATA, loaded.evaluation.catalogSource || { contractId: 'poste-tet-2025', lot: loaded.lot }) : [], [loaded, contracts]);
  const linkedApplications = useMemo(() => loaded ? applicationsForInitiative(loaded.evaluation, applications, loaded.lot) : [], [loaded, applications]);
  const techProfile = linkedApplications.find(app => app.techProfile)?.techProfile || null;
  const approved = useMemo(() => loaded ? approvedInterventions(loaded.evaluation, catalog) : [], [loaded, catalog]);
  const journey = useMemo(() => loaded ? computeJourney({ activities, plans, preparation, delivery, applications: linkedApplications, files, techProfile,
    approvedCount: approved.length, dirty, revision: loaded.revision }) : null, [loaded, activities, plans, preparation, delivery, linkedApplications, files, techProfile, approved, dirty]);

  const save = async () => {
    setBusy('save'); setError(''); setMessage('');
    try {
      const revision = await saveDevelopmentState(loaded, { plans, preparation, delivery, activities: activitySignature(activities) });
      setLoaded(previous => ({ ...previous, revision, source: 'saved', savedActivities: activitySignature(activities) })); setDirty(false);
      setMessage(`Sviluppo salvato e confermato dal server (revisione ${revision}).`);
      developmentRequest('worked', { goto: heading.code || heading.title }).catch(() => {});
      return true;
    } catch (e) { setError(`Salvataggio non riuscito: ${e.message}`); return false; } finally { setBusy(''); }
  };
  const close = () => { setLoaded(null); setDirty(false); refresh(); };
  const selectFolder = async () => { const chosen = await pick(); if (chosen.length) { setFiles(chosen); setMessage(`Repository collegato per questa sessione: ${chosen.length} file.`); } };

  const run = (name, action) => async () => { setBusy(name); setError(''); setMessage(''); try { await action(); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const contractName = contracts.find(c => c.contractId === loaded?.evaluation.catalogSource?.contractId)?.name;
  const exportZip = run('zip', async () => {
    const result = buildCodeChangeRequest({ loaded, plans, delivery, applications, approved, files, techProfile, contractName });
    downloadBlob(result.name, await result.zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
    setMessage('Richiesta di modifica codice generata. Lo ZIP riporta le schede mostrate in questa pagina, anche se non ancora salvate.');
  });
  const exportMarkdown = run('md', async () => {
    downloadBlob(`piano_sviluppo_${appNorm(loaded.evaluation.initiative?.code || 'iniziativa')}.md`, new Blob([implementationMarkdown({ loaded, delivery, approved, techProfile })], { type: 'text/markdown;charset=utf-8' }));
  });
  const generateDocument = run('ai', async () => {
    const repo = repositorySummary(files, techProfile, loaded.evaluation.initiative?.system);
    const result = await analyzeDevelopmentWithAi({ contractId: loaded.contractId, lot: loaded.lot, initiative: loaded.evaluation.initiative, approved, techProfile, implementationFiles: repo.allPaths });
    downloadBlob(`sviluppo_iniziativa_${appNorm(loaded.evaluation.initiative?.code || loaded.evaluation.initiative?.title)}.md`,
      new Blob([developmentDocumentMarkdown(result, loaded.evaluation.initiative || {})], { type: 'text/markdown;charset=utf-8' }));
    setMessage('Documento di sviluppo generato (scaricato). Da verificare prima dell’uso.');
  });

  const rows = list.map(record => ({ record, evaluation: parseRecordPayload(record) })).filter(({ record, evaluation }) => !search.trim()
    || `${record.title} ${evaluation.initiative?.code || ''} ${evaluation.initiative?.system || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const sourceCount = files.filter(f => sourceFileAllowed(f.name) && !ignoredSourcePath(f.webkitRelativePath || f.name)).length;
  const heading = loaded ? loaded.evaluation.initiative || {} : {};
  const changed = changes && (changes.changed.length || changes.added.length || changes.removed.length);

  if (!loaded) return <div className="dev-app">
    <header className="dev-hero">
      <div><span className="dev-eyebrow">Sviluppo iniziative</span><h2>Dalla valutazione al codice</h2>
        <p>Scegli un’iniziativa già valutata nel Configuratore e portala fino al codice verificato, seguendo sei fasi.</p></div>
      <ol className="dev-hero-steps" aria-label="Le fasi del percorso">{['Fonti', 'Schede', 'Progetto', 'Codice', 'Consegna', 'Verifica'].map((label, index) => <li key={label}><b>{index + 1}</b>{label}</li>)}</ol>
    </header>
    {error && <p role="alert" className="development-alert">{error}</p>}
    <section className="dev-card" aria-label="Iniziative da sviluppare">
      <div className="dev-card-head"><h3>Iniziative valutate <span>{rows.length}</span></h3>
        <div className="dev-card-tools"><label className="dev-sr-only" htmlFor="dev-search">Cerca per GOTO, titolo o sistema</label>
          <input id="dev-search" className="development-search" placeholder="Cerca per GOTO, titolo o sistema" value={search} onChange={e => setSearch(e.target.value)} />
          <button type="button" className="dev-btn" onClick={refresh} disabled={loadingList}>↻ Aggiorna</button></div></div>
      {listError && <p role="alert" className="development-alert">{listError}</p>}
      {loadingList && <p role="status" className="dev-empty">Caricamento iniziative…</p>}
      {!loadingList && !rows.length && !listError && <p className="dev-empty">Nessuna iniziativa valutata in questo ambiente. Salva prima una valutazione nel Configuratore.</p>}
      <div className="dev-list">
        {rows.map(({ record, evaluation }) => {
          const summary = summaries[record.record_key]; const count = (evaluation.items || []).length;
          return <button type="button" className="dev-list-row" key={record.record_key || record.Id} disabled={busy === 'open'} onClick={() => open(record)}>
            <span className="dev-list-id">{evaluation.initiative?.code || 'Senza GOTO'}</span>
            <span className="dev-list-main"><strong>{evaluation.initiative?.title || record.title}</strong>
              <small>{evaluation.initiative?.system || 'Sistema non indicato'} · {count} attività · valutata il {stamp(record.updated_at)}</small></span>
            <span className="dev-list-progress">{summary ? <>
              <span className={`dev-pill dev-pill-${summary.state === 'Verificato' ? 'ok' : 'run'}`}>{summary.state}</span>
              <small>{summary.defined}/{count} schede · {summary.verified} verificate</small>
              <span className="dev-bar" aria-hidden="true"><i style={{ width: `${count ? Math.round(100 * summary.defined / count) : 0}%` }} /></span></> :
              <><span className="dev-pill">Da avviare</span><small>Nessuno sviluppo salvato</small></>}</span>
            <span className="dev-list-people">{(() => { const line = activityLine(activity[initiativeKey(evaluation.initiative?.code || evaluation.initiative?.title)]);
              return <><small className="dev-list-worked">{line.worked}</small>
                {line.online.length > 0 && <span className="dev-list-online" title={line.online.map(displayName).join(', ')}><span className="dev-live-dot" aria-hidden="true" />{line.online.length === 1 ? `${displayName(line.online[0])} è collegato` : `${line.online.length} collegati ora`}</span>}</>; })()}</span>
            <span className="dev-list-go" aria-hidden="true">›</span>
          </button>;
        })}
      </div>
    </section>
  </div>;

  const generated = activities.filter(a => hasCode(plans[a.key])).length;
  const body = {
    fonti: <section className="dev-card dev-phase-card" aria-label="Fonti del codice">
      <h3>Fonti del codice</h3>
      <div className="dev-source-grid">
        <div className="dev-source"><span className="dev-source-label">Applicativi associati al sistema «{heading.system || '—'}»</span>
          {linkedApplications.length ? linkedApplications.map(app => <p key={app.id || app.code || app.name}><b>{app.name}</b><code>{app.codeUrl || 'Percorso sorgenti non configurato'}</code></p>)
            : <p className="dev-warn">Nessun applicativo corrisponde al sistema dell’iniziativa. {applicationDiagnosis(heading.system, applications, applicationScope(loaded.evaluation, { contractId: loaded.contractId, lot: loaded.lot }))} Per collegarlo, nel Configuratore apri «Risorse e configurazione → Applicativi».</p>}</div>
        <div className="dev-source"><span className="dev-source-label">Cartella dei sorgenti (questa sessione)</span>
          {files.length ? <p><b>{files.length} file selezionati</b> · {sourceCount} sorgenti presi in considerazione</p> : techProfile ? <p>Nessuna cartella: uso il profilo tecnico dell’applicativo ({techProfile.totalFiles || 0} file, {techProfile.readFiles || 0} analizzati).</p> : <p className="dev-warn">Nessuna cartella selezionata: le proposte AI e la generazione dei file non sono disponibili.</p>}
          <button type="button" className="dev-btn dev-btn-primary" onClick={selectFolder}>{files.length ? 'Cambia cartella' : 'Seleziona cartella sorgenti'}</button>
          <small>Il browser non conserva il permesso di leggere la cartella: va riselezionata dopo un ricaricamento, solo per nuove analisi.</small></div>
      </div>
    </section>,
    schede: <DevelopmentActivities key={`${loaded.key}:activities`} embedded items={loaded.evaluation.items || []} plans={plans} onChange={editPlans} applications={linkedApplications} onSelectFiles={selectFolder} sourceFiles={files} />,
    progetto: <ProjectPreparationPanel key={`${loaded.key}:project`} initiative={heading} preparation={preparation} onChange={editPreparation} items={loaded.evaluation.items || []} plans={plans} applications={linkedApplications} workspaceContext={null} branch={delivery.branch} />,
    codice: <section className="dev-card dev-phase-card" aria-label="Generazione di file">
      <h3>Generazione di codice e workflow</h3>
      <p>La generazione si fa dentro ogni scheda, nella sezione «Generazione codice / workflow». Qui vedi dove sei arrivato.</p>
      <ul className="dev-code-list">{activities.map(({ key, number, item }) => {
        const plan = plans[key] || {}; const ready = !!(plan.solution?.trim() && plan.acceptance?.trim());
        return <li key={key}><span className="dev-activity-number">Attività {number}</span><span>{item.interventionId} · {String(item.detail?.detailDescription || item.reason || '').slice(0, 90)}</span>
          <span className={`dev-pill ${hasCode(plan) ? 'dev-pill-ok' : ''}`}>{hasCode(plan) ? `${plan.generatedCode.files.length} file generati` : ready ? 'Pronta da generare' : 'Scheda incompleta'}</span>
          <button type="button" className="dev-btn" onClick={() => setPhase('schede')}>Apri le schede</button></li>;
      })}</ul>
      <p className="dev-hint">{generated} attività su {activities.length} con file conservati. Generato non significa compilato: nulla viene scritto nel repository.</p>
    </section>,
    consegna: <section className="dev-card dev-phase-card" aria-label="Richiesta di modifica codice">
      <h3>Richiesta di modifica codice</h3>
      <p>Raccoglie schede, interventi approvati e riferimenti al repository in un pacchetto per lo strumento di sviluppo. Non scrive nel repository e non esegue build, test o deploy.</p>
      <div className="workspace-fields">
        <label>Strumento previsto<select value={delivery.tool} onChange={e => editDelivery({ tool: e.target.value })}><option value="vscode">Visual Studio Code</option><option value="codex">Codex</option><option value="other">Altro</option></select></label>
        <label>Branch suggerito<input value={delivery.branch} placeholder="feature/<codice>" onChange={e => editDelivery({ branch: e.target.value })} /></label>
        <label>Note di approvazione<textarea rows={2} value={delivery.notes} placeholder="Criteri di autorizzazione, vincoli, razionale…" onChange={e => editDelivery({ notes: e.target.value })} /></label>
        <label>Compilazione e test<textarea rows={2} value={delivery.tests} placeholder="Comandi di build/test da eseguire (es. npm run build, dotnet test)…" onChange={e => editDelivery({ tests: e.target.value })} /></label>
      </div>
      <p className="dev-hint">Interventi approvati inclusi: <b>{approved.length}</b>. {files.length ? `${sourceCount} file sorgente presi in considerazione.` : techProfile ? 'Repository dal profilo tecnico dell’applicativo.' : 'Nessun repository collegato: seleziona la cartella nella fase Fonti.'}</p>
      <div className="development-actions">
        <button type="button" className="dev-btn dev-btn-primary" onClick={exportZip} disabled={!!busy}>{busy === 'zip' ? 'Genero il pacchetto…' : 'Genera ZIP richiesta modifica codice'}</button>
        <button type="button" className="dev-btn" onClick={exportMarkdown} disabled={!!busy}>Esporta piano di sviluppo (MD)</button>
        <button type="button" className="dev-btn" onClick={generateDocument} disabled={!!busy}>{busy === 'ai' ? 'Generazione documento…' : 'Genera documento sviluppo (AI)'}</button>
      </div>
    </section>,
    verifica: <section className="dev-card dev-phase-card" aria-label="Verifica delle attività">
      <h3>Verifica</h3>
      <p>Dopo aver scritto e provato il codice in Visual Studio Code, registra nella scheda comandi, esiti e commit, quindi imposta «Verificata». L’app non esegue i test: le evidenze le inserisci tu.</p>
      <ul className="dev-code-list">{activities.map(({ key, number, item }) => { const plan = plans[key] || {};
        return <li key={key}><span className="dev-activity-number">Attività {number}</span><span>{item.interventionId} · {String(item.detail?.detailDescription || item.reason || '').slice(0, 90)}</span>
          <span className={`dev-pill ${plan.status === 'Verificata' ? 'dev-pill-ok' : ''}`}>{plan.status || 'Da analizzare'}</span>
          <button type="button" className="dev-btn" onClick={() => setPhase('schede')}>Apri la scheda</button></li>; })}</ul>
    </section>,
  };

  return <div className="dev-app">
    <header className="dev-head">
      <div className="dev-head-id"><span className="dev-eyebrow">Sviluppo · {loaded.revision ? `revisione ${loaded.revision}` : 'non ancora salvato'}</span>
        <h2>{heading.code} · {heading.title}</h2>
        <div className="dev-chips"><span>{heading.system || 'Sistema non indicato'}</span><span>Contratto {loaded.contractId}</span><span>Lotto {loaded.lot}</span><span>{activities.length} attività</span></div></div>
      <div className="dev-head-actions">
        {dirty && <span className="development-dirty" role="status">Modifiche non salvate</span>}
        <button type="button" className="dev-btn dev-btn-primary" onClick={save} disabled={!!busy || !dirty}>{busy === 'save' ? 'Salvataggio…' : 'Salva sviluppo'}</button>
        <button type="button" className="dev-btn" onClick={() => saveAndClose(save, close)} disabled={!!busy}>Salva e chiudi</button>
        <button type="button" className="dev-btn dev-btn-quiet" onClick={() => { if (dirty && !window.confirm('Chiudere senza salvare?')) return; close(); }} disabled={!!busy}>Chiudi senza salvare</button>
      </div>
    </header>
    {error && <p role="alert" className="development-alert">{error}</p>}
    {message && <p role="status" className="development-status">{message}</p>}
    {changed ? <p role="alert" className="development-alert">Dall’ultimo salvataggio lo sviluppo ha {changes.added.length} attività nuove, {changes.removed.length} rimosse e {changes.changed.length} con descrizione cambiata (l’offerta è stata rivista nel Configuratore). Controlla le schede delle attività modificate: restano legate alla riga e non si aggiornano da sole.</p> : null}
    <CollaborationPanel key={initiativeKey(heading.code || heading.title)} code={String(heading.code || heading.title || '').trim()} onNotify={setMessage} />
    <JourneyBar journey={journey} current={phase} onSelect={setPhase} showGuide={showGuide} onToggleGuide={() => setShowGuide(value => !value)} />
    <div className="dev-phase" role="region" aria-label={`Fase: ${journey.phases.find(p => p.id === phase).label}`}>{body[phase]}</div>
    <nav className="dev-pager" aria-label="Cambio fase">
      {(() => { const ids = journey.phases.map(p => p.id); const index = ids.indexOf(phase); const prev = journey.phases[index - 1]; const next = journey.phases[index + 1];
        return <>{prev ? <button type="button" className="dev-btn" onClick={() => setPhase(prev.id)}>← {prev.label}</button> : <span />}
          {next ? <button type="button" className="dev-btn dev-btn-primary" onClick={() => setPhase(next.id)}>{next.label} →</button> : <span />}</>; })()}
    </nav>
  </div>;
}
