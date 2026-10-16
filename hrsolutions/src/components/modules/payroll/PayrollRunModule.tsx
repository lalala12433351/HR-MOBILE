'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AppState } from '@/services/store';
import { PayrollIncentive, PayrollRecord } from '@/types';
import { api } from '@/services/apiClient';
import {
  buildPayrollRun,
  loadPayrollDraft,
  savePayrollDraft,
} from '@/utils/payrollRun';
import { BankDisbursementRow, buildBankDisbursementRows, downloadPayrollWorkbook } from '@/utils/payrollExcel';
import { PayrollHeaderSwitch } from './PayrollHeaderSwitch';
import { UserReportModal } from '@/components/modules/reports/UserReportModal';
import { buildUserReport } from '@/utils/userReport';

type PayrollStep = 'review' | 'adjustments' | 'export';

interface PayrollRunModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  step: PayrollStep;
}

const inr = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value) || 0
  );

const controlClass =
  'h-10 rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[#2d628e] focus-visible:ring-offset-1';
const primaryBtn =
  'inline-flex h-10 items-center justify-center rounded-[7px] bg-[#17324e] px-4 text-sm font-semibold text-white hover:bg-[#285275] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d628e] focus-visible:ring-offset-1';
const secondaryBtn =
  'inline-flex h-10 items-center justify-center rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[#f8fbfe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d628e] focus-visible:ring-offset-1';

