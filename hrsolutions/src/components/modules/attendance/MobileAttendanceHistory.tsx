'use client';

import React, { useMemo, useState } from 'react';
import type { MyAttendanceLogRow } from './MyAttendanceLogTable';
import styles from './mobile-attendance-history.module.css';

type HistoryRow = MyAttendanceLogRow & { loggedSeconds: number };
type Period = 'Month' | 'Week' | 'Day';
const timeLabel = (value: string) => {
  if (!value || value === '-') return '-';
  if (/progress/i.test(value)) return 'In progress';
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return value.replace(/(\d{1,2}:\d{2}):\d{2}/, '$1');
};
const hoursLabel = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;

export function MobileAttendanceHistory({ rows, today, onCorrection }: {
  rows: HistoryRow[]; today: string; onCorrection?: (date?: string) => void;
}) {
  const [period, setPeriod] = useState<Period>('Month');
  const [expanded, setExpanded] = useState<string | null>(null);
  const visible = useMemo(() => {
    const weekStart = new Date(`${today}T12:00:00`);
    weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
    const startKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
    return rows.filter(row => row.date <= today && (period === 'Day' ? row.date === today : period === 'Week' ? row.date >= startKey : row.date.startsWith(today.slice(0, 7))));
  }, [rows, today, period]);
  const worked = visible.filter(row => row.logged !== '-' && row.loggedSeconds > 0);
  const average = worked.length ? worked.reduce((sum, row) => sum + row.loggedSeconds, 0) / worked.length : 0;
  const present = visible.filter(row => row.in !== '-' && !/absent|leave|missed|missing/i.test(row.status)).length;
  const late = visible.filter(row => /late/i.test(row.status)).length;
  return <section className={styles.history} aria-label="Attendance history">
    <div className={styles.tabs} role="tablist" aria-label="History period">{(['Month', 'Week', 'Day'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={period === value} aria-controls="attendance-history-days" onClick={() => { setPeriod(value); setExpanded(null); }}>{value}</button>)}</div>
    <div className={styles.metric}><span>Average worked hours</span><strong>{hoursLabel(average)}</strong><small>{present} present · {late} late {late === 1 ? 'arrival' : 'arrivals'}</small></div>
    <h2>Recent days</h2>
    <div id="attendance-history-days" className={styles.days} role="tabpanel" aria-label={`${period} attendance`}>
      {visible.map(row => {
        const missing = /missed|missing/i.test(row.status);
        const open = expanded === row.date;
        const parsed = new Date(`${row.date}T12:00:00`);
        const date = `${parsed.toLocaleDateString('en-GB', { weekday: 'short' })}, ${parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
        const detail = missing ? 'Missing clock out · Action required' : `${timeLabel(row.in)} – ${timeLabel(row.out)}${/progress/i.test(row.out) || row.logged === '-' ? '' : ` · ${row.logged}`}`;
        return <article key={row.date} className={styles.day}>
          <button type="button" className={styles.row} aria-expanded={open} aria-controls={`history-detail-${row.date}`} onClick={() => setExpanded(open ? null : row.date)}>
            <span className={styles.copy}><span>{date}{row.date === today ? ' · Today' : ''}</span><small className={missing ? styles.warning : undefined}>{detail}</small></span>
            <img src="/mobile-v2/time-navigation-forward.svg" width="16" height="16" alt="" />
          </button>
          {open && <div id={`history-detail-${row.date}`} className={styles.details}>
            <dl><div><dt>Status</dt><dd>{row.status}</dd></div><div><dt>Location</dt><dd>{row.inLoc || 'Unavailable'}</dd></div><div><dt>Scheduled</dt><dd>{row.sched}</dd></div><div><dt>Logged</dt><dd>{row.logged}</dd></div></dl>
            {(row.sessions?.length || 0) > 1 && <ul>{row.sessions!.map(session => <li key={session.label}><strong>{session.label}</strong><span>{timeLabel(session.in)} – {timeLabel(session.out)}</span><small>{session.loc}</small></li>)}</ul>}
            {onCorrection && <button type="button" onClick={() => onCorrection(row.date)}>Request correction for this day</button>}
          </div>}
        </article>;
      })}
      {!visible.length && <p className={styles.empty}>No attendance records for this {period.toLowerCase()}.</p>}
    </div>
    {onCorrection && <button type="button" className={styles.correction} onClick={() => onCorrection()}>Request correction</button>}
  </section>;
}
