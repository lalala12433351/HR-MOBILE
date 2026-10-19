'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MapPin,
  X,
  Users,
  ChevronDown,
  Mail,
  Shield,
  GitFork,
  Pencil,
  Check,
  ListTree,
  Lock,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { AppState } from '../../services/store';
import { Employee } from '../../types';
import { api } from '../../services/apiClient';
import { mapApiEmployee } from '../../services/backendSync';
import { EmployeeProfileCardModal } from './hrms/EmployeeProfileCardModal';
import { isInstitutionMode } from '@/utils/organizationMode';
import {
  SlideOverDrawer,
  slideOverBodyClass,
  slideOverCancelClass,
  slideOverFooterClass,
  slideOverPrimaryClass,
} from '@/components/common/SlideOverDrawer';

export interface OrgNode {
  id: string;
  kind?: 'person' | 'team' | 'unassigned';
  employeeId?: string;
  name: string;
  role: string;
  department: string;
  office: string;
  avatar: string;
  email?: string;
  phone?: string;
  status?: string;
  managerId?: string;
  managerName?: string;
  level: number;
  children?: OrgNode[];
}

type TeamRecord = {
  id: string;
  name: string;
  departmentId?: string;
  departmentName?: string | null;
  leadEmployeeId?: string | null;
  leadName?: string | null;
};

const APEX_TITLE_RE = /\b(ceo|chief executive|founder|president|managing director)\b/i;

function isLeadershipEmployee(emp: Employee): boolean {
  if (emp.role === 'super_admin') return true;
  return APEX_TITLE_RE.test(`${emp.designation || ''} ${emp.role || ''}`);
}

function resolveSavedManagerId(emp: Employee, roster: Employee[]): string {
  let mgrKey = emp.managerId || '';
  if (!mgrKey && emp.lineManager?.name) {
    const mgr = roster.find((m) => m.name.toLowerCase() === emp.lineManager!.name.toLowerCase());
    if (mgr) mgrKey = mgr.id;
  }
  if (mgrKey && mgrKey !== emp.id && roster.some((e) => e.id === mgrKey)) return mgrKey;
  return '';
}

interface OrgChartModuleProps {
  state?: AppState;
  onUpdateState?: (updater: (prev: AppState) => AppState) => void;
  onSelectEmployee?: (employee: Employee) => void;
}

const DEPT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Management: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  Development: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  HR: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  Sales: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  Design: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  Finance: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  Operations: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  Faculty: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  Team: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
};

// Role hierarchy rank calculator (1 = CEO/Founder, 5 = IC)
const getRoleRank = (emp: Employee): number => {
  const title = (emp.designation || emp.role || '').toLowerCase();
  if (
    title.includes('ceo') ||
    title.includes('chief executive') ||
    title.includes('founder') ||
    title.includes('president') ||
    title.includes('managing director') ||
    emp.role === 'super_admin'
  ) return 1;
  if (
    title.includes('director') ||
    title.includes('vp') ||
    title.includes('vice president') ||
    title.includes('cto') ||
    title.includes('coo') ||
    title.includes('cfo') ||
    title.includes('cpo')
  ) return 2;
  if (
    title.includes('head') ||
    title.includes('lead') ||
    title.includes('manager') ||
    title.includes('admin')
  ) return 3;
  if (title.includes('senior') || title.includes('principal') || title.includes('architect')) return 4;
  return 5;
};

