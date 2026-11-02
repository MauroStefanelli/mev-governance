import React, { useEffect, useState } from 'react';
import { workspaceRequest } from '../services/mevService';

const labels = { sintesi: 'Sintesi', fatti: 'Fatti documentati', ipotesi: 'Ipotesi', proposta: 'Proposta da valutare', rischiAlternative: 'Rischi e alternative', daConfermare: 'Da confermare con Poste', fonti: 'Fonti citate' };
const text = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);

export default function InitiativeConversation({ code, version, dirty, canEdit, onDecision }) {
  const [history, setHistory] = useState([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [contexts, setContexts] = useState({});
  useEffect(() => {
    let alive = true;
    workspaceRequest(`${encodeURIComponent(code)}/conversation`).then(rows => { if (alive) setHistory(rows); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [code]);
  const refresh = async () => {
    setError('');
    try { setHistory(await workspaceRequest(`${encodeURIComponent(code)}/conversation`)); }
    catch (e) { setError(e.message); }
  };
  const ask = async () => {
    setBusy(true); setError('');
    try {
      const exchange = await workspaceRequest(`${encodeURIComponent(code)}/conversation`, { question, expectedVersion: version });
      setHistory(previous => [...previous, exchange]); setQuestion('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const inspect = async exchange => {
    try {
      const context = await workspaceRequest(`${encodeURIComponent(code)}/conversation/${exchange.id}/context`);
      setContexts(previous => ({ ...previous, [exchange.id]: context }));
    } catch (e) { setError(e.message); }
  };
  return <details className="initiative-conversation" open>
    <summary>Confronto AI condiviso · {history.length} scambi</summary>
    <p>Le domande e le risposte restano collegate alla revisione usata. Le risposte AI sono proposte da verificare, non decisioni approvate.</p>
    <button type="button" disabled={busy} onClick={refresh}>Aggiorna conversazione</button>
    {error && <p role="alert">{error} La domanda corrente è conservata.</p>}
    <div className="conversation-history">{history.map(exchange => {
      const answer = JSON.parse(exchange.answer);
      return <article key={exchange.id}>
        <header><strong>{exchange.author}</strong><span>v{exchange.revision} · {new Date(exchange.createdAt).toLocaleString('it-IT')} · {exchange.model}</span></header>
        <p className="conversation-question">{exchange.question}</p>
        {Object.entries(answer).map(([key, value]) => <section key={key}><h5>{labels[key] || key}</h5><div style={{ whiteSpace: 'pre-wrap' }}>{Array.isArray(value) ? value.map(text).join('\n') : text(value)}</div></section>)}
        <button type="button" onClick={() => inspect(exchange)}>Consulta contesto usato</button>
        {contexts[exchange.id] && <details><summary>Snapshot del contesto</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(contexts[exchange.id], null, 2)}</pre></details>}
        {canEdit && answer.proposta && <button type="button" onClick={() => onDecision({ text: text(answer.proposta), source: `conversation:${exchange.id} · workspace:${code}:v${exchange.revision}` })}>Porta la proposta nelle decisioni da valutare</button>}
      </article>;
    })}</div>
    {canEdit && <div className="conversation-composer">
      {(!version || dirty) && <p role="status">Salva la revisione corrente prima di inviare una domanda: l’AI usa solo analisi e fonti salvate.</p>}
      <label>Domanda per l’AI<textarea rows={3} maxLength={6000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Es. Quali impatti sono documentati e quali punti dobbiamo confermare con Poste?" /></label>
      <button type="button" disabled={busy || !version || dirty || !question.trim()} onClick={ask}>{busy ? 'Analisi AI in corso…' : 'Invia e salva lo scambio'}</button>
      <p>Ogni richiesta usa la revisione salvata e gli ultimi sei scambi. La cronologia completa rimane consultabile.</p>
    </div>}
  </details>;
}
