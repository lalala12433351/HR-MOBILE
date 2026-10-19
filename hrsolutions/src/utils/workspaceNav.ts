import { PixbeIconName } from '@/components/common/PixbeIcon';
import { isInstitutionMode } from '@/utils/organizationMode';
import { isExecutiveOrAdmin } from '@/utils/teamAccess';

export interface WorkspaceNavItem {
  id: string;
  label: string;
  path: string;
  icon: PixbeIconName;
  /** Short line for command palette / search. */
  subtitle: string;
  keywords: string[];
}

export interface WorkspaceNavGroup {
  id: string;
  label?: string;
  items: WorkspaceNavItem[];
}

type OrgLike = { industry?: string; name?: string } | null | undefined;
type PersonaLike = { role?: string } | null | undefined;

/**
 * Single source of truth for primary workspace navigation.
 * Sidebar and command palette must both use this so corporate
 * workspaces never surface institute-only pages (and vice versa).
 */
export function getWorkspaceNavGroups(
  organization?: OrgLike,
  currentPersona?: PersonaLike
): WorkspaceNavGroup[] {
  const isInstitution = isInstitutionMode(organization, currentPersona);
  const isStudentRole = currentPersona?.role === 'student';
  const canManageSettings = isExecutiveOrAdmin(currentPersona);

  const chatItem: WorkspaceNavItem = {
    id: 'chat',
    label: 'Chat',
    path: '/chat',
    icon: 'chat',
    subtitle: 'Team messages and conversations',
    keywords: ['messages', 'dm', 'messaging', 'inbox'],
  };
  const payrollItem: WorkspaceNavItem = {
    id: 'payroll',
    label: 'Payroll',
    path: '/payroll',
    icon: 'payslips',
    subtitle: 'Salary runs, payslips, and compensation',
    keywords: ['salary', 'payslip', 'wages', 'compensation', 'bonus', 'tax'],
  };
  const reportsItem: WorkspaceNavItem = {
    id: 'reports',
    label: 'Reports',
    path: '/reports',
    icon: 'reports',
    subtitle: 'Attendance, leave, and operations reports',
    keywords: ['export', 'csv', 'pdf', 'charts', 'headcount', 'metrics', 'analytics'],
  };
  const settingsItem: WorkspaceNavItem = {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: 'settings',
    subtitle: 'Workspace preferences and configuration',
    keywords: ['preferences', 'config', 'admin', 'organisation', 'organization'],
  };

  if (isStudentRole) {
    return [
      {
        id: 'student',
        items: [
          {
            id: 'timetable',
            label: 'Class timetable',
            path: '/timetable',
            icon: 'timetable',
            subtitle: 'Your class schedule and periods',
            keywords: ['schedule', 'classes', 'periods', 'timetable'],
          },
          {
            id: 'student-attendance',
            label: 'My attendance',
            path: '/student-attendance',
            icon: 'attendance',
            subtitle: 'Your attendance record and percentages',
            keywords: ['roll call', 'absent', 'present', 'attendance'],
          },
          {
            id: 'announcements',
            label: 'Announcements',
            path: '/announcements',
            icon: 'announcements',
            subtitle: 'Institute notices and updates',
            keywords: ['news', 'broadcast', 'bulletin', 'notices', 'feed'],
          },
        ],
      },
    ];
  }

  if (isInstitution) {
    return [
      {
        id: 'workspace',
        items: [
          {
            id: 'dashboard',
            label: 'Home',
            path: '/dashboard',
            icon: 'home',
            subtitle: 'Institute overview and quick actions',
            keywords: ['home', 'kpi', 'overview', 'dashboard'],
          },
          chatItem,
        ],
      },
      {
        id: 'classes',
        label: 'Classes',
        items: [
          {
            id: 'student-directory',
            label: 'Students',
            path: '/student-directory',
            icon: 'students',
            subtitle: 'Enrollment, roll numbers, and profiles',
            keywords: ['students', 'classes', 'grades', 'batches', 'academics', 'roll number'],
          },
          {
            id: 'timetable',
            label: 'Timetables',
            path: '/timetable',
            icon: 'timetable',
            subtitle: 'Class schedules and period boards',
            keywords: ['schedule', 'classes', 'periods', 'timetable'],
          },
          {
            id: 'student-attendance',
            label: 'Class attendance',
            path: '/student-attendance',
            icon: 'attendance',
            subtitle: 'Classroom roll call and subject attendance',
            keywords: ['roll call', 'student attendance', 'absenteeism', 'classes'],
          },
        ],
      },
      {
        id: 'institute',
        label: 'Institute',
        items: [
          {
            id: 'hr',
            label: 'Staff',
            path: '/hr',
            icon: 'people',
            subtitle: 'Faculty and staff directory',
            keywords: ['employees', 'staff', 'people', 'faculty', 'team', 'directory'],
          },
          {
            id: 'attendance',
            label: 'Staff attendance',
            path: '/attendance',
            icon: 'attendance',
            subtitle: 'Staff check-ins and daily attendance',
            keywords: ['clock in', 'clock out', 'shifts', 'punctuality'],
          },
          ...(canManageSettings ? [payrollItem] : []),
          {
            id: 'announcements',
            label: 'Announcements',
            path: '/announcements',
            icon: 'announcements',
            subtitle: 'Institute bulletins and notices',
            keywords: ['news', 'broadcast', 'bulletin', 'updates', 'notices', 'feed'],
          },
          ...(canManageSettings ? [reportsItem] : []),
          ...(canManageSettings ? [settingsItem] : []),
        ],
      },
    ];
  }

  // Company / corporate mode
  return [
    {
      id: 'workspace',
      items: [
        {
          id: 'dashboard',
          label: 'Home',
          path: '/dashboard',
          icon: 'home',
          subtitle: 'Workspace overview and quick actions',
          keywords: ['home', 'kpi', 'metrics', 'stats', 'analytics', 'overview'],
        },
        chatItem,
      ],
    },
    {
      id: 'work',
      label: 'Work',
      items: [
        {
          id: 'projects',
          label: 'Projects',
          path: '/projects',
          icon: 'projects',
          subtitle: 'Boards, deliverables, and milestones',
          keywords: ['sprint', 'kanban', 'tasks', 'deliverables', 'issues', 'bugs'],
        },
        {
          id: 'attendance',
          label: 'Calendar',
          path: '/attendance',
          icon: 'calendar',
          subtitle: 'Attendance, leave, and the work calendar',
          keywords: ['clock in', 'clock out', 'shifts', 'leaves', 'leave', 'pto', 'holiday'],
        },
        {
          id: 'timesheets',
          label: 'Timesheets',
          path: '/timesheets',
          icon: 'attendance',
          subtitle: 'Time tracking and work-hour logs',
          keywords: ['timer', 'hours', 'logs', 'attendance', 'clock in', 'shifts'],
        },
      ],
    },
    {
      id: 'organisation',
      label: 'Organisation',
      items: [
        {
          id: 'hr',
          label: 'Team',
          path: '/hr',
          icon: 'people',
          subtitle: 'People directory and profiles',
          keywords: ['employees', 'staff', 'people', 'workers', 'team', 'directory'],
        },
        ...(canManageSettings ? [payrollItem] : []),
        ...(canManageSettings ? [reportsItem] : []),
        {
          id: 'announcements',
          label: 'Announcements',
          path: '/announcements',
          icon: 'announcements',
          subtitle: 'Company bulletins and updates',
          keywords: ['news', 'broadcast', 'bulletin', 'updates', 'notices', 'feed'],
        },
        ...(canManageSettings ? [settingsItem] : []),
      ],
    },
  ];
}

export function flattenWorkspaceNav(
  organization?: OrgLike,
  currentPersona?: PersonaLike
): WorkspaceNavItem[] {
  return getWorkspaceNavGroups(organization, currentPersona).flatMap((group) => group.items);
}

export function getWorkspaceModeLabel(
  organization?: OrgLike,
  currentPersona?: PersonaLike
): 'student' | 'institution' | 'company' {
  if (currentPersona?.role === 'student') return 'student';
  return isInstitutionMode(organization, currentPersona) ? 'institution' : 'company';
}
