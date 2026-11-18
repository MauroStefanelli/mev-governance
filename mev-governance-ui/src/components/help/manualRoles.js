// Il manuale cambia in base al ruolo di chi lo legge: ognuno vede solo cio' che nell'app puo' vedere e fare.
//
// Un capitolo, un passo, una riga di tabella o un avviso del manuale puo' avere «roles»: l'elenco dei ruoli a cui si rivolge. Senza «roles» vale per tutti.
// Nei capitoli i passi sono scritti come testo semplice, oppure come { text, roles } quando valgono solo per alcuni ruoli.
// In «fields.rows» e in «warnings» una riga e' [voce, testo] oppure [voce, testo, roles]; negli avvisi [problema, soluzione, roles].
export const ROLES = ['Client', 'Editor', 'Developer', 'Bid Manager', 'Admin', 'SuperAdmin'];

// Il ruolo con cui leggere il manuale: tra tutti quelli dell'utente si usa il piu' ampio (chi e' Admin e Developer legge come Admin: vede anche cio' che Admin puo' fare).
const WIDTH = ['SuperAdmin', 'Admin', 'Developer', 'Editor', 'Bid Manager', 'Client'];
export const readerRole = (role, roles = []) => {
  const mine = [...new Set([...(Array.isArray(roles) ? roles : []), role].filter(Boolean))];
  return WIDTH.find(candidate => mine.includes(candidate)) || '';
};

const allowed = (item, reader) => {
  const roles = Array.isArray(item) ? item[2] : item?.roles;
  return !Array.isArray(roles) || roles.length === 0 || roles.includes(reader);
};
const textOf = item => (item && typeof item === 'object' && !Array.isArray(item) ? item.text : item);

// Il manuale per un ruolo: toglie cio' che non gli appartiene e i capitoli rimasti senza passi. Senza ruolo mostra solo cio' che vale per tutti.
export function forRole(chapters, reader) {
  return (chapters || []).filter(chapter => allowed(chapter, reader)).map(chapter => {
    const steps = (chapter.steps || []).filter(step => allowed(step, reader)).map(textOf);
    const fields = chapter.fields ? { ...chapter.fields, rows: chapter.fields.rows.filter(row => allowed(row, reader)).map(row => row.slice(0, 2)) } : undefined;
    const warnings = chapter.warnings ? chapter.warnings.filter(row => allowed(row, reader)).map(row => row.slice(0, 2)) : undefined;
    return { ...chapter, steps, fields: fields && fields.rows.length ? fields : undefined, warnings: warnings && warnings.length ? warnings : undefined, roles: undefined };
  }).filter(chapter => chapter.steps.length > 0);
}

// Etichetta mostrata sotto il titolo: dice con quale ruolo si sta leggendo, cosi' chi legge sa perche' alcune cose non ci sono.
export const readerLabel = reader => (reader ? `Manuale per il ruolo ${reader}` : '');
