// Quali righe la «Verifica AI» deve (ri)fare. Oggi, premendo di nuovo il pulsante, si rifacevano TUTTE le righe: anche quelle gia' verificate bene, con chiamate AI
// e minuti sprecati. Qui si decide riga per riga: una riga e' «a posto» solo se ha un giudizio valido E i suoi dati non sono cambiati dopo la verifica.
//
// `inputs` = le righe da verificare, come le produce detailReviewInput (hanno rowId e il contenuto su cui si giudica); `reviews` = i giudizi gia' salvati;
// `signatureOf` = come si calcola la firma di una riga (detailReviewSignature): se la firma salvata non coincide, i dati sono cambiati e la riga va rifatta.
export const VALID_STATUS = ['coerente', 'da_verificare', 'non_coerente'];

export function reviewIsCurrent(review, input, signatureOf) {
  if (!review || !VALID_STATUS.includes(review.status)) return false;       // nessun giudizio, oppure «error»: va rifatta
  if (typeof review.reason !== 'string' || !review.reason.trim()) return false;
  return review.signature === signatureOf(input);                            // dati cambiati dopo la verifica: va rifatta
}

// `force` = «verifica tutto da capo» (rifa' anche le righe a posto).
export function planReview(inputs, reviews, signatureOf, { force = false } = {}) {
  const all = inputs || [];
  const done = force ? [] : all.filter(input => reviewIsCurrent(reviews?.[input.rowId], input, signatureOf));
  const doneIds = new Set(done.map(input => input.rowId));
  const todo = all.filter(input => !doneIds.has(input.rowId));
  return { total: all.length, alreadyDone: done.length, todo, resumed: done.length > 0 && todo.length > 0, nothingToDo: todo.length === 0 && all.length > 0 };
}

// Divide il lavoro in gruppi (5 righe alla volta: il limite del server).
export const chunk = (rows, size = 5) => { const out = []; for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size)); return out; };

// Un errore e' «passeggero» (vale la pena riprovare) o «definitivo» (inutile insistere: chiave AI sbagliata, accesso negato)? Nel dubbio si riprova una volta.
export function isRetryable(message) {
  const text = String(message || '').toLowerCase();
  if (/chiave|api key|non autorizzat|unauthorized|401|403|forbidden|permess/.test(text)) return false;
  return true;
}

// Il motivo dell'interruzione in parole comprensibili, con cosa fare. Il testo originale dell'errore resta visibile sotto: non lo si nasconde.
export function explainFailure(message) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  if (/hai interrotto/.test(lower)) return { cause: 'Hai premuto «Interrompi la verifica».', advice: 'Le righe già verificate sono salvate: «Riprendi» continua dalle altre.', retry: true };
  if (/chiave|api key|unauthorized|401|403|forbidden/.test(lower)) return { cause: 'L’AI ha rifiutato l’accesso: la chiave AI personale non è configurata o non è valida.', advice: 'Controlla in Profilo utente → «API Key AI», poi premi «Riprendi».', retry: false };
  if (/timeout|timed out|abort|504|502|503|gateway|network|failed to fetch|rete/.test(lower)) return { cause: 'Il servizio AI non ha risposto in tempo (rete lenta o servizio occupato).', advice: 'Aspetta qualche istante e premi «Riprendi»: parte dalle righe non ancora verificate.', retry: true };
  if (/429|rate|troppe richieste|quota/.test(lower)) return { cause: 'L’AI ha raggiunto il limite di richieste.', advice: 'Aspetta un minuto e premi «Riprendi».', retry: true };
  if (/risposta ai incompleta|non valida|json|strutturat/.test(lower)) return { cause: 'L’AI ha risposto in un formato non utilizzabile.', advice: 'Premi «Riprendi»: le righe già verificate non vengono rifatte.', retry: true };
  return { cause: 'La verifica si è fermata per un errore.', advice: 'Premi «Riprendi»: parte dalle righe non ancora verificate.', retry: true };
}
