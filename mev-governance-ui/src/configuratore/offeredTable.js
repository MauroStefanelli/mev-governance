// La tabella «Voci di catalogo offerti»: le colonne nell'ordine richiesto e le regole di modifica, senza React cosi' si provano a parte.
export const BANDS = ['Semplice', 'Medio', 'Complesso'];
export const TYPES = ['REALIZZAZIONE', 'MODIFICA'];

// Ordine: ID, Ambito, Voce, Descrizione Driver, Descrizione Semplice/Medio/Complesso, Realizzazione S/M/C, Modifica S/M/C.
export const COLUMNS = [
  { key: 'id', label: 'ID', kind: 'fixed' },
  { key: 'ambito', label: 'Ambito', kind: 'fixed' },
  { key: 'nome', label: 'Voce', kind: 'fixed' },
  { key: 'descrizione', label: 'Descrizione Driver', kind: 'text' },
  ...BANDS.map(band => ({ key: `descrizioni.${band}`, label: `Descrizione ${band}`, kind: 'text', band })),
  ...TYPES.flatMap(type => BANDS.map(band => ({ key: `prezzi.${type}.${band}`, label: `${type === 'REALIZZAZIONE' ? 'Realizzazione' : 'Modifica'} ${band}`, kind: 'price', type, band }))),
];

const text = value => (value == null ? '' : String(value));
// Una riga come arriva dal server -> i valori che si modificano (testi e importi come testo, per scrivere liberamente «1.234,50»).
export function toEditable(row) {
  const out = { id: row.id, ambito: row.ambito || '', nome: row.nome || '', prezziGara: row.prezziGara || {}, descrizioneGara: row.descrizioneGara || '', covered: !!row.covered, descrizione: text(row.descrizione), descrizioni: {}, prezzi: { REALIZZAZIONE: {}, MODIFICA: {} } };
  for (const band of BANDS) out.descrizioni[band] = text(row.descrizioni?.[band]);
  for (const type of TYPES) for (const band of BANDS) out.prezzi[type][band] = row.prezzi?.[type]?.[band] == null ? '' : String(row.prezzi[type][band]);
  return out;
}
export const gara = (row, type, band) => {
  const value = row.prezziGara?.[type]?.[band];
  return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
};

// Cio' che si invia al server: id, prezzi e descrizioni. Nome e ambito NON si inviano (restano quelli di gara).
export function toPayload(editable) {
  return editable.map(row => ({ id: row.id, descrizione: row.descrizione, descrizioni: { ...row.descrizioni }, prezzi: Object.fromEntries(TYPES.map(type => [type, { ...row.prezzi[type] }])) }));
}
const snapshot = rows => JSON.stringify(rows.map(row => [row.id, row.descrizione, BANDS.map(b => row.descrizioni[b]), TYPES.map(t => BANDS.map(b => row.prezzi[t][b]))]));
export const isDirty = (original, current) => snapshot(original) !== snapshot(current);

// Una cella modificata rispetto all'originale (per evidenziarla).
export function changedCells(original, current) {
  const set = new Set();
  current.forEach((row, i) => {
    const before = original[i]; if (!before) return;
    if (row.descrizione !== before.descrizione) set.add(`${i}|descrizione`);
    for (const b of BANDS) if (row.descrizioni[b] !== before.descrizioni[b]) set.add(`${i}|descrizioni.${b}`);
    for (const t of TYPES) for (const b of BANDS) if (row.prezzi[t][b] !== before.prezzi[t][b]) set.add(`${i}|prezzi.${t}.${b}`);
  });
  return set;
}

// Controllo immediato di una cella-prezzo (lo stesso del server, cosi' l'errore si vede mentre si scrive). Restituisce {error} oppure {warning} oppure {}.
export function priceProblem(raw, base) {
  const value = String(raw ?? '').replace('€', '').replace(/\s| /g, '');
  if (value === '') return base > 0 ? { error: `manca il prezzo offerto (in gara è ${base})` } : {};
  let t = value;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const n = Number(t);
  if (!Number.isFinite(n) || !/^-?\d+(\.\d+)?$/.test(t)) return { error: 'non è un importo' };
  if (n < 0) return { error: 'l’importo è negativo' };
  if (base > 0 && n > base) return { warning: `supera la base d’asta (${base})` };
  if (n === 0 && base > 0) return { warning: `è 0 ma in gara è ${base}` };
  return {};
}
export function tableProblems(rows) {
  const errors = []; const warnings = [];
  rows.forEach(row => {
    for (const type of TYPES) for (const band of BANDS) {
      const base = gara(row, type, band);
      const p = priceProblem(row.prezzi[type][band], base);
      const where = `ID ${row.id} · ${type === 'REALIZZAZIONE' ? 'Realizzazione' : 'Modifica'} ${band}`;
      if (p.error) errors.push(`${where}: ${p.error}`); else if (p.warning) warnings.push(`${where}: ${p.warning}`);
    }
    for (const [label, value] of [['Descrizione Driver', row.descrizione], ...BANDS.map(b => [`Descrizione ${b}`, row.descrizioni[b]])]) if (value.length > 2000) errors.push(`ID ${row.id} · ${label}: supera 2000 caratteri`);
  });
  return { errors, warnings };
}
