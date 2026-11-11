import React, { useEffect, useState } from 'react';
import { workspaceRequest } from '../services/mevService';
import InitiativeDocuments from './InitiativeDocuments';
import InitiativeConversation from './InitiativeConversation';

const fields = {
  title: 'Titolo', system: 'Sistema', family: 'Famiglia applicativa',
  asIs: 'Analisi AS-IS', toBe: 'Analisi TO-BE', facts: 'Fatti verificati ed evidenze',
  assumptions: 'Ipotesi non verificate', openQuestions: 'Punti da confermare con Poste',
  sources: 'Fonti documentali (file, pagina, riferimento)', repositories: 'Repository (URL, branch, commit)',
  queries: 'Interrogazioni e risultati verificati', permanentInstructions: 'Indicazioni permanenti approvate dagli utenti',
};
const parse = revision => revision ? JSON.parse(revision.payload) : null;
export function changedWorkspaceFields(left, right) {
  return [...Object.keys(fields), 'decisions', 'documentEvidence', 'estimate', 'status', 'approvedBy'].filter(key => JSON.stringify(left?.[key]) !== JSON.stringify(right?.[key]));
}
const input = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #aebdd0', borderRadius: 6, font: 'inherit' };

export default function InitiativeWorkspace({ initiative, estimate, roles = [], onContextChange, onRestore, onSaved }) {
  const code = String(initiative.code || '').trim();
  const [revisions, setRevisions] = useState([]);
  const [draft, setDraft] = useState({});
  const [base, setBase] = useState(0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [related, setRelated] = useState([]);
  const [comparison, setComparison] = useState('');
  const [against, setAgainst] = useState('');
  const canEdit = roles.some(role => ['Admin', 'Developer', 'SuperAdmin'].includes(role));
  const canApprove = roles.some(role => ['Bid Manager', 'SuperAdmin'].includes(role));
  const apply = list => {
    const current = parse(list[0]);
    setRevisions(list); setBase(list[0]?.version || 0);
    setDraft(current || { title: initiative.title || '', system: initiative.system || '', decisions: [] });
    setDirty(false); setReason(''); setLoaded(true);
  };
  useEffect(() => {
    let alive = true;
    setRevisions([]); setDraft({}); setBase(0); setDirty(false); setError(''); setLoaded(false); setRelated([]);
    if (!code) { onContextChange(null); return; }
    setBusy(true);
    workspaceRequest(`${encodeURIComponent(code)}/revisions`).then(list => { if (alive) apply(list); })
      .catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (!code) return;
      const params = new URLSearchParams({ system: draft.system || initiative.system || '', family: draft.family || '', exclude: code });
      workspaceRequest(`related?${params}`).then(list => { if (alive) setRelated(list); }).catch(e => { if (alive) setError(e.message); });
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [code, draft.system, draft.family, initiative.system]);
  // The PM Poste of the initiative (Dati iniziativa) is the one the analysis, the AI and the exports use.
  const analysisWithPm = initiative.pmPoste ? { ...draft, pmPoste: initiative.pmPoste } : draft;
  useEffect(() => {
    onContextChange({ goto: code, version: base, saved: !dirty, analysis: analysisWithPm,
      priorEvaluations: related.map(r => ({ goto: r.goto, version: r.version, author: r.author, source: `workspace:${r.goto}:v${r.version}`, analysis: parse(r) })) });
  }, [code, base, dirty, draft, related, onContextChange, initiative.pmPoste]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (key, value) => { setDraft(d => ({ ...d, [key]: value })); setDirty(true); };
  const save = async approve => {
    setBusy(true); setError('');
    try {
      const revision = await workspaceRequest(`${encodeURIComponent(code)}/revisions`, {
        expectedVersion: base, reason, approve,
        state: approve ? parse(revisions[0]) : { ...draft, estimate },
      });
      apply([revision, ...revisions]);
      onSaved?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const reload = async () => {
    setBusy(true); setError('');
    try { setRevisions(await workspaceRequest(`${encodeURIComponent(code)}/revisions`)); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const exportAnalysis = () => {
    const text = `# ANALISI ${code}\n\nRevisione di riferimento: ${base} — ${dirty ? 'bozza non salvata' : 'salvata'}\n\n`
      + Object.entries(fields).map(([key, label]) => `## ${label}\n${draft[key] || 'Da completare'}\n`).join('\n')
      + '\n## Decisioni\n' + (draft.decisions || []).map(d => `- ${d.text} — Fonte: ${d.source || 'da indicare'} — ${d.approvedAt ? `Approvata da ${d.approvedBy} il ${d.approvedAt}` : 'Da approvare'}`).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ANALISI_${code.replace(/[^a-z0-9_-]/gi, '_')}_v${base}.md`; a.click(); URL.revokeObjectURL(url);
  };
  const compared = revisions.find(r => String(r.version) === comparison);
  const previous = revisions.find(r => String(r.version) === against);
  return <section className="initiative-workspace" aria-label="Workspace collaborativo iniziativa">
    <header className="workspace-heading"><div><span className="workspace-eyebrow">Analisi condivisa</span><h3>{code ? `Iniziativa ${code}` : 'Dall’iniziativa alla soluzione'}</h3></div><span className="workspace-version">{base ? `Revisione ${base}` : 'Nuova analisi'}</span></header>
    {!code ? <p>Inserisci il Codice GOTO nei dati iniziativa qui sopra: analisi, decisioni e storico saranno collegati automaticamente.</p> : <>
      <p>Revisione di lavoro: {base || 'nuova'} · {dirty ? 'Modifiche locali non salvate' : draft.status || 'In analisi'}</p>
      {error && <p role="alert">{error} Il contenuto locale è conservato.</p>}
      <button type="button" disabled={busy} onClick={reload}>Aggiorna storico senza perdere la bozza</button>
      <InitiativeDocuments key={`documents:${code}`} code={code} canEdit={canEdit} evidence={draft.documentEvidence || []} onUseExtract={(document, extraction) => {
        const other = (draft.documentEvidence || []).filter(item => item.documentId !== document.id);
        const selected = extraction ? extraction.passages.map(p => ({ documentId: document.id, fileName: document.fileName, sha256: document.sha256, location: p.location, text: p.text })) : [];
        if ([...other, ...selected].reduce((n, p) => n + p.text.length, 0) > 48000) { setError('Il contesto documentale supera 48.000 caratteri. Rimuovi un estratto prima di aggiungerne altri.'); return; }
        edit('documentEvidence', [...other, ...selected]);
      }} onUseSource={source => {
        if (!(draft.sources || '').includes(source)) edit('sources', [draft.sources, source].filter(Boolean).join('\n'));
      }} />
      <details open><summary>Analisi, fonti e decisioni</summary>
        <fieldset disabled={!canEdit || busy} style={{ border: 0, padding: 0 }}>
          <div className="workspace-fields">{Object.entries(fields).map(([key, label]) => <label key={key} className={['title', 'system', 'family'].includes(key) ? 'workspace-short-field' : ''}>{label}<textarea style={input} rows={['title', 'system', 'family'].includes(key) ? 1 : 3} value={draft[key] || ''} onChange={e => edit(key, e.target.value)} /></label>)}</div>
          <h4>Decisioni (approvazione esplicita)</h4>
          {(draft.decisions || []).map((d, i) => <div key={d.id} style={{ padding: 10, border: '1px solid #dce3eb', marginBottom: 8 }}>
            <label>Decisione<textarea style={input} disabled={!!d.approvedAt} value={d.text} onChange={e => edit('decisions', draft.decisions.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} /></label>
            <label>Fonte<input style={input} disabled={!!d.approvedAt} value={d.source} onChange={e => edit('decisions', draft.decisions.map((x, j) => j === i ? { ...x, source: e.target.value } : x))} /></label>
            {d.approvedAt ? <p>Approvata da {d.approvedBy} · {d.approvedAt}</p> : <label><input type="checkbox" checked={!!d.approve} onChange={e => edit('decisions', draft.decisions.map((x, j) => j === i ? { ...x, approve: e.target.checked } : x))} />Approvo questa decisione al salvataggio</label>}
          </div>)}
          <button type="button" onClick={() => edit('decisions', [...(draft.decisions || []), { id: crypto.randomUUID(), text: '', source: '' }])}>Aggiungi decisione</button>
        </fieldset>
      </details>
      <div className="workspace-save-bar"><label style={{ display: 'block', margin: '12px 0' }}>Modifiche e motivazione della revisione<input style={input} placeholder="Es. Integrati gli impatti sulle API" value={reason} onChange={e => setReason(e.target.value)} /></label>
      {canEdit && <button disabled={!loaded || busy || !reason.trim()} onClick={() => save(false)}>Salva nuova revisione con stima corrente</button>}
      {canApprove && <button disabled={busy || dirty || !base || !reason.trim()} onClick={() => save(true)}>Approva revisione {base}</button>}
      <button type="button" onClick={exportAnalysis}>Esporta ANALISI Markdown</button>
      </div>
      <InitiativeConversation key={`conversation:${code}`} code={code} version={base} dirty={dirty} canEdit={canEdit} onDecision={proposal => {
        edit('decisions', [...(draft.decisions || []), { id: crypto.randomUUID(), text: proposal.text, source: proposal.source }]);
      }} />
      <details><summary>Storico e confronto versioni ({revisions.length})</summary>
        {revisions.map(r => <p key={r.version}>v{r.version} · {r.author} · {new Date(r.createdAt).toLocaleString('it-IT')} · {r.reason} <button disabled={busy || !canEdit} onClick={() => {
          if (!window.confirm(`Riprendere la revisione ${r.version}? Analisi e stima correnti saranno sostituite nella bozza. Lo storico salvato rimane invariato.`)) return;
          const state = parse(r);
          if (onRestore && onRestore(state, code) === false) return;
          setDraft(state); setBase(revisions[0].version); setDirty(true);
          setReason(`Ripresa dalla revisione ${r.version}`);
        }}>Riprendi analisi e stima · v{r.version}</button></p>)}
        <label>Versione<select value={comparison} onChange={e => setComparison(e.target.value)}><option value="">Seleziona</option>{revisions.map(r => <option key={r.version}>{r.version}</option>)}</select></label>
        <label>Confronta con<select value={against} onChange={e => setAgainst(e.target.value)}><option value="">Seleziona</option>{revisions.map(r => <option key={r.version}>{r.version}</option>)}</select></label>
        {compared && previous && changedWorkspaceFields(parse(previous), parse(compared)).map(key => <div key={key}><h4>{fields[key] || (key === 'pmPoste' ? 'PM Poste' : key)}</h4><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(parse(previous)[key], null, 2)} → {JSON.stringify(parse(compared)[key], null, 2)}</pre></div>)}
      </details>
      <details open={related.length > 0}><summary>Memoria correlata: stesso sistema o famiglia ({related.length})</summary>{related.map(r => <article key={r.id}><strong>{r.goto} · v{r.version} · {parse(r).title}</strong><p>{parse(r).toBe}</p><p>Fonte workspace:{r.goto}:v{r.version} · {r.author}</p></article>)}</details>
    </>}
  </section>;
}
