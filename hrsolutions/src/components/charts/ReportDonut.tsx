'use client';

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { DONUT, chartColorAt } from './reportChartTheme';

export type DonutDatum = {
  name: string;
  value: number;
  color?: string;
};

interface ReportDonutProps {
  data: DonutDatum[];
  centerValue?: string | number;
  centerLabel?: string;
  height?: number;
  valueFormatter?: (value: number | string, name?: string) => React.ReactNode;
}

/** Donut with optional center metric — TeamHub Performance / status-share pattern */
export function ReportDonut({
  data,
  centerValue,
  centerLabel,
  height = 176,
  valueFormatter,
}: ReportDonutProps) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={DONUT.innerRadius}
            outerRadius={DONUT.outerRadius}
            paddingAngle={DONUT.paddingAngle}
            stroke={DONUT.stroke}
            strokeWidth={DONUT.strokeWidth}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${entry.name}-${index}`} fill={entry.color || chartColorAt(index)} />
            ))}
          </Pie>
          <Tooltip
            content={<ChartTooltip valueFormatter={valueFormatter} />}
            cursor={false}
          />
        </PieChart>
      </ResponsiveContainer>

      {(centerValue != null || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {centerLabel}
            </span>
          ) : null}
          <span className="text-xl font-bold tabular-nums tracking-tight text-[var(--text-primary)]">
            {centerValue ?? total}
          </span>
        </div>
      )}
    </div>
  );
}
