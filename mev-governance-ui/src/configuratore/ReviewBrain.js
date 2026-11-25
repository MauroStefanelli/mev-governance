import React, { useId } from 'react';
import './reviewBrain.css';

// Un cervello in vista laterale con l'anima di un circuito: la corteccia ha lobi e solchi, c'e' il cervelletto, il tronco encefalico e, sopra, tracce da scheda elettronica
// con dei nodi che si illuminano. Il COLORE sale dal basso con la percentuale e le tracce si «accendono» una dopo l'altra: e' la percentuale VERA del lavoro, non una finta.
// I colori richiamano il tessuto (rosa-corallo e grigio-rosato) e l'elettronica (ciano elettrico e oro del rame).
// Il disegno e' solo decorativo (aria-hidden): le informazioni sono nel testo accanto.
const W = 240, H = 196;
const CORTEX = 'M54 104 C42 90 44 66 60 54 C68 38 88 28 108 32 C116 20 140 18 154 27 C172 22 194 33 202 52 C220 56 230 76 222 92 C232 102 230 122 216 128 C214 140 204 148 190 146 C184 156 168 160 156 153 C146 160 128 160 118 152 C106 158 90 154 84 144 C70 146 56 138 56 126 C46 122 44 110 54 104 Z';
const CEREBELLUM = 'M156 156 C164 146 186 146 200 150 C212 157 208 174 194 178 C178 184 158 178 156 156 Z';
const STEM = 'M122 154 C124 168 126 180 124 192 C132 196 146 196 150 189 C148 176 148 164 150 154 Z';
// I solchi della corteccia (sulcus centrale, laterale, parieto-occipitale, ecc.) e le circonvoluzioni piu' piccole.
const SULCI = [
  'M118 34 C122 52 116 66 124 82 C130 94 126 106 132 118', 'M62 100 C84 96 104 104 128 100 C150 96 170 104 194 98 C206 95 214 100 220 106',
  'M150 28 C150 46 158 58 154 74 C152 84 160 92 164 104', 'M70 56 C84 62 92 76 90 90', 'M178 40 C184 54 196 60 202 72 C206 82 200 92 206 100',
  'M88 128 C100 124 112 130 124 126', 'M168 126 C180 122 194 126 206 122', 'M60 76 C70 74 78 80 84 74', 'M196 78 C204 80 214 78 222 82',
  'M100 44 C108 48 112 56 108 64', 'M136 56 C142 62 140 72 146 78', 'M76 112 C84 116 94 114 100 118', 'M178 104 C186 110 196 108 206 112',
];
// Le tracce del circuito: percorsi ad angoli retti con un nodo alla fine. `at` = percentuale oltre la quale la traccia si accende (dal basso verso l'alto, come il livello).
const TRACES = [
  { d: 'M96 136 H120 V122 H140', at: 8, end: [140, 122] }, { d: 'M70 124 H88 V112 H104', at: 14, end: [104, 112] }, { d: 'M188 132 H170 V118 H152', at: 20, end: [152, 118] },
  { d: 'M210 114 H196 V104 H176', at: 27, end: [176, 104] }, { d: 'M132 108 H150 V94 H170', at: 34, end: [170, 94] }, { d: 'M66 96 H84 V86 H102', at: 41, end: [102, 86] },
  { d: 'M116 100 H128 V84 H146', at: 48, end: [146, 84] }, { d: 'M204 88 H190 V76 H172', at: 55, end: [172, 76] }, { d: 'M78 74 H96 V62 H114', at: 62, end: [114, 62] },
  { d: 'M150 74 H162 V60 H182', at: 69, end: [182, 60] }, { d: 'M96 52 H110 V42 H126', at: 76, end: [126, 42] }, { d: 'M170 48 H156 V38 H142', at: 83, end: [142, 38] },
  { d: 'M124 46 H134 V34 H146', at: 90, end: [146, 34] },
];

export default function ReviewBrain({ percent = 0, pulse = false, tone = 'work', size = 200, label }) {
  const id = useId().replace(/:/g, '');
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  // Il livello: la silhouette va da y=18 a y=196: sale con la percentuale.
  const top = 196 - (178 * value) / 100;
  const text = label || `Avanzamento ${value}%`;
  return <div className={`rb rb-${tone}${pulse ? ' is-pulsing' : ''}`} style={{ width: size, height: size * (H / W) }} role="img" aria-label={text}>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-clip`}><path d={CORTEX} /><path d={CEREBELLUM} /><path d={STEM} /></clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--rb-a)" /><stop offset="0.5" stopColor="var(--rb-b)" /><stop offset="1" stopColor="var(--rb-c)" />
        </linearGradient>
        <linearGradient id={`${id}-tissue`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--rb-t1)" /><stop offset="1" stopColor="var(--rb-t2)" /></linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="55%"><stop offset="0" stopColor="var(--rb-glow)" stopOpacity=".5" /><stop offset="1" stopColor="var(--rb-glow)" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse className="rb-halo" cx="126" cy="100" rx="116" ry="92" fill={`url(#${id}-glow)`} opacity={0.15 + (value / 100) * 0.85} />
      <g className="rb-shape">
        <path d={STEM} className="rb-tissue" fill={`url(#${id}-tissue)`} /><path d={CEREBELLUM} className="rb-tissue" fill={`url(#${id}-tissue)`} /><path d={CORTEX} className="rb-tissue" fill={`url(#${id}-tissue)`} />
        <g clipPath={`url(#${id}-clip)`}>
          <rect className="rb-level" x="0" y={top} width={W} height={H - top} fill={`url(#${id}-fill)`} />
          <path className="rb-wave" d={`M-30 ${top} q 30 -7 60 0 t 60 0 t 60 0 t 60 0 t 60 0 V ${H} H -30 Z`} fill={`url(#${id}-fill)`} opacity=".5" />
          {SULCI.map((d, i) => <path key={i} d={d} className="rb-sulcus" />)}
          <path d="M156 156 C170 152 184 156 198 158 M158 164 C172 160 186 164 204 166 M160 172 C174 168 188 172 198 174" className="rb-sulcus rb-lamella" />
          {TRACES.map((t, i) => <path key={i} d={t.d} className={`rb-trace${value >= t.at ? ' is-on' : ''}`} style={{ animationDelay: `${(i % 4) * 0.25}s` }} />)}
        </g>
        {[CORTEX, CEREBELLUM, STEM].map((d, i) => <path key={i} d={d} className="rb-outline" />)}
        {TRACES.map((t, i) => <circle key={i} cx={t.end[0]} cy={t.end[1]} r={value >= t.at ? 3.2 : 2} className={`rb-node${value >= t.at ? ' is-on' : ''}`} style={{ animationDelay: `${(i % 4) * 0.25}s` }} />)}
      </g>
    </svg>
    <div className="rb-percent" aria-hidden="true"><strong>{value}</strong><span>%</span></div>
  </div>;
}
