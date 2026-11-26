import React, { useState, useEffect, useCallback } from 'react';
import { euro } from '../utils';
import { resolveCatalogEntry, catalogUnitPrice } from './catalogReconciliation';
import { chosenQuantity } from './towModel';
import { exportOfferWorkbook, offerTemplateStatus, uploadOfferTemplate, downloadOfferTemplate, restoreOfferTemplate } from '../services/mevService';

export function offerWorkbookDetails(items, catalog) {
  return items.map(item => {
    const entry = resolveCatalogEntry(item, catalog);
    const price = catalogUnitPrice(item, catalog);
    if (!entry || price == null) throw new Error(`Voce ${item.id}: associazione o prezzo del contratto mancante.`);
    return { interventionId: String(item.interventionId || ''), component: item.detail?.componentApplication || '',
      technology: item.detail?.technology || '', unit: item.detail?.unitName || '', description: item.detail?.detailDescription || item.reason || '',
      catalogId: String(entry.id), ambit: entry.ambito || '', driver: entry.nome, type: item.type, complexity: item.complexity,
      quantity: Number(item.qty), unitPrice: price };
  });
}

export function offerTowQuantities(details, id, { lot, prices, percentages, multiplier = 1, tow = {} }) {
  const total = details.reduce((s, d) => s + d.quantity * d.unitPrice, 0);
  const subtotal = details.filter(d => d.interventionId === String(id)).reduce((s, d) => s + d.quantity * d.unitPrice, 0);
  const quantities = {};
  for (const n of [1, 3, 4]) {
    // Una quantita' scelta in Revisione («TOW previsti») sostituisce il calcolo dalla %: si ripartisce sugli interventi in proporzione al loro peso, come il TOW .2.
    const chosen = chosenQuantity(tow, `TOW0${lot}.${n}`);
    if (chosen != null) {
      if (chosen > 0 && total <= 0) throw new Error(`Impossibile ripartire TOW 0${lot}.${n} con totale catalogo nullo.`);
      quantities[n] = total > 0 ? chosen * subtotal / total : 0;
      continue;
    }
    const percent = percentages?.[n];
    if (percent == null || !Number.isFinite(Number(percent)) || Number(percent) < 0 || Number(percent) > 100)
      throw new Error(`Percentuale contrattuale TOW 0${lot}.${n} mancante o non valida: configurala in Offerta.`);
    const price = Number(prices[`TOW0${lot}.${n}`]);
    if (!(price > 0)) throw new Error(`Prezzo unitario TOW 0${lot}.${n} mancante nel contratto.`);
    quantities[n] = subtotal * multiplier * Number(percent) / 100 / price;
  }
  const manual = Number(tow[`TOW0${lot}.2`] || 0);
  if (manual && total <= 0) throw new Error('Impossibile ripartire TOW .2 con totale catalogo nullo.');
  quantities[2] = total > 0 ? manual * subtotal / total : 0;
  return quantities;
}

const when = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const save = (blob, name) => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
export const describeTemplate = model => `${model.FileName || model.fileName} · versione ${model.Version ?? model.version} · salvato${(model.UploadedByFullName || model.uploadedByFullName || model.UploadedBy || model.uploadedBy) ? ` da ${model.UploadedByFullName || model.uploadedByFullName || model.UploadedBy || model.uploadedBy}` : ''} il ${when(model.UploadedAt || model.uploadedAt)}`;

