import React from 'react';
import ConfiguratorManual, { UserManual } from '../../configuratore/ConfiguratorManual';
import { PAGE_MANUALS, homeManualChapters } from './pageManuals';
import { forRole, readerRole, readerLabel } from './manualRoles';

export default function PageManual({ page, homePages = [], role = '', roles = [] }) {
  const reader = readerRole(role, roles);
  if (page === 'home') return <UserManual title="Guida rapida · MEV Governance" subtitle="Le sezioni dell’app, in poche parole." triggerLabel="Guida rapida" triggerHint="Scopri cosa puoi fare" chapters={homeManualChapters(homePages)} />;
  if (page === 'configuratore') return <ConfiguratorManual />;
  const manual = PAGE_MANUALS[page];
  if (!manual?.chapters) return null;
  const chapters = forRole(manual.chapters, reader);
  if (!chapters.length) return null;
  return <UserManual title={manual.title} subtitle={`${manual.summary}${reader ? ` ${readerLabel(reader)}.` : ''}`} chapters={chapters} compact />;
}

// Il manuale che compare nella barra in alto: cambia quando cambia la pagina o il ruolo (per esempio dopo aver cambiato contratto), cosi' non resta aperto il manuale di un altro ruolo.
export const manualKey = (page, role, roles = []) => `${page}:${readerRole(role, roles)}`;
export function HeaderManual({ page, role, roles }) {
  return <PageManual key={manualKey(page, role, roles)} page={page} role={role} roles={roles} />;
}
