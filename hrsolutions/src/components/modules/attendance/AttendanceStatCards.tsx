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
            className={[
              'h-full rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-2xs',
              'flex flex-col gap-2.5 transition-[transform,border-color,box-shadow] duration-150 ease-out',
              interactive ? 'cursor-pointer hover:border-slate-300 active:scale-[0.98]' : '',
              item.active ? 'border-blue-500 ring-2 ring-blue-500/15' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {item.label}
            </div>

            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 leading-none">
                {item.value}
              </span>
              {item.unit && (
                <span className="text-xs font-medium text-slate-400 truncate">{item.unit}</span>
              )}
            </div>

            {item.delta && (
              <p
                className={`text-[11px] font-medium ${
                  item.deltaTone === 'down'
                    ? 'text-rose-600'
                    : item.deltaTone === 'up'
                      ? 'text-emerald-600'
                      : 'text-slate-500'
                }`}
              >
                {item.delta}
              </p>
            )}

            {hasBreakdown && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-medium text-slate-500">
                {item.breakdown!.map((b) => (
                  <span key={b.label}>
                    <span className="font-semibold tabular-nums text-slate-700">{b.value}</span>{' '}
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
