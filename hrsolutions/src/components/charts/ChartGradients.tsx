'use client';

import React from 'react';
import { CHART_ACCENT, CHART_PRIMARY } from './reportChartTheme';

interface ChartGradientsProps {
  /** Unique prefix so multiple charts on one page don't clash */
  idPrefix?: string;
  primary?: string;
  accent?: string;
}

/** SVG gradient defs for area fills — soft fade like TeamHub Team Performance chart */
export function ChartGradients({
  idPrefix = 'rpt',
  primary = CHART_PRIMARY,
  accent = CHART_ACCENT,
}: ChartGradientsProps) {
  return (
    <defs>
      <linearGradient id={`${idPrefix}-primary`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={primary} stopOpacity={0.22} />
        <stop offset="100%" stopColor={primary} stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-accent`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={accent} stopOpacity={0.2} />
        <stop offset="100%" stopColor={accent} stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-bar`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={primary} stopOpacity={1} />
        <stop offset="100%" stopColor={primary} stopOpacity={0.72} />
      </linearGradient>
    </defs>
  );
}

/** Prefer this inside Recharts — returns a native <defs> element Recharts will keep. */
export function chartGradientDefs(
  idPrefix = 'rpt',
  primary = CHART_PRIMARY,
  accent = CHART_ACCENT
): React.ReactElement {
  return (
    <defs>
      <linearGradient id={`${idPrefix}-primary`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={primary} stopOpacity={0.22} />
        <stop offset="100%" stopColor={primary} stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-accent`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={accent} stopOpacity={0.2} />
        <stop offset="100%" stopColor={accent} stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${idPrefix}-bar`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={primary} stopOpacity={1} />
        <stop offset="100%" stopColor={primary} stopOpacity={0.72} />
      </linearGradient>
    </defs>
  );
}

export function primaryFill(idPrefix = 'rpt') {
  return `url(#${idPrefix}-primary)`;
}

export function accentFill(idPrefix = 'rpt') {
  return `url(#${idPrefix}-accent)`;
}

export function barFill(idPrefix = 'rpt') {
  return `url(#${idPrefix}-bar)`;
}