// Il modello Excel e' lo stesso per ogni iniziativa del lotto: si carica una volta (e si aggiorna quando Poste lo cambia), poi ogni esportazione parte da quello.
export default function OfferWorkbookExport({ initiative, items, interventions, catalog, lot, prices, priceError, discount, contingency, percentages, multiplier, tow, canManage = false }) {
  const [saved, setSaved] = useState({ loading: true, current: null, previous: [], error: '' });
  const [template, setTemplate] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const status = await offerTemplateStatus(lot); setSaved({ loading: false, current: status.current || null, previous: status.previous || [], error: '' }); }
    catch (e) { setSaved({ loading: false, current: null, previous: [], error: e.message }); }
  }, [lot]);
  useEffect(() => { load(); }, [load]);
  const ids = [...new Set(items.map(it => String(it.interventionId || '')))];
  const rows = ids.map(id => interventions.find(i => String(i.id) === id) || { id, titolo: items.find(it => String(it.interventionId || '') === id)?.interventionTitle || initiative.title });
  const manage = async (action, done) => { setError(''); setNotice(''); setBusy(true); try { const result = await action(); await load(); setNotice(result?.unchanged ? 'Questo file è identico al modello in uso: non è stata creata una nuova versione.' : done(result)); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const upload = event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) manage(() => uploadOfferTemplate(file, lot), result => `Modello salvato: versione ${result.current.Version}. D’ora in poi ogni esportazione del lotto ${lot} parte da questo file.`); };
  const restore = version => manage(() => restoreOfferTemplate(lot, version), result => `La versione ${version} è di nuovo in uso (salvata come versione ${result.current.Version}).`);
  const download = async version => { setError(''); try { save(await downloadOfferTemplate(lot, version), saved.current?.FileName || `Modello Tabella Offerta lotto ${lot}.xlsx`); } catch (e) { setError(e.message); } };
  const ready = !!saved.current || !!template;
  const generate = async () => {
    setError(''); setNotice(''); setBusy(true);
    try {
      if (priceError) throw new Error(priceError);
      if (discount || contingency) throw new Error('Il template non contiene campi sconto/contingency: azzerali o concorda un modello che li rappresenti prima di esportare.');
      if (Number(tow?.[`TOW0${lot}.6`] || 0)) throw new Error('Il modello contiene solo TOW .1–.5 e non può rappresentare la TOW .6 valorizzata.');
      const details = offerWorkbookDetails(items, catalog);
      const payload = { code: initiative.code, title: initiative.title, lot, details, towPrices: prices,
        interventions: rows.map(i => {
           const q = offerTowQuantities(details, i.id, { lot, prices, percentages, multiplier, tow });
          return { id: String(i.id), title: i.titolo || '', description: i.descrizione || '', activity: i.attivita || '', system: i.sistema || initiative.system || '', requirements: i.requisiti || initiative.requirements || '', phase: i.fase || '', notes: i.note || '', tow1: Number(q[1]), tow2: Number(q[2]), tow3: Number(q[3]), tow4: Number(q[4]) };
        }) };
      const blob = await exportOfferWorkbook(template, payload);
      save(blob, `Tabella Offerta - ${initiative.code}.xlsx`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const current = saved.current;
  return <section className="initiative-workspace" aria-label="Generazione Tabella di offerta">
    <h3>Tabella di offerta · Excel HLD</h3>
    <p>Il modello Excel è lo stesso per ogni iniziativa del lotto {lot}: si carica una volta e ogni Tabella di offerta parte da quello. I dati dell’esempio saranno sostituiti; listino e prezzi di dettaglio provengono dal catalogo selezionato. TOW .5 sarà collegata al dettaglio tramite formula.</p>
    <div className="offer-template" aria-label="Modello Excel del lotto">
      <strong>Modello Excel del lotto {lot}</strong>
      {saved.loading && <p>Controllo il modello salvato…</p>}
      {!saved.loading && saved.error && <p role="alert">Modello non disponibile: {saved.error}</p>}
      {!saved.loading && !saved.error && (current
        ? <p className="offer-template-current">{describeTemplate(current)}</p>
        : <p className="offer-template-current">Nessun modello salvato per questo lotto.{canManage ? ' Caricalo qui sotto: serve una volta sola.' : ' Chiedi a un Admin o a uno sviluppatore di caricarlo, oppure scegli un file solo per questa esportazione.'}</p>)}
      {canManage && <label className="offer-template-upload">{current ? 'Aggiorna il modello (nuova versione)' : 'Carica il modello originale'}<input type="file" accept=".xlsx" disabled={busy} onChange={upload} /></label>}
      {current && <button type="button" disabled={busy} onClick={() => download()}>Scarica il modello</button>}
      {saved.previous.length > 0 && <details><summary>Versioni precedenti ({saved.previous.length})</summary>
        {saved.previous.map(model => <p key={model.Version}>{describeTemplate(model)}
          <button type="button" disabled={busy} onClick={() => download(model.Version)}>Scarica</button>
          {canManage && <button type="button" disabled={busy} onClick={() => restore(model.Version)}>Rimetti in uso</button>}</p>)}</details>}
      <details><summary>Usa un file diverso solo per questa esportazione</summary>
        <label>File Excel (non viene salvato)<input type="file" accept=".xlsx" onChange={e => setTemplate(e.target.files?.[0] || null)} /></label>
        {template && <p>Per questa esportazione userò «{template.name}» al posto del modello salvato.</p>}</details>
    </div>
    {notice && <p role="status">{notice}</p>}
    <p>TOW .1, .3 e .4 sono calcolate dal valore di catalogo di ogni intervento, con moltiplicatore e percentuali della stima contrattuale. Le quantità equivalenti derivano dall’importo diviso per il prezzo unitario. TOW .2 usa la quantità già inserita in Offerta.</p>
    <div>{[1, 3, 4].map(n => <span key={n} className="workspace-version" style={{ display: 'inline-block', margin: 4 }}>TOW 0{lot}.{n}: {percentages?.[n] ?? 'non configurata'}%</span>)}</div>
    <div>{[1, 2, 3, 4].map(n => <span key={n} className="workspace-version" style={{ display: 'inline-block', margin: 4 }}>Prezzo TOW 0{lot}.{n}: {prices[`TOW0${lot}.${n}`] > 0 ? euro.format(prices[`TOW0${lot}.${n}`]) : 'non disponibile'}</span>)}</div>
    {priceError && <p role="alert">{priceError}</p>}
    {[1, 3, 4].some(n => !(prices[`TOW0${lot}.${n}`] > 0)) && <p>Le percentuali di impatto non sono prezzi unitari. Verifica il listino TOW del lotto in Archivio Contrattuale e il Tipo contratto nei dati iniziativa. Il listino dell’esempio Excel non viene utilizzato.</p>}
    {rows.map(i => <p key={i.id}><strong>{i.id}</strong> · {i.titolo}</p>)}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={!ready || !items.length || !initiative.code || busy} onClick={generate}>{busy ? 'Generazione…' : 'Genera Tabella di offerta XLSX'}</button>
  </section>;
}
