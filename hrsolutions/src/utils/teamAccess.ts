import { UserPersona, Employee, LeaveRequest, TimesheetEntry, AttendanceRegularization, Project } from '../types';

/**
 * Checks if the persona is an Admin / Super Administrator (Full access to EVERYTHING in the organization).
 */
export const isAdminPersona = (persona?: UserPersona | null): boolean => {
  if (!persona) return false;
  const role = persona.role;
  return role === 'super_admin' || role === 'admin';
};

/**
 * Checks if the persona is an HR Manager / People Ops (Access to EVERYONE across the organization for HR/staff operations).
 */
export const isHRPersona = (persona?: UserPersona | null): boolean => {
  if (!persona) return false;
  const role = persona.role;
  return role === 'hr_manager' || (role as string) === 'hr';
};

/**
 * Checks if the persona has global organization-wide privileges (Admin or HR).
 */
export const isExecutiveOrAdmin = (persona?: UserPersona | null): boolean => {
  if (!persona) return false;
  return isAdminPersona(persona) || isHRPersona(persona);
};

/**
 * Checks if the persona holds a management role or has direct reports in the organization.
 */
export const isManagerPersona = (
  persona?: UserPersona | null,
  employees: Employee[] = []
): boolean => {
  if (!persona) return false;
  if (isExecutiveOrAdmin(persona)) return true;
  
  const role = persona.role;
  if (role === 'manager') return true;
  if (role === 'employee' || role === 'faculty' || role === 'student') {
    // Regular employee / faculty / student is NOT a manager unless they have distinct direct reports
    const personaId = persona.id;
    return employees.some((emp) => emp.id !== personaId && emp.managerId === personaId);
  }

  return (
    role === 'project_manager' ||
    role === 'team_lead' ||
    role === 'sales_manager' ||
    role === 'finance_manager'
  );
};

/**
 * Checks if an employee is a direct report of the persona.
 */
export const isDirectReport = (
  employee?: Employee | null,
  persona?: UserPersona | null
): boolean => {
  if (!employee || !persona) return false;
  if (employee.id === persona.id) return false; // Self is NOT a direct report of oneself

  // Executive protection: An executive (Super Admin, Admin, CEO, Founder, Executive Owner) is NEVER a direct report of a non-executive/manager
  const empRole = (employee.role || '').toLowerCase();
  const empDesig = (employee.designation || '').toLowerCase();
  if (
    empRole === 'super_admin' ||
    empRole === 'admin' ||
    empDesig.includes('ceo') ||
    empDesig.includes('founder') ||
    empDesig.includes('executive owner') ||
    empDesig.includes('chief executive')
  ) {
    return false;
  }

  const personaId = persona.id;
  const personaName = (persona.name || '').trim().toLowerCase();
  const personaEmail = (persona.email || '').trim().toLowerCase();
  const cleanUsername = personaName.replace(/\s+/g, '');

  if (employee.managerId && employee.managerId === personaId) return true;
  if (employee.managerName && employee.managerName.trim().toLowerCase() === personaName) return true;

  if (employee.lineManager) {
    if (employee.lineManager.name && employee.lineManager.name.trim().toLowerCase() === personaName) return true;
    if (employee.lineManager.username && employee.lineManager.username.trim().toLowerCase() === personaEmail) return true;
    if (employee.lineManager.username && employee.lineManager.username.replace('@', '').toLowerCase() === cleanUsername) return true;
  }

  return false;
};

/**
 * Gets all employees accessible to the persona based on role & team hierarchy.
 * - Admin: Access to EVERYTHING & EVERYONE
 * - HR: Access to EVERYONE across the company
 * - Manager: Access ONLY to their own team members and direct reports (Strictly EXCLUDING CEO/Executives)
 * - Employee: Access to self only
 */
export const getTeamEmployees = (
  persona?: UserPersona | null,
  employees: Employee[] = []
): Employee[] => {
  if (!persona) return [];
  // Admin & HR have company-wide access to all employees
  if (isAdminPersona(persona) || isHRPersona(persona)) {
    return employees;
  }

  const personaId = persona.id;
  const personaName = (persona.name || '').trim().toLowerCase();
  const personaEmail = (persona.email || '').trim().toLowerCase();
  const isManager = isManagerPersona(persona, employees);

  // Find the manager's own employee record if it exists
  const myEmpRecord = employees.find(
    (e) => e.id === personaId || e.name.toLowerCase() === personaName || e.email.toLowerCase() === personaEmail
  );
  const myTeamName = myEmpRecord?.team;
  const myTeamId = myEmpRecord?.teamId;

  // Managers ONLY have access to their subordinates (direct reports, assigned team members, and self)
  // Executive protection: Filter out CEO, Admins, Executive Owners unless the persona is Super Admin/HR
  if (isManager) {
    return employees.filter((emp) => {
      // Self
      if (emp.id === personaId || emp.name.toLowerCase() === personaName || emp.email.toLowerCase() === personaEmail) return true;

      // Executives / CEO can NEVER be managed by a manager
      const empRole = (emp.role || '').toLowerCase();
      const empDesig = (emp.designation || '').toLowerCase();
      if (
        empRole === 'super_admin' ||
        empRole === 'admin' ||
        empDesig.includes('ceo') ||
        empDesig.includes('founder') ||
        empDesig.includes('executive owner') ||
        empDesig.includes('chief executive')
      ) {
        return false;
      }

      // Direct report
      if (isDirectReport(emp, persona)) return true;
      // Same team by id (preferred) or name fallback
      if (myTeamId && emp.teamId && emp.teamId === myTeamId) return true;
      if (myTeamName && emp.team && emp.team.toLowerCase() === myTeamName.toLowerCase()) return true;
      return false;
    });
  }

  // Regular employee sees only themselves
  return employees.filter(
    (emp) => emp.id === personaId || emp.name.toLowerCase() === personaName || emp.email.toLowerCase() === personaEmail
  );
};

