'use client';
import './people-attendance.css';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronLeft,
  Edit2,
  Users,
} from 'lucide-react';
import { DepartmentRecord, Employee } from '@/types';
import { AppState } from '@/services/store';
import { api } from '@/services/apiClient';
import { DepartmentTag } from '@/components/common/DepartmentTag';
import { ManagerPicker } from '@/components/common/ManagerPicker';
import { UserAvatar } from '@/components/common/UserAvatar';
import {
  findDepartmentRecord,
  leadIdsOf,
} from '@/utils/departmentRecords';
import {
  isValidDepartmentCode,
  normalizeDepartmentCode,
  suggestDepartmentCode,
} from '@/utils/departmentCode';
import { refreshEmployeeManagerLinks } from '@/utils/refreshEmployeeManagers';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

export type DepartmentSavePatch = {
  id: string;
  previousName: string;
  name: string;
  shortCode?: string;
  description?: string;
  leadEmployeeId?: string | null;
  leadName?: string | null;
  leadEmployeeIds?: string[];
  leadNames?: string[];
};

interface DepartmentDetailViewProps {
  departmentName: string;
  state: AppState;
  canEdit: boolean;
  onBack: () => void;
  backLabel?: string;
  onSelectEmployee: (emp: Employee) => void;
  onSaved: (patch: DepartmentSavePatch) => void;
  onDeleted: (id: string, name: string) => void;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

const cardClass =
  'bg-white border border-[#dde4e9] rounded-[12px] p-6 sm:p-7 shadow-xs text-[#172234] space-y-4';
const fieldRowClass =
  'flex items-start justify-between gap-4 py-1.5 border-b border-[#f3f5f7]';
const fieldLabelClass = 'text-[#687789] font-semibold shrink-0';
const fieldValueClass = 'font-bold text-[#172234] text-right';
const inputClass =
  'w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3.5 py-2 text-[13px] font-medium text-[#172234] outline-none focus:border-[#17324e]';
const primaryBtn =
  'px-5 py-2 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white font-bold cursor-pointer transition-all text-xs disabled:opacity-50';
const secondaryBtn =
  'px-4 py-2 rounded-[7px] border border-[#dde4e9] bg-white text-[#17324e] hover:bg-[#f3f5f7] font-bold cursor-pointer transition-colors text-xs';

export const DepartmentDetailView: React.FC<DepartmentDetailViewProps> = ({
  departmentName,
  state,
  canEdit,
  onBack,
  backLabel = 'Back to Employees',
  onSelectEmployee,
  onSaved,
  onDeleted,
  onUpdateState,
}) => {
  const records = ((state.customOptions as any)?.departmentRecords || []) as DepartmentRecord[];
  const record = findDepartmentRecord(records, departmentName);
  const members = useMemo(
    () =>
      (state.employees || []).filter(
        (e) => e.department?.trim().toLowerCase() === departmentName.trim().toLowerCase()
      ),
    [state.employees, departmentName]
  );

  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'setting'>('general');
  const [isEditing, setIsEditing] = useState(canEdit);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [formName, setFormName] = useState(departmentName);
  const [formCode, setFormCode] = useState(record?.shortCode || suggestDepartmentCode(departmentName));
  const [formDescription, setFormDescription] = useState(record?.description || '');
  const [formLeadIds, setFormLeadIds] = useState<string[]>(leadIdsOf(record));

  const recordLeadKey = leadIdsOf(record).join(',');

  useEffect(() => {
    setFormName(record?.name || departmentName);
    setFormCode(record?.shortCode || suggestDepartmentCode(departmentName));
    setFormDescription(record?.description || '');
    setFormLeadIds(leadIdsOf(record));
    setIsEditing(canEdit);
  }, [canEdit, record?.id, record?.name, record?.shortCode, record?.description, recordLeadKey, departmentName]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2800);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const showToast = (msg: string) => setToastMessage(msg);

  const resolveRecordId = async (): Promise<string> => {
    if (record?.id) return record.id;
    const listRes = await api.org.getDepartments();
    const match = ((listRes.data || []) as any[]).find(
      (r) => String(r.name || '').toLowerCase() === departmentName.toLowerCase()
    );
    if (!match?.id) throw new Error('Department not found on server');
    return String(match.id);
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canEdit) return;
    const name = formName.trim();
    const shortCode = normalizeDepartmentCode(formCode);
    if (!name) {
      showToast('Department name is required.');
      return;
    }
    if (!isValidDepartmentCode(shortCode)) {
      showToast('Tag must be 2–6 lowercase letters or digits and start with a letter.');
      return;
    }
    setSaving(true);
    try {
      const id = await resolveRecordId();
      const res = await api.org.updateDepartment(id, {
        name,
        shortCode,
        description: formDescription.trim(),
        leadEmployeeIds: formLeadIds,
      });
      if (!res.success) throw new Error(res.error?.message || 'Could not save department');
      const savedIds: string[] = Array.isArray((res.data as any)?.lead_employee_ids)
        ? (res.data as any).lead_employee_ids.map(String)
        : formLeadIds;
      const savedCode = (res.data as any)?.short_code || shortCode;
      const savedName = (res.data as any)?.name || name;
      const savedDescription = (res.data as any)?.description ?? formDescription.trim();
      const names = savedIds.map((id) => state.employees.find((emp) => emp.id === id)?.name || '');
      onSaved({
        id,
        previousName: departmentName,
        name: savedName,
        shortCode: savedCode,
        description: savedDescription,
        leadEmployeeId: savedIds[0] || null,
        leadName: names[0] || null,
        leadEmployeeIds: savedIds,
        leadNames: names.filter(Boolean),
      });
      // Reporting lines are rewritten server-side when leads change — refresh "Reports to".
      await refreshEmployeeManagerLinks(onUpdateState);
      setFormLeadIds(savedIds);
      setIsEditing(false);
      showToast('Department updated');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update department');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!canEdit) return;
    if (members.length > 0) {
      showToast('Move or unassign members before deleting this department.');
      return;
    }
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteDepartment = async () => {
    setDeleting(true);
    try {
      const id = await resolveRecordId();
      await api.org.deleteDepartment(id);
      setConfirmDeleteOpen(false);
      onDeleted(id, departmentName);
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete department');
    } finally {
      setDeleting(false);
    }
  };

  const initials = (departmentName || 'DE')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const managerNames =
    record?.leadNames?.filter(Boolean) ||
    leadIdsOf(record)
      .map((id) => state.employees.find((e) => e.id === id)?.name)
      .filter(Boolean);

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'members' as const, label: 'Members' },
    { id: 'setting' as const, label: 'Settings' },
  ];

