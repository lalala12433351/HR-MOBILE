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
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs flex flex-col h-full min-h-[200px] ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-1 shrink-0">
        <h3 className="text-xs font-semibold text-slate-900 tracking-tight">{title}</h3>
        <span className="text-[10px] font-medium text-slate-400 shrink-0">{rangeLabel}</span>
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
              cursor={{ fill: 'rgba(15, 23, 42, 0.04)', radius: 6 }}
            />
            <Legend
              iconType="circle"
              iconSize={7}
              wrapperStyle={{ fontSize: 10, paddingTop: 4, color: '#64748b' }}
            />
            <Bar dataKey="Present" stackId="a" fill="#86efac" maxBarSize={28} />
            <Bar dataKey="On Leave" stackId="a" fill="#7dd3fc" maxBarSize={28} />
            <Bar
              dataKey="Absent"
              stackId="a"
              fill="#cbd5e1"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
