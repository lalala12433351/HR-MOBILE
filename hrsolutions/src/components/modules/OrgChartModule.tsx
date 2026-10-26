'use client';

import './org-chart.css';
import { UserAvatar } from '@/components/common/UserAvatar';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  MapPin,
  X,
  Users,
  ChevronDown,
  Mail,
  Shield,
  Pencil,
  Check,
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
  const canvasRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
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
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.15, Number((z - 0.1).toFixed(2))));
  const handleFitToView = () => {
    const canvas = canvasRef.current, tree = treeRef.current;
    if (!canvas || !tree) return;
    const scale = Math.min(1, (canvas.clientWidth - 48) / tree.offsetWidth, (canvas.clientHeight - 48) / tree.offsetHeight);
    setZoomLevel(Math.max(0.15, Math.floor(scale * 100) / 100));
    canvas.scrollTo({ left: 0, top: 0 });
  };

  const countPeople = (node: OrgNode): number => {
    if (node.kind === 'person') {
      return 1 + (node.children || []).reduce((sum, child) => sum + countPeople(child), 0);
    }
    return (node.children || []).reduce((sum, child) => sum + countPeople(child), 0);
  };

  useEffect(() => {
    if (!searchQuery.trim() || viewMode !== 'tree') return;
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current, match = treeRef.current?.querySelector<HTMLElement>('[data-match="true"]');
      if (!canvas || !match) return;
      const bounds = match.getBoundingClientRect(), viewport = canvas.getBoundingClientRect();
      canvas.scrollTo({ left: Math.max(0, canvas.scrollLeft + bounds.left - viewport.left - (canvas.clientWidth - bounds.width) / 2), top: Math.max(0, canvas.scrollTop + bounds.top - viewport.top - 32), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [searchQuery, selectedDept, viewMode]);

  const planEmployees = employees.filter((employee) => (selectedDept === 'All' || employee.department === selectedDept) && `${employee.name} ${employee.designation || ''} ${employee.department || ''}`.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  const openNode = (node: OrgNode) => {
    const person = employees.find((employee) => employee.id === node.id);
    if (!canEditOrgChart && onSelectEmployee && person) onSelectEmployee(person);
    else setSelectedNode(node);
  };

  const renderTreeNode = (node: OrgNode): React.ReactNode => {
    const children = node.children || [];
    const collapsed = collapsedNodeIds.has(node.id);
    const group = node.kind === 'team' || node.kind === 'unassigned';
    const query = searchQuery.trim().toLowerCase();
    const match = !!query && `${node.name} ${node.role} ${node.department}`.toLowerCase().includes(query);
    const content = <>
      {group ? <span className="org-group-avatar"><Users size={20}/></span> : <UserAvatar src={node.avatar} name={node.name} className="org-person-avatar"/>}
      <strong className="org-person-name" title={node.name}>{node.name}</strong>
      <span className="org-person-role" title={node.role}>{group ? `${countPeople(node)} people` : node.role || 'Team member'}</span>
      {node.department && <span className="org-person-department">{node.department}</span>}
    </>;
    return <div key={node.id} className="org-tree-node">
      <div className="org-card-wrap">
        {group ? <div className="org-person-card org-group-card" data-match={match}>{content}</div> : <button type="button" className="org-person-card" data-match={match} aria-label={`View ${node.name}, ${node.role}`} onClick={() => openNode(node)}>{content}</button>}
        {children.length > 0 && <button type="button" className="org-node-toggle" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${node.name}'s reports`} title={`${children.length} direct ${children.length === 1 ? 'report' : 'reports'}`} onClick={(event) => toggleCollapse(node.id, event)}><ChevronDown size={12} className={collapsed ? 'is-collapsed' : ''}/><span>{children.length}</span></button>}
      </div>
      {children.length > 0 && !collapsed && <div className="org-tree-branch"><div className="org-tree-children">{children.map((child) => <div className="org-tree-column" key={child.id}>{renderTreeNode(child)}</div>)}</div></div>}
    </div>;
  };

  return (
    <div className="people-org-chart org-chart-studio">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="org-toolbar">
        <div className="org-filter-controls">
          <div className="org-mode-toggle" role="group" aria-label="Organization chart view">
            <button type="button" aria-pressed={viewMode === 'tree'} onClick={() => setViewMode('tree')}>Tree view</button>
            <button type="button" aria-pressed={viewMode === 'plan'} onClick={() => setViewMode('plan')}>Hierarchy plan</button>
          </div>
          <select aria-label="Filter organization by department" value={selectedDept} onChange={(event) => setSelectedDept(event.target.value)}>{departments.map((department) => <option key={department} value={department}>{department === 'All' ? 'All departments' : department}</option>)}</select>
          <label className="org-search"><Search size={15}/><input value={searchQuery} aria-label="Search organization chart" placeholder="Search name, role..." onChange={(event) => setSearchQuery(event.target.value)}/>{searchQuery && <button type="button" aria-label="Clear organization search" onClick={() => setSearchQuery('')}><X size={14}/></button>}</label>
        </div>
        {viewMode === 'tree' && <div className="org-tree-controls">
          <button type="button" onClick={expandAll}>Expand all</button><button type="button" onClick={collapseAll}>Collapse all</button>
          <button type="button" className="org-icon-control" aria-label="Zoom out" onClick={handleZoomOut} disabled={zoomLevel <= 0.15}>−</button><button type="button" className="org-zoom-value" aria-label={`Reset zoom to 100 percent. Current zoom ${Math.round(zoomLevel * 100)} percent`} title="Reset zoom to 100%" onClick={() => setZoomLevel(1)}>{Math.round(zoomLevel * 100)}%</button>
          <button type="button" className="org-icon-control" aria-label="Zoom in" onClick={handleZoomIn} disabled={zoomLevel >= 1.4}>+</button><button type="button" onClick={handleFitToView}>Fit to view</button>
        </div>}
        {!canEditOrgChart && <span className="org-read-only"><Lock size={12}/>Read only</span>}
      </div>
      {searchQuery.trim() && <p className="org-search-summary" role="status">{employees.filter((employee) => (selectedDept === 'All' || employee.department === selectedDept) && `${employee.name} ${employee.designation || ''} ${employee.department || ''}`.toLowerCase().includes(searchQuery.trim().toLowerCase())).length} matching people{viewMode === 'tree' ? ' · Matching cards are highlighted; reporting lines remain visible.' : ''}</p>}

      {/* VIEW 1: VISUAL TREE VIEW */}
      {viewMode === 'tree' ? (
        <div className="org-tree-canvas" ref={canvasRef} tabIndex={0} role="region" aria-label="Organization hierarchy. Scroll or drag the background to explore."
          onPointerDown={(event) => { if (event.button !== 0 || (event.target as HTMLElement).closest('button,input,select')) return; const canvas = canvasRef.current!; panRef.current = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop }; canvas.setPointerCapture(event.pointerId); canvas.dataset.panning = 'true'; }}
          onPointerMove={(event) => { const pan = panRef.current, canvas = canvasRef.current; if (!pan || !canvas) return; canvas.scrollLeft = pan.left - (event.clientX - pan.x); canvas.scrollTop = pan.top - (event.clientY - pan.y); }}
          onPointerUp={() => { panRef.current = null; if (canvasRef.current) canvasRef.current.dataset.panning = 'false'; }}
          onPointerCancel={() => { panRef.current = null; if (canvasRef.current) canvasRef.current.dataset.panning = 'false'; }}>
          {orgTrees.length === 0 ? <div className="org-empty"><Users size={28}/><h3>No people in this view</h3><p>{selectedDept !== 'All' ? 'Choose another department to explore its reporting structure.' : 'Add or invite employees to build your organization chart.'}</p></div> : <div className="org-tree-content" ref={treeRef} style={{ zoom: zoomLevel }}>{orgTrees.map((tree) => renderTreeNode(tree))}</div>}
        </div>
      ) : (
        /* VIEW 2: ONBOARDING-STYLE HIERARCHY PLAN VIEW (Clean Cards with Manager Selectors) */
        <div className="org-hierarchy-plan space-y-4">
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

          {planEmployees.length === 0 && <div className="org-empty"><Users size={28}/><h3>No matching people</h3><p>Try a different name, role, or department.</p></div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {planEmployees
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
                    className="org-plan-card space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar src={emp.avatar} name={emp.name} className="org-plan-avatar"/>
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
                          aria-label={`Edit hierarchy for ${emp.name}`}
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
                          aria-label={`Reporting manager for ${emp.name}`}
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
                    <UserAvatar src={targetEmp.avatar} name={targetEmp.name} className="h-11 w-11"/>
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