  return (
    <div className="department-profile-studio space-y-6">
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-[#172234] text-white px-4 py-2.5 rounded-[12px] shadow-xl text-xs font-bold flex items-center gap-2">
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-[#5e6c7b] hover:text-[#172234] transition-all cursor-pointer group bg-white border border-[#dde4e9] px-3 py-1.5 rounded-[7px]"
        >
          <ChevronLeft className="h-4 w-4 text-[#687789] group-hover:text-[#172234]" />
          <span>{backLabel}</span>
        </button>
      </div>

      <div className="department-profile-grid grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="department-profile-sidebar lg:col-span-4 xl:col-span-3 w-full bg-white rounded-[12px] p-6 sm:p-7 shadow-xs space-y-5 text-[#172234] border border-[#dde4e9]">
          <div className="department-profile-identity flex flex-col items-center text-center space-y-2">
            <div className="department-profile-monogram w-24 h-24 rounded-full overflow-hidden bg-[#e8eef2] flex items-center justify-center text-[#17324e] border-2 border-[#dde4e9]">
              {initials ? (
                <span className="text-2xl font-bold tracking-tight">{initials}</span>
              ) : (
                <Building2 className="h-12 w-12" strokeWidth={1.6} />
              )}
            </div>
            <div className="pt-2">
              <h2 className="text-xl font-bold text-[#172234] tracking-tight">{record?.name || departmentName}</h2>
              <p className="text-xs text-[#5e6c7b] font-semibold mt-0.5">Department</p>
            </div>
            <DepartmentTag name={record?.name || departmentName} code={record?.shortCode} />
          </div>

          <div className="border-t border-[#f3f5f7] my-4" />

          <div className="space-y-3.5 text-xs">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-[#687789] shrink-0" />
              <span className="font-semibold text-[#172234]">
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#687789]">Managers</p>
              <p className="font-bold text-[#172234] mt-0.5">
                {managerNames.length ? managerNames.join(', ') : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#687789]">About</p>
              <p className="font-semibold text-[#172234] mt-0.5 whitespace-pre-wrap">
                {(record?.description || '').trim() || 'No description yet'}
              </p>
            </div>
          </div>
        </div>

        <div className="department-profile-content lg:col-span-8 xl:col-span-9 space-y-6">
          <div role="tablist" aria-label="Department details" className="department-profile-tabs flex items-center gap-6 sm:gap-8 border-b border-[#dde4e9] overflow-x-auto scrollbar-none pb-0 bg-white px-6 pt-3 rounded-[12px] shadow-xs">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`border-b-2 px-1 pb-3 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'border-[#17324e] text-[#17324e]'
                      : 'border-transparent text-[#687789] hover:text-[#172234]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'general' && (
            <div className={cardClass}>
              <div className="flex items-center justify-between pb-3 border-b border-[#f3f5f7]">
                <h3 className="text-[15px] font-bold text-[#172234] tracking-tight">Department Information</h3>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className="p-2 rounded-[7px] text-[#687789] hover:text-[#172234] hover:bg-[#f3f5f7] cursor-pointer"
                    title={isEditing ? 'Cancel' : 'Edit department'}
                    aria-label={isEditing ? 'Cancel editing department' : 'Edit department'}
                  >
                    <Edit2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>

              {!isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 pt-1 text-xs">
                  <div className="space-y-3.5">
                    <div className={fieldRowClass}>
                      <span className={fieldLabelClass}>Name</span>
                      <span className={fieldValueClass}>{record?.name || departmentName}</span>
                    </div>
                    <div className={fieldRowClass}>
                      <span className={fieldLabelClass}>Tag</span>
                      <span className={fieldValueClass}>{record?.shortCode || '—'}</span>
                    </div>
                  </div>
                  <div className="space-y-3.5">
                    <div className={fieldRowClass}>
                      <span className={fieldLabelClass}>Managers</span>
                      <span className={fieldValueClass}>{managerNames.length ? managerNames.join(', ') : '—'}</span>
                    </div>
                    <div className={fieldRowClass}>
                      <span className={fieldLabelClass}>Members</span>
                      <span className={fieldValueClass}>{members.length}</span>
                    </div>
                  </div>
                  <div className="md:col-span-2 pt-1">
                    <span className={fieldLabelClass}>Information</span>
                    <p className="mt-1.5 text-[13px] font-medium text-[#172234] whitespace-pre-wrap">
                      {(record?.description || '').trim() || '—'}
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSave} className="space-y-3.5 text-xs pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[#5e6c7b] font-bold mb-1">Name</label>
                      <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-[#5e6c7b] font-bold mb-1">Tag</label>
                      <input
                        value={formCode}
                        maxLength={6}
                        onChange={(e) => setFormCode(normalizeDepartmentCode(e.target.value))}
                        className={`${inputClass} font-mono lowercase`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[#5e6c7b] font-bold mb-1">Information</label>
                    <textarea
                      rows={4}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="What this department owns, how it works, or who it serves…"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[#5e6c7b] font-bold mb-1">Managers</label>
                    <ManagerPicker
                      label={formName || departmentName}
                      selectedIds={formLeadIds}
                      employees={state.employees || []}
                      disabled={saving}
                      onChange={setFormLeadIds}
                    />
                  </div>
                  <div className="flex justify-end gap-2.5 pt-3 border-t border-[#f3f5f7]">
                    <button type="button" onClick={() => { setFormName(record?.name || departmentName); setFormCode(record?.shortCode || suggestDepartmentCode(departmentName)); setFormDescription(record?.description || ''); setFormLeadIds(leadIdsOf(record)); setIsEditing(false); }} className={secondaryBtn}>
                      Cancel
                    </button>
                    <button type="submit" disabled={saving} className={primaryBtn}>
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className={cardClass}>
              <div className="flex items-center justify-between pb-3 border-b border-[#f3f5f7]">
                <h3 className="text-[15px] font-bold text-[#172234] tracking-tight">Members</h3>
                <span className="text-xs font-semibold text-[#687789]">{members.length}</span>
              </div>
              {members.length === 0 ? (
                <p className="text-xs text-[#687789] py-6 text-center">No people assigned to this department yet.</p>
              ) : (
                <div className="divide-y divide-[#f3f5f7]">
                  {members.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => onSelectEmployee(emp)}
                      className="department-member-row w-full flex items-center gap-3 py-3 text-left hover:bg-[#f8fbfe] rounded-[8px] px-1 cursor-pointer"
                    >
                      <UserAvatar src={emp.avatar} name={emp.name} className="h-9 w-9 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-[#172234] truncate">{emp.name}</p>
                        <p className="text-[12px] text-[#687789] truncate">
                          {emp.designation || 'Team member'}
                          {emp.employeeId ? ` · ${emp.employeeId}` : ''}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-[#5e6c7b]">{emp.accountStatus || emp.status || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'setting' && (
            <div className="space-y-6">
              <div className={cardClass}>
                <div className="flex items-center justify-between pb-3 border-b border-[#f3f5f7]">
                  <h3 className="text-[15px] font-bold text-[#172234] tracking-tight">Department settings</h3>
                </div>
                <p className="text-xs text-[#5e6c7b]">
                  Name, tag, information, and managers are edited from the General tab. Deleting a department is only
                  allowed when nobody is assigned to it.
                </p>
                {canEdit && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setActiveTab('general'); setIsEditing(true); }} className={secondaryBtn}>
                      Edit department
                    </button>
                  </div>
                )}
              </div>
              {canEdit && (
                <div className="department-danger-zone bg-white border border-[#faeeee] rounded-[12px] p-6 space-y-3">
                  <h3 className="text-[15px] font-bold text-[#8b3133]">Delete department</h3>
                  <p className="text-xs text-[#5e6c7b]">
                    {members.length > 0
                      ? `This department still has ${members.length} ${members.length === 1 ? 'member' : 'members'}. Reassign them first.`
                      : 'This permanently removes the department from the workspace.'}
                  </p>
                  <button
                    type="button"
                    disabled={deleting || members.length > 0}
                    onClick={handleDelete}
                    className="px-4 py-2 rounded-[7px] bg-[#8b3133] hover:bg-[#7a2a2c] text-white font-bold text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? 'Deleting…' : 'Delete department'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {confirmDeleteOpen && (
        <ConfirmDialog
          title={`Delete “${departmentName}”?`}
          description="This permanently removes the department from the workspace. This cannot be undone."
          confirmLabel="Delete department"
          busy={deleting}
          busyLabel="Deleting…"
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => void confirmDeleteDepartment()}
        />
      )}
    </div>
  );
};
