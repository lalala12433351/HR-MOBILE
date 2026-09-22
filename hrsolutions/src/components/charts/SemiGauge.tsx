'use client';

import React from 'react';
import { CHART_PRIMARY, CHART_TRACK } from './reportChartTheme';

interface SemiGaugeProps {
  value: number;
  max?: number;
  label?: string;
  trendLabel?: string;
  size?: number;
  color?: string;
  trackColor?: string;
}

/**
 * Semi-circular score gauge inspired by TeamHub "Average Performance".
 * Pure SVG — no animation on mount (KPI glance, seen often).
 */
export function SemiGauge({
  value,
  max = 100,
  label = 'Total Score',
  trendLabel,
  size = 168,
  color = CHART_PRIMARY,
  trackColor = CHART_TRACK,
}: SemiGaugeProps) {
  const pct = Math.max(0, Math.min(1, value / max));
  const stroke = 14;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Semi-circle from left (-180°) to right (0°)
  const circumference = Math.PI * r;
  const dash = circumference * pct;

  return (
    <div className="relative mx-auto flex flex-col items-center" style={{ width: size, height: size * 0.62 }}>
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`} aria-hidden>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        <span className="text-3xl font-bold tabular-nums tracking-tight text-[var(--text-primary)]">
          {Math.round(value * 10) / 10}
          <span className="text-lg font-semibold text-[var(--text-muted)]">%</span>
        </span>
        {trendLabel ? (
          <span className="mt-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            {trendLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
