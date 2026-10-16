'use client';

import React, { useMemo, useState } from 'react';
import { AppState } from '@/services/store';
import { Download, Users, Briefcase, CheckSquare, CalendarCheck } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { getDefaultReportSettings, OverviewWidgetId } from '@/utils/reportCatalog';
import {
  BAR_MAX_SIZE,
  BAR_RADIUS,
  CHART_MUTED,
  CHART_PALETTE,
  ChartTooltip,
  ReportDonut,
  SemiGauge,
  barFill,
  chartAxisTick,
  chartGradientDefs,
  chartGridProps,
  chartMargin,
} from '@/components/charts';

interface OpsOverviewProps {
  state: AppState;
}

function monthKey(offset: 0 | -1 = 0): string {
  const d = new Date();
  if (offset === -1) d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const OpsOverview: React.FC<OpsOverviewProps> = ({ state }) => {
  const reportSettings = {
    ...getDefaultReportSettings(),
    ...(state.customOptions?.reportSettings || {}),
  };

  const enabledWidgets = useMemo(() => {
    const list = reportSettings.enabledOverviewWidgets;
    if (Array.isArray(list) && list.length > 0) return list as OverviewWidgetId[];
    return getDefaultReportSettings().enabledOverviewWidgets;
  }, [reportSettings.enabledOverviewWidgets]);

  const isWidgetOn = (id: OverviewWidgetId) => enabledWidgets.includes(id);

  const [selectedMonth, setSelectedMonth] = useState(() =>
    monthKey((reportSettings.defaultMonthOffset as 0 | -1) ?? 0)
  );

  const employees = state.employees || [];
  const projects = state.projects || [];
  const tasks = state.tasks || [];
  const attendance = state.attendance || [];
  const leaves = state.leaves || [];

  const headcountByDept = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((e) => {
      if (e.status === 'Deactivated') return;
      const dept = e.department || 'Operations';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count], idx) => ({
        name,
        count,
        color: CHART_PALETTE[idx % CHART_PALETTE.length],
      }))
      .sort((a, b) => b.count - a.count);
  }, [employees]);

  const projectBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      const status = p.status || 'In Progress';
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count], idx) => ({
      name,
      count,
      color: CHART_PALETTE[idx % CHART_PALETTE.length],
    }));
  }, [projects]);

  const taskVelocity = useMemo(() => {
    if (tasks.length === 0) return { rate: 0, completed: 0, total: 0, open: 0 };
    const completed = tasks.filter(
      (t) => t.status === 'Completed' || t.status === 'Approved'
    ).length;
    return {
      rate: Math.round((completed / tasks.length) * 1000) / 10,
      completed,
      total: tasks.length,
      open: tasks.length - completed,
    };
  }, [tasks]);

  const attendanceSnapshot = useMemo(() => {
    const monthPunches = attendance.filter((a) => a.date?.startsWith(selectedMonth));
    const monthLeaves = leaves.filter(
      (l) =>
        (l.startDate?.startsWith(selectedMonth) || l.endDate?.startsWith(selectedMonth)) &&
        l.status === 'Approved'
    );
    const present = monthPunches.filter(
      (p) => p.status === 'Present' || p.status === 'Late' || p.status === 'Work From Home'
    ).length;
    const late = monthPunches.filter((p) => p.status === 'Late').length;
    const leaveDays = monthLeaves.reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);
    const staff = employees.filter((e) => e.status !== 'Deactivated').length;
    const daysInMonth = new Date(
      Number(selectedMonth.slice(0, 4)),
      Number(selectedMonth.slice(5, 7)),
      0
    ).getDate();
    const scheduled = staff * daysInMonth;
    const rate = scheduled > 0 ? Math.min(100, Math.round((present / scheduled) * 1000) / 10) : 0;
    return { present, late, leaveDays, rate, punchCount: monthPunches.length, staff };
  }, [attendance, leaves, employees, selectedMonth]);

  const kpiCards = useMemo(() => {
    const cards: { title: string; value: string; icon: React.ReactNode }[] = [];
    if (isWidgetOn('headcount')) {
      cards.push({
        title: 'Active Headcount',
        value: String(employees.filter((e) => e.status !== 'Deactivated').length),
        icon: <Users className="h-4 w-4 text-[var(--primary-blue)]" />,
      });
    }
    if (isWidgetOn('projects')) {
      cards.push({
        title: 'Active Projects',
        value: String(projects.length),
        icon: <Briefcase className="h-4 w-4 text-[var(--primary-blue)]" />,
      });
    }
    if (isWidgetOn('tasks')) {
      cards.push({
        title: 'Task Completion',
        value: `${taskVelocity.rate}%`,
        icon: <CheckSquare className="h-4 w-4 text-[var(--primary-blue)]" />,
      });
    }
    if (isWidgetOn('attendance_snapshot')) {
      cards.push({
        title: 'Attendance Rate',
        value: `${attendanceSnapshot.rate}%`,
        icon: <CalendarCheck className="h-4 w-4 text-[var(--primary-blue)]" />,
      });
    }
    return cards;
  }, [employees, projects, taskVelocity, attendanceSnapshot, enabledWidgets]);

  const handleExportCSV = () => {
    const headers = ['Department', 'Headcount'];
    const rows = headcountByDept.map((d) => [d.name, String(d.count)]);
    if (isWidgetOn('attendance_snapshot')) {
      headers.push('Metric', 'Value');
      rows.push(['—', '—']);
      rows.push(['Attendance Rate', `${attendanceSnapshot.rate}%`]);
      rows.push(['Late Days', String(attendanceSnapshot.late)]);
      rows.push(['Leave Days', String(attendanceSnapshot.leaveDays)]);
    }
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ops_overview_${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (enabledWidgets.length === 0) {
    return (
      <div className="p-12 text-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]  max-w-md mx-auto my-12 space-y-2">
        <h3 className="text-base font-bold text-[var(--text-primary)]">All Overview Widgets Disabled</h3>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Re-enable widgets in Reports Settings to see operational analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-7 space-y-5 overflow-y-auto bg-[var(--bg-surface-subtle)]/60">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
          Ops Overview
        </h2>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] font-medium focus:border-blue-600 outline-none text-xs cursor-pointer font-mono"
          />
          {reportSettings.allowCsvExport !== false && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.97] text-white text-xs font-semibold  transition-[transform,background-color] duration-150 cursor-pointer"
              style={{ boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.20)' }}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {reportSettings.showKpiCards !== false && kpiCards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((kpi) => (
            <div
              key={kpi.title}
              className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]  space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  {kpi.title}
                </span>
                {kpi.icon}
              </div>
              <p className="text-2xl font-bold tracking-tight text-[var(--text-primary)] font-mono">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {reportSettings.showCharts !== false && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {isWidgetOn('headcount') && (
            <div className="lg:col-span-7 p-5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]  space-y-3">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Headcount by Department
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Active staff across business units</p>
              </div>
              <div className="h-56 w-full">
                {headcountByDept.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)]">
                    No employee data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={headcountByDept} margin={chartMargin} barCategoryGap="28%">
                      {chartGradientDefs('ops-hc')}
                      <CartesianGrid {...chartGridProps} />
                      <XAxis
                        dataKey="name"
                        tick={chartAxisTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={chartAxisTick}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
                      <Bar
                        dataKey="count"
                        name="Headcount"
                        fill={barFill('ops-hc')}
                        radius={BAR_RADIUS}
                        maxBarSize={BAR_MAX_SIZE}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {isWidgetOn('projects') && (
            <div className="lg:col-span-5 p-5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]  space-y-3 flex flex-col">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Project Status
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{projects.length} total projects</p>
              </div>
              <div className="flex-1 min-h-[11rem]">
                {projectBreakdown.length === 0 ? (
                  <div className="h-44 flex items-center justify-center text-xs text-[var(--text-muted)]">
                    No projects yet
                  </div>
                ) : (
                  <ReportDonut
                    data={projectBreakdown.map((p) => ({
                      name: p.name,
                      value: p.count,
                      color: p.color,
                    }))}
                    centerValue={projects.length}
                    centerLabel="Projects"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-secondary)]">
                {projectBreakdown.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5 truncate">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.name}</span>
                    <span className="font-mono font-semibold text-[var(--text-primary)] ml-auto">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isWidgetOn('tasks') && (
            <div className="lg:col-span-6 p-5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]  space-y-4">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Task Completion Velocity
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Live task pipeline across projects</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <SemiGauge
                  value={taskVelocity.rate}
                  label="Completion"
                  trendLabel={`${taskVelocity.completed}/${taskVelocity.total} done`}
                  size={160}
                />
                <div className="grid grid-cols-3 sm:grid-cols-1 gap-2.5">
                  <div className="p-3 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-color)]">
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Total</p>
                    <p className="text-xl font-bold font-mono text-[var(--text-primary)] mt-1">{taskVelocity.total}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
                    <p className="text-[10px] font-semibold text-emerald-700 uppercase">Done</p>
                    <p className="text-xl font-bold font-mono text-emerald-800 mt-1">{taskVelocity.completed}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-100">
                    <p className="text-[10px] font-semibold text-amber-700 uppercase">Open</p>
                    <p className="text-xl font-bold font-mono text-amber-800 mt-1">{taskVelocity.open}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isWidgetOn('attendance_snapshot') && (
            <div className="lg:col-span-6 p-5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]  space-y-4">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Attendance Snapshot
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Month {selectedMonth} presence summary</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <SemiGauge
                  value={attendanceSnapshot.rate}
                  label="Attendance"
                  color="#0ea5e9"
                  size={160}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 p-3 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-color)]">
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Punches</p>
                    <p className="text-lg font-bold font-mono text-[var(--text-primary)]">{attendanceSnapshot.punchCount}</p>
                  </div>
                  <div className="space-y-1 p-3 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-color)]">
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Staff</p>
                    <p className="text-lg font-bold font-mono text-[var(--text-primary)]">{attendanceSnapshot.staff}</p>
                  </div>
                  <div className="space-y-1 p-3 rounded-lg bg-amber-50/60 border border-amber-100">
                    <p className="text-[10px] font-semibold text-amber-700 uppercase">Late</p>
                    <p className="text-lg font-bold font-mono text-amber-800">{attendanceSnapshot.late}</p>
                  </div>
                  <div className="space-y-1 p-3 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-color)]">
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Leave Days</p>
                    <p className="text-lg font-bold font-mono text-[var(--text-primary)]">{attendanceSnapshot.leaveDays}</p>
                  </div>
                </div>
              </div>
              {/* Employment-status style stacked bar */}
              <div className="pt-1">
                <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--bg-surface-subtle)] flex">
                  <div
                    className="h-full bg-blue-600 transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.min(100, attendanceSnapshot.rate)}%` }}
                    title="Present rate"
                  />
                  <div
                    className="h-full bg-amber-400"
                    style={{
                      width: `${Math.min(
                        100 - Math.min(100, attendanceSnapshot.rate),
                        attendanceSnapshot.punchCount > 0
                          ? (attendanceSnapshot.late / Math.max(1, attendanceSnapshot.punchCount)) * 100
                          : 0
                      )}%`,
                    }}
                    title="Late share"
                  />
                  <div className="h-full flex-1 bg-slate-200" style={{ minWidth: 0 }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> Present
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Late
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CHART_MUTED }} /> Remainder
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isWidgetOn('headcount') && headcountByDept.length > 0 && (
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]  overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-color)]">
            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Department Roster</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[var(--bg-surface-subtle)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-5 py-2.5">Department</th>
                  <th className="px-5 py-2.5 text-right">Headcount</th>
                  <th className="px-5 py-2.5 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {headcountByDept.map((row) => {
                  const total = headcountByDept.reduce((s, d) => s + d.count, 0) || 1;
                  const share = Math.round((row.count / total) * 1000) / 10;
                  return (
                    <tr key={row.name} className="hover:bg-[var(--bg-surface-subtle)]/80">
                      <td className="px-5 py-3 font-semibold text-[var(--text-primary)]">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          {row.name}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-[var(--text-primary)]">{row.count}</td>
                      <td className="px-5 py-3 text-right font-mono text-[var(--text-secondary)]">{share}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
