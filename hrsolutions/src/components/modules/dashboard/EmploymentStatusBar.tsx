'use client';

import React, { useMemo } from 'react';
import { useDashboardContext } from './DashboardDataContext';

export const EmploymentStatusBar: React.FC = () => {
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
      color: 'var(--primary-blue)',
      ...stats.fullTime,
    },
    {
      key: 'pt',
      label: 'Part-Time',
      color: 'var(--accent-purple)',
      ...stats.partTime,
    },
    {
      key: 'ct',
      label: 'Contractor',
      color: '#06b6d4',
      ...stats.contract,
    },
    {
      key: 'it',
      label: 'Internship',
      color: '#94a3b8',
      ...stats.intern,
    },
  ];

  return (
    <div className="dash-card p-5" data-purpose="employment-status-card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
          Employment Status
        </h2>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="dash-kpi text-[32px]">{stats.total}</span>
        <span className="text-xs font-semibold text-[var(--text-muted)]">Employees</span>
      </div>

      <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-[color-mix(in_srgb,var(--border-color)_55%,var(--bg-surface-subtle))] mb-1.5">
        {segments.map((seg) =>
          seg.percent > 0 ? (
            <div
              key={seg.key}
              className="h-full transition-[width] duration-200 ease-[cubic-bezier(0.77,0,0.175,1)] first:rounded-l-full last:rounded-r-full"
              style={{ width: `${seg.percent}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${seg.percent}%`}
            />
          ) : null
        )}
      </div>

      <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-semibold mb-5">
        <span>0%</span>
        <span>100%</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-1">
        {segments.map((seg) => (
          <div key={seg.key}>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-3.5 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-sm font-bold text-[var(--text-primary)]">{seg.label}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1 pl-4.5 font-medium">
              <strong className="font-bold text-[var(--text-primary)] tabular-nums">
                {seg.percent}%
              </strong>
              <span className="text-[var(--text-muted)] mx-1.5">—</span>
              <span className="tabular-nums">{seg.count} Employees</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
