'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AttendanceStatusPill } from './AttendanceStatusPill';
import { ATT_TABLE_HEAD, ATT_TABLE_SHELL } from './attendanceUi';

export interface MyAttendanceLogRow {
  date: string;
  in: string;
  inLoc: string;
  out: string;
  outLoc: string;
  sched: string;
  logged: string;
  deficit: string;
  status: string;
  sessions?: { label: string; in: string; out: string; loc: string }[];
}

interface MyAttendanceLogTableProps {
  rows: MyAttendanceLogRow[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rows: number) => void;
  isStudentMode?: boolean;
}

function deficitClass(deficit: string) {
  if (deficit.startsWith('+')) return 'att-log-over';
  if (deficit === '0m' || deficit === '-0m') return '';
  return 'att-log-short';
}

function statusKind(status: string): 'present' | 'late' | 'on_leave' | 'wfh' {
  const s = status.toLowerCase();
  if (s.includes('late')) return 'late';
  if (s.includes('leave')) return 'on_leave';
  if (s.includes('wfh') || s.includes('home')) return 'wfh';
  return 'present';
}

export function MyAttendanceLogTable({
  rows,
  totalCount,
  currentPage,
  totalPages,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  isStudentMode = false,
}: MyAttendanceLogTableProps) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const from = totalCount === 0 ? 0 : Math.min((currentPage - 1) * rowsPerPage + 1, totalCount);
  const to = Math.min(currentPage * rowsPerPage, totalCount);
  const pageButtons = Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1);

  return (
    <div className={ATT_TABLE_SHELL}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className={ATT_TABLE_HEAD}>
            <tr>
              <th>Date</th>
              <th>Clock in</th>
              <th>In location</th>
              <th>Clock out</th>
              <th>Out location</th>
              {!isStudentMode && <th>Schedule</th>}
              {!isStudentMode && <th>Logged</th>}
              {!isStudentMode && <th className="text-right">Variance</th>}
              {isStudentMode && <th className="text-right">Status</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={isStudentMode ? 6 : 8}>
                  <div className="work-empty">No punches in this range. Clock in above, or widen the filters.</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const rowKey = `${row.date}-${row.in}`;
                const open = openDate === rowKey;
                return (
                  <React.Fragment key={rowKey}>
                    <tr>
                      <td>
                        <button
                          type="button"
                          className="att-log-date"
                          aria-expanded={open}
                          onClick={() => setOpenDate(open ? null : rowKey)}
                        >
                          <ChevronDown className={`att-log-caret${open ? ' is-open' : ''}`} aria-hidden />
                          {row.date}
                        </button>
                      </td>
                      <td className="tabular-nums" suppressHydrationWarning>
                        {row.in}
                      </td>
                      <td className="att-log-loc">{row.inLoc}</td>
                      <td className="tabular-nums" suppressHydrationWarning>
                        {row.out}
                      </td>
                      <td className="att-log-loc">{row.outLoc}</td>
                      {!isStudentMode && <td className="tabular-nums">{row.sched}</td>}
                      {!isStudentMode && (
                        <td className="tabular-nums font-semibold" suppressHydrationWarning>
                          {row.logged}
                        </td>
                      )}
                      {!isStudentMode && (
                        <td
                          className={`tabular-nums text-right font-semibold ${deficitClass(row.deficit)}`}
                          suppressHydrationWarning
                        >
                          {row.deficit}
                        </td>
                      )}
                      {isStudentMode && (
                        <td className="text-right whitespace-nowrap">
                          <AttendanceStatusPill kind={statusKind(row.status)} label={row.status} />
                        </td>
                      )}
                    </tr>
                    {open && (
                      <tr className="att-log-detail">
                        <td colSpan={isStudentMode ? 6 : 8}>
                          <div className="att-log-detail-inner">
                            <span>
                              Status <strong>{row.status}</strong>
                            </span>
                            <span>
                              In <strong>{row.inLoc}</strong>
                            </span>
                            <span>
                              Out <strong>{row.outLoc}</strong>
                            </span>
                            {!isStudentMode && (
                              <span>
                                Logged <strong>{row.logged}</strong> of {row.sched}
                              </span>
                            )}
                            {(row.sessions?.length || 0) > 1 && (
                              <span>
                                {row.sessions!.length} logins today
                              </span>
                            )}
                          </div>
                          {(row.sessions?.length || 0) > 1 ? (
                            <ul className="att-log-sessions">
                              {row.sessions!.map((session) => (
                                <li key={`${row.date}-${session.label}`}>
                                  <strong>{session.label}</strong>
                                  <span>
                                    {session.in} → {session.out}
                                  </span>
                                  <span>{session.loc}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="att-log-foot">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
            className="att-page-btn"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {pageButtons.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`att-page-btn${currentPage === page ? ' is-current' : ''}`}
            >
              {page}
            </button>
          ))}
          {totalPages > 3 && (
            <>
              <span className="px-1 text-[var(--text-muted)]">…</span>
              <button
                type="button"
                onClick={() => onPageChange(totalPages)}
                className={`att-page-btn${currentPage === totalPages ? ' is-current' : ''}`}
              >
                {totalPages}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="att-page-btn"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
          <span>
            Showing {from} to {to} of {totalCount}
          </span>
          <label className="flex items-center gap-1">
            Show
            <select
              value={rowsPerPage}
              onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
              className="work-field h-7 py-0 px-2 text-xs"
            >
              <option value={6}>6</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
