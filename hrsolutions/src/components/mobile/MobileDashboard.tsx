'use client';
import React from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { DashboardDataProvider, useDashboardContext } from '@/components/modules/dashboard/DashboardDataContext';
import { DashboardClockInCard } from '@/components/modules/dashboard/DashboardClockInCard';
import { SetupPromptModal } from '@/components/modules/dashboard/SetupPromptModal';
import { MobileRow, MobileSection } from './MobilePrimitives';
import { dateKey, localDateKey, upcomingHolidays } from '@/utils/dashboardPeople';
import { getTeamEmployees, isTaskAssignee } from '@/utils/teamAccess';
import styles from './mobile-dashboard.module.css';

function dayLabel(value?: string) {
 const key = dateKey(value);
 if (!key) return '';
 const date = new Date(key + 'T12:00:00');
 return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function DashboardPanel({ title, href, action, children }: { title: string; href: string; action: string; children: React.ReactNode }) {
 return <section className={styles.panel}><div className={styles.panelHeading}><h2>{title}</h2><Link href={href}>{action}</Link></div>{children}</section>;
}

function DateTile({ date }: { date: string }) {
 const parsed = new Date(dateKey(date) + 'T12:00:00');
 if (Number.isNaN(parsed.getTime())) return null;
 return <time className={styles.dateTile} dateTime={dateKey(date)}><span>{parsed.toLocaleDateString('en-GB', { month: 'short' })}</span><strong>{parsed.getDate()}</strong></time>;
}

function MobileDashboardContent() {
 const { state, currentPersona } = useApp();
 const data = useDashboardContext();
 const today = localDateKey();
 const role = currentPersona?.role || 'employee';
 const executive = ['super_admin','admin'].includes(role);
 const hr = ['hr_manager','hr'].includes(role);
 const manager = ['super_admin','admin','hr_manager','hr','manager','project_manager'].includes(role);
 const tasks = data.tasks || state.tasks || [];
 const personalTasks = Array.from(new Map([...(data.tasks || []), ...(state.tasks || [])].map(t => [t.id, t])).values());
 const myTasks = personalTasks.filter(t => !t.isRecurrenceTemplate && t.status !== 'Completed' && isTaskAssignee(t, currentPersona?.id, currentPersona?.name)).sort((a,b) => (dateKey(a.dueDate) || '9999').localeCompare(dateKey(b.dueDate) || '9999'));
 const scheduleEntries = Array.from(new Map([...(data.timesheets || []), ...(state.timesheets || [])].map(t => [t.id, t])).values());
 const schedules = scheduleEntries.filter(t => (t.entryType === 'schedule' || t.category === 'Meeting') && dateKey(t.date) >= today && (
  Boolean(currentPersona?.id && t.employeeId === currentPersona.id) || Boolean(currentPersona?.name && t.employeeName?.toLowerCase() === currentPersona.name.toLowerCase())
 )).sort((a,b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || ''))).slice(0,3);
 const holidays = upcomingHolidays(state.customOptions?.holidays, today, 3);
 const employees = getTeamEmployees(currentPersona, state.employees || []);
 const ids = new Set(employees.map(e => e.id));
 const attendance = (data.attendance || state.attendance || []).filter(a => a.date === today && ids.has(a.employeeId));
 const present = new Set(attendance.filter(a => a.checkIn).map(a => a.employeeId)).size;
 const pendingLeaves = (state.leaves || []).filter(l => ids.has(l.employeeId) && ['Pending','Manager approved'].includes(l.status));
 const pendingCorrections = (state.regularizations || []).filter(r => r.status === 'Pending' && ids.has(r.employeeId));
 const pendingTime = (data.timesheets || state.timesheets || []).filter(t=>ids.has(t.employeeId) && ['Pending','Submitted','Review'].includes(t.status));
 const onLeave = (state.leaves || []).filter(l=>ids.has(l.employeeId) && l.status==='Approved' && l.startDate.slice(0,10)<=today && l.endDate.slice(0,10)>=today).length;
 const quick = [
  { label: 'Leave', href: '/leaves', asset: 'calendar' }, { label: 'Payslips', href: '/payslips', asset: 'file' },
  { label: 'Log time', href: '/timesheets', asset: 'time' }, { label: 'People', href: '/hr?tab=directory', asset: 'people' },
 ];
 if (data.loading) return <div className="m2-page" aria-busy="true" aria-label="Loading your day"><div className="m2-skeleton" /><div className="m2-skeleton" /><div className="m2-skeleton" /></div>;
 const pendingCount = pendingLeaves.length + pendingCorrections.length + pendingTime.length;
 const teamSummary = <section className={styles.overview} aria-label="Team attendance today">
  <div className={styles.overviewHeading}><h2>Today's attendance</h2><Link href="/attendance?tab=team_attendance">View team</Link></div>
  <div className={styles.figures}>
   <Link href="/attendance?tab=team_attendance"><strong>{present}<small> / {employees.length}</small></strong><span>Checked in</span></Link>
   <Link href="/attendance?tab=leaves"><strong>{onLeave}</strong><span>On leave</span></Link>
   <Link href="/attendance?tab=team_attendance"><strong>{Math.max(0,employees.length-present-onLeave)}</strong><span>Not in yet</span></Link>
  </div>
 </section>;
 const shortcuts = <MobileSection title="Quick access"><div className="m2-quick-actions">{quick.map(q => <Link href={q.href} key={q.label}><span><img src={'/mobile-v2/home-icon-' + q.asset + '.svg'} width="22" height="22" alt="" /></span>{q.label}</Link>)}</div></MobileSection>;
 return <div className={`m2-page m2-home ${styles.home}`}>
  {manager && <div className={styles.day}><time dateTime={today} suppressHydrationWarning>{new Date().toLocaleDateString('en-GB', {weekday:'long',day:'numeric',month:'long'})}</time></div>}
  {executive ? <>
    <SetupPromptModal/>
    {teamSummary}
    <Link className={styles.review} href="/attendance?tab=leaves"><span><strong>Pending leave requests</strong><small>Awaiting review</small></span><b>{pendingLeaves.length}</b></Link>
    {shortcuts}
    <MobileSection title="Open tasks">{tasks.filter(t=>t.status!=='Completed').slice(0,3).map(t=><MobileRow key={t.id} title={t.title} detail={[t.assigneeName,t.dueDate?.slice(0,10)===today?'Today':t.dueDate?.slice(0,10)].filter(Boolean).join(' · ')} href="/projects"/>)}{!tasks.filter(t=>t.status!=='Completed').length&&<p className="m2-empty">No open tasks.</p>}</MobileSection>
    <MobileSection title="Recent activity">{attendance.slice(0,3).map(a=><MobileRow key={a.id} title={a.employeeName+' checked in'} detail={a.locationName||'Recorded attendance'} href="/attendance?tab=team_attendance"/>)}{!attendance.length&&<p className="m2-empty">No attendance activity yet today.</p>}<MobileRow title="Team attendance" detail={employees.length+' employees'} href="/attendance?tab=team_attendance"/></MobileSection>
  </> : hr ? <>
    {teamSummary}
    <div className="m2-metric"><span>Pending leave</span><strong>{pendingLeaves.length} {pendingLeaves.length===1?'request':'requests'}</strong></div>
    <div>{pendingLeaves.slice(0,3).map(l=><MobileRow key={l.id} title={l.employeeName+' · '+l.leaveType} detail={l.startDate.slice(0,10)+' · '+l.daysCount+' days'} href="/attendance?tab=leaves"/>)}{!pendingLeaves.length&&<p className="m2-empty">No leave requests waiting for approval.</p>}</div>
    <MobileSection title="People follow-ups"><MobileRow title="Verify starter profiles" detail={employees.filter(e=>!e.hasCompletedProfile).length+' profiles to complete'} href="/hr"/><MobileRow title="Review attendance exceptions" detail={pendingCorrections.length+' correction requests'} href="/attendance?tab=regularizations"/><MobileRow title="HR inbox" detail="Manage employee requests" href="/chat?view=hr"/></MobileSection>
  </> : manager ? <>
   <SetupPromptModal />
   {teamSummary}
   <MobileSection title="Needs your attention" action={<span className="m2-pending-count">{pendingCount} pending</span>}>
    {pendingLeaves.slice(0,2).map(l => <MobileRow key={l.id} title={l.employeeName + ' requested leave'} detail={l.leaveType + ' · ' + l.startDate.slice(0,10)} href="/attendance?tab=leaves" />)}
    {pendingTime.slice(0,1).map(t=><MobileRow key={t.id} title={t.employeeName+' submitted a timesheet'} detail={t.date+' · '+t.hours+'h'} href="/timesheets"/>)}
    {pendingCorrections.slice(0,2).map(r => <MobileRow key={r.id} title="Attendance correction" detail={r.employeeName + ' · ' + r.date} href="/attendance?tab=regularizations" />)}
    {!pendingLeaves.length && !pendingCorrections.length && !pendingTime.length && <p className="m2-empty">You're all caught up. No requests need your review.</p>}
    {pendingCount > 0 && <Link href={pendingLeaves.length ? '/attendance?tab=leaves' : pendingTime.length ? '/timesheets' : '/attendance?tab=regularizations'} className="m2-primary">Review requests</Link>}
   </MobileSection>
   <MobileSection title="Team delivery">{(state.projects || []).slice(0,3).map(p => { const projectTasks = tasks.filter(t => t.projectId === p.id); return <MobileRow key={p.id} title={p.name} detail={projectTasks.filter(t => t.status === 'Completed').length + ' of ' + projectTasks.length + ' tasks completed'} href="/projects" />; })}{!state.projects?.length && <p className="m2-empty">No projects yet.</p>}</MobileSection>
  </> : <>
   <DashboardClockInCard />
   {shortcuts}
   <DashboardPanel title="My tasks" href="/projects" action="View all">
    {myTasks.slice(0,3).map(t => {
     const due = dateKey(t.dueDate);
     const overdue = Boolean(due && due < today);
     return <Link key={t.id} href={'/projects?task=' + encodeURIComponent(t.id)} className={styles.workRow}>
      <span className={styles.taskMark} data-active={t.status === 'In Progress'} aria-hidden="true" />
      <span className={styles.rowCopy}><strong>{t.title}</strong><small>{t.projectName || 'Personal task'}</small><span className={styles.taskMeta}><span>{t.status}</span>{due && <time dateTime={due} data-overdue={overdue}>{overdue ? 'Overdue · ' : due === today ? '' : 'Due '}{due === today ? 'Due today' : dayLabel(due)}</time>}</span></span>
     </Link>;
    })}
    {!myTasks.length && <p className={styles.empty}>No open tasks. You're all caught up.</p>}
   </DashboardPanel>
   <DashboardPanel title="My schedule" href="/timesheets" action="View schedule">
    {schedules.map(t => <Link key={t.id} href={'/timesheets?date=' + dateKey(t.date)} className={styles.workRow}><DateTile date={t.date}/><span className={styles.rowCopy}><strong>{t.taskTitle || t.projectName || 'Meeting'}</strong><small>{dateKey(t.date) === today ? 'Today' : dayLabel(t.date)}{t.startTime ? ' · ' + t.startTime + (t.endTime ? ' – ' + t.endTime : '') : ' · Time not set'}</small>{t.projectName && t.projectName !== t.taskTitle && <small>{t.projectName}</small>}</span></Link>)}
    {!schedules.length && <p className={styles.empty}>No upcoming meetings or scheduled work.</p>}
   </DashboardPanel>
  </>}
  <DashboardPanel title="Upcoming holidays" href="/attendance?tab=holidays" action="View calendar">
   {holidays.map(h => <Link key={h.id} href="/attendance?tab=holidays" className={`${styles.workRow} ${styles.holidayRow}`}><DateTile date={h.date}/><span className={styles.rowCopy}><strong>{h.name}</strong><small>{dateKey(h.date) === today ? 'Today' : new Date(dateKey(h.date) + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}</small></span></Link>)}
   {!holidays.length && <p className={styles.empty}>No upcoming published holidays.</p>}
  </DashboardPanel>
 </div>;
}
export function MobileDashboard() { return <DashboardDataProvider><MobileDashboardContent /></DashboardDataProvider>; }
