'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { Student, Employee } from '@/types';
import { saveStoredState } from '@/services/store';
import { api } from '@/services/apiClient';
import { UserAvatar } from '@/components/common/UserAvatar';
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Clock,
  Calendar,
  Layers,
  RotateCcw,
  Sliders,
  Building2,
  Sparkles,
  GraduationCap,
  Users,
  Plus,
  Trash2,
  BookOpen,
  UserCheck,
  Shield,
  FileSpreadsheet,
  CheckCircle2,
  Copy,
  Zap,
} from 'lucide-react';

interface AcademicBatchItem {
  id: string;
  grade: string;
  section: string;
  startTime: string;
  endTime: string;
  graceMinutes?: number;
  workingDays?: string[];
}

interface StudentEntryItem {
  id: string;
  name: string;
  rollNumber: string;
  email: string;
  grade: string;
  section: string;
  guardianName: string;
  guardianPhone: string;
  phone?: string;
  shiftTiming?: {
    startTime: string;
    endTime: string;
    shiftName?: string;
    graceMinutes?: number;
  };
}

const WEEK_DAYS = [
  { key: 'Monday', short: 'Mon', full: 'Monday' },
  { key: 'Tuesday', short: 'Tue', full: 'Tuesday' },
  { key: 'Wednesday', short: 'Wed', full: 'Wednesday' },
  { key: 'Thursday', short: 'Thu', full: 'Thursday' },
  { key: 'Friday', short: 'Fri', full: 'Friday' },
  { key: 'Saturday', short: 'Sat', full: 'Saturday' },
  { key: 'Sunday', short: 'Sun', full: 'Sunday' },
];

