// Mandataria / Mandante di una riga MEV.
//
// Nel file Excel storico le colonne Capgemini e IET contengono una «x» (= la societa' partecipa). L'app la traduce nel nome della societa' leggendo la tabella
// «RTI & SUBCO». Prima la «x» di IET si cercava nella riga numero 2 di quella tabella, e la «x» di Capgemini nella riga numero 1: ma i numeri delle righe dipendono da come
// la tabella e' stata compilata. In produzione la riga 2 e' Levia HUB (una SUBCO) e IET e' la riga 3: ogni «x» di IET faceva comparire Levia HUB tra le Mandanti.
// Qui si cerca per RUOLO e per NOME, che non cambiano con l'ordine delle righe.

export const parseSocieta = (value) => {
  if (!value) return [];
  try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed; } catch { /* non e' un elenco: e' un nome solo */ }
  return value ? [value] : [];
};

const norm = (text) => String(text ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const idOf = (row) => row?._id ?? row?.id;

// La societa' che una «x» rappresenta nella colonna indicata: la Mandataria per Capgemini, la societa' IET (di ruolo Mandante) per IET.
// Se la tabella RTI non ha quella riga, si usa un nome di riserva; mai una riga di un altro ruolo.
export function companyForMark(column, rtiRows = []) {
  const rows = Array.isArray(rtiRows) ? rtiRows : [];
  if (column === 'iet') {
    const iet = rows.find(row => row?.ruolo === 'Mandante' && /^(iet|i t)$/.test(norm(row.societa))) || rows.find(row => row?.ruolo === 'Mandante');
    return iet?.societa || 'IET';
  }
  const holding = rows.find(row => row?.ruolo === 'Mandataria');
  return holding?.societa || 'Capgemini Italia S.p.A.';
}

// Le societa' di Mandataria/Mandante di una riga, unendo la colonna Capgemini e la colonna IET senza duplicati.
export function resolveMandataryAndPartners(capgemini, iet, rtiRows = []) {
  const fromColumn = (value, column) => {
    if (!value) return [];
    return String(value).trim().toLowerCase() === 'x' ? [companyForMark(column, rtiRows)] : parseSocieta(value);
  };
  const combined = [...fromColumn(capgemini, 'capgemini')];
  fromColumn(iet, 'iet').forEach(name => { if (!combined.some(existing => norm(existing) === norm(name))) combined.push(name); });
  return combined;
}

export { idOf };
