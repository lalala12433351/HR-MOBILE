'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  X,
} from 'lucide-react';
import { Employee, AccountStatus } from '../../../types';
import { AppState } from '../../../services/store';
import { UserAvatar } from '@/components/common/UserAvatar';

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
}) => {
  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredEmployees = useMemo(() => {
    return baseEmployeesList.filter((emp) => {
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
  }, [baseEmployeesList, searchQuery, branchFilter, departmentFilter, jobTitleFilter, statusFilter, employmentTypeFilter, state.currentPersona]);

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

    let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
    if (accStatus === 'Active' || accStatus === 'Activated') {
      badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (accStatus === 'In Probation' || accStatus === 'Notice Period') {
      badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (accStatus === 'Not Activated') {
      badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (accStatus === 'On Leave') {
      badgeClass = 'bg-purple-50 text-purple-700 border-purple-200';
    } else if (accStatus === 'Suspended' || accStatus === 'Deactivated') {
      badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}`}>
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

  const renderEmployeeRow = (emp: Employee, hideDept = false) => {
    const branchText = emp.officeName || emp.location || '—';
    const mgr = emp.managerId ? (state.employees || []).find((e) => e.id === emp.managerId) : null;
    const mgrDisplay = mgr
      ? mgr.name
      : emp.managerName || emp.lineManager?.name || '—';
    const isTeamManager =
      emp.role === 'manager' &&
      ((state.employees || []).some((e) => e.id !== emp.id && e.managerId === emp.id) ||
        ((state.customOptions as any)?.teamRecords || []).some(
          (t: any) => t.leadEmployeeId && String(t.leadEmployeeId) === String(emp.id)
        ));

    return (
      <tr
        key={emp.id}
        className="hover:bg-[#f8fafc] transition-colors border-b border-[#e2e8f0]/80 group"
      >

        {/* Employee Info: Avatar + Name + ID + Email */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          <div className="flex items-center gap-2.5">
            <UserAvatar src={emp.avatar} name={emp.name} className="h-7 w-7 text-xs ring-1 ring-[#e2e8f0]" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectEmployee(emp)}
                  className="font-bold text-[#0f172a] hover:text-[#2563eb] cursor-pointer text-left truncate transition-colors text-xs"
                >
                  {emp.name}
                </button>
                {emp.employeeId && (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    {emp.employeeId}
                  </span>
                )}
                {isTeamManager && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-100">
                    Manager
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[#64748b] block truncate font-medium">
                {emp.email}
              </span>
            </div>
          </div>
        </td>

        {/* Job Title */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          <span className="font-semibold text-[#0f172a] text-xs block">
            {emp.designation || (emp.role === 'super_admin' ? 'Founder & CEO' : 'Team Member')}
          </span>
        </td>

        {/* Department (if not in grouped mode) */}
        {!hideDept && (
          <td className="py-2.5 px-3 text-[#475569] whitespace-nowrap font-medium text-xs">
            <span className="px-2 py-0.5 rounded-md bg-slate-100/80 border border-slate-200 text-slate-700 font-semibold text-[11px]">
              {emp.department || 'Operations'}
            </span>
          </td>
        )}

        {/* Office / Branch */}
        <td className="py-2.5 px-3 font-medium text-[#475569] whitespace-nowrap text-xs">
          <span>{branchText}</span>
        </td>

        {/* Reporting Manager */}
        <td className="py-2.5 px-3 text-[#64748b] whitespace-nowrap text-xs font-medium">
          {mgrDisplay !== '—' ? (
            <span className="font-semibold text-[#0f172a] hover:text-[#2563eb] cursor-pointer">
              {mgrDisplay}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>

        {/* Status Badge */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          {getStatusBadge(emp)}
        </td>

        {/* Manage Action Button */}
        <td className="py-2.5 px-3 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={() => onSelectEmployee(emp)}
            className="px-2.5 py-1 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#eff6ff] hover:border-blue-300 text-[#0f172a] hover:text-[#2563eb] text-[11px] font-bold cursor-pointer transition-all shadow-2xs"
          >
            Manage Profile
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-3 w-full">
      {/* 1. Filter Strip: Search + Multi-dropdowns + Layout Switcher */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-[#e2e8f0] shadow-card">
        {/* Search Field */}
        <div className="relative flex-1 min-w-[220px] max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, ID, email, role, or department..."
            className="w-full rounded-lg border border-[#e2e8f0] bg-[#f8fafc] pl-8.5 pr-4 py-1.5 text-xs text-[#0f172a] placeholder:text-slate-400 outline-none focus:bg-white focus:border-[#2563eb] focus:ring-1 focus:ring-blue-100 transition-all font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Section: Dropdown Filters & Layout Toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] cursor-pointer font-semibold shadow-2xs"
          >
            <option value="All">All Departments</option>
            {availableDepartments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Branch / Office Filter */}
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] cursor-pointer font-semibold shadow-2xs"
          >
            <option value="All">All Locations</option>
            {availableBranches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] cursor-pointer font-semibold shadow-2xs"
          >
            <option value="All">All Statuses</option>
            <option value="Not Activated">Not Activated</option>
            <option value="Active">Active</option>
            <option value="In Probation">In Probation</option>
            <option value="On Leave">On Leave</option>
            <option value="Notice Period">Notice Period</option>
            <option value="Suspended">Suspended</option>
            <option value="Deactivated">Deactivated</option>
          </select>

          {/* Layout Toggle: Departments Grouped vs Flat */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-[#e2e8f0]">
            <button
              type="button"
              onClick={() => setViewLayout('grouped')}
              title="Department Breakdown"
              className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewLayout === 'grouped'
                  ? 'bg-white text-[#0f172a] shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Grouped
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('flat')}
              title="Single Unified Table"
              className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewLayout === 'flat'
                  ? 'bg-white text-[#0f172a] shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Unified
            </button>
          </div>

          {/* Clear Filter Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* 2. Mobile View Card List */}
      <div className="block md:hidden space-y-3">
        {filteredEmployees.length === 0 ? (
          <div className="p-6 rounded-xl border border-[#e2e8f0] bg-white text-center text-xs text-[#64748b] font-medium shadow-card">
            No employees found matching filter criteria
          </div>
        ) : viewLayout === 'grouped' ? (
          Object.entries(groupedByDepartment).map(([deptName, deptEmployees]) => (
            <div key={deptName} className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden shadow-card">
              <div className="px-3.5 py-2 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
                <span className="text-xs font-bold text-[#0f172a] uppercase tracking-wider">{deptName}</span>
                <span className="text-[11px] text-[#64748b] font-bold">
                  {deptEmployees.length} {deptEmployees.length === 1 ? 'member' : 'members'}
                </span>
              </div>
              <div className="p-2.5 space-y-2 divide-y divide-slate-100">
                {deptEmployees.map((emp) => {
                  const branchText = emp.officeName || emp.location || 'Bengaluru HQ';

                  return (
                    <div
                      key={emp.id}
                      onClick={() => onSelectEmployee(emp)}
                      className="pt-2 first:pt-0 space-y-1.5 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar src={emp.avatar} name={emp.name} className="h-7 w-7 ring-1 ring-slate-200" />
                          <div className="min-w-0">
                            <h3 className="font-bold text-xs text-[#0f172a] truncate">{emp.name}</h3>
                            <p className="text-[10px] text-[#64748b] truncate">{emp.designation || (emp.role === 'super_admin' ? 'Founder & CEO' : 'Team Member')}</p>
                          </div>
                        </div>
                        {getStatusBadge(emp)}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#64748b]">
                        <span>{branchText}</span>
                        <span className="font-mono">{emp.employeeId}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          filteredEmployees.map((emp) => {
            const branchText = emp.officeName || emp.location || 'Bengaluru HQ';

            return (
              <div
                key={emp.id}
                onClick={() => onSelectEmployee(emp)}
                className="p-3 rounded-xl border border-[#e2e8f0] bg-white space-y-2 cursor-pointer hover:border-blue-300 transition-colors shadow-card"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserAvatar src={emp.avatar} name={emp.name} className="h-7 w-7 ring-1 ring-slate-200" />
                    <div className="min-w-0">
                      <h3 className="font-bold text-xs text-[#0f172a] truncate">{emp.name}</h3>
                      <p className="text-[10px] text-[#64748b] truncate">{emp.email}</p>
                    </div>
                  </div>
                  {getStatusBadge(emp)}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                  <span className="truncate">{emp.designation} · {emp.department}</span>
                  <span className="truncate text-slate-500">
                    {emp.managerName || emp.lineManager?.name
                      ? `Reports to ${emp.managerName || emp.lineManager?.name}`
                      : branchText}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. Desktop Table (Grouped or Unified) */}
      <div className="hidden md:block space-y-3.5">
        {filteredEmployees.length === 0 ? (
          <div className="rounded-xl border border-[#e2e8f0] bg-white p-10 text-center text-xs text-[#64748b] shadow-card font-medium">
            No employees found matching filter criteria.
          </div>
        ) : viewLayout === 'grouped' ? (
          /* GROUPED BY DEPARTMENT */
          Object.entries(groupedByDepartment).map(([deptName, deptEmployees]) => (
            <div
              key={deptName}
              className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden shadow-card transition-all"
            >
              {/* Department Header Banner */}
              <div className="px-4 py-2 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0f172a] tracking-wider uppercase">
                    {deptName}
                  </span>
                  <span className="text-[11px] text-[#64748b] font-semibold">
                    · {deptEmployees.length} {deptEmployees.length === 1 ? 'member' : 'members'}
                  </span>
                </div>
              </div>

              {/* Department Table */}
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] bg-white text-[#64748b] font-bold text-[10px] uppercase tracking-wider">
                      <th className="py-2.5 px-3 font-bold text-[#0f172a]">Employee</th>
                      <th className="py-2.5 px-3 font-bold text-[#0f172a]">Role</th>
                      <th className="py-2.5 px-3 font-bold text-[#0f172a]">Office Location</th>
                      <th className="py-2.5 px-3 font-bold text-[#0f172a]">Reports To</th>
                      <th className="py-2.5 px-3 font-bold text-[#0f172a]">Status</th>
                      <th className="py-2.5 px-3 text-right font-bold text-[#0f172a]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]/60 text-slate-800">
                    {deptEmployees.map((emp) => renderEmployeeRow(emp, true))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : (
          /* FLAT UNIFIED TABLE */
          <div className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden shadow-card">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[#64748b] font-bold text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 font-bold text-[#0f172a]">Employee</th>
                    <th className="py-2.5 px-3 font-bold text-[#0f172a]">Role</th>
                    <th className="py-2.5 px-3 font-bold text-[#0f172a]">Department</th>
                    <th className="py-2.5 px-3 font-bold text-[#0f172a]">Office Location</th>
                    <th className="py-2.5 px-3 font-bold text-[#0f172a]">Reports To</th>
                    <th className="py-2.5 px-3 font-bold text-[#0f172a]">Status</th>
                    <th className="py-2.5 px-3 text-right font-bold text-[#0f172a]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0]/60 text-slate-800">
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