export const PayrollRunModule: React.FC<PayrollRunModuleProps> = ({ state, onUpdateState, step }) => {
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [incentives, setIncentives] = useState<PayrollIncentive[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [incentiveType, setIncentiveType] = useState<PayrollIncentive['type']>('incentive');
  const [reportEmployeeId, setReportEmployeeId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const stored = loadPayrollDraft();
    if (stored) {
      setMonth(stored.month);
      setYear(stored.year);
      setIncentives(stored.incentives);
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    savePayrollDraft({ month, year, incentives });
  }, [month, year, incentives, draftReady]);

  const employees = state.employees || [];

  const run = useMemo(
    () =>
      buildPayrollRun({
        employees,
        attendance: state.attendance || [],
        leaves: state.leaves || [],
        timesheets: state.timesheets || [],
        groups: state.customOptions?.payrollGroups || [],
        settings: state.customOptions?.payrollSettings,
        salaryComponents: state.customOptions?.salaryComponents || [],
        incentives,
        fullDayMinimumHours: state.customOptions?.attendanceSettings?.fullDayMinimumHours,
        year,
        month,
      }),
    [employees, state.attendance, state.leaves, state.timesheets, state.customOptions, incentives, year, month]
  );

  const visibleLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return run.lines;
    return run.lines.filter(
      (line) =>
        line.employeeName.toLowerCase().includes(q) ||
        String(line.department || '').toLowerCase().includes(q) ||
        String(line.payrollGroupName || '').toLowerCase().includes(q)
    );
  }, [run.lines, query]);

  const selected = run.lines.find((line) => line.employeeId === selectedId) || null;
  const selectedIncentives = incentives.filter((item) => item.employeeId === selectedId);
  const reportEmployee = employees.find((employee) => employee.id === reportEmployeeId) || null;
  const reportLine = run.lines.find((line) => line.employeeId === reportEmployeeId) || null;
  const userReport =
    reportEmployee &&
    buildUserReport({
      employee: reportEmployee,
      range: { start: run.period.start, end: run.period.attendanceEnd },
      attendance: state.attendance || [],
      leaves: state.leaves || [],
      tasks: state.tasks || [],
      timesheets: state.timesheets || [],
      payrollLine: reportLine,
    });

  const addIncentive = () => {
    if (!selectedId) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error('Enter an incentive amount.');
      return;
    }
    if (!reason.trim()) {
      toast.error('Add a reason for this incentive.');
      return;
    }
    setIncentives((prev) => [
      ...prev,
      {
        id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        employeeId: selectedId,
        amount: value,
        reason: reason.trim(),
        type: incentiveType,
      },
    ]);
    setAmount('');
    setReason('');
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadPayrollWorkbook({
        period: run.period,
        totals: run.totals,
        lines: run.lines,
        employees,
        companyName: state.organization?.name,
      });
      const processed = run.lines.map((line) => ({ ...line, status: 'Processed' as const }));
      onUpdateState((prev) => ({
        ...prev,
        payrolls: [...processed, ...(prev.payrolls || []).filter((row: PayrollRecord) => row.monthYear !== run.period.monthYear)],
      }));
      const runResult = await api.payroll.executePayrollRun({
        month,
        year,
        executedByEmployeeId: state.currentPersona?.id,
      });
      if (!runResult.success) {
        console.warn('[Payroll] backend run skipped', runResult.error);
      }
      const missingBank = buildBankDisbursementRows(run.lines, employees, run.period.monthYear).filter(
        (row) => !row.ready
      ).length;
      if (missingBank) {
        toast.success(`Bank file downloaded. ${missingBank} employee${missingBank === 1 ? '' : 's'} still missing account details.`);
      } else {
        toast.success(`Bank disbursement file ready for ${run.period.monthYear}.`);
      }
    } catch (error) {
      console.warn('[Payroll] export failed', error);
      toast.error('Could not export the Excel file.');
    } finally {
      setExporting(false);
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex shrink-0 flex-col gap-4 border-b border-[var(--border-color)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <PayrollHeaderSwitch active="payroll" />
          <p className="mt-1 max-w-[62ch] text-[14px] leading-6 text-[var(--text-secondary)]">
            Review hours, LOP and deductions, then add incentives and export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))} aria-label="Pay month" className={controlClass}>
            {monthOptions.map((value) => (
              <option key={value} value={value}>
                {new Date(2026, value - 1, 1).toLocaleDateString('en-IN', { month: 'long' })}
              </option>
            ))}
          </select>
          <select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Pay year" className={controlClass}>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search employee"
            aria-label="Search employee"
            className={`${controlClass} w-[11.5rem] font-normal`}
          />
          <Link href="/settings?section=payroll" className={secondaryBtn}>
            Settings
          </Link>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Company net" value={inr(run.totals.totalNet)} hint={run.totals.periodLabel} />
        <SummaryCard label="Employees" value={String(run.totals.employeeCount)} hint={`Paid on day ${run.totals.disbursementDay}`} />
        <SummaryCard label="Gross + incentives" value={inr(run.totals.totalGross + run.totals.totalIncentives)} hint={`${inr(run.totals.totalIncentives)} incentives`} />
        <SummaryCard
          label="Deductions & LOP"
          value={inr(run.totals.totalDeductions)}
          hint={`${inr(run.totals.totalLop)} LOP · ${run.totals.shortHoursCount} short`}
        />
      </div>

      {step === 'review' && (
        <>
          <PayrollTable
            lines={visibleLines}
            onSelect={(id) => setReportEmployeeId(id)}
          />
          <div className="flex shrink-0 justify-end pt-1">
            <button type="button" disabled={!run.lines.length} onClick={() => router.push('/payroll/adjustments')} className={primaryBtn}>
              Continue to incentives
            </button>
          </div>
        </>
      )}

      {step === 'adjustments' && (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-5 lg:grid-cols-[minmax(0,1.6fr)_20rem]">
          <PayrollTable
            lines={visibleLines}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setReportEmployeeId(id);
            }}
          />
          <aside className="flex min-h-0 flex-col overflow-y-auto rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
            {selected ? (
              <>
                <h2 className="text-base font-bold tracking-[-0.02em] text-[var(--text-primary)]">{selected.employeeName}</h2>
                <p className="mt-1 text-[14px] text-[var(--text-secondary)]">Net {inr(selected.netPay)}. Add an incentive with a reason.</p>
                <label className="mt-3 block text-[12px] font-semibold text-[var(--text-muted)]">Type</label>
                <select
                  value={incentiveType}
                  onChange={(event) => setIncentiveType(event.target.value as PayrollIncentive['type'])}
                  className={`${controlClass} mt-1 w-full`}
                >
                  <option value="incentive">Incentive</option>
                  <option value="bonus">Bonus</option>
                  <option value="reimbursement">Reimbursement</option>
                </select>
                <label className="mt-3 block text-[12px] font-semibold text-[var(--text-muted)]">Amount (INR)</label>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  type="number"
                  min="0"
                  className={`${controlClass} mt-1 w-full font-normal`}
                />
                <label className="mt-3 block text-[12px] font-semibold text-[var(--text-muted)]">Reason</label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-[7px] border border-[var(--border-color)] px-4 py-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[#2d628e]"
                />
                <button type="button" onClick={addIncentive} className={`${primaryBtn} mt-3 w-full`}>
                  Add incentive
                </button>
                <ul className="mt-3 space-y-2">
                  {selectedIncentives.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 rounded-[8px] bg-[var(--bg-app)] px-4 py-3 text-[14px]">
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">
                          {inr(item.amount)} · {item.type}
                        </p>
                        <p className="text-[var(--text-secondary)]">{item.reason}</p>
                      </div>
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-[#8b3133]"
                        onClick={() => setIncentives((prev) => prev.filter((row) => row.id !== item.id))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[14px] text-[var(--text-secondary)]">Select an employee to add incentives.</p>
            )}
          </aside>
          <div className="flex shrink-0 justify-between lg:col-span-2">
            <button type="button" onClick={() => router.push('/payroll')} className={secondaryBtn}>
              Back
            </button>
            <button type="button" onClick={() => router.push('/payroll/export')} className={primaryBtn}>
              Continue to export
            </button>
          </div>
        </div>
      )}

      {step === 'export' && (
        <>
          <BankDisbursementTable rows={buildBankDisbursementRows(visibleLines, employees, run.period.monthYear)} />
          <div className="flex shrink-0 justify-between pt-1">
            <button type="button" onClick={() => router.push('/payroll/adjustments')} className={secondaryBtn}>
              Back
            </button>
            <button type="button" disabled={exporting || !run.lines.length} onClick={handleExport} className={primaryBtn}>
              {exporting ? 'Exporting…' : 'Download bank file'}
            </button>
          </div>
        </>
      )}

      <UserReportModal
        isOpen={Boolean(userReport)}
        onClose={() => setReportEmployeeId(null)}
        report={userReport || null}
        organizationName={String(state.organization?.name || 'Pixbe')}
      />
    </div>
  );
};

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-5 py-4">
      <p className="text-[12px] font-semibold text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold tracking-[-0.02em] tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{hint}</p>
    </div>
  );
}

