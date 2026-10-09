import React, { useEffect, useState } from 'react';
import { getAmbientiUtenti, addUtenteAmbiente, removeUtenteAmbiente, updateUtenteAmbienteRuolo } from '../../services/mevService';

const roles = ['Admin', 'Editor', 'Client', 'Developer', 'Bid Manager'];
const accountRoles = user => [...new Set([user?.role, ...(user?.roles || [])].filter(Boolean))];
const isSuperAdmin = user => accountRoles(user).includes('SuperAdmin');
const memberRoles = member => Array.isArray(member.ruoli) ? member.ruoli : member.ruolo ? [member.ruolo] : [];
const sameRoles = (a, b) => a.length === b.length && a.every(r => b.includes(r));
function RolePicker({ title, value, onChange, disabled }) {
  return <fieldset className="ca-role-picker" disabled={disabled}><legend>{title}</legend>{roles.map(role => <label key={role}><input type="checkbox" checked={value.includes(role)} onChange={e => onChange(e.target.checked ? [...value, role] : value.filter(r => r !== role))} />{role}</label>)}</fieldset>;
}

export default function ContractMembers({ ambiente, allUsers = [] }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState('');
  const [selectedRoles, setSelectedRoles] = useState(['Editor']);
  const [drafts, setDrafts] = useState({});
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setLoadError(false); setDrafts({}); setUserId(''); setNotice('');
    getAmbientiUtenti(ambiente.id).then(data => { if (!cancelled) setMembers(data); })
      .catch(e => { if (!cancelled) { setLoadError(true); setError(e.message || 'Impossibile caricare gli utenti.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ambiente.id, retry]);
  const mutate = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await action(); setNotice(message); setDrafts({}); setUserId('');
      try { setMembers(await getAmbientiUtenti(ambiente.id)); }
      catch { setLoadError(true); setError('Operazione salvata, ma l’elenco non è aggiornato. Riprova il caricamento.'); }
    } catch (e) { setError(e.message || 'Operazione non riuscita.'); }
    finally { setBusy(false); }
  };
  const available = allUsers.filter(u => !isSuperAdmin(u) && !members.some(m => String(m.userId) === String(u.id)));
  const filtered = members.filter(m => [m.username, m.fullName, m.email, ...memberRoles(m)].join(' ').toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')));
  return <div className="ca-members" aria-busy={loading || busy}>
    <div className="ca-member-heading"><div><span className="ca-tag">Contratto MEV</span><h3>{ambiente.codiceContratto} · {ambiente.descrizione || 'Descrizione non disponibile'}</h3></div><span>{loading ? 'Caricamento…' : `${members.length} utenti associati`}</span></div>
    <p className="ca-caption">SuperAdmin accede a tutti i contratti senza assegnazioni. Puoi attribuire più ruoli agli altri utenti per questo contratto MEV.</p>
    {notice && <p className="ca-success" role="status">{notice}</p>}
    {error && <div className="ca-error" role="alert">{error} <button disabled={busy} onClick={() => setRetry(r => r + 1)}>Riprova caricamento</button></div>}
    {loading ? <p role="status" className="ca-empty">Caricamento degli accessi…</p> : <>
      <form className="ca-member-form" onSubmit={e => { e.preventDefault(); if (userId && selectedRoles.length) mutate(() => addUtenteAmbiente(ambiente.id, Number(userId), selectedRoles), 'Utente aggiunto al contratto.'); }}>
        <label>Account da aggiungere<select value={userId} onChange={e => setUserId(e.target.value)} disabled={busy || loadError || !available.length} required><option value="">{available.length ? 'Seleziona un account dell’app' : 'Nessun account da aggiungere'}</option>{available.map(u => <option key={u.id} value={u.id}>{u.username} · {u.fullName || u.username}</option>)}</select></label>
        <RolePicker title="Ruoli nel contratto" value={selectedRoles} onChange={setSelectedRoles} disabled={busy} />
        <button className="ca-primary" disabled={busy || !userId || !selectedRoles.length || loadError}>Aggiungi utente</button>
      </form>
      {!available.length && <p className="ca-caption">{allUsers.length ? 'Tutti gli account disponibili sono già associati o hanno accesso globale SuperAdmin.' : 'L’elenco degli account dell’app non è disponibile.'}</p>}
      <p className="ca-caption">Seleziona almeno un ruolo. Rimuovere un accesso mantiene l’account dell’utente.</p>
      <label className="ca-search">Cerca negli utenti<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, email o ruolo" /></label>
      {!loadError && (members.length === 0 ? <p className="ca-empty">Nessun utente associato. Aggiungi il primo account dal modulo qui sopra.</p> : filtered.length === 0 ? <p className="ca-empty">Nessun utente corrisponde alla ricerca.</p> : <div className="ca-table-wrap"><table className="ca-table"><thead><tr><th scope="col">Utente</th><th scope="col">Ruoli nel contratto MEV</th><th scope="col">Azioni</th></tr></thead><tbody>{filtered.map(m => {
        const account = allUsers.find(u => String(u.id) === String(m.userId));
        const superAdmin = isSuperAdmin(account) || memberRoles(m).includes('SuperAdmin');
        const saved = memberRoles(m); const draft = drafts[m.userId] ?? saved;
        return <tr key={m.userId}><td><strong>{m.fullName || m.username}</strong><small>{m.username} · {m.email || 'Email non indicata'}</small></td>
        <td>{superAdmin ? <span>SuperAdmin · accesso globale</span> : <RolePicker title={`Ruoli di ${m.username}`} value={draft} onChange={value => setDrafts(d => ({ ...d, [m.userId]: value }))} disabled={busy} />}</td>
        <td>{!superAdmin && <div className="ca-row-actions">{!sameRoles(draft, saved) && <><button className="ca-primary" disabled={busy || !draft.length} onClick={() => mutate(() => updateUtenteAmbienteRuolo(ambiente.id, m.userId, draft), 'Ruoli aggiornati.')}>Salva ruoli</button><button disabled={busy} onClick={() => setDrafts(d => { const next = { ...d }; delete next[m.userId]; return next; })}>Annulla</button></>}<button className="ca-danger" disabled={busy} onClick={() => { if (window.confirm(`Rimuovere l’accesso di ${m.username} al contratto ${ambiente.codiceContratto}?`)) mutate(() => removeUtenteAmbiente(ambiente.id, m.userId), 'Accesso rimosso.'); }}>Rimuovi accesso</button></div>}</td></tr>;
      })}</tbody></table></div>)}
    </>}
  </div>;
}
