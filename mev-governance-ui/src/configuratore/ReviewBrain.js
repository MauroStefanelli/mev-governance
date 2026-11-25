import React, { useId } from 'react';
import './reviewBrain.css';

// Un cervello disegnato in SVG che si «accende» in base alla percentuale: il colore sale dal basso (come un livello) e le sinapsi si illuminano una dopo l'altra.
// Non e' una simulazione: la percentuale arriva dalle righe realmente verificate. Con `pulse` (lavoro in corso) il cervello «respira»; a fine lavoro e' fermo.
// Il disegno e' solo decorativo (aria-hidden): le informazioni sono nel testo accanto, leggibile anche senza vederlo.
const OUTLINE = 'M100 14c-17 0-31 9-37 22-14 1-26 12-26 27 0 6 2 11 5 16-8 6-12 15-12 25 0 14 10 26 24 29 4 12 15 20 29 20 5 0 9-1 13-3 4 2 8 3 13 3 14 0 25-8 29-20 14-3 24-15 24-29 0-10-4-19-12-25 3-5 5-10 5-16 0-15-12-26-26-27-6-13-20-22-37-22z';
const FOLDS = [
  'M100 16v118', 'M66 50c10 4 18 12 22 22', 'M134 50c-10 4-18 12-22 22', 'M48 84c12 0 22 6 28 15', 'M152 84c-12 0-22 6-28 15',
  'M58 118c10-2 20 2 26 10', 'M142 118c-10-2-20 2-26 10', 'M78 38c-4 10-2 20 6 28', 'M122 38c4 10 2 20-6 28', 'M70 100c6 8 8 18 4 28', 'M130 100c-6 8-8 18-4 28',
];
// Punti (sinapsi) con la soglia di percentuale oltre la quale si accendono: dal basso verso l'alto, come il livello del colore.
const NODES = [[78, 132, 6], [122, 132, 12], [62, 112, 20], [138, 112, 26], [100, 120, 33], [50, 92, 40], [150, 92, 47], [84, 96, 54], [116, 96, 60], [64, 70, 67], [136, 70, 73], [100, 74, 80], [82, 48, 86], [118, 48, 91], [100, 30, 96]];

export default function ReviewBrain({ percent = 0, pulse = false, tone = 'work', size = 200, label }) {
  const id = useId().replace(/:/g, '');
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  // Il livello: il disegno e' alto da y=14 a y=150 (136 unita'): sale con la percentuale.
  const top = 150 - (136 * value) / 100;
  const text = label || `Avanzamento ${value}%`;
  return <div className={`rb rb-${tone}${pulse ? ' is-pulsing' : ''}`} style={{ width: size, height: size * 0.9 }} role="img" aria-label={text}>
    <svg viewBox="0 0 200 170" width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-clip`}><path d={OUTLINE} /></clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--rb-a)" /><stop offset="0.55" stopColor="var(--rb-b)" /><stop offset="1" stopColor="var(--rb-c)" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="55%" r="55%"><stop offset="0" stopColor="var(--rb-b)" stopOpacity=".35" /><stop offset="1" stopColor="var(--rb-b)" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse className="rb-halo" cx="100" cy="84" rx="92" ry="74" fill={`url(#${id}-glow)`} opacity={value / 100} />
      <path d={OUTLINE} className="rb-base" />
      <g clipPath={`url(#${id}-clip)`}>
        <rect className="rb-level" x="0" y={top} width="200" height={170 - top} fill={`url(#${id}-fill)`} />
        <path className="rb-wave" d={`M-20 ${top} q 30 -8 60 0 t 60 0 t 60 0 t 60 0 V 170 H -20 Z`} fill={`url(#${id}-fill)`} opacity=".55" />
        {FOLDS.map((d, i) => <path key={i} d={d} className="rb-fold" />)}
      </g>
      <path d={OUTLINE} className="rb-outline" />
      {NODES.map(([x, y, at], i) => <circle key={i} cx={x} cy={y} r={value >= at ? 3.6 : 2.2} className={`rb-node${value >= at ? ' is-on' : ''}`} style={{ animationDelay: `${(i % 5) * 0.18}s` }} />)}
    </svg>
    <div className="rb-percent" aria-hidden="true"><strong>{value}</strong><span>%</span></div>
  </div>;
}
