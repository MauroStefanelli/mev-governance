import React from "react";
import { DOCUMENT_STATI, REQUISITO_STATI, itemKey, requisitoTesto, scaduto, lottoProgress, scadenzaEffettiva } from "./garaWorkflow";
import "./garaWorkspace.css";

export default function LottoWorkspace({ lotto, deadline, mode = "documenti", onChange, onAttach, onRemove }) {
  const [filter, setFilter] = React.useState("Tutti");
  const [search, setSearch] = React.useState("");
  const refs = React.useRef({});
  if (!lotto) return <p className="gara-empty">Seleziona un lotto per lavorare sulla sua risposta.</p>;
  const docs = lotto.documentiRichiesti || [];
  const requirements = lotto.requisitiTecnici || [];
  const workflow = lotto.workflow || {};
  const change = (group, key, patch) => onChange({ ...workflow, [group]: { ...workflow[group], [key]: { ...workflow[group]?.[key], ...patch } } });
  const stats = lottoProgress(lotto, deadline);
  if (mode === "requisiti") return <div className="gara-workspace">
    <div className="gara-section-title"><div><h3>Verifica dei requisiti · {lotto.nome}</h3><p>Registra l'esito della verifica e il riferimento che lo dimostra.</p></div><span className="gara-tag">{stats.requirementsPending} da verificare</span></div>
    {!requirements.length && <p className="gara-empty">Nessun requisito tecnico estratto per questo lotto. Verifica il capitolato importato.</p>}
    {requirements.map((r, i) => {
      const key = itemKey(r, i, requirements, "req");
      const state = workflow.requisiti?.[key] || {};
      const label = requisitoTesto(r);
      return <article key={key} className="gara-document-card"><strong>{label}</strong>
        <div className="gara-document-fields">
          <label>Esito<select aria-label={`Esito ${label}`} value={state.stato || "Da verificare"} onChange={e => change("requisiti", key, { stato: e.target.value })}>{REQUISITO_STATI.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="gara-field-wide">Evidenza o riferimento<input aria-label={`Evidenza ${label}`} placeholder="Documento, sezione o motivazione" defaultValue={state.evidenza || ""} onBlur={e => { if (e.target.value !== (state.evidenza || "")) change("requisiti", key, { evidenza: e.target.value }); }} /></label>
        </div>
      </article>;
    })}
  </div>;
  const visible = docs.map((doc, i) => ({ doc, i, key: itemKey(doc, i, docs) })).filter(({ doc, key }) => {
    const state = workflow.documenti?.[key] || {};
    const approved = state.stato === "Approvato" && !!doc._docAttachment;
    return `${doc.nome || doc.name} ${doc.tipo || ""}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "Tutti" || filter === "Da completare" && !approved || filter === "Obbligatori" && doc.obbligatorio !== false || filter === "In ritardo" && !approved && scaduto(scadenzaEffettiva(state.scadenza, deadline)));
  });
  return <div className="gara-workspace">
    <div className="gara-section-title"><div><h3>Documenti da produrre · {lotto.nome}</h3><p>{stats.approved} approvati su {stats.total}. Un allegato resta da revisionare finché non viene approvato.</p></div></div>
    <div className="gara-document-toolbar"><input type="search" aria-label="Cerca documento" placeholder="Cerca un documento…" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Filtra documenti" value={filter} onChange={e => setFilter(e.target.value)}>{["Tutti", "Da completare", "Obbligatori", "In ritardo"].map(f => <option key={f}>{f}</option>)}</select>
    </div>
    {!docs.length && <p className="gara-empty">Nessun documento richiesto estratto per questo lotto. Verifica il capitolato prima di preparare la risposta.</p>}
    {docs.length > 0 && !visible.length && <p className="gara-empty">Nessun documento corrisponde ai filtri.</p>}
    {visible.map(({ doc, i, key }) => {
      const state = workflow.documenti?.[key] || {};
      const name = doc.nome || doc.name || "Documento";
      const due = scadenzaEffettiva(state.scadenza, deadline);
      const late = scaduto(due) && !(state.stato === "Approvato" && doc._docAttachment);
      return <article key={key} className={`gara-document-card ${late ? "is-late" : ""}`}>
        <div className="gara-document-heading"><div><strong>{name}</strong><p>{doc.tipo || "Documento di risposta"}</p></div><span className="gara-tag">{doc.obbligatorio !== false ? "Obbligatorio" : "Facoltativo"}</span>{late && <span className="gara-tag gara-danger">In ritardo</span>}</div>
        <div className="gara-document-fields">
          <label>Responsabile<input aria-label={`Responsabile ${name}`} placeholder="Da assegnare" defaultValue={state.responsabile || ""} onBlur={e => { if (e.target.value !== (state.responsabile || "")) change("documenti", key, { responsabile: e.target.value }); }} /></label>
          <label>Stato<select aria-label={`Stato ${name}`} value={state.stato || "Da iniziare"} onChange={e => change("documenti", key, { stato: e.target.value })}>{DOCUMENT_STATI.map(s => <option key={s} disabled={s === "Approvato" && !doc._docAttachment}>{s}</option>)}</select></label>
          <label>Scadenza interna<input type="date" aria-label={`Scadenza ${name}`} value={state.scadenza || ""} max={deadline?.slice(0, 10) || undefined} onChange={e => change("documenti", key, { scadenza: e.target.value })} />{!state.scadenza && deadline && <small>Termine gara: {deadline.slice(0, 10).split("-").reverse().join("/")}</small>}{state.scadenza && deadline && state.scadenza > deadline.slice(0, 10) && <small className="gara-danger">La scadenza interna supera il termine della gara.</small>}</label>
        </div>
        {(doc.dettagli || doc.allegatiRiferimento?.length > 0) && <details><summary>Istruzioni e riferimenti</summary>{doc.dettagli && <p className="gara-instructions">{doc.dettagli}</p>}{doc.allegatiRiferimento?.map((reference, index) => <span key={index} className="gara-tag">{typeof reference === "string" ? reference : reference.nome || reference.titolo || "Riferimento"}</span>)}</details>}
        <div className="gara-document-file">
          <input type="file" aria-label={`Allega ${name}`} ref={el => { refs.current[key] = el; }} style={{ display: "none" }} onChange={e => { const file = e.target.files[0]; if (file) onAttach(i, file); e.target.value = ""; }} />
          {doc._docAttachment ? <><span>{doc._docAttachment.name}</span>{doc._docAttachment.dataUrl && <a className="gara-button" href={doc._docAttachment.dataUrl} download={doc._docAttachment.name}>Scarica</a>}<button className="gara-button" onClick={() => onRemove(i)}>Rimuovi allegato</button></> : <><span>Nessun documento prodotto allegato</span><button className="gara-button" onClick={() => refs.current[key]?.click()}>Allega documento</button></>}
        </div>
      </article>;
    })}
  </div>;
}
