import React, { useMemo, useState } from 'react';
import { proposeInterventions } from '../services/mevService';
import { validComplexities } from './configuratoreCore';
import { criteriaOf } from './catalogCriteria';
import { fmtItIT } from '../utils';
import { STATUS, TYPES, MAX_QTY, MAX_PROPOSED, proposalsFromAi, confirm, discard, restore, withText, withMapping, addMapping, removeMapping, canConfirm, counts } from './proposedInterventions';

const entryOf = (catalog, id) => (catalog || []).find(entry => Number(entry.id) === Number(id));

// Only numbers the catalogue really has: the server refuses a body it cannot read, and a price that is not a number is not a price.
const catalogForServer = catalog => (catalog || []).filter(entry => Number.isFinite(Number(entry.id)) && String(entry.nome || '').trim()).map(entry => ({
  id: Number(entry.id), nome: String(entry.nome), ambito: String(entry.ambito || ''), descrizione: String(entry.descrizione || '').slice(0, 700),
  criteri: criteriaOf(entry) || undefined,
  prezzi: Object.fromEntries(Object.entries(entry.prezzi || {}).map(([type, byComplexity]) => [type, Object.fromEntries(Object.entries(byComplexity || {}).filter(([, price]) => Number(price) > 0).map(([complexity, price]) => [complexity, Number(price)]))])),
}));

