'use client';

import React, { useState } from 'react';
import { X, Mail, Pencil } from 'lucide-react';
import { Employee } from '@/types';
import { useApp } from '@/context/AppContext';
import { compressAvatarImage } from '@/utils/imageUtils';
import { saveStoredState } from '@/services/store';
import { api } from '@/services/apiClient';
import { EmployeePublicProfilePanel } from './EmployeePublicProfilePanel';

interface EmployeeProfileCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: any | null;
  allEmployees: Employee[];
  canEdit?: boolean;
  isInstitution?: boolean;
  onEditHierarchy?: (emp: Employee) => void;
  onViewFullProfile?: (emp: Employee) => void;
  /** When true, show View profile for non-editors (coworker public profile). */
  allowViewPublicProfile?: boolean;
}

const btnPrimary =
  'inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-[7px] bg-[#17324e] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#285275] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2] active:scale-[0.99] cursor-pointer';

const btnSecondary =
  'inline-flex h-9 items-center justify-center gap-2 rounded-[7px] border border-[#c5d0d8] bg-white px-3.5 text-[13px] font-semibold text-[#17324e] transition-colors hover:bg-[#f8fbfe] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2] active:scale-[0.99] cursor-pointer';

export const EmployeeProfileCardModal: React.FC<EmployeeProfileCardModalProps> = ({
  isOpen,
  onClose,
  employee,
  allEmployees,
  canEdit = false,
  isInstitution = false,
  onEditHierarchy,
  onViewFullProfile,
  allowViewPublicProfile = false,
}) => {
  const { state, updateState, triggerToast } = useApp();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  if (!isOpen || !employee) return null;

  const isSelf =
    !!state.currentPersona &&
    (employee.id === state.currentPersona.id ||
      (!!state.currentPersona.email &&
        employee.email?.toLowerCase() === state.currentPersona.email.toLowerCase()));

  const isSuper = employee.role === 'super_admin' || employee.employeeId === 'EMP001';
  const isActivated =
    isSuper ||
    employee.accountStatus === 'Activated' ||
    employee.accountStatus === 'Active' ||
    (employee.isActivated !== false && employee.accountStatus !== 'Not Activated');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isSelf) return;

    try {
      setIsUploadingAvatar(true);
      const dataUrl = await compressAvatarImage(file);
      if (!dataUrl) return;

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
          (prev.currentPersona?.email &&
            prev.currentPersona.email.toLowerCase() === (employee.email || '').toLowerCase()) ||
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

      if (employee.id) {
        api.identity.updateEmployee(employee.id, { avatar: dataUrl }).catch((err) => {
          console.warn('Backend API employee avatar update warning:', err);
        });
      }
    } catch (err) {
      console.error('Failed to upload/compress profile picture:', err);
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const displayEmployee = {
    ...employee,
    avatar: allEmployees.find((e) => e.id === employee.id)?.avatar || employee.avatar,
  };

  const showInvite =
    canEdit && (!isActivated || employee.accountStatus === 'Not Activated');
  const showManageRow = canEdit && (!!onEditHierarchy || !!onViewFullProfile);
  const showViewProfile = !canEdit && allowViewPublicProfile && !!onViewFullProfile;
  const showActions = showInvite || showManageRow || showViewProfile;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#17324e]/35 p-4 sm:p-6 animate-in fade-in duration-200 cursor-pointer"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={displayEmployee.fullName || displayEmployee.name || 'Employee profile'}
        className="public-profile-dialog relative flex w-full max-w-[560px] max-h-[92vh] flex-col overflow-hidden rounded-[12px] border border-[#dde4e9] bg-white shadow-[0_18px_44px_-14px_rgba(23,50,78,0.28)] animate-in zoom-in-95 duration-200 cursor-default sm:max-w-[640px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="public-profile-dialog-head"><h2>{isSelf ? 'Your profile' : 'Coworker profile'}</h2>
        <button
          type="button"
          onClick={onClose}
          className="public-profile-close flex h-8 w-8 items-center justify-center rounded-[7px] text-[#5e6c7b] transition-colors hover:bg-[#e8eef2] hover:text-[#172234] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
          title="Close"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <EmployeePublicProfilePanel
            employee={displayEmployee}
            allEmployees={allEmployees}
            isInstitution={isInstitution}
            showAvatarEdit={isSelf}
            onAvatarFileChange={handlePhotoUpload}
            isUploadingAvatar={isUploadingAvatar}
            variant="peek"
          />
        </div>

        {showActions && (
          <div className="flex flex-col gap-2 border-t border-[#dde4e9] bg-white px-6 py-4 sm:px-8">
            {showInvite && (
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
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[7px] border border-[#53886b]/30 bg-[#eaf1ee] px-3.5 text-[13px] font-semibold text-[#3f6a52] transition-colors hover:bg-[#e0ebe5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Send / Resend Invitation</span>
              </button>
            )}

            {showManageRow && (
              <div className="flex gap-2">
                {onEditHierarchy && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditHierarchy(employee);
                    }}
                    className={btnPrimary}
                  >
                    <Pencil className="h-3.5 w-3.5" />
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
                    className={btnSecondary}
                  >
                    Full View
                  </button>
                )}
              </div>
            )}

            {showViewProfile && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewFullProfile?.(employee);
                }}
                className={`${btnPrimary} w-full`}
              >
                View profile
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
