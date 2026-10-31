'use client';

import React from 'react';
import Link from 'next/link';
import type { Holiday } from '@/types';
import { dateKey, upcomingHolidays } from '@/utils/dashboardPeople';
import styles from './mobile-attendance-home.module.css';

type ActionKind = 'logs' | 'requests' | 'leave' | 'balance' | 'history' | 'team';

function ActionIcon({ kind }: { kind: ActionKind }) {
 const paths: Record<ActionKind, React.ReactNode> = {
  logs: <><path d="M4 3h12v18H4zM16 7h4v14h-4"/><path d="M7 7h6M7 11h6M7 15h3"/></>,
  requests: <><path d="M3 5h18v11H10l-5 4v-4H3z"/><path d="M7 9h10M7 12h6"/></>,
  leave: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M12 13v5M9.5 15.5h5"/></>,
  balance: <><path d="M4 4h16v16H4zM4 9h16M8 2v4M16 2v4M8 16v-3M12 16v-1M16 16v-4"/></>,
  history: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l-3 2M17 4l3 2"/></>,
  team: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v2"/></>,
 };
 return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function ActionCard({ kind, title, detail, onClick }: { kind: ActionKind; title: string; detail: string; onClick: () => void }) {
 return <button type="button" className={styles.action} onClick={onClick}>
  <span className={styles.icon} data-kind={kind}><ActionIcon kind={kind}/></span>
  <span className={styles.actionCopy}><strong>{title}</strong><small>{detail}</small></span>
 </button>;
}

export function MobileAttendanceHome({ today, holidays, student, onLogs, onRequests, onApplyLeave, onBalances, onLeaveHistory, onTeam }: {
 today: string; holidays: Holiday[]; student: boolean;
 onLogs: () => void; onRequests: () => void; onApplyLeave: () => void; onBalances: () => void; onLeaveHistory: () => void; onTeam?: () => void;
}) {
 const upcoming = upcomingHolidays(holidays, today, 3);
 return <div className={styles.home}>
  <section className={styles.section} aria-labelledby="attendance-actions-title">
   <h2 id="attendance-actions-title">Your records</h2>
   <div className={styles.grid}>
    <ActionCard kind="logs" title="Logs and shifts" detail="View your attendance records and hours" onClick={onLogs}/>
    {!student && <ActionCard kind="requests" title="Requests history" detail="Track corrections and work-from-home requests" onClick={onRequests}/>}
    {onTeam && <ActionCard kind="team" title={student ? 'Class attendance' : 'Team attendance'} detail="Review attendance across your team" onClick={onTeam}/>}
    {!student && <Link href="/timesheets" className={styles.action}><span className={styles.icon} data-kind="history"><ActionIcon kind="history"/></span><span className={styles.actionCopy}><strong>Timesheets</strong><small>View logged time and schedules</small></span></Link>}
   </div>
  </section>
  {!student && <section className={styles.section} aria-labelledby="leave-actions-title">
   <div className={styles.heading}><h2 id="leave-actions-title">Time off</h2><button type="button" className={styles.apply} onClick={onApplyLeave}>Apply leave</button></div>
   <div className={styles.grid}>
    <ActionCard kind="balance" title="Leave balances" detail="Check your available leave days" onClick={onBalances}/>
    <ActionCard kind="history" title="Leave history" detail="View your leave requests and their status" onClick={onLeaveHistory}/>
   </div>
  </section>}
  <section className={styles.section} aria-labelledby="attendance-holidays-title">
   <div className={styles.heading}><h2 id="attendance-holidays-title">Upcoming holidays</h2><Link href="/attendance?tab=holidays">View all</Link></div>
   <div className={styles.holidays}>
    {upcoming.map(holiday => {
     const date = new Date(dateKey(holiday.date) + 'T12:00:00');
     return <Link href="/attendance?tab=holidays" className={styles.holiday} key={holiday.id}>
      <time dateTime={dateKey(holiday.date)}><span>{date.toLocaleDateString('en-GB',{month:'short'})}</span><strong>{date.getDate()}</strong></time>
      <span><strong>{holiday.name}</strong><small>{dateKey(holiday.date) === today ? 'Today' : date.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</small></span>
     </Link>;
    })}
    {!upcoming.length && <p>No upcoming published holidays.</p>}
   </div>
  </section>
 </div>;
}