export const StudentSetupWizard: React.FC = () => {
  const router = useRouter();
  const { state, updateState, triggerToast } = useApp();

  React.useEffect(() => {
    if (!state.isAuthenticated || !api.getToken()) {
      triggerToast({
        title: 'Authentication Required',
        message: 'Please authenticate with valid credentials before accessing student setup.',
        type: 'warning',
      });
      router.replace('/login');
    }
  }, [state.isAuthenticated, router, triggerToast]);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [isCompleting, setIsCompleting] = useState(false);

  // Step 1: Academic Batches & Grades
  const [academicYear, setAcademicYear] = useState('2026-2027');
  const [batches, setBatches] = useState<AcademicBatchItem[]>([]);
  const [newGradeInput, setNewGradeInput] = useState('');
  const [newSectionInput, setNewSectionInput] = useState('');
  const [newBatchStart, setNewBatchStart] = useState('08:30');
  const [newBatchEnd, setNewBatchEnd] = useState('15:30');

  // Step 2: Student Enrollment Entries
  const [students, setStudents] = useState<StudentEntryItem[]>([]);
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [customStudentGrade, setCustomStudentGrade] = useState('');
  const [customStudentSection, setCustomStudentSection] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

  // Step 3: School Timings & Batch Schedules
  const [selectedScheduleScope, setSelectedScheduleScope] = useState<string>('all');
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('15:30');
  const [gracePeriodMins, setGracePeriodMins] = useState('15');
  const [selectedDays, setSelectedDays] = useState<string[]>(() => {
    if (state.organization?.workingDays && state.organization.workingDays.length > 0) {
      return state.organization.workingDays;
    }
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  });

  const getActiveSchedule = () => {
    if (selectedScheduleScope === 'all') {
      return {
        isAll: true,
        startTime,
        endTime,
        gracePeriodMins,
        workingDays: selectedDays,
        batch: null,
      };
    }
    const b = batches.find((item) => item.id === selectedScheduleScope);
    if (!b) {
      return {
        isAll: true,
        startTime,
        endTime,
        gracePeriodMins,
        workingDays: selectedDays,
        batch: null,
      };
    }
    return {
      isAll: false,
      startTime: b.startTime || startTime,
      endTime: b.endTime || endTime,
      gracePeriodMins: String(b.graceMinutes ?? gracePeriodMins),
      workingDays: b.workingDays && b.workingDays.length > 0 ? b.workingDays : selectedDays,
      batch: b,
    };
  };

  const updateActiveSchedule = (updates: {
    startTime?: string;
    endTime?: string;
    gracePeriodMins?: string;
    workingDays?: string[];
  }) => {
    if (selectedScheduleScope === 'all') {
      if (updates.startTime !== undefined) setStartTime(updates.startTime);
      if (updates.endTime !== undefined) setEndTime(updates.endTime);
      if (updates.gracePeriodMins !== undefined) setGracePeriodMins(updates.gracePeriodMins);
      if (updates.workingDays !== undefined) setSelectedDays(updates.workingDays);
    } else {
      setBatches((prev) =>
        prev.map((b) =>
          b.id === selectedScheduleScope
            ? {
                ...b,
                ...(updates.startTime !== undefined ? { startTime: updates.startTime } : {}),
                ...(updates.endTime !== undefined ? { endTime: updates.endTime } : {}),
                ...(updates.gracePeriodMins !== undefined
                  ? { graceMinutes: Number(updates.gracePeriodMins) || 15 }
                  : {}),
                ...(updates.workingDays !== undefined ? { workingDays: updates.workingDays } : {}),
              }
            : b
        )
      );
    }
  };

  const toggleDayForActiveSchedule = (dayKey: string) => {
    const active = getActiveSchedule();
    let nextDays: string[];
    if (active.workingDays.includes(dayKey)) {
      if (active.workingDays.length <= 1) {
        triggerToast({
          title: 'Selection required',
          message: 'You must select at least 1 working day.',
          type: 'warning',
        });
        return;
      }
      nextDays = active.workingDays.filter((d) => d !== dayKey);
    } else {
      nextDays = WEEK_DAYS.filter((d) => active.workingDays.includes(d.key) || d.key === dayKey).map(
        (d) => d.key
      );
    }
    updateActiveSchedule({ workingDays: nextDays });
  };

  const applyCampusScheduleToAllBatches = () => {
    if (batches.length === 0) {
      triggerToast({
        title: 'No Batches',
        message: 'No batches created yet to apply campus schedule to.',
        type: 'info',
      });
      return;
    }
    setBatches((prev) =>
      prev.map((b) => ({
        ...b,
        startTime,
        endTime,
        graceMinutes: Number(gracePeriodMins) || 15,
        workingDays: [...selectedDays],
      }))
    );
    triggerToast({
      title: 'Schedule Applied',
      message: `Applied campus schedule (${startTime} – ${endTime}) to all ${batches.length} batches.`,
      type: 'success',
    });
  };

  const resetBatchToCampusDefault = (batchId: string) => {
    setBatches((prev) =>
      prev.map((b) =>
        b.id === batchId
          ? {
              ...b,
              startTime,
              endTime,
              graceMinutes: Number(gracePeriodMins) || 15,
              workingDays: [...selectedDays],
            }
          : b
      )
    );
    triggerToast({
      title: 'Reset to Default',
      message: 'Reverted batch timings to match campus default.',
      type: 'info',
    });
  };

  const copyBatchScheduleToAll = (sourceBatch: AcademicBatchItem) => {
    const srcStart = sourceBatch.startTime || startTime;
    const srcEnd = sourceBatch.endTime || endTime;
    const srcGrace = sourceBatch.graceMinutes ?? Number(gracePeriodMins) ?? 15;
    const srcDays =
      sourceBatch.workingDays && sourceBatch.workingDays.length > 0
        ? sourceBatch.workingDays
        : selectedDays;

    setBatches((prev) =>
      prev.map((b) => ({
        ...b,
        startTime: srcStart,
        endTime: srcEnd,
        graceMinutes: srcGrace,
        workingDays: [...srcDays],
      }))
    );
    setStartTime(srcStart);
    setEndTime(srcEnd);
    setGracePeriodMins(String(srcGrace));
    setSelectedDays([...srcDays]);

    triggerToast({
      title: 'Schedule Copied',
      message: `Copied ${sourceBatch.grade} schedule (${srcStart} – ${srcEnd}) to all batches.`,
      type: 'success',
    });
  };

  const addBatch = () => {
    if (!newGradeInput.trim()) return;
    const newB: AcademicBatchItem = {
      id: `b_${Date.now()}_${Math.floor(Math.random() * 100)}`,
      grade: newGradeInput.trim(),
      section: newSectionInput.trim(),
      startTime: newBatchStart || startTime || '08:30',
      endTime: newBatchEnd || endTime || '15:30',
      graceMinutes: Number(gracePeriodMins) || 15,
      workingDays: [...selectedDays],
    };
    setBatches([...batches, newB]);
    setNewGradeInput('');
    setNewSectionInput('');
  };

  const removeBatch = (id: string) => {
    setBatches(batches.filter((b) => b.id !== id));
    if (selectedScheduleScope === id) {
      setSelectedScheduleScope('all');
    }
  };

  // Preset Batch Quick Fillers
  const addQuickPresetBatches = (presetType: 'highschool' | 'primary' | 'middle') => {
    let presetList: Array<{ grade: string; section: string }> = [];
    if (presetType === 'highschool') {
      presetList = [
        { grade: 'Grade 9', section: 'A' },
        { grade: 'Grade 9', section: 'B' },
        { grade: 'Grade 10', section: 'A' },
        { grade: 'Grade 10', section: 'B' },
        { grade: 'Grade 11', section: 'Science' },
        { grade: 'Grade 12', section: 'Science' },
      ];
    } else if (presetType === 'primary') {
      presetList = [
        { grade: 'Class 1', section: 'A' },
        { grade: 'Class 2', section: 'A' },
        { grade: 'Class 3', section: 'A' },
        { grade: 'Class 4', section: 'A' },
        { grade: 'Class 5', section: 'A' },
      ];
    } else {
      presetList = [
        { grade: 'Class 6', section: 'A' },
        { grade: 'Class 7', section: 'A' },
        { grade: 'Class 8', section: 'A' },
      ];
    }

    const newBatches: AcademicBatchItem[] = presetList.map((p, idx) => ({
      id: `b_preset_${Date.now()}_${idx}`,
      grade: p.grade,
      section: p.section,
      startTime: startTime || '08:30',
      endTime: endTime || '15:30',
      graceMinutes: Number(gracePeriodMins) || 15,
      workingDays: [...selectedDays],
    }));

    setBatches((prev) => [...prev, ...newBatches]);
    triggerToast({
      title: 'Preset Batches Added',
      message: `Added ${presetList.length} academic batches for ${presetType.toUpperCase()}.`,
      type: 'success',
    });
  };

  // Auto Generate Sample Students Roster
  const populateSampleStudents = () => {
    const sampleNames = [
      { name: 'Aarav Sharma', guardian: 'Rajesh Sharma', phone: '9876543210' },
      { name: 'Diya Patel', guardian: 'Sanjay Patel', phone: '9812345678' },
      { name: 'Rohan Mehta', guardian: 'Vikram Mehta', phone: '9988776655' },
      { name: 'Ananya Iyer', guardian: 'Raman Iyer', phone: '9765432109' },
      { name: 'Vivaan Reddy', guardian: 'Kiran Reddy', phone: '9845012345' },
      { name: 'Ishita Kapoor', guardian: 'Sunil Kapoor', phone: '9911223344' },
      { name: 'Kabir Verma', guardian: 'Amit Verma', phone: '9822334455' },
      { name: 'Sanya Gupta', guardian: 'Deepak Gupta', phone: '9744556677' },
    ];

    const targetBatches = batches.length > 0 ? batches : [
      { id: 'b_1', grade: '', section: 'A', startTime: '08:30', endTime: '15:30' },
    ];

    const generated: StudentEntryItem[] = sampleNames.map((s, idx) => {
      const b = targetBatches[idx % targetBatches.length];
      const rollNum = `${b.grade.replace(/\s+/g, '')}-${String(idx + 1).padStart(2, '0')}`;
      const email = `${s.name.toLowerCase().replace(/\s+/g, '.')}@school.edu`;

      return {
        id: `stud_sample_${Date.now()}_${idx}`,
        name: s.name,
        rollNumber: rollNum,
        email,
        grade: b.section ? `${b.grade} - ${b.section}` : b.grade,
        section: b.section,
        guardianName: s.guardian,
        guardianPhone: s.phone,
        phone: '—',
        shiftTiming: {
          startTime: b.startTime || '08:30',
          endTime: b.endTime || '15:30',
          shiftName: b.section ? `${b.grade} - ${b.section}` : b.grade,
          graceMinutes: b.graceMinutes ?? 15,
        },
      };
    });

    setStudents((prev) => [...generated, ...prev]);
    triggerToast({
      title: 'Sample Roster Generated',
      message: `Enrolled ${sampleNames.length} sample students mapped across active batches.`,
      type: 'success',
    });
  };

  const addStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = studentName.trim();
    const cleanRoll = rollNumber.trim();
    const cleanEmail = studentEmail.trim();
    const cleanGName = guardianName.trim();
    const cleanGPhone = guardianPhone.trim();
    const cleanSPhone = studentPhone.trim();

    if (!cleanName || cleanName.length < 2 || !/[a-zA-Z]/.test(cleanName)) {
      triggerToast({
        title: 'Invalid Student Name',
        message: 'Full Name must contain at least 2 characters with valid alphabetic letters.',
        type: 'warning',
      });
      return;
    }

    if (!cleanRoll) {
      triggerToast({
        title: 'Missing Roll Number',
        message: 'Roll / Student ID is required to enroll a student.',
        type: 'warning',
      });
      return;
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      triggerToast({
        title: 'Invalid Email Format',
        message: 'Please provide a valid email address (e.g., student@school.edu).',
        type: 'warning',
      });
      return;
    }

    if (cleanGName && !/[a-zA-Z]/.test(cleanGName)) {
      triggerToast({
        title: 'Invalid Guardian Name',
        message: 'Guardian Name must contain valid alphabetic letters.',
        type: 'warning',
      });
      return;
    }
  
    const gDigits = cleanGPhone.replace(/\D/g, '');
    if (cleanGPhone && gDigits.length !== 10) {
      triggerToast({
        title: 'Invalid Guardian Phone',
        message: 'Guardian phone number must be exactly 10 digits (e.g. 9876543210).',
        type: 'warning',
      });
      return;
    }

    const sDigits = cleanSPhone.replace(/\D/g, '');
    if (cleanSPhone && sDigits.length !== 10) {
      triggerToast({
        title: 'Invalid Student Mobile',
        message: 'Student mobile number must be exactly 10 digits (e.g. 9876543210).',
        type: 'warning',
      });
      return;
    }

    const matchedBatch = batches.find((b) => b.id === selectedBatchId);
    const resolvedGrade = matchedBatch
      ? (matchedBatch.section ? `${matchedBatch.grade} - ${matchedBatch.section}` : matchedBatch.grade)
      : (customStudentGrade.trim() ? (customStudentSection.trim() ? `${customStudentGrade.trim()} - ${customStudentSection.trim()}` : customStudentGrade.trim()) : '');
    const resolvedSection = matchedBatch ? matchedBatch.section : customStudentSection.trim();

    const finalEmail =
      cleanEmail ||
      `${cleanName.toLowerCase().replace(/\s+/g, '.')}@school.edu`;

    const newS: StudentEntryItem = {
      id: `stud_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: cleanName,
      rollNumber: cleanRoll,
      email: finalEmail,
      grade: resolvedGrade,
      section: resolvedSection,
      guardianName: cleanGName || '',
      guardianPhone: cleanGPhone || '',
      phone: cleanSPhone || '',
      shiftTiming: {
        startTime: matchedBatch?.startTime || startTime || '08:30',
        endTime: matchedBatch?.endTime || endTime || '15:30',
        shiftName: matchedBatch ? (matchedBatch.section ? `${matchedBatch.grade} - ${matchedBatch.section}` : matchedBatch.grade) : (resolvedGrade || ''),
        graceMinutes: matchedBatch?.graceMinutes ?? (Number(gracePeriodMins) || 15),
      },
    };

    setStudents([newS, ...students]);
    setStudentName('');
    setRollNumber('');
    setStudentEmail('');
    setStudentPhone('');
    setGuardianName('');
    setGuardianPhone('');

    triggerToast({
      title: 'Student Enrolled',
      message: `${cleanName} (${cleanRoll}) enrolled into ${resolvedGrade}.`,
      type: 'success',
    });
  };

  const removeStudent = (id: string) => {
    setStudents(students.filter((s) => s.id !== id));
  };

  const handleFinishSetup = async () => {
    setIsCompleting(true);
    try {
      const formattedStudents: Student[] = students.map((s, idx) => {
        const matchedBatch = batches.find(
          (b) =>
            b.id === (s as any).batchId ||
            `${b.grade} - ${b.section}`.toLowerCase() === (s.grade || '').toLowerCase() ||
            b.grade.toLowerCase() === (s.grade || '').toLowerCase()
        );
        const batchStart = matchedBatch?.startTime || startTime || '08:30';
        const batchEnd = matchedBatch?.endTime || endTime || '15:30';
        const batchGrace = matchedBatch?.graceMinutes ?? (Number(gracePeriodMins) || 15);

        return {
          id: s.id || `stud_${Date.now()}_${idx}`,
          studentId: s.rollNumber || `STU-${1000 + idx + 1}`,
          name: s.name,
          email: s.email,
          rollNumber: s.rollNumber,
          grade: s.grade,
          section: s.section,
          avatar: '',
          phone: s.phone || '—',
          guardianName: s.guardianName,
          guardianPhone: s.guardianPhone,
          status: 'Active',
          shiftTiming: {
            startTime: batchStart,
            endTime: batchEnd,
            shiftName: matchedBatch ? `${matchedBatch.grade} - ${matchedBatch.section}` : s.grade || 'Standard Class',
            graceMinutes: batchGrace,
          },
        };
      });

      const batchSyncRes = await api.institute.bulkSyncBatches(
        batches.map((b) => ({
          id: b.id,
          grade: b.grade,
          section: b.section,
          startTime: b.startTime || startTime || '08:30',
          endTime: b.endTime || endTime || '15:30',
          workingDays: b.workingDays && b.workingDays.length > 0 ? b.workingDays : selectedDays,
        }))
      );

      if (!batchSyncRes.success) {
        console.debug('Backend batch sync note:', batchSyncRes.error?.message);
      }

      if (formattedStudents.length > 0) {
        const studentSyncRes = await api.institute.bulkSyncStudents(formattedStudents);
        if (!studentSyncRes.success) {
          console.debug('Backend student sync note:', studentSyncRes.error?.message);
        }
      }

      updateState((prev) => {
        const isPersonInEmployees = (prev.employees || []).some(
          (e) =>
            (state.currentPersona?.email && e.email?.toLowerCase() === state.currentPersona.email.toLowerCase()) ||
            (state.currentPersona?.id && e.id === state.currentPersona.id)
        );

        const adminStaffMember: Employee | null = isPersonInEmployees
          ? null
          : {
              id: state.currentPersona?.id || `staff_${Date.now()}`,
              employeeId: 'EMP001',
              name: state.currentPersona?.name || 'Institutional Administrator',
              fullName: state.currentPersona?.name || 'Institutional Administrator',
              email: state.currentPersona?.email || 'admin@school.edu',
              password: state.currentPersona?.password || 'password123',
              phone: '—',
              avatar: state.currentPersona?.avatar || '',
              department: 'Administration' as any,
              team: 'Academic Leadership',
              designation: state.currentPersona?.designation || 'Principal / Dean',
              role: 'super_admin',
              joiningDate: new Date().toISOString().substring(0, 10),
              employmentType: 'Full-time',
              location: state.organization?.officeLocation?.address || '',
              officeName: state.organization?.officeLocation?.address || '',
              skills: ['Institutional Leadership', 'Academic Operations', 'Administration'],
              bankDetails: {
                accountNumber: '—',
                ifscCode: 'HDFC000182',
                bankName: 'HDFC Bank',
              },
              salaryDetails: {
                basic: 0,
                hra: 0,
                specialAllowance: 0,
                pfDeduction: 0,
                taxDeduction: 0,
                netPayable: 0,
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

        const nextFullState = {
          ...prev,
          students: formattedStudents,
          employees: adminStaffMember ? [adminStaffMember, ...(prev.employees || [])] : prev.employees,
          organization: {
            ...prev.organization,
            industry: prev.organization?.industry || 'Institute',
            workingDays: selectedDays,
            workingHours: {
              start: startTime,
              end: endTime,
            },
          },
          customOptions: {
            ...prev.customOptions,
            academicBatches: batches.map((b) => ({
              id: b.id,
              grade: b.grade,
              section: b.section,
              startTime: b.startTime || startTime || '08:30',
              endTime: b.endTime || endTime || '15:30',
              graceMinutes: b.graceMinutes ?? (Number(gracePeriodMins) || 15),
              workingDays: b.workingDays && b.workingDays.length > 0 ? b.workingDays : selectedDays,
            })),
          },
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: state.currentPersona.name,
              action: 'STUDENT_ONBOARDING_COMPLETED',
              entity: 'StudentRoster',
              entityId: 'roster_setup_01',
              ipAddress: '127.0.0.1',
              details: `Setup completed with ${formattedStudents.length} students across ${batches.length} batches for Academic Year ${academicYear} (${selectedDays.join(', ')}).`,
            },
            ...prev.auditLogs,
          ],
          notifications: [
            {
              id: `notif_${Date.now()}`,
              title: 'Student Setup Complete',
              message: `${formattedStudents.length} students enrolled across ${batches.length} batches (${selectedDays.length} working days). Student Directory is live.`,
              timestamp: 'Just now',
              category: 'HR' as const,
              priority: 'medium' as const,
              read: false,
              linkModule: 'student-directory',
              linkTab: 'students',
              actorName: state.currentPersona.name,
              actionLabel: 'View Directory',
            },
            ...prev.notifications,
          ],
        };
        saveStoredState(nextFullState);
        return nextFullState;
      });

      triggerToast({
        title: 'Setup Completed',
        message: `Enrolled ${formattedStudents.length} students across ${batches.length} batches with ${selectedDays.length} active weekly days`,
        type: 'system',
      });

      router.push('/student-directory');
    } catch (err: any) {
      alert(`Setup error: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsCompleting(false);
    }
  };

  const stepsList = [
    { num: 1, title: 'Academic Batches', subtitle: 'Grades & Sections' },
    { num: 2, title: 'Student Enrollment', subtitle: 'Roster & Passwords' },
    { num: 3, title: 'Campus Timings', subtitle: 'Hours & Working Days' },
    { num: 4, title: 'Review & Launch', subtitle: 'Confirm & Activate' },
  ];

  const orgName = state.organization?.name || 'Academic Institution';
  const activeSchedule = getActiveSchedule();

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[var(--text-primary)] flex flex-col justify-start items-center px-4 py-8 sm:px-6 md:px-8 font-sans">
      <div className="max-w-4xl w-full space-y-6">
        {/* Executive Header conforming strictly to DESIGN.md */}
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[#e2e8f0] p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-[#2563eb] text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <GraduationCap className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[#0f172a] tracking-tight">
                  Academic Student Body Setup
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                  Session {academicYear}
                </span>
              </div>
              <p className="text-xs text-[#64748b] font-medium mt-0.5">
                Configuring workspace & student roster for <span className="font-semibold text-[var(--text-primary)]">{orgName}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push('/student-directory')}
            className="px-3.5 py-2 rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] hover:bg-[#eff6ff] hover:border-[#bfdbfe] text-[#64748b] hover:text-[#2563eb] text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shrink-0"
          >
            <span>Skip to Directory</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Elevated Rhythmic Stepper Progress Bar (DESIGN.md Stepper) */}
        <div className="bg-[var(--bg-surface)] rounded-lg border border-[#e2e8f0] p-4 sm:p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
          {/* Mobile Stepper Header */}
          <div className="block sm:hidden space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0f172a]">
                Step {currentStep}: {stepsList[currentStep - 1].title}
              </span>
              <span className="text-[11px] font-bold text-[#2563eb]">
                {currentStep} of 4
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {stepsList.map((st) => (
                <div
                  key={st.num}
                  onClick={() => {
                    if (st.num < currentStep) setCurrentStep(st.num as any);
                  }}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    currentStep >= st.num ? 'bg-[#2563eb]' : 'bg-[#e2e8f0]'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Desktop Rhythmic Stepper */}
          <div className="hidden sm:block">
            <div className="relative flex items-center justify-between">
              {/* Background continuous track bar */}
              <div className="absolute left-10 right-10 top-4.5 -translate-y-1/2 h-1 bg-[#e2e8f0] rounded-full z-0 overflow-hidden">
                <div
                  className="h-full bg-[#2563eb] transition-all duration-500 rounded-full"
                  style={{
                    width: `${((currentStep - 1) / (stepsList.length - 1)) * 100}%`,
                  }}
                />
              </div>

              {/* Stepper Nodes */}
              {stepsList.map((st) => {
                const isDone = currentStep > st.num;
                const isCurrent = currentStep === st.num;

                return (
                  <div
                    key={st.num}
                    onClick={() => {
                      if (st.num < currentStep) setCurrentStep(st.num as any);
                    }}
                    className={`relative z-10 flex flex-col items-center group ${
                      st.num < currentStep ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all  ${
                        isDone
                          ? 'bg-[#2563eb] text-white ring-2 ring-blue-500'
                          : isCurrent
                          ? 'bg-[#2563eb] text-white ring-4 ring-blue-100 shadow-md shadow-blue-500/20'
                          : 'bg-[#f1f5f9] text-[#64748b] border border-[#e2e8f0] group-hover:bg-[#e2e8f0]'
                      }`}
                      style={{ color: isDone || isCurrent ? '#ffffff' : '#64748b' }}
                    >
                      {isDone ? (
                        <Check className="w-4 h-4 text-white stroke-[2.5]" />
                      ) : (
                        <span>{st.num}</span>
                      )}
                    </div>

                    <div className="text-center mt-2">
                      <p
                        className={`text-xs font-semibold transition-colors ${
                          isCurrent
                            ? 'text-[#2563eb] font-bold'
                            : isDone
                            ? 'text-[#0f172a]'
                            : 'text-[#64748b]'
                        }`}
                      >
                        {st.title}
                      </p>
                      <p className="text-[11px] text-[#64748b] mt-0.5">
                        {st.subtitle}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-[var(--bg-surface)] rounded-lg sm:rounded-3xl border border-[#e2e8f0] p-5 sm:p-7 md:p-8 space-y-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
          {/* STEP 1: Academic Batches */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[#0f172a] flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#2563eb]" />
                    <span>Academic Batches & Grade Levels</span>
                  </h2>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    Configure classroom grades and sections for Academic Session {academicYear}.
                  </p>
                </div>

                {/* Quick Add Presets Ribbon */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-[var(--text-muted)] font-semibold mr-1 hidden lg:inline">Quick Presets:</span>
                  <button
                    type="button"
                    onClick={() => addQuickPresetBatches('primary')}
                    className="px-2.5 py-1.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:bg-[#eff6ff] hover:border-[#bfdbfe] text-xs font-semibold text-[var(--text-secondary)] hover:text-[#2563eb] transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-[#2563eb]" />
                    <span>Primary (1-5)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuickPresetBatches('middle')}
                    className="px-2.5 py-1.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:bg-[#eff6ff] hover:border-[#bfdbfe] text-xs font-semibold text-[var(--text-secondary)] hover:text-[#2563eb] transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-[#2563eb]" />
                    <span>Middle (6-8)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuickPresetBatches('highschool')}
                    className="px-2.5 py-1.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:bg-[#eff6ff] hover:border-[#bfdbfe] text-xs font-semibold text-[var(--text-secondary)] hover:text-[#2563eb] transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-[#2563eb]" />
                    <span>High School (9-12)</span>
                  </button>
                </div>
              </div>

              {/* Input Form Row */}
              <div className="p-4 sm:p-5 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Academic Year</label>
                    <input
                      type="text"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      placeholder="2026-2027"
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-semibold text-[#0f172a] placeholder:text-[var(--text-muted)] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-1 lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Grade / Class Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Grade 9, Grade 10"
                      value={newGradeInput}
                      onChange={(e) => setNewGradeInput(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-medium text-[#0f172a] placeholder:text-[var(--text-muted)] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                      Section <span className="text-[var(--text-muted)] font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. A"
                      value={newSectionInput}
                      onChange={(e) => setNewSectionInput(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-medium text-[#0f172a] placeholder:text-[var(--text-muted)] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Start Bell</label>
                    <input
                      type="time"
                      value={newBatchStart}
                      onChange={(e) => setNewBatchStart(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3 py-2.5 text-xs font-semibold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Dismissal</label>
                    <input
                      type="time"
                      value={newBatchEnd}
                      onChange={(e) => setNewBatchEnd(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3 py-2.5 text-xs font-semibold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={addBatch}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-[0.99] text-white text-xs font-bold transition-all cursor-pointer shadow-sm shadow-blue-500/20 flex items-center justify-center gap-1.5"
                    style={{ color: '#ffffff' }}
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Add Batch</span>
                  </button>
                </div>
              </div>

              {/* Batches Table adhering to DESIGN.md */}
              <div className="rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] overflow-hidden text-xs ">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#f8fafc] text-[#64748b] uppercase font-bold text-[10px] border-b border-[#e2e8f0]">
                    <tr>
                      <th className="p-3.5 pl-4">Grade & Section</th>
                      <th className="p-3.5">Schedule & Bell Timings</th>
                      <th className="p-3.5">Working Days</th>
                      <th className="p-3.5 text-right pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-primary)] font-medium">
                    {batches.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-[#64748b]">
                          <p className="font-semibold text-[var(--text-secondary)] text-sm">No grades or batches configured yet</p>
                          <p className="text-xs text-[#64748b] mt-1">
                            Enter grade details above or use quick preset buttons to populate.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      batches.map((b) => (
                        <tr key={b.id} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="p-3.5 pl-4 font-bold text-[#0f172a]">
                            <span>{b.grade}</span>
                            {b.section && (
                              <span className="ml-1.5 font-normal text-[#64748b] text-xs">
                                (Sec {b.section})
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-mono text-[var(--text-secondary)]">
                            {b.startTime || '08:30'} – {b.endTime || '15:30'}
                          </td>
                          <td className="p-3.5 text-[var(--text-secondary)] text-[11px]">
                            {(b.workingDays || selectedDays).length} Days ({(b.workingDays || selectedDays).map(d => d.slice(0,3)).join(', ')})
                          </td>
                          <td className="p-3.5 text-right pr-4">
                            <button
                              type="button"
                              onClick={() => removeBatch(b.id)}
                              className="text-rose-600 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 text-xs font-semibold cursor-pointer transition-colors"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Recessed Summary Ribbon per DESIGN.md */}
              <div className="p-4 rounded-lg bg-[#eff6ff] border border-[#dbeafe] text-xs text-[#1e3a8a] flex items-center justify-between">
                <span className="font-semibold">
                  Configured Batches Count: <strong className="text-[#2563eb] font-bold text-sm ml-1">{batches.length}</strong>
                </span>
                <span className="text-[11px] text-[#64748b]">Click Continue to enroll students into these batches</span>
              </div>
            </div>
          )}

          {/* STEP 2: Student Enrollment */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[#0f172a] flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#2563eb]" />
                    <span>Student Roster Enrollment</span>
                  </h2>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    Enroll students and map them directly into your academic batches.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={populateSampleStudents}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 bg-[#eff6ff] hover:bg-blue-100 text-[#2563eb] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#2563eb]" />
                  <span>Auto-Fill Sample Roster</span>
                </button>
              </div>

              {/* Add Student Form */}
              <form onSubmit={addStudent} className="p-4 sm:p-5 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Aarav Sharma"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value.replace(/[^a-zA-Z\s.'-]/g, ''))}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-medium text-[#0f172a] placeholder:text-[var(--text-muted)] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Roll / Student ID *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 10A-01 or STU-1001"
                      value={rollNumber}
                      onChange={(e) => setRollNumber(e.target.value.replace(/[^a-zA-Z0-9_\-\/]/g, ''))}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-mono font-bold text-[#0f172a] placeholder:text-[var(--text-muted)] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Assigned Batch / Grade</label>
                    {batches.length > 0 ? (
                      <select
                        value={selectedBatchId}
                        onChange={(e) => setSelectedBatchId(e.target.value)}
                        className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-semibold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                      >
                        <option value="">Select Batch (or Custom)</option>
                        {batches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.grade} {b.section ? `(Sec ${b.section})` : ''} ({b.startTime || '08:30'} – {b.endTime || '15:30'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          placeholder="Grade e.g. Class 10"
                          value={customStudentGrade}
                          onChange={(e) => setCustomStudentGrade(e.target.value)}
                          className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3 py-2.5 text-xs text-[#0f172a] outline-none focus:border-[#2563eb]"
                        />
                        <input
                          type="text"
                          placeholder="Sec (A)"
                          value={customStudentSection}
                          onChange={(e) => setCustomStudentSection(e.target.value)}
                          className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3 py-2.5 text-xs text-[#0f172a] outline-none focus:border-[#2563eb]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Email Address (Optional)</label>
                    <input
                      type="email"
                      placeholder="student@school.edu"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-medium text-[#0f172a] placeholder:text-[var(--text-muted)] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Guardian Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Parent Name"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value.replace(/[^a-zA-Z\s.'-]/g, ''))}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-medium text-[#0f172a] placeholder:text-[var(--text-muted)] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">Guardian Phone</label>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="9876543210 (10 digits)"
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-medium text-[#0f172a] placeholder:text-[var(--text-muted)] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-[0.99] text-white text-xs font-bold transition-all cursor-pointer shadow-sm shadow-blue-500/20 flex items-center justify-center gap-1.5"
                    style={{ color: '#ffffff' }}
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Enroll Student</span>
                  </button>
                </div>
              </form>

              {/* Students Table */}
              <div className="rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] overflow-hidden text-xs  max-h-[340px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#f8fafc] text-[#64748b] uppercase font-bold text-[10px] border-b border-[#e2e8f0] sticky top-0 z-10">
                    <tr>
                      <th className="p-3.5 pl-4">Student</th>
                      <th className="p-3.5">Roll No</th>
                      <th className="p-3.5">Grade & Batch</th>
                      <th className="p-3.5">Guardian Contact</th>
                      <th className="p-3.5 text-right pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-primary)] font-medium">
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-[#64748b]">
                          <p className="font-semibold text-[var(--text-secondary)] text-sm">No students enrolled yet</p>
                          <p className="text-xs text-[#64748b] mt-1">
                            Fill in student details above or click &ldquo;Auto-Fill Sample Roster&rdquo; for instant setup.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      students.map((s) => (
                        <tr key={s.id} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="p-3.5 pl-4 font-bold text-[#0f172a]">
                            <div className="flex items-center gap-3">
                              <UserAvatar name={s.name} className="w-8 h-8 text-xs font-bold shrink-0" />
                              <div>
                                <span>{s.name}</span>
                                <span className="block text-[11px] font-normal text-[#64748b]">
                                  {s.email}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono font-bold text-[#2563eb]">
                            {s.rollNumber}
                          </td>
                          <td className="p-3.5 text-[#0f172a]">
                            <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe]">
                              {s.grade}
                            </span>
                          </td>
                          <td className="p-3.5 text-[var(--text-secondary)] font-mono text-[11px]">
                            {s.guardianName} ({s.guardianPhone || '—'})
                          </td>
                          <td className="p-3.5 text-right pr-4">
                            <button
                              type="button"
                              onClick={() => removeStudent(s.id)}
                              className="text-rose-600 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 text-xs font-semibold cursor-pointer transition-colors"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Recessed Summary Ribbon per DESIGN.md */}
              <div className="p-4 rounded-lg bg-[#eff6ff] border border-[#dbeafe] text-xs text-[#1e3a8a] flex items-center justify-between">
                <span className="font-semibold">
                  Enrolled Students Count: <strong className="text-[#2563eb] font-bold text-sm ml-1">{students.length}</strong>
                </span>
                <span className="text-[11px] text-[#64748b]">All accounts will be assigned initial credentials</span>
              </div>
            </div>
          )}

          {/* STEP 3: Campus Timings & Batch Schedules */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#0f172a] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#2563eb]" />
                  <span>Campus Timings & Weekly Schedule</span>
                </h2>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Set default campus hours or customize specific timings and working days for each batch.
                </p>
              </div>

              {/* Batch Selector / Tab Switcher */}
              {batches.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-[#2563eb]" />
                      <span>Select Scope to Configure</span>
                    </span>
                    <span className="text-[11px] font-medium text-[#64748b]">
                      {batches.length} {batches.length === 1 ? 'batch' : 'batches'} active
                    </span>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    {/* Campus Default Tab */}
                    <button
                      type="button"
                      onClick={() => setSelectedScheduleScope('all')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-2 ${
                        selectedScheduleScope === 'all'
                          ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-500/25'
                          : 'bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]'
                      }`}
                      style={selectedScheduleScope === 'all' ? { color: '#ffffff' } : undefined}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Campus Default (All Batches)</span>
                    </button>

                    {/* Per-Batch Tabs */}
                    {batches.map((b) => {
                      const isSelected = selectedScheduleScope === b.id;
                      const hasCustom =
                        (b.startTime && b.startTime !== startTime) ||
                        (b.endTime && b.endTime !== endTime) ||
                        (b.graceMinutes !== undefined && b.graceMinutes !== Number(gracePeriodMins)) ||
                        (b.workingDays && JSON.stringify(b.workingDays) !== JSON.stringify(selectedDays));

                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedScheduleScope(b.id)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-2 ${
                            isSelected
                              ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-500/25'
                              : 'bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]'
                          }`}
                          style={isSelected ? { color: '#ffffff' } : undefined}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>
                            {b.grade} {b.section ? `(Sec ${b.section})` : ''}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              isSelected
                                ? 'bg-blue-400/30 text-white'
                                : hasCustom
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-[#e2e8f0] text-[#64748b]'
                            }`}
                          >
                            {hasCustom ? 'CUSTOM' : 'DEFAULT'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Active Scope Status Ribbon */}
              {selectedScheduleScope !== 'all' && activeSchedule.batch && (
                <div className="p-3.5 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)]">
                      Configuring custom schedule for{' '}
                      <strong className="text-[#0f172a] font-bold">
                        {activeSchedule.batch.grade}{' '}
                        {activeSchedule.batch.section ? `(Section ${activeSchedule.batch.section})` : ''}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => resetBatchToCampusDefault(activeSchedule.batch!.id)}
                      className="px-2.5 py-1 rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[#475569] text-[11px] font-semibold cursor-pointer transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset to Campus Default</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => copyBatchScheduleToAll(activeSchedule.batch!)}
                      className="px-2.5 py-1 rounded-lg border border-blue-200 bg-[#eff6ff] hover:bg-blue-100 text-[#2563eb] text-[11px] font-semibold cursor-pointer transition-colors flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy to All Batches</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Time Inputs Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-4.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)] block">Morning Entry Bell</span>
                    <Clock className="w-4 h-4 text-[#2563eb]" />
                  </div>
                  <input
                    type="time"
                    value={activeSchedule.startTime}
                    onChange={(e) => updateActiveSchedule({ startTime: e.target.value })}
                    className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-mono font-bold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                  />
                </div>

                <div className="p-4.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)] block">Dismissal Time</span>
                    <Clock className="w-4 h-4 text-[#2563eb]" />
                  </div>
                  <input
                    type="time"
                    value={activeSchedule.endTime}
                    onChange={(e) => updateActiveSchedule({ endTime: e.target.value })}
                    className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-mono font-bold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                  />
                </div>

                <div className="p-4.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)] block">Late Grace Buffer (Mins)</span>
                    <Sliders className="w-4 h-4 text-[#2563eb]" />
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={activeSchedule.gracePeriodMins}
                    onChange={(e) => updateActiveSchedule({ gracePeriodMins: e.target.value })}
                    className="w-full rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-mono font-bold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-blue-600/10 transition-all"
                  />
                </div>
              </div>

              {/* Editable Days of the Week Selection */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0f172a] flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#2563eb]" />
                    <span>
                      Weekly Working Days{' '}
                      {activeSchedule.batch
                        ? (activeSchedule.batch.section ? `for ${activeSchedule.batch.grade} (Sec ${activeSchedule.batch.section})` : `for ${activeSchedule.batch.grade}`)
                        : '(Campus Default)'}
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveSchedule({
                          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                        })
                      }
                      className="px-2.5 py-1 rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] hover:bg-[#eff6ff] hover:text-[#2563eb] text-[#64748b] font-semibold cursor-pointer transition-colors"
                    >
                      Mon – Fri (5 Days)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveSchedule({
                          workingDays: [
                            'Monday',
                            'Tuesday',
                            'Wednesday',
                            'Thursday',
                            'Friday',
                            'Saturday',
                          ],
                        })
                      }
                      className="px-2.5 py-1 rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] hover:bg-[#eff6ff] hover:text-[#2563eb] text-[#64748b] font-semibold cursor-pointer transition-colors"
                    >
                      Mon – Sat (6 Days)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveSchedule({
                          workingDays: [
                            'Monday',
                            'Tuesday',
                            'Wednesday',
                            'Thursday',
                            'Friday',
                            'Saturday',
                            'Sunday',
                          ],
                        })
                      }
                      className="px-2.5 py-1 rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] hover:bg-[#eff6ff] hover:text-[#2563eb] text-[#64748b] font-semibold cursor-pointer transition-colors"
                    >
                      All 7 Days
                    </button>
                  </div>
                </div>

                {/* 7 Interactive Day Pill Buttons */}
                <div className="grid grid-cols-7 gap-2">
                  {WEEK_DAYS.map((d) => {
                    const isSelected = activeSchedule.workingDays.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDayForActiveSchedule(d.key)}
                        className={`py-3 sm:py-3.5 px-1 rounded-lg border text-center font-bold text-xs transition-all cursor-pointer active:scale-98 ${
                          isSelected
                            ? 'border-[#2563eb] bg-[#2563eb] text-white shadow-sm shadow-blue-500/25'
                            : 'border-[#e2e8f0] bg-[var(--bg-surface)] text-[#64748b] hover:text-[#0f172a] hover:border-[var(--border-strong)]'
                        }`}
                        style={isSelected ? { color: '#ffffff' } : undefined}
                      >
                        <span className="block text-xs sm:text-sm">{d.short}</span>
                        <span
                          className={`hidden sm:block text-[10px] font-semibold mt-0.5 ${
                            isSelected ? 'text-blue-100' : 'text-[#64748b]'
                          }`}
                        >
                          {isSelected ? 'OPEN' : 'OFF'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="p-4 rounded-lg bg-[#eff6ff] border border-[#dbeafe] text-xs text-[#1e3a8a] flex items-center justify-between">
                  <span>
                    Selected Schedule:{' '}
                    <strong className="text-[#2563eb] font-bold">
                      {activeSchedule.workingDays.length} Working Days
                    </strong>{' '}
                    ({activeSchedule.workingDays.map((d) => d.slice(0, 3)).join(', ')})
                  </span>
                  <span className="text-[11px] text-[#64748b]">
                    {7 - activeSchedule.workingDays.length > 0
                      ? `${7 - activeSchedule.workingDays.length} Off Days`
                      : 'No Off Days'}
                  </span>
                </div>
              </div>

              {/* Batches Schedule Overview Table */}
              {batches.length > 0 && (
                <div className="space-y-3 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0f172a]">
                      Configured Batch Schedules Summary ({batches.length})
                    </span>
                    <button
                      type="button"
                      onClick={applyCampusScheduleToAllBatches}
                      className="text-xs font-bold text-[#2563eb] hover:underline cursor-pointer"
                    >
                      Apply Campus Default to All Batches
                    </button>
                  </div>

                  <div className="rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] overflow-hidden text-xs ">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#f8fafc] text-[#64748b] uppercase font-bold text-[10px] border-b border-[#e2e8f0]">
                        <tr>
                          <th className="p-3 pl-4">Grade / Section</th>
                          <th className="p-3">Hours & Bells</th>
                          <th className="p-3">Grace Buffer</th>
                          <th className="p-3">Working Days</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right pr-4">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-primary)] font-medium">
                        {batches.map((b) => {
                          const bStart = b.startTime || startTime;
                          const bEnd = b.endTime || endTime;
                          const bGrace = b.graceMinutes ?? Number(gracePeriodMins) ?? 15;
                          const bDays =
                            b.workingDays && b.workingDays.length > 0 ? b.workingDays : selectedDays;
                          const isCustom =
                            (b.startTime && b.startTime !== startTime) ||
                            (b.endTime && b.endTime !== endTime) ||
                            (b.graceMinutes !== undefined && b.graceMinutes !== Number(gracePeriodMins)) ||
                            (b.workingDays && JSON.stringify(b.workingDays) !== JSON.stringify(selectedDays));
                          const isCurrentTab = selectedScheduleScope === b.id;

                          return (
                            <tr
                              key={b.id}
                              className={`transition-colors ${
                                isCurrentTab ? 'bg-[#eff6ff]' : 'hover:bg-[#f8fafc]'
                              }`}
                            >
                              <td className="p-3 pl-4 font-bold text-[#0f172a]">
                                <span>{b.grade}</span>
                                {b.section && (
                                  <span className="ml-1.5 font-normal text-[#64748b] text-xs">
                                    (Sec {b.section})
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-[var(--text-secondary)]">
                                {bStart} — {bEnd}
                              </td>
                              <td className="p-3 text-[var(--text-secondary)] font-mono text-[11px]">
                                {bGrace} mins
                              </td>
                              <td className="p-3 text-[#0f172a] text-[11px]">
                                {bDays.length} Days ({bDays.map((d) => d.slice(0, 3)).join(', ')})
                              </td>
                              <td className="p-3">
                                <span
                                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold inline-block ${
                                    isCustom
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-[#f1f5f9] text-[#64748b] border border-[#e2e8f0]'
                                  }`}
                                >
                                  {isCustom ? 'CUSTOM' : 'DEFAULT'}
                                </span>
                              </td>
                              <td className="p-3 text-right pr-4">
                                <button
                                  type="button"
                                  onClick={() => setSelectedScheduleScope(b.id)}
                                  className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                                    isCurrentTab
                                      ? 'bg-[#2563eb] text-white'
                                      : 'border border-[#e2e8f0] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[#2563eb]'
                                  }`}
                                  style={isCurrentTab ? { color: '#ffffff' } : undefined}
                                >
                                  {isCurrentTab ? 'Editing' : 'Customize'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Review & Launch */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#0f172a] flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[#2563eb]" />
                  <span>Review & Activate Student Body</span>
                </h2>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Confirm configured student roster, classroom batches, and timings before activation.
                </p>
              </div>

              {/* 3 Executive Stat Cards per DESIGN.md */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-lg bg-[var(--bg-surface)] border border-[#e2e8f0]  space-y-1">
                  <p className="text-[#64748b] text-xs font-semibold">Enrolled Students</p>
                  <p className="text-3xl font-extrabold text-[#2563eb] tracking-tight">{students.length}</p>
                  <p className="text-[11px] text-[#64748b]">Roster accounts ready for login</p>
                </div>

                <div className="p-5 rounded-lg bg-[var(--bg-surface)] border border-[#e2e8f0]  space-y-1">
                  <p className="text-[#64748b] text-xs font-semibold">Academic Batches</p>
                  <p className="text-3xl font-extrabold text-[#0f172a] tracking-tight">{batches.length}</p>
                  <p className="text-[11px] text-[#64748b]">Grades & sections configured</p>
                </div>

                <div className="p-5 rounded-lg bg-[var(--bg-surface)] border border-[#e2e8f0]  space-y-1">
                  <p className="text-[#64748b] text-xs font-semibold">Campus Default Hours</p>
                  <p className="text-base font-bold text-[#0f172a] font-mono mt-1">{startTime} – {endTime}</p>
                  <p className="text-[11px] text-[#64748b]">
                    {selectedDays.length} Working Days ({selectedDays.map((d) => d.slice(0, 3)).join(', ')})
                  </p>
                </div>
              </div>

              {/* Batch Breakdown Roster in Review */}
              {batches.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-[#0f172a]">
                    Active Batches & Schedule Breakdown ({batches.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {batches.map((b) => {
                      const bStart = b.startTime || startTime;
                      const bEnd = b.endTime || endTime;
                      const bDays =
                        b.workingDays && b.workingDays.length > 0 ? b.workingDays : selectedDays;
                      const bStudents = students.filter(
                        (s) =>
                          (s as any).batchId === b.id ||
                          `${b.grade} - ${b.section}`.toLowerCase() === (s.grade || '').toLowerCase() ||
                          b.grade.toLowerCase() === (s.grade || '').toLowerCase()
                      );

                      return (
                        <div
                          key={b.id}
                          className="p-4 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between gap-3 text-xs shadow-2xs"
                        >
                          <div className="space-y-1">
                            <span className="font-bold text-[#0f172a] text-sm block">
                              {b.grade} {b.section ? `(Sec ${b.section})` : ''}
                            </span>
                            <span className="font-mono text-[#64748b] text-xs block">
                              {bStart} – {bEnd} ({bDays.length} Days)
                            </span>
                          </div>
                          <span className="text-xs px-3 py-1 rounded-full bg-[#eff6ff] font-bold text-[#2563eb] border border-[#dbeafe] shrink-0">
                            {bStudents.length} Students
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recessed Confirmation Box */}
              <div className="rounded-lg border border-[#dbeafe] bg-[#eff6ff] p-5 text-xs text-[#1e3a8a] space-y-2 leading-relaxed ">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#2563eb]" />
                  <p className="font-bold text-[#0f172a] text-sm">Ready for Activation</p>
                </div>
                <p className="text-[#475569]">
                  All {students.length} student records and {batches.length} academic batches will be stored into your isolated school database. Students will automatically inherit their batch&apos;s bell timings and can log in immediately into the Student Directory & Portal.
                </p>
              </div>
            </div>
          )}

          {/* Stepper Navigation Actions */}
          <div className="pt-6 border-t border-[#e2e8f0] flex items-center justify-between">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                className="px-5 py-2.5 rounded-lg border border-[#e2e8f0] bg-[var(--bg-surface)] hover:bg-[#f8fafc] text-[#475569] hover:text-[#0f172a] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev + 1) as any)}
                className="px-6 py-2.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-[0.99] text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-blue-500/25 flex items-center gap-1.5"
                style={{ color: '#ffffff' }}
              >
                <span>Continue to Step {currentStep + 1}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isCompleting}
                onClick={handleFinishSetup}
                className="px-7 py-3 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-[0.99] text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-blue-500/25 flex items-center gap-2 disabled:opacity-50"
                style={{ color: '#ffffff' }}
              >
                {isCompleting ? (
                  <span>Saving & Activating Roster...</span>
                ) : (
                  <>
                    <span>Complete Setup & Launch Directory</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
