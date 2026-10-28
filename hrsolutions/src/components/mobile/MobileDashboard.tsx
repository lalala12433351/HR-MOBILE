'use client';
import React from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { DashboardDataProvider, useDashboardContext } from '@/components/modules/dashboard/DashboardDataContext';
import { DashboardClockInCard } from '@/components/modules/dashboard/DashboardClockInCard';
import { SetupPromptModal } from '@/components/modules/dashboard/SetupPromptModal';
import { MobileRow, MobileSection } from './MobilePrimitives';
import { localDateKey } from '@/utils/dashboardPeople';
import { getTeamEmployees } from '@/utils/teamAccess';
function MobileDashboardContent() {
 const { state, currentPersona } = useApp();
 const data = useDashboardContext();
 const today = localDateKey();
 const role = currentPersona?.role || 'employee';
 const executive = ['super_admin','admin'].includes(role);
 const hr = ['hr_manager','hr'].includes(role);
 const manager = ['super_admin','admin','hr_manager','hr','manager','project_manager'].includes(role);
 const tasks = data.tasks || state.tasks || [];
 const myTasks = tasks.filter(t => t.status !== 'Completed' && (t.assigneeId === currentPersona?.id || t.assigneeIds?.includes(currentPersona?.id || '') || t.assigneeName === currentPersona?.name));
 const schedules = (data.timesheets || state.timesheets || []).filter(t => (t.entryType === 'schedule' || t.category === 'Meeting') && t.date?.slice(0,10) >= today && (t.employeeId === currentPersona?.id || t.employeeName === currentPersona?.name)).sort((a,b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || ''))).slice(0,3);
 const employees = getTeamEmployees(currentPersona, state.employees || []);
 const ids = new Set(employees.map(e => e.id));
 const attendance = (data.attendance || state.attendance || []).filter(a => a.date === today && ids.has(a.employeeId));
 const present = new Set(attendance.filter(a => a.checkIn).map(a => a.employeeId)).size;
 const pendingLeaves = (state.leaves || []).filter(l => ids.has(l.employeeId) && ['Pending','Manager approved'].includes(l.status));
 const pendingCorrections = (state.regularizations || []).filter(r => r.status === 'Pending' && ids.has(r.employeeId));
 const pendingTime = (data.timesheets || state.timesheets || []).filter(t=>ids.has(t.employeeId) && ['Pending','Submitted','Review'].includes(t.status));
 const onLeave = (state.leaves || []).filter(l=>ids.has(l.employeeId) && l.status==='Approved' && l.startDate.slice(0,10)<=today && l.endDate.slice(0,10)>=today).length;
 const quick = [
  { label: 'Leave', href: '/leaves', asset: 'calendar' }, { label: 'Payslips', href: '/payroll', asset: 'file' },
  { label: 'Log time', href: '/timesheets', asset: 'time' }, { label: 'People', href: '/hr?tab=directory', asset: 'people' },
 ];
 if (data.loading) return <div className="m2-page" aria-busy="true" aria-label="Loading your day"><div className="m2-skeleton" /><div className="m2-skeleton" /><div className="m2-skeleton" /></div>;
 return <div className="m2-page m2-home">
  {executive ? <>
    <SetupPromptModal/>
    <div className="m2-metric"><span>Who is in today</span><strong>{present} checked in</strong><small>{Math.max(0,employees.length-present-onLeave)} not in yet · {onLeave} on leave</small></div>
    <MobileSection title="Open tasks">{tasks.filter(t=>t.status!=='Completed').slice(0,3).map(t=><MobileRow key={t.id} title={t.title} detail={[t.assigneeName,t.dueDate?.slice(0,10)===today?'Today':t.dueDate?.slice(0,10)].filter(Boolean).join(' · ')} href="/projects"/>)}{!tasks.filter(t=>t.status!=='Completed').length&&<p className="m2-empty">No open tasks.</p>}</MobileSection>
    <MobileSection title="Recent activity">{attendance.slice(0,3).map(a=><MobileRow key={a.id} title={a.employeeName+' checked in'} detail={a.locationName||'Recorded attendance'} href="/attendance?tab=team_attendance"/>)}{!attendance.length&&<p className="m2-empty">No attendance activity yet today.</p>}<MobileRow title="Team attendance" detail={employees.length+' employees'} href="/attendance?tab=team_attendance"/></MobileSection>
  </> : hr ? <>
    <div className="m2-metric"><span>Pending leave</span><strong>{pendingLeaves.length} {pendingLeaves.length===1?'request':'requests'}</strong></div>
    <div>{pendingLeaves.slice(0,3).map(l=><MobileRow key={l.id} title={l.employeeName+' · '+l.leaveType} detail={l.startDate.slice(0,10)+' · '+l.daysCount+' days'} href="/attendance?tab=leaves"/>)}{!pendingLeaves.length&&<p className="m2-empty">No leave requests waiting for approval.</p>}</div>
    <MobileSection title="People follow-ups"><MobileRow title="Verify starter profiles" detail={employees.filter(e=>!e.hasCompletedProfile).length+' profiles to complete'} href="/hr"/><MobileRow title="Review attendance exceptions" detail={pendingCorrections.length+' correction requests'} href="/attendance?tab=regularizations"/><MobileRow title="HR inbox" detail="Manage employee requests" href="/chat?view=hr"/></MobileSection>
  </> : manager ? <>
   <SetupPromptModal />
   <div className="m2-metric" data-accent="teal"><span>Present today</span><strong>{present} of {employees.length}</strong><small className="m2-success">{onLeave} on leave · {Math.max(0,employees.length-present-onLeave)} yet to clock in</small></div>
   <MobileSection title="Needs your attention" action={<span className="m2-pending-count">{pendingLeaves.length + pendingCorrections.length + pendingTime.length} pending</span>}>
    {pendingLeaves.slice(0,2).map(l => <MobileRow key={l.id} title={l.employeeName + ' requested leave'} detail={l.leaveType + ' · ' + l.startDate.slice(0,10)} href="/attendance?tab=leaves" />)}
    {pendingTime.slice(0,1).map(t=><MobileRow key={t.id} title={t.employeeName+' submitted a timesheet'} detail={t.date+' · '+t.hours+'h'} href="/timesheets"/>)}
    {pendingCorrections.slice(0,2).map(r => <MobileRow key={r.id} title="Attendance correction" detail={r.employeeName + ' · ' + r.date} href="/attendance?tab=regularizations" />)}
    {!pendingLeaves.length && !pendingCorrections.length && !pendingTime.length && <p className="m2-empty">You're all caught up. No requests need your review.</p>}
    <Link href="/attendance?tab=regularizations" className="m2-primary">Review requests</Link>
   </MobileSection>
   <MobileSection title="Team delivery">{(state.projects || []).slice(0,3).map(p => { const projectTasks = tasks.filter(t => t.projectId === p.id); return <MobileRow key={p.id} title={p.name} detail={projectTasks.filter(t => t.status === 'Completed').length + ' of ' + projectTasks.length + ' tasks completed'} href="/projects" />; })}{!state.projects?.length && <p className="m2-empty">No projects yet.</p>}</MobileSection>
  </> : <>
   <MobileSection title="Quick access"><div className="m2-quick-actions">{quick.map(q => <Link href={q.href} key={q.label}><span><img src={'/mobile-v2/home-icon-' + q.asset + '.svg'} width="22" height="22" alt="" /></span>{q.label}</Link>)}</div></MobileSection>
   <DashboardClockInCard />
   <MobileSection title="Your focus" action={<Link href="/projects">View all</Link>}>{myTasks.slice(0,3).map(t => <MobileRow key={t.id} title={t.title} detail={[t.projectName,t.dueDate?.slice(0,10) === today ? 'Due today' : t.dueDate ? 'Due ' + t.dueDate.slice(0,10) : null].filter(Boolean).join(' · ')} href="/projects" arrow={false} />)}{!myTasks.length && <p className="m2-empty">You're all caught up. New tasks will appear here.</p>}</MobileSection>
   <MobileSection title="Coming up">{schedules.map(t => <MobileRow key={t.id} title={t.taskTitle || t.projectName || 'Meeting'} detail={[t.startTime,t.employeeName].filter(Boolean).join(' · ')} href="/timesheets" />)}{!schedules.length && <p className="m2-empty">No upcoming meetings.</p>}</MobileSection>
  </>}
 </div>;
}
export function MobileDashboard() { return <DashboardDataProvider><MobileDashboardContent /></DashboardDataProvider>; }
