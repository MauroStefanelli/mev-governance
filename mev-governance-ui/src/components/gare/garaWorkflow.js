export const DOCUMENT_STATI = ["Da iniziare", "In lavorazione", "In revisione", "Approvato"];
export const REQUISITO_STATI = ["Da verificare", "Conforme", "Non conforme", "Non applicabile"];
const normalize = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
export function itemKey(item, index, items, type = "doc") {
  const text = type === "doc" ? `${item.nome || item.name}|${item.tipo || item.type || ""}` : requisitoTesto(item);
  const base = normalize(text);
  const same = items.slice(0, index).filter(other => normalize(type === "doc" ? `${other.nome || other.name}|${other.tipo || other.type || ""}` : requisitoTesto(other)) === base).length;
  return `${type}:${base}:${same}`;
}
export function requisitoTesto(item) {
  return typeof item === "string" ? item : item?.descrizione || item?.requisito || item?.titolo || item?.nome || item?.testo || "Requisito senza descrizione";
}
export function scaduto(date, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date || "")) return false;
  const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return date.slice(0, 10) < localDay;
}
export function scadenzaEffettiva(interna, gara) {
  if (!interna) return gara;
  if (!gara) return interna;
  return interna.slice(0, 10) < gara.slice(0, 10) ? interna : gara;
}
export function documentState(lotto, doc, index) {
  return lotto?.workflow?.documenti?.[itemKey(doc, index, lotto.documentiRichiesti || [])] || {};
}
export function lottoProgress(lotto, deadline, today) {
  const docs = lotto.documentiRichiesti || [];
  const requisiti = lotto.requisitiTecnici || [];
  const complete = (doc, i) => documentState(lotto, doc, i).stato === "Approvato" && !!doc._docAttachment;
  const approved = docs.filter(complete).length;
  const mandatory = docs.filter(d => d.obbligatorio !== false);
  const mandatoryMissing = docs.filter((d, i) => d.obbligatorio !== false && !complete(d, i)).length;
  const overdue = docs.filter((d, i) => !complete(d, i) && scaduto(scadenzaEffettiva(documentState(lotto, d, i).scadenza, deadline), today)).length;
  const states = requisiti.map((r, i) => lotto.workflow?.requisiti?.[itemKey(r, i, requisiti, "req")]?.stato || "Da verificare");
  return { total: docs.length, approved, mandatory: mandatory.length, mandatoryMissing, overdue,
    percent: docs.length ? Math.round(approved / docs.length * 100) : 0,
    requirementsPending: states.filter(s => s === "Da verificare").length,
    requirementsFailed: states.filter(s => s === "Non conforme").length,
    requirementsTotal: requisiti.length,
  };
}
export function updateLotto(gara, index, update) {
  if (index == null || !gara.capitolato?.lotti?.[index]) return gara;
  return { ...gara, capitolato: { ...gara.capitolato, lotti: gara.capitolato.lotti.map((lotto, i) => i === index ? update(lotto) : lotto) } };
}
export function updateAttachment(gara, lottoIndex, section, index, attachment) {
  const change = source => {
    if (section === "doc") {
      const docs = source.documentiRichiesti || [];
      const doc = docs[index];
      if (!doc) return source;
      const key = itemKey(doc, index, docs);
      return { ...source, documentiRichiesti: docs.map((d, i) => i === index ? { ...d, _docAttachment: attachment } : d),
        workflow: { ...source.workflow, documenti: { ...source.workflow?.documenti, [key]: {
          ...source.workflow?.documenti?.[key], stato: attachment ? "In revisione" : "Da iniziare",
        } } } };
    }
    const field = section === "tec" ? "tecnica" : "economica";
    return { ...source, proposte: { ...source.proposte, [field]: (source.proposte?.[field] || []).map((doc, i) => i === index ? { ...doc, _docAttachment: attachment } : doc) } };
  };
  return lottoIndex != null ? updateLotto(gara, lottoIndex, change) :
    { ...gara, capitolato: change(gara.capitolato || {}) };
}
