'use client';
import React, { useEffect, useState } from 'react';

/** Desktop filters stay expanded; phones disclose the same controls on demand. */
export function ResponsiveFilters({ children, active = false, expanded }: { children: React.ReactNode; active?: boolean; expanded?: boolean }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const sync = () => setOpen(!query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return <details className="mobile-filter-disclosure" open={expanded ?? open} onToggle={(event) => { if (expanded === undefined) setOpen(event.currentTarget.open); }}>
    <summary>Filters{active ? ' \u00b7 Active' : ''}</summary>
    <div className="mobile-filter-content">{children}</div>
  </details>;
}
