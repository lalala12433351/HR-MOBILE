'use client';

import React from 'react';

export type AttendanceStatTone = 'present' | 'leave' | 'absent' | 'neutral' | 'primary';

export interface AttendanceStatBreakdown {
  label: string;
  value: string | number;
}

export interface AttendanceStatCardItem {
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
  breakdown?: AttendanceStatBreakdown[];
  tone?: AttendanceStatTone;
  onClick?: () => void;
  active?: boolean;
}

interface AttendanceStatCardsProps {
  items: AttendanceStatCardItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function AttendanceStatCards({
  items,
  columns = 3,
  className = '',
}: AttendanceStatCardsProps) {
  const colClass =
    columns === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : columns === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-3';

  return (
    <div className={`grid ${colClass} gap-3 h-full ${className}`}>
      {items.map((item) => {
        const interactive = Boolean(item.onClick);
        const Comp = interactive ? 'button' : 'div';
        const hasBreakdown = Boolean(item.breakdown && item.breakdown.length > 0);

        return (
          <Comp
            key={item.id}
            type={interactive ? 'button' : undefined}
            onClick={item.onClick}
            className={`att-stat${item.active ? ' is-active' : ''}`}
          >
            <div className="att-stat-label">{item.label}</div>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="att-stat-value">{item.value}</span>
              {item.unit && (
                <span className="text-[12px] text-[var(--text-muted)] truncate">{item.unit}</span>
              )}
            </div>
            {item.delta && (
              <p
                className={`text-[11px] font-medium ${
                  item.deltaTone === 'down'
                    ? 'text-[var(--studio-error)]'
                    : item.deltaTone === 'up'
                      ? 'text-[#2f5d45]'
                      : 'text-[var(--text-muted)]'
                }`}
              >
                {item.delta}
              </p>
            )}
            {hasBreakdown && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                {item.breakdown!.map((b) => (
                  <span key={b.label}>
                    <span className="tabular-nums text-[var(--text-secondary)]">{b.value}</span>{' '}
                    {b.label}
                  </span>
                ))}
              </div>
            )}
          </Comp>
        );
      })}
    </div>
  );
}
