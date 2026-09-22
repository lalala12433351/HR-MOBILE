'use client';

import React, { useState, useMemo } from 'react';
import { Search, X, Mail, Phone, Building2, Eye } from 'lucide-react';
import { Employee, AccountStatus } from '../../../types';
import { AppState } from '../../../services/store';
import { UserAvatar } from '@/components/common/UserAvatar';

interface StaffCardsTabProps {
  state: AppState;
  isInstitution: boolean;
  accessibleEmployees?: Employee[];
  onSelectEmployee: (emp: Employee) => void;
}

export const StaffCardsTab: React.FC<StaffCardsTabProps> = ({
  state,
  isInstitution,
  accessibleEmployees,
  onSelectEmployee,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
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
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}>
        {accStatus === 'Activated' ? 'Active' : accStatus}
      </span>
    );
  };

  return (
    <div className="space-y-3 w-full">
      {/* Search & Filter Header Strip */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-[#e2e8f0] shadow-card">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search directory by name, role, department..."
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

        <div className="flex flex-wrap items-center gap-1.5">
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

      {/* Directory Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredEmployees.length === 0 ? (
          <div className="col-span-full rounded-xl border border-[#e2e8f0] bg-white p-10 text-center text-xs text-[#64748b] shadow-card font-medium">
            No employees found matching filter criteria
          </div>
        ) : (
          filteredEmployees.map((emp) => {
            const branchText = emp.officeName || emp.location || 'Corporate Headquarters';

            return (
              <div
                key={emp.id}
                onClick={() => onSelectEmployee(emp)}
                className="rounded-xl border border-[#e2e8f0] bg-white p-4 flex flex-col items-center text-center transition-all duration-200 hover:border-[#2563eb]/40 hover:shadow-md cursor-pointer group shadow-card relative overflow-hidden"
              >
                {/* Top Corner Status Pill & Employee ID */}
                <div className="w-full flex items-center justify-between mb-2.5">
                  {emp.employeeId ? (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {emp.employeeId}
                    </span>
                  ) : <span />}
                  {getStatusChip(emp)}
                </div>

                {/* Avatar with Ring */}
                <UserAvatar
                  src={emp.avatar}
                  name={emp.name}
                  className="h-13 w-13 mb-2 ring-2 ring-slate-100 group-hover:ring-[#2563eb] transition-all text-xs font-bold"
                />

                {/* Name & Job Title */}
                <h4 className="text-xs font-bold text-[#0f172a] group-hover:text-[#2563eb] transition-colors truncate max-w-full">
                  {emp.name}
                </h4>

                <p className="text-[11px] font-medium text-[#64748b] truncate max-w-full mt-0.5">
                  {emp.designation || (emp.role === 'super_admin' ? 'Founder & CEO' : 'Team Member')}
                </p>

                {/* Department Badge */}
                <div className="mt-1.5 mb-1.5">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#eff6ff] text-[#1e3a8a] border border-[#2563eb]/20">
                    {emp.department || 'Operations'}
                  </span>
                </div>

                {/* Location */}
                <div className="text-[10px] font-medium text-slate-500 mb-2.5 truncate flex items-center justify-center gap-1">
                  <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="truncate">{branchText}</span>
                </div>

                {/* Bottom Contact Bar */}
                <div className="w-full pt-2 border-t border-[#e2e8f0] space-y-1 text-[10px] text-[#64748b]">
                  <div className="flex items-center justify-center gap-1 truncate" title={emp.email}>
                    <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                    <span className="truncate">{emp.email}</span>
                  </div>
                  {emp.phone && emp.phone !== '—' && (
                    <div className="flex items-center justify-center gap-1 text-slate-500 truncate">
                      <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="truncate">{emp.phone}</span>
                    </div>
                  )}
                </div>

                {/* Manage Action Button */}
                <div className="w-full mt-3 pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEmployee(emp);
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-blue-600 text-slate-800 hover:text-white font-bold text-xs transition-all border border-slate-200 hover:border-blue-600 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600"
                  >
                    <Eye className="h-3.5 w-3.5 text-slate-700 group-hover:text-white transition-colors" />
                    <span className="text-slate-800 group-hover:text-white font-bold transition-colors">View Profile</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
