import React from "react";
import { euro } from "./OffertaCatalogo";
import { lottoProgress } from "./garaWorkflow";
import "./garaWorkspace.css";

export default function LottiOverview({ lotti, selected, onSelect, deadline }) {
  if (!lotti.length) return null;
  return <section className="gara-workspace gara-lotti" aria-label="Lotti della gara">
    <div className="gara-section-title"><div><h2>Lotti della gara</h2><p>Ogni lotto ha la propria risposta, i propri documenti e le proprie verifiche.</p>
      <p>Termine gara: <strong>{deadline ? deadline.slice(0, 10).split("-").reverse().join("/") : "Da definire nei dati gara"}</strong></p></div>
      {lotti.length > 1 && <button className="gara-button" aria-pressed={selected == null} onClick={() => onSelect(null)}>Riepilogo di tutti i lotti</button>}
    </div>
    <div className="gara-lotti-grid">{lotti.map((lotto, index) => {
      const progress = lottoProgress(lotto, deadline);
      return <button key={index} className={`gara-lotto-card ${selected === index ? "is-selected" : ""}`} aria-pressed={selected === index} onClick={() => onSelect(index)}>
        <div className="gara-lotto-heading"><strong>{lotto.nome}</strong><span>{selected === index ? "Lotto attivo" : "Apri lotto"}</span></div>
        <div className="gara-base" title={lotto.baseAstaFonte || "Documenti importati"}>Base d'asta: <strong>{Number(lotto.importoBase) > 0 ? euro(lotto.importoBase) : "Non rilevata"}</strong></div>
        <div className="gara-progress-label"><span>Documenti approvati</span><strong>{progress.approved}/{progress.total}</strong></div>
        <div className="gara-progress" role="progressbar" aria-label={`Documenti approvati ${lotto.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><span style={{ width: `${progress.percent}%` }} /></div>
        <div className="gara-lotto-alerts">
          <span>{progress.mandatoryMissing} obbligatori da completare</span>
          <span>{progress.requirementsPending} requisiti da verificare</span>
          {progress.overdue > 0 && <span className="gara-danger">{progress.overdue} documenti in ritardo</span>}
          {progress.requirementsFailed > 0 && <span className="gara-danger">{progress.requirementsFailed} requisiti non conformi</span>}
        </div>
      </button>;
    })}</div>
    {selected != null && lotti[selected]?.descrizione && <details className="gara-lotto-description"><summary>Oggetto di {lotti[selected].nome}</summary><p>{lotti[selected].descrizione}</p></details>}
  </section>;
}
