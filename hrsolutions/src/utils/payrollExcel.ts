import type { Employee, PayrollRecord } from '@/types';
import type { PayrollCompanyTotals, PayrollPeriod } from '@/utils/payrollRun';

const inr = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const isUsableBankValue = (value?: string) => {
  const text = String(value || '').trim();
  if (!text || text === '—' || text === '-') return false;
  if (text.includes('•')) return false;
  return true;
};

export type BankDisbursementRow = {
  employeeId: string;
  employeeCode: string;
  beneficiaryName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  amount: number;
  paymentMode: 'NEFT';
  narration: string;
  ready: boolean;
};

export function buildBankDisbursementRows(
  lines: PayrollRecord[],
  employees: Employee[],
  periodLabel: string
): BankDisbursementRow[] {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  return lines.map((line) => {
    const employee = byId.get(line.employeeId);
    const bank = employee?.bankDetails;
    const accountNumber = isUsableBankValue(bank?.accountNumber) ? String(bank?.accountNumber).trim() : '';
    const ifsc = isUsableBankValue(bank?.ifscCode) ? String(bank?.ifscCode).trim().toUpperCase() : '';
    const bankName = isUsableBankValue(bank?.bankName) ? String(bank?.bankName).trim() : '';
    const beneficiaryName =
      (isUsableBankValue(bank?.accountHolderName) ? String(bank?.accountHolderName).trim() : '') || line.employeeName;
    return {
      employeeId: line.employeeId,
      employeeCode: employee?.employeeId || '',
      beneficiaryName,
      accountNumber,
      ifsc,
      bankName,
      amount: inr(line.netPay),
      paymentMode: 'NEFT',
      narration: `Salary ${periodLabel}`.slice(0, 30),
      ready: Boolean(accountNumber && ifsc && line.netPay > 0),
    };
  });
}

export async function downloadPayrollWorkbook(args: {
  period: PayrollPeriod;
  totals: PayrollCompanyTotals;
  lines: PayrollRecord[];
  employees: Employee[];
  companyName?: string;
}) {
  const XLSX = await import('xlsx');
  const { period, totals, lines, employees, companyName } = args;
  const disbursement = buildBankDisbursementRows(lines, employees, period.monthYear);

  const header = [
    ['Bank salary disbursement'],
    ['Company', companyName || ''],
    ['Pay period', period.monthYear],
    ['Disbursement day', period.disbursementDay],
    ['Employee count', totals.employeeCount],
    ['Total amount to credit', inr(totals.totalNet)],
    [],
    [
      'Employee code',
      'Beneficiary name',
      'Account number',
      'IFSC',
      'Bank name',
      'Amount (INR)',
      'Payment mode',
      'Narration',
      'Ready',
    ],
  ];

  const body = disbursement.map((row) => [
    row.employeeCode,
    row.beneficiaryName,
    row.accountNumber,
    row.ifsc,
    row.bankName,
    row.amount,
    row.paymentMode,
    row.narration,
    row.ready ? 'Yes' : 'Missing bank details',
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([...header, ...body]);
  sheet['!cols'] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 20 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
    { wch: 22 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Bank disbursement');

  const stamp = period.monthYear.replace(/\s+/g, '-');
  XLSX.writeFile(workbook, `bank-salary-${stamp}.xlsx`);
}
