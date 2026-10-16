
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, UserPlus, Plus, Trash2, MapPin } from 'lucide-react';
import { Employee, SalaryType, SalaryAllowanceItem } from '../../../types';
import { AppState } from '../../../services/store';
import { initialPayrollGroups } from '../../../data/initialData';
import { normalizeRoleForLeaveQuotas } from '@/utils/leaveRules';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newEmp: Partial<Employee>) => void;
  state: AppState;
  isInstitution: boolean;
  onOpenAddOffice?: () => void;
}

const MAJOR_BANKS = [
  'HDFC Bank',
  'State Bank of India (SBI)',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank (PNB)',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank of India',
  'IndusInd Bank',
  'IDFC FIRST Bank',
  'Yes Bank',
  'Federal Bank',
  'Bank of India',
  'Central Bank of India',
  'Indian Bank',
  'Standard Chartered Bank',
  'HSBC Bank',
  'Citibank',
  'JPMorgan Chase Bank',
  'Bank of America',
  'Wells Fargo',
  'Barclays',
  'Other Bank',
];

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  state,
  isInstitution,
  onOpenAddOffice,
}) => {
  const router = useRouter();

  // Basic Information
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('');
  const [newEmpDept, setNewEmpDept] = useState('');
  const [newEmpOffice, setNewEmpOffice] = useState('');
  const [newEmpOffices, setNewEmpOffices] = useState<string[]>([]);
  const [newEmpPrimaryOffice, setNewEmpPrimaryOffice] = useState('');
  const [newEmpManagerId, setNewEmpManagerId] = useState('');
  const [newEmpManagerIds, setNewEmpManagerIds] = useState<string[]>([]);
  const [newEmpJoinDate, setNewEmpJoinDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newEmpEmploymentType, setNewEmpEmploymentType] = useState<string>('Full-time');
  const [newEmpShiftId, setNewEmpShiftId] = useState<string>(() => state.customOptions?.shifts?.[0]?.id || 'sh-1');
  const [newEmpProbationStatus, setNewEmpProbationStatus] = useState<'in_probation' | 'confirmed'>('in_probation');
  const [newEmpProbationMonths, setNewEmpProbationMonths] = useState<number>(() => state.customOptions?.probationSettings?.defaultDurationMonths || 3);

  const [isCustomRole, setIsCustomRole] = useState(false);
  const [isCustomDept, setIsCustomDept] = useState(false);

  // Payroll & Compensation Fields
  const payrollGroupsList = React.useMemo(() => {
    return state.customOptions?.payrollGroups || initialPayrollGroups;
  }, [state.customOptions?.payrollGroups]);

  const [newEmpSalaryType, setNewEmpSalaryType] = useState<SalaryType>('monthly');
  const [newEmpPayrollGroupId, setNewEmpPayrollGroupId] = useState<string>(() => payrollGroupsList[0]?.id || 'pg-1');
  const [newEmpBasicSalary, setNewEmpBasicSalary] = useState<number>(45000);
  const [newEmpHra, setNewEmpHra] = useState<number>(18000);
  const [newEmpSpecialAllowance, setNewEmpSpecialAllowance] = useState<number>(9000);
  const [newEmpConveyanceAllowance, setNewEmpConveyanceAllowance] = useState<number>(1600);
  const [newEmpMedicalAllowance, setNewEmpMedicalAllowance] = useState<number>(1250);
  const [newEmpOtherAllowances, setNewEmpOtherAllowances] = useState<number>(0);
  const [newEmpAllowanceItems, setNewEmpAllowanceItems] = useState<SalaryAllowanceItem[]>([]);
  const [newEmpPfDeduction, setNewEmpPfDeduction] = useState<number>(1800);
  const [newEmpTaxDeduction, setNewEmpTaxDeduction] = useState<number>(2500);
  const [newEmpProfessionalTax, setNewEmpProfessionalTax] = useState<number>(200);
  const [newEmpEsicDeduction, setNewEmpEsicDeduction] = useState<number>(0);

  // Quick custom allowance input states
  const [newAllowanceName, setNewAllowanceName] = useState('');
  const [newAllowanceAmount, setNewAllowanceAmount] = useState<number>(0);

  // Banking & Statutory Identifiers
  const [newEmpBankName, setNewEmpBankName] = useState<string>('');
  const [newEmpAccountNumber, setNewEmpAccountNumber] = useState<string>('');
  const [newEmpIfscCode, setNewEmpIfscCode] = useState<string>('');
  const [newEmpPanNumber, setNewEmpPanNumber] = useState<string>('');
  const [newEmpPfUan, setNewEmpPfUan] = useState<string>('');
  const [newEmpEsi, setNewEmpEsi] = useState<string>('');

  // Calculations
  const customAllowancesSum = newEmpAllowanceItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  const calculatedGross =
    Number(newEmpBasicSalary || 0) +
    Number(newEmpHra || 0) +
    Number(newEmpSpecialAllowance || 0) +
    Number(newEmpConveyanceAllowance || 0) +
    Number(newEmpMedicalAllowance || 0) +
    Number(newEmpOtherAllowances || 0) +
    customAllowancesSum;
  const calculatedDeductions =
    Number(newEmpPfDeduction || 0) +
    Number(newEmpTaxDeduction || 0) +
    Number(newEmpProfessionalTax || 0) +
    Number(newEmpEsicDeduction || 0);
  const calculatedNet = Math.max(0, calculatedGross - calculatedDeductions);

  // Check if current user is HR or Admin
  const currentRole = state.currentPersona?.role;
  const isHRorAdmin =
    currentRole === 'super_admin' ||
    currentRole === 'admin' ||
    currentRole === 'hr_manager' ||
    (currentRole as string) === 'hr';

  // Available shifts
  const availableShifts = React.useMemo(() => {
    if (state.customOptions?.shifts && state.customOptions.shifts.length > 0) {
      return state.customOptions.shifts;
    }
    return [
      { id: 'sh-1', name: 'General Day Shift', startTime: '09:00 AM', endTime: '06:00 PM', gracePeriodMinutes: 15, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
      { id: 'sh-hourly', name: 'Hourly / Flexible Shift', startTime: 'Flexible', endTime: 'Flexible', gracePeriodMinutes: 0, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], isHourlyShift: true, hourlyTrackingThresholdHours: 8 },
    ];
  }, [state.customOptions?.shifts]);

  // Available departments from organization / existing employees
  const availableDepartments = React.useMemo(() => {
    const set = new Set<string>();
    if (state.customOptions?.departments) {
      state.customOptions.departments.forEach((d) => set.add(d));
    }
    (state.employees || []).forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set);
  }, [state.customOptions?.departments, state.employees]);

  // Available designations from custom options or existing employees
  const availableDesignations = React.useMemo(() => {
    const set = new Set<string>();
    if (state.customOptions?.designations) {
      state.customOptions.designations.forEach((d) => {
        if (d && d.trim()) set.add(d.trim());
      });
    }
    (state.employees || []).forEach((e) => {
      if (e.designation && e.designation.trim()) set.add(e.designation.trim());
    });
    return Array.from(set);
  }, [state.customOptions?.designations, state.employees]);

  // Available offices (filtered so physical street addresses are not treated as office branch names)
  const availableOffices = React.useMemo(() => {
    const orgAddress = state.organization?.officeLocation?.address?.trim() || '';
    const isStreetAddress = (val?: string) => {
      if (!val) return false;
      const clean = val.trim();
      if (orgAddress && clean.toLowerCase() === orgAddress.toLowerCase()) return true;
      if ((clean.match(/,/g) || []).length >= 3 && /\d{5,6}/.test(clean)) return true;
      return false;
    };

    const set = new Set<string>();
    if (state.customOptions?.offices) {
      state.customOptions.offices.forEach((o) => {
        if (o && o.trim() && !isStreetAddress(o)) set.add(o.trim());
      });
    }
    (state.employees || []).forEach((e) => {
      if (e.officeName && e.officeName.trim() && !isStreetAddress(e.officeName)) {
        set.add(e.officeName.trim());
      }
      if (e.location && e.location.trim() && !isStreetAddress(e.location)) {
        set.add(e.location.trim());
      }
    });
    if (set.size === 0 && orgAddress) {
      const firstPart = orgAddress.split(',')[0].trim();
      if (firstPart && !isStreetAddress(firstPart)) {
        set.add(firstPart);
      }
    }
    return Array.from(set).filter(Boolean);
  }, [state.customOptions?.offices, state.organization?.officeLocation?.address, state.employees, isInstitution]);

  // Office physical address to display below the multi-select
  const selectedOfficeAddress = React.useMemo(() => {
    const primary = newEmpPrimaryOffice || newEmpOffices[0] || newEmpOffice;
    const record = (state.customOptions?.officeRecords || []).find(
      (r) => r.name.trim().toLowerCase() === String(primary || '').trim().toLowerCase()
    );
    if (record?.address?.trim()) return record.address.trim();
    const orgAddress = state.organization?.officeLocation?.address?.trim() || '';
    return orgAddress;
  }, [
    newEmpPrimaryOffice,
    newEmpOffices,
    newEmpOffice,
    state.customOptions?.officeRecords,
    state.organization?.officeLocation?.address,
  ]);

  // Default initial values on open
  useEffect(() => {
    if (isOpen) {
      if (!newEmpRole && availableDesignations.length > 0) {
        setNewEmpRole(availableDesignations[0]);
      }
      if (!newEmpDept && availableDepartments.length > 0) {
        setNewEmpDept(availableDepartments[0]);
      }
      if ((!newEmpOffice || !availableOffices.includes(newEmpOffice)) && availableOffices.length > 0) {
        setNewEmpOffice(availableOffices[0]);
      }
      if (newEmpOffices.length === 0 && availableOffices.length > 0) {
        setNewEmpOffices([availableOffices[0]]);
        setNewEmpPrimaryOffice(availableOffices[0]);
        setNewEmpOffice(availableOffices[0]);
      } else if (newEmpOffices.length > 0) {
        const valid = newEmpOffices.filter((o) => availableOffices.includes(o));
        if (valid.length !== newEmpOffices.length) {
          const next = valid.length > 0 ? valid : availableOffices.slice(0, 1);
          setNewEmpOffices(next);
          setNewEmpPrimaryOffice(next.includes(newEmpPrimaryOffice) ? newEmpPrimaryOffice : next[0] || '');
          setNewEmpOffice(next[0] || '');
        }
      }
      if (payrollGroupsList.length > 0 && !newEmpPayrollGroupId) {
        setNewEmpPayrollGroupId(payrollGroupsList[0].id);
      }
    }
  }, [isOpen, availableDesignations, availableDepartments, availableOffices, newEmpRole, newEmpDept, newEmpOffice, newEmpOffices, newEmpPrimaryOffice, payrollGroupsList, newEmpPayrollGroupId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpEmail.trim()) return;

    if (newEmpPhone.trim() && newEmpPhone.trim().length !== 10) {
      setPhoneError('Phone number must be exactly 10 digits');
      return;
    }

    const managerObj = state.employees.find((emp) => emp.id === newEmpManagerId);
    const matchedShift = availableShifts.find((s) => s.id === newEmpShiftId) || availableShifts[0];
    const selectedOffices =
      newEmpOffices.length > 0
        ? newEmpOffices
        : newEmpOffice.trim()
          ? [newEmpOffice.trim()]
          : availableOffices[0]
            ? [availableOffices[0]]
            : [];
    const primaryOffice =
      (newEmpPrimaryOffice && selectedOffices.includes(newEmpPrimaryOffice)
        ? newEmpPrimaryOffice
        : selectedOffices[0]) || '';
    const officeRecords = state.customOptions?.officeRecords || [];
    const officeIds = selectedOffices
      .map((name) => officeRecords.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())?.id)
      .filter(Boolean) as string[];

    const newEmp: Partial<Employee> = {
      name: newEmpName.trim(),
      fullName: newEmpName.trim(),
      email: newEmpEmail.trim().toLowerCase(),
      phone: newEmpPhone.trim() || '',
      designation: newEmpRole.trim() || (isInstitution ? 'Professor' : 'Software Engineer'),
      department: (newEmpDept.trim() || (isInstitution ? 'Faculty' : 'Development')) as any,
      team: `${newEmpDept.trim() || 'Core'} Team`,
      officeName: primaryOffice || availableOffices[0],
      location: primaryOffice || availableOffices[0],
      officeId: officeIds[0],
      officeIds,
      offices: selectedOffices.map((name) => ({
        id: officeRecords.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())?.id || name,
        name,
        isPrimary: name === primaryOffice,
      })),
      shiftId: matchedShift?.id || 'sh-1',
      shiftTiming: {
        shiftId: matchedShift?.id || 'sh-1',
        shiftName: matchedShift?.name || 'General Day Shift',
        startTime: matchedShift?.startTime || '09:00 AM',
        endTime: matchedShift?.endTime || '06:00 PM',
        graceMinutes: matchedShift?.gracePeriodMinutes || 15,
      },
      managerId: newEmpManagerIds[0] || newEmpManagerId || undefined,
      managerIds: newEmpManagerIds.length ? newEmpManagerIds : newEmpManagerId ? [newEmpManagerId] : undefined,
      managerName: managerObj ? managerObj.name : undefined,
      lineManager: managerObj
        ? {
            name: managerObj.name,
            username: managerObj.email || managerObj.name,
            avatar: managerObj.avatar,
            designation: managerObj.designation,
          }
        : undefined,
      joinDate: newEmpJoinDate || new Date().toISOString().split('T')[0],
      joiningDate: newEmpJoinDate || new Date().toISOString().split('T')[0],
      status: 'Active',
      employmentType: newEmpEmploymentType as any,
      probationStatus: newEmpProbationStatus,
      probationPeriodMonths: newEmpProbationStatus === 'in_probation' ? newEmpProbationMonths : 0,
      probationEndDate: (() => {
        if (newEmpProbationStatus !== 'in_probation') return undefined;
        const d = new Date(newEmpJoinDate || new Date());
        d.setMonth(d.getMonth() + (newEmpProbationMonths || 3));
        return d.toISOString().split('T')[0];
      })(),
      leaveBalances: (() => {
        if (newEmpProbationStatus === 'in_probation') {
          return {
            casualLeave: 0,
            sickLeave: 0,
            earnedLeave: 0,
            compOff: 0,
          };
        }
        const roleKey = normalizeRoleForLeaveQuotas(newEmpRole, newEmpRole, newEmpEmploymentType);
        const roleQuotas = state.customOptions?.leaveSettings?.roleLeaveQuotas?.[roleKey] ||
          state.customOptions?.leaveSettings?.roleLeaveQuotas?.['employee'] || {
            casualLeave: state.customOptions?.leaveSettings?.casualLeaveQuota || 12,
            sickLeave: state.customOptions?.leaveSettings?.sickLeaveQuota || 10,
            earnedLeave: state.customOptions?.leaveSettings?.paidLeaveQuota || 15,
          };
        return {
          casualLeave: roleQuotas.casualLeave,
          sickLeave: roleQuotas.sickLeave,
          earnedLeave: roleQuotas.earnedLeave,
          compOff: 0,
        };
      })(),
      // Payroll & Statutory Integration
      salaryType: newEmpSalaryType,
      payrollGroupId: newEmpPayrollGroupId,
      panNumber: newEmpPanNumber.trim() || undefined,
      pfUanNumber: newEmpPfUan.trim() || undefined,
      esiNumber: newEmpEsi.trim() || undefined,
      bankDetails: {
        bankName: newEmpBankName.trim() || '—',
        accountNumber: newEmpAccountNumber.trim() || '—',
        ifscCode: newEmpIfscCode.trim() || '—',
      },
      salaryDetails: {
        basic: Number(newEmpBasicSalary) || 45000,
        hra: Number(newEmpHra) || 0,
        specialAllowance: Number(newEmpSpecialAllowance) || 0,
        conveyanceAllowance: Number(newEmpConveyanceAllowance) || 0,
        medicalAllowance: Number(newEmpMedicalAllowance) || 0,
        otherAllowances: Number(newEmpOtherAllowances) || 0,
        allowanceItems: newEmpAllowanceItems,
        pfDeduction: Number(newEmpPfDeduction) || 0,
        taxDeduction: Number(newEmpTaxDeduction) || 0,
        professionalTax: Number(newEmpProfessionalTax) || 0,
        esicDeduction: Number(newEmpEsicDeduction) || 0,
        netPayable: Number(calculatedNet) || 45000,
      },
      payrollSummary: {
        status: 'Active',
        jobTitle: newEmpRole.trim() || 'Software Engineer',
        employmentType: newEmpEmploymentType,
        jobDate: newEmpJoinDate || new Date().toISOString().split('T')[0],
        geofencing: 'Allowed',
        lastWorkingDate: '—',
        totalCompensation: (Number(calculatedNet) || 45000) * 12,
        salary: Number(calculatedNet) || 45000,
        recurring: Number(calculatedNet) || 45000,
        oneOff: 0,
        offset1: 0,
        offset2: 0,
      },
    };

    onSubmit(newEmp);
    setNewEmpName('');
    setNewEmpEmail('');
    setNewEmpPhone('');
    setPhoneError('');
    setNewEmpManagerId('');
    setNewEmpManagerIds([]);
    setNewEmpAllowanceItems([]);
    setNewAllowanceName('');
    setNewAllowanceAmount(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900">
        {/* Drawer Header */}
        <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
              {isInstitution ? 'Add Staff & Faculty' : 'Add New Employee'}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5 break-words">
              {isInstitution
                ? 'Enroll a faculty or staff member into the institution directory'
                : 'Onboard a new employee with official credentials and payroll'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="p-4 sm:p-7 sm:px-8 space-y-5 flex-1">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newEmpName}
                onChange={(e) => setNewEmpName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Email & Phone Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Official Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newEmpEmail}
                  onChange={(e) => setNewEmpEmail(e.target.value)}
                  placeholder="r.sharma@company.com"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all placeholder:text-slate-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Phone Number (10 Digits)
                  </label>
                  {newEmpPhone.length > 0 && (
                    <span className={`text-[11px] ${newEmpPhone.length === 10 ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-medium'}`}>
                      {newEmpPhone.length}/10
                    </span>
                  )}
                </div>
                <input
                  type="tel"
                  maxLength={10}
                  value={newEmpPhone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setNewEmpPhone(val);
                    if (phoneError && (val.length === 10 || val.length === 0)) {
                      setPhoneError('');
                    }
                  }}
                  placeholder="e.g. 9876543210"
                  className={`w-full rounded-xl border ${phoneError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : 'border-slate-200 focus:border-slate-400 focus:ring-slate-300'} bg-white px-4 py-3 text-sm text-slate-900 font-medium outline-none focus:ring-1 transition-all placeholder:text-slate-400`}
                />
                {phoneError && (
                  <p className="text-[11px] text-rose-500 font-semibold mt-1">{phoneError}</p>
                )}
              </div>
            </div>

            {/* Role & Department Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    {isInstitution ? 'Job Role / Designation' : 'Job Role'} <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomRole(!isCustomRole);
                      setNewEmpRole('');
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    {isCustomRole ? 'Choose Preset' : '+ Custom Role'}
                  </button>
                </div>

                {isCustomRole ? (
                  <input
                    type="text"
                    required
                    value={newEmpRole}
                    onChange={(e) => setNewEmpRole(e.target.value)}
                    placeholder="Enter custom role..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all placeholder:text-slate-400"
                  />
                ) : (
                  <select
                    required
                    value={newEmpRole}
                    onChange={(e) => setNewEmpRole(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                  >
                    {availableDesignations.map((d) => (
                      <option key={d} value={d} className="bg-white text-slate-800">
                        {d}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    {isInstitution ? 'Department / Area' : 'Department / Area'} <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomDept(!isCustomDept);
                      setNewEmpDept('');
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    {isCustomDept ? 'Choose Preset' : '+ Custom Dept'}
                  </button>
                </div>

                {isCustomDept ? (
                  <input
                    type="text"
                    required
                    value={newEmpDept}
                    onChange={(e) => setNewEmpDept(e.target.value)}
                    placeholder="Enter custom department..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all placeholder:text-slate-400"
                  />
                ) : (
                  <select
                    required
                    value={newEmpDept}
                    onChange={(e) => setNewEmpDept(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                  >
                    {availableDepartments.map((dept) => (
                      <option key={dept} value={dept} className="bg-white text-slate-800">
                        {dept}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Office Location & Reporting Manager Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    {isInstitution ? 'Campus / Wing' : 'Office Location / Branch'}
                    {availableOffices.length > 1 ? 's' : ''}
                  </label>
                  {onOpenAddOffice && (
                    <button
                      type="button"
                      onClick={onOpenAddOffice}
                      className="text-[11px] text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                    >
                      + Add Office
                    </button>
                  )}
                </div>
                {availableOffices.length === 0 ? (
                  <p className="text-sm text-slate-400 py-3 px-4 rounded-xl border border-slate-200">
                    No office locations added yet
                  </p>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 space-y-2 max-h-36 overflow-y-auto">
                    {availableOffices.map((off) => {
                      const checked = newEmpOffices.includes(off);
                      return (
                        <label
                          key={off}
                          className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setNewEmpOffices((prev) => {
                                const next = checked ? prev.filter((n) => n !== off) : [...prev, off];
                                if (!checked && next.length === 1) {
                                  setNewEmpPrimaryOffice(off);
                                  setNewEmpOffice(off);
                                } else if (checked && newEmpPrimaryOffice === off) {
                                  const fallback = next[0] || '';
                                  setNewEmpPrimaryOffice(fallback);
                                  setNewEmpOffice(fallback);
                                }
                                return next;
                              });
                            }}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          />
                          <span className="flex-1">{off}</span>
                          {checked && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setNewEmpPrimaryOffice(off);
                                setNewEmpOffice(off);
                              }}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                newEmpPrimaryOffice === off
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {newEmpPrimaryOffice === off ? 'Primary' : 'Set primary'}
                            </button>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                {selectedOfficeAddress && (
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1 leading-snug">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-2" title={selectedOfficeAddress}>
                      {selectedOfficeAddress}
                    </span>
                  </p>
                )}
                {newEmpOffices.length > 1 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {newEmpOffices.length} offices · primary: {newEmpPrimaryOffice || newEmpOffices[0]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  {isInstitution ? 'Staff leads / HODs' : 'Reporting managers'}
                </label>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 space-y-2 max-h-36 overflow-y-auto">
                  {state.employees.length === 0 ? (
                    <p className="text-sm text-slate-400">No managers yet — add this person as top level.</p>
                  ) : (
                    state.employees.map((emp) => {
                      const checked = newEmpManagerIds.includes(emp.id);
                      return (
                        <label key={emp.id} className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setNewEmpManagerIds((prev) => {
                                const next = checked ? prev.filter((id) => id !== emp.id) : [...prev, emp.id];
                                setNewEmpManagerId(next[0] || '');
                                return next;
                              });
                            }}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          />
                          <span className="flex-1 truncate">{emp.name} ({emp.designation || 'Staff'})</span>
                          {checked && newEmpManagerIds[0] === emp.id && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-white">Primary</span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Select two or more managers if this person reports to more than one lead.</p>
              </div>
            </div>

            {/* Joining Date & Employment Type Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Joining Date
                </label>
                <input
                  type="date"
                  value={newEmpJoinDate}
                  onChange={(e) => setNewEmpJoinDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 [color-scheme:light] transition-all cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Employment Type
                </label>
                <select
                  value={newEmpEmploymentType}
                  onChange={(e) => setNewEmpEmploymentType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                >
                  {((state.customOptions?.employmentTypeCategories?.map((c) => c.name)) ||
                    state.customOptions?.employmentTypes || [
                      'Full-time',
                      'Contract',
                      'Part-time',
                      'Intern',
                      'Probationary',
                    ]).map((type) => (
                    <option key={type} value={type} className="bg-white text-slate-800">
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Probation Period Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Probation Status
                </label>
                <select
                  value={newEmpProbationStatus}
                  onChange={(e) => setNewEmpProbationStatus(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 font-semibold outline-none focus:border-slate-400 cursor-pointer"
                >
                  <option value="in_probation">In Probation (Default)</option>
                  <option value="confirmed">Confirmed / Direct Permanent</option>
                </select>
              </div>

              {newEmpProbationStatus === 'in_probation' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Duration
                  </label>
                  <select
                    value={newEmpProbationMonths}
                    onChange={(e) => setNewEmpProbationMonths(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 font-semibold outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value={1}>1 Month</option>
                    <option value={2}>2 Months</option>
                    <option value={3}>3 Months</option>
                    <option value={6}>6 Months</option>
                    <option value={12}>12 Months</option>
                  </select>
                </div>
              )}
            </div>

            {/* Work Shift Schedule Assignment */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Work Shift Schedule <span className="text-rose-500">*</span>
              </label>
              <select
                value={newEmpShiftId}
                onChange={(e) => setNewEmpShiftId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
              >
                {availableShifts.map((s) => (
                  <option key={s.id} value={s.id} className="bg-white text-slate-800">
                    {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
              </select>
            </div>

            {/* ========================================================================= */}
            {/* PAYROLL SETUP & COMPENSATION SECTION                                      */}
            {/* ========================================================================= */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-sm font-bold text-slate-900">Payroll & Compensation</h4>
                <span className="text-[11px] text-slate-500 font-medium">₹ (INR)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Salary Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Salary Type
                  </label>
                  <select
                    value={newEmpSalaryType}
                    onChange={(e) => setNewEmpSalaryType(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 font-semibold outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="monthly">Monthly Fixed</option>
                    <option value="hourly">Hourly Basis</option>
                    <option value="annual">Annual Package</option>
                  </select>
                </div>

                {/* Payroll Group */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Payroll Group
                  </label>
                  <select
                    value={newEmpPayrollGroupId}
                    onChange={(e) => setNewEmpPayrollGroupId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 font-semibold outline-none focus:border-slate-400 cursor-pointer"
                  >
                    {payrollGroupsList.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Basic Pay / Base Salary */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Basic Salary (₹ / mo) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newEmpBasicSalary}
                    onChange={(e) => {
                      const b = Math.max(0, Number(e.target.value));
                      setNewEmpBasicSalary(b);
                      setNewEmpHra(Math.round(b * 0.4));
                      setNewEmpSpecialAllowance(Math.round(b * 0.2));
                    }}
                    placeholder="e.g. 45000"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-bold outline-none focus:border-slate-400"
                    required
                  />
                </div>

                {/* HRA */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    House Rent Allowance (HRA ₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newEmpHra}
                    onChange={(e) => setNewEmpHra(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>

                {/* Conveyance Allowance */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Conveyance Allowance (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newEmpConveyanceAllowance}
                    onChange={(e) => setNewEmpConveyanceAllowance(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>

                {/* Medical Allowance */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Medical Allowance (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newEmpMedicalAllowance}
                    onChange={(e) => setNewEmpMedicalAllowance(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>

                {/* Special Allowance */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Special Allowance (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newEmpSpecialAllowance}
                    onChange={(e) => setNewEmpSpecialAllowance(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>

                {/* Other Allowances */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Other Allowances (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newEmpOtherAllowances}
                    onChange={(e) => setNewEmpOtherAllowances(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>

                {/* PF Deduction */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Provident Fund (PF ₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newEmpPfDeduction}
                    onChange={(e) => setNewEmpPfDeduction(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>

                {/* Tax / TDS Deduction */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Tax / TDS Deduction (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newEmpTaxDeduction}
                    onChange={(e) => setNewEmpTaxDeduction(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>

                {/* Professional Tax */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Professional Tax (PT ₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newEmpProfessionalTax}
                    onChange={(e) => setNewEmpProfessionalTax(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Dynamic Custom Allowances Sub-panel */}
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Additional Custom Allowances</span>
                  <span className="text-[10px] text-slate-500">e.g. Remote, Shift, Internet, Food</span>
                </div>

                {newEmpAllowanceItems.length > 0 && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {newEmpAllowanceItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 text-xs">
                        <div>
                          <span className="font-semibold text-slate-800">{item.name}</span>
                          <span className="text-[10px] text-slate-500 ml-2">₹{item.amount.toLocaleString('en-IN')}/mo</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewEmpAllowanceItems(prev => prev.filter(i => i.id !== item.id))}
                          className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newAllowanceName}
                    onChange={(e) => setNewAllowanceName(e.target.value)}
                    placeholder="Allowance name (e.g. Internet)"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-400"
                  />
                  <input
                    type="number"
                    min={0}
                    value={newAllowanceAmount || ''}
                    onChange={(e) => setNewAllowanceAmount(Math.max(0, Number(e.target.value)))}
                    placeholder="Amount (₹)"
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newAllowanceName.trim() || newAllowanceAmount <= 0) return;
                      const newItem: SalaryAllowanceItem = {
                        id: `ca-${Date.now()}`,
                        name: newAllowanceName.trim(),
                        code: newAllowanceName.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 10),
                        amount: newAllowanceAmount,
                        taxable: true,
                      };
                      setNewEmpAllowanceItems(prev => [...prev, newItem]);
                      setNewAllowanceName('');
                      setNewAllowanceAmount(0);
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
              </div>

              {/* Real-time Compensation Overview Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Gross Pay</span>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">₹{calculatedGross.toLocaleString('en-IN')}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Deductions</span>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">₹{calculatedDeductions.toLocaleString('en-IN')}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Net Take-Home</span>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">₹{calculatedNet.toLocaleString('en-IN')}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Annual CTC</span>
                  <p className="text-xs font-bold text-slate-900 mt-0.5">₹{(calculatedGross * 12).toLocaleString('en-IN')}</p>
                </div>
              </div>

              {/* Banking & Statutory Identifiers */}
              <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Bank Name
                  </label>
                  <select
                    value={MAJOR_BANKS.includes(newEmpBankName) ? newEmpBankName : (newEmpBankName ? 'Other Bank' : '')}
                    onChange={(e) => {
                      const selected = e.target.value;
                      if (selected === 'Other Bank') {
                        setNewEmpBankName('');
                      } else {
                        setNewEmpBankName(selected);
                        if (!newEmpIfscCode) {
                          if (selected.includes('HDFC')) setNewEmpIfscCode('HDFC0');
                          else if (selected.includes('State Bank of India')) setNewEmpIfscCode('SBIN0');
                          else if (selected.includes('ICICI')) setNewEmpIfscCode('ICIC0');
                          else if (selected.includes('Axis')) setNewEmpIfscCode('UTIB0');
                          else if (selected.includes('Kotak')) setNewEmpIfscCode('KKBK0');
                          else if (selected.includes('Punjab National Bank')) setNewEmpIfscCode('PUNB0');
                          else if (selected.includes('Bank of Baroda')) setNewEmpIfscCode('BARB0');
                          else if (selected.includes('Canara')) setNewEmpIfscCode('CNRB0');
                          else if (selected.includes('Union Bank')) setNewEmpIfscCode('UBIN0');
                        }
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-medium outline-none focus:border-slate-400 cursor-pointer"
                  >
                    <option value="">Select bank...</option>
                    {MAJOR_BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  {(!MAJOR_BANKS.includes(newEmpBankName) || newEmpBankName === '') && (
                    <input
                      type="text"
                      value={newEmpBankName}
                      onChange={(e) => setNewEmpBankName(e.target.value)}
                      placeholder="Specify bank name..."
                      className="w-full mt-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Account Number
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={18}
                    value={newEmpAccountNumber}
                    onChange={(e) => setNewEmpAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))}
                    onKeyDown={(e) => {
                      if (
                        !/[0-9]/.test(e.key) &&
                        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
                        !e.ctrlKey &&
                        !e.metaKey
                      ) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="e.g. 50100234567890"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={newEmpIfscCode}
                    onChange={(e) => setNewEmpIfscCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
                    placeholder="e.g. HDFC0001234"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 font-medium outline-none focus:border-slate-400 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    PAN Number
                  </label>
                  <input
                    type="text"
                    value={newEmpPanNumber}
                    onChange={(e) =>
                      setNewEmpPanNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))
                    }
                    maxLength={10}
                    placeholder="e.g. ABCDE1234F"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 font-medium outline-none focus:border-slate-400 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    PF UAN (Optional)
                  </label>
                  <input
                    type="text"
                    value={newEmpPfUan}
                    onChange={(e) => setNewEmpPfUan(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    maxLength={12}
                    placeholder="e.g. 100987654321"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    ESI Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={newEmpEsi}
                    onChange={(e) => setNewEmpEsi(e.target.value.replace(/\D/g, '').slice(0, 17))}
                    maxLength={17}
                    placeholder="e.g. 31001234560001"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 font-medium outline-none focus:border-slate-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Form Footer */}
          <div className="p-4 sm:p-6 sm:px-8 border-t border-slate-100 bg-white flex items-center justify-end gap-2.5 sm:gap-3 shrink-0 pb-7 sm:pb-6">
            {isHRorAdmin ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push('/hr?tab=employee_settings&subTab=onboarding');
                }}
                className="flex-1 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer transition-colors shadow-2xs text-center"
              >
                Edit Form
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer transition-colors shadow-2xs text-center"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-2.5 sm:py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <UserPlus className="h-4 w-4" />
              <span>{isInstitution ? 'Add Staff Member' : 'Add Employee'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