function PayrollTable({
  lines,
  selectedId,
  onSelect,
  showIncentives,
}: {
  lines: PayrollRecord[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showIncentives?: boolean;
}) {
  if (!lines.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-5 text-[14px] text-[var(--text-secondary)]">
        No matching employees for this payroll cycle.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)]">
      <table className="min-w-full text-left text-[14px]">
        <thead className="sticky top-0 bg-[var(--bg-app)] text-[12px] font-semibold text-[var(--text-secondary)]">
          <tr>
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Group</th>
            <th className="px-4 py-3">Hours / days</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">LOP</th>
            <th className="px-4 py-3">Gross</th>
            {showIncentives ? <th className="px-4 py-3">Incentives</th> : null}
            <th className="px-4 py-3">Deductions</th>
            <th className="px-4 py-3">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-color)]">
          {lines.map((line) => {
            const selected = selectedId === line.employeeId;
            return (
              <React.Fragment key={line.id}>
                <tr
                  className={`cursor-pointer ${selected ? 'bg-[#f8fbfe]' : 'hover:bg-[#f8fbfe]'}`}
                  onClick={() => onSelect?.(line.employeeId)}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--text-primary)]">{line.employeeName}</p>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {line.department} · {line.salaryType}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{line.payrollGroupName}</td>
                  <td className="px-4 py-3 font-mono text-[12px] tabular-nums">
                    {line.daysWorked}/{line.daysRequired}d
                    <span className="block text-[var(--text-muted)]">
                      {line.hoursWorked}/{line.hoursRequired}h
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                        line.hoursMet ? 'bg-[#eaf1ee] text-[#53886b]' : 'bg-[#faeeee] text-[#8b3133]'
                      }`}
                    >
                      {line.hoursMet ? 'On target' : 'Short'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] tabular-nums">
                    {line.lopDays || 0}d
                    <span className="block text-[var(--text-muted)]">{inr(line.lopAmount || 0)}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{inr(line.basicSalary + line.allowances + line.overtimePay)}</td>
                  {showIncentives ? <td className="px-4 py-3 tabular-nums">{inr(line.incentives || 0)}</td> : null}
                  <td className="px-4 py-3 tabular-nums">{inr(line.deductions)}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{inr(line.netPay)}</td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BankDisbursementTable({ rows }: { rows: BankDisbursementRow[] }) {
  if (!rows.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-5 text-[14px] text-[var(--text-secondary)]">
        No employees to send to the bank for this cycle.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)]">
      <table className="min-w-full text-left text-[14px]">
        <thead className="sticky top-0 bg-[var(--bg-app)] text-[12px] font-semibold text-[var(--text-secondary)]">
          <tr>
            <th className="px-4 py-3">Employee code</th>
            <th className="px-4 py-3">Beneficiary</th>
            <th className="px-4 py-3">Account number</th>
            <th className="px-4 py-3">IFSC</th>
            <th className="px-4 py-3">Bank</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Mode</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-color)]">
          {rows.map((row) => (
            <tr key={row.employeeId}>
              <td className="px-4 py-3 font-mono text-[12px]">{row.employeeCode || '—'}</td>
              <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{row.beneficiaryName}</td>
              <td className="px-4 py-3 font-mono text-[12px] tabular-nums">{row.accountNumber || '—'}</td>
              <td className="px-4 py-3 font-mono text-[12px]">{row.ifsc || '—'}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">{row.bankName || '—'}</td>
              <td className="px-4 py-3 font-semibold tabular-nums">{inr(row.amount)}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">{row.paymentMode}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                    row.ready ? 'bg-[#eaf1ee] text-[#53886b]' : 'bg-[#faeeee] text-[#8b3133]'
                  }`}
                >
                  {row.ready ? 'Ready' : 'Missing bank details'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
