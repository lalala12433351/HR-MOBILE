'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  UserReportAttendanceRow,
  UserReportLeaveRow,
  UserReportRange,
} from '@/utils/userReport';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_LABEL = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const parseKey = (value: string) => {
  const [y, m] = value.slice(0, 10).split('-').map(Number);
  return { year: y, month: m - 1 };
};

function eachDayKeys(start: string, end: string) {
  const keys: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    keys.push(dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function leavesOnDay(leaves: UserReportLeaveRow[], day: string) {
  return leaves.filter((leave) => leave.startDate <= day && leave.endDate >= day);
}

type DayTone = 'ok' | 'late' | 'leave' | 'absent' | 'lop' | 'half' | 'muted' | 'empty';

function toneFor(status: string | null, leave: UserReportLeaveRow | null): DayTone {
  if (leave) {
    if (leave.status === 'Approved' && !leave.paid) return 'lop';
    return 'leave';
  }
  if (!status) return 'empty';
  const key = status.toLowerCase();
  if (key.includes('absent')) return 'absent';
  if (key.includes('lop') || key.includes('loss of pay')) return 'lop';
  if (key.includes('late')) return 'late';
  if (key.includes('half')) return 'half';
  if (['present', 'work from home', 'wfh', 'holiday', 'week off'].some((s) => key.includes(s))) return 'ok';
  return 'muted';
}

function statusLabel(status: string | null, leave: UserReportLeaveRow | null) {
  if (leave) {
    const lop = leave.status === 'Approved' && !leave.paid ? ' · LOP' : '';
    return `${leave.type}${lop}`;
  }
  return status || '';
}

type DayCell = {
  key: string;
  day: number;
  inMonth: boolean;
  inRange: boolean;
  weekend: boolean;
  attendance: UserReportAttendanceRow | null;
  leave: UserReportLeaveRow | null;
  tone: DayTone;
  label: string;
};

export function AttendanceMonthCalendar({
  range,
  attendance,
  leaves,
}: {
  range: UserReportRange;
  attendance: UserReportAttendanceRow[];
  leaves: UserReportLeaveRow[];
}) {
  const startMonth = parseKey(range.start);
  const endMonth = parseKey(range.end);
  const [cursor, setCursor] = useState(() => ({ ...startMonth }));

  useEffect(() => {
    setCursor({ ...parseKey(range.start) });
  }, [range.start, range.end]);

  const canPrev =
    cursor.year > startMonth.year || (cursor.year === startMonth.year && cursor.month > startMonth.month);
  const canNext =
    cursor.year < endMonth.year || (cursor.year === endMonth.year && cursor.month < endMonth.month);

  const attendanceByDate = useMemo(() => {
    const map = new Map<string, UserReportAttendanceRow>();
    attendance.forEach((row) => map.set(row.date, row));
    return map;
  }, [attendance]);

  const rangeKeys = useMemo(() => new Set(eachDayKeys(range.start, range.end)), [range.end, range.start]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const lead = first.getDay();
    const total = Math.ceil((lead + daysInMonth) / 7) * 7;
    const result: DayCell[] = [];

    for (let index = 0; index < total; index += 1) {
      const dayNumber = index - lead + 1;
      const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
      const date = inMonth
        ? new Date(cursor.year, cursor.month, dayNumber)
        : new Date(cursor.year, cursor.month, dayNumber);
      const key = dateKey(date.getFullYear(), date.getMonth(), date.getDate());
      const attendanceRow = attendanceByDate.get(key) || null;
      const dayLeaves = leavesOnDay(leaves, key);
      const primaryLeave =
        dayLeaves.find((item) => item.status === 'Approved') ||
        dayLeaves.find((item) => item.status === 'Pending') ||
        dayLeaves[0] ||
        null;
      const inRange = rangeKeys.has(key);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const tone = inMonth && inRange ? toneFor(attendanceRow?.status || null, primaryLeave) : 'empty';

      result.push({
        key,
        day: date.getDate(),
        inMonth,
        inRange,
        weekend,
        attendance: attendanceRow,
        leave: primaryLeave,
        tone,
        label: statusLabel(attendanceRow?.status || null, primaryLeave),
      });
    }
    return result;
  }, [attendanceByDate, cursor.month, cursor.year, leaves, rangeKeys]);

  const shiftMonth = (delta: number) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const hasAnyData = attendance.length > 0 || leaves.length > 0;

  return (
    <div className="people-studio__att-cal">
      <div className="people-studio__att-cal-toolbar">
        <button
          type="button"
          className="people-studio__btn people-studio__btn--ghost people-studio__btn--compact"
          onClick={() => shiftMonth(-1)}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          ←
        </button>
        <p className="people-studio__att-cal-month">{MONTH_LABEL(cursor.year, cursor.month)}</p>
        <button
          type="button"
          className="people-studio__btn people-studio__btn--ghost people-studio__btn--compact"
          onClick={() => shiftMonth(1)}
          disabled={!canNext}
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="people-studio__att-cal-legend" aria-hidden="true">
        {[
          ['ok', 'Present / WFH'],
          ['late', 'Late'],
          ['half', 'Half day'],
          ['leave', 'Leave'],
          ['absent', 'Absent'],
          ['lop', 'LOP'],
        ].map(([tone, label]) => (
          <span key={tone} className={`people-studio__att-cal-legend-item is-${tone}`}>
            {label}
          </span>
        ))}
      </div>

      <div className="people-studio__att-cal-weekdays">
        {WEEKDAYS.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="people-studio__att-cal-grid">
        {cells.map((cell) => {
          const times =
            cell.attendance && (cell.attendance.checkIn !== '—' || cell.attendance.checkOut !== '—')
              ? `${cell.attendance.checkIn} – ${cell.attendance.checkOut}`
              : '';
          const hours =
            cell.attendance && cell.attendance.hours > 0 ? `${cell.attendance.hours.toFixed(1)}h` : '';

          return (
            <div
              key={`${cell.key}-${cell.inMonth ? 'in' : 'out'}`}
              className={[
                'people-studio__att-cal-day',
                cell.inMonth ? '' : 'is-outside',
                cell.inRange ? '' : 'is-out-of-range',
                cell.weekend ? 'is-weekend' : '',
                `is-${cell.tone}`,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="people-studio__att-cal-day-top">
                <span className="people-studio__att-cal-day-num">{cell.day}</span>
                {cell.label && cell.inMonth && cell.inRange ? (
                  <span className="people-studio__att-cal-pill">{cell.label}</span>
                ) : null}
              </div>
              {cell.inMonth && cell.inRange ? (
                <div className="people-studio__att-cal-day-body">
                  {times ? <span className="people-studio__att-cal-times">{times}</span> : null}
                  {hours ? <span className="people-studio__att-cal-hours">{hours}</span> : null}
                  {cell.leave && cell.attendance ? (
                    <span className="people-studio__att-cal-leave-note">
                      {cell.leave.status}
                      {!cell.leave.paid && cell.leave.status === 'Approved' ? ' · LOP' : ''}
                    </span>
                  ) : null}
                  {!cell.attendance && !cell.leave && cell.weekend ? (
                    <span className="people-studio__att-cal-quiet">Weekend</span>
                  ) : null}
                  {!cell.attendance && !cell.leave && !cell.weekend ? (
                    <span className="people-studio__att-cal-quiet">No record</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!hasAnyData ? (
        <p className="people-studio__att-cal-footnote">No attendance or leave records for this period.</p>
      ) : null}
    </div>
  );
}
