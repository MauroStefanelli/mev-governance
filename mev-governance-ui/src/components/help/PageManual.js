import React from 'react';
import ConfiguratorManual, { UserManual } from '../../configuratore/ConfiguratorManual';
import { PAGE_MANUALS, homeManualChapters } from './pageManuals';

export default function PageManual({ page, homePages = [] }) {
  if (page === 'home') return <UserManual title="Guida rapida · MEV Governance" subtitle="Le sezioni dell’app, in poche parole." triggerLabel="Guida rapida" triggerHint="Scopri cosa puoi fare" chapters={homeManualChapters(homePages)} />;
  if (page === 'configuratore') return <ConfiguratorManual />;
  const manual = PAGE_MANUALS[page];
  if (!manual?.chapters) return null;
  return <UserManual title={manual.title} subtitle={manual.summary} chapters={manual.chapters} compact />;
}
