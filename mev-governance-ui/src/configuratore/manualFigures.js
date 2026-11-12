import React from 'react';

// Diagrams for the manuals, drawn as SVG so they stay sharp at any size, print well and need no image file.
// Each one is a figure with a caption and a full text alternative that says the same thing in words: a diagram is never the only place
// where a step is written. Boxes are numbered in the order of the work; the arrows only say "then".

const COLORS = { blue: ['#e8f0fd', '#2f6bbd'], green: ['#e3f6ec', '#1b8a57'], amber: ['#fff4dd', '#c98a12'], violet: ['#efe6fb', '#6a35b6'], grey: ['#f1f4f8', '#7890a9'] };

function Box({ x, y, w = 150, h = 62, n, title, sub, tone = 'blue', dashed = false }) {
  const [fill, stroke] = COLORS[tone];
  return <g>
    <rect x={x} y={y} width={w} height={h} rx="12" fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray={dashed ? '6 4' : undefined} />
    {n != null && <><circle cx={x + 16} cy={y + 16} r="11" fill={stroke} /><text x={x + 16} y={y + 20.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{n}</text></>}
    <text x={x + (n != null ? 34 : 12)} y={y + 21} fontSize="14.5" fontWeight="700" fill="#1f3a5c">{title}</text>
    {sub && sub.split('\n').map((line, i) => <text key={i} x={x + 12} y={y + 42 + i * 15} fontSize="12.5" fill="#4a6483">{line}</text>)}
  </g>;
}
const Arrow = ({ x1, y1, x2, y2, label, dashed = false }) => <g>
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7890a9" strokeWidth="2" strokeDasharray={dashed ? '5 4' : undefined} markerEnd="url(#arrowhead)" />
  {label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize="11.5" fill="#4a6483">{label}</text>}
</g>;
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

// ---- Configuratore: the four steps, what feeds them, where it is saved and where it goes next ----
function ConfiguratorFlow({ label }) {
  return <svg viewBox="0 0 900 400" role="img" aria-label={label} className="tow-manual-svg">
    <Defs />
    <text x="12" y="20" fontSize="13" fontWeight="700" fill="#4a6483">IL PERCORSO NEL CONFIGURATORE INIZIATIVE</text>
    <Box x={14} y={34} w={196} h={78} n="1" title="Iniziativa" sub={'Dati, documenti, razionali,\nsoluzione, analisi condivisa'} />
    <Box x={246} y={34} w={196} h={78} n="2" title="Interventi" sub={'Valuta le voci, secondo\nparere AI, integrazioni'} />
    <Box x={478} y={34} w={196} h={78} n="3" title="Offerta" sub={'Prezzi, TOW automatici e\nmanuali, sconto, contingenza'} />
    <Box x={710} y={34} w={176} h={78} n="4" title="Revisione" sub={'Riepilogo, export Excel\nJSON/CSV, salvataggio'} tone="green" />
    <Arrow x1={210} y1={73} x2={246} y2={73} /><Arrow x1={442} y1={73} x2={478} y2={73} /><Arrow x1={674} y1={73} x2={710} y2={73} />
    <text x="14" y="140" fontSize="13" fontWeight="700" fill="#4a6483">COSA ALIMENTA IL PASSO 1</text>
    <Box x={14} y={150} w={140} h={54} title="Importa Tabella" sub={'di Offerta (.xlsx)'} tone="amber" />
    <Box x={166} y={150} w={140} h={54} title="Workspace" sub={'documentale + OCR'} tone="violet" />
    <Box x={318} y={150} w={140} h={54} title="Razionali" sub={'e vincoli con l’AI'} tone="violet" />
    <Box x={470} y={150} w={140} h={54} title="Soluzione" sub={'per VS Code'} tone="violet" />
    <Box x={622} y={150} w={140} h={54} title="Analisi condivisa" sub={'revisioni e decisioni'} tone="violet" />
    <Box x={774} y={150} w={112} h={54} title="Storico" sub={'Conoscenza AI'} tone="grey" />
    <Arrow x1={84} y1={150} x2={100} y2={116} dashed /><Arrow x1={400} y1={150} x2={150} y2={116} dashed />
    <text x="14" y="236" fontSize="13" fontWeight="700" fill="#4a6483">SALVATAGGIO</text>
    <Box x={14} y={246} w={250} h={64} title="Salva valutazione" sub={'registra l’offerta (record dell’iniziativa)\ne aggiorna lo storico dell’analisi'} tone="green" />
    <Box x={290} y={246} w={250} h={64} title="Salva e Chiudi" sub={'salva e svuota la pagina\nsolo se il salvataggio riesce'} tone="green" />
    <Box x={566} y={246} w={320} h={64} title="Salva e vai a Sviluppo →" sub={'salva in silenzio, poi apre l’applicazione\nSviluppo iniziative sulla stessa iniziativa'} tone="blue" />
    <Arrow x1={798} y1={112} x2={726} y2={246} dashed />
    <rect x="14" y="334" width="872" height="50" rx="10" fill="#fff8e6" stroke="#e5b84a" />
    <text x="28" y="354" fontSize="12.5" fill="#6b4e08" fontWeight="700">Regola da ricordare</text>
    <text x="28" y="372" fontSize="12.5" fill="#6b4e08">Per salvare serve almeno GOTO o titolo; il salvataggio completo di offerta e storico richiede il Codice GOTO.</text>
  </svg>;
}

// ---- Sviluppo: six phases, which count towards progress, and how a card becomes "defined" ----
function DevelopmentFlow({ label }) {
  return <svg viewBox="0 0 900 436" role="img" aria-label={label} className="tow-manual-svg">
    <Defs />
    <text x="12" y="20" fontSize="13" fontWeight="700" fill="#4a6483">LE SEI FASI DELLO SVILUPPO INIZIATIVE</text>
    <Box x={8} y={32} w={138} h={74} n="1" title="Fonti" sub={'Cartella sorgenti,\nrazionali confermati'} tone="grey" />
    <Box x={156} y={32} w={138} h={74} n="2" title="Schede" sub={'Una per attività:\nfile, soluzione, criteri'} />
    <Box x={304} y={32} w={138} h={74} n="3" title="Progetto" sub={'Facoltativa.\nZIP di avvio'} tone="amber" dashed />
    <Box x={452} y={32} w={138} h={74} n="4" title="Codice" sub={'Facoltativa. File\ngenerati dall’AI'} tone="amber" dashed />
    <Box x={600} y={32} w={138} h={74} n="5" title="Consegna" sub={'4 controlli, ZIP della\nrichiesta di modifica'} />
    <Box x={748} y={32} w={144} h={74} n="6" title="Verifica" sub={'Evidenze e stato\n«Verificata»'} tone="green" />
    {[146, 294, 442, 590, 738].map(x => <Arrow key={x} x1={x} y1={69} x2={x + 10} y2={69} />)}
    <rect x="156" y="116" width="142" height="22" rx="6" fill="#e8f0fd" /><text x="227" y="131" textAnchor="middle" fontSize="11.5" fill="#2f6bbd" fontWeight="700">conta nell’avanzamento</text>
    <rect x="600" y="116" width="142" height="22" rx="6" fill="#e8f0fd" /><text x="671" y="131" textAnchor="middle" fontSize="11.5" fill="#2f6bbd" fontWeight="700">conta nell’avanzamento</text>
    <rect x="748" y="116" width="144" height="22" rx="6" fill="#e8f0fd" /><text x="820" y="131" textAnchor="middle" fontSize="11.5" fill="#2f6bbd" fontWeight="700">conta nell’avanzamento</text>
    <text x="8" y="170" fontSize="13" fontWeight="700" fill="#4a6483">QUANDO UNA SCHEDA È «DEFINITA» (servono tutti e tre)</text>
    <Box x={8} y={180} w={170} h={64} title="File coinvolti" sub={'uno per riga,\npercorso relativo'} tone="violet" />
    <Box x={196} y={180} w={170} h={64} title="Soluzione tecnica" sub={'cosa e come\nsi modifica'} tone="violet" />
    <Box x={384} y={180} w={170} h={64} title="Criteri di accettazione" sub={'come si capisce\nche è fatto'} tone="violet" />
    <text x="570" y="216" fontSize="22" fontWeight="700" fill="#7890a9">=</text>
    <Box x={596} y={176} w={296} h={72} title="Scheda definita" sub={'è la condizione per «Pronta per sviluppo»;\nuna proposta AI da sola non la rende definita'} tone="green" />
    <text x="8" y="282" fontSize="13" fontWeight="700" fill="#4a6483">GLI STATI DI UNA SCHEDA</text>
    {[['Da analizzare', 8], ['Soluzione definita', 156], ['Pronta per sviluppo', 304], ['In sviluppo', 452], ['Da verificare', 600], ['Verificata', 748]].map(([name, x], i) => <g key={name}>
      <rect x={x} y={292} width={138} height={34} rx="17" fill={i === 5 ? '#e3f6ec' : '#f1f4f8'} stroke={i === 5 ? '#1b8a57' : '#7890a9'} strokeWidth="1.5" /><text x={x + 69} y={314} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#1f3a5c">{name}</text>
      {i < 5 && <Arrow x1={x + 138} y1={309} x2={x + 148} y2={309} />}</g>)}
    <text x="8" y="352" fontSize="12.5" fill="#4a6483">«Pronta per sviluppo» richiede la scheda definita · «Verificata» richiede le evidenze · modificare una scheda verificata la riporta a «Da verificare».</text>
    <rect x="8" y="370" width="884" height="52" rx="10" fill="#fff8e6" stroke="#e5b84a" />
    <text x="22" y="390" fontSize="12.5" fill="#6b4e08" fontWeight="700">Cosa l’app non fa</text>
    <text x="22" y="408" fontSize="12.5" fill="#6b4e08">Non scrive nel repository, non compila, non esegue test né deploy: i file generati sono bozze da verificare in Visual Studio Code.</text>
  </svg>;
}

const DIAGRAMS = { configurator: ConfiguratorFlow, development: DevelopmentFlow };
export const FIGURE_IDS = Object.keys(DIAGRAMS);
