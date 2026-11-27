import React from 'react';

// Il logo Capgemini Italia. Due versioni, ognuna per il suo posto:
//  - «home»: il logo esteso (Capgemini-Logo.wine.png), colori originali su fondo chiaro; sul tema scuro poggia su una targhetta bianca perche' il blu non si legge sul blu scuro;
//  - «bar»: il distintivo tondo (Logo_Capgemini_02.png), gia' bianco e leggibile sulla barra scura in alto.
// I file sono quelli ufficiali forniti: non sono ridisegnati ne' ricolorati.
export const LOGO = {
  home: { src: '/capgemini-home.png', ratio: 501 / 112, alt: 'Capgemini' },
  bar: { src: '/capgemini-bar.png', ratio: 1, alt: 'Capgemini' },
};

export default function CapgeminiLogo({ variant = 'bar', height, dark = false, style }) {
  const logo = LOGO[variant] || LOGO.bar;
  const h = height || (variant === 'home' ? 44 : 34);
  const image = <img src={logo.src} alt={logo.alt} height={h} width={Math.round(h * logo.ratio)} decoding="async"
    style={{ display: 'block', height: h, width: 'auto', maxWidth: '100%', flexShrink: 0, objectFit: 'contain', ...(variant === 'bar' ? style : {}) }} />;
  // Sul tema scuro il logo esteso e' blu su blu: lo si appoggia su una targhetta bianca arrotondata (non lo si ricolora).
  if (variant === 'home' && dark) return <span className="cg-plate" style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 12, background: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', ...style }}>{image}</span>;
  return variant === 'home' ? <span style={{ display: 'inline-flex', alignItems: 'center', ...style }}>{image}</span> : image;
}
