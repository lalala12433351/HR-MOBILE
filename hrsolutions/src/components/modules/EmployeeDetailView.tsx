'use client';
import './people-attendance.css';
import peopleStyles from '../mobile/mobile-people.module.css';
import {useMobileViewport} from '@/hooks/useMobileViewport';
import {MobileEmployeeGeneral} from '@/components/mobile/MobileEmployeeGeneral';
import {MobilePageTitle} from '@/components/mobile/MobilePageTitle';
import { EmployeeAttendanceCalendar } from './hrms/EmployeeAttendanceCalendar';
import { DateInput } from '@/components/common/DateInput';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Mail,
  Phone,
  Globe,
  Edit2,
  Plus,
  Trash2,
  FileText,
  Download,
  Upload,
  Calendar,
  CheckCircle,
  Clock,
  Shield,
  X,
  Check,
  Briefcase,
  MapPin,
  Laptop,
  Monitor,
  Smartphone,
  User,
  LogIn,
  LogOut,
  CalendarDays,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Filter,
  ArrowUpRight,
  Search,
  Camera,
  DollarSign,
  Layers,
  CreditCard,
  Receipt,
  Percent,
  Calculator,
  Sparkles,
  Info,
  Building2,
  Timer,
} from 'lucide-react';
import { Employee, JobTimelineItem, ContractTimelineItem, EmployeeDocument, EmployeePayslipDocument, SalaryType, PayrollGroup, SalaryAllowanceItem } from '../../types';
import { AppState } from '../../services/store';
import { getEffectiveLeaveQuotas, isEmployeeInProbation } from '@/utils/leaveRules';
import { leaveBelongsToEmployee } from '@/utils/mapLeaveRow';
import { WORLD_NATIONALITIES, WORLD_COUNTRIES } from '@/data/nations';
import { api } from '@/services/apiClient';
import { isInstitutionMode } from '@/utils/organizationMode';
import { compressAvatarImage } from '@/utils/imageUtils';
import { useApp } from '@/context/AppContext';
import { saveStoredState } from '@/services/store';
import { UserAvatar } from '@/components/common/UserAvatar';
import { EmployeePublicProfilePanel } from './hrms/EmployeePublicProfilePanel';
import { buildEmployeeIdCardDraft, IdCardStudio } from '../print/IdCardStudio';
import { buildPayslipDraftFromDocument, PayslipStudio } from '../print/PayslipStudio';
import {
  SlideOverDrawer,
  slideOverBodyClass,
  slideOverCancelClass,
  slideOverFooterClass,
  slideOverPrimaryClass,
} from '@/components/common/SlideOverDrawer';

const moneyInputValue = (n: number | string) => {
  const v = Number(n);
  return Number.isFinite(v) && v !== 0 ? v : '';
};

