'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
const periodLabel = (period: Period, anchor: string) => {
  const date = new Date(anchor + 'T12:00:00');
  if (period === 'Month') return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  if (period === 'Week') return 'Week of ' + date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function MobileAttendanceHistory({ rows, today, onCorrection }: {
  rows: HistoryRow[]; today: string; onCorrection?: (date?: string) => void;
}) {
  const [period, setPeriod] = useState<Period>('Month');
  const [anchor, setAnchor] = useState(today);
  const [expanded, setExpanded] = useState<string | null>(null);
  const movePeriod = (direction: number) => {
    const date = new Date(anchor + 'T12:00:00');
    if (period === 'Month') { date.setDate(1); date.setMonth(date.getMonth() + direction); }
    else date.setDate(date.getDate() + direction * (period === 'Week' ? 7 : 1));
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    setAnchor(key > today ? today : key); setExpanded(null);
  };
  const nextDisabled = period === 'Month'
    ? anchor.slice(0, 7) >= today.slice(0, 7)
    : period === 'Week'
      ? (() => { const end = new Date(anchor + 'T12:00:00'); end.setDate(end.getDate() + (7 - end.getDay()) % 7); return end >= new Date(today + 'T12:00:00'); })()
      : anchor >= today;
  const visible = useMemo(() => {
    const weekStart = new Date(`${anchor}T12:00:00`);
    weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
    const startKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate()+6);
    const endKey = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth()+1).padStart(2,'0')}-${String(weekEnd.getDate()).padStart(2,'0')}`;
    return rows.filter(row => row.date <= today && (period === 'Day' ? row.date === anchor : period === 'Week' ? row.date >= startKey && row.date <= endKey : row.date.startsWith(anchor.slice(0, 7)))).sort((a,b)=>b.date.localeCompare(a.date));
  }, [rows, today, anchor, period]);
  const worked = visible.filter(row => row.logged !== '-' && row.loggedSeconds > 0);
  const average = worked.length ? worked.reduce((sum, row) => sum + row.loggedSeconds, 0) / worked.length : 0;
  const present = visible.filter(row => row.in !== '-' && !/absent|leave|missed|missing/i.test(row.status)).length;
  const late = visible.filter(row => /late/i.test(row.status)).length;
  return <section className={styles.history} aria-label="Attendance history">
    <div className={styles.tabs} role="tablist" aria-label="History period">{(['Month', 'Week', 'Day'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={period === value} aria-controls="attendance-history-days" onClick={() => { setPeriod(value); setExpanded(null); }}>{value}</button>)}</div>
    <div className={styles.period}>
      <button type="button" className={styles.periodNav} aria-label="Previous history period" onClick={() => movePeriod(-1)}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <label className={styles.periodTitle}>
        <span>{periodLabel(period, anchor)}</span>
        <input type="date" aria-label="History date" max={today} value={anchor} onChange={e => { if (e.target.value && e.target.value <= today) { setAnchor(e.target.value); setExpanded(null); } }} />
      </label>
      <button type="button" className={styles.periodNav} aria-label="Next history period" disabled={nextDisabled} onClick={() => movePeriod(1)}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
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
            <span className={styles.expand} aria-hidden="true">{open ? '−' : '+'}</span>
          </button>
          {open && <div id={`history-detail-${row.date}`} className={styles.details}>
            <dl><div><dt>Status</dt><dd>{row.status}</dd></div><div><dt>Location</dt><dd>{row.inLoc || 'Unavailable'}</dd></div><div><dt>Scheduled</dt><dd>{row.sched}</dd></div><div><dt>Logged</dt><dd>{row.logged}</dd></div></dl>
            {(row.sessions?.length || 0) > 1 && <ul>{row.sessions!.map(session => <li key={session.label}><strong>{session.label}</strong><span>{timeLabel(session.in)} – {timeLabel(session.out)}</span><small>{session.loc}</small></li>)}</ul>}
            {onCorrection && <button type="button" onClick={() => onCorrection(row.date)}>Correct this day</button>}
          </div>}
        </article>;
      })}
      {!visible.length && <p className={styles.empty}>No attendance records for this {period.toLowerCase()}.</p>}
    </div>
    {onCorrection && <button type="button" className={styles.correction} onClick={() => onCorrection()}>Request correction</button>}
  </section>;
}
