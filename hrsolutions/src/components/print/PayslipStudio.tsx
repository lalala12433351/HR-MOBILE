'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Employee, EmployeePayslipDocument, Organization } from '@/types';
import { compressAvatarImage } from '@/utils/imageUtils';
import { newPrintId, printHtml } from './printWindow';
import {
  A4_HEIGHT_PX,
  PayslipDraft,
  PayslipField,
  PayslipLine,
  formatMoney,
  payslipBody,
  payslipStyles,
  sumLines,
} from './payslipTemplate';
import {
  ACCENTS,
  AccentPicker,
  AddRowButton,
  FitStatus,
  ImagePicker,
  PreviewFrame,
  PrintButton,
  RowControls,
  SecondaryButton,
  StudioSection,
  StudioShell,
  TextField,
  inputClass,
  moveItem,
} from './PrintStudioShell';

export type { PayslipDraft, PayslipField, PayslipLine } from './payslipTemplate';

export interface PayslipSalaryInput {
  salaryType?: 'monthly' | 'hourly' | 'compliance';
  baseSalary: number;
  hra: number;
  specialAllowance: number;
  conveyanceAllowance: number;
  medicalAllowance: number;
  otherAllowances: number;
  customAllowances?: { name: string; amount: number }[];
  performanceBonus: number;
  overtimeHours?: number;
  overtimePay: number;
  pf: number;
  esic: number;
  professionalTax: number;
  tds: number;
  customDeductions?: { name: string; amount: number }[];
  healthInsurance: number;
}

interface PayslipStudioProps {
  initial: PayslipDraft;
  onClose: () => void;
}

function clean(value: string | undefined | null): string {
  const trimmed = (value || '').trim();
  return trimmed === '—' || trimmed === '-' ? '' : trimmed;
}

function textField(label: string, value: string | undefined | null): PayslipField {
  return { id: newPrintId('det'), label, value: clean(value) };
}

function moneyLine(label: string, amount: number): PayslipLine {
  return { id: newPrintId('ln'), label, amount: Number.isFinite(amount) ? amount : 0 };
}

