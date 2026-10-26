'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Printer, Search, X } from 'lucide-react';
import { Employee, AccountStatus } from '../../../types';
import { AppState } from '../../../services/store';
import { WorkspacePagination } from '@/components/common/WorkspacePagination';
import { UserAvatar } from '@/components/common/UserAvatar';

interface StaffCardsTabProps {
  state: AppState;
  isInstitution: boolean;
  accessibleEmployees?: Employee[];
  onSelectEmployee: (emp: Employee) => void;
  onPrintIdCards?: (employees: Employee[]) => void;
}

export const StaffCardsTab: React.FC<StaffCardsTabProps> = ({
  state,
  isInstitution,
  accessibleEmployees,
  onSelectEmployee,
  onPrintIdCards,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [branchFilter, setBranchFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const baseList = useMemo(() => {
    let list = accessibleEmployees || state.employees || [];
    const isExecutive =
      state.currentPersona?.role === 'super_admin' ||
      state.currentPersona?.role === 'admin' ||
      state.currentPersona?.role === 'hr_manager';

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

    if (!hasFounderOrAdmin && state.currentPersona && isExecutive) {
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
  }, [accessibleEmployees, state.employees, state.currentPersona, state.customOptions?.offices]);

  const filteredEmployees = useMemo(() => {
    return baseList.filter((emp) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        emp.name.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        (emp.employeeId && emp.employeeId.toLowerCase().includes(q)) ||
        emp.department?.toLowerCase().includes(q) ||
        (emp.designation && emp.designation.toLowerCase().includes(q));

      const branchVal = emp.officeName || emp.location || '';
      const matchesBranch =
        branchFilter === 'All' ||
        branchVal.toLowerCase() === branchFilter.toLowerCase();

      const matchesDept =
        departmentFilter === 'All' ||
        (emp.department && emp.department.toLowerCase() === departmentFilter.toLowerCase());

      const statusVal = (emp.status || 'Active').toLowerCase();
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

      return matchesSearch && matchesBranch && matchesDept && matchesStatus;
    });
  }, [baseList, searchQuery, branchFilter, departmentFilter, statusFilter, state.currentPersona]);
  useEffect(() => setPage(1), [searchQuery, branchFilter, departmentFilter, statusFilter]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredEmployees.length / pageSize)));
  const pagedEmployees = filteredEmployees.slice((currentPage - 1) * pageSize, currentPage * pageSize);


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
    statusFilter !== 'All';

  const handleClearFilters = () => {
    setSearchQuery('');
    setBranchFilter('All');
    setDepartmentFilter('All');
    setStatusFilter('All');
  };

  const getStatusChip = (emp: Employee) => {
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
        {accStatus === 'Activated' ? 'Active' : accStatus === 'Not Activated' ? 'Inactive' : accStatus}
      </span>
    );
  };

  return (
    <div className="people-studio__panel people-directory-panel">
      <section className="people-studio__sheet people-studio__sheet--pad">
        <div className="people-studio__filters">
          <div className="people-studio__search">
            <Search className="people-studio__search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, role, or department"
              aria-label="Search directory"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="people-studio__search-clear" aria-label="Clear search">
                <X className="w-3.5 h-3.5" />
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
              {availableDepartments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
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
              <option value="Not Activated">Inactive</option>
              <option value="Active">Active</option>
              <option value="In Probation">In Probation</option>
              <option value="On Leave">On Leave</option>
              <option value="Notice Period">Notice Period</option>
              <option value="Suspended">Suspended</option>
              <option value="Deactivated">Deactivated</option>
            </select>

            {hasActiveFilters && (
              <button type="button" onClick={handleClearFilters} className="people-studio__btn people-studio__btn--ghost">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>
        <div className="people-studio__count">
          <span>
            <strong>{filteredEmployees.length}</strong> {filteredEmployees.length === 1 ? 'person' : 'people'} in this directory
          </span>
          {onPrintIdCards && (
            <button
              type="button"
              disabled={filteredEmployees.length === 0}
              onClick={() => onPrintIdCards(filteredEmployees)}
              className="people-studio__btn people-studio__btn--secondary people-studio__btn--compact"
            >
              <Printer className="h-3.5 w-3.5" />
              Print this view
            </button>
          )}
        </div>
      </section>

      <div className="people-studio__grid">
        {filteredEmployees.length === 0 ? (
          <div className="people-studio__empty">
            No people match these filters. Clear a filter or search a different name.
          </div>
        ) : (
          pagedEmployees.map((emp) => {
            const branchText = emp.officeName || emp.location || 'No office';

            return (
              <article
                key={emp.id}
                onClick={() => onSelectEmployee(emp)}
                className="people-studio__sheet people-studio__card"
                role="button"
                tabIndex={0}
                aria-label={`Open profile: ${emp.name}`}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onSelectEmployee(emp);
                  }
                }}
              >
                <div className="people-studio__card-top">
                  {emp.employeeId ? <span className="people-studio__id">{emp.employeeId}</span> : <span />}
                  {getStatusChip(emp)}
                </div>

                <div className="people-studio__card-body">
                  <UserAvatar
                    src={emp.avatar}
                    name={emp.name}
                    className="h-10 w-10 shrink-0 text-xs font-bold"
                  />
                  <div className="min-w-0">
                    <h4 className="people-studio__who-name">{emp.name}</h4>
                    <p className="people-studio__who-mail">
                      {emp.designation || (emp.role === 'super_admin' ? 'Founder & CEO' : 'Team Member')}
                    </p>
                    <span className="people-studio__dept-tag">{emp.department || 'Operations'}</span>
                  </div>
                </div>

                <div className="people-studio__card-facts">
                  <p>{branchText}</p>
                  <p title={emp.email}>{emp.email}</p>
                  {emp.phone && emp.phone !== '—' && <p>{emp.phone}</p>}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEmployee(emp);
                  }}
                  className="people-studio__card-open"
                >
                  Open profile
                </button>
              </article>
            );
          })
        )}
      </div>
      <WorkspacePagination total={filteredEmployees.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
    </div>
  );
};
