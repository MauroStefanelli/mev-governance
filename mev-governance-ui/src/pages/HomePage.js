import React, { useState } from "react";

// Nomi femminili italiani comuni per determinare il genere dal nome
const NOMI_FEMMINILI = new Set([
  "alba","alessandra","alessia","alice","alicia","alina","allegra","amanda","ambra","amelia",
  "angela","angelica","anna","annalisa","antonella","asia","aurora","azzurra",
  "barbara","beatrice","benedetta","bianca","brenda",
  "camilla","carla","carlotta","carmen","carolina","cecilia","chiara","cinzia","claudia","costanza","cristina",
  "daniela","debora","deborah","diana","diletta","dina","dolores","domitilla",
  "elena","eleonora","elisa","elisabetta","elsa","emanuela","emma","erica","erika",
  "federica","fiamma","fiammetta","filomena","flavia","flora","floriana","francesca",
  "gabriella","gemma","giada","gina","giorgia","giovanna","giuditta","giulia","giuliana","giuseppina","gloria","grazia","graziella",
  "ida","ilaria","ines","irene","irma","isabella",
  "jessica","jolanda",
  "katia","katiuscia",
  "laura","lea","letizia","lidia","liliana","lisa","luca","lucia","luisa","luna",
  "mara","margherita","maria","marianna","marina","marta","martina","matilde","melissa","michela","milena","mirella","monica",
  "nadia","natalia","nicoletta","nina","noemi","nora",
  "olimpia","oriana",
  "paola","patrizia","perla","pina",
  "rachele","raffaella","ramona","rebecca","renata","rita","roberta","rosa","rosanna","rosaria","rossana","rossella",
  "sabrina","samantha","sara","serena","silvia","simona","sofia","sonia","stefania","stella","susanna",
  "tania","tatiana","teresa","tiziana",
  "valentina","valeria","vanessa","veronica","virginia","vittoria",
  "ylenia","yvonne",
  "zaira","zoe",
]);

const getGreeting = (fullName, username) => {
  const firstName = (fullName?.split(" ")[0] || username || "").toLowerCase().trim();
  return NOMI_FEMMINILI.has(firstName) ? "Benvenuta" : "Benvenuto";
};

// ── Definizione pagine con icone SVG dedicate ─────────────────────────────────
const PAGE_DEFS = [
  {
    id: "mev",
    label: "MEV",
    description: "Monitoraggio e gestione MEV.",
    accent: "#3b82f6",
    accentDark: "#1d4ed8",
    roles: ["Admin","SuperAdmin","Editor","Developer"],
    clientPage: "mev",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    id: "mevcap",
    label: "MEV-CAP",
    description: "Gestione MEV.",
    accent: "#6366f1",
    accentDark: "#4338ca",
    roles: ["Admin","SuperAdmin","Editor","Developer"],
    clientPage: "mevcap",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h18v4H3z"/><path d="M3 10h18v4H3z"/><path d="M3 17h10v4H3z"/>
        <path d="M17 19l2 2 4-4" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    id: "contratti",
    label: "Contratti",
    description: "Elenco e dettaglio dei contratti attivi nell'ambiente corrente.",
    accent: "#10b981",
    accentDark: "#059669",
    roles: ["Admin","SuperAdmin","Editor","Developer"],
    clientPage: "contratti",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
    ),
  },
  {
    id: "contratti_interni",
    label: "Ordini",
    description: "Gestione degli ordini e buoni di consegna.",
    accent: "#f59e0b",
    accentDark: "#d97706",
    roles: ["Admin","SuperAdmin","Editor","Developer"],
    clientPage: "contratti_interni",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
    ),
  },
  {
    id: "chart",
    label: "Grafici",
    description: "Release, Applicativo e Anno.",
    accent: "#8b5cf6",
    accentDark: "#7c3aed",
    roles: ["Admin","SuperAdmin","Editor","Developer"],
    clientPage: "chart",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
      </svg>
    ),
  },
  {
    id: "reportavanzamenti",
    label: "Report Avanzamenti",
    description: "Stato di avanzamento attività per release: requisito, analisi, sviluppo, date chiave e documenti.",
    accent: "#0891b2",
    accentDark: "#0e7490",
    roles: ["Admin","SuperAdmin","Editor","Developer","Manager"],
    clientPage: "reportavanzamenti",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="13" y2="18"/>
      </svg>
    ),
  },
  {
    id: "tools",
    label: "Gestione Ordini",
    description: "Caricamento e gestione degli ordini e delle forniture.",
    accent: "#64748b",
    accentDark: "#475569",
    roles: ["Admin","SuperAdmin"],
    clientPage: "tools",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.07 4.93A10 10 0 0 0 4.93 19.07M4.93 4.93A10 10 0 0 1 19.07 19.07"/>
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>
      </svg>
    ),
  },
  {
    id: "consumotow",
    label: "TOW Contratti",
    description: "Monitoraggio del consumo TOW per contratto e ambiente.",
    accent: "#0d9488",
    accentDark: "#0f766e",
    roles: ["Admin","SuperAdmin"],
    clientPage: "consumotow",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    ),
  },
  {
    id: "superadmin",
    label: "Gestione Contratti",
    description: "Archivio contrattuale: cataloghi, prezzi e configurazione lotti.",
    accent: "#1d4ed8",
    accentDark: "#1e3a8a",
    roles: ["SuperAdmin"],
    clientPage: "superadmin",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
      </svg>
    ),
  },
  {
    id: "configuratore",
    label: "Configuratore Offerta",
    description: "Strumento per costruire e analizzare offerte contrattuali con AI.",
    accent: "#0ea5e9",
    accentDark: "#0284c7",
    roles: ["SuperAdmin","Developer"],
    clientPage: null,
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/>
        <circle cx="2" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: "gara",
    label: "Risposte di Gara",
    description: "Analisi documenti di gara con AI: deliverable, proposta tecnico-economica e piano di risposta.",
    accent: "#f59e0b",
    accentDark: "#b45309",
    roles: ["Bid Manager","SuperAdmin"],
    clientPage: null,
    badge: "AI",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    id: "admin",
    label: "Gestione Utenti",
    description: "Amministrazione account, ruoli, permessi e accessi.",
    accent: "#ef4444",
    accentDark: "#dc2626",
    roles: ["Admin","SuperAdmin"],
    clientPage: null,
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    id: "dbconfig",
    label: "Configurazione App",
    description: "Impostazioni applicazione, timeout sessione e parametri di sistema.",
    accent: "#6b7280",
    accentDark: "#4b5563",
    roles: ["Admin","SuperAdmin"],
    clientPage: null,
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.07 4.93A10 10 0 0 0 4.93 19.07M4.93 4.93A10 10 0 0 1 19.07 19.07"/>
        <path d="M12 1v3m0 16v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M1 12h3m16 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
      </svg>
    ),
  },
];

