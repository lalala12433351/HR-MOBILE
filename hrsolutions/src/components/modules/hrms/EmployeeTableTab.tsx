'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutList,
  Layers3,
  Pencil,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { Employee, AccountStatus } from '../../../types';
import { AppState } from '../../../services/store';
import { UserAvatar } from '@/components/common/UserAvatar';
import { DepartmentCodeBadge, DepartmentTag } from '@/components/common/DepartmentTag';
import { buildDepartmentCodeMap } from '@/utils/departmentCode';

interface EmployeeTableTabProps {
  state: AppState;
  isUserView: boolean;
  isManager: boolean;
  isSuperAdmin: boolean;
  isHR: boolean;
  isInstitution: boolean;
  accessibleEmployees: Employee[];
  initialScope?: 'team' | 'all';
  onScopeChange?: (scope: 'team' | 'all') => void;
  onSelectEmployee: (emp: Employee) => void;
  onSelectDepartment?: (departmentName: string) => void;
  onResendInvite?: (emp: Employee) => Promise<void>;
  onPrintIdCards?: (employees: Employee[]) => void;
}

export const EmployeeTableTab: React.FC<EmployeeTableTabProps> = ({
  state,
  isUserView,
  isManager,
  isSuperAdmin,
  isHR,
  isInstitution,
  accessibleEmployees,
  initialScope,
  onScopeChange,
  onSelectEmployee,
  onSelectDepartment,
  onResendInvite,
  onPrintIdCards,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [teamScopeFilter, setTeamScopeFilter] = useState<'team' | 'all'>(
    initialScope || (isManager && !isSuperAdmin && !isHR ? 'team' : 'all')
  );

  useEffect(() => {
    if (initialScope) {
      setTeamScopeFilter(initialScope);
    }
  }, [initialScope]);

  const [branchFilter, setBranchFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [jobTitleFilter, setJobTitleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState('All');
  const [viewLayout, setViewLayout] = useState<'grouped' | 'flat'>('grouped');

  const baseEmployeesList = useMemo(() => {
    let list: Employee[];
    // Team scope → accessible team list; Organization / all → full synced roster
    if (teamScopeFilter === 'team') {
      list = accessibleEmployees;
    } else {
      list = state.employees || [];
    }

    const isExecutive =
      state.currentPersona?.role === 'super_admin' ||
      state.currentPersona?.role === 'admin' ||
      state.currentPersona?.role === 'hr_manager' ||
      isSuperAdmin;

    // Normalize any super_admin employee department to Management
    const sanitizedList = list.map((e) => {
      const isSuper =
        e.role === 'super_admin' ||
        e.employeeId === 'EMP001' ||
        Boolean(state.currentPersona?.email && e.email?.toLowerCase().trim() === state.currentPersona.email.toLowerCase().trim());
      if (isSuper && (!e.department || e.department === 'Marketing' || (e.department as string) === '—')) {
        return {
          ...e,
          department: 'Management' as any,
          team: 'Executive Leadership',
        };
      }
      return e;
    });

    const hasFounderOrAdmin = sanitizedList.some(
      (e) =>
        e.role === 'super_admin' ||
        e.employeeId === 'EMP001' ||
        (state.currentPersona?.email && e.email?.toLowerCase().trim() === state.currentPersona.email.toLowerCase().trim()) ||
        (state.currentPersona?.id && e.id === state.currentPersona.id)
    );

    if (!hasFounderOrAdmin && state.currentPersona && isExecutive && teamScopeFilter !== 'team') {
      const resolvedName = state.currentPersona.name || 'Organization Administrator';
      const resolvedEmail = state.currentPersona.email || 'admin@workspace.local';
      const resolvedDesignation =
        state.currentPersona.designation &&
        state.currentPersona.designation !== 'Staff Member' &&
        state.currentPersona.designation !== 'Team Member'
          ? state.currentPersona.designation
          : 'Founder & CEO';

      const fallbackFounder: Employee = {
        id: state.currentPersona.id || 'emp_founder_fallback',
        employeeId: 'EMP001',
        name: resolvedName,
        fullName: resolvedName,
        email: resolvedEmail,
        phone: '—',
        avatar: state.currentPersona.avatar || '',
        department: 'Management' as any,
        team: 'Executive Leadership',
        designation: resolvedDesignation,
        role: 'super_admin',
        joiningDate: new Date().toISOString().substring(0, 10),
        employmentType: 'Full-time',
        location: state.customOptions?.offices?.[0] || '',
        officeName: state.customOptions?.offices?.[0] || '',
        skills: ['Leadership', 'Strategy', 'Operations'],
        bankDetails: {
          accountNumber: '—',
          ifscCode: '—',
          bankName: '—',
        },
        emergencyContact: {
          name: '',
          relation: '',
          phone: '',
        },
        status: 'Active',
        isActivated: true,
        accountStatus: 'Activated',
        hasCompletedProfile: true,
        onboardingProgress: 100,
      };
      return [fallbackFounder, ...sanitizedList];
    }

    return sanitizedList;
  }, [isSuperAdmin, isHR, state.employees, accessibleEmployees, teamScopeFilter, state.currentPersona, state.customOptions?.offices]);

  const departmentCodes = useMemo(() => buildDepartmentCodeMap(state), [state.customOptions]);
  const deptCodeOf = (department?: string) =>
    department ? departmentCodes.get(department.trim().toLowerCase()) : undefined;

  const filteredEmployees = useMemo(() => {
    return baseEmployeesList.filter((emp) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        emp.name.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        (emp.employeeId && emp.employeeId.toLowerCase().includes(q)) ||
        emp.department?.toLowerCase().includes(q) ||
        deptCodeOf(emp.department)?.includes(q) ||
        (emp.designation && emp.designation.toLowerCase().includes(q));

      const branchVal = emp.officeName || emp.location || '';
      const matchesBranch =
        branchFilter === 'All' ||
        branchVal.toLowerCase() === branchFilter.toLowerCase();

      const matchesDept =
        departmentFilter === 'All' ||
        (emp.department && emp.department.toLowerCase() === departmentFilter.toLowerCase());

      const matchesJob =
        jobTitleFilter === 'All' ||
        (emp.designation && emp.designation.toLowerCase().includes(jobTitleFilter.toLowerCase()));

      const empTypeVal = (emp.employmentType || 'Full-time').toLowerCase();
      const matchesEmpType =
        employmentTypeFilter === 'All' ||
        (employmentTypeFilter === 'Full-Time' && empTypeVal.includes('full')) ||
        (employmentTypeFilter === 'Part-Time' && empTypeVal.includes('part')) ||
        (employmentTypeFilter === 'Contractor' && (empTypeVal.includes('contract') || empTypeVal.includes('freelance'))) ||
        (employmentTypeFilter === 'Intern' && (empTypeVal.includes('intern') || empTypeVal.includes('trainee')));

      const isSuper = emp.role === 'super_admin' || emp.employeeId === 'EMP001';
      const accStatus = (isSuper ? 'Active' : (emp.accountStatus || 'Not Activated')).toLowerCase();
      const filterLower = statusFilter.toLowerCase();

      const matchesStatus =
        statusFilter === 'All' ||
        accStatus === filterLower ||
        (filterLower === 'in probation' && (accStatus === 'in probation' || emp.probationStatus === 'in_probation' || emp.status?.toLowerCase() === 'probation')) ||
        (filterLower === 'probation' && (accStatus === 'in probation' || emp.probationStatus === 'in_probation' || emp.status?.toLowerCase() === 'probation')) ||
        (filterLower === 'notice period' && (accStatus === 'notice period' || emp.status?.toLowerCase() === 'notice period')) ||
        (filterLower === 'on leave' && (accStatus === 'on leave' || emp.status?.toLowerCase() === 'on leave'));

      return matchesSearch && matchesBranch && matchesDept && matchesJob && matchesStatus && matchesEmpType;
    });
  }, [baseEmployeesList, searchQuery, branchFilter, departmentFilter, jobTitleFilter, statusFilter, employmentTypeFilter, state.currentPersona, departmentCodes]);

  // Group filtered employees by department
  const groupedByDepartment = useMemo(() => {
    const map: Record<string, Employee[]> = {};
    filteredEmployees.forEach((emp) => {
      const dept = emp.department?.trim() || 'Unassigned';
      if (!map[dept]) map[dept] = [];
      map[dept].push(emp);
    });
    return map;
  }, [filteredEmployees]);


  const getStatusBadge = (emp: Employee) => {
    const isSuper = emp.role === 'super_admin' || emp.employeeId === 'EMP001';
    const accStatus = (isSuper ? 'Active' : (emp.accountStatus || 'Not Activated')) as AccountStatus;

    let tone = 'people-studio__status--wait';
    if (accStatus === 'Active' || accStatus === 'Activated') {
      tone = 'people-studio__status--ok';
    } else if (accStatus === 'Invited') {
      tone = 'people-studio__status--invite';
    } else if (accStatus === 'On Leave') {
      tone = 'people-studio__status--muted';
    } else if (accStatus === 'Suspended' || accStatus === 'Deactivated') {
      tone = 'people-studio__status--error';
    }

    return (
      <span className={`people-studio__status ${tone}`}>
        {accStatus === 'Activated' ? 'Active' : accStatus}
      </span>
    );
  };

  // Available unique options for dropdown filters
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    (state.customOptions?.offices || []).forEach((o) => set.add(o));
    (state.employees || []).forEach((e) => {
      const b = e.officeName || e.location;
      if (b) set.add(b);
    });
    return Array.from(set);
  }, [state.customOptions?.offices, state.employees]);

  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    (state.customOptions?.departments || []).forEach((d) => set.add(d));
    (state.employees || []).forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set);
  }, [state.customOptions?.departments, state.employees]);

  const hasActiveFilters =
    searchQuery !== '' ||
    branchFilter !== 'All' ||
    departmentFilter !== 'All' ||
    jobTitleFilter !== 'All' ||
    statusFilter !== 'All' ||
    employmentTypeFilter !== 'All';

  const handleClearFilters = () => {
    setSearchQuery('');
    setBranchFilter('All');
    setDepartmentFilter('All');
    setJobTitleFilter('All');
    setStatusFilter('All');
    setEmploymentTypeFilter('All');
  };

  const currentEmployee = useMemo(() => {
    const persona = state.currentPersona;
    if (!persona) return null;
    const personaEmail = persona.email?.trim().toLowerCase();
    const personaName = persona.name?.trim().toLowerCase();

    return (state.employees || []).find(
      (employee) =>
        employee.id === persona.id ||
        (!!personaEmail && employee.email?.trim().toLowerCase() === personaEmail) ||
        (!!personaName && employee.name?.trim().toLowerCase() === personaName)
    ) || null;
  }, [state.currentPersona, state.employees]);

  const managementChain = useMemo(() => {
    if (!currentEmployee) return [];

    const roster = state.employees || [];
    const chain: Employee[] = [];
    const visited = new Set<string>([currentEmployee.id]);
    let cursor: Employee | null = currentEmployee;

    while (cursor) {
      const managerId = cursor.managerId;
      const managerName = cursor.managerName?.trim().toLowerCase() || cursor.lineManager?.name?.trim().toLowerCase();
      const managerEmail = cursor.lineManager?.username?.trim().toLowerCase();
      const manager = roster.find(
        (employee) =>
          (!!managerId && employee.id === managerId) ||
          (!!managerEmail && employee.email?.trim().toLowerCase() === managerEmail) ||
          (!!managerName && employee.name?.trim().toLowerCase() === managerName)
      );

      if (!manager || visited.has(manager.id)) break;
      chain.unshift(manager);
      visited.add(manager.id);
      cursor = manager;
    }

    return chain;
  }, [currentEmployee, state.employees]);

  const teamPreviewMembers = useMemo(() => {
    const excludedIds = new Set([currentEmployee?.id, ...managementChain.map((employee) => employee.id)].filter(Boolean));
    return accessibleEmployees.filter((employee) => !excludedIds.has(employee.id));
  }, [accessibleEmployees, currentEmployee, managementChain]);

  const renderEmployeeRow = (emp: Employee, hideDept = false) => {
    const branchText = emp.officeName || emp.location || '—';
    const mgr = emp.managerId ? (state.employees || []).find((e) => e.id === emp.managerId) : null;
    const mgrDisplay = mgr
      ? mgr.name
      : emp.managerName || emp.lineManager?.name || '—';
    const isOrgLead =
      ((state.customOptions as any)?.departmentRecords || []).some(
        (d: any) =>
          (d.leadEmployeeId && String(d.leadEmployeeId) === String(emp.id)) ||
          (Array.isArray(d.leadEmployeeIds) && d.leadEmployeeIds.some((id: string) => String(id) === String(emp.id)))
      ) ||
      ((state.customOptions as any)?.teamRecords || []).some(
        (t: any) =>
          (t.leadEmployeeId && String(t.leadEmployeeId) === String(emp.id)) ||
          (Array.isArray(t.leadEmployeeIds) && t.leadEmployeeIds.some((id: string) => String(id) === String(emp.id)))
      );
    const isTeamManager =
      isOrgLead ||
      (emp.role === 'manager' &&
        (state.employees || []).some((e) => e.id !== emp.id && e.managerId === emp.id));

    return (
      <tr key={emp.id}>
        <td>
          <div className="people-studio__who">
            <UserAvatar src={emp.avatar} name={emp.name} className="h-8 w-8 text-[11px]" />
            <div className="min-w-0">
              <div>
                <button type="button" onClick={() => onSelectEmployee(emp)} className="people-studio__who-name">
                  {emp.name}
                </button>
                {emp.employeeId && <span className="people-studio__id">{emp.employeeId}</span>}
                {isTeamManager && <span className="people-studio__chip">Manager</span>}
              </div>
              <span className="people-studio__who-mail">{emp.email}</span>
            </div>
          </div>
        </td>
        <td>
          <span className="people-studio__role">
            {emp.designation || (emp.role === 'super_admin' ? 'Founder & CEO' : 'Team Member')}
          </span>
        </td>
        {!hideDept && (
          <td>
            <span className="inline-flex items-center gap-1.5">
              <span className="people-studio__quiet">{emp.department || 'Operations'}</span>
              <DepartmentCodeBadge code={deptCodeOf(emp.department)} />
            </span>
          </td>
        )}
        <td>
          <span className="people-studio__quiet">{branchText}</span>
        </td>
        <td>
          {mgrDisplay !== '—' ? (
            <span className="people-studio__role">{mgrDisplay}</span>
          ) : (
            <span className="people-studio__empty-mark">—</span>
          )}
        </td>
        <td>{getStatusBadge(emp)}</td>
        <td className="people-studio__row-actions">
          {onResendInvite &&
            emp.email &&
            emp.role !== 'super_admin' &&
            (emp.accountStatus === 'Invited' || emp.accountStatus === 'Not Activated' || !emp.accountStatus) && (
              <button
                type="button"
                disabled={resendingId === emp.id}
                onClick={async () => {
                  setResendingId(emp.id);
                  try {
                    await onResendInvite(emp);
                  } finally {
                    setResendingId(null);
                  }
                }}
                className="people-studio__btn people-studio__btn--secondary people-studio__btn--compact"
              >
                {resendingId === emp.id ? 'Sending…' : 'Resend invite'}
              </button>
            )}
          <button
            type="button"
            onClick={() => onSelectEmployee(emp)}
            className="people-studio__btn people-studio__btn--secondary people-studio__btn--compact"
          >
            Open profile
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="people-studio__panel">
      {teamScopeFilter === 'team' && (
        <section className="people-studio__sheet people-studio__line">
          <div className="people-studio__line-main">
            <p className="people-studio__kicker">Reporting line</p>
            <div className="people-studio__chain">
              {managementChain.length > 0 ? managementChain.map((employee, index) => (
                <React.Fragment key={employee.id}>
                  {index > 0 && <span className="people-studio__dash" aria-hidden="true" />}
                  <div className="people-studio__person">
                    <UserAvatar src={employee.avatar} name={employee.name} className="h-7 w-7 text-[10px]" />
                    <div className="min-w-0">
                      <p className="people-studio__person-name">{employee.name}</p>
                      <p className="people-studio__person-role">{employee.designation || 'Manager'}</p>
                    </div>
                  </div>
                </React.Fragment>
              )) : (
                <span className="people-studio__note">No reporting manager assigned.</span>
              )}
              {managementChain.length > 0 && <span className="people-studio__dash" aria-hidden="true" />}
              <div className="people-studio__person is-you">
                <UserAvatar src={currentEmployee?.avatar} name={currentEmployee?.name || state.currentPersona?.name || 'You'} className="h-7 w-7 text-[10px]" />
                <div className="min-w-0">
                  <p className="people-studio__person-name">{currentEmployee?.name || state.currentPersona?.name || 'You'}</p>
                  <p className="people-studio__person-role">You</p>
                </div>
              </div>
            </div>
          </div>

          <div className="people-studio__line-side">
            <div className="flex items-center justify-between gap-3">
              <p className="people-studio__kicker">My team</p>
              <span className="people-studio__dept-count">{teamPreviewMembers.length}</span>
            </div>
            <div className="people-studio__avatars">
              {teamPreviewMembers.slice(0, 6).map((employee) => (
                <UserAvatar key={employee.id} src={employee.avatar} name={employee.name} className="h-8 w-8 border-2 border-[var(--bg-surface)] text-[10px]" />
              ))}
              {teamPreviewMembers.length > 6 && (
                <span className="people-studio__more">+{teamPreviewMembers.length - 6}</span>
              )}
              {teamPreviewMembers.length === 0 && <span className="people-studio__note">No team members assigned yet.</span>}
            </div>
            {teamPreviewMembers.length > 0 && (
              <p className="people-studio__meta">{teamPreviewMembers.slice(0, 2).map((employee) => employee.name).join(', ')}{teamPreviewMembers.length > 2 ? ` and ${teamPreviewMembers.length - 2} more` : ''}</p>
            )}
          </div>
        </section>
      )}

      <section className="people-studio__sheet people-studio__sheet--pad">
        <div className="people-studio__filters">
          <div className="people-studio__search">
            <Search className="people-studio__search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, ID, email, role, or department"
              aria-label="Search people"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="people-studio__search-clear" aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="people-studio__controls">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              aria-label="Filter by department"
              className="people-studio__select"
            >
              <option value="All">All departments</option>
              {availableDepartments.map((d) => {
                const code = deptCodeOf(d);
                return (
                  <option key={d} value={d}>
                    {code ? `${d} (${code})` : d}
                  </option>
                );
              })}
            </select>

            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="Filter by location"
              className="people-studio__select"
            >
              <option value="All">All locations</option>
              {availableBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by account status"
              className="people-studio__select"
            >
              <option value="All">All statuses</option>
              <option value="Not Activated">Not Activated</option>
              <option value="Invited">Invited</option>
              <option value="Active">Active</option>
              <option value="In Probation">In Probation</option>
              <option value="On Leave">On Leave</option>
              <option value="Notice Period">Notice Period</option>
              <option value="Suspended">Suspended</option>
              <option value="Deactivated">Deactivated</option>
            </select>

            <div className="people-studio__seg" role="group" aria-label="Roster layout">
              <button
                type="button"
                onClick={() => setViewLayout('grouped')}
                className={viewLayout === 'grouped' ? 'is-on' : ''}
              >
                <Layers3 className="h-3.5 w-3.5" /> Grouped
              </button>
              <button
                type="button"
                onClick={() => setViewLayout('flat')}
                className={viewLayout === 'flat' ? 'is-on' : ''}
              >
                <LayoutList className="h-3.5 w-3.5" /> Unified
              </button>
            </div>

            {hasActiveFilters && (
              <button type="button" onClick={handleClearFilters} className="people-studio__btn people-studio__btn--ghost">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>
        <div className="people-studio__count">
          <span>
            <strong>{filteredEmployees.length}</strong> {filteredEmployees.length === 1 ? 'person' : 'people'} in this view
          </span>
          {onPrintIdCards && (
            <button
              type="button"
              disabled={filteredEmployees.length === 0}
              onClick={() => onPrintIdCards(filteredEmployees)}
              className="people-studio__btn people-studio__btn--secondary people-studio__btn--compact"
            >
              <Printer className="h-3.5 w-3.5" />
              Print ID cards
            </button>
          )}
        </div>
      </section>

      <div className="people-studio__cards">
        {filteredEmployees.length === 0 ? (
          <div className="people-studio__empty">No people match these filters. Clear a filter or search a different name.</div>
        ) : viewLayout === 'grouped' ? (
          Object.entries(groupedByDepartment).map(([deptName, deptEmployees]) => (
            <div key={deptName} className="people-studio__sheet people-studio__dept">
              <div className="people-studio__dept-head">
                {onSelectDepartment && deptName !== 'Unassigned' ? (
                  <button
                    type="button"
                    onClick={() => onSelectDepartment(deptName)}
                    className="people-studio__dept-open"
                  >
                    <DepartmentTag name={deptName} code={deptCodeOf(deptName)} className="people-studio__dept-name" />
                  </button>
                ) : (
                  <DepartmentTag name={deptName} code={deptCodeOf(deptName)} className="people-studio__dept-name" />
                )}
                <span className="people-studio__dept-count">
                  {deptEmployees.length} {deptEmployees.length === 1 ? 'member' : 'members'}
                </span>
                {onSelectDepartment && (isSuperAdmin || isHR) && deptName !== 'Unassigned' && (
                  <button
                    type="button"
                    onClick={() => onSelectDepartment(deptName)}
                    className="people-studio__dept-edit"
                    title={`Edit ${deptName}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>
              {deptEmployees.map((emp) => {
                const branchText = emp.officeName || emp.location || 'No office';
                const roleLabel =
                  emp.designation || (emp.role === 'super_admin' ? 'Founder & CEO' : 'Team Member');
                return (
                  <div
                    key={emp.id}
                    onClick={() => onSelectEmployee(emp)}
                    className="people-studio__mobile-row"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') onSelectEmployee(emp);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="people-studio__mobile-top">
                      <div className="people-studio__who">
                        <UserAvatar src={emp.avatar} name={emp.name} className="h-9 w-9 shrink-0 text-[11px]" />
                        <div className="people-studio__who-copy">
                          <p className="people-studio__who-name">{emp.name}</p>
                          <p className="people-studio__who-mail">{roleLabel}</p>
                        </div>
                      </div>
                      {getStatusBadge(emp)}
                    </div>
                    <div className="people-studio__mobile-meta">
                      <div className="people-studio__mobile-meta-row">
                        <span className="people-studio__mobile-branch">{branchText}</span>
                        {emp.employeeId ? <span className="people-studio__id">{emp.employeeId}</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          filteredEmployees.map((emp) => {
            const branchText = emp.officeName || emp.location || 'No office';
            const managerName = emp.managerName || emp.lineManager?.name;
            const roleLabel =
              emp.designation || (emp.role === 'super_admin' ? 'Founder & CEO' : 'Team Member');
            return (
              <div
                key={emp.id}
                onClick={() => onSelectEmployee(emp)}
                className="people-studio__sheet people-studio__mobile-row"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectEmployee(emp);
                }}
                role="button"
                tabIndex={0}
              >
                <div className="people-studio__mobile-top">
                  <div className="people-studio__who">
                    <UserAvatar src={emp.avatar} name={emp.name} className="h-9 w-9 shrink-0 text-[11px]" />
                    <div className="people-studio__who-copy">
                      <p className="people-studio__who-name">{emp.name}</p>
                      <p className="people-studio__who-mail">{emp.email}</p>
                    </div>
                  </div>
                  {getStatusBadge(emp)}
                </div>
                <div className="people-studio__mobile-meta">
                  <div className="people-studio__mobile-meta-row">
                    <span className="people-studio__mobile-role">{roleLabel}</span>
                    <DepartmentCodeBadge code={deptCodeOf(emp.department)} />
                  </div>
                  <p className="people-studio__mobile-reports">
                    {managerName ? `Reports to ${managerName}` : branchText}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="people-studio__desktop">
        {filteredEmployees.length === 0 ? (
          <div className="people-studio__empty">No people match these filters. Clear a filter or search a different name.</div>
        ) : viewLayout === 'grouped' ? (
          Object.entries(groupedByDepartment).map(([deptName, deptEmployees]) => (
            <div key={deptName} className="people-studio__sheet people-studio__dept">
              <div className="people-studio__dept-head">
                {onSelectDepartment && deptName !== 'Unassigned' ? (
                  <button
                    type="button"
                    onClick={() => onSelectDepartment(deptName)}
                    className="people-studio__dept-open"
                  >
                    <span className="people-studio__dept-name">{deptName}</span>
                    <DepartmentCodeBadge code={deptCodeOf(deptName)} />
                  </button>
                ) : (
                  <>
                    <span className="people-studio__dept-name">{deptName}</span>
                    <DepartmentCodeBadge code={deptCodeOf(deptName)} />
                  </>
                )}
                <span className="people-studio__dept-count">
                  {deptEmployees.length} {deptEmployees.length === 1 ? 'member' : 'members'}
                </span>
                {onSelectDepartment && (isSuperAdmin || isHR) && deptName !== 'Unassigned' && (
                  <button
                    type="button"
                    onClick={() => onSelectDepartment(deptName)}
                    className="people-studio__dept-edit"
                    title={`Edit ${deptName}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>
              <div className="people-studio__table-wrap custom-scrollbar">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Role</th>
                      <th>Office location</th>
                      <th>Reports to</th>
                      <th>Status</th>
                      <th className="people-studio__row-actions">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptEmployees.map((emp) => renderEmployeeRow(emp, true))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : (
          <div className="people-studio__sheet">
            <div className="people-studio__table-wrap custom-scrollbar">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Office location</th>
                    <th>Reports to</th>
                    <th>Status</th>
                    <th className="people-studio__row-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp) => renderEmployeeRow(emp, false))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
