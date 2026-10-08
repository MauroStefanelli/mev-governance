import React, { useState, useEffect } from 'react';
import { getAllAmbienti, createAmbiente, getUsers } from '../services/mevService';
import ContractArchivePage from './ContractArchivePage';
import ContractMembers from '../components/contracts/ContractMembers';
import './contractArchive.css';

export default function SuperAdminPage() {
  const [ambienti, setAmbienti] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('archive');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [newCode, setNewCode] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try { const [a, u] = await Promise.all([getAllAmbienti(), getUsers()]); setAmbienti(a); setAllUsers(u); }
    catch (e) { setError(e.message || 'Impossibile caricare i contratti.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const create = async e => {
    e.preventDefault(); if (!newCode.trim()) return;
    setCreating(true); setError('');
    try {
      const created = await createAmbiente(newCode.trim(), description.trim());
      const data = await getAllAmbienti(); setAmbienti(data);
      setSelected(created.id); setNewCode(''); setDescription(''); setShowCreate(false);
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };
  const filtered = ambienti.filter(a => [a.codiceContratto, a.descrizione].join(' ').toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')));
  const current = filtered.find(a => a.id === selected) || filtered[0];
  return <div className="ca-admin-shell">
    <nav className="ca-area-nav" aria-label="Gestione contratti"><button className={view === 'archive' ? 'is-active' : ''} aria-current={view === 'archive' ? 'page' : undefined} onClick={() => setView('archive')}>Archivio e configurazioni</button><button className={view === 'access' ? 'is-active' : ''} aria-current={view === 'access' ? 'page' : undefined} onClick={() => setView('access')}>Contratti MEV e accessi</button></nav>
    {error && <div role="alert" className="ca-error">{error} <button onClick={load} disabled={loading || creating}>Riprova</button></div>}
    {loading ? <p role="status" className="ca-empty">Caricamento dei contratti…</p> : view === 'archive' ? <ContractArchivePage ambienti={ambienti} allUsers={allUsers} /> : <div className="contract-archive ca-access-page">
      <header className="ca-member-heading"><div><p className="ca-eyebrow">AUTORIZZAZIONI</p><h1>Contratti MEV e accessi</h1><p className="ca-caption">Gestisci gli utenti anche per i contratti senza una configurazione in archivio.</p></div><button className="ca-primary" aria-expanded={showCreate} onClick={() => setShowCreate(v => !v)}>{showCreate ? 'Annulla' : '+ Nuovo contratto MEV'}</button></header>
      {showCreate && <form className="ca-member-form" onSubmit={create}><label>Codice contratto<input required value={newCode} onChange={e => setNewCode(e.target.value)} disabled={creating} /></label><label>Descrizione<input value={description} onChange={e => setDescription(e.target.value)} disabled={creating} /></label><button className="ca-primary" disabled={creating || !newCode.trim()}>{creating ? 'Creazione…' : 'Crea contratto MEV'}</button></form>}
      <div className="ca-workspace"><aside className="ca-directory"><div className="ca-directory-head"><strong>Contratti MEV</strong><span>{filtered.length}</span></div><label className="ca-search">Cerca contratto<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Codice o descrizione" /></label><div className="ca-contracts">{filtered.map(a => <button key={a.id} className={'ca-contract-choice' + (current?.id === a.id ? ' is-selected' : '')} aria-pressed={current?.id === a.id} onClick={() => setSelected(a.id)}><span className="ca-contract-icon" aria-hidden="true">▤</span><span><strong>{a.codiceContratto}</strong><small>{a.descrizione || 'Nessuna descrizione'}</small><small>{a.isActive ? 'Attivo' : 'Disattivato'}</small></span></button>)}{!filtered.length && <p className="ca-empty">Nessun contratto trovato.</p>}</div></aside><section className="ca-detail ca-access-detail">{current ? <ContractMembers key={current.id} ambiente={current} allUsers={allUsers} /> : <div className="ca-empty"><h2>Nessun contratto MEV</h2><p>Crea un contratto oppure modifica la ricerca.</p></div>}</section></div>
    </div>}
  </div>;
}