export const OrgChartModule: React.FC<OrgChartModuleProps> = ({ state, onUpdateState, onSelectEmployee }) => {
  const [viewMode, setViewMode] = useState<'tree' | 'plan'>('tree');
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);

  // Permission Check: Only HR and Super Admin can edit org chart
  const currentRole = state?.currentPersona?.role || 'employee';
  const designationLower = (state?.currentPersona?.designation || '').toLowerCase();
  const isInstitution = isInstitutionMode(state?.organization, state?.currentPersona);
  const canEditOrgChart =
    currentRole === 'super_admin' ||
    currentRole === 'hr_manager' ||
    (currentRole as string) === 'hr' ||
    designationLower.includes('ceo') ||
    designationLower.includes('chief executive') ||
    designationLower.includes('vp of human resources') ||
    designationLower.includes('hr director');

  // Edit Org Chart Drawer / Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [editManagerId, setEditManagerId] = useState<string>('');
  const [editDesignation, setEditDesignation] = useState<string>('');
  const [editDepartment, setEditDepartment] = useState<string>('');
  const [editOffice, setEditOffice] = useState<string>('');
  const [editOffices, setEditOffices] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState<string>('Active');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const employees = useMemo(() => state?.employees || [], [state?.employees]);
  const teamRecords = useMemo<TeamRecord[]>(
    () => ((state?.customOptions as any)?.teamRecords || []) as TeamRecord[],
    [state?.customOptions]
  );
  const orgName = state?.organization?.name || 'Workspace';
  const didSyncReporting = React.useRef(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Available departments in the workspace
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((emp) => {
      if (emp.department) set.add(emp.department);
    });
    return ['All', ...Array.from(set)];
  }, [employees]);

  const editingEmp = useMemo(
    () => employees.find((e) => e.id === editingEmpId) || null,
    [employees, editingEmpId]
  );

  const designationOptions = useMemo(() => {
    const set = new Set<string>();
    (state?.customOptions?.designations || []).forEach((d: string) => {
      if (d && d.trim()) set.add(d.trim());
    });
    if (editingEmp?.designation?.trim()) set.add(editingEmp.designation.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [state?.customOptions?.designations, editingEmp]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    (state?.customOptions?.departments || []).forEach((d: string) => {
      if (d && d.trim()) set.add(d.trim());
    });
    if (editingEmp?.department?.trim()) set.add(editingEmp.department.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [state?.customOptions?.departments, editingEmp]);

  // Build tree from saved reporting_manager_id, then wrap reports into team groups.
  const orgTrees = useMemo<OrgNode[]>(() => {
    if (employees.length === 0) return [];

    const roster =
      selectedDept === 'All' ? employees : employees.filter((e) => e.department === selectedDept);
    if (roster.length === 0) return [];

    const placeholderAvatar =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

    const employeeToNode = (emp: Employee, lvl: number, children?: OrgNode[]): OrgNode => ({
      id: emp.id,
      kind: 'person',
      employeeId: emp.employeeId,
      name: emp.name,
      role: emp.designation || 'Team Member',
      department: emp.department || 'General',
      office: emp.officeName || emp.location || '',
      avatar: emp.avatar || placeholderAvatar,
      email: emp.email,
      phone: emp.phone,
      status: emp.status || 'Active',
      managerId: emp.managerId,
      managerName: emp.managerName,
      level: lvl,
      children: children && children.length > 0 ? children : undefined,
    });

    const childrenMap = new Map<string, Employee[]>();
    roster.forEach((emp) => {
      const mgrKey = resolveSavedManagerId(emp, roster);
      if (mgrKey) {
        if (!childrenMap.has(mgrKey)) childrenMap.set(mgrKey, []);
        childrenMap.get(mgrKey)!.push(emp);
      }
    });

    const visited = new Set<string>();
    const buildSubTree = (emp: Employee, lvl: number): OrgNode => {
      visited.add(emp.id);
      const directReports = (childrenMap.get(emp.id) || []).filter((r) => !visited.has(r.id));
      const childNodes = directReports.map((r) => buildSubTree(r, lvl + 1));
      return employeeToNode(emp, lvl, childNodes);
    };

    const teamKeyFor = (emp: Employee | undefined) => {
      if (!emp) return '';
      if (emp.teamId) return `id:${emp.teamId}`;
      if (emp.team) return `name:${emp.team.trim().toLowerCase()}`;
      return '';
    };

    const wrapWithTeams = (node: OrgNode): OrgNode => {
      if (node.kind === 'team' || node.kind === 'unassigned') {
        return { ...node, children: node.children?.map(wrapWithTeams) };
      }
      const wrappedKids = (node.children || []).map(wrapWithTeams);
      const byTeam = new Map<string, OrgNode[]>();
      const unteamed: OrgNode[] = [];
      for (const child of wrappedKids) {
        if (child.kind !== 'person') {
          unteamed.push(child);
          continue;
        }
        const emp = roster.find((e) => e.id === child.id);
        const key = teamKeyFor(emp);
        if (!key) {
          unteamed.push(child);
          continue;
        }
        if (!byTeam.has(key)) byTeam.set(key, []);
        byTeam.get(key)!.push(child);
      }

      const usedTeamIds = new Set<string>();
      const teamNodes: OrgNode[] = [];
      for (const [key, members] of byTeam) {
        const rawId = key.startsWith('id:') ? key.slice(3) : '';
        const rawName = key.startsWith('name:') ? key.slice(5) : '';
        const rec =
          teamRecords.find((t) => t.id === rawId) ||
          teamRecords.find((t) => t.name.trim().toLowerCase() === rawName);
        if (rec?.id) usedTeamIds.add(rec.id);
        const teamName = rec?.name || members[0]?.department || 'Team';
        const leadId = rec?.leadEmployeeId ? String(rec.leadEmployeeId) : '';
        members.sort((a, b) => {
          if (leadId && a.id === leadId) return -1;
          if (leadId && b.id === leadId) return 1;
          return a.name.localeCompare(b.name);
        });
        teamNodes.push({
          id: `team:${rec?.id || key}`,
          kind: 'team',
          name: teamName,
          role: 'Team',
          department: rec?.departmentName || members[0]?.department || node.department,
          office: node.office,
          avatar: '',
          level: node.level + 1,
          children: members,
        });
      }

      for (const rec of teamRecords) {
        if (usedTeamIds.has(rec.id)) continue;
        if (String(rec.leadEmployeeId || '') !== String(node.id)) continue;
        teamNodes.push({
          id: `team:${rec.id}`,
          kind: 'team',
          name: rec.name,
          role: 'Team',
          department: rec.departmentName || node.department,
          office: node.office,
          avatar: '',
          level: node.level + 1,
          children: undefined,
        });
      }

      const nextChildren = [...teamNodes, ...unteamed];
      return { ...node, children: nextChildren.length ? nextChildren : undefined };
    };

    const roots = roster.filter((emp) => !resolveSavedManagerId(emp, roster));
    const leadershipRoots = roots.filter(isLeadershipEmployee);
    const otherRoots = roots.filter((emp) => !isLeadershipEmployee(emp));
    const orderedRoots = [...leadershipRoots, ...otherRoots.filter((e) => leadershipRoots.length === 0)];

    const trees: OrgNode[] = (leadershipRoots.length > 0 ? leadershipRoots : orderedRoots).map((r) =>
      wrapWithTeams(buildSubTree(r, 1))
    );

    const leftover =
      leadershipRoots.length > 0
        ? otherRoots.filter((e) => !visited.has(e.id))
        : roster.filter((e) => !visited.has(e.id));
    leftover.forEach((emp) => {
      if (!visited.has(emp.id)) {
        trees.push(wrapWithTeams(buildSubTree(emp, 1)));
      }
    });

    const unassignedPeople = trees.filter((t) => t.kind !== 'team' && !isLeadershipEmployee(
      roster.find((e) => e.id === t.id) || ({} as Employee)
    ) && t.kind !== 'unassigned' && !t.managerId && t.kind === 'person' && !leadershipRoots.some((l) => l.id === t.id) && leadershipRoots.length > 0);

    if (unassignedPeople.length > 0) {
      const assigned = new Set(unassignedPeople.map((n) => n.id));
      const remaining = trees.filter((t) => !assigned.has(t.id));
      remaining.push({
        id: 'group:unassigned',
        kind: 'unassigned',
        name: 'Unassigned',
        role: 'No manager yet',
        department: '',
        office: '',
        avatar: '',
        level: 1,
        children: unassignedPeople,
      });
      return remaining;
    }

    return trees.length > 0 ? trees : roster.slice(0, 1).map((r) => wrapWithTeams(buildSubTree(r, 1)));
  }, [employees, selectedDept, teamRecords]);

  // Handle Changing Manager / Updating Employee Hierarchy in Store
  const handleUpdateReportingManager = async (employeeId: string, newManagerId: string) => {
    if (!canEditOrgChart) {
      showToast('Permission denied. Only HR and Super Admin can edit reporting hierarchy.');
      return;
    }
    if (!onUpdateState) return;

    const targetEmp = employees.find((e) => e.id === employeeId);
    if (!targetEmp) return;

    const managerEmp = employees.find((e) => e.id === newManagerId);

    // Direct synchronous backend API call
    const res = await api.identity.updateEmployee(employeeId, {
      ...targetEmp,
      reportingManagerId: newManagerId || undefined,
      managerId: newManagerId || undefined,
    } as any);

    if (!res.success && res.error) {
      alert(`Failed to update reporting manager on backend: ${res.error.message}`);
      return;
    }

    onUpdateState((prev) => ({
      ...prev,
      employees: prev.employees.map((emp) => {
        if (emp.id === employeeId) {
          return {
            ...emp,
            managerId: newManagerId || undefined,
            managerName: managerEmp ? managerEmp.name : undefined,
            lineManager: managerEmp
              ? {
                  name: managerEmp.name,
                  username: managerEmp.email || managerEmp.name,
                  avatar: managerEmp.avatar || '',
                  designation: managerEmp.designation,
                }
              : undefined,
          };
        }
        return emp;
      }),
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: state?.currentPersona?.name || 'Admin',
          action: 'ORG_CHART_UPDATED',
          entity: 'Employee',
          entityId: employeeId,
          ipAddress: '106.51.72.18',
          details: `Updated reporting manager of ${targetEmp.name} to ${managerEmp ? managerEmp.name : 'Top Level (None)'}`,
        },
        ...prev.auditLogs,
      ],
    }));

    showToast(`Reporting manager for ${targetEmp.name} updated.`);
  };

  // Open Edit Modal for a specific employee
  const handleOpenEditEmp = (emp: Employee) => {
    if (!canEditOrgChart) {
      showToast('Permission denied. Only HR and Super Admin can edit employee roles.');
      return;
    }
    setEditingEmpId(emp.id);
    setEditManagerId(emp.managerId || '');
    setEditDesignation(emp.designation || '');
    setEditDepartment(emp.department || '');
    setEditOffice(emp.officeName || emp.location || (state.customOptions?.offices?.[0] || 'Unassigned'));
    const assigned =
      emp.offices && emp.offices.length > 0
        ? emp.offices.map((o) => o.name).filter(Boolean)
        : emp.officeName || emp.location
          ? [String(emp.officeName || emp.location)]
          : state.customOptions?.offices?.[0]
            ? [state.customOptions.offices[0]]
            : [];
    setEditOffices(assigned);
    setEditStatus(emp.status || 'Active');
    setShowEditModal(true);
  };

  // Save Full Employee Hierarchy Changes
  const handleSaveEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditOrgChart) {
      showToast('Permission denied. Only HR and Super Admin can edit employee roles.');
      return;
    }
    if (!editingEmpId || !onUpdateState) return;

    const targetEmp = employees.find((e) => e.id === editingEmpId);
    if (!targetEmp) return;

    const managerEmp = employees.find((e) => e.id === editManagerId);

    const [first, ...rest] = (targetEmp.name || '').split(' ');
    const lastName = rest.join(' ') || first;

    const selectedOffices =
      editOffices.length > 0 ? editOffices : editOffice.trim() ? [editOffice.trim()] : [];
    const primaryOffice = selectedOffices[0] || editOffice.trim() || targetEmp.officeName;
    const officeRecords = state?.customOptions?.officeRecords || [];
    const officeIds = selectedOffices
      .map((name) => officeRecords.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())?.id)
      .filter(Boolean) as string[];

    // Direct synchronous backend API call
    const res = await api.identity.updateEmployee(editingEmpId, {
      firstName: first,
      lastName: lastName,
      email: targetEmp.email,
      department: editDepartment.trim() || targetEmp.department,
      designation: editDesignation.trim() || targetEmp.designation,
      officeName: primaryOffice,
      location: primaryOffice,
      officeIds,
      officeId: officeIds[0],
      reportingManagerId: editManagerId || undefined,
      managerId: editManagerId || undefined,
      employmentStatus: editStatus || targetEmp.status || 'Active',
      status: editStatus || targetEmp.status || 'Active',
    });

    if (!res.success && res.error) {
      alert(`Failed to update employee in backend: ${res.error.message}`);
      return;
    }

    const updatedEmpRecord = {
      ...targetEmp,
      managerId: editManagerId || undefined,
      managerName: managerEmp ? managerEmp.name : undefined,
      designation: editDesignation.trim() || targetEmp.designation,
      department: (editDepartment.trim() || targetEmp.department) as any,
      officeName: primaryOffice || targetEmp.officeName,
      location: primaryOffice || targetEmp.location,
      officeId: officeIds[0] || targetEmp.officeId,
      officeIds: officeIds.length > 0 ? officeIds : targetEmp.officeIds,
      offices: selectedOffices.map((name, idx) => ({
        id: officeIds[idx] || name,
        name,
        isPrimary: idx === 0,
      })),
      status: editStatus as any,
    };

    onUpdateState((prev) => ({
      ...prev,
      employees: prev.employees.map((emp) => (emp.id === editingEmpId ? updatedEmpRecord : emp)),
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: state?.currentPersona?.name || 'Admin',
          action: 'EMPLOYEE_ROLE_UPDATED',
          entity: 'Employee',
          entityId: editingEmpId,
          ipAddress: '106.51.72.18',
          details: `Updated hierarchy, office & role for ${targetEmp.name}`,
        },
        ...prev.auditLogs,
      ],
    }));

    showToast(`Updated hierarchy & office for ${targetEmp.name}`);
    setShowEditModal(false);
    setEditingEmpId(null);
  };

  // Backfill reporting lines once for older workspaces with empty managerIds.
  useEffect(() => {
    if (!canEditOrgChart || didSyncReporting.current || !onUpdateState) return;
    if (employees.length < 2) return;
    const missing = employees.filter((e) => !e.managerId && !isLeadershipEmployee(e)).length;
    if (missing / employees.length < 0.25) {
      didSyncReporting.current = true;
      return;
    }
    didSyncReporting.current = true;
    (async () => {
      const syncRes = await api.org.syncReporting();
      if (!syncRes.success) return;
      const empRes = await api.identity.getEmployees();
      if (!empRes.success || !Array.isArray(empRes.data)) return;
      const mapped = empRes.data.map((row: any) => mapApiEmployee(row));
      onUpdateState((prev) => ({ ...prev, employees: mapped }));
    })().catch(() => undefined);
  }, [canEditOrgChart, employees, onUpdateState]);

  // Auto-expand nodes when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      setCollapsedNodeIds(new Set());
    }
  }, [searchQuery]);

  const toggleCollapse = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const expandAll = () => setCollapsedNodeIds(new Set());

  const collapseAll = () => {
    const allIds = new Set<string>();
    const collectIds = (node: OrgNode) => {
      if (node.children && node.children.length > 0) {
        allIds.add(node.id);
        node.children.forEach(collectIds);
      }
    };
    orgTrees.forEach(collectIds);
    setCollapsedNodeIds(allIds);
  };

  const handleZoomIn = () => setZoomLevel((z) => Math.min(1.4, Number((z + 0.1).toFixed(1))));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.5, Number((z - 0.1).toFixed(1))));
  const handleResetZoom = () => setZoomLevel(1);

  const countPeople = (node: OrgNode): number => {
    if (node.kind === 'person') {
      return 1 + (node.children || []).reduce((sum, child) => sum + countPeople(child), 0);
    }
    return (node.children || []).reduce((sum, child) => sum + countPeople(child), 0);
  };

  // Render a Single Node Card in Tree View (Cleaned Up & Modernized)
  const renderCard = (node: OrgNode) => {
    const hasChildren = node.children && node.children.length > 0;
    const isCollapsed = collapsedNodeIds.has(node.id);
    const matchesSearch = searchQuery
      ? node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.department.toLowerCase().includes(searchQuery.toLowerCase())
      : false;

    const deptTheme = DEPT_COLORS[node.department] || {
      bg: 'bg-slate-50',
      text: 'text-slate-700',
      border: 'border-slate-200',
    };

    const person = node.kind !== 'team' && node.kind !== 'unassigned'
      ? employees.find((e) => e.id === node.id)
      : undefined;
    const isFounder = !!person && isLeadershipEmployee(person);
    const isGroup = node.kind === 'team' || node.kind === 'unassigned';
    const groupCount = isGroup ? countPeople(node) : node.children?.length || 0;

    return (
      <div className="flex flex-col items-center relative group z-10">
        <div
          onClick={() => {
            if (isGroup) return;
            // Editors peek in-chart; everyone else goes through parent routing
            // (full detail for self, public profile modal for coworkers).
            if (!canEditOrgChart && onSelectEmployee && person) {
              onSelectEmployee(person);
              return;
            }
            setSelectedNode(node);
          }}
          className={`w-52 rounded-2xl border bg-white p-4 pt-4 pb-5 flex flex-col items-center text-center shadow-xs transition-all duration-200 relative select-none ${
            isGroup ? 'cursor-default' : 'cursor-pointer hover:shadow-lg'
          } ${
            matchesSearch
              ? 'border-blue-600 ring-4 ring-blue-500/20 shadow-md scale-105'
              : isFounder
                ? 'border-slate-300 ring-2 ring-slate-900/5'
                : isGroup
                  ? 'border-dashed border-slate-300 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          {isFounder && (
            <div className="absolute -top-2.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-bold uppercase tracking-wider border border-slate-200/80 shadow-2xs">
              Founder / CEO
            </div>
          )}
          {node.kind === 'unassigned' && (
            <div className="absolute -top-2.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-wider border border-amber-200 shadow-2xs">
              Unassigned
            </div>
          )}

          {isGroup ? (
            <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center">
              <Users className="h-6 w-6 text-slate-500" />
            </div>
          ) : (
            <div className="relative mt-1">
              <img
                src={node.avatar}
                alt={node.name}
                className="h-14 w-14 rounded-full object-cover ring-2 ring-slate-100 shadow-2xs"
              />
              <span
                className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                  node.status === 'On Leave' ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
                title={node.status || 'Active'}
              />
            </div>
          )}

          <h4 className="mt-2.5 text-xs font-bold text-slate-900 tracking-tight leading-tight truncate max-w-[180px]">
            {node.name}
          </h4>

          <p className="text-[11px] font-semibold text-slate-600 mt-0.5 truncate max-w-[180px]">
            {isGroup ? `${groupCount} ${groupCount === 1 ? 'person' : 'people'}` : node.role}
          </p>

          {!!node.department && (
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${deptTheme.bg} ${deptTheme.text} ${deptTheme.border}`}
              >
                {node.department}
              </span>
            </div>
          )}

          {hasChildren && (
            <button
              type="button"
              onClick={(e) => toggleCollapse(node.id, e)}
              className="absolute -bottom-3 px-2 py-0.5 rounded-full bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-600 flex items-center gap-1 text-[10px] font-bold transition-all shadow-xs cursor-pointer active:scale-95 z-20 border border-slate-200"
              title={isCollapsed ? `Expand ${node.children?.length} items` : 'Collapse'}
            >
              <Users className="h-3 w-3 text-slate-500" />
              <span>{node.children?.length}</span>
              <span className="text-[10px] text-slate-400">{isCollapsed ? '+' : '−'}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  // Dynamic CSS Tree Connector Renderer
  const renderTreeNode = (node: OrgNode) => {
    const hasChildren = node.children && node.children.length > 0;
    const isCollapsed = collapsedNodeIds.has(node.id);
    const childCount = node.children?.length || 0;

    return (
      <div key={node.id} className="flex flex-col items-center">
        {/* Node Card */}
        {renderCard(node)}

        {/* Children Branch Section */}
        {hasChildren && !isCollapsed && (
          <div className="flex flex-col items-center w-full">
            {/* Vertical connector stem from parent downwards */}
            <div className="w-[1.5px] h-8 bg-slate-300 shrink-0" />

            {/* Container for all children with connecting horizontal arms */}
            {childCount === 1 ? (
              <div className="flex flex-col items-center">
                {renderTreeNode(node.children![0])}
              </div>
            ) : (
              <div className="flex justify-center items-start gap-6 sm:gap-10 relative">
                {node.children!.map((child, index) => {
                  const isFirst = index === 0;
                  const isLast = index === childCount - 1;

                  return (
                    <div key={child.id} className="flex flex-col items-center relative flex-1">
                      {/* Horizontal connecting arm at top of child column */}
                      <div
                        className="absolute top-0 h-[1.5px] bg-slate-300"
                        style={{
                          left: isFirst ? '50%' : '0',
                          right: isLast ? '50%' : '0',
                          width: isFirst || isLast ? '50%' : '100%',
                        }}
                      />

                      {/* Vertical stem down into child card */}
                      <div className="w-[1.5px] h-8 bg-slate-300 shrink-0 z-0" />

                      {/* Child Node */}
                      {renderTreeNode(child)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card with Clean View Switcher & Action Controls */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Organization Chart</h2>
            {!canEditOrgChart && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80 flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" /> Read-Only
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Reporting hierarchy & management structure for {orgName}
          </p>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle: Tree vs Hierarchy Plan */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'tree' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitFork className="h-3.5 w-3.5" />
              <span>Tree View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('plan')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'plan' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListTree className="h-3.5 w-3.5" />
              <span>Hierarchy Plan</span>
            </button>
          </div>

          {/* Department Filter */}
          <div className="relative">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-8 py-2 text-xs font-bold text-slate-800 outline-none focus:border-slate-900 focus:bg-white transition-all cursor-pointer"
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept === 'All' ? 'All Departments' : dept}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search member, role..."
              className="w-40 sm:w-52 rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-8 py-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-900 focus:bg-white transition-all"
            />
            <Search className="absolute right-3 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>

          {viewMode === 'tree' && (
            <>
              {/* Expand / Collapse Controls */}
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={expandAll}
                  className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-white transition-all cursor-pointer"
                >
                  Expand
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-white transition-all cursor-pointer"
                >
                  Collapse
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 border border-slate-200 rounded-xl bg-slate-50 p-1 text-slate-600">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1.5 hover:bg-white rounded-lg transition-all cursor-pointer hover:text-slate-900"
                  title="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-mono font-bold px-1 select-none">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-1.5 hover:bg-white rounded-lg transition-all cursor-pointer hover:text-slate-900"
                  title="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="p-1.5 hover:bg-white rounded-lg transition-all cursor-pointer hover:text-slate-900"
                  title="Reset zoom"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* VIEW 1: VISUAL TREE VIEW */}
      {viewMode === 'tree' ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 min-h-[640px] overflow-auto shadow-xs flex justify-center items-start">
          {orgTrees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <div className="p-4 rounded-2xl bg-slate-100 text-slate-400">
                <Users className="h-8 w-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Employees Found</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Add or invite employees to automatically generate the organizational reporting chart.
              </p>
            </div>
          ) : (
            <div
              className="transition-transform duration-200 ease-out origin-top py-6 px-8 flex justify-center gap-16"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              {orgTrees.map((tree) => renderTreeNode(tree))}
            </div>
          )}
        </div>
      ) : (
        /* VIEW 2: ONBOARDING-STYLE HIERARCHY PLAN VIEW (Clean Cards with Manager Selectors) */
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">Hierarchy & Reporting Assignments</h3>
              <p className="text-xs text-slate-500">
                {canEditOrgChart
                  ? 'Configure direct reports and reporting lines across all employees'
                  : 'View reporting lines and department structure'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {employees
              .filter((emp) => {
                if (selectedDept !== 'All' && emp.department !== selectedDept) return false;
                if (searchQuery.trim()) {
                  const q = searchQuery.toLowerCase();
                  return (
                    emp.name.toLowerCase().includes(q) ||
                    emp.designation?.toLowerCase().includes(q) ||
                    emp.department?.toLowerCase().includes(q)
                  );
                }
                return true;
              })
              .map((emp) => {
                const isLeader = getRoleRank(emp) === 1;
                const deptTheme = DEPT_COLORS[emp.department || ''] || {
                  bg: 'bg-slate-50',
                  text: 'text-slate-700',
                  border: 'border-slate-200',
                };
                const directReportsCount = employees.filter((e) => e.managerId === emp.id).length;

                return (
                  <div
                    key={emp.id}
                    className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:border-slate-300 transition-all space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={emp.avatar || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'}
                          alt={emp.name}
                          className="w-11 h-11 rounded-full object-cover ring-2 ring-slate-100 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 text-sm truncate">{emp.name}</h4>
                            {isLeader && (
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60 shrink-0">
                                Lead
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate font-medium">{emp.designation || 'Specialist'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${deptTheme.bg} ${deptTheme.text} ${deptTheme.border}`}>
                              {emp.department || 'General'}
                            </span>
                            {directReportsCount > 0 && (
                              <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {directReportsCount} reports
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {canEditOrgChart && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditEmp(emp)}
                          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit Employee Details"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Reports To Selector or Read-Only Pill */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                      <span className="font-bold text-slate-700 shrink-0">Reports to:</span>
                      {canEditOrgChart ? (
                        <select
                          value={emp.managerId || ''}
                          onChange={(e) => handleUpdateReportingManager(emp.id, e.target.value)}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold outline-none focus:border-slate-900 bg-slate-50 hover:bg-white transition-colors cursor-pointer w-full max-w-[220px]"
                        >
                          <option value="">None (Top Level / Board)</option>
                          {employees
                            .filter((m) => m.id !== emp.id)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.designation || 'Staff'})
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="font-semibold text-slate-800 bg-slate-50 border border-slate-200/70 px-3 py-1.5 rounded-xl truncate max-w-[220px]">
                          {emp.managerName || (isLeader ? 'Board of Directors' : 'Top Level')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Employee Quick Details Inspection Modal */}
      <EmployeeProfileCardModal
        isOpen={!!selectedNode}
        onClose={() => setSelectedNode(null)}
        employee={selectedNode ? (employees.find((e) => e.id === selectedNode.id) || selectedNode) : null}
        allEmployees={employees}
        canEdit={canEditOrgChart}
        isInstitution={isInstitution}
        onEditHierarchy={(emp) => {
          setSelectedNode(null);
          handleOpenEditEmp(emp);
        }}
        onViewFullProfile={(emp) => {
          if (onSelectEmployee) {
            onSelectEmployee(emp);
            setSelectedNode(null);
          }
        }}
      />

      {/* Edit Hierarchy & Role Modal (Only for HR & Super Admin) */}
      {showEditModal && editingEmpId && canEditOrgChart && (
        <SlideOverDrawer
          title="Edit Reporting & Hierarchy"
          onClose={() => {
            setShowEditModal(false);
            setEditingEmpId(null);
          }}
        >
            <form onSubmit={handleSaveEditModal} className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className={slideOverBodyClass}>
              {/* Employee Preview Header */}
              {(() => {
                const targetEmp = employees.find((e) => e.id === editingEmpId);
                if (!targetEmp) return null;
                return (
                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                    <img
                      src={targetEmp.avatar || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'}
                      alt={targetEmp.name}
                      className="w-11 h-11 rounded-full object-cover ring-2 ring-slate-100"
                    />
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{targetEmp.name}</h4>
                      <p className="text-xs text-slate-500">{targetEmp.email}</p>
                    </div>
                  </div>
                );
              })()}

              {/* 1. Reporting Manager Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Reporting Manager
                </label>
                <select
                  value={editManagerId}
                  onChange={(e) => setEditManagerId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold outline-none focus:border-slate-900 bg-white cursor-pointer"
                >
                  <option value="">None (Top Level / Board of Directors)</option>
                  {employees
                    .filter((m) => m.id !== editingEmpId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.designation || 'Staff'} ({m.department || 'General'})
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-400 font-medium">
                  This employee will appear directly underneath this manager in the organizational tree.
                </p>
              </div>

              {/* 2. Designation / Role */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Job Designation / Title
                </label>
                <select
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold outline-none focus:border-slate-900 bg-white cursor-pointer"
                  required
                >
                  <option value="" disabled>
                    Select a designation
                  </option>
                  {designationOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                {designationOptions.length === 0 && (
                  <p className="text-[11px] text-slate-400 font-medium">
                    No designations configured. Add them in Settings → Job Roles & Titles.
                  </p>
                )}
              </div>

              {/* 3. Department */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Department
                </label>
                <select
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold outline-none focus:border-slate-900 bg-white cursor-pointer"
                  required
                >
                  <option value="" disabled>
                    Select a department
                  </option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                {departmentOptions.length === 0 && (
                  <p className="text-[11px] text-slate-400 font-medium">
                    No departments configured. Add them in Settings → Departments & Teams.
                  </p>
                )}
              </div>

              {/* 4. Office Location / Campus */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Office Location / Campus
                  {(state.customOptions?.offices?.length || 0) > 1 ? 'es' : ''}
                </label>
                {state.customOptions?.offices && state.customOptions.offices.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 space-y-2 max-h-36 overflow-y-auto">
                    {Array.from(new Set(state.customOptions.offices)).map((off, idx) => {
                      const checked = editOffices.includes(off);
                      return (
                        <label
                          key={`org-office-${off}-${idx}`}
                          className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setEditOffices((prev) => {
                                const next = checked ? prev.filter((n) => n !== off) : [...prev, off];
                                setEditOffice(next[0] || '');
                                return next;
                              });
                            }}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          />
                          <span>{off}</span>
                          {checked && editOffices[0] === off && (
                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-white">
                              Primary
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={editOffice}
                    onChange={(e) => {
                      setEditOffice(e.target.value);
                      setEditOffices(e.target.value.trim() ? [e.target.value.trim()] : []);
                    }}
                    placeholder="e.g. Headquarters Office, Campus Main Wing"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold outline-none focus:border-slate-900 bg-white"
                    required
                  />
                )}
              </div>

              {/* 5. Status */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Account Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-semibold outline-none focus:border-slate-900 bg-white cursor-pointer"
                >
                  <option value="Active">Active</option>
                  <option value="Probation">Probation</option>
                  <option value="On Leave">On Leave</option>
                </select>
              </div>

              </div>
              <div className={slideOverFooterClass}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingEmpId(null);
                  }}
                  className={slideOverCancelClass}
                >
                  Cancel
                </button>
                <button type="submit" className={slideOverPrimaryClass}>
                  Save Changes
                </button>
              </div>
            </form>
        </SlideOverDrawer>
      )}
    </div>
  );
};
