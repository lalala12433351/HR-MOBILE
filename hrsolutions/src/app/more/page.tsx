'use client';
import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { MobileRow, MobileSection } from '@/components/mobile/MobilePrimitives';
import { flattenWorkspaceNav } from '@/utils/workspaceNav';
function MoreContent() {
 const { state, currentPersona, logout } = useApp();
 const params = useSearchParams();
 if (!currentPersona) return null;
 const profile = '/hr?emp=' + encodeURIComponent(currentPersona.id);
 const navigation = flattenWorkspaceNav(state.organization, currentPersona);
 if (params.get('panel') === 'workspace') return <div className="m2-page"><MobileSection title="Your workspace"><MobileRow title={state.organization?.name || 'Your workspace'} detail="Current workspace" arrow={false} /><MobileRow title="Use another account" detail="Sign out and use another workspace account" onClick={logout} /></MobileSection><MobileRow title="Back to your workspace" href="/more" /></div>;
 const featured = [
  { title: 'People', detail: 'Directory, teams and departments', href: '/hr' },
  { title: 'Payroll', detail: 'Payslips and salary', href: '/payroll' },
  { title: 'Approvals', detail: 'Employee requests for your review', href: '/attendance?tab=regularization' },
  { title: 'Reports', detail: 'Workforce and project insights', href: '/reports' },
  { title: 'Settings', detail: 'Account and workspace', href: '/settings' },
  { title: 'Switch workspace', detail: state.organization?.name || 'Your workspace', href: '/more?panel=workspace' },
 ].filter(item => item.title === 'Switch workspace' || (item.title === 'Approvals' ? ['admin','super_admin','hr_manager','project_manager','manager'].includes(currentPersona.role) : navigation.some(n => n.path.split('?')[0] === item.href)));
 const used = new Set(['/dashboard','/projects','/timesheets','/chat',...featured.map(n => n.href)]);
 return <div className="m2-page"><MobileRow title={currentPersona.name} detail={(currentPersona.designation || 'Team member') + ' · View profile'} href={profile} /><MobileSection title="Explore"><div>{featured.map(row => <MobileRow key={row.title} {...row} />)}</div></MobileSection><div>{navigation.filter(n => !used.has(n.path)).map(n => <MobileRow key={n.id} title={n.label} detail={n.subtitle} href={n.path} />)}</div></div>;
}
export default function MorePage() { return <Suspense fallback={null}><MoreContent /></Suspense>; }
