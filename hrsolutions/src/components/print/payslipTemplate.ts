import { escapeHtml, safeImageSrc } from './printWindow';

export interface PayslipField {
  id: string;
  label: string;
  value: string;
}

export interface PayslipLine {
  id: string;
  label: string;
  amount: number;
}

export interface PayslipDraft {
  companyName: string;
  logo: string;
  address: string;
  cin: string;
  gstin: string;
  period: string;
  documentNumber: string;
  status: string;
  disbursalDate: string;
  paidDays: string;
  lopDays: string;
  footerNote: string;
  currencyCode: string;
  currencySymbol: string;
  details: PayslipField[];
  earnings: PayslipLine[];
  deductions: PayslipLine[];
}

export type PayslipRenderMode = 'preview' | 'print';

const esc = (value: string) => escapeHtml(value || '');

export function sumLines(lines: PayslipLine[]): number {
  return lines.reduce((total, line) => total + (Number(line.amount) || 0), 0);
}

export function formatMoney(draft: Pick<PayslipDraft, 'currencyCode' | 'currencySymbol'>, amount: number): string {
  const locale = (draft.currencyCode || 'INR').toUpperCase() === 'INR' ? 'en-IN' : 'en-US';
  const formatted = Math.abs(amount).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? '-' : ''}${draft.currencySymbol}${formatted}`;
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

function groupedWords(n: number, groups: [number, string][]): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  let remaining = n;
  for (const [size, name] of groups) {
    if (remaining >= size) {
      const count = Math.floor(remaining / size);
      parts.push(`${count >= 1000 ? groupedWords(count, groups) : belowThousand(count)} ${name}`);
      remaining %= size;
    }
  }
  if (remaining) parts.push(belowThousand(remaining));
  return parts.join(' ');
}

const CURRENCY_NAMES: Record<string, [string, string]> = {
  INR: ['Indian Rupee', 'Paise'],
  USD: ['US Dollar', 'Cents'],
  EUR: ['Euro', 'Cents'],
  GBP: ['Pound Sterling', 'Pence'],
  AED: ['UAE Dirham', 'Fils'],
  SGD: ['Singapore Dollar', 'Cents'],
};

export function amountInWords(amount: number, currencyCode: string): string {
  const code = (currencyCode || 'INR').toUpperCase();
  const [major, minor] = CURRENCY_NAMES[code] || [code, 'Cents'];
  const indian = code === 'INR';
  const groups: [number, string][] = indian
    ? [[10_000_000, 'Crore'], [100_000, 'Lakh'], [1_000, 'Thousand']]
    : [[1_000_000_000, 'Billion'], [1_000_000, 'Million'], [1_000, 'Thousand']];

  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  const words = `${major} ${groupedWords(whole, groups)}${fraction ? ` and ${belowHundred(fraction)} ${minor}` : ''} Only`;
  return amount < 0 ? `Minus ${words}` : words;
}

function rowsFor(draft: PayslipDraft): string {
  const count = Math.max(draft.earnings.length, draft.deductions.length, 1);
  const rows: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const earning = draft.earnings[i];
    const deduction = draft.deductions[i];
    rows.push(`<tr>
      <td>${earning ? esc(earning.label) : ''}</td>
      <td class="num">${earning ? esc(formatMoney(draft, earning.amount)) : ''}</td>
      <td class="split">${deduction ? esc(deduction.label) : ''}</td>
      <td class="num">${deduction ? esc(formatMoney(draft, deduction.amount)) : ''}</td>
    </tr>`);
  }
  return rows.join('');
}

export function payslipBody(draft: PayslipDraft): string {
  const gross = sumLines(draft.earnings);
  const deducted = sumLines(draft.deductions);
  const net = gross - deducted;
  const logo = safeImageSrc(draft.logo);
  const registrations = [
    draft.cin.trim() ? `CIN ${esc(draft.cin.trim())}` : '',
    draft.gstin.trim() ? `GSTIN ${esc(draft.gstin.trim())}` : '',
  ].filter(Boolean);
  const details = draft.details
    .filter((item) => item.value.trim())
    .map((item) => `<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`)
    .join('');
  const days = [
    draft.paidDays.trim() ? `<div><dt>Paid days</dt><dd>${esc(draft.paidDays)}</dd></div>` : '',
    draft.lopDays.trim() ? `<div><dt>LOP days</dt><dd>${esc(draft.lopDays)}</dd></div>` : '',
  ].join('');
  const payment = [
    draft.status.trim() ? `Status: ${esc(draft.status)}` : '',
    draft.disbursalDate.trim() ? `Pay date: ${esc(draft.disbursalDate)}` : '',
  ].filter(Boolean);

  return `
    <div class="sheet">
      <header class="head">
        <div class="brand">
          ${logo ? `<img class="logo" src="${logo}" alt="" />` : ''}
          <div class="co">
            <h1>${esc(draft.companyName || 'Organization')}</h1>
            ${draft.address.trim() ? `<p class="addr">${esc(draft.address)}</p>` : ''}
            ${registrations.length ? `<p class="reg">${registrations.join('<span class="gap"></span>')}</p>` : ''}
          </div>
        </div>
        <div class="period">
          <p class="k">Payslip for the month of</p>
          <p class="v">${esc(draft.period || '-')}</p>
          ${draft.documentNumber.trim() ? `<p class="doc">${esc(draft.documentNumber)}</p>` : ''}
        </div>
      </header>

      <section class="summary">
        <div class="emp">
          <h2>Employee summary</h2>
          <dl class="kv">${details}</dl>
        </div>
        <aside class="netcard">
          <div class="top">
            <p class="amt">${esc(formatMoney(draft, net))}</p>
            <p class="cap">Employee net pay</p>
          </div>
          ${days ? `<dl class="days">${days}</dl>` : ''}
        </aside>
      </section>

      <table class="ledger">
        <colgroup><col class="c-label" /><col class="c-amt" /><col class="c-label" /><col class="c-amt" /></colgroup>
        <thead>
          <tr><th>Earnings</th><th class="num">Amount</th><th class="split">Deductions</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>${rowsFor(draft)}</tbody>
        <tfoot>
          <tr>
            <td>Gross earnings</td><td class="num">${esc(formatMoney(draft, gross))}</td>
            <td class="split">Total deductions</td><td class="num">${esc(formatMoney(draft, deducted))}</td>
          </tr>
        </tfoot>
      </table>

      <section class="payable">
        <div>
          <p class="k">Total net payable</p>
          <p class="sub">Gross earnings minus total deductions</p>
        </div>
        <p class="amt">${esc(formatMoney(draft, net))}</p>
      </section>
      <p class="words">Amount in words: <b>${esc(amountInWords(net, draft.currencyCode))}</b></p>

      <footer class="foot">
        <p>${esc(draft.footerNote)}</p>
        ${payment.length ? `<p class="pay">${payment.join('<span class="gap"></span>')}</p>` : ''}
      </footer>
    </div>`;
}

const SHEET_STYLES = `
  .sheet { color: #172234; font-size: 9pt; line-height: 1.45; font-variant-numeric: tabular-nums; }
  .gap { display: inline-block; width: 4mm; }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10mm;
    padding-bottom: 6mm;
    border-bottom: 0.6mm solid var(--accent);
  }
  .brand { display: flex; align-items: flex-start; gap: 4mm; min-width: 0; }
  .brand .logo { flex: none; width: 16mm; height: 16mm; object-fit: contain; }
  .co { min-width: 0; }
  .co h1 { font-size: 14pt; line-height: 1.2; font-weight: 800; letter-spacing: -0.015em; overflow-wrap: anywhere; }
  .co .addr { margin-top: 1.2mm; max-width: 105mm; color: #5e6c7b; overflow-wrap: anywhere; }
  .co .reg { margin-top: 0.8mm; font-size: 8pt; color: #5e6c7b; }
  .period { flex: none; max-width: 62mm; text-align: right; }
  .period .k { font-size: 8pt; color: #5e6c7b; }
  .period .v { font-size: 13pt; line-height: 1.25; font-weight: 800; letter-spacing: -0.01em; }
  .period .doc { margin-top: 1mm; font-size: 8pt; color: #5e6c7b; overflow-wrap: anywhere; }

  .summary { display: grid; grid-template-columns: minmax(0, 1fr) 58mm; gap: 8mm; align-items: start; margin-top: 7mm; break-inside: avoid; }
  .emp h2 { margin-bottom: 3mm; font-size: 9.5pt; font-weight: 700; letter-spacing: -0.005em; }
  .kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm 6mm; }
  .kv dt { font-size: 7.5pt; color: #687789; }
  .kv dd { margin: 0.3mm 0 0; font-weight: 600; overflow-wrap: anywhere; }
  .netcard { overflow: hidden; border: 0.3mm solid color-mix(in srgb, var(--accent) 28%, #ffffff); border-radius: 2.5mm; }
  .netcard .top { padding: 4.5mm 5mm 4mm; background: color-mix(in srgb, var(--accent) 7%, #ffffff); }
  .netcard .amt { font-size: 16pt; line-height: 1.15; font-weight: 800; letter-spacing: -0.015em; overflow-wrap: anywhere; }
  .netcard .cap { margin-top: 0.8mm; font-size: 8pt; color: #5e6c7b; }
  .days { display: grid; grid-template-columns: 1fr 1fr; border-top: 0.25mm dashed color-mix(in srgb, var(--accent) 30%, #ffffff); }
  .days div { padding: 2.6mm 5mm; }
  .days div + div { border-left: 0.25mm dashed color-mix(in srgb, var(--accent) 30%, #ffffff); }
  .days dt { font-size: 7.5pt; color: #687789; }
  .days dd { margin: 0; font-size: 10pt; font-weight: 700; }

  .ledger {
    width: 100%;
    margin-top: 8mm;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    border: 0.3mm solid #dce2e5;
    border-radius: 2.5mm;
    overflow: hidden;
  }
  .ledger col.c-label { width: 31%; }
  .ledger col.c-amt { width: 19%; }
  .ledger th {
    padding: 2.6mm 3.5mm;
    text-align: left;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent);
    background: #f6f8f9;
    border-bottom: 0.3mm solid #dce2e5;
  }
  .ledger td { padding: 1.9mm 3.5mm; vertical-align: top; overflow-wrap: anywhere; }
  .ledger tbody tr:first-child td { padding-top: 3mm; }
  .ledger tbody tr:last-child td { padding-bottom: 3mm; }
  .ledger .split { border-left: 0.3mm solid #dce2e5; }
  .ledger .num { text-align: right; white-space: nowrap; }
  .ledger tr { break-inside: avoid; }
  .ledger tfoot td { padding-top: 2.8mm; padding-bottom: 2.8mm; font-weight: 700; background: #fafbfb; border-top: 0.3mm solid #dce2e5; }

  .payable {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6mm;
    margin-top: 6mm;
    padding: 4.2mm 5mm;
    border-radius: 2.5mm;
    background: var(--accent);
    color: #ffffff;
    break-inside: avoid;
  }
  .payable .k { font-size: 10.5pt; font-weight: 700; }
  .payable .sub { font-size: 8pt; color: rgba(255, 255, 255, 0.82); }
  .payable .amt { font-size: 16pt; font-weight: 800; letter-spacing: -0.015em; white-space: nowrap; }
  .words { margin-top: 3mm; text-align: right; font-size: 8.5pt; color: #5e6c7b; }
  .words b { font-weight: 600; color: #172234; }

  .foot {
    display: flex;
    justify-content: space-between;
    gap: 8mm;
    margin-top: 12mm;
    padding-top: 4mm;
    border-top: 0.25mm solid #dce2e5;
    font-size: 8pt;
    color: #687789;
    break-inside: avoid;
  }
  .foot .pay { flex: none; text-align: right; }
`;

const PAGE_MARGIN = '12mm 14mm';
export const A4_HEIGHT_PX = (297 * 96) / 25.4;

export function payslipStyles(accent: string, mode: PayslipRenderMode): string {
  const safeAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#17324e';
  const page =
    mode === 'print'
      ? `@page { size: A4 portrait; margin: ${PAGE_MARGIN}; }`
      : `.sheet { width: 210mm; min-height: 297mm; padding: ${PAGE_MARGIN}; background: #ffffff;
           box-shadow: 0 0 0 0.25mm rgba(23, 50, 78, 0.08), 0 1mm 2mm rgba(23, 50, 78, 0.05), 0 5mm 12mm rgba(23, 50, 78, 0.08); }`;
  return `:root { --accent: ${safeAccent}; }${SHEET_STYLES}${page}`;
}
