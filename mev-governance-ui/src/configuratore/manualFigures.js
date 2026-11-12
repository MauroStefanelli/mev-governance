import React from 'react';

// Diagrams for the manuals, drawn as SVG so they stay sharp at any size, print well and need no image file.
// Each one is a figure with a caption and a full text alternative that says the same thing in words: a diagram is never the only place
// where a step is written. Boxes are numbered in the order of the work; the arrows only say "then".

const COLORS = { blue: ['#e8f0fd', '#2f6bbd'], green: ['#e3f6ec', '#1b8a57'], amber: ['#fff4dd', '#c98a12'], violet: ['#efe6fb', '#6a35b6'], grey: ['#f1f4f8', '#7890a9'] };

const Defs = () => <defs><marker id="arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#7890a9" /></marker></defs>;

export function Figure({ figure }) {
  if (!figure) return null;
  const Diagram = DIAGRAMS[figure.id];
  if (!Diagram) return null;
  return <figure className="tow-manual-figure">
    <div className="tow-manual-figure-scroll"><Diagram label={figure.alt} /></div>
    <figcaption><strong>{figure.title}</strong> {figure.caption}</figcaption>
    <details className="tow-manual-figure-text"><summary>Descrizione della figura a parole</summary><p>{figure.alt}</p></details>
  </figure>;
}

// ---- Configuratore: what goes in, what each step does and produces, where it is saved, and where it goes next ----
// Three lanes read top to bottom: the INPUTS the team brings, the FOUR STEPS that turn them into an offer (each with what you do and what you get),
// and the OUTPUTS with the three ways to save. Colour is never the only carrier: every box has a number or a title.
function Lane({ y, h, label }) {
  return <g><rect x="8" y={y} width="1184" height={h} rx="16" fill="#f7faff" stroke="#d5e2f2" /><text x="26" y={y + 22} fontSize="14" fontWeight="700" fill="#5b7594" letterSpacing="1.2">{label}</text></g>;
}
function Step({ x, n, title, does, gets, tone }) {
  const [fill, stroke] = COLORS[tone];
  return <g>
    <rect x={x} y={170} width="268" height="172" rx="16" fill="#fff" stroke={stroke} strokeWidth="2.5" />
    <path d={`M${x} 186 a16 16 0 0 1 16 -16 h236 a16 16 0 0 1 16 16 v34 h-268 z`} fill={fill} />
    <circle cx={x + 28} cy="196" r="15" fill={stroke} /><text x={x + 28} y="201.5" textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff">{n}</text>
    <text x={x + 52} y="202" fontSize="20.5" fontWeight="700" fill="#1f3a5c">{title}</text>
    <text x={x + 16} y="244" fontSize="13" fontWeight="700" fill="#5b7594" letterSpacing="1">COSA FAI</text>
    {does.map((line, i) => <text key={i} x={x + 16} y={262 + i * 16} fontSize="15" fill="#2b4666">{line}</text>)}
    <line x1={x + 16} y1="306" x2={x + 252} y2="306" stroke="#dce5f0" />
    <text x={x + 16} y="324" fontSize="13" fontWeight="700" fill="#5b7594" letterSpacing="1">COSA OTTIENI</text>
    <text x={x + 16} y="338" fontSize="15" fontWeight="700" fill={stroke}>{gets}</text>
  </g>;
}
function Chip({ x, y, w, title, sub, tone = 'violet' }) {
  const [fill, stroke] = COLORS[tone];
  return <g><rect x={x} y={y} width={w} height="50" rx="12" fill={fill} stroke={stroke} strokeWidth="1.8" />
    <text x={x + 12} y={y + 21} fontSize="15.5" fontWeight="700" fill="#1f3a5c">{title}</text><text x={x + 12} y={y + 39} fontSize="13.5" fill="#4a6483">{sub}</text></g>;
}
function Save({ x, w, title, sub, tone }) {
  const [fill, stroke] = COLORS[tone];
  return <g><rect x={x} y="408" width={w} height="64" rx="14" fill={fill} stroke={stroke} strokeWidth="2" />
    <text x={x + 14} y="432" fontSize="16.5" fontWeight="700" fill="#1f3a5c">{title}</text>
    {sub.map((line, i) => <text key={i} x={x + 14} y={450 + i * 15} fontSize="13.5" fill="#3b5775">{line}</text>)}</g>;
}
function ConfiguratorFlow({ label }) {
  return <svg viewBox="0 0 1200 560" role="img" aria-label={label} className="tow-manual-svg tow-manual-svg-wide">
    <Defs />
    <Lane y={8} h={118} label="1 · COSA PORTI: LE FONTI DELL’INIZIATIVA" />
    <Chip x={20} y={62} w={170} title="Tabella di Offerta" sub="file .xlsx di Poste" tone="amber" />
    <Chip x={198} y={62} w={176} title="Dati a mano" sub="GOTO, titolo, sistema" tone="blue" />
    <Chip x={382} y={62} w={222} title="Workspace documentale" sub="documenti, OCR, ricerca" tone="violet" />
    <Chip x={612} y={62} w={206} title="Razionali e vincoli" sub="chat con l’AI, da confermare" tone="violet" />
    <Chip x={826} y={62} w={168} title="Soluzione" sub="per VS Code" tone="violet" />
    <Chip x={1002} y={62} w={178} title="Storico e Conoscenza" sub="lavoro già fatto" tone="grey" />
    <path d="M600 128 v22" stroke="#7890a9" strokeWidth="2.5" markerEnd="url(#arrowhead)" fill="none" />
    <Lane y={140} h={214} label="2 · COSA FAI: QUATTRO PASSI IN SEQUENZA" />
    <Step x={24} n="1" title="Iniziativa" does={['Compili i dati e importi l’Excel', 'Apri le sezioni: documenti,', 'razionali, soluzione, analisi', 'Premi «Analizza e suggerisci»']} gets="Contesto + voci suggerite" tone="blue" />
    <Step x={316} n="2" title="Interventi" does={['Scegli le voci di catalogo', 'Imposti tipo, complessità, quantità', 'Chiedi il «Secondo parere AI»', 'Aggiungi solo le proposte utili']} gets="Elenco interventi scelti" tone="blue" />
    <Step x={608} n="3" title="Offerta" does={['Controlli prezzi e confronto Excel', 'Imposti sconto e contingenza', 'Regoli le TOW automatiche (%)', 'Inserisci le TOW manuali']} gets="Totale offerta" tone="blue" />
    <Step x={900} n="4" title="Revisione" does={['Leggi il riepilogo finale', 'Generi la Tabella di offerta XLSX', 'Esporti JSON, CSV o stampi', 'Salvi la valutazione']} gets="File pronti + valutazione" tone="green" />
    <path d="M292 256 h24" stroke="#7890a9" strokeWidth="3" markerEnd="url(#arrowhead)" fill="none" /><path d="M584 256 h24" stroke="#7890a9" strokeWidth="3" markerEnd="url(#arrowhead)" fill="none" />
    <path d="M876 256 h24" stroke="#7890a9" strokeWidth="3" markerEnd="url(#arrowhead)" fill="none" />
    <path d="M1034 342 v26 H600 v-6" stroke="#7890a9" strokeWidth="2.5" fill="none" strokeDasharray="6 4" markerEnd="url(#arrowhead)" />
    <Lane y={366} h={116} label="3 · COME SALVI E COSA SUCCEDE DOPO" />
    <Save x={24} w={376} title="Salva valutazione" sub={['Registra l’offerta e aggiorna lo storico', 'dell’analisi. L’esito arriva dal server.']} tone="green" />
    <Save x={412} w={376} title="Salva e Chiudi" sub={['Salva e svuota la pagina,', 'ma solo se il salvataggio riesce.']} tone="green" />
    <Save x={800} w={376} title="Salva e vai a Sviluppo →" sub={['Salva e apre Sviluppo iniziative', 'sulla stessa iniziativa: schede e codice.']} tone="blue" />
    <rect x="8" y="496" width="1184" height="52" rx="12" fill="#fff8e6" stroke="#e5b84a" />
    <text x="26" y="518" fontSize="15" fontWeight="700" fill="#6b4e08">Regola da ricordare</text>
    <text x="26" y="537" fontSize="15" fill="#6b4e08">Per salvare serve almeno il GOTO o il titolo; il salvataggio completo di offerta e storico richiede il Codice GOTO. Salvare spesso: «Reset» non chiede conferma.</text>
  </svg>;
}

