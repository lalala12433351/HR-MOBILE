'use client';

import React, { useMemo } from 'react';
import { AppState } from '@/services/store';
import {
  BarChart3,
  TrendingUp,
  Download,
  Users,
  Briefcase,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  CHART_ACCENT,
  CHART_PALETTE,
  CHART_PRIMARY,
  ChartTooltip,
  ReportDonut,
  accentFill,
  chartAxisTick,
  chartGradientDefs,
  chartGridProps,
  chartMargin,
  primaryFill,
} from '@/components/charts';

interface AnalyticsModuleProps {
  state: AppState;
}

export const AnalyticsModule: React.FC<AnalyticsModuleProps> = ({ state }) => {
  const departmentBudgets = useMemo(() => {
    const counts: Record<string, number> = {};
    (state.employees || []).forEach((e) => {
      const dept = e.department || 'Operations';
      counts[dept] = (counts[dept] || 0) + 1;
    });

    const total = Math.max(1, (state.employees || []).length);
    return Object.entries(counts).map(([name, count], idx) => ({
      name,
      value: Math.round((count / total) * 100),
      count,
      color: CHART_PALETTE[idx % CHART_PALETTE.length],
    }));
  }, [state.employees]);

  const taskVelocity = useMemo(() => {
    const tasks = state.tasks || [];
    if (tasks.length === 0) return { rate: '0.0%', completed: 0, total: 0 };
    const completed = tasks.filter((t) => t.status === 'Completed' || t.status === 'Approved').length;
    return {
      rate: `${Math.round((completed / tasks.length) * 1000) / 10}%`,
      completed,
      total: tasks.length,
    };
  }, [state.tasks]);

  const financialTrendsData = useMemo(() => {
    const months = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
    const totalPayrollExpense = (state.payrolls || []).reduce((acc, p) => acc + (Number(p.netSalary) || 0), 0);
    const totalProjectBudget = (state.projects || []).reduce((acc, p) => acc + (Number(p.budget) || 0), 0);

    if (totalPayrollExpense === 0 && totalProjectBudget === 0) {
      return [];
    }

    return months.map((month, idx) => {
      const factor = (idx + 1) / months.length;
      const expense = Math.round(totalPayrollExpense * (0.8 + factor * 0.2));
      const revenue = Math.round(totalProjectBudget * (0.6 + factor * 0.4));
      const profit = Math.max(0, revenue - expense);
      return {
        month,
        revenue,
        expense,
        profit,
      };
    });
  }, [state.payrolls, state.projects]);

  const handleExportCSV = () => {
    const headers = ['Department', 'Headcount', 'Resource Share %'];
    const rows = departmentBudgets.map((d) => [d.name, String(d.count), `${d.value}%`]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Executive_Analytics_Report.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
            <BarChart3 className="h-6 w-6 text-[var(--primary-blue)]" /> Executive BI & Cross-Functional Analytics
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Real-time organizational performance metrics, department efficiencies & operational telemetry
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold rounded-lg transition-[transform,background-color] duration-150 active:scale-[0.97] shadow-sm self-start md:self-auto cursor-pointer"
        >
          <Download className="h-4 w-4 text-[var(--primary-blue)]" /> Export Report (CSV)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Active Departments</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">{departmentBudgets.length}</p>
          <p className="text-[11px] text-emerald-600 mt-1 font-semibold">Configured business units</p>
        </div>

        <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Active Projects</span>
            <div className="p-2 bg-blue-50 text-[var(--primary-blue)] rounded-lg">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-[var(--primary-blue)] tabular-nums">{(state.projects || []).length}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1 font-medium">Enterprise workspace projects</p>
        </div>

        <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Task Completion Velocity</span>
            <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-sky-600 tabular-nums">{taskVelocity.rate}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1 font-medium">
            {taskVelocity.completed} of {taskVelocity.total} tasks completed
          </p>
        </div>

        <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Headcount Strength</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">{(state.employees || []).length} Members</p>
          <p className="text-[11px] text-emerald-600 mt-1 font-medium">Active operational roster</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Project Budget & Operating Cost Trajectory</h3>
            <p className="text-[11px] text-[var(--text-muted)]">Monthly billing vs payroll expenditures in INR (₹)</p>
          </div>

          <div className="h-72 w-full pt-4">
            {financialTrendsData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] text-xs space-y-2">
                <p>No financial or payroll records active yet.</p>
                <p className="text-[11px] text-[var(--text-muted)]">Run a payroll cycle or create projects to populate the financial trajectory.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financialTrendsData} margin={chartMargin}>
                  {chartGradientDefs('analytics-fin')}
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="month" tick={chartAxisTick} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={chartAxisTick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `₹${(val / 100000).toFixed(0)}L`}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        valueFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={CHART_PRIMARY}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill={primaryFill('analytics-fin')}
                    name="Project Budget"
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke={CHART_ACCENT}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill={accentFill('analytics-fin')}
                    name="Operating Margin"
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Department Headcount Share</h3>
            <p className="text-[11px] text-[var(--text-muted)]">Current workforce distribution across departments</p>
          </div>

          <div className="w-full flex items-center justify-center">
            {departmentBudgets.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] h-44 flex items-center">No departments configured</div>
            ) : (
              <ReportDonut
                data={departmentBudgets}
                centerValue={(state.employees || []).length}
                centerLabel="People"
                height={200}
                valueFormatter={(v) => `${v}%`}
              />
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--border-color)] text-xs">
            {departmentBudgets.map((dept) => (
              <div key={dept.name} className="flex items-center justify-between text-[var(--text-secondary)]">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
                  {dept.name} ({dept.count})
                </span>
                <span className="font-bold text-[var(--text-primary)] tabular-nums">{dept.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
