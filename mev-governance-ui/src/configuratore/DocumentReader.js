import React, { useState } from 'react';

export default function DocumentReader({ document, extraction, selected, onSelect, canEdit }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const passages = extraction.passages;
  const matches = passages.map((passage, index) => ({ passage, index })).filter(({ passage }) =>
    `${passage.location} ${passage.text}`.toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1, Math.ceil(matches.length / 12));
  const current = Math.min(page, pages - 1);
  const visible = matches.slice(current * 12, (current + 1) * 12);
  const count = selected.reduce((sum, index) => sum + (passages[index]?.text.length || 0), 0);
  const selectedSet = new Set(selected);
  const toggle = index => onSelect(selectedSet.has(index) ? selected.filter(i => i !== index) : [...selected, index]);
  return <section className="document-reader" aria-label={`Testo letto: ${document.fileName}`}>
    <header><div><h4>Contenuto letto</h4><p>{passages.length} sezioni · {passages.reduce((sum, p) => sum + p.text.length, 0).toLocaleString('it-IT')} caratteri estratti</p></div>
      <span className="workspace-version">{selected.length} selezionate · {count.toLocaleString('it-IT')} caratteri</span></header>
    <p role="status" className={`document-status document-status-${extraction.status}`}>{extraction.message}</p>
    <div className="document-reader-toolbar">
      <label>Cerca nel contenuto<input type="search" placeholder="Cerca una parola, una pagina o un requisito…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label>
      {canEdit && <div><button type="button" disabled={!visible.length} onClick={() => onSelect([...new Set([...selected, ...visible.map(p => p.index)])])}>Seleziona sezioni visibili</button>
      <button type="button" disabled={!selected.length} onClick={() => onSelect([])}>Deseleziona tutte</button></div>}
    </div>
    <nav className="document-reader-navigation" aria-label={`Navigazione testo ${document.fileName}`}>
      <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Precedenti</button>
      <span>{matches.length} sezioni trovate · gruppo {current + 1} di {pages}</span>
      <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Successive</button>
    </nav>
    {!visible.length && <p>Nessuna sezione corrisponde alla ricerca.</p>}
    <div className="document-reader-content">{visible.map(({ passage, index }) => <section key={index} className={`document-passage${selectedSet.has(index) ? ' is-selected' : ''}`}>
      <header><label><input type="checkbox" disabled={!canEdit} aria-label={`Includi ${passage.location}`} checked={selectedSet.has(index)} onChange={() => toggle(index)} />{passage.location}</label><span>{passage.text.length.toLocaleString('it-IT')} caratteri</span></header>
      <div className="document-passage-text">{passage.text}</div>
    </section>)}</div>
    <p className="document-reader-note">La ricerca riguarda il testo estratto, non immagini o parti non lette. La selezione diventa contesto AI solo dopo “Usa sezioni selezionate” e viene conservata salvando una revisione.</p>
  </section>;
}
