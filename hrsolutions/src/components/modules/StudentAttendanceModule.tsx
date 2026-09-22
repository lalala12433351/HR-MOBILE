'use client';

import React, { useState, useMemo } from 'react';
import { AppState } from '../../services/store';
import { Student } from '../../types';
import { KekaAttendanceModule } from './KekaAttendanceModule';
import { StudentOnboardingPasswordModal } from './students/StudentOnboardingPasswordModal';
import { useApp } from '@/context/AppContext';

interface StudentAttendanceModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onCheckInAttendance?: () => void;
}

export const StudentAttendanceModule: React.FC<StudentAttendanceModuleProps> = (props) => {
  const { state, onUpdateState } = props;
  const { triggerToast } = useApp();
  
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Find the currently logged in student
  const activeStudent = useMemo<Student | null>(() => {
    const allStudents = state.students || [];
    if (!state.currentPersona) return allStudents[0] || null;

    const matched = allStudents.find(
      (s) =>
        s.id === state.currentPersona.id ||
        (s.email && s.email.toLowerCase() === state.currentPersona.email?.toLowerCase()) ||
        (s.name && s.name.toLowerCase() === state.currentPersona.name?.toLowerCase()) ||
        (s.rollNumber && s.rollNumber.toLowerCase() === state.currentPersona.email?.toLowerCase())
    );

    return matched || allStudents[0] || null;
  }, [state.students, state.currentPersona]);

  const isStudentPersona = state.currentPersona?.role === 'student';
  const needsPasswordReset = isStudentPersona && activeStudent && !activeStudent.hasResetPassword;

  const handleCompletePasswordReset = (updatedStudent: Student) => {
    onUpdateState((prev) => ({
      ...prev,
      students: (prev.students || []).map((s) => (s.id === updatedStudent.id ? updatedStudent : s)),
      currentPersona: {
        ...prev.currentPersona,
        password: updatedStudent.password,
      },
    }));

    triggerToast({
      title: 'Password Updated',
      message: 'Your personal student password has been set successfully.',
      type: 'system',
    });
  };

  return (
    <div className="space-y-4">
      {/* First-Time Student Onboarding Banner */}
      {needsPasswordReset && activeStudent && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-blue-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              First-Time Student Security Setup
            </h3>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              You are currently using your temporary default roll number password. Please set a personal password to secure your academic records.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs font-bold shadow-xs transition-all shrink-0 cursor-pointer"
          >
            Set New Password
          </button>
        </div>
      )}

      {/* Main Keka Attendance Interface in Student Mode */}
      <KekaAttendanceModule {...props} mode="student" />

      {/* Student Onboarding / Password Reset Modal */}
      {activeStudent && (
        <StudentOnboardingPasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          student={activeStudent}
          onComplete={handleCompletePasswordReset}
        />
      )}
    </div>
  );
};