/**
 * Filters attendance records strictly to the persona's accessible team / self.
 */
export const getTeamAttendance = (
  persona?: UserPersona | null,
  attendance: any[] = [],
  employees: Employee[] = []
): any[] => {
  if (!persona) return [];
  if (isAdminPersona(persona) || isHRPersona(persona)) return attendance;
  const team = getTeamEmployees(persona, employees);
  const teamIds = new Set(team.map((e) => e.id));
  const teamNames = new Set(team.map((e) => (e.name || '').toLowerCase()));
  return attendance.filter(
    (a) => teamIds.has(a.employeeId) || (a.employeeName && teamNames.has(a.employeeName.toLowerCase()))
  );
};

/**
 * Filters leave requests strictly to the persona's accessible team / self.
 */
export const getTeamLeaves = (
  persona?: UserPersona | null,
  leaves: LeaveRequest[] = [],
  employees: Employee[] = []
): LeaveRequest[] => {
  if (!persona) return [];
  if (isAdminPersona(persona) || isHRPersona(persona)) return leaves;
  const team = getTeamEmployees(persona, employees);
  const teamIds = new Set(team.map((e) => e.id));
  const teamNames = new Set(team.map((e) => (e.name || '').toLowerCase()));
  return leaves.filter(
    (l) => teamIds.has(l.employeeId) || (l.employeeName && teamNames.has(l.employeeName.toLowerCase()))
  );
};

/**
 * Checks if an employee belongs to the persona's accessible team.
 */
export const isMemberOfMyTeam = (
  employeeId: string,
  persona?: UserPersona | null,
  employees: Employee[] = []
): boolean => {
  if (!persona || !employeeId) return false;
  if (isAdminPersona(persona) || isHRPersona(persona)) return true;
  const team = getTeamEmployees(persona, employees);
  return team.some((e) => e.id === employeeId || e.employeeId === employeeId);
};

/**
 * Checks if the persona has permission to approve / reject a leave request.
 * - Admin & HR: Can approve leaves for anyone in the organization.
 * - Manager: Can approve leaves ONLY for their direct reports (NEVER for CEO or peers).
 */
export const canApproveLeave = (
  persona?: UserPersona | null,
  leave?: LeaveRequest | null,
  employees: Employee[] = []
): boolean => {
  if (!persona || !leave) return false;
  if (isAdminPersona(persona) || isHRPersona(persona)) return true;

  // Cannot approve own leave
  if (leave.employeeId === persona.id || leave.employeeName?.toLowerCase() === persona.name?.toLowerCase()) {
    return false;
  }

  const targetEmp = employees.find(
    (e) => e.id === leave.employeeId || e.name.toLowerCase() === (leave.employeeName || '').toLowerCase()
  );
  if (!targetEmp) return false;

  // Executives/CEO can NEVER have leaves approved by a regular manager
  const empRole = (targetEmp.role || '').toLowerCase();
  const empDesig = (targetEmp.designation || '').toLowerCase();
  if (
    empRole === 'super_admin' ||
    empRole === 'admin' ||
    empDesig.includes('ceo') ||
    empDesig.includes('founder') ||
    empDesig.includes('executive owner')
  ) {
    return false;
  }

  return isDirectReport(targetEmp, persona);
};

/**
 * Checks if the persona has permission to approve / reject a timesheet entry.
 * - Admin & HR: Can approve timesheets for anyone in the organization.
 * - Manager: Can approve timesheets ONLY for their team members / direct reports.
 */
export const canApproveTimesheet = (
  persona?: UserPersona | null,
  timesheet?: TimesheetEntry | null,
  employees: Employee[] = [],
  projects: Project[] = []
): boolean => {
  if (!persona || !timesheet) return false;
  if (isAdminPersona(persona) || isHRPersona(persona)) return true;

  // Cannot approve own timesheet
  if (timesheet.employeeId === persona.id || timesheet.employeeName?.toLowerCase() === persona.name?.toLowerCase()) {
    return false;
  }

  // Check if project manager of the timesheet's project
  if (timesheet.projectId) {
    const proj = projects.find((p) => p.id === timesheet.projectId);
    if (proj && (proj.managerId === persona.id || proj.managerName?.toLowerCase() === persona.name?.toLowerCase())) {
      return true;
    }
  }

  const targetEmp = employees.find(
    (e) => e.id === timesheet.employeeId || e.name.toLowerCase() === (timesheet.employeeName || '').toLowerCase()
  );

  return isDirectReport(targetEmp, persona);
};

/**
 * Checks if the persona has permission to approve / reject an attendance regularization request.
 * - Admin & HR: Can approve regularization for anyone in the organization.
 * - Manager: Can approve regularization ONLY for their direct reports.
 */
export const canApproveRegularization = (
  persona?: UserPersona | null,
  reg?: AttendanceRegularization | null,
  employees: Employee[] = []
): boolean => {
  if (!persona || !reg) return false;
  if (isAdminPersona(persona) || isHRPersona(persona)) return true;

  // Cannot approve own regularization
  if (reg.employeeId === persona.id || reg.employeeName?.toLowerCase() === persona.name?.toLowerCase()) {
    return false;
  }

  const targetEmp = employees.find(
    (e) => e.id === reg.employeeId || e.name.toLowerCase() === (reg.employeeName || '').toLowerCase()
  );
  if (!targetEmp) return false;

  return isDirectReport(targetEmp, persona);
};