function parseMoney(amount: string): number {
  const parsed = Number(String(amount).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function bankLine(employee: Employee): string {
  const bank = employee.bankDetails;
  const account = clean(bank?.accountNumber);
  if (!account) return '';
  const bankName = clean(bank?.bankName) || 'Bank';
  return account.length <= 4 ? `${bankName} ${account}` : `${bankName} ending ${account.slice(-4)}`;
}

function pushPositive(lines: PayslipLine[], label: string, amount: number) {
  if (amount > 0) lines.push(moneyLine(label, amount));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function daysInPeriod(period: string): string {
  const match = period.match(/([a-z]{3})[a-z]*\.?\s*,?\s*(\d{4})/i);
  if (!match) return '';
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return '';
  return String(new Date(Number(match[2]), month + 1, 0).getDate());
}

export function buildPayslipDraft(input: {
  employee: Employee;
  organization?: Organization | null;
  period: string;
  disbursalDate?: string;
  status?: string;
  documentNumber?: string;
  issuedAmount?: string;
  salary?: PayslipSalaryInput | null;
}): PayslipDraft {
  const org = input.organization;
  const employee = input.employee;
  const salary = input.salary;
  const earnings: PayslipLine[] = [];
  const deductions: PayslipLine[] = [];

  if (salary) {
    pushPositive(earnings, salary.salaryType === 'hourly' ? 'Regular pay' : 'Basic salary', salary.baseSalary);
    pushPositive(earnings, 'House rent allowance', salary.hra);
    pushPositive(earnings, 'Conveyance allowance', salary.conveyanceAllowance);
    pushPositive(earnings, 'Medical allowance', salary.medicalAllowance);
    pushPositive(earnings, 'Special allowance', salary.specialAllowance);
    pushPositive(earnings, 'Other allowances', salary.otherAllowances);
    (salary.customAllowances || []).forEach((item) => pushPositive(earnings, item.name || 'Allowance', Number(item.amount) || 0));
    if (salary.overtimePay > 0) {
      const hours = salary.overtimeHours ? ` (${salary.overtimeHours} hrs)` : '';
      earnings.push(moneyLine(`Overtime pay${hours}`, salary.overtimePay));
    }
    pushPositive(earnings, 'Performance bonus', salary.performanceBonus);
    pushPositive(deductions, 'Provident fund (EPF)', salary.pf);
    pushPositive(deductions, 'Income tax (TDS)', salary.tds);
    pushPositive(deductions, 'Professional tax', salary.professionalTax);
    pushPositive(deductions, 'Employee state insurance', salary.esic);
    pushPositive(deductions, 'Group health insurance', salary.healthInsurance);
    (salary.customDeductions || []).forEach((item) => pushPositive(deductions, item.name || 'Deduction', Number(item.amount) || 0));
  }

  if (earnings.length === 0) {
    const issued = parseMoney(input.issuedAmount || '');
    earnings.push(moneyLine(issued > 0 ? 'Net disbursed' : 'Earnings', issued));
  }

  const periodSlug = input.period.replace(/[^a-zA-Z0-9]+/g, '') || 'PERIOD';

  return {
    companyName: org?.legalName || org?.name || '',
    logo: org?.logo || '',
    address: clean(org?.officeLocation?.address),
    cin: '',
    gstin: clean(org?.gstin),
    period: input.period,
    documentNumber: input.documentNumber || `PS-${employee.employeeId || employee.id}-${periodSlug}`,
    status: input.status || 'Paid',
    disbursalDate: input.disbursalDate || '',
    paidDays: daysInPeriod(input.period),
    lopDays: '0',
    footerNote: 'This is a system-generated payslip and does not require a signature.',
    currencyCode: org?.currency || 'INR',
    currencySymbol: org?.currencySymbol || '₹',
    details: [
      textField('Employee name', employee.name),
      textField('Employee ID', employee.employeeId),
      textField('Designation', employee.designation),
      textField('Department', employee.department),
      textField('Date of joining', employee.joinDate || employee.joiningDate),
      textField('PAN', employee.personalTaxId || employee.panNumber),
      textField('Bank account', bankLine(employee)),
    ],
    earnings,
    deductions,
  };
}

export function salaryInputFromEmployee(employee: Employee): PayslipSalaryInput | null {
  const salary = employee.salaryDetails;
  if (!salary) return null;
  return {
    salaryType: employee.salaryType || 'monthly',
    baseSalary: salary.basic || 0,
    hra: salary.hra || 0,
    specialAllowance: salary.specialAllowance || 0,
    conveyanceAllowance: salary.conveyanceAllowance || 0,
    medicalAllowance: salary.medicalAllowance || 0,
    otherAllowances: salary.otherAllowances || 0,
    customAllowances: salary.allowanceItems || [],
    performanceBonus: salary.performanceBonus || 0,
    overtimePay: 0,
    pf: salary.pfDeduction || 0,
    esic: salary.esicDeduction || 0,
    professionalTax: salary.professionalTax || 0,
    tds: salary.taxDeduction || 0,
    customDeductions: salary.deductionItems || [],
    healthInsurance: 0,
  };
}

export function buildPayslipDraftFromDocument(
  employee: Employee,
  document: EmployeePayslipDocument,
  organization?: Organization | null
): PayslipDraft {
  return buildPayslipDraft({
    employee,
    organization,
    period: document.period,
    disbursalDate: document.date,
    status: document.status,
    documentNumber: document.name,
    issuedAmount: document.amount,
    salary: salaryInputFromEmployee(employee),
  });
}

function measurePages(doc: Document): number {
  const sheet = doc.querySelector<HTMLElement>('.sheet');
  if (!sheet) return 1;
  return Math.max(1, Math.ceil(sheet.getBoundingClientRect().height / A4_HEIGHT_PX - 0.01));
}

type LineKey = 'earnings' | 'deductions';

export const PayslipStudio: React.FC<PayslipStudioProps> = ({ initial, onClose }) => {
  const [draft, setDraft] = useState<PayslipDraft>(initial);
  const [accent, setAccent] = useState(ACCENTS[0].value);
  const [pages, setPages] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  const gross = useMemo(() => sumLines(draft.earnings), [draft.earnings]);
  const deducted = useMemo(() => sumLines(draft.deductions), [draft.deductions]);
  const net = gross - deducted;

  const previewStyles = useMemo(() => payslipStyles(accent, 'preview'), [accent]);
  const previewBody = useMemo(() => payslipBody(draft), [draft]);
  const onMeasure = useCallback((count: number) => setPages(count), []);

  const set = <K extends keyof PayslipDraft>(key: K, value: PayslipDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const updateDetail = (id: string, patch: Partial<PayslipField>) =>
    setDraft((current) => ({
      ...current,
      details: current.details.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));

  const updateLine = (key: LineKey, id: string, patch: Partial<PayslipLine>) =>
    setDraft((current) => ({
      ...current,
      [key]: current[key].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));

  const handlePrint = async () => {
    setPrinting(true);
    setPrintError('');
    const ok = await printHtml({
      title: `Payslip ${draft.period}${draft.details[0]?.value ? ` ${draft.details[0].value}` : ''}`,
      styles: payslipStyles(accent, 'print'),
      body: payslipBody(draft),
    });
    setPrinting(false);
    if (!ok) setPrintError('The browser blocked printing. Try again, or use Ctrl+P on this page.');
  };

  const negative = net < 0;
  const issues = [
    ...(pages > 1 ? [`The payslip runs onto ${pages} pages. Remove lines or shorten long labels to keep it on one page.`] : []),
    ...(negative ? ['Deductions are higher than earnings, so net pay is negative.'] : []),
  ];

  const editor = (
    <>
      <StudioSection title="Company">
        <div className="space-y-4">
          <ImagePicker
            label="Logo"
            description="Printed in the top-left corner."
            src={draft.logo}
            onPick={async (file) => {
              const dataUrl = await compressAvatarImage(file, 400, 400, 0.92);
              if (dataUrl) set('logo', dataUrl);
            }}
            onClear={() => set('logo', '')}
          />
          <TextField label="Company name" value={draft.companyName} onChange={(value) => set('companyName', value)} />
          <TextField label="Address" value={draft.address} onChange={(value) => set('address', value)} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="CIN" mono value={draft.cin} placeholder="Optional" onChange={(value) => set('cin', value)} />
            <TextField label="GSTIN" mono value={draft.gstin} placeholder="Optional" onChange={(value) => set('gstin', value)} />
          </div>
        </div>
      </StudioSection>

      <StudioSection title="Pay period">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Month" value={draft.period} onChange={(value) => set('period', value)} />
          <TextField label="Pay date" value={draft.disbursalDate} placeholder="e.g. 31 Aug 2026" onChange={(value) => set('disbursalDate', value)} />
          <TextField label="Paid days" value={draft.paidDays} onChange={(value) => set('paidDays', value)} />
          <TextField label="Loss of pay days" value={draft.lopDays} onChange={(value) => set('lopDays', value)} />
          <TextField label="Payslip number" mono value={draft.documentNumber} onChange={(value) => set('documentNumber', value)} />
          <TextField label="Status" value={draft.status} onChange={(value) => set('status', value)} />
        </div>
      </StudioSection>

      <StudioSection
        title="Employee summary"
        description="Empty values are left off the payslip."
        action={
          <AddRowButton onClick={() => set('details', [...draft.details, textField('New detail', '')])}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add
          </AddRowButton>
        }
      >
        <div className="space-y-2">
          {draft.details.map((item, index) => (
            <div key={item.id} className="flex items-center gap-1.5">
              <input
                aria-label="Detail label"
                className={`${inputClass} w-[38%] shrink-0 text-[12.5px] font-[600] text-[#33435a]`}
                value={item.label}
                onChange={(event) => updateDetail(item.id, { label: event.target.value })}
              />
              <input
                aria-label={`${item.label || 'Detail'} value`}
                className={inputClass}
                value={item.value}
                onChange={(event) => updateDetail(item.id, { value: event.target.value })}
              />
              <RowControls
                label={item.label || 'detail'}
                onUp={index > 0 ? () => set('details', moveItem(draft.details, index, -1)) : undefined}
                onDown={index < draft.details.length - 1 ? () => set('details', moveItem(draft.details, index, 1)) : undefined}
                onRemove={() => set('details', draft.details.filter((row) => row.id !== item.id))}
              />
            </div>
          ))}
        </div>
      </StudioSection>

      <MoneySection
        title="Earnings"
        total={formatMoney(draft, gross)}
        lines={draft.earnings}
        symbol={draft.currencySymbol}
        onAdd={() => set('earnings', [...draft.earnings, moneyLine('New earning', 0)])}
        onChange={(id, patch) => updateLine('earnings', id, patch)}
        onMove={(index, offset) => set('earnings', moveItem(draft.earnings, index, offset))}
        onRemove={(id) => set('earnings', draft.earnings.filter((row) => row.id !== id))}
      />
      <MoneySection
        title="Deductions"
        total={formatMoney(draft, deducted)}
        lines={draft.deductions}
        symbol={draft.currencySymbol}
        onAdd={() => set('deductions', [...draft.deductions, moneyLine('New deduction', 0)])}
        onChange={(id, patch) => updateLine('deductions', id, patch)}
        onMove={(index, offset) => set('deductions', moveItem(draft.deductions, index, offset))}
        onRemove={(id) => set('deductions', draft.deductions.filter((row) => row.id !== id))}
      />

      <StudioSection title="Footer">
        <TextField label="Footer note" value={draft.footerNote} onChange={(value) => set('footerNote', value)} />
      </StudioSection>
    </>
  );

  const toolbar = (
    <>
      <AccentPicker value={accent} onChange={setAccent} />
      <dl className="ml-auto grid grid-cols-3 gap-x-6 text-right">
        <Total label="Gross" value={formatMoney(draft, gross)} />
        <Total label="Deductions" value={formatMoney(draft, deducted)} />
        <Total label="Net pay" value={formatMoney(draft, net)} strong tone={negative ? 'error' : undefined} />
      </dl>
    </>
  );

  return (
    <StudioShell
      title="Payslip"
      description="A4 payslip. The preview is the exact print output."
      onClose={onClose}
      editor={editor}
      toolbar={toolbar}
      preview={
        <PreviewFrame<number>
          title="Payslip"
          styles={previewStyles}
          body={previewBody}
          maxScale={1}
          measure={measurePages}
          onMeasure={onMeasure}
        />
      }
      status={
        printError ? (
          <p className="font-[600] text-[#8b3133]" role="alert">{printError}</p>
        ) : (
          <FitStatus issues={issues} okText="Fits on one A4 page." />
        )
      }
      actions={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrintButton busy={printing} onClick={handlePrint}>
            Print payslip
          </PrintButton>
        </>
      }
    />
  );
};

function Total({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'error' }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-[600] text-[#687789]">{label}</dt>
      <dd
        className={`text-[14px] tabular-nums whitespace-nowrap ${strong ? 'font-[800]' : 'font-[650]'} ${
          tone === 'error' ? 'text-[#8b3133]' : 'text-[#172234]'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function MoneySection({
  title,
  total,
  lines,
  symbol,
  onAdd,
  onChange,
  onMove,
  onRemove,
}: {
  title: string;
  total: string;
  lines: PayslipLine[];
  symbol: string;
  onAdd: () => void;
  onChange: (id: string, patch: Partial<PayslipLine>) => void;
  onMove: (index: number, offset: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <StudioSection
      title={title}
      description={`Total ${total}`}
      action={
        <AddRowButton onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add
        </AddRowButton>
      }
    >
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={line.id} className="flex items-center gap-1.5">
            <input
              aria-label={`${title} label`}
              className={inputClass}
              value={line.label}
              onChange={(event) => onChange(line.id, { label: event.target.value })}
            />
            <div className="relative w-[124px] shrink-0">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-[#687789]">{symbol}</span>
              <input
                aria-label={`${line.label || title} amount`}
                className={`${inputClass} pl-7 text-right tabular-nums`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0"
                value={line.amount === 0 ? '' : line.amount}
                onChange={(event) => {
                  const amount = Number(event.target.value);
                  onChange(line.id, { amount: Number.isFinite(amount) ? amount : 0 });
                }}
              />
            </div>
            <RowControls
              label={line.label || 'line'}
              onUp={index > 0 ? () => onMove(index, -1) : undefined}
              onDown={index < lines.length - 1 ? () => onMove(index, 1) : undefined}
              onRemove={() => onRemove(line.id)}
            />
          </div>
        ))}
        {lines.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[#cad5dc] px-3 py-4 text-center text-[12.5px] text-[#687789]">
            No {title.toLowerCase()} yet.
          </p>
        ) : null}
      </div>
    </StudioSection>
  );
}
