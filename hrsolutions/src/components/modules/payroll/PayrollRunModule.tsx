'use client';
import './finance-studio.css';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AppState } from '@/services/store';
import { Employee, PayrollIncentive, PayrollRecord } from '@/types';
import { api } from '@/services/apiClient';
import {
  buildPayrollRun,
  loadPayrollDraft,
  savePayrollDraft,
} from '@/utils/payrollRun';
import { BankDisbursementRow, buildBankDisbursementRows, downloadPayrollWorkbook } from '@/utils/payrollExcel';
import { PayrollHeaderSwitch } from './PayrollHeaderSwitch';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Check, Settings2 } from 'lucide-react';
import { FinanceNote, FinanceStatus } from './FinanceUi';
import { UserReportModal } from '@/components/modules/reports/UserReportModal';
import { buildUserReport } from '@/utils/userReport';

type PayrollStep = 'review' | 'adjustments' | 'export';

interface PayrollRunModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  step: PayrollStep;
}

const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

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
  const [periodSlice, setPeriodSlice] = useState('');
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
  const payCurrency =
    state.customOptions?.payrollSettings?.defaultCurrency ||
    state.customOptions?.employeeIdSettings?.defaultCurrency ||
    'INR';
  const inr = (value: number) => money(value, payCurrency);
  const payFrequency = String(state.customOptions?.payrollSettings?.defaultPayFrequency || 'Monthly');

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
        companyCreatedAt: state.organization?.createdAt,
        workingDays: state.organization?.workingDays,
        holidays: state.customOptions?.holidays,
        timeZone: state.organization?.timeZone,
        attendanceSettings: state.customOptions?.attendanceSettings,
        periodSlice,
        year,
        month,
      }),
    [employees, state.attendance, state.leaves, state.timesheets, state.customOptions, state.organization, incentives, year, month, periodSlice]
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
      holidays: state.customOptions?.holidays,
      workingDays: state.organization?.workingDays,
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
    <div className="finance-page payroll-studio flex flex-1 flex-col gap-5">
      <header className="finance-page-head">
        <h1>Payroll</h1>
        <PayrollHeaderSwitch active="payroll" />
      </header>
      <nav className="finance-steps" aria-label="Payroll steps">
        {([
          { id: 'review', label: 'Review', href: '/payroll' },
          { id: 'adjustments', label: 'Incentives', href: '/payroll/adjustments' },
          { id: 'export', label: 'Export', href: '/payroll/export' },
        ] as const).map((item, index) => {
          const current = ['review', 'adjustments', 'export'].indexOf(step);
          return <Link key={item.id} href={item.href} aria-current={step === item.id ? 'step' : undefined} data-complete={index < current}><span>{index < current ? <Check size={13} /> : index + 1}</span>{item.label}</Link>;
        })}
      </nav>
      <div className="finance-pay-filters">
        <label htmlFor="pay-month">Pay month<select id="pay-month" value={month} onChange={(event) => setMonth(Number(event.target.value))} className={controlClass}>
          {monthOptions.map((value) => <option key={value} value={value}>{new Date(2026, value - 1, 1).toLocaleDateString('en-IN', { month: 'long' })}</option>)}
        </select></label>
        {payFrequency !== 'Monthly' && (
          <label htmlFor="pay-period">Pay period<select id="pay-period" value={periodSlice} onChange={(event) => setPeriodSlice(event.target.value)} className={controlClass}>
            <option value="">{payFrequency === 'Weekly' ? 'This week' : 'This half'}</option>
            {payFrequency === 'Weekly'
              ? [1, 8, 15, 22, 29].map((day) => <option key={day} value={String(day)}>Days {day}-{Math.min(day + 6, new Date(year, month, 0).getDate())}</option>)
              : [{ value: 'first', label: '1st-15th' }, { value: 'second', label: '16th-end' }].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
        )}
        <label htmlFor="pay-year">Pay year<select id="pay-year" value={year} onChange={(event) => setYear(Number(event.target.value))} className={controlClass}>
          {years.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label className="finance-employee-search" htmlFor="pay-search">Search employee<input id="pay-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, department or payroll group" className={controlClass} /></label>
        <Link href="/settings?section=payroll" className="finance-settings-link"><Settings2 size={14} />Payroll settings</Link>
      </div>

      <div className="finance-summary-grid grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard tone="amber" label="Company net" value={inr(run.totals.totalNet)} hint={run.totals.periodLabel} />
        <SummaryCard tone="violet" label="Employees" value={String(run.totals.employeeCount)} hint={`Paid on day ${run.totals.disbursementDay}`} />
        <SummaryCard tone="amber" label="Gross + incentives" value={inr(run.totals.totalGross + run.totals.totalIncentives)} hint={`${inr(run.totals.totalIncentives)} incentives`} />
        <SummaryCard
          tone="rose" label="Deductions & LOP"
          value={inr(run.totals.totalDeductions)}
          hint={`${inr(run.totals.totalLop)} LOP · ${run.totals.shortHoursCount} short`}
        />
      </div>

      {step === 'review' && (
        <>
          <PayrollTable
            formatMoney={inr}
            employees={employees}
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
        <div className="finance-incentive-layout grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <PayrollTable
            formatMoney={inr}
            employees={employees}
            lines={visibleLines}
            showIncentives
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setReportEmployeeId(id);
            }}
          />
          <aside aria-label="Add incentive" className="finance-incentive-editor flex min-h-0 flex-col overflow-y-auto rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-4">
            <h2 className="finance-section-title">Add incentive</h2>
            {selected ? (
              <>
                <div className="finance-selected-person"><UserAvatar src={employees.find((employee) => employee.id === selected.employeeId)?.avatar} name={selected.employeeName} className="h-8 w-8 text-xs" /><div><strong>{selected.employeeName}</strong><small>{selected.department}</small></div></div>
                <p className="finance-current-net"><span>Current net</span><strong>{inr(selected.netPay)}</strong></p>
                <label htmlFor="incentive-type" className="mt-3 block text-[12px] font-semibold text-[var(--text-muted)]">Type</label>
                <select
                  id="incentive-type"
                  value={incentiveType}
                  onChange={(event) => setIncentiveType(event.target.value as PayrollIncentive['type'])}
                  className={`${controlClass} mt-1 w-full`}
                >
                  <option value="incentive">Incentive</option>
                  <option value="bonus">Bonus</option>
                  <option value="reimbursement">Reimbursement</option>
                </select>
                <label htmlFor="incentive-amount" className="mt-3 block text-[12px] font-semibold text-[var(--text-muted)]">Amount ({payCurrency})</label>
                <input
                  id="incentive-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  type="number"
                  min="0"
                  className={`${controlClass} mt-1 w-full font-normal`}
                />
                <label htmlFor="incentive-reason" className="mt-3 block text-[12px] font-semibold text-[var(--text-muted)]">Reason</label>
                <textarea
                  id="incentive-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-[7px] border border-[var(--border-color)] px-4 py-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[#2d628e]"
                />
                <button type="button" onClick={addIncentive} className={`${primaryBtn} mt-3 w-full`}>
                  Add incentive
                </button>
                <h3 className="finance-incentives-title">Added incentives{selectedIncentives.length ? ` (${selectedIncentives.length})` : ''}</h3>
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
          {buildBankDisbursementRows(run.lines, employees, run.period.monthYear).some((row) => !row.ready) && <FinanceNote title="Bank details need attention" tone="warning">The file includes all {run.lines.length} employees. Complete missing bank details before disbursement.</FinanceNote>}
          <BankDisbursementTable rows={buildBankDisbursementRows(visibleLines, employees, run.period.monthYear)} formatMoney={inr} />
          <div className="finance-export-summary"><span>The bank file includes all {run.lines.length} employees in {run.totals.periodLabel}.</span><strong>Full-run total {inr(run.totals.totalNet)}</strong></div>
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

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <div data-tone={tone} className="finance-summary-card rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-5 py-4">
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
  formatMoney,
  employees,
}: {
  employees: Employee[];
  lines: PayrollRecord[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showIncentives?: boolean;
  formatMoney: (value: number) => string;
}) {
  if (!lines.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-5 text-[14px] text-[var(--text-secondary)]">
        No matching employees for this payroll cycle.
      </div>
    );
  }

  return (
    <section className="finance-table-panel finance-pay-panel flex-1">
      <header><h2>{showIncentives ? 'Add incentives' : 'Review employee pay'}</h2><span>{lines.length} {lines.length === 1 ? 'employee' : 'employees'}</span></header>
      <div className="finance-table-scroll"><table className="min-w-full text-left text-[14px]">
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
                  className={`finance-pay-row cursor-pointer ${selected ? 'bg-[#f8fbfe]' : 'hover:bg-[#f8fbfe]'}`}
                  onClick={() => onSelect?.(line.employeeId)}
                >
                  <td data-label="Employee" className="finance-pay-person px-4 py-3">
                    <div className="finance-person"><UserAvatar src={employees.find((employee) => employee.id === line.employeeId)?.avatar} name={line.employeeName} className="h-8 w-8 text-xs" /><div><button type="button" onClick={(event) => { event.stopPropagation(); onSelect?.(line.employeeId); }} className="finance-person-name">{line.employeeName}</button>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {line.department} · {line.salaryType}
                    </p></div></div>
                  </td>
                  <td data-label="Group" className="finance-pay-group px-4 py-3 text-[var(--text-secondary)]">{line.payrollGroupName}</td>
                  <td data-label="Hours / days" className="finance-pay-hours px-4 py-3 text-[12px] tabular-nums">
                    {line.daysWorked}/{line.daysRequired}d
                    <span className="block text-[var(--text-muted)]">
                      {line.hoursWorked}/{line.hoursRequired}h
                    </span>
                  </td>
                  <td data-label="Status" className="finance-pay-status px-4 py-3"><FinanceStatus status={line.hoursMet ? 'On target' : 'Short'} /></td>
                  <td data-label="LOP" className="finance-pay-lop px-4 py-3 text-[12px] tabular-nums">
                    {line.lopDays || 0}d
                    <span className="block text-[var(--text-muted)]">{formatMoney(line.lopAmount || 0)}</span>
                  </td>
                  <td data-label="Gross" className="finance-pay-gross px-4 py-3 tabular-nums">{formatMoney(line.basicSalary + line.allowances + line.overtimePay)}</td>
                  {showIncentives ? <td data-label="Incentives" className="finance-pay-incentives px-4 py-3 tabular-nums">{formatMoney(line.incentives || 0)}</td> : null}
                  <td data-label="Deductions" className="finance-pay-deductions px-4 py-3 tabular-nums">{formatMoney(line.deductions)}</td>
                  <td data-label="Net" className="finance-pay-net px-4 py-3 font-semibold tabular-nums">{formatMoney(line.netPay)}</td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table></div>
      <footer>Open an employee to view their User report. Gross excludes incentives.</footer>
    </section>
  );
}

function BankDisbursementTable({ rows, formatMoney }: { rows: BankDisbursementRow[]; formatMoney: (value: number) => string }) {
  if (!rows.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-5 text-[14px] text-[var(--text-secondary)]">
        No employees to send to the bank for this cycle.
      </div>
    );
  }

  return (
    <section className="finance-table-panel finance-bank-panel flex-1">
      <header><h2>Bank disbursement preview</h2><FinanceStatus status={`${rows.filter((row) => row.ready).length} ready`} /></header>
      <div className="finance-table-scroll">
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
              <td data-label="Employee code" className="px-4 py-3 font-mono text-[12px]">{row.employeeCode || '—'}</td>
              <td data-label="Beneficiary" className="px-4 py-3 font-semibold text-[var(--text-primary)]">{row.beneficiaryName}</td>
              <td data-label="Account number" className="px-4 py-3 font-mono text-[12px] tabular-nums">{row.accountNumber || '—'}</td>
              <td data-label="IFSC" className="px-4 py-3 font-mono text-[12px]">{row.ifsc || '—'}</td>
              <td data-label="Bank" className="px-4 py-3 text-[var(--text-secondary)]">{row.bankName || '—'}</td>
              <td data-label="Amount" className="px-4 py-3 font-semibold tabular-nums">{formatMoney(row.amount)}</td>
              <td data-label="Mode" className="px-4 py-3 text-[var(--text-secondary)]">{row.paymentMode}</td>
              <td data-label="Status" className="px-4 py-3"><FinanceStatus status={row.ready ? 'Ready' : 'Missing bank details'} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}
