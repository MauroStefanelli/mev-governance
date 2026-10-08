import React, { useEffect, useState } from 'react';
import { getAmbientiUtenti, addUtenteAmbiente, removeUtenteAmbiente, updateUtenteAmbienteRuolo } from '../../services/mevService';

const roles = ['Admin', 'Editor', 'Client', 'Developer', 'Bid Manager', 'SuperAdmin'];

export default function ContractMembers({ ambiente, allUsers = [] }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('Editor');
  const [drafts, setDrafts] = useState({});
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(''); setLoadError(false); setDrafts({}); setUserId(''); setNotice('');
    getAmbientiUtenti(ambiente.id).then(data => { if (!cancelled) setMembers(data); })
      .catch(e => { if (!cancelled) { setLoadError(true); setError(e.message || 'Impossibile caricare gli utenti.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ambiente.id, retry]);

  const mutate = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      // A refresh failure must not be presented as a failed write.
      setNotice(message);
      setDrafts({}); setUserId('');
      try { setMembers(await getAmbientiUtenti(ambiente.id)); }
      catch (e) { setLoadError(true); setError('Operazione salvata, ma l’elenco non è aggiornato. Riprova il caricamento.'); }
    } catch (e) { setError(e.message || 'Operazione non riuscita.'); }
    finally { setBusy(false); }
  };
  const available = allUsers.filter(u => !members.some(m => String(m.userId) === String(u.id)));
  const filtered = members.filter(m => [m.username, m.fullName, m.email, m.ruolo].join(' ').toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')));
  return <div className="ca-members" aria-busy={loading || busy}>
    <div className="ca-member-heading"><div><span className="ca-tag">{ambiente.codiceContratto}</span><h3>{ambiente.descrizione || 'Utenti autorizzati'}</h3></div><span>{loading ? 'Caricamento…' : `${members.length} utenti`}</span></div>
    {notice && <p className="ca-success" role="status">{notice}</p>}
    {error && <div className="ca-error" role="alert">{error} <button disabled={busy} onClick={() => setRetry(r => r + 1)}>Riprova caricamento</button></div>}
    {loading ? <p role="status" className="ca-empty">Caricamento degli accessi…</p> : <>
      <form className="ca-member-form" onSubmit={e => { e.preventDefault(); if (userId) mutate(() => addUtenteAmbiente(ambiente.id, Number(userId), role), 'Utente aggiunto al contratto.'); }}>
        <label>Account da aggiungere<select value={userId} onChange={e => setUserId(e.target.value)} disabled={busy || loadError} required><option value="">Seleziona un utente</option>{available.map(u => <option key={u.id} value={u.id}>{u.fullName || u.username} · {u.username}</option>)}</select></label>
        <label>Ruolo nel contratto<select value={role} onChange={e => setRole(e.target.value)} disabled={busy}>{roles.map(r => <option key={r}>{r}</option>)}</select></label>
        <button className="ca-primary" disabled={busy || !userId || !!error}>Aggiungi utente</button>
      </form>
      <p className="ca-caption">Il ruolo si applica a questo contratto MEV. Rimuovere un accesso mantiene l’account dell’utente.</p>
      <label className="ca-search">Cerca negli utenti<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, email o ruolo" /></label>
      {!loadError && (members.length === 0 ? <p className="ca-empty">Nessun utente associato. Aggiungi il primo account dal modulo qui sopra.</p> : filtered.length === 0 ? <p className="ca-empty">Nessun utente corrisponde alla ricerca.</p> : <div className="ca-table-wrap"><table className="ca-table"><thead><tr><th scope="col">Utente</th><th scope="col">Ruolo nel contratto</th><th scope="col">Azioni</th></tr></thead><tbody>{filtered.map(m => <tr key={m.userId}>
        <td><strong>{m.fullName || m.username}</strong><small>{m.username} · {m.email || 'Email non indicata'}</small></td>
        <td><label className="ca-sr-only" htmlFor={`role-${ambiente.id}-${m.userId}`}>Ruolo di {m.username}</label><select id={`role-${ambiente.id}-${m.userId}`} value={drafts[m.userId] ?? m.ruolo} onChange={e => setDrafts(d => ({ ...d, [m.userId]: e.target.value }))} disabled={busy}>{!roles.includes(m.ruolo) && <option>{m.ruolo}</option>}{roles.map(r => <option key={r}>{r}</option>)}</select></td>
        <td><div className="ca-row-actions">{drafts[m.userId] !== undefined && drafts[m.userId] !== m.ruolo && <><button className="ca-primary" disabled={busy} onClick={() => mutate(() => updateUtenteAmbienteRuolo(ambiente.id, m.userId, drafts[m.userId]), 'Ruolo aggiornato.')}>Salva ruolo</button><button disabled={busy} onClick={() => setDrafts(d => { const next = { ...d }; delete next[m.userId]; return next; })}>Annulla</button></>}<button className="ca-danger" disabled={busy} onClick={() => { if (window.confirm(`Rimuovere l’accesso di ${m.username} al contratto ${ambiente.codiceContratto}?`)) mutate(() => removeUtenteAmbiente(ambiente.id, m.userId), 'Accesso rimosso.'); }}>Rimuovi accesso</button></div></td>
      </tr>)}</tbody></table></div>)}
    </>}
  </div>;
}