// Gradi per card basati sull'accento
const cardGradient = (accent, accentDark) =>
  `linear-gradient(135deg, ${accent}22 0%, ${accentDark}11 100%)`;

export default function HomePage({
  username, fullName, role, roles = [],
  ambienti = [], ambienteId, onSwitchAmbiente,
  onNavigate, onLogout, onOpenProfile,
  clientPages = null,
  appPerms = null,
  lastAlign,
  userTheme = "light",
}) {
  const [hover, setHover] = useState(null);
  const isDark = userTheme === "dark";

  // Token colore tema
  const T = isDark ? {
    bg:           "linear-gradient(160deg, #0a1628 0%, #0f2347 40%, #0d1f3c 70%, #061224 100%)",
    text:         "#e2e8f0",
    textMuted:    "rgba(148,163,184,0.85)",
    textFaint:    "rgba(100,116,139,0.7)",
    cardBg:       "rgba(255,255,255,0.04)",
    cardBgHover:  "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)",
    cardBorder:   "rgba(255,255,255,0.08)",
    inputBg:      "rgba(255,255,255,0.08)",
    inputBorder:  "rgba(255,255,255,0.15)",
    inputColor:   "#e2e8f0",
    btnBg:        "rgba(255,255,255,0.08)",
    btnBorder:    "rgba(255,255,255,0.15)",
    btnColor:     "#e2e8f0",
    btnHoverBg:   "rgba(255,255,255,0.14)",
    logoutBg:     "rgba(239,68,68,0.08)",
    logoutBorder: "rgba(239,68,68,0.3)",
    logoutColor:  "#fca5a5",
    logoutHover:  "rgba(239,68,68,0.16)",
    avatarBg:     "rgba(59,130,246,0.35)",
    avatarBorder: "rgba(59,130,246,0.5)",
    titleColor:   "#f8fafc",
    glowBg1:      "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
    glowBg2:      "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
    footerBorder: "rgba(255,255,255,0.06)",
    optionBg:     "#0f2347",
    optionColor:  "#e2e8f0",
  } : {
    bg:           "#f0f4f8",
    text:         "#1e293b",
    textMuted:    "rgba(51,65,85,0.85)",
    textFaint:    "rgba(100,116,139,0.8)",
    cardBg:       "#ffffff",
    cardBgHover:  "linear-gradient(135deg, #f8faff 0%, #f1f5ff 100%)",
    cardBorder:   "rgba(203,213,225,0.8)",
    inputBg:      "#ffffff",
    inputBorder:  "rgba(148,163,184,0.5)",
    inputColor:   "#1e293b",
    btnBg:        "#ffffff",
    btnBorder:    "rgba(148,163,184,0.5)",
    btnColor:     "#334155",
    btnHoverBg:   "#f1f5f9",
    logoutBg:     "#fff1f2",
    logoutBorder: "rgba(239,68,68,0.3)",
    logoutColor:  "#be123c",
    logoutHover:  "#ffe4e6",
    avatarBg:     "rgba(59,130,246,0.15)",
    avatarBorder: "rgba(59,130,246,0.4)",
    titleColor:   "#0f172a",
    glowBg1:      "none",
    glowBg2:      "none",
    footerBorder: "rgba(0,0,0,0.08)",
    optionBg:     "#ffffff",
    optionColor:  "#1e293b",
  };

  const hasRole = (...wanted) => {
    const myRoles = roles.length > 0 ? roles : (role ? [role] : []);
    return wanted.some(r => myRoles.includes(r));
  };

  // Calcola le card visibili per questo utente
  const visibleCards = PAGE_DEFS.filter(p => {
    // Controllo ruolo
    let roleOk;
    if (role === "Client") {
      roleOk = clientPages !== null && p.clientPage && clientPages.includes(p.clientPage);
    } else {
      roleOk = p.roles.some(r => hasRole(r));
    }
    if (!roleOk) return false;
    // Controllo permesso app (SuperAdmin bypassa sempre)
    if (hasRole("SuperAdmin")) return true;
    if (appPerms === null) return true; // non ancora caricato → mostra tutto
    const perm = appPerms[p.id];
    return perm?.canView !== false;
  });

  const ambienteAttivo = ambienti.find(a => a.id === ambienteId);
  const initials = (fullName || username || "?")
    .split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: T.text,
      overflowX: "hidden",
      transition: "background 0.3s ease",
    }}>

      {/* ── Sfondo decorativo (solo dark) ── */}
      {isDark && (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
          <div style={{ position: "absolute", top: "-180px", right: "-120px", width: 520, height: 520, borderRadius: "50%", background: T.glowBg1 }} />
          <div style={{ position: "absolute", bottom: "-120px", left: "-80px", width: 400, height: 400, borderRadius: "50%", background: T.glowBg2 }} />
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1280, margin: "0 auto", padding: "clamp(20px,4vw,48px) clamp(16px,4vw,48px)" }}>

        {/* ── Header ── */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: "clamp(32px,5vw,56px)" }}>

          {/* Logo + titolo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src="/logo_poste.svg" alt="Poste Italiane" style={{ height: 44, width: "auto", filter: isDark ? "brightness(0) invert(1) opacity(0.9)" : "none" }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px", color: T.titleColor, lineHeight: 1.2 }}>
                MEV Governance
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>
                {ambienteAttivo?.descrizione || ambienteAttivo?.codiceContratto || "Piattaforma di gestione"}
              </div>
            </div>
          </div>

          {/* Azioni header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

            {/* Selettore ambiente */}
            {ambienti.length > 1 && (
              <select
                value={ambienteId}
                onChange={e => onSwitchAmbiente(parseInt(e.target.value, 10))}
                style={{
                  padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.inputBorder}`,
                  background: T.inputBg, color: T.inputColor, fontSize: 13,
                  fontFamily: "inherit", cursor: "pointer", outline: "none",
                }}
              >
                {ambienti.map(a => (
                  <option key={a.id} value={a.id} style={{ background: T.optionBg, color: T.optionColor }}>
                    {a.codiceContratto}{a.descrizione ? ` — ${a.descrizione}` : ""}
                  </option>
                ))}
              </select>
            )}
            {ambienti.length === 1 && (
              <span style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.btnBorder}`, background: T.btnBg, color: T.btnColor, fontSize: 13, fontWeight: 600 }}>
                {ambienti[0].codiceContratto}
              </span>
            )}

            {/* Profilo */}
            <button
              onClick={onOpenProfile}
              title="Profilo / API Key AI"
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px", borderRadius: 8,
                border: `1px solid ${T.btnBorder}`,
                background: T.btnBg, color: T.btnColor,
                cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.btnHoverBg}
              onMouseLeave={e => e.currentTarget.style.background = T.btnBg}
            >
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: T.avatarBg, border: `1px solid ${T.avatarBorder}`, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {initials}
              </span>
              <span style={{ lineHeight: 1.2 }}>
                <span style={{ display: "block", fontWeight: 600 }}>{fullName || username}</span>
                <span style={{ display: "block", fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{role}</span>
              </span>
            </button>

            {/* Logout */}
            <button
              onClick={onLogout}
              style={{
                padding: "8px 16px", borderRadius: 8,
                border: `1px solid ${T.logoutBorder}`,
                background: T.logoutBg, color: T.logoutColor,
                cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.logoutHover}
              onMouseLeave={e => e.currentTarget.style.background = T.logoutBg}
            >
              Esci
            </button>
          </div>
        </header>

        {/* ── Hero welcome ── */}
        <div style={{ marginBottom: "clamp(28px,4vw,48px)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: "clamp(26px,3.5vw,38px)", fontWeight: 800, letterSpacing: "-1px", lineHeight: 1.15, color: T.titleColor }}>
            {getGreeting(fullName, username)}, {fullName?.split(" ")[0] || username}
          </div>
          {lastAlign && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: T.textFaint, fontWeight: 500 }}>Ultimo aggiornamento dati</span>
              <div style={{ fontSize: 13, color: T.textMuted, fontWeight: 600, marginTop: 2 }}>
                {new Date(lastAlign).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          )}
        </div>

        {/* ── Griglia card ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))",
          gap: "clamp(10px,1.5vw,16px)",
        }}>
          {visibleCards.map(card => {
            const isHovered = hover === card.id;
            return (
              <button
                key={card.id}
                onClick={() => onNavigate(card.id)}
                onMouseEnter={() => setHover(card.id)}
                onMouseLeave={() => setHover(null)}
                style={{
                  position: "relative", overflow: "hidden",
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  gap: 0, textAlign: "left",
                  padding: "clamp(14px,2vw,20px)",
                  borderRadius: 16,
                  border: `1px solid ${isHovered ? card.accent + "55" : T.cardBorder}`,
                  background: isHovered ? T.cardBgHover : T.cardBg,
                  backdropFilter: isDark ? "blur(12px)" : "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: T.text,
                  boxShadow: isHovered
                    ? `0 6px 24px rgba(0,0,0,${isDark ? "0.3" : "0.1"}), 0 0 0 1px ${card.accent}33`
                    : `0 2px 8px rgba(0,0,0,${isDark ? "0.2" : "0.06"})`,
                  transform: isHovered ? "translateY(-3px)" : "translateY(0)",
                  transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                {/* Linea accento in cima */}
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  borderRadius: "16px 16px 0 0",
                  background: `linear-gradient(90deg, ${card.accent}, ${card.accentDark})`,
                  opacity: isHovered ? 1 : 0.4,
                  transition: "opacity 0.2s",
                }} />

                {/* Icona */}
                <div style={{
                  display: "grid", placeItems: "center",
                  width: 44, height: 44, borderRadius: 12,
                  background: `linear-gradient(135deg, ${card.accent}28, ${card.accentDark}18)`,
                  border: `1px solid ${card.accent}33`,
                  color: card.accent,
                  marginBottom: 12, flexShrink: 0,
                  transition: "transform 0.2s",
                  transform: isHovered ? "scale(1.08)" : "scale(1)",
                }}>
                  {React.cloneElement(card.icon, { width: 22, height: 22 })}
                </div>

                {/* Testo */}
                <div style={{ fontWeight: 700, fontSize: "clamp(13px,1.1vw,15px)", color: T.titleColor, marginBottom: 4, letterSpacing: "-0.2px", display: "flex", alignItems: "center", gap: 6 }}>
                  {card.label}
                  {card.badge && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                      padding: "2px 6px", borderRadius: 4,
                      background: `linear-gradient(135deg, ${card.accent}, ${card.accentDark})`,
                      color: "#fff", lineHeight: 1.4,
                    }}>{card.badge}</span>
                  )}
                </div>
                <div style={{ fontSize: "clamp(11px,0.85vw,12px)", color: T.textMuted, lineHeight: 1.5, flex: 1 }}>
                  {card.description}
                </div>

                {/* Freccia */}
                <div style={{
                  marginTop: 12, alignSelf: "flex-end",
                  width: 24, height: 24, borderRadius: "50%",
                  border: `1px solid ${card.accent}44`,
                  background: `${card.accent}15`,
                  display: "grid", placeItems: "center",
                  color: card.accent, fontSize: 12,
                  transition: "transform 0.2s",
                  transform: isHovered ? "translateX(3px)" : "translateX(0)",
                }}>
                  →
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <footer style={{ marginTop: "clamp(40px,6vw,72px)", borderTop: `1px solid ${T.footerBorder}`, paddingTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 12, color: T.textFaint }}>MEV Governance · Capgemini</span>
          <span style={{ fontSize: 11, color: T.textFaint, letterSpacing: "0.05em" }}>{role}</span>
        </footer>
      </div>
    </div>
  );
}
