import React from "react";
import { numeroLotto } from "./lottoAmounts";

export const FASCE = ["Semplice", "Medio", "Complesso"];
export const euro = value => value == null ? "—" : Number(value).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const cell = { padding: "10px 8px", border: "1px solid #cbd5e1", verticalAlign: "top" };
const head = { ...cell, background: "#102a43", color: "white", textAlign: "center", whiteSpace: "nowrap" };

export function prezzoFascia(prezzi, fascia) {
  return prezzi?.find(p => p.fascia?.toLowerCase() === fascia.toLowerCase())?.valore ?? null;
}

export function calcolaPrezziModifica(row) {
  const medio = prezzoFascia(row.prezziOfferto, "Medio");
  const valido = medio != null && medio !== "" && Number.isFinite(Number(medio)) && Number(medio) >= 0;
  return FASCE.map((fascia, index) => {
    const percentuale = [10, 30, 50][index];
    return {
      ...row.prezziOffertoModifica?.find(p => p.fascia?.toLowerCase() === fascia.toLowerCase()),
      fascia,
      valore: valido ? Math.round((Number(medio) * percentuale / 100 + Number.EPSILON) * 100) / 100 : null,
      regola: `${percentuale}% del prezzo offerto Medio di Realizzazione`,
    };
  });
}

export function aggiornaCatalogoModifica(offerta) {
  if (!Array.isArray(offerta?.offertaCatalogo)) return offerta;
  return { ...offerta, offertaCatalogo: offerta.offertaCatalogo.map(row => ({
    ...row, prezziOffertoModifica: calcolaPrezziModifica(row),
  })) };
}

export default function OffertaCatalogo({ offertaLotti, lotti, onUpdate, gara, lottoSelezionato, onSelectLotto }) {
  const keys = Object.keys(offertaLotti);
  const [selected, setSelected] = React.useState(keys[0] || "1");
  const lotto = lottoSelezionato ?? (keys.includes(selected) ? selected : keys[0]);
  const offerta = offertaLotti[lotto];
  const rows = offerta?.offertaCatalogo || [];

  const change = (index, fascia, text) => {
    const value = text === "" ? null : Number(text);
    if (value != null && (!Number.isFinite(value) || value < 0)) return;
    const row = rows[index];
    const prezziOfferto = FASCE.map(f => ({
      ...row.prezziOfferto?.find(p => p.fascia?.toLowerCase() === f.toLowerCase()),
      fascia: f, valore: f === fascia ? value : prezzoFascia(row.prezziOfferto, f),
    }));
    const changed = { ...row, prezziOfferto };
    changed.prezziOffertoModifica = calcolaPrezziModifica(changed);
    onUpdate({ ...gara, offertaLotti: { ...offertaLotti, [lotto]: {
      ...offerta, offertaCatalogo: rows.map((r, i) => i === index ? changed : r),
    } } });
  };

  return <div style={{ background: "white", borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8f0" }}>
    <div style={{ background: "#1e3a8a", color: "white", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <strong>Offerta Catalogo</strong>
      <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>{keys.map(num => <button key={num} onClick={() => { setSelected(num); onSelectLotto?.(num); }}
        style={{ border: 0, borderRadius: 7, padding: "6px 14px", cursor: "pointer", background: lotto === num ? "white" : "#3b5998", color: lotto === num ? "#1e3a8a" : "white" }}>
        {lotti.find((l, i) => numeroLotto(l, i) === num)?.nome || `Lotto ${num}`}
      </button>)}</div>
    </div>
    {rows.length > 0 && <div style={{ padding: "10px 20px", fontSize: 12, color: "#475569", background: "#f8fafc" }}>
      I prezzi Modifica sono calcolati dal prezzo offerto Medio di Realizzazione: Semplice 10%, Medio 30%, Complesso 50%.
    </div>}
    {rows.length === 0 ? <div style={{ padding: 24 }}>Nessun dato catalogo per questo lotto. Carica l'Excel dal modale Modifica.</div> :
      <div style={{ overflowX: "auto" }}>
        <table aria-label="Offerta Catalogo per driver" style={{ width: "100%", minWidth: 1750, borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th rowSpan={2} style={head}>Nome Driver</th>
              <th rowSpan={2} style={head}>Descrizione Driver</th>
              {["Base d'asta REALIZZAZIONE", "Base d'asta MODIFICA", "Prezzo offerto REALIZZAZIONE", "Prezzo MODIFICA"].map(title =>
                <th key={title} colSpan={3} scope="colgroup" style={head}>{title}</th>)}
            </tr>
            <tr>{[0, 1, 2, 3].map(group => FASCE.map(f => <th key={`${group}-${f}`} scope="col" style={head}>{f}</th>))}</tr>
          </thead>
          <tbody>{rows.map((row, index) => <tr key={row.id || index}>
            <td style={{ ...cell, minWidth: 180 }}>{row.nome}</td>
            <td style={{ ...cell, minWidth: 350, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{row.descrizione || "—"}</td>
            {["Realizzazione", "Modifica"].map(tipo => FASCE.map(f => <td key={`${tipo}-${f}`} style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
              {euro(row[`prezzo${tipo}${f}`])}
            </td>))}
            {FASCE.map(f => <td key={`offerto-${f}`} style={{ ...cell, background: "#cffafe" }}>
              <input type="number" min="0" step="0.01" aria-label={`${row.nome} Realizzazione ${f}`} value={prezzoFascia(row.prezziOfferto, f) ?? ""}
                onChange={event => change(index, f, event.target.value)}
                style={{ width: 95, padding: 6, border: "1px solid #67e8f9", borderRadius: 4, textAlign: "right", background: "transparent" }} />
            </td>)}
            {calcolaPrezziModifica(row).map(p => <td key={`modifica-${p.fascia}`} aria-label={`${row.nome} Modifica ${p.fascia}`} title={p.regola}
              style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{euro(p.valore)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>}
  </div>;
}
