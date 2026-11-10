import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InitiativeHeading from '../configuratore/InitiativeHeading';
import DevelopmentActivities from '../configuratore/ActivityDevelopmentPanel';
import ProjectPreparationPanel from '../configuratore/ProjectPreparationPanel';
import { developmentActivities } from '../configuratore/developmentActivityModel';
import { parseRecordPayload, loadDevelopmentState, saveDevelopmentState, loadApplications, catalogFor, applicationsForInitiative,
  activitySignature, activityChanges, DEFAULT_DELIVERY } from '../configuratore/developmentRecord';
import { approvedInterventions, buildCodeChangeRequest, implementationMarkdown, developmentDocumentMarkdown, downloadBlob, repositorySummary } from '../configuratore/developmentPackages';
import { saveAndClose } from '../configuratore/saveAndClose';
import { getConfiguratoreRecords, getConfiguratoreContracts, analyzeDevelopmentWithAi } from '../services/mevService';
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
const stamp = value => value ? new Date(value).toLocaleString('it-IT') : '';
const unauthorized = error => { try { const status = JSON.parse(error.message).status; return status === 401 || status === 403; } catch { return false; } };

export default function SviluppoPage({ onUnauthorized, ambienteId, codiceContratto }) {
  const [list, setList] = useState([]);
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
  const opening = useRef(0);
  const contractId = codiceContratto || (ambienteId ? String(ambienteId) : '');

  const refresh = useCallback(async () => {
    setLoadingList(true); setListError('');
    try {
      const [{ records }, catalogs] = await Promise.all([
        getConfiguratoreRecords({ entity_type: 'initiative_evaluation', contract_id: contractId }),
        getConfiguratoreContracts().catch(() => []),
      ]);
      setList(records); setContracts(catalogs);
    } catch (e) { if (unauthorized(e)) return onUnauthorized?.(); setListError(`Elenco iniziative non disponibile: ${e.message}`); }
    finally { setLoadingList(false); }
  }, [contractId, onUnauthorized]);
  useEffect(() => { setLoaded(null); refresh(); }, [refresh]);

  const open = async record => {
    if (dirty && !window.confirm('Aprire un’altra iniziativa? Le modifiche allo sviluppo non salvate andranno perse.')) return;
    const token = ++opening.current; setBusy('open'); setError(''); setMessage('');
    try {
      const state = await loadDevelopmentState(record);
      const apps = await loadApplications(state.contractId, state.lot);
      if (token !== opening.current) return;
      setLoaded(state); setPlans(state.plans); setPreparation(state.preparation); setDelivery(state.delivery);
      setApplications(apps); setFiles([]); setDirty(false);
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

  const save = async () => {
    setBusy('save'); setError(''); setMessage('');
    try {
      const revision = await saveDevelopmentState(loaded, { plans, preparation, delivery, activities: activitySignature(activities) });
      setLoaded(previous => ({ ...previous, revision, source: 'saved', savedActivities: activitySignature(activities) })); setDirty(false);
      setMessage(`Sviluppo salvato e confermato dal server (revisione ${revision}).`); return true;
    } catch (e) { setError(`Salvataggio non riuscito: ${e.message}`); return false; } finally { setBusy(''); }
  };
  const close = () => { setLoaded(null); setDirty(false); refresh(); };
  const selectFolder = async () => { const chosen = await pick(); if (chosen.length) { setFiles(chosen); setMessage(`Repository collegato per questa sessione: ${chosen.length} file.`); } };

  const run = (name, action) => async () => { setBusy(name); setError(''); setMessage(''); try { await action(); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const approved = loaded ? approvedInterventions(loaded.evaluation, catalog) : [];
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
  const verified = Object.values(plans).filter(plan => plan?.status === 'Verificata').length;
  const heading = loaded ? loaded.evaluation.initiative || {} : {};

  return <div className="tow-workbench development-app">
    <InitiativeHeading title="Sviluppo iniziative" initiative={heading} contractId={loaded?.contractId || contractId || '—'} lot={loaded?.lot || '—'} catalogCount={loaded ? catalog.length : null} />
    {error && <p role="alert" className="development-alert">{error}</p>}
    {message && <p role="status" className="development-status">{message}</p>}
    {!loaded && <section className="initiative-workspace" aria-label="Iniziative da sviluppare">
      <header className="workspace-heading"><div><span className="workspace-eyebrow">Dalla valutazione al codice</span><h3>Scegli l’iniziativa</h3></div><span className="workspace-version">{rows.length} iniziative</span></header>
      <p>Qui lavori sulle iniziative già valutate nel Configuratore: schede per attività, proposte AI, progetto di avvio e richiesta di modifica codice. Offerta e importi restano nel Configuratore.</p>
      <label>Cerca per GOTO, titolo o sistema<input className="development-search" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <button type="button" onClick={refresh} disabled={loadingList}>↻ Aggiorna elenco</button>
      {listError && <p role="alert">{listError}</p>}
      {loadingList && <p role="status">Caricamento iniziative…</p>}
      {!loadingList && !rows.length && !listError && <p>Nessuna iniziativa valutata in questo ambiente. Salva prima una valutazione nel Configuratore.</p>}
      {rows.map(({ record, evaluation }) => <button type="button" className="workspace-library-row" key={record.record_key || record.Id} disabled={busy === 'open'} onClick={() => open(record)}>
        <strong>{evaluation.initiative?.code || 'Senza GOTO'} · {evaluation.initiative?.title || record.title}</strong>
        <span>{evaluation.initiative?.system || 'Sistema non indicato'} · {(evaluation.items || []).length} attività · aggiornata {stamp(record.updated_at)}</span>
      </button>)}
    </section>}
    {loaded && <>
      <section className="initiative-workspace" aria-label="Stato dello sviluppo">
        <header className="workspace-heading"><div><span className="workspace-eyebrow">Sviluppo · revisione {loaded.revision || 'non ancora salvata'}</span><h3>{heading.code} · {heading.title}</h3></div>
          <span className="workspace-version">{activities.length} attività · {verified} verificate</span></header>
        {dirty && <p className="development-dirty" role="status">Modifiche non salvate. Salva prima di chiudere o cambiare iniziativa.</p>}
        {(changes?.changed.length > 0 || changes?.added.length > 0 || changes?.removed.length > 0) && <p role="alert">Dall’ultimo salvataggio lo sviluppo ha {changes.added.length} attività nuove, {changes.removed.length} rimosse e {changes.changed.length} con descrizione cambiata (l’offerta è stata rivista nel Configuratore). Controlla le schede delle attività modificate prima di proseguire: le schede restano collegate alla riga e non si aggiornano da sole.</p>}
        <div className="development-actions">
          <button type="button" onClick={save} disabled={!!busy || !dirty}>{busy === 'save' ? 'Salvataggio…' : 'Salva sviluppo'}</button>
          <button type="button" onClick={() => saveAndClose(save, close)} disabled={!!busy}>Salva e chiudi</button>
          <button type="button" onClick={() => { if (dirty && !window.confirm('Chiudere senza salvare?')) return; close(); }} disabled={!!busy}>Chiudi senza salvare</button>
        </div>
      </section>
      <DevelopmentActivities key={`${loaded.key}:activities`} items={loaded.evaluation.items || []} plans={plans} onChange={editPlans} applications={linkedApplications} onSelectFiles={selectFolder} sourceFiles={files} />
      <ProjectPreparationPanel key={`${loaded.key}:project`} initiative={heading} preparation={preparation} onChange={editPreparation} items={loaded.evaluation.items || []} plans={plans} applications={linkedApplications} workspaceContext={null} branch={delivery.branch} />
      <section className="initiative-workspace" aria-label="Richiesta di modifica codice">
        <header className="workspace-heading"><div><span className="workspace-eyebrow">Consegna</span><h3>Richiesta di modifica codice</h3></div></header>
        <p>Raccoglie schede, interventi approvati e riferimenti al repository in un pacchetto per lo strumento di sviluppo. Non scrive nel repository e non esegue build, test o deploy.</p>
        <div className="workspace-fields">
          <label>Strumento previsto<select value={delivery.tool} onChange={e => editDelivery({ tool: e.target.value })}><option value="vscode">Visual Studio Code</option><option value="codex">Codex</option><option value="other">Altro</option></select></label>
          <label>Branch suggerito<input value={delivery.branch} placeholder="feature/<codice>" onChange={e => editDelivery({ branch: e.target.value })} /></label>
          <label>Note di approvazione<textarea rows={2} value={delivery.notes} placeholder="Criteri di autorizzazione, vincoli, razionale…" onChange={e => editDelivery({ notes: e.target.value })} /></label>
          <label>Compilazione e test<textarea rows={2} value={delivery.tests} placeholder="Comandi di build/test da eseguire (es. npm run build, dotnet test)…" onChange={e => editDelivery({ tests: e.target.value })} /></label>
        </div>
        <p>{files.length ? `${sourceCount} file sorgente presi in considerazione (node_modules, dist, build, vendor, bin/obj, minificati e lock sono ignorati).` : techProfile ? `Repository dal profilo tecnico dell’applicativo (${techProfile.totalFiles || 0} file totali, ${techProfile.readFiles || 0} analizzati).` : 'Nessun repository collegato: seleziona la cartella dei sorgenti o configura un applicativo con profilo tecnico.'}</p>
        <p>Interventi approvati inclusi: {approved.length}.</p>
        <div className="development-actions">
          <button type="button" onClick={exportZip} disabled={!!busy}>{busy === 'zip' ? 'Genero il pacchetto…' : 'Genera ZIP richiesta modifica codice'}</button>
          <button type="button" onClick={exportMarkdown} disabled={!!busy}>Esporta piano di sviluppo (MD)</button>
          <button type="button" onClick={generateDocument} disabled={!!busy}>{busy === 'ai' ? 'Generazione documento…' : 'Genera documento sviluppo (AI)'}</button>
        </div>
      </section>
    </>}
  </div>;
}

