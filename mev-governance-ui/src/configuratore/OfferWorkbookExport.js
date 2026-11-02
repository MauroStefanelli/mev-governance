import React, { useState } from 'react';
import { resolveCatalogEntry, catalogUnitPrice } from './catalogReconciliation';
import { exportOfferWorkbook } from '../services/mevService';

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

export default function OfferWorkbookExport({ initiative, items, interventions, catalog, lot, prices, discount, contingency, percentages, multiplier, tow }) {
  const [template, setTemplate] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = [...new Set(items.map(it => String(it.interventionId || '')))];
  const rows = ids.map(id => interventions.find(i => String(i.id) === id) || { id, titolo: items.find(it => String(it.interventionId || '') === id)?.interventionTitle || initiative.title });
  const generate = async () => {
    setError(''); setBusy(true);
    try {
      if (discount || contingency) throw new Error('Il template non contiene campi sconto/contingency: azzerali o concorda un modello che li rappresenti prima di esportare.');
      if (Number(tow?.[`TOW0${lot}.6`] || 0)) throw new Error('Il modello contiene solo TOW .1–.5 e non può rappresentare la TOW .6 valorizzata.');
      const details = offerWorkbookDetails(items, catalog);
      const payload = { code: initiative.code, title: initiative.title, lot, details, towPrices: prices,
        interventions: rows.map(i => {
           const q = offerTowQuantities(details, i.id, { lot, prices, percentages, multiplier, tow });
          return { id: String(i.id), title: i.titolo || '', description: i.descrizione || '', activity: i.attivita || '', system: i.sistema || initiative.system || '', requirements: i.requisiti || initiative.requirements || '', phase: i.fase || '', notes: i.note || '', tow1: Number(q[1]), tow2: Number(q[2]), tow3: Number(q[3]), tow4: Number(q[4]) };
        }) };
      const blob = await exportOfferWorkbook(template, payload);
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `Tabella Offerta - ${initiative.code}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="initiative-workspace" aria-label="Generazione Tabella di offerta">
    <h3>Tabella di offerta · Excel HLD</h3>
    <p>Seleziona il modello originale con i due fogli. I dati dell’esempio saranno sostituiti; listino e prezzi di dettaglio provengono dal catalogo selezionato. TOW .5 sarà collegata al dettaglio tramite formula.</p>
    <label>Modello Excel originale<input type="file" accept=".xlsx" onChange={e => setTemplate(e.target.files?.[0] || null)} /></label>
    <p>TOW .1, .3 e .4 sono calcolate dal valore di catalogo di ogni intervento, con moltiplicatore e percentuali della stima contrattuale. Le quantità equivalenti derivano dall’importo diviso per il prezzo unitario. TOW .2 usa la quantità già inserita in Offerta, ripartita in proporzione al valore di catalogo.</p>
    <div>{[1, 3, 4].map(n => <span key={n} className="workspace-version" style={{ display: 'inline-block', margin: 4 }}>TOW 0{lot}.{n}: {percentages?.[n] ?? 'non configurata'}%</span>)}</div>
    {rows.map(i => <p key={i.id}><strong>{i.id}</strong> · {i.titolo}</p>)}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={!template || !items.length || !initiative.code || busy} onClick={generate}>{busy ? 'Generazione…' : 'Genera Tabella di offerta XLSX'}</button>
  </section>;
}
