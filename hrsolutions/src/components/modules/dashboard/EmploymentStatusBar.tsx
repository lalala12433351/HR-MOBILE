'use client';

import React, { useMemo } from 'react';
import { useDashboardContext } from './DashboardDataContext';
import { DashPanel } from './DashPanel';

export const EmploymentStatusBar: React.FC<{ className?: string }> = ({ className = '' }) => {
  const dashboardState = useDashboardContext();
  const employees = dashboardState.employees || [];

  const stats = useMemo(() => {
    const total = employees.length;
    let ft = 0;
    let pt = 0;
    let ct = 0;
    let it = 0;

    employees.forEach((e) => {
      const type = (e.employmentType || '').toLowerCase();
      if (type.includes('part')) pt++;
      else if (type.includes('intern')) it++;
      else if (type.includes('contract') || type.includes('freelance')) ct++;
      else ft++;
    });

    const ftPercent = total > 0 ? Math.round((ft / total) * 100) : 0;
    const ptPercent = total > 0 ? Math.round((pt / total) * 100) : 0;
    const ctPercent = total > 0 ? Math.round((ct / total) * 100) : 0;
    const itPercent = total > 0 ? Math.max(0, 100 - ftPercent - ptPercent - ctPercent) : 0;

    return {
      total,
      fullTime: { count: ft, percent: ftPercent },
      partTime: { count: pt, percent: ptPercent },
      contract: { count: ct, percent: ctPercent },
      intern: { count: it, percent: itPercent },
    };
  }, [employees]);

  const segments = [
    {
      key: 'ft',
      label: 'Full-Time',
      color: 'var(--studio-navy)',
      ...stats.fullTime,
    },
    {
      key: 'pt',
      label: 'Part-Time',
      color: 'var(--primary-blue)',
      ...stats.partTime,
    },
    {
      key: 'ct',
      label: 'Contractor',
      color: 'var(--studio-sage)',
      ...stats.contract,
    },
    {
      key: 'it',
      label: 'Internship',
      color: 'var(--border-strong)',
      ...stats.intern,
    },
  ];

  return (
    <DashPanel title="Employment mix" className={className} purpose="employment-status-card">
      <div className="flex items-baseline gap-1.5 mb-2.5">
        <span className="dash-kpi">{stats.total}</span>
        <span className="text-xs font-semibold text-[var(--text-muted)]">People</span>
      </div>

      <div className="w-full h-1.5 overflow-hidden flex bg-[color-mix(in_srgb,var(--border-color)_55%,var(--bg-surface-subtle))] mb-1">
        {segments.map((seg) =>
          seg.percent > 0 ? (
            <div
              key={seg.key}
              className="h-full transition-[width] duration-200 ease-out"
              style={{ width: `${seg.percent}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${seg.percent}%`}
            />
          ) : null
        )}
      </div>

      <div>
        {segments.map((seg) => (
          <div key={seg.key} className="dash-row">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              {seg.label}
            </span>
            <span className="text-xs text-[var(--text-secondary)] tabular-nums">
              <strong className="font-bold text-[var(--text-primary)]">{seg.percent}%</strong>
              <span className="text-[var(--text-muted)] mx-1.5">·</span>
              {seg.count}
            </span>
          </div>
        ))}
      </div>
    </DashPanel>
  );
};