// ---- Sviluppo: six phases, which count towards progress, how a card becomes "defined", and its states ----
function PhaseBox({ x, n, title, lines, tone, optional }) {
  const [fill, stroke] = COLORS[tone];
  return <g>
    <rect x={x} y="58" width="184" height="124" rx="14" fill="#fff" stroke={stroke} strokeWidth="2.5" strokeDasharray={optional ? '7 5' : undefined} />
    <path d={`M${x} 74 a16 16 0 0 1 16 -16 h152 a16 16 0 0 1 16 16 v28 h-184 z`} fill={fill} />
    <circle cx={x + 24} cy="80" r="13" fill={stroke} /><text x={x + 24} y="85" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">{n}</text>
    <text x={x + 46} y="86" fontSize="19.5" fontWeight="700" fill="#1f3a5c">{title}</text>
    {lines.map((line, i) => <text key={i} x={x + 14} y={126 + i * 17} fontSize="15" fill="#2b4666">{line}</text>)}
    {optional && <text x={x + 14} y="172" fontSize="13.5" fontWeight="700" fill="#a06a08">FACOLTATIVA</text>}
  </g>;
}
function DevelopmentFlow({ label }) {
  const phases = [
    [8, 1, 'Fonti', ['Cartella dei sorgenti', 'Razionali confermati', 'Applicativi del sistema'], 'grey', false],
    [208, 2, 'Schede', ['Una per attività:', 'file, soluzione e', 'criteri di accettazione'], 'blue', false],
    [408, 3, 'Progetto', ['ZIP di avvio con', 'decisioni da concordare', 'e piano di test'], 'amber', true],
    [608, 4, 'Codice', ['File generati dall’AI', 'per un applicativo', 'da verificare'], 'amber', true],
    [808, 5, 'Consegna', ['4 controlli e ZIP della', 'richiesta di modifica', 'codice per lo sviluppo'], 'blue', false],
    [1008, 6, 'Verifica', ['Evidenze dei test', 'e stato «Verificata»', 'per ogni attività'], 'green', false],
  ];
  return <svg viewBox="0 0 1200 560" role="img" aria-label={label} className="tow-manual-svg tow-manual-svg-wide">
    <Defs />
    <text x="12" y="30" fontSize="15" fontWeight="700" fill="#5b7594" letterSpacing="1.2">LE SEI FASI DELLO SVILUPPO INIZIATIVE</text>
    {phases.map(([x, n, title, lines, tone, optional]) => <PhaseBox key={n} x={x} n={n} title={title} lines={lines} tone={tone} optional={optional} />)}
    {[192, 392, 592, 792, 992].map(x => <path key={x} d={`M${x} 120 h14`} stroke="#7890a9" strokeWidth="3" markerEnd="url(#arrowhead)" fill="none" />)}
    {[[208, 'Schede'], [808, 'Consegna'], [1008, 'Verifica']].map(([x, name]) => <g key={name}><rect x={x} y="190" width="184" height="26" rx="13" fill="#e8f0fd" stroke="#2f6bbd" /><text x={x + 92} y="208" textAnchor="middle" fontSize="14" fontWeight="700" fill="#2f6bbd">conta nell’avanzamento</text></g>)}
    <rect x="8" y="240" width="1184" height="116" rx="16" fill="#f7faff" stroke="#d5e2f2" />
    <text x="26" y="264" fontSize="15" fontWeight="700" fill="#5b7594" letterSpacing="1.2">QUANDO UNA SCHEDA È «DEFINITA»: SERVONO TUTTI E TRE</text>
    <Chip x={26} y={282} w={300} title="File coinvolti" sub="uno per riga, percorso relativo" />
    <Chip x={346} y={282} w={300} title="Soluzione tecnica" sub="cosa si modifica e come" />
    <Chip x={666} y={282} w={300} title="Criteri di accettazione" sub="come si capisce che è fatto" />
    <text x="984" y="314" fontSize="29.5" fontWeight="700" fill="#7890a9">=</text>
    <rect x="1010" y="278" width="170" height="58" rx="14" fill="#e3f6ec" stroke="#1b8a57" strokeWidth="2.5" /><text x="1095" y="304" textAnchor="middle" fontSize="17" fontWeight="700" fill="#1f3a5c">Scheda definita</text><text x="1095" y="323" textAnchor="middle" fontSize="13.5" fill="#3b5775">pronta per sviluppo</text>
    <rect x="8" y="368" width="1184" height="92" rx="16" fill="#f7faff" stroke="#d5e2f2" />
    <text x="26" y="392" fontSize="15" fontWeight="700" fill="#5b7594" letterSpacing="1.2">GLI STATI DI UNA SCHEDA</text>
    {['Da analizzare', 'Soluzione definita', 'Pronta per sviluppo', 'In sviluppo', 'Da verificare', 'Verificata'].map((name, i) => <g key={name}>
      <rect x={26 + i * 194} y="404" width="170" height="40" rx="20" fill={i === 5 ? '#e3f6ec' : '#fff'} stroke={i === 5 ? '#1b8a57' : '#7890a9'} strokeWidth="2" />
      <text x={26 + i * 194 + 85} y="429" textAnchor="middle" fontSize="15.5" fontWeight="700" fill="#1f3a5c">{name}</text>
      {i < 5 && <path d={`M${26 + i * 194 + 170} 424 h24`} stroke="#7890a9" strokeWidth="2.5" markerEnd="url(#arrowhead)" fill="none" />}</g>)}
    <rect x="8" y="474" width="1184" height="74" rx="12" fill="#fff8e6" stroke="#e5b84a" />
    <text x="26" y="496" fontSize="15" fontWeight="700" fill="#6b4e08">Regole e limiti</text>
    <text x="26" y="515" fontSize="15" fill="#6b4e08">«Pronta per sviluppo» richiede la scheda definita · «Verificata» richiede le evidenze · modificare una scheda verificata la riporta a «Da verificare».</text>
    <text x="26" y="535" fontSize="15" fill="#6b4e08">L’app non scrive nel repository, non compila e non esegue test o deploy: i file generati sono bozze da verificare in Visual Studio Code.</text>
  </svg>;
}

const DIAGRAMS = { configurator: ConfiguratorFlow, development: DevelopmentFlow };
export const FIGURE_IDS = Object.keys(DIAGRAMS);
