'use client';

import React from 'react';

type TooltipItem = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  /** Optional formatter for values */
  valueFormatter?: (value: number | string, name?: string) => React.ReactNode;
}

/**
 * Light card tooltip matching TeamHub chart craft.
 * Instant (no enter animation) — charts are hovered often.
 */
export function ChartTooltip({ active, payload, label, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="z-50 min-w-[140px] rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2.5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.18)]"
      style={{ fontFamily: 'var(--font-plus-jakarta), Plus Jakarta Sans, sans-serif' }}
    >
      {label != null && label !== '' && (
        <p className="mb-1.5 border-b border-[var(--border-color)] pb-1.5 text-[11px] font-bold text-[var(--text-primary)]">
          {label}
        </p>
      )}
      <div className="space-y-1.5">
        {payload.map((item, idx) => {
          const color = item.color || 'var(--primary-blue)';
          const display =
            valueFormatter && item.value != null
              ? valueFormatter(item.value, item.name)
              : item.value;

          return (
            <div key={idx} className="flex items-center justify-between gap-5 text-[11px]">
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span>{item.name}</span>
              </span>
              <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                {display}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
