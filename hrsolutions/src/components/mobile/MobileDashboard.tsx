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
 const quick = [
  { label: 'Leave', href: '/leaves', asset: 'calendar' }, { label: 'Payslips', href: '/payroll', asset: 'file' },
  { label: 'Log time', href: '/timesheets', asset: 'time' }, { label: 'People', href: '/hr?tab=directory', asset: 'people' },
 ];
 if (data.loading) return <div className="m2-page" aria-busy="true" aria-label="Loading your day"><div className="m2-skeleton" /><div className="m2-skeleton" /><div className="m2-skeleton" /></div>;
 return <div className="m2-page m2-home">
  {manager ? <>
   <SetupPromptModal />
   <div className="m2-metric" data-accent="teal"><span>Present today</span><strong>{present} of {employees.length}</strong><small>{Math.max(0,employees.length-present)} yet to clock in</small></div>
   <MobileSection title="Needs your attention" action={<span className="m2-pending-count">{pendingLeaves.length + pendingCorrections.length} pending</span>}>
    {pendingLeaves.slice(0,2).map(l => <MobileRow key={l.id} title={l.employeeName + ' requested leave'} detail={l.leaveType + ' · ' + l.startDate.slice(0,10)} href="/attendance?tab=leaves" />)}
    {pendingCorrections.slice(0,2).map(r => <MobileRow key={r.id} title="Attendance correction" detail={r.employeeName + ' · ' + r.date} href="/attendance?tab=regularization" />)}
    {!pendingLeaves.length && !pendingCorrections.length && <p className="m2-empty">You're all caught up. No requests need your review.</p>}
    <Link href="/attendance?tab=regularization" className="m2-primary">Review requests</Link>
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