// The interventions of an initiative that has no Offer Table (or that needs more than the table has): the AI proposes them from the confirmed rationale and the chosen applications, each tied to rows of the
// catalogue of Poste; the team reads, changes and confirms one by one. Only the confirmed ones become interventions of the solution. Nothing here is applied without a person.
export default function InterventionProposalsPanel({ initiative, lot, catalog = [], applications = [], knowledge = [], proposed = [], importedTitles = [], onChange, canEdit = true }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [missing, setMissing] = useState([]);
  const [focus, setFocus] = useState('');
  const [openRationale, setOpenRationale] = useState(null);
  const [problems, setProblems] = useState({});
  const [showDiscarded, setShowDiscarded] = useState(false);
  const confirmedKnowledge = useMemo(() => (knowledge || []).filter(entry => entry.status === 'confermata'), [knowledge]);
  const number = counts(proposed);
  const open = proposed.filter(item => item.status === STATUS.PROPOSED);
  const discarded = proposed.filter(item => item.status === STATUS.DISCARDED);
  const lacksRationale = confirmedKnowledge.length === 0;
  const lacksCatalog = !catalog.length;
  const full = number.total >= MAX_PROPOSED;
  const update = (id, change) => onChange(proposed.map(item => (item.id === id ? change(item) : item)));
  const setProblem = (id, text) => setProblems(previous => ({ ...previous, [id]: text }));

  const generate = async () => {
    setBusy(true); setError(''); setNotice(''); setMissing([]);
    try {
      const answer = await proposeInterventions({
        goto: initiative.code || initiative.title, title: initiative.title || '', system: initiative.system || '', description: initiative.description || '', lot: String(lot ?? ''),
        catalog: catalogForServer(catalog), applications, focus: focus.trim(), existingTitles: [...proposed.filter(item => item.status !== STATUS.DISCARDED).map(item => item.title), ...importedTitles].filter(Boolean),
      });
      const { accepted, rejected } = proposalsFromAi(answer, catalog, proposed);
      if (accepted.length) onChange([...proposed, ...accepted]);
      setMissing(answer.missing || []);
      const parts = [accepted.length ? `${accepted.length} ${accepted.length === 1 ? 'intervento proposto' : 'interventi proposti'}: controllali e conferma quelli giusti.` : 'Nessun nuovo intervento proposto.',
        ...(answer.notes || []), ...(rejected.length ? [`Scartati ${rejected.length}: ${rejected.slice(0, 3).map(item => `«${item.title}» (${item.reason})`).join('; ')}${rejected.length > 3 ? '…' : ''}.`] : [])];
      setNotice(parts.join(' '));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const changeMapping = (item, index, patch) => { const result = withMapping(item, index, patch, catalog); setProblem(item.id, result.problem || ''); if (!result.problem) update(item.id, () => result.item); };
  const addRow = (item, id) => { const entry = entryOf(catalog, id); if (!entry) return; const result = addMapping(item, entry, catalog); setProblem(item.id, result.problem || ''); if (!result.problem) update(item.id, () => result.item); };

  return <section className="sol-proposed" aria-label="Interventi proposti dall’AI">
    <div className="sol-proposed-head">
      <div><h4>Interventi proposti dall’AI <small>{number.confirmed} confermati · {number.proposed} da confermare{number.discarded ? ` · ${number.discarded} scartati` : ''}</small></h4>
        <p>Parte dai razionali e dai vincoli che il team ha <b>confermato</b> e dall’applicativo scelto. L’AI propone gli interventi e li collega alle voci del catalogo interventi di Poste; <b>tu li rivedi e li confermi uno per uno</b>. Solo quelli confermati entrano nella soluzione e nel file per Visual Studio Code. Non serve la Tabella di Offerta.</p></div>
    </div>
    {canEdit && <div className="sol-proposed-ask">
      <label>Su cosa concentrarsi <small>(facoltativo: un punto, un componente, una parte dell’iniziativa)</small>
        <input value={focus} maxLength={300} placeholder="es. solo la stampa delle LDV H7" onChange={event => setFocus(event.target.value)} disabled={busy} /></label>
      <button type="button" className="sol-primary" onClick={generate} disabled={busy || lacksRationale || lacksCatalog || full}>{busy ? 'L’AI sta proponendo gli interventi…' : open.length || number.confirmed ? 'Proponi altri interventi con l’AI' : 'Proponi gli interventi con l’AI'}</button>
    </div>}
    {canEdit && lacksRationale && <p className="sol-hint" role="status">Per proporre gli interventi serve almeno una voce <b>confermata</b> in «Razionali e vincoli con l’AI»: senza, l’AI non ha da cosa partire.</p>}
    {canEdit && !lacksRationale && lacksCatalog && <p className="sol-hint" role="status">Il catalogo interventi del lotto non è disponibile: scegli il contratto e il lotto nel passo «Offerta», poi riprova.</p>}
    {full && <p className="sol-hint" role="status">Hai raggiunto il limite di {MAX_PROPOSED} interventi proposti: conferma o scarta quelli che hai.</p>}
    {error && <p className="sol-error" role="alert">{error}</p>}
    {notice && <p className="sol-notice" role="status">{notice}</p>}
    {missing.length > 0 && <div className="sol-hint" role="status"><b>L’AI dice che manca:</b><ul>{missing.map(text => <li key={text}>{text}</li>)}</ul></div>}

    {open.map(item => { const cannot = !canConfirm(item); const based = confirmedKnowledge.filter(entry => item.rationaleIds.includes(entry.id));
      return <article key={item.id} className="sol-prop" aria-label={`Intervento proposto ${item.id}`}>
        <header><span className="sol-id">{item.id}</span><span className="sol-flag">Da confermare</span><span className="sol-prop-note">proposto dall’AI · ipotesi di lavoro, non verificata sul codice</span></header>
        <label>Titolo<input value={item.title} maxLength={160} disabled={!canEdit} onChange={event => update(item.id, current => withText(current, 'title', event.target.value))} /></label>
        <label>Descrizione<textarea rows={3} value={item.description} maxLength={1200} disabled={!canEdit} onChange={event => update(item.id, current => withText(current, 'description', event.target.value))} /></label>
        <label>Attività<textarea rows={2} value={item.activity} maxLength={1200} disabled={!canEdit} onChange={event => update(item.id, current => withText(current, 'activity', event.target.value))} /></label>
        {item.components.length > 0 && <p className="sol-prop-components"><b>Componenti da guardare</b> <small>(dai nomi dei componenti dell’applicativo, non verificati)</small><br />{item.components.map(component => <code key={component}>{component}</code>)}</p>}
        {based.length > 0 && <div className="sol-prop-based"><button type="button" aria-expanded={openRationale === item.id} onClick={() => setOpenRationale(openRationale === item.id ? null : item.id)}>Si basa su {based.length} {based.length === 1 ? 'voce confermata' : 'voci confermate'}</button>
          {openRationale === item.id && <ul>{based.map(entry => <li key={entry.id}><i>{entry.kind}</i> {entry.text}</li>)}</ul>}</div>}
        <div className="sol-table-wrap" role="region" aria-label={`Voci di catalogo dell’intervento ${item.id}`} tabIndex={0}>
          {item.mappings.length ? <table><thead><tr><th>Voce di catalogo</th><th>Tipo</th><th>Complessità</th><th>Q.tà</th><th>Importo</th><th>Componente</th><th /></tr></thead>
            <tbody>{item.mappings.map((mapping, index) => { const entry = entryOf(catalog, mapping.catalogId); const complexities = entry ? validComplexities(entry, mapping.type) : [mapping.complexity]; const types = entry ? TYPES.filter(type => validComplexities(entry, type).length) : [mapping.type];
              return <tr key={`${mapping.catalogId}-${mapping.type}`}><td>{mapping.name}<small className="sol-prop-ambit"> · {mapping.ambit || 'catalogo'} · id {mapping.catalogId}</small>{mapping.why && <small className="sol-prop-why">{mapping.why}</small>}{mapping.correction && <small className="sol-prop-warn">Corretto: {mapping.correction}</small>}</td>
                <td><select aria-label={`Tipo, ${mapping.name}`} value={mapping.type} disabled={!canEdit} onChange={event => changeMapping(item, index, { type: event.target.value })}>{types.map(type => <option key={type} value={type}>{type}</option>)}</select></td>
                <td><select aria-label={`Complessità, ${mapping.name}`} value={mapping.complexity} disabled={!canEdit} onChange={event => changeMapping(item, index, { complexity: event.target.value })}>{complexities.map(complexity => <option key={complexity} value={complexity}>{complexity}</option>)}</select></td>
                <td><input type="number" min="1" max={MAX_QTY} aria-label={`Quantità, ${mapping.name}`} value={mapping.qty} disabled={!canEdit} onChange={event => changeMapping(item, index, { qty: event.target.value })} /></td>
                <td className="sol-prop-money">{mapping.unit == null ? '—' : `${fmtItIT(mapping.unit * mapping.qty, 2)} €`}<small>{mapping.unit == null ? '' : `${fmtItIT(mapping.unit, 2)} € × ${mapping.qty}`}</small></td>
                <td><input aria-label={`Componente, ${mapping.name}`} value={mapping.component} maxLength={120} disabled={!canEdit} onChange={event => changeMapping(item, index, { component: event.target.value })} /></td>
                <td>{canEdit && <button type="button" aria-label={`Togli la voce ${mapping.name}`} onClick={() => update(item.id, current => removeMapping(current, index))}>×</button>}</td></tr>; })}</tbody></table>
            : <p className="sol-prop-warn">Nessuna voce di catalogo valida: senza almeno una voce l’intervento non si può confermare. Aggiungine una dall’elenco qui sotto.</p>}
        </div>
        {canEdit && <label className="sol-prop-add">Aggiungi una voce del catalogo
          <select value="" aria-label={`Aggiungi voce di catalogo a ${item.id}`} onChange={event => { if (event.target.value) addRow(item, event.target.value); }}><option value="">Scegli dal catalogo di Poste…</option>
            {catalog.filter(entry => !item.mappings.some(mapping => mapping.catalogId === Number(entry.id))).map(entry => <option key={entry.id} value={entry.id}>{entry.nome}{entry.ambito ? ` — ${entry.ambito}` : ''}</option>)}</select></label>}
        {item.rejectedMappings?.length > 0 && <details className="sol-prop-rejected"><summary>{item.rejectedMappings.length} {item.rejectedMappings.length === 1 ? 'voce proposta dall’AI non è entrata' : 'voci proposte dall’AI non sono entrate'}</summary><ul>{item.rejectedMappings.map(reason => <li key={reason}>{reason}</li>)}</ul></details>}
        {problems[item.id] && <p className="sol-error" role="alert">{problems[item.id]}</p>}
        {canEdit && <div className="sol-prop-actions">
          <button type="button" className="sol-primary" disabled={cannot} onClick={() => update(item.id, confirm)}>Conferma l’intervento</button>
          <button type="button" onClick={() => update(item.id, discard)}>Scarta</button>
          {cannot && <small>{item.mappings.length ? 'Serve un titolo.' : 'Serve almeno una voce di catalogo.'}</small>}</div>}
      </article>; })}

    {discarded.length > 0 && <div className="sol-prop-discarded"><button type="button" aria-expanded={showDiscarded} onClick={() => setShowDiscarded(value => !value)}>{showDiscarded ? 'Nascondi gli scartati' : 'Mostra gli scartati'} ({discarded.length})</button>
      {showDiscarded && <ul>{discarded.map(item => <li key={item.id}><span className="sol-id">{item.id}</span> {item.title} {canEdit && <button type="button" onClick={() => update(item.id, restore)}>Ripristina</button>}</li>)}</ul>}</div>}
  </section>;
}