const parseMoneyInput = (raw: string) => {
  if (raw.trim() === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const normalizeDateForInput = (d?: string) => {
  if (!d || d === '—' || d.trim() === '') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const parsed = Date.parse(d);
  if (!isNaN(parsed)) {
    const dt = new Date(parsed);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return '';
};

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

const blankBankValue = (value?: string) => {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return '';
  return trimmed;
};

const suggestIfscPrefix = (bankName: string) => {
  if (bankName.includes('HDFC')) return 'HDFC0';
  if (bankName.includes('State Bank of India')) return 'SBIN0';
  if (bankName.includes('ICICI')) return 'ICIC0';
  if (bankName.includes('Axis')) return 'UTIB0';
  if (bankName.includes('Kotak')) return 'KKBK0';
  if (bankName.includes('Punjab National Bank')) return 'PUNB0';
  if (bankName.includes('Bank of Baroda')) return 'BARB0';
  if (bankName.includes('Canara')) return 'CNRB0';
  if (bankName.includes('Union Bank')) return 'UBIN0';
  return '';
};

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function ExitChecklist({
  state,
  earlyExitDate,
  setEarlyExitDate,
  exitInterviewDone,
  setExitInterviewDone,
  assetClearanceDone,
  setAssetClearanceDone,
  managerNocDone,
  setManagerNocDone,
  onCancel,
  onConfirm,
  showToast,
}: {
  state: AppState;
  earlyExitDate: string;
  setEarlyExitDate: (value: string) => void;
  exitInterviewDone: boolean;
  setExitInterviewDone: (value: boolean) => void;
  assetClearanceDone: boolean;
  setAssetClearanceDone: (value: boolean) => void;
  managerNocDone: boolean;
  setManagerNocDone: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: (payload: Partial<Employee>) => void;
  showToast: (message: string) => void;
}) {
  const noticeDays = Number(state.customOptions?.noticePeriodSettings?.days) || 30;
  const allowBuyout = state.customOptions?.noticePeriodSettings?.allowBuyout !== false;
  const offboard = state.customOptions?.offboardingSettings;
  const today = new Date();
  const noticeEnd = new Date(today);
  noticeEnd.setDate(today.getDate() + noticeDays);
  const noticeEndKey = localDateKey(noticeEnd);
  const todayKey = localDateKey(today);
  const items = [
    { key: 'exit', label: 'Exit interview', required: offboard?.reqExitInterview !== false, checked: exitInterviewDone, set: setExitInterviewDone },
    { key: 'assets', label: 'Asset clearance', required: offboard?.reqAssetClearance !== false, checked: assetClearanceDone, set: setAssetClearanceDone },
    { key: 'noc', label: 'Manager sign-off', required: offboard?.reqManagerNOC !== false, checked: managerNocDone, set: setManagerNocDone },
  ];

  return (
    <div className="space-y-2 rounded-[8px] border border-[#eadfdf] bg-[#fffafa] p-3 text-left">
      <p className="text-[12px] font-semibold text-[#172234]">Notice ends {noticeEndKey}</p>
      {allowBuyout && (
        <label className="block text-[11px] text-[#5e6c7b]">
          Earlier exit date
          <input
            type="date"
            value={earlyExitDate}
            max={noticeEndKey}
            onChange={(event) => setEarlyExitDate(event.target.value)}
            className="mt-1 w-full rounded border border-[#dde4e9] px-2 py-1 text-[12px]"
          />
        </label>
      )}
      {items.filter((item) => item.required).map((item) => (
        <label key={item.key} className="flex items-center gap-2 text-[12px] text-[#172234]">
          <input type="checkbox" checked={item.checked} onChange={(event) => item.set(event.target.checked)} />
          {item.label}
        </label>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="text-[12px] font-semibold text-[#5e6c7b]">
          Cancel
        </button>
        <button
          type="button"
          className="text-[12px] font-semibold text-[#8b3133]"
          onClick={() => {
            const exitKey = earlyExitDate || noticeEndKey;
            if (!allowBuyout && exitKey < noticeEndKey) {
              showToast('Notice buyout is off, so the exit date cannot be earlier than the notice period.');
              return;
            }
            const checklist = {
              exitInterview: exitInterviewDone,
              assetClearance: assetClearanceDone,
              managerNoc: managerNocDone,
            };
            const missing = items.filter((item) => item.required && !item.checked).map((item) => item.label);
            if (missing.length > 0) {
              showToast(`Complete ${missing.join(', ')} before terminating this employee.`);
              return;
            }
            const fnf = new Date(`${exitKey}T00:00:00`);
            fnf.setDate(fnf.getDate() + (Number(offboard?.fnfSettlementDays) || 30));
            const revokeLater = offboard?.autoRevokeAccessOnLastDay !== false && exitKey > todayKey;
            onConfirm({
              status: 'Terminated',
              exitDate: exitKey,
              noticePeriodEndDate: noticeEndKey,
              fnfDueDate: localDateKey(fnf),
              offboardingChecklist: checklist,
              accountStatus: revokeLater ? 'Active' : 'Terminated',
              isDeactivated: !revokeLater,
            });
          }}
        >
          Confirm exit
        </button>
      </div>
    </div>
  );
}

const epSectionClass =
  'employee-profile-section bg-white border border-[#dde4e9] rounded-[12px] p-6 sm:p-7 text-[#172234] space-y-4';
const epSectionHeadClass = 'employee-profile-section-head flex items-center justify-between gap-3 pb-3 border-b border-[#dde4e9]';
const epFactRowClass =
  'employee-profile-fact flex items-center justify-between gap-4 py-1.5 border-b border-[#f3f5f7]';
const epFactLabelClass = 'text-[#687789] font-semibold shrink-0';
const epFactValueClass = 'font-semibold text-[#172234] min-w-0 text-left';
const epEditBtnClass =
  'ep-btn ep-btn--ghost inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[13px] font-semibold text-[#17324e] hover:bg-[#f8fbfe] transition-colors cursor-pointer';
const epPrimaryBtnClass =
  'ep-btn ep-btn--primary inline-flex items-center justify-center gap-1.5 min-h-10 rounded-[6px] bg-[#17324e] px-4 text-[13px] font-semibold text-white hover:bg-[#285275] transition-colors cursor-pointer disabled:opacity-60';
const epSecondaryBtnClass =
  'ep-btn ep-btn--secondary inline-flex items-center justify-center gap-1.5 min-h-10 rounded-[6px] border border-[#c5d0d8] bg-white px-4 text-[13px] font-semibold text-[#17324e] hover:bg-[#f8fbfe] transition-colors cursor-pointer disabled:opacity-60';

interface EmployeeDetailViewProps {
  employee: Employee;
  allEmployees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
  onOpenDepartment?: (departmentName: string) => void;
  onUpdateEmployee: (updated: Employee) => void | Promise<void>;
  onBack: () => void;
  state: AppState;
  initialTab?: 'general' | 'public_profile' | 'job' | 'attendance_leave' | 'payroll' | 'documents' | 'setting';
}

import { isExecutiveOrAdmin, isDirectReport } from '../../utils/teamAccess';
import { alignedDepartment, departmentImpliedByTeamName } from '@/utils/departmentTeam';
import { ChangeLoginEmailDialog } from '@/components/modules/ChangeLoginEmailDialog';

export const EmployeeDetailView: React.FC<EmployeeDetailViewProps> = ({
  employee,
  allEmployees,
  onSelectEmployee,
  onOpenDepartment,
  onUpdateEmployee,
  onBack,
  state,
  initialTab,
}) => {
  const router = useRouter();
  const mobile=useMobileViewport();
  const { updateState } = useApp();

  // Strict RBAC: Only Super Admin and HR can edit employee profiles
  const currentRole = state.currentPersona?.role || 'employee';
  const canEdit =
    currentRole === 'super_admin' ||
    currentRole === 'admin' ||
    currentRole === 'hr_manager' ||
    (currentRole as string) === 'hr';

  // Tabs: General | Public Profile | Job | Attendance & Leaves | Payroll | Documents | Setting
  const [activeTab, setActiveTab] = useState<
    'general' | 'public_profile' | 'job' | 'attendance_leave' | 'payroll' | 'documents' | 'setting'
  >(initialTab || 'general');

  const isSelfViewer =
    !!state.currentPersona &&
    (employee.id === state.currentPersona.id ||
      (!!state.currentPersona.email &&
        employee.email?.toLowerCase() === state.currentPersona.email.toLowerCase()));
  const canEditPublicBio = canEdit || isSelfViewer;
  const canChangeLoginEmail = canEdit || isSelfViewer;
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const orgAdminEmail = String(state.organization?.adminEmail || '').trim().toLowerCase();
  const movesOrganizationEmail =
    !!orgAdminEmail && orgAdminEmail === String(employee.email || '').trim().toLowerCase();
  const [bioDraft, setBioDraft] = useState(employee.bio || '');
  const [savingBio, setSavingBio] = useState(false);

  useEffect(() => {
    setBioDraft(employee.bio || '');
  }, [employee.id, employee.bio]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Edit Mode States
  const [isEditingPersonalInfo, setIsEditingPersonalInfo] = useState(false);
  const [savingPersonalInfo, setSavingPersonalInfo] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [isEditingEmergency, setIsEditingEmergency] = useState(false);
  const [isEditingJobInfo, setIsEditingJobInfo] = useState(false);
  const [isCustomDesignation, setIsCustomDesignation] = useState(false);
  const [isCustomDepartment, setIsCustomDepartment] = useState(false);
  const [isCustomTeam, setIsCustomTeam] = useState(false);
  const [isEditingAccountSettings, setIsEditingAccountSettings] = useState(false);
  const [isEditingPrivacy, setIsEditingPrivacy] = useState(false);
  const [isEditingPayroll, setIsEditingPayroll] = useState(false);

  // Form State for Payroll & Allowances
  const [formPayrollGroupId, setFormPayrollGroupId] = useState(employee.payrollGroupId || '');
  const [formSalaryType, setFormSalaryType] = useState<SalaryType>(employee.salaryType || 'monthly');
  const [formBaseSalary, setFormBaseSalary] = useState(Number(employee.salaryDetails?.basic || employee.payrollSummary?.salary || 0) || 0);
  const [formHra, setFormHra] = useState<number>(Number(employee.salaryDetails?.hra ?? Math.round((employee.salaryDetails?.basic || 0) * 0.4)) || 0);
  const [formSpecialAllowance, setFormSpecialAllowance] = useState<number>(Number(employee.salaryDetails?.specialAllowance ?? 0) || 0);
  const [formConveyanceAllowance, setFormConveyanceAllowance] = useState<number>(Number(employee.salaryDetails?.conveyanceAllowance ?? 0) || 0);
  const [formMedicalAllowance, setFormMedicalAllowance] = useState<number>(Number(employee.salaryDetails?.medicalAllowance ?? 0) || 0);
  const [formOtherAllowances, setFormOtherAllowances] = useState<number>(Number(employee.salaryDetails?.otherAllowances ?? 0) || 0);
  const [formCustomAllowances, setFormCustomAllowances] = useState<{ id: string; name: string; amount: number }[]>(() => {
    return (employee.salaryDetails?.allowanceItems || []).map((a) => ({
      id: a.id || `alw_${Date.now()}_${Math.random()}`,
      name: a.name,
      amount: a.amount,
    }));
  });
  const [formPfDeduction, setFormPfDeduction] = useState<number>(employee.salaryDetails?.pfDeduction ?? Math.round(Math.min(employee.salaryDetails?.basic || 0, 15000) * 0.12));
  const [formTaxDeduction, setFormTaxDeduction] = useState<number>(employee.salaryDetails?.taxDeduction ?? Math.round((employee.salaryDetails?.basic || 0) * 0.08));
  const [formProfessionalTax, setFormProfessionalTax] = useState<number>(employee.salaryDetails?.professionalTax ?? 0);
  const [formHourlyRate, setFormHourlyRate] = useState(employee.hourlyRate || 0);
  const [formPanNumber, setFormPanNumber] = useState(employee.panNumber || employee.personalTaxId || '');
  const [formPfUan, setFormPfUan] = useState(employee.pfUanNumber || '');
  const [formEsiNumber, setFormEsiNumber] = useState(employee.esiNumber || '');
  const [formCustomFieldValues, setFormCustomFieldValues] = useState<Record<string, any>>(employee.customFieldValues || {});

  // Keep form synced when active employee changes
  useEffect(() => {
    setFormPayrollGroupId(employee.payrollGroupId || '');
    setFormSalaryType(employee.salaryType || 'monthly');
    setFormBaseSalary(Number(employee.salaryDetails?.basic || employee.payrollSummary?.salary || 0) || 0);
    setFormHra(Number(employee.salaryDetails?.hra ?? Math.round((employee.salaryDetails?.basic || 0) * 0.4)) || 0);
    setFormSpecialAllowance(Number(employee.salaryDetails?.specialAllowance ?? 0) || 0);
    setFormConveyanceAllowance(Number(employee.salaryDetails?.conveyanceAllowance ?? 0) || 0);
    setFormMedicalAllowance(Number(employee.salaryDetails?.medicalAllowance ?? 0) || 0);
    setFormOtherAllowances(Number(employee.salaryDetails?.otherAllowances ?? 0) || 0);
    setFormCustomAllowances((employee.salaryDetails?.allowanceItems || []).map((a) => ({
      id: a.id || `alw_${Date.now()}_${Math.random()}`,
      name: a.name,
      amount: a.amount,
    })));
    setFormPfDeduction(employee.salaryDetails?.pfDeduction ?? Math.round(Math.min(employee.salaryDetails?.basic || 0, 15000) * 0.12));
    setFormTaxDeduction(employee.salaryDetails?.taxDeduction ?? Math.round((employee.salaryDetails?.basic || 0) * 0.08));
    setFormProfessionalTax(employee.salaryDetails?.professionalTax ?? 0);
    setFormHourlyRate(employee.hourlyRate || 0);
    setFormPanNumber(employee.panNumber || employee.personalTaxId || '');
    setFormPfUan(employee.pfUanNumber || '');
    setFormEsiNumber(employee.esiNumber || '');
    setFormCustomFieldValues(employee.customFieldValues || {});
  }, [employee]);

  // Dropdowns & Modals
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showAddJobTimelineModal, setShowAddJobTimelineModal] = useState(false);
  const [showAddContractModal, setShowAddContractModal] = useState(false);
  const [showAddPayslipModal, setShowAddPayslipModal] = useState(false);
  const [showBankDetailsModal, setShowBankDetailsModal] = useState(false);
  const [isEditingBankDetails, setIsEditingBankDetails] = useState(false);
  const [savingBankDetails, setSavingBankDetails] = useState(false);
  const [formBankName, setFormBankName] = useState('');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formIfscCode, setFormIfscCode] = useState('');
  const [formAccountHolderName, setFormAccountHolderName] = useState('');
  const [showIdCard, setShowIdCard] = useState(false);
  const [payslipToPrint, setPayslipToPrint] = useState<EmployeePayslipDocument | null>(null);

  // Check if account is activated
  const isCurrentPersona = Boolean(
    (employee.email && state.currentPersona?.email && employee.email.toLowerCase().trim() === state.currentPersona.email.toLowerCase().trim()) ||
    (employee.name && state.currentPersona?.name && employee.name.toLowerCase().trim() === state.currentPersona.name.toLowerCase().trim()) ||
    (employee.id && state.currentPersona?.id && employee.id === state.currentPersona.id)
  );
  const selfService = state.customOptions?.profileSelfServiceSettings;
  const canEditAddress = canEdit || Boolean(isCurrentPersona && (selfService?.allowSelfEditAddress ?? true));
  const canEditBank = canEdit || Boolean(isCurrentPersona && selfService?.allowSelfEditBank);
  const [showExitPanel, setShowExitPanel] = useState(false);
  const [exitInterviewDone, setExitInterviewDone] = useState(false);
  const [assetClearanceDone, setAssetClearanceDone] = useState(false);
  const [managerNocDone, setManagerNocDone] = useState(false);
  const [earlyExitDate, setEarlyExitDate] = useState('');

  const isSuperAdmin = employee.role === 'super_admin' || employee.employeeId === 'EMP001';

  const isActivated =
    isSuperAdmin ||
    employee.accountStatus === 'Activated' ||
    employee.accountStatus === 'Active' ||
    (employee.isActivated === true && employee.accountStatus !== 'Not Activated') ||
    (employee.isActivated !== false &&
      !!employee.accountStatus &&
      employee.accountStatus !== 'Not Activated' &&
      employee.accountStatus !== 'Deactivated' &&
      employee.accountStatus !== 'Suspended' &&
      employee.accountStatus !== 'Terminated');

  // Form State for Personal Info
  const [formFullName, setFormFullName] = useState(employee.fullName || employee.name || '');
  const [formGender, setFormGender] = useState<string>(employee.gender && employee.gender !== '—' ? employee.gender : 'None');
  const [formDOB, setFormDOB] = useState(normalizeDateForInput(employee.dateOfBirth));
  const [formNationality, setFormNationality] = useState(employee.nationality || '');
  const [formPhone, setFormPhone] = useState(employee.phone || '');
  const [formHealthCare, setFormHealthCare] = useState(employee.healthInsurance || '');
  const [formMaritalStatus, setFormMaritalStatus] = useState(employee.maritalStatus || '');
  const [formTaxId, setFormTaxId] = useState(employee.personalTaxId || '');
  const [formSocialInsurance, setFormSocialInsurance] = useState(employee.socialInsurance || '');

  // Address Form State
  const [formPrimaryAddress, setFormPrimaryAddress] = useState(employee.primaryAddress || '');
  const [formCountry, setFormCountry] = useState(employee.country || '');
  const [formStateProvince, setFormStateProvince] = useState(employee.stateProvince || '');
  const [formCity, setFormCity] = useState(employee.city || '');
  const [formPostCode, setFormPostCode] = useState(employee.postalCode || '');

  const isDummyEmergency =
    employee.emergencyContact?.name === 'Emergency Contact' ||
    employee.emergencyContact?.name === 'Contact Person' ||
    employee.emergencyContact?.name === '—' ||
    employee.emergencyContact?.phone === '+1 (555) 019-9999' ||
    employee.emergencyContact?.phone === '+1(555) 019-9999';

  // Emergency Form State
  const [formEmergencyName, setFormEmergencyName] = useState((!isDummyEmergency && employee.emergencyContact?.name) || '');
  const [formEmergencyPhone, setFormEmergencyPhone] = useState((!isDummyEmergency && employee.emergencyContact?.phone) || '');
  const [formEmergencyRelation, setFormEmergencyRelation] = useState((!isDummyEmergency && employee.emergencyContact?.relation) || '');

  // Job Info Form State
  const [formEmployeeId, setFormEmployeeId] = useState(employee.employeeId || '');
  const [formServiceYear, setFormServiceYear] = useState(employee.serviceYear || '');
  const [formJoinDate, setFormJoinDate] = useState(normalizeDateForInput(employee.joinDate || employee.joiningDate));
  const [formDesignation, setFormDesignation] = useState(employee.designation || '');
  const [formDepartment, setFormDepartment] = useState<string>(employee.department || '');
  const [formTeam, setFormTeam] = useState(employee.team || '');
  const [formOfficeName, setFormOfficeName] = useState(employee.officeName || employee.location || '');
  const [formOfficeNames, setFormOfficeNames] = useState<string[]>(() => {
    if (employee.offices && employee.offices.length > 0) {
      return employee.offices.map((o) => o.name).filter(Boolean);
    }
    if (employee.officeIds && employee.officeIds.length > 0 && state.customOptions?.officeRecords) {
      return employee.officeIds
        .map((id) => state.customOptions?.officeRecords?.find((r) => r.id === id)?.name)
        .filter(Boolean) as string[];
    }
    const single = employee.officeName || employee.location || '';
    return single ? [single] : [];
  });
  const [formPrimaryOfficeName, setFormPrimaryOfficeName] = useState(
    () =>
      employee.offices?.find((o) => o.isPrimary)?.name ||
      employee.officeName ||
      employee.location ||
      ''
  );
  const [formManagerId, setFormManagerId] = useState(employee.managerId || '');

  // Probation Form State
  const [formProbationStatus, setFormProbationStatus] = useState<'in_probation' | 'confirmed' | 'extended'>(
    employee.probationStatus === 'extended' || employee.probationStatus === 'in_probation'
      ? employee.probationStatus
      : employee.employmentStatus === 'on_probation'
        ? 'in_probation'
        : 'confirmed'
  );
  const [formProbationMonths, setFormProbationMonths] = useState<number>(
    employee.probationPeriodMonths ?? (state.customOptions?.probationSettings?.defaultDurationMonths || 3)
  );
  const [formProbationEndDate, setFormProbationEndDate] = useState<string>(() => {
    if (employee.probationEndDate) return employee.probationEndDate;
    const d = new Date(employee.joinDate || employee.joiningDate || new Date());
    d.setMonth(d.getMonth() + (employee.probationPeriodMonths || 3));
    return d.toISOString().split('T')[0];
  });
  const [isEditingProbation, setIsEditingProbation] = useState(false);

  // Synchronized Role & Effective Leave Quotas
  const effectiveQuotas = useMemo(() => {
    return getEffectiveLeaveQuotas(employee, state.customOptions?.leaveSettings, state.customOptions?.probationSettings);
  }, [employee, state.customOptions?.leaveSettings, state.customOptions?.probationSettings]);

  const currentCasualQuota = effectiveQuotas.effectiveQuotas.casualLeave;
  const currentSickQuota = effectiveQuotas.effectiveQuotas.sickLeave;
  const currentEarnedQuota = effectiveQuotas.effectiveQuotas.earnedLeave;
  const currentWfhQuota = effectiveQuotas.effectiveQuotas.compOff;

  const [isEditingLeaves, setIsEditingLeaves] = useState(false);
  const [formCasualQuota, setFormCasualQuota] = useState(currentCasualQuota);
  const [formSickQuota, setFormSickQuota] = useState(currentSickQuota);
  const [formEarnedQuota, setFormEarnedQuota] = useState(currentEarnedQuota);
  const [formWfhQuota, setFormWfhQuota] = useState(currentWfhQuota);

  // Setting Tab State
  const [formTimezone, setFormTimezone] = useState(employee.timezone || '');
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [formBirthdayPrivacy, setFormBirthdayPrivacy] = useState<'Everyone' | 'Only Me' | 'Department' | 'Managers'>('Everyone');

  // Avatar-only upload (same path as Header / profile modal).
  // Never call onUpdateEmployee here — that full-profile PUT often fails and never persists the photo.
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [optimisticAvatar, setOptimisticAvatar] = useState<string | null>(null);
  const displayAvatar = optimisticAvatar ?? employee.avatar ?? '';

  useEffect(() => {
    setOptimisticAvatar(null);
  }, [employee.id, employee.avatar]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file.');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const dataUrl = await compressAvatarImage(file);
      if (!dataUrl) {
        showToast('Could not process that image. Try a different photo.');
        return;
      }

      setOptimisticAvatar(dataUrl);

      updateState((prev) => {
        const updatedEmployees = (prev.employees || []).map((emp) =>
          emp.id === employee.id ||
          (emp.email && employee.email && emp.email.toLowerCase() === employee.email.toLowerCase()) ||
          emp.name === employee.name
            ? { ...emp, avatar: dataUrl }
            : emp
        );
        const isCurrentPersona =
          prev.currentPersona?.id === employee.id ||
          (prev.currentPersona?.email &&
            employee.email &&
            prev.currentPersona.email.toLowerCase() === employee.email.toLowerCase()) ||
          prev.currentPersona?.name === employee.name;

        const nextState = {
          ...prev,
          employees: updatedEmployees,
          currentPersona:
            isCurrentPersona && prev.currentPersona
              ? { ...prev.currentPersona, avatar: dataUrl }
              : prev.currentPersona,
        };
        saveStoredState(nextState);
        return nextState;
      });

      if (employee.id) {
        const res = await api.identity.updateEmployee(employee.id, { avatar: dataUrl });
        if (!res.success) {
          throw new Error(res.error?.message || 'Failed to save profile photo');
        }
      }

      showToast('Profile photo updated successfully');
    } catch (err) {
      console.error('Failed to upload profile picture:', err);
      setOptimisticAvatar(null);
      showToast(err instanceof Error ? err.message : 'Failed to update profile photo');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Sync form states whenever employee changes
  useEffect(() => {
    setFormFullName(employee.fullName || employee.name || '');
    setFormGender(employee.gender && employee.gender !== '—' ? employee.gender : 'None');
    setFormDOB(normalizeDateForInput(employee.dateOfBirth));
    setFormNationality(employee.nationality || '');
    setFormPhone(employee.phone || '');
    setFormHealthCare(employee.healthInsurance || '');
    setFormMaritalStatus(employee.maritalStatus || '');
    setFormTaxId(employee.personalTaxId || '');
    setFormSocialInsurance(employee.socialInsurance || '');
    setFormPrimaryAddress(employee.primaryAddress || '');
    setFormCountry(employee.country || '');
    setFormStateProvince(employee.stateProvince || '');
    setFormCity(employee.city || '');
    setFormPostCode(employee.postalCode || '');
    setFormEmergencyName(employee.emergencyContact?.name || '');
    setFormEmergencyPhone(employee.emergencyContact?.phone || '');
    setFormEmergencyRelation(employee.emergencyContact?.relation || '');
    setFormEmployeeId(employee.employeeId || '');
    setFormServiceYear(employee.serviceYear || '');
    setFormJoinDate(normalizeDateForInput(employee.joinDate || employee.joiningDate));
    setFormDesignation(employee.designation || '');
    setFormDepartment(
      alignedDepartment(employee.department, employee.team, state.customOptions?.departments || [])
    );
    setFormTeam(employee.team || '');
    setFormOfficeName(employee.officeName || employee.location || '');
    const nextOffices =
      employee.offices && employee.offices.length > 0
        ? employee.offices.map((o) => o.name).filter(Boolean)
        : employee.officeName || employee.location
          ? [String(employee.officeName || employee.location)]
          : [];
    setFormOfficeNames(nextOffices);
    setFormPrimaryOfficeName(
      employee.offices?.find((o) => o.isPrimary)?.name ||
        employee.officeName ||
        employee.location ||
        nextOffices[0] ||
        ''
    );
    setFormManagerId(employee.managerId || '');
    setFormTimezone(employee.timezone || '');
    setIsEditingPersonalInfo(false);
    setIsEditingAddress(false);
    setIsEditingEmergency(false);
    setIsEditingJobInfo(false);
    setIsCustomDesignation(false);
    setIsCustomDepartment(false);
    setIsEditingAccountSettings(false);
    setIsEditingPrivacy(false);
    setStatusChoice(
      employee.status === 'Notice Period'
        ? 'Notice Period'
        : employee.probationStatus === 'in_probation'
        ? 'Probation'
        : employee.status || 'Active'
    );
    if (employee.noticePeriodDays) setStatusNoticeDays(employee.noticePeriodDays);
    if (employee.noticePeriodEndDate) setStatusNoticeEndDate(employee.noticePeriodEndDate);
    if (employee.probationPeriodMonths) setStatusProbationMonths(employee.probationPeriodMonths);
    if (employee.probationEndDate) setStatusProbationEndDate(employee.probationEndDate);
  }, [employee]);

  // Status Modal State (Admin / HR)
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusChoice, setStatusChoice] = useState<string>(
    employee.status === 'Notice Period'
      ? 'Notice Period'
      : employee.probationStatus === 'in_probation' || (employee.status || '').toLowerCase() === 'probation' || (employee.status || '').toLowerCase() === 'on_probation'
      ? 'Probation'
      : employee.status || 'Active'
  );
  const [statusNoticeDays, setStatusNoticeDays] = useState<number>(employee.noticePeriodDays || 30);
  const [statusNoticeEndDate, setStatusNoticeEndDate] = useState<string>(
    employee.noticePeriodEndDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
      })()
  );
  const [statusProbationMonths, setStatusProbationMonths] = useState<number>(employee.probationPeriodMonths || 3);
  const [statusProbationEndDate, setStatusProbationEndDate] = useState<string>(
    employee.probationEndDate ||
      (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 3);
        return d.toISOString().split('T')[0];
      })()
  );

  const handleOpenStatusModal = () => {
    if (!canEdit) return;
    setStatusChoice(
      employee.status === 'Notice Period'
        ? 'Notice Period'
        : employee.probationStatus === 'in_probation' || (employee.status || '').toLowerCase() === 'probation' || (employee.status || '').toLowerCase() === 'on_probation'
        ? 'Probation'
        : employee.status === 'On Leave'
        ? 'On Leave'
        : employee.status === 'Terminated'
        ? 'Terminated'
        : employee.status === 'Suspended'
        ? 'Suspended'
        : 'Active'
    );
    setStatusNoticeDays(employee.noticePeriodDays || 30);
    setStatusNoticeEndDate(
      employee.noticePeriodEndDate ||
        (() => {
          const d = new Date();
          d.setDate(d.getDate() + 30);
          return d.toISOString().split('T')[0];
        })()
    );
    setStatusProbationMonths(employee.probationPeriodMonths || 3);
    setStatusProbationEndDate(
      employee.probationEndDate ||
        (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + 3);
          return d.toISOString().split('T')[0];
        })()
    );
    setShowStatusModal(true);
    setShowStatusDropdown(false);
  };

  const handleSaveStatusModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('Permission denied.');
      return;
    }

    let updatedEmployee: Employee = { ...employee };

    if (statusChoice === 'Active') {
      updatedEmployee = {
        ...updatedEmployee,
        status: 'Active',
        isActivated: true,
        isDeactivated: false,
        accountStatus: 'Active',
        probationStatus: 'confirmed',
        noticePeriodEndDate: undefined,
        noticePeriodDays: undefined,
      };
      setFormProbationStatus('confirmed');
    } else if (statusChoice === 'Probation') {
      updatedEmployee = {
        ...updatedEmployee,
        status: 'Probation',
        isActivated: true,
        isDeactivated: false,
        accountStatus: 'In Probation',
        probationStatus: 'in_probation',
        probationPeriodMonths: statusProbationMonths,
        probationEndDate: statusProbationEndDate,
        noticePeriodEndDate: undefined,
        noticePeriodDays: undefined,
      };
      setFormProbationStatus('in_probation');
      setFormProbationMonths(statusProbationMonths);
      setFormProbationEndDate(statusProbationEndDate);
    } else if (statusChoice === 'Notice Period') {
      updatedEmployee = {
        ...updatedEmployee,
        status: 'Notice Period',
        isActivated: true,
        isDeactivated: false,
        accountStatus: 'Notice Period',
        noticePeriodDays: statusNoticeDays,
        noticePeriodEndDate: statusNoticeEndDate,
      };
    } else if (statusChoice === 'On Leave') {
      updatedEmployee = {
        ...updatedEmployee,
        status: 'On Leave',
        isActivated: true,
        isDeactivated: false,
        accountStatus: 'On Leave',
      };
    } else if (statusChoice === 'Terminated') {
      updatedEmployee = {
        ...updatedEmployee,
        status: 'Terminated',
        isActivated: false,
        isDeactivated: true,
        accountStatus: 'Deactivated',
      };
    } else if (statusChoice === 'Suspended') {
      updatedEmployee = {
        ...updatedEmployee,
        status: 'Suspended',
        isActivated: false,
        isDeactivated: true,
        accountStatus: 'Suspended',
      };
    } else if (statusChoice === 'Not Activated') {
      updatedEmployee = {
        ...updatedEmployee,
        status: 'Not Activated',
        isActivated: false,
        isDeactivated: false,
        accountStatus: 'Not Activated',
      };
    }

    onUpdateEmployee(updatedEmployee);
    setShowStatusModal(false);
    showToast(`Employment status updated to ${statusChoice}`);
  };

  // Modals form state
  const [newJtEffectiveDate, setNewJtEffectiveDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [newJtJobTitle, setNewJtJobTitle] = useState(employee.designation || 'Specialist');
  const [newJtPositionType, setNewJtPositionType] = useState('Full-time');
  const [newJtEmploymentType, setNewJtEmploymentType] = useState('Permanent');
  const [newJtLineManager, setNewJtLineManager] = useState((employee as any).reportingManagerName || (employee as any).manager || '');

  const [newCtNumber, setNewCtNumber] = useState(() => `#CT-${new Date().getFullYear()}`);
  const [newCtName, setNewCtName] = useState('Employment Contract');
  const [newCtType, setNewCtType] = useState('Full-time Standard');
  const [newCtStartDate, setNewCtStartDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [newCtEndDate, setNewCtEndDate] = useState('-');

  const [newPsName, setNewPsName] = useState(() => `Payslip_${new Date().toLocaleString('default', { month: 'short' })}_${new Date().getFullYear()}.pdf`);
  const [newPsPeriod, setNewPsPeriod] = useState(() => `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`);
  const [newPsDate, setNewPsDate] = useState(() => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
  const [newPsAmount, setNewPsAmount] = useState(() => `₹ ${employee.salaryDetails?.basic || employee.payrollSummary?.salary || 0}`);

  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);

  // Filters for the Attendance & Leave tab within Employee Detail
  const [attStatusFilter, setAttStatusFilter] = useState<string>('All');
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<string>('All');

  // Compute attendance log history for this specific employee
  const employeeAttendanceLogs = useMemo(() => {
    const rawAtt = (state.attendance || []).filter(
      (a) =>
        a.employeeId === employee.id ||
        (employee.employeeId && a.employeeId === employee.employeeId) ||
        (a.employeeName && a.employeeName.toLowerCase() === (employee.name || '').toLowerCase())
    );

    const realLogs = rawAtt.map((a) => {
      let hoursDisplay = '—';
      if (typeof a.workingHours === 'number' && a.workingHours > 0) {
        const h = Math.floor(a.workingHours);
        const m = Math.round((a.workingHours % 1) * 60);
        hoursDisplay = m > 0 ? `${h}h ${m}m` : `${h}h`;
      }
      const sessions = Array.isArray(a.sessions) && a.sessions.length > 1 ? a.sessions : null;
      return {
        date: a.date,
        day: new Date(a.date).toLocaleDateString('en-GB', { weekday: 'long' }),
        inTime: sessions ? sessions.map((s) => s.checkIn).join(' · ') : a.checkIn || '—',
        outTime: sessions ? sessions.map((s) => s.checkOut || '—').join(' · ') : a.checkOut || '—',
        hours: hoursDisplay,
        breakH: typeof a.breakHours === 'number' && a.breakHours > 0 ? `${Math.round(a.breakHours * 60)}m` : '—',
        loc: (a as any).officeLocation || (a as any).location || employee.officeName || employee.location || (isInstitution ? 'Campus' : 'Main Office'),
        status: a.status || 'Present',
      };
    });

    return realLogs.sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [state.attendance, employee.id, employee.employeeId, employee.name, employee.officeName, employee.location, isInstitution]);

  // Available departments from customOptions and existing employees
  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    if (formDepartment && formDepartment.trim()) set.add(formDepartment.trim());
    if (employee.department && employee.department.trim()) set.add(employee.department.trim());

    if (state.customOptions?.departments) {
      state.customOptions.departments.forEach((d) => {
        if (d && typeof d === 'string' && d.trim()) set.add(d.trim());
      });
    }

    (state.employees || []).forEach((e) => {
      if (e.department && e.department.trim()) set.add(e.department.trim());
    });

    return Array.from(set).filter(Boolean);
  }, [formDepartment, employee.department, state.customOptions?.departments, state.employees]);

  // Available designations from customOptions and existing employees
  const availableDesignations = useMemo(() => {
    const set = new Set<string>();
    if (formDesignation && formDesignation.trim()) set.add(formDesignation.trim());
    if (employee.designation && employee.designation.trim()) set.add(employee.designation.trim());

    if (state.customOptions?.designations) {
      state.customOptions.designations.forEach((d) => {
        if (d && typeof d === 'string' && d.trim()) set.add(d.trim());
      });
    }

    (state.employees || []).forEach((e) => {
      if (e.designation && e.designation.trim()) set.add(e.designation.trim());
    });

    return Array.from(set).filter(Boolean);
  }, [formDesignation, employee.designation, state.customOptions?.designations, state.employees]);

  const departmentNames = state.customOptions?.departments || [];
  const profileDepartment = alignedDepartment(employee.department, employee.team, departmentNames);
  const teamRecords = ((state.customOptions as { teamRecords?: Array<{ name?: string; departmentName?: string }> })
    ?.teamRecords || []);

  const teamsForDepartment = (dept: string) => {
    const key = dept.trim().toLowerCase();
    const fromRecords = new Set<string>();
    for (const rec of teamRecords) {
      const recDept = String(rec.departmentName || '').trim().toLowerCase();
      if (key && recDept && recDept !== key) continue;
      if (key && !recDept) continue;
      const name = String(rec.name || '').trim();
      if (name) fromRecords.add(name);
    }
    if (fromRecords.size > 0) return Array.from(fromRecords);

    const fromPeople = new Set<string>();
    for (const person of state.employees || []) {
      const personDept = alignedDepartment(person.department, person.team, departmentNames).trim().toLowerCase();
      if (key && personDept !== key) continue;
      const name = String(person.team || '').trim();
      if (!name) continue;
      const implied = departmentImpliedByTeamName(name, departmentNames);
      if (key && implied && implied.toLowerCase() !== key) continue;
      fromPeople.add(name);
    }
    return Array.from(fromPeople);
  };

  const teamBelongsToDepartment = (teamName: string, dept: string) => {
    const key = dept.trim().toLowerCase();
    const teamKey = teamName.trim().toLowerCase();
    if (!teamKey || !key) return false;
    const implied = departmentImpliedByTeamName(teamName, departmentNames);
    if (implied) return implied.toLowerCase() === key;
    const rec = teamRecords.find((row) => String(row.name || '').trim().toLowerCase() === teamKey);
    if (rec?.departmentName) return rec.departmentName.trim().toLowerCase() === key;
    if (rec) return teamsForDepartment(dept).some((name) => name.toLowerCase() === teamKey);
    return true;
  };

  const handleDepartmentChange = (next: string) => {
    setFormDepartment(next);
    const options = teamsForDepartment(next);
    const current = formTeam.trim();
    if (current && teamBelongsToDepartment(current, next) && options.some((name) => name.toLowerCase() === current.toLowerCase())) {
      return;
    }
    const exact = options.find((name) => name.toLowerCase() === next.trim().toLowerCase());
    if (exact) {
      setFormTeam(exact);
      return;
    }
    if (options.length === 1) {
      setFormTeam(options[0]);
      return;
    }
    setFormTeam(next.trim() ? `${next.trim()} Team` : '');
  };

  const handleTeamChange = (next: string) => {
    setFormTeam(next);
    const implied = departmentImpliedByTeamName(next, departmentNames);
    const rec = teamRecords.find(
      (row) => String(row.name || '').trim().toLowerCase() === next.trim().toLowerCase()
    );
    const nextDept = implied || String(rec?.departmentName || '').trim();
    if (nextDept) setFormDepartment(nextDept);
  };

  useEffect(() => {
    if (isEditingJobInfo) return;
    setFormDepartment(alignedDepartment(employee.department, employee.team, departmentNames));
  }, [employee.id, employee.department, employee.team, departmentNames, isEditingJobInfo]);

  // Available offices (filtered so physical street addresses are not treated as office branch names)
  const availableOffices = useMemo(() => {
    const orgAddress = state.organization?.officeLocation?.address?.trim() || '';
    const isStreetAddress = (val?: string) => {
      if (!val) return false;
      const clean = val.trim();
      if (orgAddress && clean.toLowerCase() === orgAddress.toLowerCase()) return true;
      if ((clean.match(/,/g) || []).length >= 3 && /\d{5,6}/.test(clean)) return true;
      return false;
    };

    const set = new Set<string>();
    if (formOfficeName && !isStreetAddress(formOfficeName)) set.add(formOfficeName.trim());
    if (employee.officeName && !isStreetAddress(employee.officeName)) set.add(employee.officeName.trim());
    if (employee.location && !isStreetAddress(employee.location)) set.add(employee.location.trim());

    if (state.customOptions?.offices) {
      state.customOptions.offices.forEach((o) => {
        if (o && typeof o === 'string' && o.trim() && !isStreetAddress(o)) set.add(o.trim());
      });
    }

    (state.employees || []).forEach((e) => {
      if (e.officeName && !isStreetAddress(e.officeName)) set.add(e.officeName.trim());
      if (e.location && !isStreetAddress(e.location)) set.add(e.location.trim());
    });

    if (set.size === 0 && orgAddress) {
      const firstPart = orgAddress.split(',')[0].trim();
      if (firstPart && !isStreetAddress(firstPart)) {
        set.add(firstPart);
      }
    }

    return Array.from(set).filter(Boolean);
  }, [formOfficeName, employee.officeName, employee.location, state.customOptions?.offices, state.organization?.officeLocation?.address, state.employees, isInstitution]);

  // Compute leaves history for this specific employee
  const employeeLeaveRecords = useMemo(() => {
    return (state.leaves || []).filter((l) => leaveBelongsToEmployee(l, employee));
  }, [state.leaves, employee]);

  // Leave balance computation
  const casualUsed = employeeLeaveRecords
    .filter((l) => l.leaveType === 'Casual Leave' && l.status === 'Approved')
    .reduce((acc, l) => acc + (l.daysCount || 1), 0);
  const sickUsed = employeeLeaveRecords
    .filter((l) => l.leaveType === 'Sick Leave' && l.status === 'Approved')
    .reduce((acc, l) => acc + (l.daysCount || 1), 0);
  const earnedUsed = employeeLeaveRecords
    .filter((l) => l.leaveType === 'Earned Leave' && l.status === 'Approved')
    .reduce((acc, l) => acc + (l.daysCount || 1), 0);
  const wfhUsed = employeeLeaveRecords
    .filter((l) => (l.leaveType === 'Work From Home' || (l.leaveType as any) === 'WFH') && l.status === 'Approved')
    .reduce((acc, l) => acc + (l.daysCount || 1), 0);

  const totalCasual = currentCasualQuota;
  const totalSick = currentSickQuota;
  const totalEarned = currentEarnedQuota;
  const totalWfh = currentWfhQuota;

  // Server ledger balances are already remaining. Do not subtract approved days again.
  const fromServer = !!effectiveQuotas.balancesFromServer;
  const casualLeft = fromServer ? totalCasual : Math.max(0, totalCasual - casualUsed);
  const sickLeft = fromServer ? totalSick : Math.max(0, totalSick - sickUsed);
  const earnedLeft = fromServer ? totalEarned : Math.max(0, totalEarned - earnedUsed);
  const wfhLeft = fromServer ? totalWfh : Math.max(0, totalWfh - wfhUsed);

  // Present and on-time stats
  const presentDaysCount = employeeAttendanceLogs.filter((l) => l.status === 'Present' || l.status === 'Work From Home').length;
  const onTimeCount = employeeAttendanceLogs.filter((l) => l.status === 'Present').length;
  const onTimePercent = employeeAttendanceLogs.length > 0 ? Math.round((onTimeCount / employeeAttendanceLogs.length) * 100) : 0;

  // Average Log-In time
  const avgLogInStr = useMemo(() => {
    const validCheckIns = employeeAttendanceLogs
      .map((l) => l.inTime)
      .filter((t) => t && t !== '—');
    if (validCheckIns.length === 0) return '—';

    let totalMinutes = 0;
    let count = 0;
    for (const t of validCheckIns) {
      const match = t.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const ampm = match[3]?.toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        totalMinutes += hours * 60 + mins;
        count++;
      }
    }
    if (count === 0) return '—';
    const avgMin = Math.round(totalMinutes / count);
    const avgH = Math.floor(avgMin / 60) % 24;
    const avgM = avgMin % 60;
    const displayH = avgH % 12 === 0 ? 12 : avgH % 12;
    const ampm = avgH >= 12 ? 'PM' : 'AM';
    return `${String(displayH).padStart(2, '0')}:${String(avgM).padStart(2, '0')} ${ampm}`;
  }, [employeeAttendanceLogs]);

  // Average working hours
  const avgHoursStr = useMemo(() => {
    const validHours = (state.attendance || [])
      .filter(
        (a) =>
          (a.employeeId === employee.id || (employee.employeeId && a.employeeId === employee.employeeId) || a.employeeName === employee.name) &&
          typeof a.workingHours === 'number' &&
          a.workingHours > 0
      )
      .map((a) => a.workingHours);
    if (validHours.length === 0) return '—';
    const sum = validHours.reduce((acc, h) => acc + h, 0);
    const avg = sum / validHours.length;
    const h = Math.floor(avg);
    const m = Math.round((avg % 1) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }, [state.attendance, employee.id, employee.employeeId, employee.name]);

  // Helper to save personal info — await parent persist so UI only exits edit mode on success
  const handleSavePersonalInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('Permission denied. Only HR and Super Admin can edit employee records.');
      return;
    }
    const fullName = formFullName.trim() || employee.name;
    const updated: Employee = {
      ...employee,
      name: fullName,
      fullName,
      gender: formGender === 'None' ? undefined : formGender,
      dateOfBirth: formDOB.trim() || undefined,
      nationality: formNationality,
      phone: formPhone,
      email: employee.email,
      healthInsurance: formHealthCare,
      maritalStatus: formMaritalStatus,
      personalTaxId: formTaxId,
      socialInsurance: formSocialInsurance,
    };
    setSavingPersonalInfo(true);
    try {
      await onUpdateEmployee(updated);
      setIsEditingPersonalInfo(false);
    } catch {
      // Parent surfaces the error toast; stay in edit mode so the user can retry.
    } finally {
      setSavingPersonalInfo(false);
    }
  };

  // Helper to save address
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditAddress) {
      showToast('You do not have permission to edit this address.');
      return;
    }
    const updated: Employee = {
      ...employee,
      primaryAddress: formPrimaryAddress,
      country: formCountry,
      stateProvince: formStateProvince,
      city: formCity,
      postalCode: formPostCode,
    };
    try {
      await onUpdateEmployee(updated);
      setIsEditingAddress(false);
    } catch {
      // Parent surfaces the error toast; stay in edit mode so the user can retry.
    }
  };

  // Helper to save emergency contact
  const handleSaveEmergency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('Permission denied. Only HR and Super Admin can edit employee records.');
      return;
    }
    const updated: Employee = {
      ...employee,
      emergencyContact: {
        name: formEmergencyName,
        phone: formEmergencyPhone,
        relation: formEmergencyRelation,
      },
    };
    try {
      await onUpdateEmployee(updated);
      setIsEditingEmergency(false);
    } catch {
      // Parent surfaces the error toast; stay in edit mode so the user can retry.
    }
  };

  // Helper to save job info
  const handleSaveJobInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('Permission denied. Only HR and Super Admin can edit employee records.');
      return;
    }
    const selectedMgr = allEmployees.find(
      (e) => e.id === formManagerId || e.name === formManagerId
    );
    const primaryName =
      (formPrimaryOfficeName && formOfficeNames.includes(formPrimaryOfficeName)
        ? formPrimaryOfficeName
        : formOfficeNames[0]) || formOfficeName.trim();
    const officeRecords = state.customOptions?.officeRecords || [];
    const resolvedOfficeIds = formOfficeNames
      .map((name) => officeRecords.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())?.id)
      .filter(Boolean) as string[];
    const primaryOfficeId =
      officeRecords.find((r) => r.name.trim().toLowerCase() === primaryName.trim().toLowerCase())?.id ||
      resolvedOfficeIds[0];

    const updated: Employee = {
      ...employee,
      employeeId: formEmployeeId,
      serviceYear: formServiceYear,
      joinDate: formJoinDate,
      designation: formDesignation.trim() || employee.designation,
      department: (() => {
        const dept = formDepartment.trim();
        const picked = formTeam.trim();
        const implied = departmentImpliedByTeamName(picked, departmentNames);
        const userPickedOtherDept =
          !!dept &&
          dept.toLowerCase() !== String(employee.department || '').trim().toLowerCase() &&
          dept.toLowerCase() !== String(implied || '').toLowerCase();
        if (implied && !userPickedOtherDept) return implied as any;
        return (dept as any) || employee.department;
      })(),
      team: (() => {
        const dept = formDepartment.trim();
        const picked = formTeam.trim();
        const implied = departmentImpliedByTeamName(picked, departmentNames);
        const userPickedOtherDept =
          !!dept &&
          dept.toLowerCase() !== String(employee.department || '').trim().toLowerCase() &&
          dept.toLowerCase() !== String(implied || '').toLowerCase();
        if (userPickedOtherDept && picked && !teamBelongsToDepartment(picked, dept)) {
          return teamsForDepartment(dept)[0] || `${dept} Team`;
        }
        if (picked) return picked;
        const nextDept = implied || dept;
        return nextDept ? `${nextDept} Team` : employee.team;
      })(),
      officeName: primaryName || employee.officeName,
      location: primaryName || employee.location,
      officeId: primaryOfficeId,
      officeIds: resolvedOfficeIds.length > 0 ? resolvedOfficeIds : employee.officeIds,
      offices:
        formOfficeNames.length > 0
          ? formOfficeNames.map((name) => {
              const rec = officeRecords.find(
                (r) => r.name.trim().toLowerCase() === name.trim().toLowerCase()
              );
              return {
                id: rec?.id || name,
                name,
                isPrimary: name === primaryName,
              };
            })
          : employee.offices,
      managerId: selectedMgr ? selectedMgr.id : undefined,
      managerName: selectedMgr ? selectedMgr.name : undefined,
      lineManager: selectedMgr
        ? {
            name: selectedMgr.name,
            username: selectedMgr.email || selectedMgr.name,
            avatar: selectedMgr.avatar,
            designation: selectedMgr.designation,
          }
        : undefined,
      probationStatus: formProbationStatus,
      probationPeriodMonths: formProbationStatus === 'confirmed' ? 0 : formProbationMonths,
      probationEndDate: formProbationStatus === 'confirmed' ? undefined : formProbationEndDate,
    };
    try {
      await onUpdateEmployee(updated);
      setIsEditingJobInfo(false);
      setIsCustomDesignation(false);
      setIsCustomDepartment(false);
      setIsCustomTeam(false);
    } catch {
      // Parent surfaces the error toast; stay in edit mode so the user can retry.
    }
  };

  const handleConfirmProbation = () => {
    onUpdateEmployee({
      ...employee,
      probationStatus: 'confirmed',
    });
    setFormProbationStatus('confirmed');
    showToast(`${employee.name} has been confirmed as permanent employee`);
  };

  const handleExtendProbation = (extraMonths: number) => {
    const currentEnd = formProbationEndDate ? new Date(formProbationEndDate) : new Date();
    currentEnd.setMonth(currentEnd.getMonth() + extraMonths);
    const newEndStr = currentEnd.toISOString().split('T')[0];
    const newMonths = (formProbationMonths || 3) + extraMonths;
    onUpdateEmployee({
      ...employee,
      probationStatus: 'extended',
      probationPeriodMonths: newMonths,
      probationEndDate: newEndStr,
    });
    setFormProbationStatus('extended');
    setFormProbationMonths(newMonths);
    setFormProbationEndDate(newEndStr);
    showToast(`Probation extended by ${extraMonths} month(s) until ${newEndStr}`);
  };

  const handleSaveProbation = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateEmployee({
      ...employee,
      probationStatus: formProbationStatus,
      probationPeriodMonths: formProbationStatus === 'confirmed' ? 0 : formProbationMonths,
      probationEndDate: formProbationStatus === 'confirmed' ? undefined : formProbationEndDate,
    });
    setIsEditingProbation(false);
    showToast('Probation period details updated');
  };

  const handleSaveLeaves = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateEmployee({
      ...employee,
      hasCustomLeaveOverride: true,
      leaveBalances: {
        casualLeave: Math.max(0, Number(formCasualQuota)),
        sickLeave: Math.max(0, Number(formSickQuota)),
        earnedLeave: Math.max(0, Number(formEarnedQuota)),
        compOff: Math.max(0, Number(formWfhQuota)),
      },
    });
    setIsEditingLeaves(false);
    showToast(`Leave balances updated for ${employee.name}`);
  };

  const handleResetToRoleQuotas = () => {
    onUpdateEmployee({
      ...employee,
      hasCustomLeaveOverride: false,
    });
    setIsEditingLeaves(false);
    showToast(`Reset leave quotas to role defaults for ${employee.name}`);
  };

  // Add Job Timeline
  const handleAddJobTimeline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('Permission denied.');
      return;
    }
    const newEntry: JobTimelineItem = {
      id: `jt_${Date.now()}`,
      effectiveDate: newJtEffectiveDate,
      jobTitle: newJtJobTitle,
      positionType: newJtPositionType,
      employmentType: newJtEmploymentType,
      lineManager: newJtLineManager,
    };
    const updated: Employee = {
      ...employee,
      jobTimeline: [...(employee.jobTimeline || []), newEntry],
    };
    onUpdateEmployee(updated);
    setShowAddJobTimelineModal(false);
    showToast('Job timeline event added');
  };

  // Add Contract
  const handleAddContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('Permission denied.');
      return;
    }
    const newEntry: ContractTimelineItem = {
      id: `ct_${Date.now()}`,
      contractNumber: newCtNumber,
      contractName: newCtName,
      contractType: newCtType,
      startDate: newCtStartDate,
      endDate: newCtEndDate,
    };
    const updated: Employee = {
      ...employee,
      contractTimeline: [...(employee.contractTimeline || []), newEntry],
    };
    onUpdateEmployee(updated);
    setShowAddContractModal(false);
    showToast('Contract record added');
  };

  // Add Payslip
  const handleAddPayslip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('Permission denied.');
      return;
    }
    const newEntry: EmployeePayslipDocument = {
      id: `ps_${Date.now()}`,
      name: newPsName,
      period: newPsPeriod,
      date: newPsDate,
      amount: newPsAmount,
      status: 'Paid',
    };
    const updated: Employee = {
      ...employee,
      payslipDocuments: [...(employee.payslipDocuments || []), newEntry],
    };
    onUpdateEmployee(updated);
    setShowAddPayslipModal(false);
    showToast('Payslip generated');
  };

  // Delete Payslip
  const handleDeletePayslip = (id: string) => {
    if (!canEdit) {
      showToast('Permission denied.');
      return;
    }
    const updated: Employee = {
      ...employee,
      payslipDocuments: (employee.payslipDocuments || []).filter((p) => p.id !== id),
    };
    onUpdateEmployee(updated);
    showToast('Payslip removed');
  };

  // Handle Document Upload
  const handleFileUpload = (files: FileList | null) => {
    if (!canEdit) {
      showToast('Permission denied. Only HR and Super Admin can upload employee records.');
      return;
    }
    if (!files || files.length === 0) return;
    const file = files[0];
    const newDoc: EmployeeDocument = {
      id: `doc_${Date.now()}`,
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      uploadDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      type: file.type || 'application/pdf',
      category: 'Personal',
    };
    const updated: Employee = {
      ...employee,
      personalDocuments: [newDoc, ...(employee.personalDocuments || [])],
    };
    onUpdateEmployee(updated);
    showToast(`Uploaded ${file.name}`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (canEdit) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (canEdit) handleFileUpload(e.dataTransfer.files);
  };

  const handleDeletePersonalDoc = (id: string) => {
    if (!canEdit) {
      showToast('Permission denied.');
      return;
    }
    const updated: Employee = {
      ...employee,
      personalDocuments: (employee.personalDocuments || []).filter((d) => d.id !== id),
    };
    onUpdateEmployee(updated);
    showToast('Document deleted');
  };

  const handleChangeStatus = (newStatus: 'Active' | 'On Leave' | 'Onboarding' | 'Terminated') => {
    if (!canEdit) {
      showToast('Permission denied.');
      return;
    }
    const isDeactivated = newStatus === 'Terminated';
    const updated: Employee = {
      ...employee,
      status: newStatus,
      isDeactivated,
      accountStatus: isDeactivated ? 'Terminated' : (employee.accountStatus || 'Activated'),
    };
    onUpdateEmployee(updated);
    setShowStatusDropdown(false);
    showToast(`Status updated to ${newStatus}`);
  };

  const hasManager = !!employee.managerId || (!!employee.lineManager?.name && employee.lineManager.name !== '—');
  const managerObj = hasManager
    ? allEmployees.find(
        (e) => (employee.managerId && e.id === employee.managerId) || (employee.lineManager?.name && e.name === employee.lineManager.name)
      )
    : null;
  const managerDisplayName = managerObj ? managerObj.name : (hasManager ? (employee.managerName || employee.lineManager?.name || '—') : '— (None / Top Level)');
  const managerDisplayAvatar = managerObj?.avatar || (hasManager ? employee.lineManager?.avatar : undefined);

  const handleResendInvite = () => {
    if (!canEdit) return;
    showToast(`Invitation email sent to ${employee.email}`);
  };

  const handleCopyMagicLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      navigator.clipboard.writeText(`${origin}/employee-onboarding?id=${employee.id}`);
    }
    showToast(`Onboarding sign-in link copied to clipboard!`);
  };

  const handleActivateManually = () => {
    if (!canEdit) {
      showToast('Permission denied.');
      return;
    }
    const updated: Employee = {
      ...employee,
      isActivated: true,
      accountStatus: 'Activated',
      status: 'Active',
      hasCompletedProfile: true,
    };
    onUpdateEmployee(updated);
    api.identity.updateEmployee(employee.id, {
      isActivated: true,
      accountStatus: 'Activated',
      hasCompletedProfile: true,
      employmentStatus: 'active',
    }).catch((err) => console.warn('Could not sync manual activation to backend:', err));
    showToast(`${employee.name} account activated successfully!`);
  };

  const hydrateBankForm = () => {
    const bank = employee.bankDetails;
    setFormBankName(blankBankValue(bank?.bankName));
    setFormAccountNumber(blankBankValue(bank?.accountNumber).replace(/\D/g, '').slice(0, 18));
    setFormIfscCode(blankBankValue(bank?.ifscCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11));
    setFormAccountHolderName(blankBankValue(bank?.accountHolderName) || employee.fullName || employee.name || '');
  };

  const handleOpenBankDetailsModal = () => {
    if (!canEditBank) return;
    hydrateBankForm();
    setShowBankDetailsModal(true);
  };

  const handleStartBankEdit = () => {
    if (!canEditBank) return;
    if (isEditingBankDetails) {
      setIsEditingBankDetails(false);
      return;
    }
    hydrateBankForm();
    setIsEditingBankDetails(true);
  };

  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditBank) {
      showToast('Permission denied. Bank details can be edited by HR, or by you when self-service is on.');
      return;
    }

    const bankName = formBankName.trim();
    const accountNumber = formAccountNumber.replace(/\D/g, '');
    const ifscCode = formIfscCode.trim().toUpperCase();
    const accountHolderName = formAccountHolderName.trim() || employee.fullName || employee.name || '';

    if (!bankName || !accountNumber || !ifscCode || !accountHolderName) {
      showToast('Account holder, bank name, account number, and IFSC are required.');
      return;
    }

    setSavingBankDetails(true);
    try {
      const res = await api.identity.updateBankDetails(employee.id, {
        accountHolderName,
        accountNumber,
        bankName,
        routingOrIfscCode: ifscCode,
      });
      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to save bank details');
      }

      onUpdateEmployee({
        ...employee,
        bankDetails: {
          accountNumber,
          ifscCode,
          bankName,
          accountHolderName,
        },
      });
      setShowBankDetailsModal(false);
      setIsEditingBankDetails(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save bank details');
    } finally {
      setSavingBankDetails(false);
    }
  };

  const profileStatusLabel =
    employee.accountStatus || (isActivated ? employee.status || 'Active' : 'Not Activated');
  const profileStatusTone =
    profileStatusLabel === 'Active' || employee.status === 'Active'
      ? 'border-[#53886b]/30 bg-[#eaf1ee] text-[#3f6a52]'
      : profileStatusLabel === 'Deactivated' ||
          profileStatusLabel === 'Suspended' ||
          profileStatusLabel === 'Terminated' ||
          employee.status === 'Terminated'
        ? 'border-[#8b3133]/25 bg-[#faeeee] text-[#8b3133]'
        : 'border-[#d8e8f2] bg-[#f8fbfe] text-[#17324e]';

  if(mobile && activeTab==='general' && !isEditingPersonalInfo && !isEditingAddress && !isEditingEmergency && !isEditingBankDetails) return <MobileEmployeeGeneral employee={employee} canEdit={canEdit} onBack={onBack} onEdit={()=>setIsEditingPersonalInfo(true)} onTab={setActiveTab}/>;
  // Read-only full detail for non-editors (self view). Edit controls stay gated by canEdit.
  // (Previously short-circuited to EmployeeProfileCardModal.)

  return (
    <div className={`employee-profile-studio ${peopleStyles.record}`} data-public-profile={activeTab === 'public_profile'}>
      {mobile&&<MobilePageTitle title={activeTab==='general'?'Edit details':activeTab==='job'?'Job & role':activeTab==='documents'?'Employee documents':activeTab==='setting'?'Employee settings':activeTab==='payroll'?'Salary structure':activeTab==='public_profile'?'Public profile':'Employee attendance'} onBack={()=>{setActiveTab('general');setIsEditingPersonalInfo(false);setIsEditingAddress(false);setIsEditingEmergency(false);setIsEditingBankDetails(false);}}/>}
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-[#17324e] text-white px-4 py-2.5 rounded-[6px] shadow-xl text-[13px] font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-4 h-4 text-[#d7ebe0]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Breadcrumb Bar */}
      <div className="employee-profile-desktop-back flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="ep-back"
        >
          <ChevronLeft className="h-4 w-4 text-[#687789]" />
          <span>Back to Employees</span>
        </button>
      </div>

      {/* Main 2-Column Layout */}
      <div className="employee-profile-grid grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: Employee Profile Card                        */}
        {/* ========================================================= */}
        <aside className="employee-profile-sidebar w-full">
          <div className="employee-profile-identity">
            <div className="relative shrink-0">
              <div className="h-16 w-16 overflow-hidden rounded-full border border-[#dde4e9] bg-[#e8eef2]">
                <UserAvatar
                  src={displayAvatar}
                  name={employee.name}
                  alt={employee.name}
                  className="h-full w-full text-base"
                  iconClassName="h-7 w-7"
                />
              </div>
              {(canEdit || state.currentPersona?.id === employee.id || state.currentPersona?.name === employee.name) && (
                <>
                  <input
                    type="file"
                    ref={avatarInputRef}
                    onChange={handleAvatarChange}
                    accept="image/*"
                    className="hidden"
                    disabled={isUploadingAvatar}
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    title={isUploadingAvatar ? 'Uploading…' : 'Change profile photo'}
                    className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#17324e] text-white hover:bg-[#285275] disabled:cursor-wait disabled:opacity-60"
                  >
                    <Camera className={`h-3.5 w-3.5 ${isUploadingAvatar ? 'animate-pulse' : ''}`} />
                  </button>
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate">{employee.name}</h2>
              <p className="truncate">
                {employee.designation || (isSuperAdmin ? 'Founder & CEO' : '—')}
              </p>
              <button
                type="button"
                disabled={!canEdit}
                onClick={handleOpenStatusModal}
                title={canEdit ? 'Change employment status' : undefined}
                className={`mt-3 inline-flex h-7 items-center rounded-[4px] border px-2.5 text-[12px] font-semibold ${
                  canEdit ? 'cursor-pointer hover:brightness-[0.98]' : 'cursor-default'
                } ${profileStatusTone}`}
              >
                {profileStatusLabel}
              </button>
            </div>
          </div>

          <dl>
            <div>
              <dt>Email</dt>
              <dd>
                {employee.email ? (
                  <a href={`mailto:${employee.email}`} className="text-[#17324e] hover:underline">
                    {employee.email}
                  </a>
                ) : (
                  '—'
                )}
                {canChangeLoginEmail && (
                  <button
                    type="button"
                    onClick={() => setChangeEmailOpen(true)}
                    className="mt-1.5 block cursor-pointer text-[12px] font-semibold text-[#2d628e] hover:text-[#17324e]"
                  >
                    Change login email
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{employee.phone || '—'}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>
                {profileDepartment && onOpenDepartment ? (
                  <button
                    type="button"
                    onClick={() => onOpenDepartment(profileDepartment)}
                    className="text-left text-[#17324e] hover:underline"
                  >
                    {profileDepartment}
                  </button>
                ) : (
                  profileDepartment || '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Team</dt>
              <dd>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingJobInfo(true);
                      setActiveTab('job');
                    }}
                    className="text-left text-[#17324e] hover:underline"
                  >
                    {employee.team || 'Add team'}
                  </button>
                ) : (
                  employee.team || '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Office</dt>
              <dd>
                {employee.offices && employee.offices.length > 1
                  ? employee.offices.map((o) => o.name).filter(Boolean).join(', ')
                  : employee.officeName || employee.location || '—'}
              </dd>
            </div>
            <div>
              <dt>{isInstitution ? 'Staff lead' : 'Manager'}</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <UserAvatar
                  src={managerDisplayAvatar && !managerDisplayAvatar.includes('dicebear') ? managerDisplayAvatar : undefined}
                  name={managerDisplayName || undefined}
                  className="h-6 w-6 text-[10px]"
                />
                <span className="truncate">{managerDisplayName || '—'}</span>
              </dd>
            </div>
          </dl>

          {canEdit && (
            <div className="employee-profile-actions">
              {!isActivated ? (
                <button
                  type="button"
                  onClick={handleActivateManually}
                  className="ep-btn ep-btn--primary w-full bg-[#17324e] text-white"
                >
                  Activate account
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingJobInfo(true);
                    setActiveTab('job');
                  }}
                  className="ep-btn ep-btn--primary w-full bg-[#17324e] text-white"
                >
                  Edit job and team
                </button>
              )}
              {!isActivated && (
                <button
                  type="button"
                  onClick={handleResendInvite}
                  className="ep-btn ep-btn--secondary w-full border border-[#c5d0d8]"
                >
                  Resend invite
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowIdCard(true)}
                className="ep-btn ep-btn--secondary w-full border border-[#c5d0d8]"
              >
                <CreditCard className="h-3.5 w-3.5 text-[#2d628e]" />
                Print ID card
              </button>
              {!isActivated && (
                <button
                  type="button"
                  onClick={handleCopyMagicLink}
                  className="ep-btn ep-btn--quiet w-full"
                >
                  Copy sign-in link
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowExitPanel(true)}
                className="ep-btn ep-btn--danger w-full text-[#8b3133]"
              >
                Deactivate record
              </button>
              {showExitPanel && (
                <ExitChecklist
                  state={state}
                  earlyExitDate={earlyExitDate}
                  setEarlyExitDate={setEarlyExitDate}
                  exitInterviewDone={exitInterviewDone}
                  setExitInterviewDone={setExitInterviewDone}
                  assetClearanceDone={assetClearanceDone}
                  setAssetClearanceDone={setAssetClearanceDone}
                  managerNocDone={managerNocDone}
                  setManagerNocDone={setManagerNocDone}
                  onCancel={() => setShowExitPanel(false)}
                  onConfirm={(payload) => {
                    onUpdateEmployee({ ...employee, ...payload });
                    setShowExitPanel(false);
                    setShowStatusDropdown(false);
                    showToast(payload.accountStatus === 'Terminated' ? 'Access ends today' : `Exit date set to ${payload.exitDate}`);
                  }}
                  showToast={showToast}
                />
              )}
              {employee.buddyName && (
                <p>Buddy: {employee.buddyName}</p>
              )}
              {employee.fnfDueDate && (
                <p>Full and final due {employee.fnfDueDate}</p>
              )}
            </div>
          )}
        </aside>

        {/* RIGHT COLUMN: Tabbed Detail Area                          */}
        {/* ========================================================= */}
        <div className="employee-profile-content min-w-0">
          {/* Top Tab Bar */}
          <div role="tablist" aria-label="Employee details" className="employee-profile-tabs">
            {(
              [
                { id: 'general' as const, label: 'General' },
                { id: 'public_profile' as const, label: 'Public Profile' },
                { id: 'job' as const, label: 'Job & Role' },
                { id: 'attendance_leave' as const, label: 'Attendance & Leaves' },
                { id: 'payroll' as const, label: 'Payroll' },
                { id: 'documents' as const, label: 'Documents' },
                { id: 'setting' as const, label: 'Settings' },
              ].filter((tab) => tab.id !== 'payroll' || canEdit)
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ===================================================== */}
          {/* TAB: PUBLIC PROFILE (coworker-visible surface)        */}
          {/* ===================================================== */}
          {activeTab === 'public_profile' && (
            <div className="space-y-4">
              <div className="public-profile-visibility"><strong>Visible to coworkers in Directory and Org Chart</strong><p>Only this public profile is shared. Personal records, payroll and documents stay private.</p></div>
              <div className="public-profile-record max-w-3xl overflow-hidden rounded-[12px] border border-[#dde4e9] bg-white shadow-[0_8px_24px_-16px_rgba(23,34,52,0.2)]">
                <EmployeePublicProfilePanel
                  employee={{ ...employee, bio: bioDraft }}
                  allEmployees={allEmployees}
                  isInstitution={isInstitution}
                  bioEditable={canEditPublicBio}
                  bioDraft={bioDraft}
                  onBioDraftChange={setBioDraft}
                  bioActions={canEditPublicBio ? (
                    <div className="public-profile-bio-actions">
                      <button
                        type="button"
                        disabled={savingBio || bioDraft === (employee.bio || '')}
                        onClick={() => setBioDraft(employee.bio || '')}
                        className={`${epSecondaryBtnClass} border border-[#c5d0d8] disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        disabled={savingBio || bioDraft === (employee.bio || '')}
                        onClick={async () => {
                          const nextBio = bioDraft.trim();
                          setSavingBio(true);
                          try {
                            await onUpdateEmployee({ ...employee, bio: nextBio || undefined });
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : 'Failed to save bio');
                          } finally {
                            setSavingBio(false);
                          }
                        }}
                        className={`${epPrimaryBtnClass} bg-[#17324e] disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {savingBio ? 'Saving…' : 'Save bio'}
                      </button>
                    </div>
                  ) : null}
                  showAvatarEdit={canEdit || state.currentPersona?.id === employee.id || state.currentPersona?.name === employee.name}
                  onAvatarFileChange={handleAvatarChange}
                  isUploadingAvatar={isUploadingAvatar}
                  variant="page"
                />

              </div>
            </div>
          )}

          {/* ===================================================== */}
          {/* TAB 1: GENERAL (Personal Info, Address, Emergency)    */}
          {/* ===================================================== */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Account Not Activated Alert Banner */}
              {!isActivated && (
                <div className="employee-profile-alert text-[13px] text-[#172234] animate-in fade-in">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-[6px] bg-[#e8eef2] border border-[#d8e8f2] flex items-center justify-center text-[#17324e] shrink-0">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-[#172234] text-[14px]">Account is not activated</h4>
                      <p className="text-[#5e6c7b] text-[13px] mt-0.5">
                        This employee has not yet logged in or activated their workspace credentials.
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyMagicLink}
                        className={`${epSecondaryBtnClass} border border-[#c5d0d8]`}
                      >
                        <Globe className="w-3.5 h-3.5 text-[#17324e]" />
                        <span>Copy link</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleActivateManually}
                        className={`${epPrimaryBtnClass} bg-[#53886b] hover:bg-[#46725a]`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Activate now</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Section 1: Personal Info Card */}
              <div className={epSectionClass}>
                <div className={epSectionHeadClass}>
                  <h3>Personal Information</h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsEditingPersonalInfo(!isEditingPersonalInfo)}
                      className={epEditBtnClass}
                      title={isEditingPersonalInfo ? 'Cancel' : 'Edit personal info'}
                    >
                      <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {isEditingPersonalInfo ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>

                {!isEditingPersonalInfo ? (
                  <div className="employee-profile-facts text-[13px]">
                    <div className="space-y-0">
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Full name</span>
                        <span className={epFactValueClass}>
                          {employee.fullName || employee.name || '—'}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Date of birth</span>
                        <span className={epFactValueClass}>
                          {employee.dateOfBirth
                            ? !isNaN(Date.parse(employee.dateOfBirth))
                              ? new Date(employee.dateOfBirth).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                              : employee.dateOfBirth
                            : '—'}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Nationality</span>
                        <span className={epFactValueClass}>
                          {employee.nationality || '—'}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Email address</span>
                        <span className={epFactValueClass}>
                          {employee.email || '—'}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Health insurance</span>
                        <span className={epFactValueClass}>
                          {employee.healthInsurance || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-0">
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Gender</span>
                        <span className={epFactValueClass}>
                          {employee.gender && employee.gender !== '—' ? employee.gender : 'None'}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Marital status</span>
                        <span className={epFactValueClass}>
                          {employee.maritalStatus || '—'}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Phone</span>
                        <span className={`${epFactValueClass} font-mono`}>
                          {employee.phone || '—'}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Personal tax ID</span>
                        <span className={`${epFactValueClass} font-mono`}>
                          {employee.personalTaxId || '—'}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Social insurance / PF</span>
                        <span className={`${epFactValueClass} font-mono`}>
                          {employee.socialInsurance || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Edit View (HR / Admin only) */
                  <form onSubmit={handleSavePersonalInfo} className="pt-2 space-y-4 text-[13px]">
                    <div>
                      <label className="block text-[#172234] font-bold mb-1">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={formFullName}
                        onChange={(e) => setFormFullName(e.target.value)}
                        className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Gender</label>
                        <select
                          value={formGender || 'None'}
                          onChange={(e) => setFormGender(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
                        >
                          <option value="None">None</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                          <option value="Non-Binary">Non-Binary</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Date of Birth</label>
                        <DateInput max={new Date().toISOString().split('T')[0]} value={formDOB} onChange={(e) => setFormDOB(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Marital Status</label>
                        <select
                          value={formMaritalStatus}
                          onChange={(e) => setFormMaritalStatus(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
                        >
                          <option value="">Select status</option>
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Divorced">Divorced</option>
                          <option value="Widowed">Widowed</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Nationality</label>
                        <select
                          value={formNationality}
                          onChange={(e) => setFormNationality(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
                        >
                          <option value="">Select Nationality</option>
                          {WORLD_NATIONALITIES.map((nat) => (
                            <option key={nat} value={nat}>{nat}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Phone Number (Max 10 Digits)</label>
                        <input
                          type="tel"
                          maxLength={10}
                          placeholder="e.g. 9845012345"
                          value={formPhone}
                          onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Email Address</label>
                        <input
                          type="email"
                          value={employee.email || ''}
                          readOnly
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-[#f6f8fa] px-3 text-[13px] font-semibold text-[#172234] outline-none"
                        />
                        {canChangeLoginEmail && (
                          <button
                            type="button"
                            onClick={() => setChangeEmailOpen(true)}
                            className="mt-2 cursor-pointer text-[12px] font-semibold text-[#2d628e] hover:text-[#17324e]"
                          >
                            Change login email
                          </button>
                        )}
                      </div>

                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Health Care Provider</label>
                        <input
                          type="text"
                          value={formHealthCare}
                          onChange={(e) => setFormHealthCare(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Personal Tax ID</label>
                        <input
                          type="text"
                          maxLength={10}
                          value={formTaxId}
                          onChange={(e) =>
                            setFormTaxId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))
                          }
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Social Insurance / PF</label>
                        <input
                          type="text"
                          maxLength={12}
                          value={formSocialInsurance}
                          onChange={(e) =>
                            setFormSocialInsurance(e.target.value.replace(/\D/g, '').slice(0, 12))
                          }
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] font-mono"
                        />
                      </div>
                    </div>

                    <div className="employee-profile-form-actions">
                      <button
                        type="button"
                        onClick={() => setIsEditingPersonalInfo(false)}
                        disabled={savingPersonalInfo}
                        className={`${epSecondaryBtnClass} border border-[#c5d0d8]`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingPersonalInfo}
                        className={`${epPrimaryBtnClass} bg-[#17324e]`}
                      >
                        {savingPersonalInfo ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Section 1b: Bank Details */}
              <div className={epSectionClass}>
                <div className={epSectionHeadClass}>
                  <h3>Bank Details</h3>
                  {canEditBank && (
                    <button
                      type="button"
                      onClick={handleStartBankEdit}
                      className={epEditBtnClass}
                      title={isEditingBankDetails ? 'Cancel' : 'Edit bank details'}
                    >
                      <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {isEditingBankDetails ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>

                {!isEditingBankDetails ? (
                  <div className="employee-profile-facts text-[13px]">
                    <div className="space-y-0">
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Account holder</span>
                        <span className={epFactValueClass}>
                          {blankBankValue(employee.bankDetails?.accountHolderName) || employee.fullName || employee.name || '—'}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Bank name</span>
                        <span className={epFactValueClass}>
                          {blankBankValue(employee.bankDetails?.bankName) || '—'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-0">
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>Account number</span>
                        <span className={`${epFactValueClass} font-mono`}>
                          {(() => {
                            const accountNumber = blankBankValue(employee.bankDetails?.accountNumber);
                            return accountNumber ? `•••• ${accountNumber.slice(-4)}` : '—';
                          })()}
                        </span>
                      </div>
                      <div className={epFactRowClass}>
                        <span className={epFactLabelClass}>IFSC / routing</span>
                        <span className={`${epFactValueClass} font-mono`}>
                          {blankBankValue(employee.bankDetails?.ifscCode) || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveBankDetails} className="space-y-3.5 text-[13px] pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[#5e6c7b] font-bold mb-1">Account holder name</label>
                        <input
                          type="text"
                          required
                          value={formAccountHolderName}
                          onChange={(e) => setFormAccountHolderName(e.target.value)}
                          className="w-full rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[#5e6c7b] font-bold mb-1">Bank name</label>
                        <select
                          required
                          value={MAJOR_BANKS.includes(formBankName) ? formBankName : formBankName ? 'Other Bank' : ''}
                          onChange={(e) => {
                            const selected = e.target.value;
                            if (selected === 'Other Bank') {
                              setFormBankName('');
                            } else {
                              setFormBankName(selected);
                              if (!formIfscCode) {
                                const prefix = suggestIfscPrefix(selected);
                                if (prefix) setFormIfscCode(prefix);
                              }
                            }
                          }}
                          className="w-full rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px] cursor-pointer"
                        >
                          <option value="">Select bank...</option>
                          {MAJOR_BANKS.map((bank) => (
                            <option key={bank} value={bank}>
                              {bank}
                            </option>
                          ))}
                        </select>
                        {(!MAJOR_BANKS.includes(formBankName) || formBankName === '') && (
                          <input
                            type="text"
                            value={formBankName}
                            onChange={(e) => setFormBankName(e.target.value)}
                            placeholder="Specify bank name..."
                            className="w-full mt-1.5 rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-[#5e6c7b] font-bold mb-1">Account number</label>
                        <input
                          type="text"
                          required
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={18}
                          value={formAccountNumber}
                          onChange={(e) => setFormAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))}
                          className="w-full rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px] font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[#5e6c7b] font-bold mb-1">IFSC / routing code</label>
                        <input
                          type="text"
                          required
                          maxLength={11}
                          value={formIfscCode}
                          onChange={(e) =>
                            setFormIfscCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))
                          }
                          className="w-full rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px] uppercase font-mono"
                        />
                      </div>
                    </div>
                    <div className="employee-profile-form-actions">
                      <button
                        type="button"
                        disabled={savingBankDetails}
                        onClick={() => setIsEditingBankDetails(false)}
                        className={`${epSecondaryBtnClass} border border-[#c5d0d8]`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingBankDetails}
                        className={`${epPrimaryBtnClass} bg-[#17324e]`}
                      >
                        {savingBankDetails ? 'Saving…' : 'Save bank details'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Section 2: Address Card */}
              <div className={epSectionClass}>
                <div className={epSectionHeadClass}>
                  <h3>Residential Address</h3>
                  {canEditAddress && (
                    <button
                      type="button"
                      onClick={() => setIsEditingAddress(!isEditingAddress)}
                      className={epEditBtnClass}
                      title={isEditingAddress ? 'Cancel' : 'Edit address'}
                    >
                      <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {isEditingAddress ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>

                {!isEditingAddress ? (
                  <div className="space-y-0 text-[13px]">
                    <div className={epFactRowClass}>
                      <span className={epFactLabelClass}>Primary address</span>
                      <span className={epFactValueClass}>
                        {employee.primaryAddress || '—'}
                      </span>
                    </div>

                    <div className={epFactRowClass}>
                      <span className={epFactLabelClass}>City & state</span>
                      <span className={epFactValueClass}>
                        {employee.city || employee.stateProvince
                          ? `${employee.city || ''}${employee.city && employee.stateProvince ? ', ' : ''}${employee.stateProvince || ''}`
                          : '—'}
                      </span>
                    </div>

                    <div className={epFactRowClass}>
                      <span className={epFactLabelClass}>Country & postal code</span>
                      <span className={epFactValueClass}>
                        {employee.country || employee.postalCode
                          ? `${employee.country || ''}${employee.country && employee.postalCode ? ' — ' : ''}${employee.postalCode || ''}`
                          : '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveAddress} className="pt-2 space-y-4 text-[13px]">
                    <div>
                      <label className="block text-[#172234] font-bold mb-1">Primary Address</label>
                      <input
                        type="text"
                        value={formPrimaryAddress}
                        onChange={(e) => setFormPrimaryAddress(e.target.value)}
                        className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">City</label>
                        <input
                          type="text"
                          value={formCity}
                          onChange={(e) => setFormCity(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                        />
                      </div>
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">State / Province</label>
                        <input
                          type="text"
                          value={formStateProvince}
                          onChange={(e) => setFormStateProvince(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                        />
                      </div>
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Country</label>
                        <select
                          value={formCountry}
                          onChange={(e) => setFormCountry(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
                        >
                          <option value="">Select Country</option>
                          {WORLD_COUNTRIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Postal Code</label>
                        <input
                          type="text"
                          maxLength={10}
                          value={formPostCode}
                          onChange={(e) =>
                            setFormPostCode(e.target.value.toUpperCase().replace(/[^A-Z0-9\s-]/g, '').slice(0, 10))
                          }
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                        />
                      </div>
                    </div>

                    <div className="employee-profile-form-actions">
                      <button
                        type="button"
                        onClick={() => setIsEditingAddress(false)}
                        className={`${epSecondaryBtnClass} border border-[#c5d0d8]`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className={`${epPrimaryBtnClass} bg-[#17324e]`}
                      >
                        Save address
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Section 3: Emergency Contact Card */}
              <div className={epSectionClass}>
                <div className={epSectionHeadClass}>
                  <h3>Emergency Contact</h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsEditingEmergency(!isEditingEmergency)}
                      className={epEditBtnClass}
                      title={isEditingEmergency ? 'Cancel' : 'Edit emergency contact'}
                    >
                      <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {isEditingEmergency ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>

                {!isEditingEmergency ? (
                  <div className="space-y-0 text-[13px]">
                    <div className={epFactRowClass}>
                      <span className={epFactLabelClass}>Contact name</span>
                      <span className={epFactValueClass}>
                        {(!isDummyEmergency && employee.emergencyContact?.name) || '—'}
                      </span>
                    </div>

                    <div className={epFactRowClass}>
                      <span className={epFactLabelClass}>Relationship</span>
                      <span className={epFactValueClass}>
                        {(!isDummyEmergency && employee.emergencyContact?.relation) || '—'}
                      </span>
                    </div>

                    <div className={epFactRowClass}>
                      <span className={epFactLabelClass}>Emergency phone</span>
                      <span className={epFactValueClass}>
                        {(!isDummyEmergency && employee.emergencyContact?.phone) || '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveEmergency} className="pt-2 space-y-4 text-[13px]">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Contact Name</label>
                        <input
                          type="text"
                          value={formEmergencyName}
                          onChange={(e) => setFormEmergencyName(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                        />
                      </div>
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Relationship</label>
                        <input
                          type="text"
                          value={formEmergencyRelation}
                          onChange={(e) => setFormEmergencyRelation(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                        />
                      </div>
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Emergency Phone (Max 10 Digits)</label>
                        <input
                          type="tel"
                          maxLength={10}
                          placeholder="e.g. 9845099887"
                          value={formEmergencyPhone}
                          onChange={(e) => setFormEmergencyPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                        />
                      </div>
                    </div>

                    <div className="employee-profile-form-actions">
                      <button
                        type="button"
                        onClick={() => setIsEditingEmergency(false)}
                        className={`${epSecondaryBtnClass} border border-[#c5d0d8]`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className={`${epPrimaryBtnClass} bg-[#17324e]`}
                      >
                        Save contact
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* ===================================================== */}
          {/* TAB 2: JOB & ROLE                                     */}
          {/* ===================================================== */}
          {activeTab === 'job' && (
            <div className="employee-detail-section employee-detail-job space-y-4">
              {/* Section 1: Employment Information */}
              <div className={epSectionClass}>
                <div className={epSectionHeadClass}>
                  <h3>Employment & Role Details</h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsEditingJobInfo(!isEditingJobInfo)}
                      className={epEditBtnClass}
                      title={isEditingJobInfo ? 'Cancel' : 'Edit job information'}
                    >
                      <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {isEditingJobInfo ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>

                {!isEditingJobInfo ? (
                  <div className="employee-profile-metric-grid text-[13px]">
                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Employee ID</span>
                      <span className="font-semibold text-[#172234] mt-1 block font-mono text-sm">
                        {employee.employeeId || '—'}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Job role</span>
                      <span className="font-semibold text-[#172234] mt-1 block truncate">
                        {employee.designation || '—'}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Department</span>
                      <span className="font-semibold text-[#17324e] mt-1 block">
                        {profileDepartment || '—'}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Team</span>
                      <span className="font-semibold text-[#172234] mt-1 block">
                        {employee.team || '—'}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Office location</span>
                      <span className="font-semibold text-[#172234] mt-1 block">
                        {employee.offices && employee.offices.length > 1
                          ? employee.offices.map((o) => o.name).filter(Boolean).join(', ')
                          : employee.officeName || employee.location || '—'}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">
                        {isInstitution ? 'Staff lead / department head' : 'Reporting manager'}
                      </span>
                      <span className="font-semibold text-[#53886b] mt-1 block truncate">
                        {managerDisplayName || '—'}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Service duration</span>
                      <span className="font-semibold text-[#172234] mt-1 block">
                        {employee.serviceYear || '—'}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Joining date</span>
                      <span className="font-semibold text-[#172234] mt-1 block">
                        {employee.joinDate || employee.joiningDate || '—'}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Employment status</span>
                      <span className="font-semibold text-[#172234] mt-1 block">
                        {employee.status || 'Active'}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Account status</span>
                      <span className={`font-semibold text-[13px] mt-1 inline-flex items-center ${
                        (employee.accountStatus === 'Active' || employee.accountStatus === 'In Probation')
                          ? 'text-[#3f6a52]'
                          : employee.accountStatus === 'On Leave'
                          ? 'text-[#17324e]'
                          : (employee.accountStatus === 'Deactivated' || employee.accountStatus === 'Suspended')
                          ? 'text-[#8b3133]'
                          : 'text-[#17324e]'
                      }`}>
                        {employee.accountStatus || (!isActivated ? 'Not Activated' : 'Active')}
                      </span>
                    </div>

                    <div className="employee-profile-metric p-3.5 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]">
                      <span className="text-[12px] text-[#687789] font-semibold block">Probation status</span>
                      <span className="font-semibold text-[#172234] mt-1 block">
                        {!effectiveQuotas.inProbation
                          ? 'Confirmed Permanent'
                          : employee.probationStatus === 'extended'
                          ? `Extended (${employee.probationEndDate || 'Active'})`
                          : `In Probation (${employee.probationEndDate ? 'Ends ' + employee.probationEndDate : (employee.probationPeriodMonths || 3) + 'm'})`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveJobInfo} className="pt-2 space-y-4 text-[13px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Employee ID</label>
                        <input
                          type="text"
                          value={formEmployeeId}
                          onChange={(e) => setFormEmployeeId(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] font-mono"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[#172234] font-bold">Job Designation</label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomDesignation(!isCustomDesignation);
                              if (!isCustomDesignation) setFormDesignation('');
                            }}
                            className="text-[12px] text-[#17324e] hover:text-[#285275] font-semibold cursor-pointer"
                          >
                            {isCustomDesignation ? 'Choose Preset' : '+ Custom'}
                          </button>
                        </div>
                        {isCustomDesignation ? (
                          <input
                            type="text"
                            value={formDesignation}
                            onChange={(e) => setFormDesignation(e.target.value)}
                            placeholder="Enter custom designation..."
                            className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                            required
                            autoFocus
                          />
                        ) : (
                          <select
                            value={formDesignation}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                setIsCustomDesignation(true);
                                setFormDesignation('');
                              } else {
                                setFormDesignation(e.target.value);
                              }
                            }}
                            className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
                            required
                          >
                            {!formDesignation && (
                              <option value="" disabled>Select Job Designation</option>
                            )}
                            {availableDesignations.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                            <option value="__custom__" className="text-[#17324e] font-semibold">
                              + Enter Custom Designation...
                            </option>
                          </select>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[#172234] font-bold">Department</label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomDepartment(!isCustomDepartment);
                              if (!isCustomDepartment) setFormDepartment('');
                            }}
                            className="text-[12px] text-[#17324e] hover:text-[#285275] font-semibold cursor-pointer"
                          >
                            {isCustomDepartment ? 'Choose Preset' : '+ Custom'}
                          </button>
                        </div>
                        {isCustomDepartment ? (
                          <input
                            type="text"
                            value={formDepartment}
                            onChange={(e) => handleDepartmentChange(e.target.value)}
                            placeholder="Enter custom department..."
                            className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                            required
                            autoFocus
                          />
                        ) : (
                          <select
                            value={formDepartment}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                setIsCustomDepartment(true);
                                handleDepartmentChange('');
                              } else {
                                handleDepartmentChange(e.target.value);
                              }
                            }}
                            className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
                            required
                          >
                            {!formDepartment && (
                              <option value="" disabled>Select Department</option>
                            )}
                            {availableDepartments.map((dept) => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                            <option value="__custom__" className="text-[#17324e] font-semibold">
                              + Enter Custom Department...
                            </option>
                          </select>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[#172234] font-bold">Team</label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomTeam(!isCustomTeam);
                              if (!isCustomTeam) setFormTeam('');
                            }}
                            className="text-[12px] text-[#17324e] hover:text-[#285275] font-semibold cursor-pointer"
                          >
                            {isCustomTeam ? 'Choose Preset' : '+ Custom'}
                          </button>
                        </div>
                        {isCustomTeam ? (
                          <input
                            type="text"
                            value={formTeam}
                            onChange={(e) => setFormTeam(e.target.value)}
                            placeholder="Enter team name..."
                            className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                            autoFocus
                          />
                        ) : (
                          <select
                            value={formTeam}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                setIsCustomTeam(true);
                                setFormTeam('');
                              } else {
                                handleTeamChange(e.target.value);
                              }
                            }}
                            className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
                          >
                            <option value="">Select team</option>
                            {(() => {
                              const options = teamsForDepartment(formDepartment);
                              if (
                                formTeam.trim() &&
                                teamBelongsToDepartment(formTeam, formDepartment) &&
                                !options.some((name) => name.toLowerCase() === formTeam.trim().toLowerCase())
                              ) {
                                options.unshift(formTeam.trim());
                              }
                              return options.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ));
                            })()}
                            <option value="__custom__" className="text-[#17324e] font-semibold">
                              + Enter Custom Team...
                            </option>
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="block text-[#172234] font-bold mb-1">
                          {isInstitution ? 'Reporting Staff Lead / HOD' : 'Reporting Line Manager'}
                        </label>
                        <select
                          value={formManagerId}
                          onChange={(e) => setFormManagerId(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2] cursor-pointer"
                        >
                          <option value="">(None - Top Level Executive)</option>
                          {allEmployees
                            .filter((emp) => emp.id !== employee.id)
                            .map((mgr) => (
                              <option key={mgr.id} value={mgr.id}>
                                {mgr.name} — {mgr.designation || 'Staff'} ({mgr.department || 'General'})
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[#172234] font-bold mb-1">
                          Office Location{availableOffices.length > 1 ? 's' : ''}
                        </label>
                        {availableOffices.length === 0 ? (
                          <p className="text-[13px] text-[#5e6c7b] py-2">(No offices configured)</p>
                        ) : (
                          <div className="rounded-[7px] border border-[#dde4e9] bg-white px-3 py-2.5 space-y-2 max-h-40 overflow-y-auto">
                            {availableOffices.map((o) => {
                              const checked = formOfficeNames.includes(o);
                              return (
                                <label
                                  key={o}
                                  className="flex items-center gap-2 text-[13px] font-semibold text-[#172234] cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setFormOfficeNames((prev) => {
                                        const next = checked
                                          ? prev.filter((n) => n !== o)
                                          : [...prev, o];
                                        if (!checked && next.length === 1) {
                                          setFormPrimaryOfficeName(o);
                                          setFormOfficeName(o);
                                        } else if (checked && formPrimaryOfficeName === o) {
                                          const fallback = next[0] || '';
                                          setFormPrimaryOfficeName(fallback);
                                          setFormOfficeName(fallback);
                                        }
                                        return next;
                                      });
                                    }}
                                    className="rounded border-slate-300 text-[#172234] focus:ring-slate-400"
                                  />
                                  <span className="flex-1">{o}</span>
                                  {checked && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setFormPrimaryOfficeName(o);
                                        setFormOfficeName(o);
                                      }}
                                      className={`text-[12px] px-1.5 py-0.5 rounded ${
                                        formPrimaryOfficeName === o
                                          ? 'bg-[#17324e] text-white'
                                          : 'bg-[#e8eef2] text-[#5e6c7b] hover:bg-[#e8eef2]'
                                      }`}
                                    >
                                      {formPrimaryOfficeName === o ? 'Primary' : 'Set primary'}
                                    </button>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {formOfficeNames.length > 0 && (
                          <p className="text-[12px] text-[#5e6c7b] mt-1.5">
                            Primary: {formPrimaryOfficeName || formOfficeNames[0]}
                            {formOfficeNames.length > 1
                              ? ` · ${formOfficeNames.length} offices assigned`
                              : ''}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[#172234] font-bold mb-1">Join Date</label>
                        <DateInput value={formJoinDate} onChange={(e) => setFormJoinDate(e.target.value)}
                          className="h-9 w-full rounded-[7px] border border-[#c5d0d8] bg-white px-3 text-[13px] font-semibold text-[#172234] outline-none focus:border-[#17324e] focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                        />
                      </div>
                    </div>

                    <div className="employee-profile-form-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingJobInfo(false);
                          setIsCustomDesignation(false);
                          setIsCustomDepartment(false);
                          setFormDesignation(employee.designation || '');
                          setFormDepartment(
                            alignedDepartment(employee.department, employee.team, departmentNames)
                          );
                          setFormTeam(employee.team || '');
                          setIsCustomTeam(false);
                        }}
                        className={`${epSecondaryBtnClass} border border-[#c5d0d8]`}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className={`${epPrimaryBtnClass} bg-[#17324e]`}
                      >
                        Save organization details
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Section 2: Job Timeline */}
              <div className={epSectionClass}>
                <div className="flex items-center justify-between pb-3 border-b border-[#dde4e9]">
                  <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">Job Progression Timeline</h3>
                  {canEdit && (
                    <button
                      onClick={() => setShowAddJobTimelineModal(true)}
                      className="px-3.5 py-1.5 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white font-bold text-[13px] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Milestone</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto pt-1">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="font-bold text-[#687789] bg-[#f8fbfe] border-b border-[#dde4e9]">
                        <th className="p-3 rounded-l-xl">Effective Date</th>
                        <th className="p-3">Job Title</th>
                        <th className="p-3">Position Type</th>
                        <th className="p-3">Employment Type</th>
                        <th className="p-3 rounded-r-xl">{isInstitution ? 'Staff Lead / HOD' : 'Line Manager'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(employee.jobTimeline && employee.jobTimeline.length > 0 ? (
                        employee.jobTimeline.map((item) => (
                          <tr key={item.id} className="hover:bg-[#f8fbfe] transition-colors">
                            <td className="p-3 font-semibold text-[#172234]">{item.effectiveDate}</td>
                            <td className="p-3 font-bold text-[#172234]">{item.jobTitle}</td>
                            <td className="p-3 text-[#5e6c7b]">{item.positionType || '-'}</td>
                            <td className="p-3 text-[#172234]">{item.employmentType}</td>
                            <td className="p-3 text-[#17324e] font-semibold">{item.lineManager}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-[#687789] font-medium">
                            No job progression milestones recorded.
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 3: Contract Timeline */}
              <div className={epSectionClass}>
                <div className="flex items-center justify-between pb-3 border-b border-[#dde4e9]">
                  <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">Contract Records</h3>
                  {canEdit && (
                    <button
                      onClick={() => setShowAddContractModal(true)}
                      className="px-3.5 py-1.5 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white font-bold text-[13px] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Contract</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto pt-1">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="font-bold text-[#687789] bg-[#f8fbfe] border-b border-[#dde4e9]">
                        <th className="p-3 rounded-l-xl">Contract #</th>
                        <th className="p-3">Contract Name</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Start Date</th>
                        <th className="p-3 rounded-r-xl">End Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(employee.contractTimeline && employee.contractTimeline.length > 0 ? (
                        employee.contractTimeline.map((item) => (
                          <tr key={item.id} className="hover:bg-[#f8fbfe] transition-colors">
                            <td className="p-3 font-mono font-bold text-[#172234]">{item.contractNumber}</td>
                            <td className="p-3 font-semibold text-[#172234]">{item.contractName}</td>
                            <td className="p-3 text-[#5e6c7b]">{item.contractType}</td>
                            <td className="p-3 text-[#172234]">{item.startDate}</td>
                            <td className="p-3 text-[#5e6c7b]">{item.endDate || 'Indefinite'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-[#687789] font-medium">
                            No contract records found.
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================== */}
          {/* TAB: ATTENDANCE & LEAVES (DEDICATED EMPLOYEE RECORD)  */}
          {/* ===================================================== */}
          {activeTab === 'attendance_leave' && (
            <div className="space-y-6 employee-attendance-tab">
              <EmployeeAttendanceCalendar logs={employeeAttendanceLogs} leaves={employeeLeaveRecords} holidays={state.customOptions?.holidays} workingDays={state.customOptions?.attendanceSettings?.workingDays} />
              <details className="employee-attendance-history"><summary>All punch records</summary><div className="space-y-5">
              {/* Header Card / Profile Identity */}
              <div className="bg-white dark:bg-[#151518] border border-[#dde4e9] dark:border-[#282830] rounded-[7px] p-5 text-[#172234] dark:text-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#dde4e9] dark:border-[#282830]">
                  <div>
                    <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234] dark:text-white">
                      {isInstitution ? 'Staff Attendance & Leave Profile' : 'Attendance & Leave Profile'}
                    </h3>
                    <p className="text-[13px] text-[#687789] mt-0.5">
                      {employee.designation || employee.name} ({employee.employeeId || 'EMP-ID'}) &bull; {profileDepartment}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(employee.officeName || employee.location) && (
                      <span className="px-2.5 py-1 rounded-[8px] text-[13px] font-semibold bg-[#e8eef2] dark:bg-[#1f1f26] text-[#5e6c7b] dark:text-slate-300">
                        {employee.officeName || employee.location}
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-1 rounded-[8px] text-[13px] font-bold ${
                        (employee.status || 'Active') === 'Active'
                          ? 'bg-[#eaf1ee] dark:bg-emerald-950/40 text-[#3f6a52] dark:text-emerald-300 border border-[#53886b]/30 dark:border-emerald-800/50'
                          : (employee.status || '').includes('Probation') || (employee.status || '') === 'Not Activated'
                          ? 'bg-[#f8fbfe] dark:bg-amber-950/40 text-[#17324e] dark:text-amber-300 border border-[#d8e8f2] dark:border-amber-800/50'
                          : (employee.status || '') === 'On Leave'
                          ? 'bg-[#f8fbfe] dark:bg-purple-950/40 text-[#17324e] dark:text-purple-300 border border-purple-200 dark:border-purple-800/50'
                          : (employee.status || '') === 'Notice Period'
                          ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50'
                          : 'bg-[#faeeee] dark:bg-rose-950/40 text-[#8b3133] dark:text-rose-300 border border-[#8b3133]/25 dark:border-rose-800/50'
                      }`}
                    >
                      {employee.status || 'Active'}
                    </span>
                  </div>
                </div>

                {/* 4 Clean Minimalist Metric Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3.5">
                  {/* Present Days */}
                  <div className="p-3.5 sm:p-4 rounded-[8px] bg-[#f8fbfe]/70 dark:bg-[#18181d] border border-[#dde4e9] dark:border-[#282830]">
                    <span className="text-[12px] font-bold text-[#687789] dark:text-[#5e6c7b] uppercase tracking-wider block">
                      Present Days
                    </span>
                    <p className="text-xl sm:text-2xl font-bold text-[#172234] dark:text-white mt-1 tabular-nums">
                      {presentDaysCount}{' '}
                      <span className="text-[13px] font-normal text-[#687789]">/ {employeeAttendanceLogs.length}</span>
                    </p>
                  </div>

                  {/* On-Time Rate */}
                  <div className="p-3.5 sm:p-4 rounded-[8px] bg-[#f8fbfe]/70 dark:bg-[#18181d] border border-[#dde4e9] dark:border-[#282830]">
                    <span className="text-[12px] font-bold text-[#687789] dark:text-[#5e6c7b] uppercase tracking-wider block">
                      On-Time Rate
                    </span>
                    <p className="text-xl sm:text-2xl font-bold text-[#172234] dark:text-white mt-1 tabular-nums">
                      {employeeAttendanceLogs.length > 0 ? `${onTimePercent}%` : '—'}
                    </p>
                  </div>

                  {/* Avg Log-In */}
                  <div className="p-3.5 sm:p-4 rounded-[8px] bg-[#f8fbfe]/70 dark:bg-[#18181d] border border-[#dde4e9] dark:border-[#282830]">
                    <span className="text-[12px] font-bold text-[#687789] dark:text-[#5e6c7b] uppercase tracking-wider block">
                      Avg Log-In
                    </span>
                    <p className="text-xl sm:text-2xl font-bold text-[#172234] dark:text-white mt-1 font-mono">
                      {avgLogInStr}
                    </p>
                  </div>

                  {/* Avg Hours */}
                  <div className="p-3.5 sm:p-4 rounded-[8px] bg-[#f8fbfe]/70 dark:bg-[#18181d] border border-[#dde4e9] dark:border-[#282830]">
                    <span className="text-[12px] font-bold text-[#687789] dark:text-[#5e6c7b] uppercase tracking-wider block">
                      Avg Hours
                    </span>
                    <p className="text-xl sm:text-2xl font-bold text-[#172234] dark:text-white mt-1 font-mono">
                      {avgHoursStr}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 1: DAILY ATTENDANCE & PUNCH-IN RECORDS */}
              <div className="bg-white dark:bg-[#151518] border border-[#dde4e9] dark:border-[#282830] rounded-[7px] p-5 sm:p-6 text-[#172234] dark:text-white space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#dde4e9] dark:border-[#282830]">
                  <h4 className="text-sm font-bold text-[#172234] dark:text-white">
                    {isInstitution ? 'Staff Attendance Logs & Daily Punch-In Record' : 'Attendance & Shift Punch Records'}
                  </h4>

                  {/* Filter Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-[#687789] font-medium">Status:</span>
                    <select
                      value={attStatusFilter}
                      onChange={(e) => setAttStatusFilter(e.target.value)}
                      className="px-2.5 py-1 text-[13px] font-semibold rounded-[8px] border border-[#dde4e9] dark:border-[#282830] bg-[#f8fbfe] dark:bg-[#18181d] text-[#172234] dark:text-slate-300 outline-none focus:border-[#17324e] cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Present">Present</option>
                      <option value="Work From Home">Work From Home</option>
                      <option value="Half Day">Half Day</option>
                      <option value="Late">Late</option>
                      <option value="Absent">Absent</option>
                    </select>
                  </div>
                </div>

                {/* Attendance Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="font-bold text-[#687789] dark:text-[#5e6c7b] bg-[#f8fbfe]/70 dark:bg-[#18181d] border-b border-[#dde4e9] dark:border-[#282830]">
                        <th className="p-3 pl-4 rounded-l-lg">Date & Day</th>
                        <th className="p-3">Punch In</th>
                        <th className="p-3">Punch Out</th>
                        <th className="p-3">Working Hours</th>
                        <th className="p-3">Break</th>
                        <th className="p-3">Location</th>
                        <th className="p-3 pr-4 rounded-r-lg text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#282830]">
                      {employeeAttendanceLogs
                        .filter((log) => attStatusFilter === 'All' || log.status === attStatusFilter)

                        .map((log, idx) => (
                          <tr key={`${log.date}-${idx}`} className="hover:bg-[#f8fbfe]/50 dark:hover:bg-[#18181d]/50 transition-colors">
                            <td className="p-3 pl-4 whitespace-nowrap">
                              <span className="font-bold text-[#172234] dark:text-white font-mono">{log.date}</span>
                              <span className="ml-2 text-[#687789] text-[12px] font-medium">{log.day}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">{log.inTime}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">{log.outTime}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold text-[#172234] dark:text-white font-mono">{log.hours}</span>
                            </td>
                            <td className="p-3 text-[#5e6c7b] font-mono">{log.breakH}</td>
                            <td className="p-3 text-[#5e6c7b] dark:text-slate-300 max-w-xs truncate">{log.loc}</td>
                            <td className="p-3 pr-4 text-right whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold ${
                                  log.status === 'Present'
                                    ? 'bg-[#eaf1ee] dark:bg-emerald-950/40 text-[#3f6a52] dark:text-emerald-300 border border-[#53886b]/30/80 dark:border-emerald-800/40'
                                    : log.status === 'Work From Home'
                                    ? 'bg-[#f8fbfe] dark:bg-blue-950/40 text-[#17324e] dark:text-blue-300 border border-[#d8e8f2]/80 dark:border-blue-800/40'
                                    : log.status === 'Late' || log.status === 'Half Day'
                                    ? 'bg-[#f8fbfe] dark:bg-amber-950/40 text-[#17324e] dark:text-amber-300 border border-[#d8e8f2]/80 dark:border-amber-800/40'
                                    : 'bg-[#faeeee] dark:bg-rose-950/40 text-[#8b3133] dark:text-rose-300 border border-[#8b3133]/25/80 dark:border-rose-800/40'
                                }`}
                              >
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {employeeAttendanceLogs.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-[#687789] font-medium text-[13px]">
                            No attendance logs recorded for this employee.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

                            </div></details>
              {/* SECTION 2: LEAVE BALANCE & ENTITLEMENTS */}
              <div className="bg-white dark:bg-[#151518] border border-[#dde4e9] dark:border-[#282830] rounded-[7px] p-5 sm:p-6 text-[#172234] dark:text-white space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#dde4e9] dark:border-[#282830]">
                  <div>
                    <h4 className="text-sm font-bold text-[#172234] dark:text-white">
                      Leave Balances & Accrual Entitlements
                    </h4>
                    <p className="text-[13px] text-[#687789] mt-0.5">
                      {effectiveQuotas.isMonthlyCycle
                        ? effectiveQuotas.enableMonthlyRollover
                          ? `Monthly grant with unused rollover (month ${effectiveQuotas.monthsElapsed} of 12 in ${new Date().getFullYear()})`
                          : `Monthly grant — unused days expire each month (month ${effectiveQuotas.monthsElapsed} of 12)`
                        : `Yearly quota (calendar year ${new Date().getFullYear()})`}
                    </p>
                  </div>

                  <span className="text-[13px] font-semibold px-2.5 py-1 rounded-[8px] bg-[#e8eef2] dark:bg-[#1f1f26] text-[#5e6c7b] dark:text-slate-300">
                    Policy: {effectiveQuotas.roleKey.toUpperCase()}
                  </span>
                </div>

                {/* Probation Warning Banner */}
                {effectiveQuotas.inProbation && (
                  <div className="flex items-start gap-2.5 rounded-[8px] border border-[#d8e8f2] bg-[#f8fbfe] p-3 text-[13px] text-[#5e6c7b] dark:border-[#282830] dark:bg-[#18181d] dark:text-slate-300">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2d628e]" />
                    <div>
                      <strong className="font-semibold text-[#172234] dark:text-slate-200">Probation Active: </strong>
                      {effectiveQuotas.probationPolicyNotice ||
                        'Paid leaves (Earned, Casual, Sick) are restricted during probation. Absences are recorded as Loss of Pay (LOP / Unpaid).'}
                    </div>
                  </div>
                )}

                {/* 4 Leave Balance Cards */}
                <div className="employee-leave-balance-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* Paid / Privilege Leave (Earned Leave) */}
                  <div className="p-4 rounded-[7px] bg-[#f8fbfe]/70 dark:bg-[#18181d] border border-[#dde4e9] dark:border-[#282830] flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[13px] font-bold text-[#172234] dark:text-slate-200">
                        Paid / Privilege Leave (PL)
                      </span>
                      <div className="mt-2.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-[#172234] dark:text-white tabular-nums font-mono">
                          {earnedLeft}
                        </span>
                        <span className="text-[13px] font-medium text-[#687789]">days available</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#dde4e9] dark:border-[#282830] text-[12px]">
                      {effectiveQuotas.isMonthlyCycle ? (
                        <>
                          <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                            <span>Accrued to Date:</span>
                            <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                              {effectiveQuotas.accruedThisCycle.earnedLeave} d ({effectiveQuotas.monthlyRates.earnedLeave} d/mo)
                            </span>
                          </div>
                          <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                            <span>Annual Total:</span>
                            <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                              {effectiveQuotas.annualQuotas.earnedLeave} d / year
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                          <span>Annual Quota:</span>
                          <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                            {effectiveQuotas.annualQuotas.earnedLeave} d / year
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                        <span>Used / Approved:</span>
                        <span className="font-semibold text-[#8b3133] dark:text-rose-400 font-mono">{earnedUsed} d</span>
                      </div>
                      {effectiveQuotas.carryOver.earnedLeave > 0 && (
                        <div className="flex justify-between text-[#53886b] dark:text-[#d7ebe0] font-medium">
                          <span>Carry-Over:</span>
                          <span className="font-mono">+{effectiveQuotas.carryOver.earnedLeave} d</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Casual Leave (CL) */}
                  <div className="p-4 rounded-[7px] bg-[#f8fbfe]/70 dark:bg-[#18181d] border border-[#dde4e9] dark:border-[#282830] flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[13px] font-bold text-[#172234] dark:text-slate-200">
                        Casual Leave (CL)
                      </span>
                      <div className="mt-2.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-[#172234] dark:text-white tabular-nums font-mono">
                          {casualLeft}
                        </span>
                        <span className="text-[13px] font-medium text-[#687789]">days available</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#dde4e9] dark:border-[#282830] text-[12px]">
                      {effectiveQuotas.isMonthlyCycle ? (
                        <>
                          <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                            <span>Accrued to Date:</span>
                            <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                              {effectiveQuotas.accruedThisCycle.casualLeave} d ({effectiveQuotas.monthlyRates.casualLeave} d/mo)
                            </span>
                          </div>
                          <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                            <span>Annual Total:</span>
                            <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                              {effectiveQuotas.annualQuotas.casualLeave} d / year
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                          <span>Annual Quota:</span>
                          <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                            {effectiveQuotas.annualQuotas.casualLeave} d / year
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                        <span>Used / Approved:</span>
                        <span className="font-semibold text-[#8b3133] dark:text-rose-400 font-mono">{casualUsed} d</span>
                      </div>
                      {effectiveQuotas.carryOver.casualLeave > 0 && (
                        <div className="flex justify-between text-[#53886b] dark:text-[#d7ebe0] font-medium">
                          <span>Carry-Over:</span>
                          <span className="font-mono">+{effectiveQuotas.carryOver.casualLeave} d</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sick Leave (SL) */}
                  <div className="p-4 rounded-[7px] bg-[#f8fbfe]/70 dark:bg-[#18181d] border border-[#dde4e9] dark:border-[#282830] flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[13px] font-bold text-[#172234] dark:text-slate-200">
                        Sick Leave (SL)
                      </span>
                      <div className="mt-2.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-[#172234] dark:text-white tabular-nums font-mono">
                          {sickLeft}
                        </span>
                        <span className="text-[13px] font-medium text-[#687789]">days available</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#dde4e9] dark:border-[#282830] text-[12px]">
                      {effectiveQuotas.isMonthlyCycle ? (
                        <>
                          <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                            <span>Accrued to Date:</span>
                            <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                              {effectiveQuotas.accruedThisCycle.sickLeave} d ({effectiveQuotas.monthlyRates.sickLeave} d/mo)
                            </span>
                          </div>
                          <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                            <span>Annual Total:</span>
                            <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                              {effectiveQuotas.annualQuotas.sickLeave} d / year
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                          <span>Annual Quota:</span>
                          <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                            {effectiveQuotas.annualQuotas.sickLeave} d / year
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                        <span>Used / Approved:</span>
                        <span className="font-semibold text-[#8b3133] dark:text-rose-400 font-mono">{sickUsed} d</span>
                      </div>
                      {effectiveQuotas.carryOver.sickLeave > 0 && (
                        <div className="flex justify-between text-[#53886b] dark:text-[#d7ebe0] font-medium">
                          <span>Carry-Over:</span>
                          <span className="font-mono">+{effectiveQuotas.carryOver.sickLeave} d</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comp-Off / Work From Home */}
                  <div className="p-4 rounded-[7px] bg-[#f8fbfe]/70 dark:bg-[#18181d] border border-[#dde4e9] dark:border-[#282830] flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[13px] font-bold text-[#172234] dark:text-slate-200">
                        Comp-Off / WFH
                      </span>
                      <div className="mt-2.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-[#172234] dark:text-white tabular-nums font-mono">
                          {wfhLeft}
                        </span>
                        <span className="text-[13px] font-medium text-[#687789]">days available</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#dde4e9] dark:border-[#282830] text-[12px]">
                      <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                        <span>Allowance Quota:</span>
                        <span className="font-semibold text-[#172234] dark:text-slate-300 font-mono">
                          {totalWfh} d / year
                        </span>
                      </div>
                      <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                        <span>Used / Taken:</span>
                        <span className="font-semibold text-[#8b3133] dark:text-rose-400 font-mono">{wfhUsed} d</span>
                      </div>
                      <div className="flex justify-between text-[#5e6c7b] dark:text-[#687789]">
                        <span>Authorization:</span>
                        <span className="font-semibold text-[#5e6c7b] dark:text-slate-300">Manager Approval</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: LEAVE APPLICATION HISTORY */}
              <div className="bg-white dark:bg-[#151518] border border-[#dde4e9] dark:border-[#282830] rounded-[7px] p-5 sm:p-6 text-[#172234] dark:text-white space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#dde4e9] dark:border-[#282830]">
                  <h4 className="text-sm font-bold text-[#172234] dark:text-white">
                    Leave Application History
                  </h4>

                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-[#687789] font-medium">Status:</span>
                    <select
                      value={leaveStatusFilter}
                      onChange={(e) => setLeaveStatusFilter(e.target.value)}
                      className="px-2.5 py-1 text-[13px] font-semibold rounded-[8px] border border-[#dde4e9] dark:border-[#282830] bg-[#f8fbfe] dark:bg-[#18181d] text-[#172234] dark:text-slate-300 outline-none focus:border-[#17324e] cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Approved">Approved</option>
                      <option value="Pending">Pending</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="font-bold text-[#687789] dark:text-[#5e6c7b] bg-[#f8fbfe]/70 dark:bg-[#18181d] border-b border-[#dde4e9] dark:border-[#282830]">
                        <th className="p-3 pl-4 rounded-l-lg">Leave Type</th>
                        <th className="p-3">Date Range & Duration</th>
                        <th className="p-3">Reason</th>
                        <th className="p-3">Applied On</th>
                        <th className="p-3">Approver</th>
                        <th className="p-3 pr-4 rounded-r-lg text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#282830]">
                      {employeeLeaveRecords
                        .filter((l) => leaveStatusFilter === 'All' || l.status === leaveStatusFilter)
                        .map((l) => (
                          <tr key={l.id} className="hover:bg-[#f8fbfe]/50 dark:hover:bg-[#18181d]/50 transition-colors">
                            <td className="p-3 pl-4 whitespace-nowrap">
                              <span className="font-bold text-[#172234] dark:text-white">{l.leaveType}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold text-[#172234] dark:text-white font-mono">
                                {l.startDate} to {l.endDate}
                              </span>
                              <span className="ml-1.5 text-[#17324e] dark:text-blue-400 font-bold text-[12px]">
                                ({l.daysCount}d)
                              </span>
                            </td>
                            <td className="p-3 text-[#5e6c7b] dark:text-slate-300 max-w-xs truncate" title={l.reason}>
                              {l.reason}
                            </td>
                            <td className="p-3 text-[#5e6c7b] dark:text-[#687789] text-[12px] whitespace-nowrap font-mono">
                              {l.appliedOn || l.startDate || new Date().toISOString().substring(0, 10)}
                            </td>
                            <td className="p-3 text-[#5e6c7b] dark:text-slate-300 text-[12px] whitespace-nowrap">
                              {l.approvedBy || (isInstitution ? 'Staff Lead / Academic Dean' : 'Line Manager')}
                            </td>
                            <td className="p-3 pr-4 text-right whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold ${
                                  l.status === 'Approved'
                                    ? 'bg-[#eaf1ee] dark:bg-emerald-950/40 text-[#3f6a52] dark:text-emerald-300 border border-[#53886b]/30/80 dark:border-emerald-800/40'
                                    : l.status === 'Pending'
                                    ? 'bg-[#f8fbfe] dark:bg-amber-950/40 text-[#17324e] dark:text-amber-300 border border-[#d8e8f2]/80 dark:border-amber-800/40'
                                    : 'bg-[#faeeee] dark:bg-rose-950/40 text-[#8b3133] dark:text-rose-300 border border-[#8b3133]/25/80 dark:border-rose-800/40'
                                }`}
                              >
                                {l.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {employeeLeaveRecords.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[#687789] font-medium text-[13px]">
                            No leave applications filed for this employee.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================== */}
          {/* TAB 3: PAYROLL & SALARY GROUP STRUCTURE               */}
          {/* ===================================================== */}
          {activeTab === 'payroll' && canEdit && (
            <div className="employee-detail-section employee-detail-payroll space-y-6">
              {/* Header with Edit Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#172234]">
                    Salary Structure & Compensation
                  </h3>
                  <p className="text-[13px] text-[#5e6c7b] mt-0.5">
                    Manage employee compensation model, allowances, statutory deductions, and tax compliance.
                  </p>
                </div>

                {canEdit && (
                  <div>
                    {isEditingPayroll ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingPayroll(false);
                            // Reset form to active employee
                            setFormPayrollGroupId(employee.payrollGroupId || '');
                            setFormSalaryType(employee.salaryType || 'monthly');
                            setFormBaseSalary(employee.salaryDetails?.basic || employee.payrollSummary?.salary || 0);
                            setFormHra(employee.salaryDetails?.hra ?? Math.round((employee.salaryDetails?.basic || 0) * 0.4));
                            setFormSpecialAllowance(employee.salaryDetails?.specialAllowance ?? 0);
                            setFormConveyanceAllowance(employee.salaryDetails?.conveyanceAllowance ?? 0);
                            setFormMedicalAllowance(employee.salaryDetails?.medicalAllowance ?? 0);
                            setFormOtherAllowances(employee.salaryDetails?.otherAllowances ?? 0);
                            setFormCustomAllowances((employee.salaryDetails?.allowanceItems || []).map((a) => ({
                              id: a.id || `alw_${Date.now()}_${Math.random()}`,
                              name: a.name,
                              amount: a.amount,
                            })));
                            setFormPfDeduction(employee.salaryDetails?.pfDeduction ?? Math.round(Math.min(employee.salaryDetails?.basic || 0, 15000) * 0.12));
                            setFormTaxDeduction(employee.salaryDetails?.taxDeduction ?? Math.round((employee.salaryDetails?.basic || 0) * 0.08));
                            setFormProfessionalTax(employee.salaryDetails?.professionalTax ?? 0);
                            setFormHourlyRate(employee.hourlyRate || 0);
                            setFormPanNumber(employee.panNumber || employee.personalTaxId || '');
                            setFormPfUan(employee.pfUanNumber || '');
                            setFormEsiNumber(employee.esiNumber || '');
                          }}
                          className="px-3.5 py-1.5 rounded-[7px] border border-[#dde4e9] text-[13px] font-semibold text-[#5e6c7b] hover:bg-[#f8fbfe] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const isHourly = formSalaryType === 'hourly';
                            const customSum = formCustomAllowances.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                            const calculatedGross = isHourly
                              ? formHourlyRate * 160
                              : Number(formBaseSalary) +
                                Number(formHra) +
                                Number(formSpecialAllowance) +
                                Number(formConveyanceAllowance) +
                                Number(formMedicalAllowance) +
                                Number(formOtherAllowances) +
                                customSum;
                            const calculatedDeductions = Number(formPfDeduction) + Number(formTaxDeduction) + Number(formProfessionalTax);
                            const netTakeHome = Math.max(0, calculatedGross - calculatedDeductions);

                            const updated: Employee = {
                              ...employee,
                              payrollGroupId: formPayrollGroupId || undefined,
                              salaryType: formSalaryType,
                              hourlyRate: isHourly ? formHourlyRate : undefined,
                              shiftTiming: isHourly
                                ? {
                                    shiftId: 'sh-hourly',
                                    shiftName: 'Hourly / Flexible Shift',
                                    startTime: 'Flexible',
                                    endTime: 'Flexible',
                                    graceMinutes: 0,
                                    isHourlyShift: true,
                                    hourlyRate: formHourlyRate,
                                  }
                                : employee.shiftTiming,
                              workSchedule: isHourly
                                ? {
                                    name: 'Hourly / Flexible Shift',
                                    workingDays: 'Monday - Friday (Flexible)',
                                    workingHours: 'Logged Hours',
                                    hoursPerWeek: 40,
                                  }
                                : employee.workSchedule,
                              panNumber: formPanNumber,
                              personalTaxId: formPanNumber,
                              pfUanNumber: formPfUan,
                              esiNumber: formEsiNumber,
                              customFieldValues: formCustomFieldValues,
                              payrollSummary: {
                                ...(employee.payrollSummary || {
                                  status: 'Active',
                                  jobTitle: employee.designation || 'Staff',
                                  employmentType: employee.employmentType || 'Full-time',
                                  jobDate: employee.joinDate || employee.joiningDate || new Date().toISOString().substring(0, 10),
                                  geofencing: 'Enabled',
                                  lastWorkingDate: '-',
                                  oneOff: 0,
                                  offset1: 0,
                                  offset2: 0,
                                }),
                                salary: formBaseSalary,
                                totalCompensation: isHourly ? formHourlyRate * 160 * 12 : calculatedGross * 12,
                                recurring: formHra + formSpecialAllowance + formConveyanceAllowance + formMedicalAllowance + formOtherAllowances + customSum,
                              },
                              salaryDetails: {
                                basic: Number(formBaseSalary),
                                hra: Number(formHra),
                                specialAllowance: Number(formSpecialAllowance),
                                conveyanceAllowance: Number(formConveyanceAllowance),
                                medicalAllowance: Number(formMedicalAllowance),
                                otherAllowances: Number(formOtherAllowances),
                                allowanceItems: formCustomAllowances.map((a) => ({
                                  id: a.id,
                                  name: a.name,
                                  amount: Number(a.amount) || 0,
                                  taxable: true,
                                })),
                                pfDeduction: Number(formPfDeduction),
                                taxDeduction: Number(formTaxDeduction),
                                netPayable: netTakeHome,
                              },
                            };

                            // Direct backend API synchronization
                            api.identity.updateEmployee(employee.id, {
                              salaryDetails: updated.salaryDetails,
                              payrollSummary: updated.payrollSummary,
                            } as any).catch((err) => console.warn('[Backend Sync] Employee payroll update failed:', err));

                              api.payroll.setSalaryStructure({
                                employeeId: employee.id,
                                baseSalary: Number(formBaseSalary),
                                hra: Number(formHra),
                                specialAllowance: Number(formSpecialAllowance),
                                conveyanceAllowance: Number(formConveyanceAllowance),
                                medicalAllowance: Number(formMedicalAllowance),
                                otherAllowances: Number(formOtherAllowances),
                                allowances: formCustomAllowances,
                                providentFundDeduction: Number(formPfDeduction),
                                taxDeduction: Number(formTaxDeduction),
                              }).catch((err) => console.warn('[Backend Sync] Salary structure update failed:', err));

                              onUpdateEmployee(updated);
                              setIsEditingPayroll(false);
                          }}
                          className="px-4 py-1.5 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-[13px] font-semibold text-white cursor-pointer"
                        >
                          Save Changes
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setFormPayrollGroupId(employee.payrollGroupId || '');
                          setFormSalaryType(employee.salaryType || 'monthly');
                          setFormBaseSalary(employee.salaryDetails?.basic || employee.payrollSummary?.salary || 0);
                          setFormHra(employee.salaryDetails?.hra ?? 0);
                          setFormSpecialAllowance(employee.salaryDetails?.specialAllowance ?? 0);
                          setFormConveyanceAllowance(employee.salaryDetails?.conveyanceAllowance ?? 0);
                          setFormMedicalAllowance(employee.salaryDetails?.medicalAllowance ?? 0);
                          setFormOtherAllowances(employee.salaryDetails?.otherAllowances ?? 0);
                          setFormCustomAllowances((employee.salaryDetails?.allowanceItems || []).map((a) => ({
                            id: a.id || `alw_${Date.now()}_${Math.random()}`,
                            name: a.name,
                            amount: a.amount,
                          })));
                          setFormPfDeduction(employee.salaryDetails?.pfDeduction ?? 0);
                          setFormTaxDeduction(employee.salaryDetails?.taxDeduction ?? 0);
                          setFormProfessionalTax(employee.salaryDetails?.professionalTax ?? 0);
                          setFormHourlyRate(employee.hourlyRate || 0);
                          setFormPanNumber(employee.panNumber || employee.personalTaxId || '');
                          setFormPfUan(employee.pfUanNumber || '');
                          setFormEsiNumber(employee.esiNumber || '');
                          setIsEditingPayroll(true);
                        }}
                        className="px-3.5 py-1.5 rounded-[7px] border border-[#dde4e9] bg-white text-[13px] font-semibold text-[#172234] hover:text-[#285275] hover:border-blue-300 hover:bg-[#f8fbfe] transition-colors cursor-pointer"
                      >
                        Edit Payroll Structure
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Edit Mode Panel: Interactive Salary & Allowance Builder */}
              {isEditingPayroll ? (
                <div className="bg-white border border-[#dde4e9] rounded-[7px] p-6 space-y-6">
                  {/* Group & Classification */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-[#dde4e9]">
                    <div>
                      <label className="block text-[13px] font-bold text-[#172234] mb-1">
                        Assigned Payroll Group
                      </label>
                      <select
                        value={formPayrollGroupId}
                        onChange={(e) => {
                          const gid = e.target.value;
                          setFormPayrollGroupId(gid);
                          const grp = (state.customOptions?.payrollGroups || []).find((g) => g.id === gid);
                          if (grp) {
                            setFormSalaryType(grp.salaryType);
                          }
                        }}
                        className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-semibold"
                      >
                        <option value="">-- Direct Individual Structure (No Group) --</option>
                        {(state.customOptions?.payrollGroups || []).map((grp) => (
                          <option key={grp.id} value={grp.id}>
                            {grp.name} ({grp.salaryType.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[13px] font-bold text-[#172234] mb-1">
                        Salary Type *
                      </label>
                      <select
                        value={formSalaryType}
                        onChange={(e) => setFormSalaryType(e.target.value as SalaryType)}
                        className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-bold"
                      >
                        <option value="monthly">Monthly Fixed CTC</option>
                        <option value="hourly">Hourly Timesheet Wage</option>
                        <option value="compliance">Statutory Compliance (EPF + ESIC + PT)</option>
                      </select>
                    </div>
                  </div>

                  {/* Group Inherit Banner & Custom Fields */}
                  {(() => {
                    const matchedGroup = (state.customOptions?.payrollGroups || []).find((g) => g.id === formPayrollGroupId);
                    if (!matchedGroup) return null;

                    const groupAllowancesCount = matchedGroup.defaultAllowances?.length || 0;
                    const groupCustomFields = matchedGroup.customFields || [];

                    return (
                      <div className="p-4 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9] space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-[#172234] text-[13px] block">
                              Group Defaults Available: {matchedGroup.name}
                            </span>
                            <p className="text-[12px] text-[#5e6c7b] mt-0.5">
                              {matchedGroup.baseSalaryDefault ? `Default Base ₹${matchedGroup.baseSalaryDefault.toLocaleString('en-IN')}` : ''}
                              {matchedGroup.hraDefault ? ` • HRA ₹${matchedGroup.hraDefault.toLocaleString('en-IN')}` : ''}
                              {groupAllowancesCount > 0 ? ` • ${groupAllowancesCount} Custom Allowances` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (matchedGroup.baseSalaryDefault) setFormBaseSalary(matchedGroup.baseSalaryDefault);
                              if (matchedGroup.hraDefault) setFormHra(matchedGroup.hraDefault);
                              if (matchedGroup.specialAllowanceDefault !== undefined) setFormSpecialAllowance(matchedGroup.specialAllowanceDefault);
                              if (matchedGroup.conveyanceAllowanceDefault !== undefined) setFormConveyanceAllowance(matchedGroup.conveyanceAllowanceDefault);
                              if (matchedGroup.medicalAllowanceDefault !== undefined) setFormMedicalAllowance(matchedGroup.medicalAllowanceDefault);
                              if (matchedGroup.defaultAllowances && matchedGroup.defaultAllowances.length > 0) {
                                setFormCustomAllowances(
                                  matchedGroup.defaultAllowances.map((a) => ({
                                    id: a.id || `alw_${Date.now()}_${Math.random()}`,
                                    name: a.name,
                                    amount: a.amount,
                                  }))
                                );
                              }
                              showToast(`Applied default allowances & structure from "${matchedGroup.name}"`);
                            }}
                            className="px-3 py-1.5 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white font-semibold text-[13px] cursor-pointer whitespace-nowrap self-start sm:self-auto"
                          >
                            Apply Group Defaults
                          </button>
                        </div>

                        {/* Group Custom Fields */}
                        {groupCustomFields.length > 0 && (
                          <div className="pt-3 border-t border-[#dde4e9]">
                            <span className="text-[12px] font-bold text-[#172234] uppercase tracking-wide block mb-2">
                              Group Custom Fields & Metadata
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {groupCustomFields.map((field) => (
                                <div key={field.id} className="space-y-1">
                                  <label className="text-[12px] font-semibold text-[#172234] flex items-center gap-1">
                                    <span>{field.label}</span>
                                    {field.required && <span className="text-rose-500">*</span>}
                                  </label>
                                  {field.fieldType === 'select' ? (
                                    <select
                                      value={formCustomFieldValues[field.id] ?? field.defaultValue ?? ''}
                                      onChange={(e) =>
                                        setFormCustomFieldValues({
                                          ...formCustomFieldValues,
                                          [field.id]: e.target.value,
                                        })
                                      }
                                      className="w-full px-3 py-1.5 text-[13px] bg-white border border-[#dde4e9] rounded-[7px] outline-none"
                                    >
                                      <option value="">-- Select {field.label} --</option>
                                      {(field.options || []).map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={field.fieldType === 'number' ? 'number' : 'text'}
                                      placeholder={field.defaultValue || `Enter ${field.label}`}
                                      value={formCustomFieldValues[field.id] ?? field.defaultValue ?? ''}
                                      onChange={(e) =>
                                        setFormCustomFieldValues({
                                          ...formCustomFieldValues,
                                          [field.id]: e.target.value,
                                        })
                                      }
                                      className="w-full px-3 py-1.5 text-[13px] bg-white border border-[#dde4e9] rounded-[7px] outline-none"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {formSalaryType === 'hourly' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[13px] font-bold text-[#172234] mb-1">
                          Hourly Wage Rate (₹ / hr) *
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={moneyInputValue(formHourlyRate)}
                          onChange={(e) => setFormHourlyRate(parseMoneyInput(e.target.value))}
                          placeholder="0"
                          className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-bold"
                        />
                      </div>
                      <div className="p-3 bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] flex items-start gap-2.5 text-[13px] text-[#172234]">
                        <div>
                          <span className="font-bold">Hourly Tracking Active:</span>
                          <p className="text-[12px] text-[#5e6c7b] mt-0.5">
                            Standard monthly computation assumes 160 hrs @ ₹{formHourlyRate}/hr = ₹{(formHourlyRate * 160).toLocaleString('en-IN')}/mo with timesheet overtime calculation.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* 1. EARNINGS & ALLOWANCES BUILDER */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[13px] font-bold text-[#172234]">
                            1. Base Pay & Allowances (Earnings)
                          </h4>
                          <span className="text-[12px] text-[#687789]">
                            Customizable allowances per company policy
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          {/* Basic Salary */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[13px] font-semibold text-[#172234]">
                                Basic Salary (₹) *
                              </label>
                              <span className="text-[12px] text-[#687789]">Core Pay</span>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formBaseSalary)}
                              onChange={(e) => setFormBaseSalary(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-bold"
                            />
                          </div>

                          {/* House Rent Allowance (HRA) */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[13px] font-semibold text-[#172234]">
                                House Rent Allowance (HRA ₹)
                              </label>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => setFormHra(Math.round(formBaseSalary * 0.4))}
                                  className="text-[12px] px-1.5 py-0.5 rounded bg-[#e8eef2] text-[#172234] font-bold hover:bg-[#e8eef2] cursor-pointer"
                                  title="Set to 40% of Basic (Non-Metro)"
                                >
                                  40%
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormHra(Math.round(formBaseSalary * 0.5))}
                                  className="text-[12px] px-1.5 py-0.5 rounded bg-[#e8eef2] text-[#172234] font-bold hover:bg-[#e8eef2] cursor-pointer"
                                  title="Set to 50% of Basic (Metro)"
                                >
                                  50%
                                </button>
                              </div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formHra)}
                              onChange={(e) => setFormHra(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-semibold"
                            />
                          </div>

                          {/* Special Allowance */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[13px] font-semibold text-[#172234]">
                                Special Allowance (₹)
                              </label>
                              <span className="text-[12px] text-[#687789]">Balancing Pay</span>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formSpecialAllowance)}
                              onChange={(e) => setFormSpecialAllowance(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-semibold"
                            />
                          </div>

                          {/* Conveyance Allowance */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[13px] font-semibold text-[#172234]">
                                Conveyance Allowance (₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormConveyanceAllowance(1600)}
                                className="text-[12px] px-1.5 py-0.5 rounded bg-[#e8eef2] text-[#172234] font-bold hover:bg-[#e8eef2] cursor-pointer"
                              >
                                ₹1.6k Std
                              </button>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formConveyanceAllowance)}
                              onChange={(e) => setFormConveyanceAllowance(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-semibold"
                            />
                          </div>

                          {/* Medical Allowance */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[13px] font-semibold text-[#172234]">
                                Medical Reimbursement (₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormMedicalAllowance(1250)}
                                className="text-[12px] px-1.5 py-0.5 rounded bg-[#e8eef2] text-[#172234] font-bold hover:bg-[#e8eef2] cursor-pointer"
                              >
                                ₹1.25k Std
                              </button>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formMedicalAllowance)}
                              onChange={(e) => setFormMedicalAllowance(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-semibold"
                            />
                          </div>

                          {/* Other Allowances */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[13px] font-semibold text-[#172234]">
                                Other Fixed Allowance (₹)
                              </label>
                              <span className="text-[12px] text-[#687789]">General</span>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formOtherAllowances)}
                              onChange={(e) => setFormOtherAllowances(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-semibold"
                            />
                          </div>
                        </div>

                        {/* Dynamic Custom Allowances */}
                        <div className="pt-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[12px] font-bold text-[#172234]">
                              Custom & Flexible Allowances
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setFormCustomAllowances([
                                  ...formCustomAllowances,
                                  { id: `alw_${Date.now()}`, name: 'Remote Work Allowance', amount: 3000 },
                                ]);
                              }}
                              className="text-[12px] font-semibold text-[#17324e] hover:text-[#285275] cursor-pointer"
                            >
                              + Add Custom Allowance
                            </button>
                          </div>

                          {formCustomAllowances.length === 0 ? (
                            <div className="p-3 border border-dashed border-[#dde4e9] rounded-[7px] text-center text-[13px] text-[#687789]">
                              No custom allowances added. Click "+ Add Custom Allowance" to add allowances like Remote Work, Food, Shift, or Travel.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {formCustomAllowances.map((alw, index) => (
                                <div
                                  key={alw.id || `form_alw_${index}`}
                                  className="flex items-center gap-2 p-2.5 bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px]"
                                >
                                  <input
                                    type="text"
                                    placeholder="Allowance Name (e.g. Remote Work, Travel, Food)"
                                    value={alw.name}
                                    onChange={(e) => {
                                      const updated = [...formCustomAllowances];
                                      updated[index].name = e.target.value;
                                      setFormCustomAllowances(updated);
                                    }}
                                    className="flex-1 px-3 py-1.5 text-[13px] bg-white border border-[#dde4e9] rounded-[8px] outline-none font-semibold text-[#172234]"
                                  />
                                  <div className="relative w-36">
                                    <span className="absolute left-2.5 top-1.5 text-[#687789] text-[13px]">₹</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={moneyInputValue(alw.amount)}
                                      onChange={(e) => {
                                        const updated = [...formCustomAllowances];
                                        updated[index].amount = parseMoneyInput(e.target.value);
                                        setFormCustomAllowances(updated);
                                      }}
                                      placeholder="0"
                                      className="w-full pl-6 pr-3 py-1.5 text-[13px] bg-white border border-[#dde4e9] rounded-[8px] outline-none font-bold text-[#172234]"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormCustomAllowances(formCustomAllowances.filter((_, i) => i !== index));
                                    }}
                                    className="px-2 py-1 text-[13px] text-[#687789] hover:text-[#8b3133] rounded-[8px] transition-colors cursor-pointer"
                                    title="Remove Allowance"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. DEDUCTIONS BUILDER */}
                      <div className="space-y-3 pt-4 border-t border-[#dde4e9]">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[13px] font-bold text-[#172234]">
                            2. Statutory & Tax Deductions
                          </h4>
                          <span className="text-[12px] text-[#687789]">
                            Automatic formulas and statutory ceilings
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          {/* PF Deduction */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[13px] font-semibold text-[#172234]">
                                Employee PF / EPF (₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormPfDeduction(Math.round(Math.min(formBaseSalary, 15000) * 0.12))}
                                className="text-[12px] px-1.5 py-0.5 rounded bg-[#e8eef2] text-[#172234] font-bold hover:bg-[#e8eef2] cursor-pointer"
                              >
                                Auto 12%
                              </button>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formPfDeduction)}
                              onChange={(e) => setFormPfDeduction(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-semibold"
                            />
                          </div>

                          {/* Professional Tax */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[13px] font-semibold text-[#172234]">
                                Professional Tax (PT ₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormProfessionalTax(200)}
                                className="text-[12px] px-1.5 py-0.5 rounded bg-[#e8eef2] text-[#172234] font-bold hover:bg-[#e8eef2] cursor-pointer"
                              >
                                ₹200 Std
                              </button>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formProfessionalTax)}
                              onChange={(e) => setFormProfessionalTax(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-semibold"
                            />
                          </div>

                          {/* Income Tax / TDS */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[13px] font-semibold text-[#172234]">
                                Tax Withholding (TDS ₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormTaxDeduction(Math.round(formBaseSalary * 0.08))}
                                className="text-[12px] px-1.5 py-0.5 rounded bg-[#e8eef2] text-[#172234] font-bold hover:bg-[#e8eef2] cursor-pointer"
                              >
                                Auto 8%
                              </button>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formTaxDeduction)}
                              onChange={(e) => setFormTaxDeduction(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e] font-semibold"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. STATUTORY IDENTIFIERS */}
                  <div className="pt-4 border-t border-[#dde4e9]">
                    <h4 className="text-[13px] font-bold text-[#172234] mb-3">
                      3. Statutory Identifiers & Tax Codes
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block text-[13px] font-semibold text-[#172234] mb-1">
                          PAN / Tax ID
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. ABCDE1234F"
                          maxLength={10}
                          value={formPanNumber}
                          onChange={(e) =>
                            setFormPanNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))
                          }
                          className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e]"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-semibold text-[#172234] mb-1">
                          PF Universal Account (UAN)
                        </label>
                        <input
                          type="text"
                          maxLength={12}
                          placeholder="e.g. 100918273645"
                          value={formPfUan}
                          onChange={(e) => setFormPfUan(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e]"
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-semibold text-[#172234] mb-1">
                          ESIC Insurance Number
                        </label>
                        <input
                          type="text"
                          maxLength={17}
                          placeholder="e.g. 31000889210001"
                          value={formEsiNumber}
                          onChange={(e) => setFormEsiNumber(e.target.value.replace(/\D/g, '').slice(0, 17))}
                          className="w-full px-3.5 py-2 text-[13px] bg-[#f8fbfe] border border-[#dde4e9] rounded-[7px] outline-none focus:border-[#17324e]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. LIVE REAL-TIME CALCULATION PREVIEW */}
                  {(() => {
                    const customSum = formCustomAllowances.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
                    const gross =
                      formSalaryType === 'hourly'
                        ? formHourlyRate * 160
                        : Number(formBaseSalary) +
                          Number(formHra) +
                          Number(formSpecialAllowance) +
                          Number(formConveyanceAllowance) +
                          Number(formMedicalAllowance) +
                          Number(formOtherAllowances) +
                          customSum;
                    const deductions = Number(formPfDeduction) + Number(formTaxDeduction) + Number(formProfessionalTax);
                    const net = Math.max(0, gross - deductions);

                    return (
                      <div className="p-4 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9] grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
                        <div>
                          <span className="text-[#687789] block text-[12px]">Monthly Gross</span>
                          <span className="text-base font-bold text-[#172234]">
                            ₹{gross.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#687789] block text-[12px]">Monthly Deductions</span>
                          <span className="text-base font-bold text-[#172234]">
                            -₹{deductions.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#687789] block text-[12px]">Net Take-Home</span>
                          <span className="text-base font-bold text-[#17324e]">
                            ₹{net.toLocaleString('en-IN')} / mo
                          </span>
                        </div>
                        <div>
                          <span className="text-[#687789] block text-[12px]">Annualized CTC</span>
                          <span className="text-base font-bold text-[#172234]">
                            ₹{(gross * 12).toLocaleString('en-IN')} / yr
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* Display Mode: Enterprise Remuneration Breakdown & Allowances Table */
                <>
                  {(() => {
                    const hasSalaryConfig = Boolean(employee.salaryDetails?.basic || employee.payrollSummary?.salary || employee.hourlyRate);

                    if (!hasSalaryConfig) {
                      return (
                        <div className="bg-white border border-[#dde4e9] rounded-[7px] p-8 text-center space-y-3">
                          <div className="w-12 h-12 rounded-full bg-[#e8eef2] flex items-center justify-center mx-auto text-[#687789]">
                            <CreditCard className="w-6 h-6" />
                          </div>
                          <h4 className="text-sm font-bold text-[#172234]">Salary Structure Not Configured</h4>
                          <p className="text-[13px] text-[#5e6c7b] max-w-md mx-auto">
                            No salary structure, fixed CTC, or hourly wage has been configured for this employee yet. Click "Edit Payroll Structure" above to define their compensation package.
                          </p>
                        </div>
                      );
                    }

                    const basic = employee.salaryDetails?.basic || employee.payrollSummary?.salary || 0;
                    const hra = employee.salaryDetails?.hra ?? 0;
                    const special = employee.salaryDetails?.specialAllowance ?? 0;
                    const conv = employee.salaryDetails?.conveyanceAllowance ?? 0;
                    const med = employee.salaryDetails?.medicalAllowance ?? 0;
                    const other = employee.salaryDetails?.otherAllowances ?? 0;
                    const customItems = employee.salaryDetails?.allowanceItems || [];
                    const customSum = customItems.reduce((acc, a) => acc + (Number(a.amount) || 0), 0);

                    const gross =
                      employee.salaryType === 'hourly'
                        ? (employee.hourlyRate || 0) * 160
                        : basic + hra + special + conv + med + other + customSum;

                    const pf = employee.salaryDetails?.pfDeduction ?? 0;
                    const tax = employee.salaryDetails?.taxDeduction ?? 0;
                    const pt = employee.salaryDetails?.professionalTax ?? 0;
                    const deductions = pf + tax + pt;
                    const net = Math.max(0, gross - deductions);

                    return (
                      <div className="space-y-6">
                        {/* Top Compensation Metrics Card */}
                        <div className="bg-white border border-[#dde4e9] rounded-[7px] p-5">
                          <div className="flex items-center justify-between pb-3 border-b border-[#dde4e9]">
                            <h4 className="text-[13px] font-bold text-[#172234]">
                              Compensation Overview
                            </h4>
                            <span className="text-[13px] text-[#687789] font-normal">
                              {employee.salaryType === 'hourly'
                                ? 'Hourly Timesheet • Bi-weekly cycle'
                                : employee.salaryType === 'compliance'
                                ? 'Statutory Compliance • Monthly cycle'
                                : 'Monthly Fixed CTC • Monthly cycle'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
                            <div>
                              <span className="text-[13px] font-medium text-[#5e6c7b] block">Net Take-Home Pay</span>
                              <div className="text-2xl font-bold text-[#17324e] tracking-tight mt-1 flex items-baseline">
                                <span>
                                  {employee.salaryType === 'hourly'
                                    ? `₹${(employee.hourlyRate || 650).toLocaleString('en-IN')}`
                                    : `₹${net.toLocaleString('en-IN')}`}
                                </span>
                                <span className="text-[13px] font-normal text-[#687789] ml-1">
                                  {employee.salaryType === 'hourly' ? '/ hr' : '/ mo'}
                                </span>
                              </div>
                            </div>

                            <div>
                              <span className="text-[13px] font-medium text-[#5e6c7b] block">Gross Remuneration</span>
                              <div className="text-2xl font-bold text-[#172234] tracking-tight mt-1 flex items-baseline">
                                <span>₹{gross.toLocaleString('en-IN')}</span>
                                <span className="text-[13px] font-normal text-[#687789] ml-1">/ mo</span>
                              </div>
                            </div>

                            <div>
                              <span className="text-[13px] font-medium text-[#5e6c7b] block">Monthly Deductions</span>
                              <div className="text-2xl font-bold text-[#172234] tracking-tight mt-1 flex items-baseline">
                                <span>-₹{deductions.toLocaleString('en-IN')}</span>
                                <span className="text-[13px] font-normal text-[#687789] ml-1">/ mo</span>
                              </div>
                            </div>

                            <div>
                              <span className="text-[13px] font-medium text-[#5e6c7b] block">Annualized Gross CTC</span>
                              <div className="text-2xl font-bold text-[#172234] tracking-tight mt-1 flex items-baseline">
                                <span>₹{(gross * 12).toLocaleString('en-IN')}</span>
                                <span className="text-[13px] font-normal text-[#687789] ml-1">/ yr</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Detailed Remuneration Breakdown: Earnings vs Deductions */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                          {/* 1. Earnings & Allowances Card */}
                          <div className="bg-white border border-[#dde4e9] rounded-[7px] overflow-hidden flex flex-col justify-between">
                            <div>
                              <div className="px-5 py-3.5 border-b border-[#dde4e9] flex items-center justify-between">
                                <h4 className="font-bold text-[13px] text-[#172234]">
                                  Earnings & Allowances
                                </h4>
                                <span className="text-[12px] font-medium text-[#687789]">Monthly (₹)</span>
                              </div>
                              <div className="divide-y divide-slate-100 text-[13px]">
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                  <span className="text-[#5e6c7b] font-medium">Basic Salary</span>
                                  <span className="font-semibold text-[#172234]">
                                    ₹{basic.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                  <span className="text-[#5e6c7b] font-medium">House Rent Allowance (HRA)</span>
                                  <span className="font-medium text-[#172234]">
                                    ₹{hra.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                  <span className="text-[#5e6c7b] font-medium">Special Allowance</span>
                                  <span className="font-medium text-[#172234]">
                                    ₹{special.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                {conv > 0 && (
                                  <div className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                    <span className="text-[#5e6c7b] font-medium">Conveyance Allowance</span>
                                    <span className="font-medium text-[#172234]">
                                      ₹{conv.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                )}
                                {med > 0 && (
                                  <div className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                    <span className="text-[#5e6c7b] font-medium">Medical Reimbursement</span>
                                    <span className="font-medium text-[#172234]">
                                      ₹{med.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                )}
                                {other > 0 && (
                                  <div className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                    <span className="text-[#5e6c7b] font-medium">Other Allowances</span>
                                    <span className="font-medium text-[#172234]">
                                      ₹{other.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                )}
                                {customItems.map((alw, idx) => (
                                  <div key={alw.id || `alw_${idx}_${alw.name}`} className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                    <span className="text-[#5e6c7b] font-medium">
                                      {alw.name}
                                    </span>
                                    <span className="font-medium text-[#172234]">
                                      ₹{Number(alw.amount).toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="px-5 py-3 border-t border-[#dde4e9] bg-[#f8fbfe]/60 flex items-center justify-between font-bold text-[13px]">
                              <span className="text-[#172234]">Gross Remuneration (A)</span>
                              <span className="text-[#172234] text-sm font-bold">
                                ₹{gross.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>

                          {/* 2. Deductions Card */}
                          <div className="bg-white border border-[#dde4e9] rounded-[7px] overflow-hidden flex flex-col justify-between">
                            <div>
                              <div className="px-5 py-3.5 border-b border-[#dde4e9] flex items-center justify-between">
                                <h4 className="font-bold text-[13px] text-[#172234]">
                                  Statutory & Tax Deductions
                                </h4>
                                <span className="text-[12px] font-medium text-[#687789]">Monthly (₹)</span>
                              </div>
                              <div className="divide-y divide-slate-100 text-[13px]">
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                  <div>
                                    <span className="text-[#5e6c7b] font-medium block">
                                      Employees' Provident Fund (EPF)
                                    </span>
                                    <span className="text-[12px] text-[#687789]">12% on statutory basic</span>
                                  </div>
                                  <span className="font-semibold text-[#172234]">
                                    ₹{pf.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                  <div>
                                    <span className="text-[#5e6c7b] font-medium block">
                                      Professional Tax (PT)
                                    </span>
                                    <span className="text-[12px] text-[#687789]">State employment tax</span>
                                  </div>
                                  <span className="font-medium text-[#172234]">
                                    ₹{pt.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-[#f8fbfe]/50 transition-colors">
                                  <div>
                                    <span className="text-[#5e6c7b] font-medium block">
                                      Tax Deducted at Source (TDS)
                                    </span>
                                    <span className="text-[12px] text-[#687789]">Income tax withholding</span>
                                  </div>
                                  <span className="font-medium text-[#172234]">
                                    ₹{tax.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="px-5 py-3 border-t border-[#dde4e9] bg-[#f8fbfe]/60 flex items-center justify-between font-bold text-[13px]">
                              <span className="text-[#172234]">Total Deductions (B)</span>
                              <span className="text-[#172234] text-sm font-bold">
                                -₹{deductions.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Statutory Identifiers Card */}
                        <div className="bg-white border border-[#dde4e9] rounded-[7px] p-5">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-[13px] font-bold text-[#172234]">
                              Statutory & Account Identifiers
                            </h4>
                            {canEditBank && (
                              <button
                                type="button"
                                onClick={handleOpenBankDetailsModal}
                                className="p-1.5 rounded-[8px] text-[#687789] hover:text-[#172234] hover:bg-[#f8fbfe] transition-colors cursor-pointer"
                                title="Edit bank details"
                              >
                                <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
                            <div>
                              <span className="text-[#687789] block text-[12px]">PAN / Tax ID</span>
                              <span className="font-medium text-[#172234]">
                                {employee.panNumber || employee.personalTaxId || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#687789] block text-[12px]">PF UAN Number</span>
                              <span className="font-medium text-[#172234]">
                                {employee.pfUanNumber || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#687789] block text-[12px]">ESIC Insurance No</span>
                              <span className="font-medium text-[#172234]">
                                {employee.esiNumber || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[#687789] block text-[12px]">Salary Bank Account</span>
                              {(() => {
                                const accountNumber = blankBankValue(employee.bankDetails?.accountNumber);
                                const bankName = blankBankValue(employee.bankDetails?.bankName) || 'Bank';
                                const masked = accountNumber
                                  ? `${bankName} (•••• ${accountNumber.slice(-4)})`
                                  : 'Not on file';
                                return canEdit ? (
                                  <button
                                    type="button"
                                    onClick={handleOpenBankDetailsModal}
                                    className="font-medium text-[#172234] hover:text-[#285275] text-left cursor-pointer underline-offset-2 hover:underline"
                                  >
                                    {masked}
                                  </button>
                                ) : (
                                  <span className="font-medium text-[#172234]">{masked}</span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Pay Group & Custom Fields Metadata Card */}
                        {(() => {
                          const assignedPg = (state.customOptions?.payrollGroups || []).find(
                            (g) => g.id === employee.payrollGroupId || (g.assignedEmployeeIds || []).includes(employee.id)
                          );
                          const customFields = assignedPg?.customFields || [];
                          const customFieldVals = employee.customFieldValues || {};

                          return (
                            <div className="bg-white border border-[#dde4e9] rounded-[7px] p-5 space-y-3">
                              <div className="flex items-center justify-between border-b border-[#dde4e9] pb-2.5">
                                <h4 className="text-[13px] font-bold text-[#172234]">
                                  Assigned Pay Group
                                </h4>
                                <span className="text-[13px] font-semibold text-[#172234]">
                                  {assignedPg?.name || 'Direct Individual Structure'}
                                </span>
                              </div>

                              {customFields.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                                  {customFields.map((f, fIdx) => (
                                    <div key={f.id || `cf_${fIdx}`} className="p-3 rounded-[7px] bg-[#f8fbfe] border border-[#dde4e9]/60">
                                      <span className="text-[12px] uppercase font-bold text-[#687789] block">
                                        {f.label}
                                      </span>
                                      <span className="font-semibold text-[13px] text-[#172234] block mt-0.5">
                                        {customFieldVals[f.id] || f.defaultValue || '—'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[13px] text-[#687789]">
                                  {assignedPg
                                    ? `Assigned to ${assignedPg.name} (${assignedPg.salaryType.toUpperCase()}) with ${assignedPg.defaultAllowances?.length || 0} group allowances.`
                                    : 'No group-specific custom metadata fields configured.'}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* TAB 4: DOCUMENTS                                      */}
          {/* ===================================================== */}
          {activeTab === 'documents' && (
            <div className="employee-detail-section employee-detail-documents space-y-6">
              {/* Section 1: Upload Dropzone (HR/Admin) or Document list */}
              <div className={epSectionClass}>
                <div className="flex items-center justify-between pb-3 border-b border-[#dde4e9]">
                  <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">Personal & Verified Documents</h3>
                  {canEdit && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white font-bold text-[13px] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Document</span>
                    </button>
                  )}
                </div>

                {canEdit && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Upload employee document"
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click(); } }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-[7px] p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      isDragging ? 'border-blue-500 bg-[#f8fbfe]/50' : 'border-[#dde4e9] hover:border-slate-300 bg-[#f8fbfe]/60'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => handleFileUpload(e.target.files)}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    />
                    <Upload className="w-8 h-8 text-[#687789] mb-2" />
                    <p className="text-[13px] font-bold text-[#172234]">Drag & drop files here to upload, or click to browse</p>
                    <p className="text-[12px] text-[#687789] mt-0.5">Supports PDF, DOCX, JPG, PNG up to 25MB</p>
                  </div>
                )}

                {/* Uploaded Documents List */}
                <div className="space-y-2 pt-2">
                  {employee.personalDocuments && employee.personalDocuments.length > 0 ? (
                    employee.personalDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3.5 rounded-[7px] border border-[#dde4e9] bg-[#f8fbfe] hover:bg-[#e8eef2]/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-[7px] bg-white text-[#17324e] border border-[#dde4e9] flex items-center justify-center font-bold text-[13px]">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-[13px] text-[#172234]">{doc.name}</p>
                            <p className="text-[12px] text-[#687789]">
                              {doc.size} • Uploaded {doc.uploadDate}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const blob = new Blob([`Official Record: ${doc.name}\nBelonging to: ${employee.name}`], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = doc.name;
                              a.click();
                            }}
                            className="p-2 rounded-[7px] text-[#5e6c7b] hover:text-[#172234] hover:bg-white transition-colors cursor-pointer"
                            title="Download Document"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleDeletePersonalDoc(doc.id)}
                              className="p-2 rounded-[7px] text-[#687789] hover:text-[#8b3133] hover:bg-[#faeeee] transition-colors cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 text-center text-[#687789] text-[13px] font-medium">
                      No personal documents uploaded yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Payslips Table */}
              <div className={epSectionClass}>
                <div className="flex items-center justify-between pb-3 border-b border-[#dde4e9]">
                  <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">Issued Payslips</h3>
                  {canEdit && (
                    <button
                      onClick={() => setShowAddPayslipModal(true)}
                      className="px-3.5 py-1.5 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white font-bold text-[13px] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Issue Payslip</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="font-bold text-[#687789] bg-[#f8fbfe] border-b border-[#dde4e9]">
                        <th className="p-3 rounded-l-xl">Pay Period</th>
                        <th className="p-3">File Name</th>
                        <th className="p-3">Net Disbursed</th>
                        <th className="p-3 text-right rounded-r-xl">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(employee.payslipDocuments || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-[13px] text-[#687789] font-medium">
                            No payslip documents issued yet.
                          </td>
                        </tr>
                      ) : (
                        (employee.payslipDocuments || []).map((ps) => (
                          <tr key={ps.id} className="hover:bg-[#f8fbfe] transition-colors">
                            <td className="p-3 font-bold text-[#172234]">{ps.period}</td>
                            <td className="p-3 font-mono text-[#5e6c7b]">{ps.name}</td>
                            <td className="p-3 font-mono font-bold text-[#53886b]">{ps.amount}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setPayslipToPrint(ps)}
                                  className="px-3 py-1 rounded-[7px] bg-[#f8fbfe] text-[#17324e] hover:bg-blue-100 font-bold transition-colors cursor-pointer"
                                >
                                  Print
                                </button>
                                {canEdit && (
                                  <button
                                    onClick={() => handleDeletePayslip(ps.id)}
                                    className="p-1.5 rounded-[7px] text-[#687789] hover:text-[#8b3133] hover:bg-[#faeeee] transition-colors cursor-pointer"
                                    title="Delete Payslip"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 3: Assigned Assets */}
              <div className={epSectionClass}>
                <div className="flex items-center justify-between pb-3 border-b border-[#dde4e9]">
                  <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">Assigned Hardware & Assets</h3>
                </div>

                <div className="space-y-2.5 pt-1">
                  {(employee.assignedAssets || []).length === 0 ? (
                    <div className="p-4 text-center text-[13px] text-[#687789] font-medium border border-dashed border-[#dde4e9] rounded-[7px]">
                      No hardware assets assigned yet.
                    </div>
                  ) : (
                    (employee.assignedAssets || []).map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between p-3.5 rounded-[7px] border border-[#dde4e9] bg-[#f8fbfe]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[7px] bg-[#eaf1ee] text-[#53886b] flex items-center justify-center font-bold text-[13px]">
                          {asset.type === 'laptop' && <Laptop className="w-4 h-4" />}
                          {asset.type === 'monitor' && <Monitor className="w-4 h-4" />}
                          {asset.type === 'smartphone' && <Smartphone className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-bold text-[13px] text-[#172234]">{asset.name}</p>
                          <p className="text-[12px] text-[#687789]">
                            S/N: {asset.serial} • Allocated on {asset.assignedDate}
                          </p>
                        </div>
                      </div>

                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-bold">
                        Active
                      </span>
                    </div>
                  ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===================================================== */}
          {/* TAB 5: SETTING                                        */}
          {/* ===================================================== */}
          {activeTab === 'setting' && (
            <div className="employee-detail-section employee-detail-setting space-y-6">
              {/* Account Settings */}
              <div className={epSectionClass}>
                <div className={epSectionHeadClass}>
                  <h3>Account Preferences</h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsEditingAccountSettings(!isEditingAccountSettings)}
                      className={epEditBtnClass}
                    >
                      <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {isEditingAccountSettings ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>

                {!isEditingAccountSettings ? (
                  <div className={epFactRowClass}>
                    <span className={epFactLabelClass}>Configured timezone</span>
                    <span className={epFactValueClass}>{formTimezone || '—'}</span>
                  </div>
                ) : (
                  <div className="space-y-3 text-[13px] pt-1">
                    <label className="block text-[#172234] font-bold">Timezone</label>
                    <select
                      value={formTimezone}
                      onChange={(e) => setFormTimezone(e.target.value)}
                      className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 text-[#172234] font-semibold outline-none focus:border-[#17324e] cursor-pointer text-[13px]"
                    >
                      <option value="">Select timezone</option>
                      <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST) GMT +05:30</option>
                      <option value="America/New_York (EST)">America/New_York (EST) GMT -05:00</option>
                      <option value="Europe/London (BST)">Europe/London (BST) GMT +00:00</option>
                      <option value="Asia/Singapore (SGT)">Asia/Singapore (SGT) GMT +08:00</option>
                    </select>
                    <div className="flex justify-end gap-2.5 pt-2">
                      <button
                        onClick={() => { setFormTimezone(employee.timezone || ''); setIsEditingAccountSettings(false); }}
                        className="px-4 py-2 rounded-[7px] border border-[#dde4e9] bg-white font-bold text-[#172234] hover:bg-[#f8fbfe] cursor-pointer text-[13px]"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={savingPreferences}
                        onClick={() => {
                          if (!canEdit || savingPreferences) return;
                          setSavingPreferences(true);
                          void Promise.resolve(onUpdateEmployee({ ...employee, timezone: formTimezone })).then(() => {
                            setIsEditingAccountSettings(false);
                            showToast('Timezone preference updated');
                          }).catch(() => {}).finally(() => setSavingPreferences(false));
                        }}
                        className="px-5 py-2 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white font-bold cursor-pointer text-[13px]"
                      >
                        {savingPreferences ? 'Saving...' : 'Save Preferences'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Privacy */}
              <div className={epSectionClass}>
                <div className="flex items-center justify-between pb-3 border-b border-[#dde4e9]">
                  <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">Calendar & Privacy</h3>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px] pt-1">
                  <span className="text-[#172234] font-bold">
                    Who can see this employee's birthday on the workspace calendar?
                  </span>
                  <div className="relative w-full sm:w-48">
                    <select
                      value={formBirthdayPrivacy}
                      disabled={!canEdit}
                      onChange={(e) => {
                        setFormBirthdayPrivacy(e.target.value as any);
                        showToast(`Birthday privacy set to ${e.target.value}`);
                      }}
                      className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-3.5 py-2 text-[#172234] font-semibold outline-none focus:border-[#17324e] cursor-pointer appearance-none text-[13px] disabled:bg-[#f8fbfe] disabled:cursor-not-allowed"
                    >
                      <option value="Everyone">Everyone</option>
                      <option value="Department">Department Only</option>
                      <option value="Managers">Managers Only</option>
                      <option value="Only Me">Only Me</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-[#687789] absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODALS (Only operable by HR / Super Admin)                 */}
      {/* ========================================================= */}

      {/* Bank Details Modal */}
      {showBankDetailsModal && canEditBank && (
        <SlideOverDrawer
          title="Salary Bank Details"
          onClose={() => !savingBankDetails && setShowBankDetailsModal(false)}
        >
            <form onSubmit={handleSaveBankDetails} className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className={slideOverBodyClass}>
              <div>
                <label className="block text-[#172234] font-bold mb-1">Account holder name</label>
                <input
                  type="text"
                  required
                  value={formAccountHolderName}
                  onChange={(e) => setFormAccountHolderName(e.target.value)}
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[#172234] font-bold mb-1">Bank name</label>
                <select
                  required
                  value={MAJOR_BANKS.includes(formBankName) ? formBankName : formBankName ? 'Other Bank' : ''}
                  onChange={(e) => {
                    const selected = e.target.value;
                    if (selected === 'Other Bank') {
                      setFormBankName('');
                    } else {
                      setFormBankName(selected);
                      if (!formIfscCode) {
                        const prefix = suggestIfscPrefix(selected);
                        if (prefix) setFormIfscCode(prefix);
                      }
                    }
                  }}
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px] cursor-pointer"
                >
                  <option value="">Select bank...</option>
                  {MAJOR_BANKS.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
                {(!MAJOR_BANKS.includes(formBankName) || formBankName === '') && (
                  <input
                    type="text"
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    placeholder="Specify bank name..."
                    className="w-full mt-1.5 rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                  />
                )}
              </div>

              <div>
                <label className="block text-[#172234] font-bold mb-1">Account number</label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={18}
                  value={formAccountNumber}
                  onChange={(e) => setFormAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))}
                  placeholder="e.g. 50100234567890"
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[#172234] font-bold mb-1">IFSC / routing code</label>
                <input
                  type="text"
                  required
                  maxLength={11}
                  value={formIfscCode}
                  onChange={(e) =>
                    setFormIfscCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))
                  }
                  placeholder="e.g. HDFC0001234"
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px] uppercase"
                />
              </div>

              </div>
              <div className={slideOverFooterClass}>
                <button
                  type="button"
                  disabled={savingBankDetails}
                  onClick={() => setShowBankDetailsModal(false)}
                  className={slideOverCancelClass}
                >
                  Cancel
                </button>
                <button type="submit" disabled={savingBankDetails} className={slideOverPrimaryClass}>
                  {savingBankDetails ? 'Saving…' : 'Save bank details'}
                </button>
              </div>
            </form>
        </SlideOverDrawer>
      )}

      {/* Add Job Timeline Modal */}
      {showAddJobTimelineModal && canEdit && (
        <SlideOverDrawer title="Add Progression Milestone" onClose={() => setShowAddJobTimelineModal(false)}>
            <form onSubmit={handleAddJobTimeline} className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className={slideOverBodyClass}>
              <div>
                <label className="block text-[#172234] font-bold mb-1">Effective Date</label>
                <DateInput required value={newJtEffectiveDate} onChange={(e) => setNewJtEffectiveDate(e.target.value)}
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[#172234] font-bold mb-1">Job Title</label>
                <input
                  type="text"
                  required
                  value={newJtJobTitle}
                  onChange={(e) => setNewJtJobTitle(e.target.value)}
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#172234] font-bold mb-1">Position Type</label>
                  <input
                    type="text"
                    value={newJtPositionType}
                    onChange={(e) => setNewJtPositionType(e.target.value)}
                    className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[#172234] font-bold mb-1">Employment Type</label>
                  <input
                    type="text"
                    value={newJtEmploymentType}
                    onChange={(e) => setNewJtEmploymentType(e.target.value)}
                    className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#172234] font-bold mb-1">Reporting Lead / Manager</label>
                <input
                  type="text"
                  value={newJtLineManager}
                  onChange={(e) => setNewJtLineManager(e.target.value)}
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                />
              </div>

              </div>
              <div className={slideOverFooterClass}>
                <button type="button" onClick={() => setShowAddJobTimelineModal(false)} className={slideOverCancelClass}>
                  Cancel
                </button>
                <button type="submit" className={slideOverPrimaryClass}>
                  Add Entry
                </button>
              </div>
            </form>
        </SlideOverDrawer>
      )}

      {/* Add Contract Modal */}
      {showAddContractModal && canEdit && (
        <SlideOverDrawer title="Add Contract Record" onClose={() => setShowAddContractModal(false)}>
            <form onSubmit={handleAddContract} className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className={slideOverBodyClass}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#172234] font-bold mb-1">Contract #</label>
                  <input
                    type="text"
                    required
                    value={newCtNumber}
                    onChange={(e) => setNewCtNumber(e.target.value)}
                    className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-mono font-medium text-[#172234] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[#172234] font-bold mb-1">Contract Type</label>
                  <input
                    type="text"
                    required
                    value={newCtType}
                    onChange={(e) => setNewCtType(e.target.value)}
                    className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#172234] font-bold mb-1">Contract Name</label>
                <input
                  type="text"
                  required
                  value={newCtName}
                  onChange={(e) => setNewCtName(e.target.value)}
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#172234] font-bold mb-1">Start Date</label>
                  <DateInput required value={newCtStartDate} onChange={(e) => setNewCtStartDate(e.target.value)}
                    className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[#172234] font-bold mb-1">End Date</label>
                  <input
                    type="text"
                    value={newCtEndDate}
                    onChange={(e) => setNewCtEndDate(e.target.value)}
                    placeholder="Indefinite"
                    className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                  />
                </div>
              </div>

              </div>
              <div className={slideOverFooterClass}>
                <button type="button" onClick={() => setShowAddContractModal(false)} className={slideOverCancelClass}>
                  Cancel
                </button>
                <button type="submit" className={slideOverPrimaryClass}>
                  Save Contract
                </button>
              </div>
            </form>
        </SlideOverDrawer>
      )}

      {/* Add Payslip Modal */}
      {showAddPayslipModal && canEdit && (
        <SlideOverDrawer title="Issue New Payslip" onClose={() => setShowAddPayslipModal(false)}>
            <form onSubmit={handleAddPayslip} className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className={slideOverBodyClass}>
              <div>
                <label className="block text-[#172234] font-bold mb-1">Document File Name</label>
                <input
                  type="text"
                  required
                  value={newPsName}
                  onChange={(e) => setNewPsName(e.target.value)}
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-mono font-medium text-[#172234] text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#172234] font-bold mb-1">Pay Period</label>
                  <input
                    type="text"
                    required
                    value={newPsPeriod}
                    onChange={(e) => setNewPsPeriod(e.target.value)}
                    className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[#172234] font-bold mb-1">Payment Amount</label>
                  <input
                    type="text"
                    required
                    value={newPsAmount}
                    onChange={(e) => setNewPsAmount(e.target.value)}
                    className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-mono font-medium text-[#172234] text-[13px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#172234] font-bold mb-1">Disbursed Date</label>
                <input
                  type="text"
                  value={newPsDate}
                  onChange={(e) => setNewPsDate(e.target.value)}
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-[13px]"
                />
              </div>

              </div>
              <div className={slideOverFooterClass}>
                <button type="button" onClick={() => setShowAddPayslipModal(false)} className={slideOverCancelClass}>
                  Cancel
                </button>
                <button type="submit" className={slideOverPrimaryClass}>
                  Generate Payslip
                </button>
              </div>
            </form>
        </SlideOverDrawer>
      )}

      {showIdCard && (
        <IdCardStudio
          key={employee.id}
          title={isInstitution ? 'Staff ID card' : 'Employee ID card'}
          roleFieldLabel="Designation"
          audience="employee"
          initial={buildEmployeeIdCardDraft(employee, state.organization)}
          onClose={() => setShowIdCard(false)}
        />
      )}

      {payslipToPrint && (
        <PayslipStudio
          key={payslipToPrint.id}
          initial={buildPayslipDraftFromDocument(employee, payslipToPrint, state.organization)}
          onClose={() => setPayslipToPrint(null)}
        />
      )}

      {/* Change Employment Status Modal (Admin / HR) */}
      {showStatusModal && (
        <SlideOverDrawer
          title="Change Employment Status"
          description={`Update status for ${employee.name}`}
          onClose={() => setShowStatusModal(false)}
        >
            <form onSubmit={handleSaveStatusModal} className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className={slideOverBodyClass}>
              <div>
                <label className="block text-[13px] font-semibold text-[#172234] mb-1.5">Employment Status</label>
                <select
                  value={statusChoice}
                  onChange={(e) => setStatusChoice(e.target.value)}
                  className="w-full rounded-[7px] border border-[#dde4e9] bg-white px-3.5 py-2.5 text-[13px] text-[#172234] font-semibold outline-none focus:border-slate-400 cursor-pointer"
                >
                  <option value="Not Activated">Not Activated (Pending First Login)</option>
                  <option value="Active">Active (Permanent / Confirmed)</option>
                  <option value="Probation">In Probation</option>
                  <option value="Notice Period">Notice Period</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Terminated">Terminated / Deactivated</option>
                </select>
              </div>

              {statusChoice === 'Notice Period' && (
                <div className="p-3.5 rounded-[7px] border border-[#dde4e9] bg-[#f8fbfe]/60 space-y-3 text-[13px]">
                  <div>
                    <label className="block text-[13px] font-semibold text-[#172234] mb-1">Notice Duration</label>
                    <select
                      value={statusNoticeDays}
                      onChange={(e) => {
                        const days = Number(e.target.value);
                        setStatusNoticeDays(days);
                        const d = new Date();
                        d.setDate(d.getDate() + days);
                        setStatusNoticeEndDate(d.toISOString().split('T')[0]);
                      }}
                      className="w-full rounded-[8px] border border-[#dde4e9] bg-white px-3 py-2 text-[13px] text-[#172234] font-medium cursor-pointer"
                    >
                      <option value={15}>15 Days</option>
                      <option value={30}>30 Days (Standard 1 Month)</option>
                      <option value={60}>60 Days (2 Months)</option>
                      <option value={90}>90 Days (3 Months)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[#172234] mb-1">Last Working Day / End Date</label>
                    <DateInput value={statusNoticeEndDate} onChange={(e) => setStatusNoticeEndDate(e.target.value)}
                      className="w-full rounded-[8px] border border-[#dde4e9] bg-white px-3 py-2 text-[13px] text-[#172234] font-medium cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {statusChoice === 'Probation' && (
                <div className="p-3.5 rounded-[7px] border border-[#dde4e9] bg-[#f8fbfe]/60 space-y-3 text-[13px]">
                  <div>
                    <label className="block text-[13px] font-semibold text-[#172234] mb-1">Probation Duration</label>
                    <select
                      value={statusProbationMonths}
                      onChange={(e) => {
                        const m = Number(e.target.value);
                        setStatusProbationMonths(m);
                        const d = new Date();
                        d.setMonth(d.getMonth() + m);
                        setStatusProbationEndDate(d.toISOString().split('T')[0]);
                      }}
                      className="w-full rounded-[8px] border border-[#dde4e9] bg-white px-3 py-2 text-[13px] text-[#172234] font-medium cursor-pointer"
                    >
                      <option value={1}>1 Month</option>
                      <option value={2}>2 Months</option>
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-[#172234] mb-1">Probation Review Date</label>
                    <DateInput value={statusProbationEndDate} onChange={(e) => setStatusProbationEndDate(e.target.value)}
                      className="w-full rounded-[8px] border border-[#dde4e9] bg-white px-3 py-2 text-[13px] text-[#172234] font-medium cursor-pointer"
                    />
                  </div>
                </div>
              )}

              </div>
              <div className={slideOverFooterClass}>
                <button type="button" onClick={() => setShowStatusModal(false)} className={slideOverCancelClass}>
                  Cancel
                </button>
                <button type="submit" className={slideOverPrimaryClass}>
                  Save Status
                </button>
              </div>
            </form>
        </SlideOverDrawer>
      )}
      {changeEmailOpen && (
        <ChangeLoginEmailDialog
          employeeId={employee.id}
          currentEmail={employee.email || ''}
          mode={isSelfViewer ? 'self' : 'admin'}
          movesOrganizationEmail={movesOrganizationEmail}
          onClose={() => setChangeEmailOpen(false)}
          onEmailChanged={(email) => {
            void onUpdateEmployee({ ...employee, email });
          }}
        />
      )}
    </div>
  );
};
