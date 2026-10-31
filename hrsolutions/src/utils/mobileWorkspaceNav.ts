import { flattenWorkspaceNav } from './workspaceNav';

/** Keep the legacy More page and profile drawer on the same role-filtered links. */
export function getMobileMoreLinks(
 organization: Parameters<typeof flattenWorkspaceNav>[0],
 persona: Parameters<typeof flattenWorkspaceNav>[1],
) {
 const navigation = flattenWorkspaceNav(organization, persona);
 const featured = [
  { title: 'People', detail: 'Directory, teams and departments', href: '/hr' },
  { title: 'Payroll', detail: 'Payslips and salary', href: '/payroll' },
  { title: 'Approvals', detail: 'Employee requests for your review', href: '/attendance?tab=regularizations' },
  { title: 'Reports', detail: 'Workforce and project insights', href: '/reports' },
  { title: 'Settings', detail: 'Account and workspace', href: '/settings' },
  { title: 'Switch workspace', detail: organization?.name || 'Your workspace', href: '/more?panel=workspace' },
 ].filter(item => item.title === 'Switch workspace' || (item.title === 'Approvals'
  ? ['admin','super_admin','hr_manager','project_manager','manager'].includes(persona?.role || '')
  : navigation.some(n => n.path.split('?')[0] === item.href)));
 const used = new Set(['/dashboard','/projects','/timesheets','/chat',...featured.map(n => n.href)]);
 const additional = navigation.filter(n => !used.has(n.path)).map(n => ({ title:n.label,detail:n.subtitle,href:n.path }));
 return { featured, additional };
}
