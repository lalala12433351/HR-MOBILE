'use client';

import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import {
  chartAxisTickSm,
  chartGridProps,
} from '@/components/charts/reportChartTheme';

export interface AttendanceOverviewDatum {
  label: string;
  present: number;
  onLeave: number;
  absent: number;
}

interface AttendanceOverviewChartProps {
  data: AttendanceOverviewDatum[];
  title?: string;
  rangeLabel?: string;
  className?: string;
}

const CHART_MARGIN = { top: 4, right: 4, left: 0, bottom: 0 } as const;
const Y_TICKS = [0, 50, 100] as const;

export function AttendanceOverviewChart({
  data,
  title = 'Overview',
  rangeLabel = '6 months',
  className = '',
}: AttendanceOverviewChartProps) {
  const chartData = useMemo(
    () =>
      data.map((d) => {
        const total = Math.max(1, d.present + d.onLeave + d.absent);
        return {
          label: d.label,
          Present: Math.round((d.present / total) * 100),
          'On Leave': Math.round((d.onLeave / total) * 100),
          Absent: Math.round((d.absent / total) * 100),
        };
      }),
    [data]
  );

  return (
    <div className={`att-stat h-full min-h-[200px] ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-[16px] font-[750] tracking-[-0.02em]">{title}</h3>
        <span className="text-[11px] text-[var(--text-muted)] shrink-0">{rangeLabel}</span>
      </div>
      <div className="flex-1 w-full min-h-[160px]">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <BarChart data={chartData} margin={CHART_MARGIN} barCategoryGap="32%">
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="label" tick={chartAxisTickSm} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, 100]}
              ticks={[...Y_TICKS]}
              tick={chartAxisTickSm}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              width={36}
            />
            <Tooltip
              content={<ChartTooltip valueFormatter={(v) => `${v}%`} />}
              cursor={{ fill: 'rgba(23, 50, 78, 0.05)', radius: 6 }}
            />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 11, paddingTop: 4, color: '#5e6c7b' }}
            />
            <Bar dataKey="Present" stackId="a" fill="#53886b" maxBarSize={28} />
            <Bar dataKey="On Leave" stackId="a" fill="#17324e" maxBarSize={28} />
            <Bar
              dataKey="Absent"
              stackId="a"
              fill="#c5d0d8"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
