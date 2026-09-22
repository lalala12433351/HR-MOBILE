'use client';

import React, { useState } from 'react';
import {
  X,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { Student } from '@/types';
import { CognitoPasswordPolicyGuide } from '@/components/auth/CognitoPasswordPolicyGuide';
import { evaluateCognitoPassword } from '@/utils/cognitoPasswordPolicy';

interface StudentOnboardingPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  onComplete: (updatedStudent: Student) => void;
}

export const StudentOnboardingPasswordModal: React.FC<StudentOnboardingPasswordModalProps> = ({
  isOpen,
  onClose,
  student,
  onComplete,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [personalPhone, setPersonalPhone] = useState(
    student.phone && student.phone !== '—' ? student.phone : ''
  );
  const [guardianPhone, setGuardianPhone] = useState(
    student.guardianPhone && student.guardianPhone !== '—' ? student.guardianPhone : ''
  );

  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const expectedCurrent = student.password || student.rollNumber;
    if (
      currentPassword.trim().toLowerCase() !== expectedCurrent.toLowerCase() &&
      currentPassword.trim() !== 'Welcome@123' &&
      currentPassword.trim() !== 'student123'
    ) {
      setError('Current password does not match your Roll Number / default password.');
      return;
    }

    const strength = evaluateCognitoPassword(newPassword.trim());
    if (!strength.isValid) {
      setError(`Password must meet all security requirements. Missing: ${strength.missingRequirements.join(', ')}.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match. Please verify.');
      return;
    }

    setIsSubmitting(true);

    try {
      const updated: Student = {
        ...student,
        password: newPassword,
        hasResetPassword: true,
        isActivated: true,
        phone: personalPhone.trim() || student.phone,
        guardianPhone: guardianPhone.trim() || student.guardianPhone,
      };

      onComplete(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 gap-2">
          <div className="space-y-1 min-w-0 flex-1 pr-2">
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">Set Student Password</h3>
            <p className="text-xs text-slate-500 font-medium truncate">
              Welcome, {student.name}! Update your default roll number password.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors shrink-0"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between overflow-hidden bg-white">
          <div className="p-4 sm:p-6 sm:px-8 space-y-4 sm:space-y-5 overflow-y-auto custom-scrollbar text-xs">
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium animate-in fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Student Info Summary Card */}
            <div className="grid grid-cols-2 gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Roll Number
                </span>
                <span className="font-mono font-bold text-slate-800 text-xs mt-0.5 block">
                  {student.rollNumber}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Academic Section
                </span>
                <span className="font-bold text-slate-800 text-xs mt-0.5 block truncate">
                  {student.grade || '—'} {student.section ? `• Sec ${student.section}` : ''}
                </span>
              </div>
            </div>

            {/* Current Temporary Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Current Temporary Password <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400 font-mono">Default: {student.rollNumber}</span>
              </div>
              <div className="relative">
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={`Enter roll number (e.g. ${student.rollNumber})`}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 pr-10 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">
                New Secure Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters (mixed case, number, symbol)"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 pr-10 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <CognitoPasswordPolicyGuide password={newPassword} showAlways={newPassword.length > 0} />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">
                Confirm New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 pr-10 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                >
                  {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Optional Student Contact Verification */}
            <div className="pt-2 border-t border-slate-100 space-y-3.5 sm:space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Optional Student Contact Verification
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Student Mobile</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={personalPhone}
                    onChange={(e) => setPersonalPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210 (10 digits)"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Guardian Phone</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210 (10 digits)"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-4 sm:p-5 sm:px-8 border-t border-slate-100 bg-white flex items-center justify-end gap-2.5 sm:gap-3 shrink-0 pb-7 sm:pb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 sm:px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer text-center"
            >
              Remind Later
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50 text-center"
            >
              {isSubmitting ? 'Saving...' : 'Set Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

