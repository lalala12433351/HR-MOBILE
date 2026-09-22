import React, { useState, useMemo } from 'react';
import { Plus, X, Building2, Users, ListTree, GitFork, UserPlus, MapPin } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { DepartmentName, Employee, Role, WorkShift } from '@/types';
import { api } from '@/services/apiClient';
import { toApiAuthRole } from '@/utils/roleMapping';

interface JobRoleItem {
  id: string;
  title: string;
  permissionLevel: 'Employee' | 'HR' | 'Manager' | 'Admin';
  description?: string;
}

interface DepartmentOrTeamItem {
  id: string;
  name: string;
  type: 'department' | 'team';
  managerId?: string;
  memberIds: string[];
}

interface EmployeeItem {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  role: string;
  department?: string;
  team?: string;
  officeName?: string;
  location?: string;
  managerId?: string;
  shiftId?: string;
  joinDate?: string;
  employmentType?: 'Full-time' | 'Part-time' | 'Contract';
}

// Minimalistic Department / Team Card
const DepartmentTeamCard: React.FC<{
  item: DepartmentOrTeamItem;
  employees: EmployeeItem[];
  onRemove: (id: string) => void;
  onUpdateManager: (id: string, managerId: string) => void;
  onToggleMember: (id: string, employeeId: string) => void;
}> = ({ item, employees, onRemove, onUpdateManager, onToggleMember }) => {
  const isDept = item.type === 'department';
  const [managerSearch, setManagerSearch] = useState('');
  const [managerFocused, setManagerFocused] = useState(false);

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeFocused, setEmployeeFocused] = useState(false);

  const selectedManager = employees.find((e) => e.id === item.managerId);

  // Filtered employees for Manager fuzzy search
  const filteredManagers = useMemo(() => {
    if (!managerSearch.trim()) return employees;
    const q = managerSearch.toLowerCase();
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)
    );
  }, [employees, managerSearch]);

  // Filtered employees for Members fuzzy search (excluding already added members)
  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.toLowerCase();
    return employees.filter(
      (e) =>
        !item.memberIds.includes(e.id) &&
        (!q.trim() || e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || e.email.toLowerCase().includes(q))
    );
  }, [employees, employeeSearch, item.memberIds]);

  const memberEmployees = useMemo(() => {
    return employees.filter((e) => item.memberIds.includes(e.id));
  }, [employees, item.memberIds]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 p-6 md:p-7 shadow-2xs hover:border-slate-300 transition-all space-y-5">
      {/* Header Row: Clean Title + Minimalist Neutral Badge + remove button */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <h4 className="font-extrabold text-slate-900 text-base">{item.name}</h4>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/60">
            {item.type}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="text-slate-400 hover:text-red-500 p-1.5 rounded-xl transition-colors cursor-pointer text-base font-bold leading-none"
          title="Remove"
        >
          ×
        </button>
      </div>

      {/* 1. Manager Field with Fuzzy Search */}
      <div className="relative space-y-2">
        <label className="block text-xs font-bold text-slate-800">
          Manager
        </label>
        
        {selectedManager && !managerFocused ? (
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-800 font-bold flex items-center justify-center text-[10px]">
                {selectedManager.name.charAt(0)}
              </div>
              <div>
                <span className="font-bold text-slate-900">{selectedManager.name}</span>
                <span className="text-slate-500 text-[11px] ml-1.5">({selectedManager.role})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setManagerFocused(true);
                setManagerSearch('');
              }}
              className="text-slate-900 hover:text-blue-600 font-bold text-xs hover:underline cursor-pointer"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={managerSearch}
              onChange={(e) => setManagerSearch(e.target.value)}
              onFocus={() => setManagerFocused(true)}
              onBlur={() => setTimeout(() => setManagerFocused(false), 200)}
              placeholder="Type to search and select manager..."
              className="w-full rounded-2xl border border-slate-200 px-4.5 py-3 text-xs outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 bg-white font-medium transition-all"
            />
            {managerFocused && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl py-1 custom-scrollbar">
                {filteredManagers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400 font-medium">No employees found</div>
                ) : (
                  filteredManagers.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onMouseDown={() => {
                        onUpdateManager(item.id, emp.id);
                        setManagerFocused(false);
                        setManagerSearch('');
                      }}
                      className="w-full px-4 py-2.5 text-left hover:bg-slate-50 flex items-center justify-between text-xs transition-colors cursor-pointer"
                    >
                      <span className="font-bold text-slate-800">{emp.name}</span>
                      <span className="text-[11px] text-slate-400">{emp.role}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Employee Field with Fuzzy Search & Member Chips */}
      <div className="relative space-y-2">
        <label className="block text-xs font-bold text-slate-800">
          Employees ({memberEmployees.length})
        </label>

        {/* Search Input for Employees */}
        <div className="relative">
          <input
            type="text"
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            onFocus={() => setEmployeeFocused(true)}
            onBlur={() => setTimeout(() => setEmployeeFocused(false), 200)}
            placeholder="Type to search & add employees..."
            className="w-full rounded-2xl border border-slate-200 px-4.5 py-3 text-xs outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 bg-white font-medium transition-all"
          />

          {employeeFocused && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl py-1 custom-scrollbar">
              {filteredEmployees.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400 font-medium">
                  {employees.length === memberEmployees.length ? 'All employees added' : 'No matching employees'}
                </div>
              ) : (
                filteredEmployees.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onMouseDown={() => {
                      onToggleMember(item.id, emp.id);
                      setEmployeeSearch('');
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-50 flex items-center justify-between text-xs transition-colors cursor-pointer"
                  >
                    <span className="font-bold text-slate-800">{emp.name}</span>
                    <span className="text-[11px] text-slate-400">{emp.role}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected Member Chips */}
        {memberEmployees.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {memberEmployees.map((emp) => (
              <span
                key={emp.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200/80"
              >
                <span>{emp.name}</span>
                <button
                  type="button"
                  onClick={() => onToggleMember(item.id, emp.id)}
                  className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Interactive Org Chart Hierarchy Tree
const OrgHierarchyTree: React.FC<{
  employees: EmployeeItem[];
  managerAssignments: Record<string, string>;
  onUpdateManager: (empId: string, managerId: string) => void;
  departments: DepartmentOrTeamItem[];
}> = ({ employees, managerAssignments, onUpdateManager, departments }) => {
  // Map of managerId -> direct reports
  const childrenMap = useMemo(() => {
    const map: Record<string, EmployeeItem[]> = {};
    employees.forEach((emp) => {
      const mgrId = managerAssignments[emp.id];
      if (mgrId && mgrId !== emp.id) {
        if (!map[mgrId]) map[mgrId] = [];
        map[mgrId].push(emp);
      }
    });
    return map;
  }, [employees, managerAssignments]);

  // Root employees (those without managers or top-level)
  const rootEmployees = useMemo(() => {
    const roots = employees.filter((emp) => {
      const mgrId = managerAssignments[emp.id];
      return !mgrId || mgrId === emp.id || !employees.some((e) => e.id === mgrId);
    });
    return roots.length > 0 ? roots : [employees[0]].filter(Boolean);
  }, [employees, managerAssignments]);

  const visited = new Set<string>();

  const renderNode = (emp: EmployeeItem, depth: number = 0): React.ReactNode => {
    if (visited.has(emp.id)) return null;
    visited.add(emp.id);

    const children = childrenMap[emp.id] || [];
    const assignedDept = departments.find(
      (it) => it.type === 'department' && (it.memberIds.includes(emp.id) || it.managerId === emp.id)
    )?.name || emp.department || 'General';

    return (
      <div key={emp.id} className="relative space-y-2">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center text-xs border border-slate-200/60">
              {emp.name.charAt(0)}
            </div>
            <div>
              <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                <span>{emp.name}</span>
                {depth === 0 && (
                  <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
                    Lead
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400">
                {emp.role} • <span className="text-slate-600 font-medium">{assignedDept}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">Reports to:</span>
            <select
              value={managerAssignments[emp.id] || ''}
              onChange={(e) => onUpdateManager(emp.id, e.target.value)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-slate-900 bg-slate-50 cursor-pointer max-w-[160px]"
            >
              <option value="">None (Top Level)</option>
              {employees.filter((m) => m.id !== emp.id).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Children Direct Reports Subtree */}
        {children.length > 0 && (
          <div className="pl-4 ml-4 border-l-2 border-slate-200 space-y-2 pt-1">
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {rootEmployees.map((root) => renderNode(root, 0))}
    </div>
  );
};

export const EmployeeSetupWizard: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const { state, updateState, triggerToast } = useApp();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [chartViewMode, setChartViewMode] = useState<'tree' | 'roster'>('tree');

  // Detect Organization Template Mode: Institution vs Company
  const isInitialInstitution =
    state.organization?.industry === 'Institute' ||
    state.organization?.industry === 'School / Education' ||
    state.organization?.industry === 'Institution' ||
    state.organization?.industry === 'Education' ||
    state.organization?.industry === 'School';

  const [orgTemplate, setOrgTemplate] = useState<'institution' | 'company'>(
    isInitialInstitution ? 'institution' : 'company'
  );

  // STEP 1: Job Roles & Permissions Preset Definitions
  const [jobRoles, setJobRoles] = useState<JobRoleItem[]>(() => {
    if (isInitialInstitution) {
      return [
        { id: 'job-admin', title: 'Admin', permissionLevel: 'Admin', description: 'Full institutional governance, campus configuration & total administrative oversight (access to everything)' },
        { id: 'job-1', title: 'Teacher', permissionLevel: 'Employee', description: 'Academic instruction, classroom management & student attendance' },
        { id: 'job-2', title: 'Staff', permissionLevel: 'Employee', description: 'Standard school staff & campus operations access' },
        { id: 'job-3', title: 'Management', permissionLevel: 'Manager', description: 'School administration & department leadership (own team access only)' },
        { id: 'job-4', title: 'HR', permissionLevel: 'HR', description: 'Staff records, leave approvals, regularizations & HR operations for everyone' },
      ];
    }
    return [
      { id: 'job-1', title: 'Admin', permissionLevel: 'Admin', description: 'Full system administration, governance & executive management (access to everything)' },
      { id: 'job-2', title: 'Manager', permissionLevel: 'Manager', description: 'Department management, team approvals & operational oversight for own team only' },
      { id: 'job-3', title: 'HR', permissionLevel: 'HR', description: 'Company-wide HR operations, employee relations, leave audits & payroll records for everyone' },
      { id: 'job-4', title: 'Employee', permissionLevel: 'Employee', description: 'Standard workspace access (personal attendance, timesheets, tasks)' },
    ];
  });

  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobPermission, setNewJobPermission] = useState<'Employee' | 'HR' | 'Manager' | 'Admin'>('Employee');

  // STEP 2: Employees List & Form State (Matching AddEmployeeModal)
  const [employees, setEmployees] = useState<EmployeeItem[]>(() => {
    if (state.employees && state.employees.length > 0) {
      return state.employees.map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        phone: e.phone && e.phone !== '—' ? e.phone : '',
        role: e.designation || (isInitialInstitution ? 'Teacher' : 'Employee'),
        department: e.department || '',
        officeName: e.officeName || '',
        location: e.location || '',
        managerId: e.managerId || '',
        shiftId: e.shiftTiming?.shiftId || e.shiftId || 'sh-1',
        joinDate: e.joiningDate || e.joinDate || new Date().toISOString().substring(0, 10),
        employmentType: (e.employmentType as any) || 'Full-time',
      }));
    }
    return [];
  });

  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeEmail, setNewEmployeeEmail] = useState('');
  const [newEmployeePhone, setNewEmployeePhone] = useState('');
  const [newEmployeePassword, setNewEmployeePassword] = useState('');
  const [newEmployeeRole, setNewEmployeeRole] = useState(isInitialInstitution ? 'Teacher' : 'Employee');
  const [newEmployeeDept, setNewEmployeeDept] = useState('');
  const [newEmployeeOffice, setNewEmployeeOffice] = useState('');
  const [newEmployeeManagerId, setNewEmployeeManagerId] = useState('');
  const [newEmployeeJoinDate, setNewEmployeeJoinDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [newEmployeeEmploymentType, setNewEmployeeEmploymentType] = useState<'Full-time' | 'Part-time' | 'Contract'>('Full-time');
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [isCustomDept, setIsCustomDept] = useState(false);

  // Available offices & Quick Add Office Modal (filtered so street addresses are not treated as office branch names)
  const [offices, setOffices] = useState<string[]>(() => {
    const orgAddress = state.organization?.officeLocation?.address?.trim() || '';
    const isStreetAddress = (val?: string) => {
      if (!val) return false;
      const clean = val.trim();
      if (orgAddress && clean.toLowerCase() === orgAddress.toLowerCase()) return true;
      if ((clean.match(/,/g) || []).length >= 3 && /\d{5,6}/.test(clean)) return true;
      return false;
    };

    const set = new Set<string>();
    if (state.customOptions?.offices && state.customOptions.offices.length > 0) {
      state.customOptions.offices.forEach((o) => {
        if (o && o.trim() && !isStreetAddress(o)) set.add(o.trim());
      });
    }
    (state.employees || []).forEach((e) => {
      if (e.officeName && e.officeName.trim() && !isStreetAddress(e.officeName)) set.add(e.officeName.trim());
      if (e.location && e.location.trim() && !isStreetAddress(e.location)) set.add(e.location.trim());
    });
    if (set.size === 0 && orgAddress) {
      const firstPart = orgAddress.split(',')[0].trim();
      if (firstPart && !isStreetAddress(firstPart)) {
        set.add(firstPart);
      }
    }
    return Array.from(set);
  });
  const [showAddOfficeModal, setShowAddOfficeModal] = useState(false);
  const [newOfficeName, setNewOfficeName] = useState('');

  const handleCreateOffice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficeName.trim()) return;
    const trimmed = newOfficeName.trim();
    if (!offices.includes(trimmed)) {
      setOffices((prev) => [...prev, trimmed]);
      setNewEmployeeOffice(trimmed);
      triggerToast({
        title: 'Office Location Added',
        message: `Added "${trimmed}" as a workspace location.`,
        type: 'success',
      });
    }
    setNewOfficeName('');
    setShowAddOfficeModal(false);
  };

  // Work Shifts & Batch Schedules Configuration
  const [shifts, setShifts] = useState<WorkShift[]>(() => {
    if (state.customOptions?.shifts && state.customOptions.shifts.length > 0) {
      return state.customOptions.shifts;
    }
    return [
      { id: 'sh-1', name: isInitialInstitution ? 'Day Class Schedule' : 'General Day Shift', startTime: isInitialInstitution ? '08:30' : '09:00', endTime: isInitialInstitution ? '15:30' : '18:00', gracePeriodMinutes: 15, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
      { id: 'sh-hourly', name: 'Hourly / Flexible Shift', startTime: 'Flexible', endTime: 'Flexible', gracePeriodMinutes: 0, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], isHourlyShift: true, hourlyTrackingThresholdHours: 8 },
    ];
  });
  const [selectedShiftId, setSelectedShiftId] = useState<string>('sh-1');



  // New Shift Creation in Onboarding
  const [showAddShiftModal, setShowAddShiftModal] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftStart, setNewShiftStart] = useState(isInitialInstitution ? '08:30' : '09:00');
  const [newShiftEnd, setNewShiftEnd] = useState(isInitialInstitution ? '15:30' : '18:00');
  const [newShiftGrace, setNewShiftGrace] = useState(15);
  const [newShiftDays, setNewShiftDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

  const handleCreateShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftName.trim()) return;

    const newS: WorkShift = {
      id: `sh_${Date.now()}`,
      name: newShiftName.trim(),
      startTime: newShiftStart,
      endTime: newShiftEnd,
      gracePeriodMinutes: Number(newShiftGrace) || 15,
      workingDays: newShiftDays,
    };

    setShifts((prev) => [...prev, newS]);
    setSelectedShiftId(newS.id);
    setShowAddShiftModal(false);
    setNewShiftName('');
    triggerToast({
      title: 'Shift Created',
      message: `Created "${newS.name}" with ${newShiftDays.length} active weekly days.`,
      type: 'success',
    });
  };

  const WEEK_DAYS = [
    { key: 'Monday', short: 'Mon' },
    { key: 'Tuesday', short: 'Tue' },
    { key: 'Wednesday', short: 'Wed' },
    { key: 'Thursday', short: 'Thu' },
    { key: 'Friday', short: 'Fri' },
    { key: 'Saturday', short: 'Sat' },
    { key: 'Sunday', short: 'Sun' },
  ];

  // STEP 3: Departments & Teams Structure
  const [itemType, setItemType] = useState<'department' | 'team'>('department');
  const [newItemName, setNewItemName] = useState('');

  const [items, setItems] = useState<DepartmentOrTeamItem[]>(() => {
    const loaded: DepartmentOrTeamItem[] = [];
    if (state.customOptions?.departments && state.customOptions.departments.length > 0) {
      state.customOptions.departments.forEach((d, i) => {
        loaded.push({
          id: `dep-${i + 1}`,
          name: d,
          type: 'department',
          memberIds: [],
        });
      });
    }
    if (state.customOptions?.teams && state.customOptions.teams.length > 0) {
      state.customOptions.teams.forEach((t, i) => {
        loaded.push({
          id: `team-${i + 1}`,
          name: t,
          type: 'team',
          memberIds: [],
        });
      });
    }
    return loaded;
  });

  // Switch Template Presets Handler
  const handleSwitchTemplate = (tpl: 'institution' | 'company') => {
    setOrgTemplate(tpl);
    if (tpl === 'institution') {
      setJobRoles([
        { id: 'job-admin', title: 'Admin', permissionLevel: 'Admin', description: 'Full institutional governance, campus configuration & total administrative oversight (access to everything)' },
        { id: 'job-1', title: 'Teacher', permissionLevel: 'Employee', description: 'Academic instruction, classroom management & student attendance' },
        { id: 'job-2', title: 'Staff', permissionLevel: 'Employee', description: 'Standard school staff & campus operations access' },
        { id: 'job-3', title: 'Management', permissionLevel: 'Manager', description: 'School administration & department leadership (own team access only)' },
        { id: 'job-4', title: 'HR', permissionLevel: 'HR', description: 'Staff records, leave approvals, regularizations & HR operations for everyone' },
      ]);
      setNewEmployeeRole('Teacher');
    } else {
      setJobRoles([
        { id: 'job-1', title: 'Admin', permissionLevel: 'Admin', description: 'Full system administration, governance & executive management (access to everything)' },
        { id: 'job-2', title: 'Manager', permissionLevel: 'Manager', description: 'Department management, team approvals & operational oversight for own team only' },
        { id: 'job-3', title: 'HR', permissionLevel: 'HR', description: 'Company-wide HR operations, employee relations, leave audits & payroll records for everyone' },
        { id: 'job-4', title: 'Employee', permissionLevel: 'Employee', description: 'Standard workspace access (personal attendance, timesheets, tasks)' },
      ]);
      setNewEmployeeRole('Employee');
    }
  };

  // STEP 4: Organization Hierarchy & Manager Assignments
  const [managerAssignments, setManagerAssignments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    employees.forEach((e) => {
      if (e.managerId) initial[e.id] = e.managerId;
    });
    return initial;
  });

  // Available departments & designations helpers
  const availableDepartments = useMemo(() => {
    const fromItems = items.filter((it) => it.type === 'department').map((it) => it.name);
    if (fromItems.length > 0) return fromItems;
    if (state.customOptions?.departments && state.customOptions.departments.length > 0) {
      return state.customOptions.departments;
    }
    return (state.employees || []).map((e) => e.department).filter(Boolean);
  }, [items, state.customOptions?.departments, state.employees]);

  const availableDesignations = useMemo(() => {
    const fromRoles = jobRoles.map((j) => j.title);
    if (fromRoles.length > 0) return fromRoles;
    if (state.customOptions?.designations && state.customOptions.designations.length > 0) {
      return state.customOptions.designations;
    }
    return (state.employees || []).map((e) => e.designation).filter(Boolean);
  }, [jobRoles, state.customOptions?.designations, state.employees]);

  // Handlers for Step 1: Job Roles
  const handleCreateJobRole = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newJobTitle.trim()) return;

    const trimmed = newJobTitle.trim();
    if (jobRoles.some((j) => j.title.toLowerCase() === trimmed.toLowerCase())) {
      setNewJobTitle('');
      return;
    }

    const desc =
      newJobPermission === 'Employee'
        ? (orgTemplate === 'institution' ? 'Standard school staff & teacher access' : 'Standard workspace access (attendance, timesheets, tasks)')
        : newJobPermission === 'HR'
        ? 'HR operations (leave approvals, regularizations, records)'
        : (orgTemplate === 'institution' ? 'School governance & administration oversight' : 'Department management (line approvals, project & task allocation)');

    const newJob: JobRoleItem = {
      id: `job_${Date.now()}`,
      title: trimmed,
      permissionLevel: newJobPermission,
      description: desc,
    };

    setJobRoles((prev) => [newJob, ...prev]);
    setNewJobTitle('');
  };

  const handleRemoveJobRole = (id: string) => {
    setJobRoles((prev) => prev.filter((j) => j.id !== id));
  };

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim() || !newEmployeeEmail.trim()) return;

    const cleanEmail = newEmployeeEmail.trim().toLowerCase();
    const cleanName = newEmployeeName.trim().toLowerCase();
    const cleanPhone = newEmployeePhone.trim();

    const isDuplicate =
      employees.some(
        (emp) =>
          (emp.email && emp.email.toLowerCase() === cleanEmail) ||
          (cleanPhone && emp.phone && emp.phone.trim() === cleanPhone) ||
          (emp.name && emp.name.toLowerCase() === cleanName && emp.email && emp.email.toLowerCase() === cleanEmail)
      ) ||
      (state.employees || []).some(
        (emp) =>
          (emp.email && emp.email.toLowerCase() === cleanEmail) ||
          (cleanPhone && emp.phone && emp.phone.trim() === cleanPhone) ||
          (emp.name && emp.name.toLowerCase() === cleanName && emp.email && emp.email.toLowerCase() === cleanEmail)
      );

    if (isDuplicate) {
      triggerToast({
        title: 'Duplicate Employee Rejected',
        message: `An employee with the same name, email (${cleanEmail}), or phone number already exists.`,
        type: 'warning',
      });
      return;
    }

    const assignedDept =
      newEmployeeDept.trim() ||
      items.find((it) => it.type === 'department')?.name ||
      availableDepartments[0] ||
      (orgTemplate === 'institution' ? 'Faculty' : 'Development');

    const newEmp: EmployeeItem = {
      id: `emp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newEmployeeName.trim(),
      email: newEmployeeEmail.trim().toLowerCase(),
      phone: newEmployeePhone.trim(),
      password: newEmployeePassword.trim() || 'Welcome@123',
      role: newEmployeeRole || (jobRoles[0]?.title ?? (orgTemplate === 'institution' ? 'Teacher' : 'Employee')),
      department: assignedDept,
      team: `${assignedDept} Team`,
      officeName: newEmployeeOffice.trim() || offices[0] || '',
      location: newEmployeeOffice.trim() || offices[0] || '',
      managerId: newEmployeeManagerId || undefined,
      joinDate: newEmployeeJoinDate || new Date().toISOString().substring(0, 10),
      employmentType: newEmployeeEmploymentType,
      shiftId: selectedShiftId,
    };

    setEmployees((prev) => [...prev, newEmp]);

    // Also auto-associate with department item in Step 3 if matching department exists
    setItems((prev) =>
      prev.map((it) => {
        if (it.type === 'department' && it.name.toLowerCase() === assignedDept.toLowerCase()) {
          if (!it.memberIds.includes(newEmp.id)) {
            return { ...it, memberIds: [...it.memberIds, newEmp.id] };
          }
        }
        return it;
      })
    );

    // Reset inputs
    setNewEmployeeName('');
    setNewEmployeeEmail('');
    setNewEmployeePhone('');
    setNewEmployeePassword('');
    setNewEmployeeManagerId('');
    triggerToast({
      title: orgTemplate === 'institution' ? 'Staff Member Added' : 'Employee Added',
      message: `Enrolled "${newEmp.name}" (${newEmp.role}) into ${assignedDept}.`,
      type: 'success',
    });
  };

  const handleRemoveEmployee = (id: string) => {
    const target = employees.find((e) => e.id === id);
    const isOwn =
      Boolean(
        target &&
          state.currentPersona &&
          ((state.currentPersona.email &&
            target.email?.toLowerCase() === state.currentPersona.email.toLowerCase()) ||
            (state.currentPersona.id && target.id === state.currentPersona.id))
      );
    if (isOwn) {
      triggerToast({
        title: 'Cannot remove your account',
        message: 'You cannot delete your own user during setup.',
        type: 'warning',
      });
      return;
    }
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        managerId: it.managerId === id ? undefined : it.managerId,
        memberIds: it.memberIds.filter((mId) => mId !== id),
      }))
    );
  };

  // Handlers for Step 3: Create Department / Team Box
  const handleCreateItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemName.trim()) return;

    const trimmed = newItemName.trim();
    const existing = items.find(
      (it) => it.name.toLowerCase() === trimmed.toLowerCase() && it.type === itemType
    );
    if (existing) {
      setNewItemName('');
      return;
    }

    const defaultManager = employees[0]?.id;
    const newItem: DepartmentOrTeamItem = {
      id: `${itemType}_${Date.now()}`,
      name: trimmed,
      type: itemType,
      managerId: defaultManager,
      memberIds: [],
    };

    setItems((prev) => [newItem, ...prev]);
    setNewItemName('');
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleUpdateItemManager = (itemId: string, managerId: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, managerId } : it))
    );
  };

  const handleToggleItemMember = (itemId: string, employeeId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const exists = it.memberIds.includes(employeeId);
        return {
          ...it,
          memberIds: exists
            ? it.memberIds.filter((id) => id !== employeeId)
            : [...it.memberIds, employeeId],
        };
      })
    );
  };

  // Final Synchronization on Finish Setup
  const handleFinishSetup = async () => {
    const finalDepartments = Array.from(
      new Set(items.filter((it) => it.type === 'department').map((it) => it.name))
    );
    const finalTeams = Array.from(
      new Set(items.filter((it) => it.type === 'team').map((it) => it.name))
    );
    const finalDesignations = Array.from(
      new Set([...jobRoles.map((j) => j.title), ...employees.map((e) => e.role)])
    );

    // Build updated employee objects synchronized with job roles, department, team, and manager
    const updatedEmployees: Employee[] = employees.map((emp, idx) => {
      const assignedDept = items.find(
        (it) => it.type === 'department' && (it.memberIds.includes(emp.id) || it.managerId === emp.id)
      )?.name || emp.department || (finalDepartments[0] as DepartmentName) || 'Development';

      const assignedTeam = items.find(
        (it) => it.type === 'team' && (it.memberIds.includes(emp.id) || it.managerId === emp.id)
      )?.name || emp.team || (finalTeams[0] || 'Core Platform Team');

      const assignedMgrId = managerAssignments[emp.id] || 
        items.find((it) => it.type === 'department' && it.memberIds.includes(emp.id))?.managerId ||
        '';

      const managerObj = assignedMgrId ? employees.find((e) => e.id === assignedMgrId) : undefined;
      const existingEmp = state.employees.find((e) => e.id === emp.id);

      // Find permission level for the employee's job title
      const matchedJob = jobRoles.find((j) => j.title.toLowerCase() === (emp.role || '').toLowerCase());
      let mappedRole: Role = 'employee';
      if (matchedJob?.permissionLevel === 'Admin' || (emp.role || '').toLowerCase() === 'admin' || (emp.role || '').toLowerCase().includes('administrator')) {
        mappedRole = 'super_admin';
      } else if (matchedJob?.permissionLevel === 'HR' || (emp.role || '').toLowerCase() === 'hr' || (emp.role || '').toLowerCase().includes('hr manager')) {
        mappedRole = 'hr_manager';
      } else if (matchedJob?.permissionLevel === 'Manager' || (emp.role || '').toLowerCase() === 'manager' || (emp.role || '').toLowerCase() === 'management' || (emp.role || '').toLowerCase().includes('lead')) {
        mappedRole = 'manager';
      }

      const isCurrentLoggedInUser =
        (state.currentPersona?.email && emp.email?.toLowerCase() === state.currentPersona.email.toLowerCase()) ||
        (state.currentPersona?.name && emp.name?.toLowerCase() === state.currentPersona.name.toLowerCase());

      const matchedShift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];

      return {
        id: emp.id,
        employeeId: existingEmp?.employeeId || `EMP${String(idx + 101).padStart(3, '0')}`,
        name: emp.name,
        fullName: emp.name,
        email: emp.email,
        password: emp.password || existingEmp?.password || 'Welcome@123',
        phone: emp.phone || (isCurrentLoggedInUser ? (existingEmp?.phone || '') : '+1 (555) 019-2834'),
        avatar: existingEmp?.avatar || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
        department: (emp.department || assignedDept) as DepartmentName,
        team: emp.team || assignedTeam,
        designation: emp.role || (orgTemplate === 'institution' ? 'Teacher' : 'Senior Software Engineer'),
        role: mappedRole,
        managerId: emp.managerId || assignedMgrId || undefined,
        managerName: managerObj?.name || undefined,
        lineManager: managerObj ? {
          name: managerObj.name,
          username: managerObj.email.split('@')[0],
          avatar: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
          designation: managerObj.role,
        } : undefined,
        joiningDate: emp.joinDate || existingEmp?.joiningDate || new Date().toISOString().substring(0, 10),
        employmentType: emp.employmentType || 'Full-time',
        location: emp.officeName || existingEmp?.location || '',
        officeName: emp.officeName || existingEmp?.officeName || '',
        skills: isCurrentLoggedInUser ? ['Strategy', 'Leadership', 'Management'] : ['Onboarding Complete'],
        shiftTiming: {
          shiftId: matchedShift?.id || 'sh-1',
          shiftName: matchedShift?.name || 'General Day Shift',
          startTime: matchedShift?.startTime || '09:00',
          endTime: matchedShift?.endTime || '18:00',
          graceMinutes: matchedShift?.gracePeriodMinutes || 15,
        },
        bankDetails: isCurrentLoggedInUser ? {
          accountNumber: '•••• •••• 8821',
          ifscCode: 'HDFC000182',
          bankName: 'HDFC Bank',
        } : {
          accountNumber: '—',
          ifscCode: '—',
          bankName: '—',
        },
        salaryDetails: {
          basic: 65000,
          hra: 25000,
          specialAllowance: 10000,
          pfDeduction: 1800,
          taxDeduction: 5000,
          netPayable: 93200,
        },
        emergencyContact: {
          name: '',
          relation: '',
          phone: '',
        },
        status: isCurrentLoggedInUser ? 'Active' : ((existingEmp?.status || 'Active') as 'Active' | 'Onboarding' | 'On Leave' | 'Terminated'),
        isActivated: isCurrentLoggedInUser || existingEmp?.isActivated || false,
        accountStatus: isCurrentLoggedInUser || existingEmp?.isActivated ? 'Activated' : 'Not Activated',
        hasCompletedProfile: isCurrentLoggedInUser || existingEmp?.hasCompletedProfile || false,
      };
    });

    const hasAdminInList = updatedEmployees.some(
      (e) =>
        (state.currentPersona?.email && e.email?.toLowerCase() === state.currentPersona.email.toLowerCase()) ||
        (state.currentPersona?.id && e.id === state.currentPersona.id)
    );

    let finalEmployeesList = [...updatedEmployees];
    if (!hasAdminInList && state.currentPersona) {
      const adminEmployee: Employee = {
        id: state.currentPersona.id || 'admin_emp_01',
        employeeId: 'EMP001',
        name: state.currentPersona.name || 'Organization Administrator',
        fullName: state.currentPersona.name || 'Organization Administrator',
        email: state.currentPersona.email || 'admin@organization.com',
        password: state.currentPersona.password || 'password123',
        phone: '+1 (555) 019-2834',
        avatar: state.currentPersona.avatar || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
        department: (finalDepartments[0] || '') as any,
        team: finalTeams[0] || '',
        designation: state.currentPersona.designation || 'Administrator / Founder',
        role: 'super_admin',
        joiningDate: new Date().toISOString().substring(0, 10),
        employmentType: 'Full-time',
        location: '',
        officeName: '',
        skills: ['Leadership', 'Operations', 'Strategy'],
        shiftTiming: {
          shiftId: shifts[0]?.id || 'sh-1',
          shiftName: shifts[0]?.name || 'General Day Shift',
          startTime: shifts[0]?.startTime || '09:00',
          endTime: shifts[0]?.endTime || '18:00',
          graceMinutes: 15,
        },
        bankDetails: {
          accountNumber: '•••• •••• 8821',
          ifscCode: 'HDFC000182',
          bankName: 'HDFC Bank',
        },
        salaryDetails: {
          basic: 100000,
          hra: 40000,
          specialAllowance: 20000,
          pfDeduction: 1800,
          taxDeduction: 10000,
          netPayable: 148200,
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
      finalEmployeesList = [adminEmployee, ...finalEmployeesList];
    }

    // Persist to backend first — only update UI context when creates succeed
    try {
      const results = await Promise.allSettled([
        ...finalDepartments.map((dept) =>
          api.org.createDepartment({
            name: dept,
            code: `${dept.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'DEP'}${Math.floor(10 + Math.random() * 90)}`,
          })
        ),
        ...finalEmployeesList.map((emp) => {
          const [first, ...rest] = (emp.name || '').split(' ');
          const lastName = rest.join(' ') || first;
          return api.identity.createEmployee({
            employeeCode: emp.employeeId || `EMP${Math.floor(100 + Math.random() * 900)}`,
            firstName: first,
            lastName: lastName,
            email: emp.email,
            phone: emp.phone,
            department: emp.department,
            designation: emp.designation,
            role: toApiAuthRole(emp.role),
            location: emp.location,
            dateOfJoining: emp.joiningDate,
          });
        }),
      ]);

      const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failures.length > 0) {
        const firstMsg =
          failures[0].reason?.message ||
          (typeof failures[0].reason === 'string' ? failures[0].reason : 'One or more creates failed');
        triggerToast({
          title: 'Setup partially failed',
          message: `${failures.length} item(s) could not be saved: ${firstMsg}`,
          type: 'error',
        });
        return;
      }
    } catch (err: any) {
      console.warn('[EmployeeSetupWizard] Backend persistence failed:', err);
      triggerToast({
        title: 'Setup failed',
        message: err?.message || 'Unable to persist organization setup. Please try again.',
        type: 'error',
      });
      return;
    }

    // Update global state only after successful persistence
    const activeShift = shifts.find((s) => s.id === selectedShiftId) || shifts[0];
    const resolvedWorkingDays = activeShift?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    updateState((prev) => ({
      ...prev,
      employees: finalEmployeesList,
      organization: {
        ...prev.organization,
        workingDays: resolvedWorkingDays,
        workingHours: {
          start: activeShift?.startTime || '09:00',
          end: activeShift?.endTime || '18:00',
        },
      },
      customOptions: {
        ...prev.customOptions,
        designations: finalDesignations,
        departments: finalDepartments.length > 0 ? finalDepartments : prev.customOptions?.departments || [],
        teams: finalTeams.length > 0 ? finalTeams : prev.customOptions?.teams || [],
        shifts: shifts,
        attendanceSettings: {
          ...prev.customOptions?.attendanceSettings,
          workDayStartTime: activeShift?.startTime || '09:00 AM',
          workDayEndTime: activeShift?.endTime || '06:00 PM',
          workingDays: resolvedWorkingDays,
        } as any,
      },
    }));

    triggerToast({
      title: 'Organization Setup Complete',
      message: 'Job roles, permissions, departments, employees, and org hierarchy synchronized successfully with backend.',
      type: 'system',
    });

    if (onComplete) onComplete();
  };

  return (
    <div className="h-screen w-full bg-white flex flex-col font-sans text-slate-900 overflow-hidden">
      {/* Top Header */}
      <header className="w-full border-b border-slate-100 bg-white px-8 py-5 flex items-center justify-between shrink-0">
        <div className="font-extrabold text-slate-900 text-lg tracking-tight">Setup Organization</div>
      </header>

      {/* Split Main Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        
        {/* Left Typography Side */}
        <div className="w-full lg:w-[40%] bg-white p-8 md:p-12 lg:p-16 flex flex-col justify-between overflow-y-auto shrink-0 border-r border-slate-100">
          
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-2 rounded-sm transition-all ${
                    i <= step ? 'w-7 bg-blue-600' : 'w-7 bg-slate-200'
                  }`}
                />
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pt-1">
              STEP {step} OF 4
            </p>
          </div>

          <div className="space-y-3.5 max-w-md">
            {step === 1 && (
              <>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 leading-snug tracking-tight">
                  Define job titles & permissions
                </h1>
                <p className="text-slate-500 text-sm leading-relaxed pt-1">
                  {orgTemplate === 'institution'
                    ? 'Manage standard institution roles: Teacher, Staff, Management, and HR.'
                    : 'Manage standard company roles: Manager, Admin, HR, and Employee.'}
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 leading-snug tracking-tight">
                  {orgTemplate === 'institution' ? 'Time to add your staff & faculty' : 'Time to add your employees'}
                </h1>
                <p className="text-slate-500 text-sm leading-relaxed pt-1">
                  {orgTemplate === 'institution'
                    ? 'Invite your teachers, staff, management, and HR to join the workspace and assign designations.'
                    : 'Invite your team members to join the workspace and assign their designations.'}
                </p>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 leading-snug tracking-tight">
                  Structure departments
                </h1>
                <p className="text-slate-500 text-sm leading-relaxed pt-1">
                  {orgTemplate === 'institution'
                    ? 'Create academic and operational departments, assign heads of department, and allocate staff members.'
                    : 'Create company departments, assign managers, and allocate team members.'}
                </p>
              </>
            )}

            {step === 4 && (
              <>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 leading-snug tracking-tight">
                  Setup organization chart
                </h1>
                <p className="text-slate-500 text-sm leading-relaxed pt-1">
                  {orgTemplate === 'institution'
                    ? "Organize reporting lines and visualize your school's live organizational hierarchy tree."
                    : "Organize reporting lines and visualize your company's live organizational hierarchy tree."}
                </p>
              </>
            )}

            <div className="flex gap-3.5 pt-6">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((prev) => Math.max(1, prev - 1) as any)}
                  className="px-7 py-3 rounded-xl border border-slate-300 text-slate-900 font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Go Back
                </button>
              )}
              
              <button
                type="button"
                onClick={() => {
                  if (step < 4) {
                    setStep((prev) => (prev + 1) as any);
                  } else {
                    handleFinishSetup();
                  }
                }}
                className="px-9 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md flex items-center justify-center"
              >
                <span>
                  {step === 4 ? 'Finish Setup' : 'Continue'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Area (Seamless full stretch without the heavy gray margins) */}
        <div className="flex-1 bg-[#f8fafc] p-6 md:p-10 lg:p-14 overflow-y-auto custom-scrollbar">
          <div className="max-w-2xl mx-auto w-full pb-12">
            
            {/* STEP 1: Job Role Creator & Permission Levels (Comes First) */}
            {step === 1 && (
              <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-2xs space-y-5 animate-fade-in">
                {/* Header */}
                <div className="border-b border-slate-100 pb-3.5">
                  <h3 className="font-extrabold text-slate-900 text-base tracking-tight">Job Creator</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Create job titles and define permissions for each role.</p>
                </div>
                
                {/* Compact Creation Bar */}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  {/* Job Title Input */}
                  <input
                    type="text"
                    value={newJobTitle}
                    onChange={(e) => setNewJobTitle(e.target.value)}
                    placeholder={
                      orgTemplate === 'institution'
                        ? 'e.g. Mathematics Teacher, Lab Assistant, Principal, HR Coordinator'
                        : 'e.g. Senior Software Engineer, Product Designer, Sales Director, HR Specialist'
                    }
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 font-medium bg-white transition-all"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateJobRole(); } }}
                  />

                  {/* Permission Selector */}
                  <select
                    value={newJobPermission}
                    onChange={(e) => setNewJobPermission(e.target.value as any)}
                    className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-slate-900 bg-white cursor-pointer"
                  >
                    <option value="Admin">Admin (Access to Everything)</option>
                    <option value="HR">HR (Access to Everyone)</option>
                    <option value="Manager">Manager (Access to Own Team Only)</option>
                    <option value="Employee">Employee (Standard Access)</option>
                  </select>

                  {/* Add Job Role Button */}
                  <button
                    type="button"
                    onClick={handleCreateJobRole}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs transition-all duration-200 hover:scale-[1.02] cursor-pointer shrink-0 flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Job</span>
                  </button>
                </div>

                {/* Reworked Clean Job List (No icon, No badges, sleek tight rows) */}
                <div className="pt-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                    Created Job Roles ({jobRoles.length})
                  </div>

                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 overflow-hidden">
                    {jobRoles.map((job) => (
                      <div
                        key={job.id}
                        className="p-3.5 bg-white hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 truncate">{job.title}</div>
                          <div className="text-[11px] text-slate-400 truncate">{job.description}</div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] text-slate-500 font-medium">
                            {job.title}
                          </span>
                          {jobRoles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveJobRole(job.id)}
                              className="text-slate-400 hover:text-red-500 p-1 rounded-lg transition-colors cursor-pointer"
                              title="Remove Job Role"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Add New Employee / Staff (Matching AddEmployeeModal) */}
            {step === 2 && (
              <div className="bg-white rounded-3xl p-7 md:p-9 border border-slate-200/80 shadow-2xs space-y-6 animate-fade-in">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">
                    {orgTemplate === 'institution' ? 'Add Staff & Faculty' : 'Add New Employee'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {orgTemplate === 'institution'
                      ? 'Enroll a faculty or staff member with full credentials, department, and work schedule'
                      : 'Onboard a new employee with official credentials, role, and department'}
                  </p>
                </div>

                <form onSubmit={handleAddEmployee} className="space-y-4">
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newEmployeeName}
                      onChange={(e) => setNewEmployeeName(e.target.value)}
                      placeholder={orgTemplate === 'institution' ? 'e.g. Dr. Angela Davis' : 'e.g. Alex Mercer'}
                      className="w-full rounded-2xl border border-slate-200 px-4.5 py-3.5 text-xs outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 font-medium bg-white transition-all"
                    />
                  </div>

                  {/* Email & Phone Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Official Email <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={newEmployeeEmail}
                        onChange={(e) => setNewEmployeeEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full rounded-2xl border border-slate-200 px-4.5 py-3.5 text-xs outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 font-medium bg-white transition-all font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Phone Number (10 Digits)
                      </label>
                      <input
                        type="tel"
                        maxLength={10}
                        value={newEmployeePhone}
                        onChange={(e) => setNewEmployeePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="e.g. 9876543210"
                        className="w-full rounded-2xl border border-slate-200 px-4.5 py-3.5 text-xs outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 font-medium bg-white transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Designation & Department Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          {orgTemplate === 'institution' ? 'Faculty Title / Role' : 'Job Title / Designation'} <span className="text-rose-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomRole(!isCustomRole);
                            if (!isCustomRole) setNewEmployeeRole('');
                            else setNewEmployeeRole(availableDesignations[0] || '');
                          }}
                          className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                        >
                          {isCustomRole ? 'Choose from List' : '+ Custom Role'}
                        </button>
                      </div>
                      {isCustomRole ? (
                        <input
                          type="text"
                          required
                          value={newEmployeeRole}
                          onChange={(e) => setNewEmployeeRole(e.target.value)}
                          placeholder={orgTemplate === 'institution' ? 'e.g. Professor' : 'e.g. Senior Software Engineer'}
                          className="w-full rounded-2xl border border-blue-500 px-4.5 py-3.5 text-xs outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 font-medium bg-white transition-all"
                          autoFocus
                        />
                      ) : (
                        <select
                          value={newEmployeeRole}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setIsCustomRole(true);
                              setNewEmployeeRole('');
                            } else {
                              setNewEmployeeRole(e.target.value);
                            }
                          }}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-xs font-medium outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 bg-white cursor-pointer transition-all"
                        >
                          {availableDesignations.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                          <option value="__custom__">+ Custom Role / Designation...</option>
                        </select>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Department / Area <span className="text-rose-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomDept(!isCustomDept);
                            if (!isCustomDept) setNewEmployeeDept('');
                            else setNewEmployeeDept(availableDepartments[0] || '');
                          }}
                          className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                        >
                          {isCustomDept ? 'Choose from List' : '+ Custom Dept'}
                        </button>
                      </div>
                      {isCustomDept ? (
                        <input
                          type="text"
                          required
                          value={newEmployeeDept}
                          onChange={(e) => setNewEmployeeDept(e.target.value)}
                          placeholder={orgTemplate === 'institution' ? 'e.g. Faculty, Administration' : 'e.g. Development, Management'}
                          className="w-full rounded-2xl border border-blue-500 px-4.5 py-3.5 text-xs outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 font-medium bg-white transition-all"
                          autoFocus
                        />
                      ) : (
                        <select
                          value={newEmployeeDept}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setIsCustomDept(true);
                              setNewEmployeeDept('');
                            } else {
                              setNewEmployeeDept(e.target.value);
                            }
                          }}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-xs font-medium outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 bg-white cursor-pointer transition-all"
                        >
                          {availableDepartments.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                          <option value="__custom__">+ Custom Department...</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Office & Manager Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          {orgTemplate === 'institution' ? 'Campus / Wing' : 'Office Location'}
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAddOfficeModal(true)}
                          className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          + Add Office
                        </button>
                      </div>
                      <select
                        value={newEmployeeOffice}
                        onChange={(e) => setNewEmployeeOffice(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-xs font-medium outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 bg-white cursor-pointer transition-all"
                      >
                        {offices.length === 0 ? (
                          <option value="">No office locations added yet</option>
                        ) : (
                          offices.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))
                        )}
                      </select>
                      {state.organization?.officeLocation?.address && (
                        <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1 leading-snug">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2" title={state.organization.officeLocation.address}>
                            {state.organization.officeLocation.address}
                          </span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        {orgTemplate === 'institution' ? 'Staff Lead / HOD' : 'Reporting Line Manager'}
                      </label>
                      <select
                        value={newEmployeeManagerId}
                        onChange={(e) => setNewEmployeeManagerId(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-xs font-medium outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 bg-white cursor-pointer transition-all"
                      >
                        <option value="">(None - Top Level)</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.role || 'Staff'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Joining Date & Employment Type Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Joining Date
                      </label>
                      <input
                        type="date"
                        value={newEmployeeJoinDate}
                        onChange={(e) => setNewEmployeeJoinDate(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-medium outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 [color-scheme:light] bg-white transition-all cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Employment Type
                      </label>
                      <select
                        value={newEmployeeEmploymentType}
                        onChange={(e) => setNewEmployeeEmploymentType(e.target.value as any)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-xs font-medium outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 bg-white cursor-pointer transition-all"
                      >
                        <option value="Full-time">Full-time Standard</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract / Consultant</option>
                      </select>
                    </div>
                  </div>

                  {/* Work Shift Schedule & Login Password Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Work Shift Schedule <span className="text-rose-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAddShiftModal(true)}
                          className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                        >
                          + Create Shift
                        </button>
                      </div>
                      <select
                        value={selectedShiftId}
                        onChange={(e) => setSelectedShiftId(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-xs font-medium outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 bg-white cursor-pointer transition-all"
                      >
                        {shifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.startTime} — {s.endTime})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Initial Login Password
                      </label>
                      <input
                        type="password"
                        value={newEmployeePassword}
                        onChange={(e) => setNewEmployeePassword(e.target.value)}
                        placeholder="Default: Welcome@123"
                        className="w-full rounded-2xl border border-slate-200 px-4.5 py-3.5 text-xs outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 font-medium bg-white transition-all"
                      />
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs transition-all duration-200 hover:scale-[1.01] cursor-pointer shadow-md flex items-center justify-center gap-2 mt-3"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>{orgTemplate === 'institution' ? 'Add Staff Member' : 'Add Employee'}</span>
                  </button>
                </form>

                {/* Clean Professional Workspace Members List */}
                {employees.length > 0 && (
                  <div className="pt-5 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Enrolled Members ({employees.length})
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {employees.map((emp) => {
                        const shiftObj = shifts.find((s) => s.id === emp.shiftId);

                        return (
                          <div
                            key={emp.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50/70 hover:bg-slate-100/80 rounded-2xl border border-slate-100 transition-all text-xs gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold flex items-center justify-center text-xs shrink-0">
                                {emp.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                                  <span>{emp.name}</span>
                                  {emp.employmentType && (
                                    <span className="text-[9px] font-semibold text-slate-500 bg-slate-200/70 px-1.5 py-0.2 rounded">
                                      {emp.employmentType}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {emp.email} {emp.phone ? `• ${emp.phone}` : ''}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white text-slate-700 border border-slate-200/80">
                                {emp.role}
                              </span>
                              {emp.department && (
                                <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                                  {emp.department}
                                </span>
                              )}
                              {shiftObj && (
                                <span className="px-2 py-1 rounded-lg text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/60 hidden md:inline-block">
                                  {shiftObj.name}
                                </span>
                              )}
                              {employees.length > 1 &&
                                !(
                                  (state.currentPersona?.email &&
                                    emp.email?.toLowerCase() === state.currentPersona.email.toLowerCase()) ||
                                  (state.currentPersona?.id && emp.id === state.currentPersona.id)
                                ) && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEmployee(emp.id)}
                                  className="text-slate-400 hover:text-red-500 p-1.5 transition-colors cursor-pointer rounded-lg hover:bg-red-50"
                                  title="Remove Member"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: Departments & Teams Structure */}
            {step === 3 && (
              <div className="space-y-6 animate-fade-in">
                
                {/* Title & Creation Header */}
                <div className="bg-white rounded-3xl p-7 md:p-9 border border-slate-200/80 shadow-2xs space-y-5">
                  <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">
                        {itemType === 'department' ? 'Create Department' : 'Create Team / Squad'}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {itemType === 'department'
                          ? 'Add departments to structure your organization and reporting hierarchy.'
                          : 'Add functional teams, project squads, or working groups within your organization.'}
                      </p>
                    </div>

                    {/* Department vs Team Switcher for Companies */}
                    <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 shrink-0">
                      <button
                        type="button"
                        onClick={() => setItemType('department')}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          itemType === 'department'
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        <Building2 className="w-3.5 h-3.5" /> Department
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemType('team')}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          itemType === 'team'
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" /> Team / Squad
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* Input */}
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder={
                        itemType === 'department'
                          ? 'e.g. Operations, Engineering, Sales, Finance, Human Resources'
                          : 'e.g. Frontend Core Team, Backend API Squad, Cloud Infrastructure, Growth Marketing'
                      }
                      className="flex-1 rounded-2xl border border-slate-200 px-4.5 py-3.5 text-xs outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 font-medium bg-white transition-all"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateItem(); } }}
                    />

                    {/* Add Button */}
                    <button
                      type="button"
                      onClick={handleCreateItem}
                      className="px-7 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs transition-all duration-200 hover:scale-[1.02] cursor-pointer shrink-0 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add {itemType === 'department' ? 'Department' : 'Team'}</span>
                    </button>
                  </div>
                </div>

                {/* Minimalist Structured Cards */}
                {items.length === 0 ? (
                  <div className="bg-white rounded-3xl p-8 border border-dashed border-slate-200 text-center space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-bold text-slate-700">No Departments or Teams Added Yet</div>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Use the field above to add departments and functional teams for your company.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1.5 custom-scrollbar">
                    {items.map((item) => (
                      <DepartmentTeamCard
                        key={item.id}
                        item={item}
                        employees={employees}
                        onRemove={handleRemoveItem}
                        onUpdateManager={handleUpdateItemManager}
                        onToggleMember={handleToggleItemMember}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Setup Organization Chart (Visual Interactive Tree & Hierarchy) */}
            {step === 4 && (
              <div className="bg-white rounded-3xl p-7 md:p-9 border border-slate-200/80 shadow-2xs space-y-6 animate-fade-in">
                {/* Header with View Mode Switcher */}
                <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">Organization Chart</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Visualize your hierarchy and configure direct reporting lines.</p>
                  </div>

                  {/* Toggle: Tree vs Roster */}
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 shrink-0">
                    <button
                      type="button"
                      onClick={() => setChartViewMode('tree')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        chartViewMode === 'tree'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      <ListTree className="w-3.5 h-3.5" /> Org Tree
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartViewMode('roster')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        chartViewMode === 'roster'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      <GitFork className="w-3.5 h-3.5" /> Roster
                    </button>
                  </div>
                </div>

                {/* Empty State when no employees */}
                {employees.length === 0 ? (
                  <div className="py-12 px-4 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <ListTree className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-slate-800">No employees added yet</div>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Go back to Step 2 to invite team members before organizing the hierarchy chart.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                      Go to Step 2 (Invite Employees)
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Tree View Mode */}
                    {chartViewMode === 'tree' && (
                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1.5 custom-scrollbar">
                        <OrgHierarchyTree
                          employees={employees}
                          managerAssignments={managerAssignments}
                          onUpdateManager={(empId, managerId) =>
                            setManagerAssignments((prev) => ({ ...prev, [empId]: managerId }))
                          }
                          departments={items}
                        />
                      </div>
                    )}

                    {/* Roster View Mode */}
                    {chartViewMode === 'roster' && (
                      <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1.5 custom-scrollbar">
                        {employees.map((emp) => {
                          const assignedDept = items.find(
                            (it) => it.type === 'department' && (it.memberIds.includes(emp.id) || it.managerId === emp.id)
                          )?.name || emp.department || 'Development';

                          return (
                            <div
                              key={emp.id}
                              className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-800 font-bold flex items-center justify-center text-xs">
                                  {emp.name.charAt(0)}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-900">{emp.name}</div>
                                  <div className="text-[11px] text-slate-400">
                                    {emp.role} • <span className="font-semibold text-slate-700">{assignedDept}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="w-full sm:w-52">
                                <select
                                  value={managerAssignments[emp.id] || ''}
                                  onChange={(e) => setManagerAssignments((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-slate-900 bg-white cursor-pointer"
                                >
                                  <option value="">None (Top Level)</option>
                                  {employees.filter((m) => m.id !== emp.id).map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name} ({m.role})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Onboarding Create Shift Modal */}
      {showAddShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Create Work Shift</h3>
              <button
                type="button"
                onClick={() => setShowAddShiftModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer text-lg font-bold leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateShift} className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Shift Name (e.g. Morning Shift, Flexible Shift)"
                  value={newShiftName}
                  onChange={(e) => setNewShiftName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-900 font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="time"
                    value={newShiftStart}
                    onChange={(e) => setNewShiftStart(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <input
                    type="time"
                    value={newShiftEnd}
                    onChange={(e) => setNewShiftEnd(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={newShiftGrace}
                  onChange={(e) => setNewShiftGrace(Number(e.target.value))}
                  placeholder="Grace Period (Minutes)"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-slate-900"
                />
              </div>

              <div className="space-y-2 pt-1">
                <p className="text-xs font-bold text-slate-700">Working Days</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEK_DAYS.map((d) => {
                    const isSelected = newShiftDays.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            if (newShiftDays.length > 1) {
                              setNewShiftDays(newShiftDays.filter((k) => k !== d.key));
                            }
                          } else {
                            setNewShiftDays(WEEK_DAYS.filter((k) => newShiftDays.includes(k.key) || k.key === d.key).map((k) => k.key));
                          }
                        }}
                        className={`py-2 text-center rounded-xl border font-bold text-xs transition-all cursor-pointer ${
                          isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddShiftModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer shadow-xs"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Onboarding Create Office Location Modal */}
      {showAddOfficeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-4 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {orgTemplate === 'institution' ? 'Add Campus Location / Wing' : 'Add Office Location'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddOfficeModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer text-lg font-bold leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateOffice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Location Name / Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={orgTemplate === 'institution' ? 'e.g. Science Wing - Campus A' : 'e.g. North Tower, Suite 400'}
                  value={newOfficeName}
                  onChange={(e) => setNewOfficeName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-900 font-medium"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddOfficeModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer shadow-xs"
                >
                  Save Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
