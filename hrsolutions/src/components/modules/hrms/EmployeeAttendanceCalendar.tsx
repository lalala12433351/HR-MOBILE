'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Holiday, LeaveRequest } from '@/types';
import { toLocalDateKey } from '@/utils/attendancePunches';

type Punch = { date: string; inTime: string; outTime: string; hours: string; breakH: string; loc: string; status: string };
const localDate = (key: string) => new Date(`${key.slice(0, 10)}T00:00:00`);
const hoursValue = (text: string) => Number(text.match(/([\d.]+)h/)?.[1] || 0) + Number(text.match(/(\d+)m/)?.[1] || 0) / 60;
const clockMinutes = (text: string) => { const match = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); if (!match) return null; let hour = Number(match[1]); if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0); return hour * 60 + Number(match[2]); };

export function EmployeeAttendanceCalendar({ logs, leaves, holidays = [], workingDays }: { logs: Punch[]; leaves: LeaveRequest[]; holidays?: Holiday[]; workingDays?: string[] }) {
  const today = toLocalDateKey();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const monthDate = localDate(`${month}-01`);
  const monthLogs = logs.filter((row) => row.date.slice(0, 7) === month);
  const logMap = useMemo(() => { const map = new Map<string, Punch[]>(); logs.forEach((log) => { const key = log.date.slice(0, 10); map.set(key, [...(map.get(key) || []), log]); }); return map; }, [logs]);
  const holidayMap = new Map(holidays.filter((holiday) => holiday.isApproved !== false).map((holiday) => [holiday.date.slice(0, 10), holiday.name]));
  const working = new Set((workingDays?.length ? workingDays : ['Monday','Tuesday','Wednesday','Thursday','Friday']).map((day) => day.slice(0, 3).toLowerCase()));
  const info = (key: string) => {
    const rows = logMap.get(key) || [];
    const holiday = holidayMap.get(key);
    const leave = leaves.find((item) => item.status === 'Approved' && item.startDate.slice(0, 10) <= key && item.endDate.slice(0, 10) >= key);
    let label = rows[0]?.status || (holiday ? 'Holiday' : leave ? leave.leaveType === 'Work From Home' ? 'WFH' : /loss|unpaid/i.test(leave.leaveType) ? 'LOP' : 'Leave' : !working.has(localDate(key).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()) ? 'Weekend' : key > today ? 'Upcoming' : 'No detail');
    if (label === 'Work From Home') label = 'WFH';
    const tone = /late|half/i.test(label) ? 'warning' : /absent|lop/i.test(label) ? 'danger' : /present|wfh/i.test(label) ? 'success' : /leave|holiday/i.test(label) ? 'info' : 'muted';
    return { rows, label, tone, holiday, hours: rows.reduce((sum, row) => sum + hoursValue(row.hours), 0) };
  };
  const count = new Set(monthLogs.filter((row) => /present|late|work from home|half day/i.test(row.status)).map((row) => row.date.slice(0, 10))).size;
  const arrivals = monthLogs.map((row) => clockMinutes(row.inTime)).filter((value): value is number => value !== null);
  const avg = arrivals.length ? Math.round(arrivals.reduce((sum, value) => sum + value, 0) / arrivals.length) : null;
  const detail = info(selected);
  const offset = (monthDate.getDay() + 6) % 7;
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const shift = (direction: number) => { const date = new Date(monthDate.getFullYear(), monthDate.getMonth() + direction, 1); const key = toLocalDateKey(date); setMonth(key.slice(0, 7)); setSelected(key); };
  return <section className="employee-attendance-calendar">
    <div className="employee-calendar-metrics">
      <div><span>Present days</span><strong>{count}</strong></div>
      <div><span>On-time rate</span><strong>{count ? `${Math.round(monthLogs.filter((row) => /present|work from home/i.test(row.status)).length / monthLogs.filter((row) => /present|late|work from home|half day/i.test(row.status)).length * 100)}%` : '-'}</strong></div>
      <div><span>Avg log-in</span><strong>{avg === null ? '-' : `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`}</strong></div>
      <div><span>Avg hours</span><strong>{monthLogs.length ? `${(monthLogs.reduce((sum, row) => sum + hoursValue(row.hours), 0) / monthLogs.length).toFixed(1)}h` : '-'}</strong></div>
    </div>
    <header><h3>Attendance</h3><div><button type="button" aria-label="Previous attendance month" onClick={() => shift(-1)}><ChevronLeft size={16} /></button><strong>{monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Next attendance month" onClick={() => shift(1)}><ChevronRight size={16} /></button></div></header>
    <div className="employee-calendar-legend">{['Present / WFH','Holiday','Late','Half day','Leave','Absent','LOP'].map((label) => <span key={label} data-tone={/Late|Half/.test(label) ? 'warning' : /Absent|LOP/.test(label) ? 'danger' : /Present/.test(label) ? 'success' : 'info'}>{label}</span>)}</div>
    <div className="employee-calendar-grid" role="group" aria-label="Employee attendance calendar">
      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span className="employee-calendar-weekday" key={day}>{day}</span>)}
      {Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => {
        const day = index - offset + 1;
        if (day < 1 || day > daysInMonth) return <div key={index} className="employee-calendar-blank" />;
        const key = `${month}-${String(day).padStart(2, '0')}`, data = info(key);
        return <button type="button" key={key} data-tone={data.tone} aria-pressed={selected === key} aria-label={`${localDate(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, ${data.label}`} onClick={() => setSelected(key)}><strong>{String(day).padStart(2, '0')}</strong><span>{data.label}</span>{data.rows[0] && <small>{data.rows[0].inTime} - {data.rows[data.rows.length - 1].outTime}</small>}{data.hours > 0 && <small>{data.hours.toFixed(1)}h worked</small>}{data.holiday && <small>{data.holiday}</small>}</button>;
      })}
    </div>
    <p className="employee-calendar-hint">Select a day to view punch details. Daily detail is shown where available.</p>
    <div className="employee-calendar-detail" aria-live="polite"><h4>{localDate(selected).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {detail.label}</h4>{detail.rows.length ? detail.rows.map((row, index) => <dl key={`${row.date}-${index}`}><div><dt>Clock in</dt><dd>{row.inTime}</dd></div><div><dt>Clock out</dt><dd>{row.outTime}</dd></div><div><dt>Worked</dt><dd>{row.hours}</dd></div><div><dt>Break</dt><dd>{row.breakH}</dd></div><div><dt>Location</dt><dd>{row.loc}</dd></div></dl>) : <p>{detail.holiday || (detail.label === 'No detail' ? 'No punch details recorded for this day.' : detail.label)}</p>}</div>
  </section>;
}
