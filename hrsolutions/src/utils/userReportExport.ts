import { UserReport } from '@/utils/userReport';

const inr = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value) || 0
  );

const fileStamp = (report: UserReport) =>
  `${report.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${report.range.start}_${report.range.end}`;

type PdfTable = { title: string; headers: string[]; rows: Array<Array<string | number>> };

const PDF_WIDTH = 842;
const PDF_HEIGHT = 596;
const PDF_MARGIN = 36;

function pdfText(value: string | number) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function pdfColor([red, green, blue]: number[], operator: 'rg' | 'RG') {
  return `${(red / 255).toFixed(3)} ${(green / 255).toFixed(3)} ${(blue / 255).toFixed(3)} ${operator}`;
}

function pdfLines(value: string | number, maxWidth: number, fontSize: number) {
  const characters = Math.max(8, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = pdfText(value).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= characters) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word.length > characters ? `${word.slice(0, Math.max(1, characters - 1))}-` : word;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function reportTables(report: UserReport): PdfTable[] {
  const tables: PdfTable[] = [
    {
      title: 'Attendance',
      headers: ['Date', 'In', 'Out', 'Hours', 'Status'],
      rows: report.attendance.map((row) => [
        row.date,
        row.checkIn,
        row.checkOut,
        row.hours.toFixed(1),
        row.note ? `${row.status} · ${row.note}` : row.status,
      ]),
    },
    {
      title: 'Tasks',
      headers: ['Task', 'Project', 'Status', 'Due', 'Hours'],
      rows: report.tasks.map((row) => [
        row.title,
        row.project,
        row.status,
        row.dueDate,
        `${row.actualHours.toFixed(1)} / ${row.estimatedHours.toFixed(1)}`,
      ]),
    },
    {
      title: 'Leaves',
      headers: ['Type', 'Start', 'End', 'Days', 'Status', 'Pay'],
      rows: report.leaves.map((row) => [row.type, row.startDate, row.endDate, row.days, row.status, row.paid ? 'Paid' : 'LOP']),
    },
  ];
  if (report.payroll.available) {
    tables.push({
      title: 'Payroll',
      headers: ['Item', 'Amount'],
      rows: [
        ['Gross', inr(report.payroll.gross)],
        ['Incentives', inr(report.payroll.incentives)],
        ['Deductions', inr(report.payroll.deductions)],
        ['LOP', `${report.lopDays}d · ${inr(report.lopAmount)}`],
        ['Net', inr(report.payroll.net)],
        ...report.payroll.deductionLines.map((item) => [item.name, inr(item.amount)]),
        ...report.payroll.incentiveItems.map((item) => [`${item.type}: ${item.reason}`, inr(item.amount)]),
      ],
    });
  }
  return tables.filter((table) => table.rows.length);
}

export function downloadUserReportPdf(report: UserReport, organizationName: string) {
  const pages: string[][] = [];
  let commands: string[] = [];
  const topY = (top: number) => PDF_HEIGHT - top;
  const fillRect = (x: number, top: number, width: number, height: number, color: number[]) =>
    commands.push(`q ${pdfColor(color, 'rg')} ${x} ${topY(top + height)} ${width} ${height} re f Q`);
  const strokeRect = (x: number, top: number, width: number, height: number, color: number[]) =>
    commands.push(`q ${pdfColor(color, 'RG')} 0.7 w ${x} ${topY(top + height)} ${width} ${height} re S Q`);
  const text = (value: string | number, x: number, top: number, size: number, bold = false, color = [23, 34, 52]) =>
    commands.push(
      `BT /F${bold ? 2 : 1} ${size} Tf ${pdfColor(color, 'rg')} 1 0 0 1 ${x} ${topY(top)} Tm (${pdfText(value)}) Tj ET`
    );
  const rightText = (value: string, top: number, size: number, color = [94, 108, 123]) =>
    text(value, PDF_WIDTH - PDF_MARGIN - value.length * size * 0.51, top, size, false, color);

  const flushPage = () => {
    pages.push(commands);
    commands = [];
  };

  const drawHeader = () => {
    fillRect(0, 0, PDF_WIDTH, 58, [23, 50, 78]);
    text(organizationName.toUpperCase(), PDF_MARGIN, 24, 10, true, [226, 232, 240]);
    text('User report', PDF_MARGIN, 45, 17, true, [255, 255, 255]);
    rightText(`${report.range.start} to ${report.range.end}`, 42, 9, [226, 232, 240]);
  };

  drawHeader();
  text(report.name, PDF_MARGIN, 78, 14, true);
  text(
    [report.employeeCode, report.designation, report.department].filter(Boolean).join(' · ') || report.email,
    PDF_MARGIN,
    96,
    10,
    false,
    [94, 108, 123]
  );

  const metrics = [
    { label: 'Present', value: String(report.presentDays) },
    { label: 'Hours', value: report.hoursWorked.toFixed(1) },
    { label: 'Leave', value: String(report.leaveDays) },
    { label: 'LOP', value: `${report.lopDays}d` },
  ];
  const cardGap = 8;
  const cardWidth = (PDF_WIDTH - PDF_MARGIN * 2 - cardGap * 3) / 4;
  metrics.forEach((metric, index) => {
    const x = PDF_MARGIN + index * (cardWidth + cardGap);
    fillRect(x, 112, cardWidth, 44, [248, 251, 254]);
    strokeRect(x, 112, cardWidth, 44, [221, 228, 233]);
    text(metric.label, x + 10, 128, 8, true, [94, 108, 123]);
    text(metric.value, x + 10, 146, 13, true);
  });

  let cursor = 172;
  const tables = reportTables(report);
  tables.forEach((table) => {
    const columnWidth = (PDF_WIDTH - PDF_MARGIN * 2) / Math.max(1, table.headers.length);
    const startTable = () => {
      if (cursor > PDF_HEIGHT - 80) {
        flushPage();
        drawHeader();
        cursor = 72;
      }
      text(table.title, PDF_MARGIN, cursor + 12, 11, true);
      cursor += 20;
      fillRect(PDF_MARGIN, cursor, PDF_WIDTH - PDF_MARGIN * 2, 22, [241, 245, 249]);
      let x = PDF_MARGIN;
      table.headers.forEach((header) => {
        text(header, x + 6, cursor + 14, 8, true, [71, 85, 105]);
        x += columnWidth;
      });
      cursor += 22;
    };

    startTable();
    table.rows.forEach((row) => {
      const wrapped = row.map((cell) => pdfLines(cell, columnWidth - 12, 8));
      const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
      const rowHeight = Math.max(18, lineCount * 11 + 6);
      if (cursor + rowHeight > PDF_HEIGHT - 28) {
        flushPage();
        drawHeader();
        cursor = 72;
        startTable();
      }
      let x = PDF_MARGIN;
      wrapped.forEach((lines) => {
        lines.forEach((line, index) => text(line, x + 6, cursor + 12 + index * 11, 8, false, [23, 34, 52]));
        x += columnWidth;
      });
      cursor += rowHeight;
    });
    cursor += 16;
  });

  if (!tables.length) {
    text('No attendance, tasks, or leave records for this period.', PDF_MARGIN, cursor + 12, 10, false, [94, 108, 123]);
  }

  flushPage();

  const pageStreams = pages.map((page, index) => {
    const footer = [
      `q ${pdfColor([203, 213, 225], 'RG')} 0.5 w ${PDF_MARGIN} ${topY(PDF_HEIGHT - 32)} m ${PDF_WIDTH - PDF_MARGIN} ${topY(PDF_HEIGHT - 32)} l S Q`,
      `BT /F1 7.5 Tf ${pdfColor([100, 116, 139], 'rg')} 1 0 0 1 ${PDF_MARGIN} 20 Tm (Confidential internal report) Tj ET`,
      `BT /F1 7.5 Tf ${pdfColor([100, 116, 139], 'rg')} 1 0 0 1 ${PDF_WIDTH - PDF_MARGIN - 44} 20 Tm (Page ${index + 1} of ${pages.length}) Tj ET`,
    ];
    return [...page, ...footer].join('\n');
  });
  const pageObjectIds = pageStreams.map((_, index) => 5 + index * 2);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageStreams.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  pageStreams.forEach((stream) => {
    const pageObjectId = objects.length + 1;
    const contentObjectId = pageObjectId + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `user_report_${fileStamp(report)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadUserReportXlsx(report: UserReport, organizationName: string) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const summary = [
    ['User report'],
    ['Organization', organizationName],
    ['Employee', report.name],
    ['Employee code', report.employeeCode],
    ['Department', report.department],
    ['Designation', report.designation],
    ['Period', `${report.range.start} to ${report.range.end}`],
    [],
    ['Present days', report.presentDays],
    ['Late', report.lateDays],
    ['WFH', report.wfhDays],
    ['Half days', report.halfDays],
    ['Absent', report.absentDays],
    ['Holidays', report.holidayDays],
    ['Leave days', report.leaveDays],
    ['Attendance hours', report.attendanceHours],
    ['Timesheet hours', report.timesheetHours],
    ['Task hours', report.taskHours],
    ['Hours worked', report.hoursWorked],
    ['Hours required', report.hoursRequired],
    ['LOP days', report.lopDays],
    ['LOP amount', report.lopAmount],
    ['Completed tasks', report.completedTasks],
    ['Overdue tasks', report.overdueTasks],
    ...(report.payroll.available
      ? [
          [],
          ['Gross', report.payroll.gross],
          ['Incentives', report.payroll.incentives],
          ['Deductions', report.payroll.deductions],
          ['Net', report.payroll.net],
        ]
      : []),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Summary');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Date', 'In', 'Out', 'Hours', 'Status'],
      ...report.attendance.map((row) => [row.date, row.checkIn, row.checkOut, row.hours, row.note ? `${row.status} · ${row.note}` : row.status]),
    ]),
    'Attendance'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Task', 'Project', 'Status', 'Due', 'Estimated hours', 'Actual hours', 'Overdue'],
      ...report.tasks.map((row) => [
        row.title,
        row.project,
        row.status,
        row.dueDate,
        row.estimatedHours,
        row.actualHours,
        row.overdue ? 'Yes' : 'No',
      ]),
    ]),
    'Tasks'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Type', 'Start', 'End', 'Days', 'Status', 'Pay'],
      ...report.leaves.map((row) => [row.type, row.startDate, row.endDate, row.days, row.status, row.paid ? 'Paid' : 'LOP']),
    ]),
    'Leaves'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Item', 'Amount'],
      ['Gross', report.payroll.gross],
      ['Incentives', report.payroll.incentives],
      ['Deductions', report.payroll.deductions],
      ['LOP days', report.lopDays],
      ['LOP amount', report.lopAmount],
      ['Net', report.payroll.net],
      [],
      ['Deduction / incentive', 'Amount', 'Detail'],
      ...report.payroll.deductionLines.map((item) => [item.name, item.amount, 'Deduction']),
      ...report.payroll.incentiveItems.map((item) => [item.type, item.amount, item.reason]),
    ]),
    'Payroll'
  );
  XLSX.writeFile(workbook, `user_report_${fileStamp(report)}.xlsx`);
}
