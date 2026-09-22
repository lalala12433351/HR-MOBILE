'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  Mail,
  Phone,
  Globe,
  Camera,
  Pencil,
  User,
} from 'lucide-react';
import { Employee } from '@/types';
import { useApp } from '@/context/AppContext';
import { compressAvatarImage } from '@/utils/imageUtils';
import { saveStoredState } from '@/services/store';
import { api } from '@/services/apiClient';

interface EmployeeProfileCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: any | null;
  allEmployees: Employee[];
  canEdit?: boolean;
  isInstitution?: boolean;
  onEditHierarchy?: (emp: Employee) => void;
  onViewFullProfile?: (emp: Employee) => void;
}

// Check if avatar is a cartoon memoji or placeholder
const isCartoonAvatar = (url?: string) => {
  if (!url) return true;
  return (
    url.includes('api.dicebear.com') ||
    url.includes('avataaars') ||
    url.startsWith('data:image/svg+xml;utf8,<svg')
  );
};

// Format initials (e.g. "Alex Mercer" -> "AM", "employee" -> "EM")
const getInitials = (name?: string) => {
  if (!name) return 'EM';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export const EmployeeProfileCardModal: React.FC<EmployeeProfileCardModalProps> = ({
  isOpen,
  onClose,
  employee,
  allEmployees,
  canEdit = false,
  isInstitution = false,
  onEditHierarchy,
  onViewFullProfile,
}) => {
  const { state, updateState, triggerToast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentAvatar, setCurrentAvatar] = useState<string | undefined>(employee?.avatar);

  useEffect(() => {
    if (employee) {
      setCurrentAvatar(employee.avatar);
    }
  }, [employee]);

  if (!isOpen || !employee) return null;

  // Handle live picture upload by employee
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressAvatarImage(file);
      if (!dataUrl) return;

      setCurrentAvatar(dataUrl);

      // Persist to global store
      updateState((prev) => {
        const updatedEmployees = prev.employees.map((emp) =>
          emp.id === employee.id ||
          (emp.email && emp.email.toLowerCase() === (employee.email || '').toLowerCase()) ||
          emp.name === employee.name
            ? { ...emp, avatar: dataUrl }
            : emp
        );
        const isCurrentPersona =
          prev.currentPersona?.id === employee.id ||
          (prev.currentPersona?.email && prev.currentPersona.email.toLowerCase() === (employee.email || '').toLowerCase()) ||
          prev.currentPersona?.name === employee.name;

        const nextState = {
          ...prev,
          employees: updatedEmployees,
          currentPersona: isCurrentPersona
            ? { ...prev.currentPersona, avatar: dataUrl }
            : prev.currentPersona,
        };

        saveStoredState(nextState);
        return nextState;
      });

      // Persist to backend database via REST API
      if (employee.id) {
        api.identity.updateEmployee(employee.id, { avatar: dataUrl }).catch((err) => {
          console.warn('Backend API employee avatar update warning:', err);
        });
      }
    } catch (err) {
      console.error('Failed to upload/compress profile picture:', err);
    }
  };

  // Resolve manager dynamically
  const hasManager = !!employee.managerId || (!!employee.lineManager?.name && employee.lineManager.name !== '—');
  const managerObj = hasManager
    ? allEmployees.find(
        (e) =>
          (employee.managerId && e.id === employee.managerId) ||
          (employee.lineManager?.name && e.name === employee.lineManager.name)
      )
    : null;
  const managerDisplayName = managerObj
    ? managerObj.name
    : (hasManager ? (employee.managerName || employee.lineManager?.name || '—') : '— (None / Top Level)');
  const managerDisplayAvatar = managerObj?.avatar || (hasManager ? employee.lineManager?.avatar : undefined);

  // Status computation
  const statusStr = (employee.status || 'Active').toUpperCase();
  const isSuper = employee.role === 'super_admin' || employee.employeeId === 'EMP001';
  const isActivated =
    isSuper ||
    employee.accountStatus === 'Activated' ||
    employee.accountStatus === 'Active' ||
    (employee.isActivated !== false && employee.accountStatus !== 'Not Activated');

  const directReports = allEmployees.filter((e) => e.managerId === employee.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="relative max-w-sm w-full max-h-[92vh] overflow-y-auto custom-scrollbar bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 cursor-default text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden File Input for Picture Upload */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handlePhotoUpload}
          accept="image/*"
          className="hidden"
        />

        {/* Close Button Top Right */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all cursor-pointer shadow-2xs z-10"
          title="Close"
        >
          <X className="h-4 w-4 stroke-[2.2]" />
        </button>

        {/* 1. Header Profile Photo & Title (allows editing picture) */}
        <div className="flex flex-col items-center text-center space-y-1.5 pt-1">
          <div
            className="relative group cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            title="Upload / Change profile picture"
          >
            <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-slate-100 shadow-md bg-slate-100 border border-slate-200 flex items-center justify-center">
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt={employee.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-slate-400 stroke-[1.8]" />
              )}
            </div>
          </div>

          <div className="pt-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {employee.fullName || employee.name}
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">
              {employee.designation || (isSuper ? 'Founder & CEO' : (employee.role || (isInstitution ? 'Faculty Member' : 'Employee')))}
            </p>
          </div>

          {/* Status Pill */}
          <div className="pt-1">
            <span
              className={`inline-flex items-center px-3.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                (employee.accountStatus === 'Active' || employee.status === 'Active')
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : (employee.accountStatus === 'In Probation' || employee.status === 'Probation' || employee.status === 'In Probation')
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : (employee.accountStatus === 'Notice Period' || employee.status === 'Notice Period')
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : (employee.accountStatus === 'On Leave' || employee.status === 'On Leave')
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : (employee.accountStatus === 'Not Activated' || !isActivated)
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {(employee.accountStatus || (isActivated ? employee.status || 'ACTIVE' : 'NOT ACTIVATED')).toUpperCase()}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* 2. Contact Meta Details */}
        <div className="space-y-3.5 text-xs">
          {/* Email */}
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={2} />
            <a
              href={`mailto:${employee.email}`}
              className="font-semibold text-slate-800 hover:text-blue-600 transition-colors truncate"
            >
              {employee.email || '—'}
            </a>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={2} />
            <span className="font-semibold text-slate-800">
              {employee.phone || '—'}
            </span>
          </div>

          {/* Timezone */}
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={2} />
            <span className="font-semibold text-slate-800">
              {employee.timezone || '—'}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* 3. Department, Office & Line Manager Hierarchy */}
        <div className="space-y-4 text-xs">
          {/* Department & Team */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400">Department & Team</p>
            <p className="font-bold text-slate-900 mt-0.5">
              {employee.department || '—'}
              {employee.team ? ` • ${employee.team}` : ''}
            </p>
          </div>

          {/* Office Location */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400">Office Location</p>
            <p className="font-bold text-slate-900 mt-0.5">
              {employee.officeName || employee.location || '—'}
            </p>
          </div>

          {/* Line Manager */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400">
              {isInstitution ? 'Staff Lead / HOD' : 'Line Manager'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {managerDisplayAvatar && !isCartoonAvatar(managerDisplayAvatar) ? (
                <img
                  src={managerDisplayAvatar}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-slate-200"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-slate-400 stroke-[2]" />
                </div>
              )}
              <span className="font-bold text-slate-900">
                {managerDisplayName}
              </span>
            </div>
          </div>

          {/* Direct Reports Count if any */}
          {directReports.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400">Direct Reports</p>
              <p className="font-bold text-blue-600 mt-0.5">
                {directReports.length} Team Members
              </p>
            </div>
          )}
        </div>

        {/* 4. Action Button (Blue Close button as requested) */}
        <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
          {(!isActivated || employee.accountStatus === 'Not Activated') && (
            <button
              type="button"
              onClick={() => {
                triggerToast({
                  title: 'Invitation Sent',
                  message: `Invitation sent to ${employee.email} via Cognito.`,
                  type: 'system',
                });
                updateState((prev) => ({
                  ...prev,
                  employees: prev.employees.map((emp) =>
                    emp.id === employee.id
                      ? { ...emp, isActivated: true, accountStatus: 'Activated' }
                      : emp
                  ),
                }));
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs transition-all shadow-xs active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Send / Resend Invitation</span>
            </button>
          )}

          {canEdit ? (
            <div className="flex gap-2">
              {onEditHierarchy && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditHierarchy(employee);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-xs active:scale-98 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Manage Profile</span>
                </button>
              )}
              {onViewFullProfile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewFullProfile(employee);
                  }}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs transition-all shadow-2xs active:scale-98 cursor-pointer"
                >
                  Full View
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-xs active:scale-98 cursor-pointer text-center"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
