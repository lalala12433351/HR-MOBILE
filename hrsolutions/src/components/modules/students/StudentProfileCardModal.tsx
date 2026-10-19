'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Mail,
  Phone,
  GraduationCap,
  CreditCard,
  CalendarCheck,
  UserCheck,
  Shield,
  BookOpen,
  Camera,
  Edit2,
  Check,
  Users,
  ChevronDown,
} from 'lucide-react';
import { Student, AttendanceRecord, Organization } from '@/types';
import { StudentAttendanceLogModal } from './StudentAttendanceLogModal';
import { buildStudentIdCardDraft, IdCardStudio } from '../../print/IdCardStudio';
import { resolveAvatarDataUrl, shouldUseNativeAvatarPicker } from '@/utils/avatarUpload';

interface StudentProfileCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  attendanceRecords?: AttendanceRecord[];
  onUpdateStudent?: (updatedStudent: Student) => void;
  academicBatches?: {
    id: string;
    grade: string;
    section: string;
    startTime?: string;
    endTime?: string;
    graceMinutes?: number;
  }[];
  organization?: Organization | null;
}

export const StudentProfileCardModal: React.FC<StudentProfileCardModalProps> = ({
  isOpen,
  onClose,
  student,
  attendanceRecords = [],
  onUpdateStudent,
  academicBatches = [],
  organization,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showIdCard, setShowIdCard] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [grade, setGrade] = useState('');
  const [section, setSection] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [status, setStatus] = useState<'Active' | 'On Leave' | 'Suspended'>('Active');

  const uniqueBatchGrades = useMemo(() => {
    const s = new Set<string>();
    academicBatches.forEach((b) => {
      if (b.grade) s.add(b.grade);
    });
    return Array.from(s);
  }, [academicBatches]);

  const availableBatchSections = useMemo(() => {
    const s = new Set<string>();
    if (grade) {
      academicBatches
        .filter((b) => b.grade.toLowerCase() === grade.toLowerCase())
        .forEach((b) => {
          if (b.section) s.add(b.section);
        });
    }
    if (s.size === 0) {
      academicBatches.forEach((b) => {
        if (b.section) s.add(b.section);
      });
    }
    return Array.from(s);
  }, [grade, academicBatches]);

  useEffect(() => {
    if (student) {
      setName(student.name || '');
      setRollNumber(student.rollNumber || '');
      setGrade(student.grade || '');
      setSection(student.section || '');
      setPhone(student.phone && student.phone !== '—' ? student.phone : '');
      setEmail(student.email || '');
      setGuardianName(student.guardianName || '');
      setGuardianPhone(student.guardianPhone && student.guardianPhone !== '—' ? student.guardianPhone : '');
      setStatus(student.status || 'Active');
      setIsEditing(false);
      setShowIdCard(false);
    }
  }, [student, isOpen]);

  if (!isOpen || !student) return null;

  const applyStudentAvatar = (dataUrl: string) => {
    if (!onUpdateStudent) return;
    onUpdateStudent({
      ...student,
      avatar: dataUrl,
    });
  };

  const handleAvatarPick = async () => {
    try {
      if (shouldUseNativeAvatarPicker()) {
        const dataUrl = await resolveAvatarDataUrl();
        if (dataUrl) applyStudentAvatar(dataUrl);
        return;
      }
      avatarInputRef.current?.click();
    } catch (err) {
      console.error('Failed to compress student avatar picture:', err);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const dataUrl = await resolveAvatarDataUrl(file);
      if (dataUrl) applyStudentAvatar(dataUrl);
    } catch (err) {
      console.error('Failed to compress student avatar picture:', err);
    }
  };

  // Handle Save Details
  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rollNumber.trim()) return;

    const matchedBatch = academicBatches.find(
      (b) => b.grade.toLowerCase() === grade.toLowerCase() && (!section || b.section.toLowerCase() === section.toLowerCase())
    ) || academicBatches.find(
      (b) => b.grade.toLowerCase() === grade.toLowerCase()
    );

    const updated: Student = {
      ...student,
      name: name.trim(),
      rollNumber: rollNumber.trim(),
      grade: grade.trim() || student.grade,
      section: section.trim() || student.section || '',
      phone: phone.trim() || '—',
      email: email.trim() || student.email,
      guardianName: guardianName.trim(),
      guardianPhone: guardianPhone.trim() || '',
      status: status,
      ...(matchedBatch ? {
        shiftTiming: {
          startTime: matchedBatch.startTime || '08:30',
          endTime: matchedBatch.endTime || '15:30',
          shiftName: `${matchedBatch.grade} ${matchedBatch.section}`,
          graceMinutes: matchedBatch.graceMinutes || 15,
        }
      } : {}),
    };

    if (onUpdateStudent) {
      onUpdateStudent(updated);
    }
    setIsEditing(false);
  };

  const statusStr = (student.status || 'Active').toUpperCase();

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-[var(--bg-surface)] border-l border-[var(--border-color)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-[var(--text-primary)] cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="p-4 sm:p-6 sm:px-8 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0 gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] truncate">
                  {isEditing ? 'Edit Student Profile' : 'Student Profile'}
                </h3>
                <span className="text-[11px] font-mono font-semibold text-[var(--text-muted)] block truncate">
                  {student.studentId || `STU-${student.rollNumber}`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isEditing && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowIdCard(true)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  >
                    <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                    <span>ID card</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  >
                    <Edit2 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span>Edit</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-2 cursor-pointer rounded-lg hover:bg-[var(--bg-surface-subtle)] transition-colors shrink-0"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <input
            type="file"
            ref={avatarInputRef}
            onChange={handleAvatarChange}
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />

          {/* Modal Body */}
          <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1">
            {!isEditing ? (
              /* VIEW MODE */
              <div className="space-y-5 text-xs">
                {/* 1. Header Profile Photo & Title */}
                <div className="flex flex-col items-center text-center space-y-1.5">
                  <div className="relative group">
                    <img
                      src={
                        student.avatar ||
                        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
                      }
                      alt={student.name}
                      className="w-20 h-20 rounded-full object-cover ring-4 ring-slate-100 shadow-md"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAvatarPick()}
                      title="Change Student Photo"
                      className="absolute bottom-0 right-0 p-1.5 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-md border-2 border-white transition-all cursor-pointer flex items-center justify-center group-hover:scale-105"
                    >
                      <Camera className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="pt-1">
                    <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                      {student.name}
                    </h2>
                    <p className="text-xs text-blue-600 font-semibold mt-0.5">
                      {student.grade || '—'} {student.section ? `• Section ${student.section}` : ''}
                    </p>
                  </div>

                  {/* Status Pill */}
                  <div className="pt-0.5">
                    <span
                      className={`inline-flex items-center px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                        statusStr === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : statusStr.includes('LEAVE')
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {statusStr === 'ACTIVE' ? 'ACTIVE STUDENT' : statusStr}
                    </span>
                  </div>
                </div>

                {/* 2. Contact Meta Details */}
                <div className="p-4 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-[var(--text-secondary)]">
                      <Mail className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <span className="font-semibold text-[var(--text-primary)] truncate">
                        {student.email || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-[var(--text-secondary)]">
                      <Phone className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <span className="font-semibold text-[var(--text-primary)] font-mono">
                        {student.phone && student.phone !== '—' ? student.phone : 'No Mobile Added'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)]/60">
                    <div className="flex items-center gap-2.5 text-[var(--text-secondary)]">
                      <BookOpen className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      <span className="text-[var(--text-muted)] font-medium">Roll Number:</span>
                    </div>
                    <span className="font-bold font-mono text-blue-600 bg-blue-100/60 px-2.5 py-0.5 rounded-lg border border-blue-200/80">
                      {student.rollNumber}
                    </span>
                  </div>
                </div>

                {/* 3. Parent / Guardian Details */}
                <div className="p-4 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Parent / Guardian Contact
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                        {(student.guardianName || student.name || 'S').charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-[var(--text-primary)] text-xs">
                          {student.guardianName || '—'}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono">
                          {student.guardianPhone || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* EDIT MODE */
              <form id="edit-student-form" onSubmit={handleSaveStudent} className="space-y-4 text-xs">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                    Student Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Aarav Sharma"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                  />
                </div>

                {/* Roll Number & Status Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                      Roll Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rollNumber}
                      onChange={(e) => setRollNumber(e.target.value)}
                      placeholder="e.g. 10A-01"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-mono font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                      Enrollment Status
                    </label>
                    <div className="relative">
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="w-full appearance-none rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2.5 pr-8 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all cursor-pointer"
                      >
                        <option value="Active">Active</option>
                        <option value="On Leave">On Leave</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Grade & Section Grid */}
                {academicBatches.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                        Grade / Class
                      </label>
                      <div className="relative">
                        <select
                          value={grade}
                          onChange={(e) => {
                            const newG = e.target.value;
                            setGrade(newG);
                            const matching = academicBatches.filter((b) => b.grade.toLowerCase() === newG.toLowerCase());
                            if (matching.length > 0) {
                              setSection(matching[0].section || '');
                            }
                          }}
                          className="w-full appearance-none rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 pr-9 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all cursor-pointer"
                          required
                        >
                          <option value="">Select Grade</option>
                          {uniqueBatchGrades.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                        Section
                      </label>
                      <div className="relative">
                        <select
                          value={section}
                          onChange={(e) => setSection(e.target.value)}
                          disabled={!grade}
                          className="w-full appearance-none rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 pr-9 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all cursor-pointer disabled:bg-[var(--bg-surface-subtle)] disabled:text-[var(--text-muted)]"
                          required
                        >
                          <option value="">Select Section</option>
                          {availableBatchSections.map((s) => (
                            <option key={s} value={s}>
                              Section {s}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800 font-medium">
                    No academic batches configured. Please set up batches in Attendance Settings to reassign student grade and section.
                  </div>
                )}

                {/* Email & Student Phone Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                      School Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@school.edu"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                      Student Phone (10 Digits)
                    </label>
                    <input
                      type="tel"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="e.g. 9876543210"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-mono font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                    />
                  </div>
                </div>

                {/* Guardian Name & Phone Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                      Parent / Guardian Name
                    </label>
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="e.g. Rajesh Sharma"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                      Guardian Phone (10 Digits)
                    </label>
                    <input
                      type="tel"
                      maxLength={10}
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="e.g. 9845012345"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-mono font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                    />
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 sm:px-8 border-t border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/70 flex items-center justify-end gap-2.5 shrink-0 pb-7 sm:pb-5">
            {!isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowAttendanceModal(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-sm active:scale-98 cursor-pointer"
                >
                  <CalendarCheck className="w-4 h-4" />
                  <span>View Attendance Log</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] font-bold text-xs transition-all cursor-pointer"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-5 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] font-bold text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="edit-student-form"
                  className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-md shadow-blue-600/20 transition-all"
                >
                  Save Changes
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Embedded Student Attendance Log Modal */}
      {showAttendanceModal && (
        <StudentAttendanceLogModal
          isOpen={showAttendanceModal}
          onClose={() => setShowAttendanceModal(false)}
          student={student}
          attendanceRecords={attendanceRecords}
        />
      )}
      {showIdCard && (
        <IdCardStudio
          key={student.id}
          title="Student ID card"
          roleFieldLabel="Grade & section"
          audience="student"
          initial={buildStudentIdCardDraft(student, organization)}
          onClose={() => setShowIdCard(false)}
        />
      )}
    </>
  );
};
