'use client';

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
  Lock,
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
import { WORLD_NATIONALITIES, WORLD_COUNTRIES } from '@/data/nations';
import { api } from '@/services/apiClient';
import { isInstitutionMode } from '@/utils/organizationMode';
import { compressAvatarImage } from '@/utils/imageUtils';
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

interface EmployeeDetailViewProps {
  employee: Employee;
  allEmployees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
  onOpenDepartment?: (departmentName: string) => void;
  onUpdateEmployee: (updated: Employee) => void;
  onBack: () => void;
  state: AppState;
  initialTab?: 'general' | 'job' | 'attendance_leave' | 'payroll' | 'documents' | 'setting';
}

import { isExecutiveOrAdmin, isDirectReport } from '../../utils/teamAccess';

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

  // Strict RBAC: Only Super Admin and HR can edit employee profiles
  const currentRole = state.currentPersona?.role || 'employee';
  const canEdit =
    currentRole === 'super_admin' ||
    currentRole === 'admin' ||
    currentRole === 'hr_manager' ||
    (currentRole as string) === 'hr';

  // Tabs: General | Job | Attendance & Leaves | Payroll | Documents | Setting
  const [activeTab, setActiveTab] = useState<'general' | 'job' | 'attendance_leave' | 'payroll' | 'documents' | 'setting'>(initialTab || 'general');

  // Edit Mode States
  const [isEditingPersonalInfo, setIsEditingPersonalInfo] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [isEditingEmergency, setIsEditingEmergency] = useState(false);
  const [isEditingJobInfo, setIsEditingJobInfo] = useState(false);
  const [isCustomDesignation, setIsCustomDesignation] = useState(false);
  const [isCustomDepartment, setIsCustomDepartment] = useState(false);
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
  const [showActionDropdown, setShowActionDropdown] = useState(false);
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
  const [formEmail, setFormEmail] = useState(employee.email || '');
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
    employee.probationStatus || 'in_probation'
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
  const [formBirthdayPrivacy, setFormBirthdayPrivacy] = useState<'Everyone' | 'Only Me' | 'Department' | 'Managers'>('Everyone');

  // Avatar Upload Ref & Handler
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressAvatarImage(file);
      if (dataUrl) {
        onUpdateEmployee({
          ...employee,
          avatar: dataUrl,
        });
        showToast('Profile photo updated successfully');
      }
    } catch (err) {
      console.error('Failed to compress profile picture:', err);
    }
  };

  // Sync form states whenever employee changes
  useEffect(() => {
    setFormFullName(employee.fullName || employee.name || '');
    setFormGender(employee.gender && employee.gender !== '—' ? employee.gender : 'None');
    setFormDOB(normalizeDateForInput(employee.dateOfBirth));
    setFormNationality(employee.nationality || '');
    setFormPhone(employee.phone || '');
    setFormEmail(employee.email || '');
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
    setFormDepartment(employee.department || '');
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
    setShowActionDropdown(false);
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
        day: new Date(a.date).toLocaleDateString('en-US', { weekday: 'long' }),
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
    return (state.leaves || []).filter(
      (l) =>
        l.employeeId === employee.id ||
        (l.employeeName && l.employeeName.toLowerCase() === (employee.name || '').toLowerCase())
    );
  }, [state.leaves, employee.id, employee.name]);

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

  // Helper to save personal info
  const handleSavePersonalInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('Permission denied. Only HR and Super Admin can edit employee records.');
      return;
    }
    const updated: Employee = {
      ...employee,
      name: formFullName.trim() || employee.name,
      fullName: formFullName.trim() || employee.fullName,
      gender: formGender,
      dateOfBirth: formDOB.trim() || undefined,
      nationality: formNationality,
      phone: formPhone,
      email: formEmail,
      healthInsurance: formHealthCare,
      maritalStatus: formMaritalStatus,
      personalTaxId: formTaxId,
      socialInsurance: formSocialInsurance,
    };
    onUpdateEmployee(updated);
    setIsEditingPersonalInfo(false);
    showToast('Personal Info updated successfully');
  };

  // Helper to save address
  const handleSaveAddress = (e: React.FormEvent) => {
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
    onUpdateEmployee(updated);
    setIsEditingAddress(false);
    showToast('Address updated successfully');
  };

  // Helper to save emergency contact
  const handleSaveEmergency = (e: React.FormEvent) => {
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
    onUpdateEmployee(updated);
    setIsEditingEmergency(false);
    showToast('Emergency Contact updated successfully');
  };

  // Helper to save job info
  const handleSaveJobInfo = (e: React.FormEvent) => {
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
      department: (formDepartment as any) || employee.department,
      team: formTeam.trim() || employee.team,
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
    onUpdateEmployee(updated);
    setIsEditingJobInfo(false);
    setIsCustomDesignation(false);
    setIsCustomDepartment(false);
    showToast('Employment & Organization details updated');
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
    if (!canEdit) return;
    hydrateBankForm();
    setShowBankDetailsModal(true);
  };

  const handleStartBankEdit = () => {
    if (!canEdit) return;
    if (isEditingBankDetails) {
      setIsEditingBankDetails(false);
      return;
    }
    hydrateBankForm();
    setIsEditingBankDetails(true);
  };

  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('Permission denied. Only HR and Super Admin can edit bank details.');
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

  // Read-only full detail for non-editors (self view). Edit controls stay gated by canEdit.
  // (Previously short-circuited to EmployeeProfileCardModal.)

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Breadcrumb Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-bold text-[#5e6c7b] hover:text-[#172234] transition-all cursor-pointer group bg-white border border-[#dde4e9] px-3 py-1.5 rounded-[7px] shadow-2xs"
          >
            <ChevronLeft className="h-4 w-4 text-[#687789] group-hover:text-[#172234] transition-colors" />
            <span>Back to Employees</span>
          </button>
          {!canEdit && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80 flex items-center gap-1">
              <Lock className="w-3 h-3 text-slate-400" /> Read-Only Mode
            </span>
          )}
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: Employee Profile Card                        */}
        {/* ========================================================= */}
        <div className="lg:col-span-4 xl:col-span-3 w-full bg-white rounded-[12px] p-6 sm:p-7 shadow-xs space-y-5 text-[#172234] border border-[#dde4e9]">
          {/* Avatar & Edit Photo Option */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400 border-2 border-slate-200/80 shadow-2xs">
                {employee.avatar ? (
                  <img
                    src={employee.avatar}
                    alt={employee.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <User className="h-12 w-12 text-slate-400 stroke-[1.8]" />
                )}
              </div>

              {(canEdit || state.currentPersona?.id === employee.id || state.currentPersona?.name === employee.name) && (
                <>
                  <input
                    type="file"
                    ref={avatarInputRef}
                    onChange={handleAvatarChange}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    title="Change Profile Photo"
                    className="absolute bottom-0 right-0 p-2 rounded-full bg-[#17324e] hover:bg-[#285275] active:scale-95 text-white shadow-md border-2 border-white transition-all cursor-pointer flex items-center justify-center group-hover:scale-105"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            <div className="pt-2">
              <h2 className="text-xl font-bold text-[#172234] tracking-tight">{employee.name}</h2>
              <p className="text-xs text-[#5e6c7b] font-semibold mt-0.5">{employee.designation || (isSuperAdmin ? 'Founder & CEO' : '—')}</p>
            </div>

            {/* Status Pill (Clickable for Admin/HR) */}
            <div className="pt-1">
              <button
                type="button"
                disabled={!canEdit}
                onClick={handleOpenStatusModal}
                title={canEdit ? 'Click to change employment status' : undefined}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase border transition-all ${
                  canEdit ? 'cursor-pointer hover:shadow-xs hover:scale-105 active:scale-95' : 'cursor-default'
                } ${
                  (employee.accountStatus === 'Active' || employee.status === 'Active')
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : (employee.accountStatus === 'In Probation' || employee.status === 'Probation' || employee.status === 'In Probation' || employee.probationStatus === 'in_probation')
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
                <span>
                  {(employee.accountStatus || (isActivated ? employee.status || 'Active' : 'Not Activated')).toUpperCase()}
                </span>
                {canEdit && <Edit2 className="w-2.5 h-2.5 opacity-60 ml-0.5" />}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowIdCard(true)}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[7px] border border-[#dde4e9] bg-white px-3 py-2 text-xs font-semibold text-[#172234] hover:bg-[#f3f5f7] cursor-pointer"
            >
              <CreditCard className="h-3.5 w-3.5 text-[#2d628e]" />
              Print ID card
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 my-4" />

          {/* Contact Meta Details */}
          <div className="space-y-3.5 text-xs">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={2} />
              <a
                href={`mailto:${employee.email}`}
                className="font-semibold text-slate-800 hover:text-blue-600 transition-colors truncate"
              >
                {employee.email || '—'}
              </a>
            </div>

            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={2} />
              <span className="font-semibold text-slate-800">
                {employee.phone || '—'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={2} />
              <span className="font-semibold text-slate-800">
                {employee.timezone || '—'}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 my-4" />

          {/* Department & Management Hierarchy */}
          <div className="space-y-4 text-xs">
            {/* Department */}
            <div>
              <p className="text-[11px] font-semibold text-[#687789]">Department & Team</p>
              {employee.department && onOpenDepartment ? (
                <button
                  type="button"
                  onClick={() => onOpenDepartment(employee.department)}
                  className="font-bold text-[#17324e] mt-0.5 hover:underline text-left cursor-pointer"
                >
                  {employee.department}
                  {employee.team ? ` • ${employee.team}` : ''}
                </button>
              ) : (
                <p className="font-bold text-[#172234] mt-0.5">
                  {employee.department || '—'}
                  {employee.team ? ` • ${employee.team}` : ''}
                </p>
              )}
            </div>

            {/* Office */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400">Office Location</p>
              <p className="font-bold text-slate-900 mt-0.5">
                {employee.offices && employee.offices.length > 1
                  ? `${employee.offices.map((o) => o.name).filter(Boolean).join(', ')}`
                  : employee.officeName || employee.location || '—'}
              </p>
            </div>

            {/* Line Manager / Staff Lead */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400">
                {isInstitution ? 'Staff Lead / HOD' : 'Line Manager'}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {managerDisplayAvatar && !managerDisplayAvatar.includes('dicebear') && !managerDisplayAvatar.startsWith('data:image/svg+xml') ? (
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
                  {managerDisplayName || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Button (HR & Super Admin Only) */}
          {canEdit && (
            <div className="relative pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowActionDropdown(!showActionDropdown)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-xs active:scale-98 cursor-pointer"
              >
                <span>Manage Profile</span>
                <ChevronDown className="w-3.5 h-3.5 text-white ml-auto" strokeWidth={2.5} />
              </button>

              {showActionDropdown && (
                <div className="absolute bottom-full mb-2 left-0 w-full bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 text-xs divide-y divide-slate-100 animate-in zoom-in-95">
                  <div className="p-1 space-y-1 text-slate-700">
                    {!isActivated && (
                      <>
                        <button
                          onClick={() => {
                            handleResendInvite();
                            setShowActionDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-amber-50 text-amber-800 flex items-center gap-2 cursor-pointer font-bold text-xs transition-colors"
                        >
                          <Mail className="w-4 h-4 text-amber-600" />
                          <span>Resend Invitation Email</span>
                        </button>
                        <button
                          onClick={() => {
                            handleCopyMagicLink();
                            setShowActionDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-50 text-blue-700 flex items-center gap-2 cursor-pointer font-bold text-xs transition-colors"
                        >
                          <Globe className="w-4 h-4 text-blue-600" />
                          <span>Copy Magic Sign-In Link</span>
                        </button>
                        <button
                          onClick={() => {
                            handleActivateManually();
                            setShowActionDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-50 text-emerald-700 flex items-center gap-2 cursor-pointer font-bold text-xs transition-colors"
                        >
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span>Activate Account Manually</span>
                        </button>
                      </>
                    )}
                    <button
                      onClick={handleOpenStatusModal}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-50 text-blue-700 flex items-center gap-2 cursor-pointer font-bold text-xs transition-colors"
                    >
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>Change Employment Status</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingPersonalInfo(true);
                        setActiveTab('general');
                        setShowActionDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-bold text-xs transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-slate-700" />
                      <span>Edit Personal Information</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingJobInfo(true);
                        setActiveTab('job');
                        setShowActionDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-bold text-xs transition-colors"
                    >
                      <Briefcase className="w-4 h-4 text-slate-700" />
                      <span>Edit Job & Role</span>
                    </button>
                  </div>
                  <div className="p-1 pt-1.5">
                    <button
                      onClick={() => {
                        handleChangeStatus('Terminated');
                        setShowActionDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 flex items-center gap-2 cursor-pointer font-bold text-xs transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Deactivate Record</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Tabbed Detail Area                          */}
        {/* ========================================================= */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* Top Tab Bar */}
          <div className="flex items-center gap-6 sm:gap-8 border-b border-[#dde4e9] overflow-x-auto scrollbar-none pb-0 bg-white px-6 pt-3 rounded-[12px] shadow-xs">
            {(
              [
                { id: 'general' as const, label: 'General' },
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

          {/* ===================================================== */}
          {/* TAB 1: GENERAL (Personal Info, Address, Emergency)    */}
          {/* ===================================================== */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Account Not Activated Alert Banner */}
              {!isActivated && (
                <div className="bg-[#fbf6ea] border border-[#ead9a8] rounded-[12px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-xs animate-in fade-in">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="h-9 w-9 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                      <AlertTriangle className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-amber-950 text-sm">Account Is Not Activated</h4>
                      <p className="text-amber-800/90 text-xs mt-0.5">
                        This employee has not yet logged in or activated their workspace credentials.
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={handleCopyMagicLink}
                        className="px-3 py-1.5 rounded-xl border border-amber-300 bg-white hover:bg-amber-100/60 text-amber-900 font-bold transition-all cursor-pointer flex items-center gap-1.5 text-xs shadow-2xs"
                      >
                        <Globe className="w-3.5 h-3.5 text-amber-700" />
                        <span>Copy Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleActivateManually}
                        className="px-3.5 py-1.5 rounded-[7px] bg-[#53886b] hover:bg-[#46725a] text-white font-bold transition-all cursor-pointer flex items-center gap-1.5 text-xs shadow-2xs"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Activate Now</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Section 1: Personal Info Card */}
              <div className="bg-white border border-[#dde4e9] rounded-[12px] p-6 sm:p-7 shadow-xs text-[#172234] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#f3f5f7]">
                  <h3 className="text-[15px] font-bold text-[#172234] tracking-tight">Personal Information</h3>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditingPersonalInfo(!isEditingPersonalInfo)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                      title={isEditingPersonalInfo ? 'Cancel' : 'Edit Personal Info'}
                    >
                      <Edit2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>

                {!isEditingPersonalInfo ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 pt-1 text-xs">
                    {/* Left Column */}
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Full Name</span>
                        <span className="font-bold text-slate-900 truncate">
                          {employee.fullName || employee.name || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Date of Birth</span>
                        <span className="font-bold text-slate-900 truncate">
                          {employee.dateOfBirth
                            ? !isNaN(Date.parse(employee.dateOfBirth))
                              ? new Date(employee.dateOfBirth).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                              : employee.dateOfBirth
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Nationality</span>
                        <span className="font-bold text-slate-900 truncate">
                          {employee.nationality || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Email Address</span>
                        <span className="font-bold text-slate-900 truncate">
                          {employee.email || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Health Insurance</span>
                        <span className="font-bold text-slate-900 truncate">
                          {employee.healthInsurance || '—'}
                        </span>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Gender</span>
                        <span className="font-bold text-slate-900">
                          {employee.gender && employee.gender !== '—' ? employee.gender : 'None'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Marital Status</span>
                        <span className="font-bold text-slate-900">
                          {employee.maritalStatus || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Phone</span>
                        <span className="font-bold text-slate-900 font-mono">
                          {employee.phone || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Personal Tax ID</span>
                        <span className="font-bold text-slate-900 font-mono">
                          {employee.personalTaxId || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-slate-400 font-semibold">Social Insurance / PF</span>
                        <span className="font-bold text-slate-900 font-mono">
                          {employee.socialInsurance || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Edit View (HR / Admin only) */
                  <form onSubmit={handleSavePersonalInfo} className="pt-2 space-y-4 text-xs">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={formFullName}
                        onChange={(e) => setFormFullName(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Gender</label>
                        <select
                          value={formGender || 'None'}
                          onChange={(e) => setFormGender(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs cursor-pointer"
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
                        <label className="block text-slate-700 font-bold mb-1">Date of Birth</label>
                        <input
                          type="date"
                          max={new Date().toISOString().split('T')[0]}
                          value={formDOB}
                          onChange={(e) => setFormDOB(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Nationality</label>
                        <select
                          value={formNationality}
                          onChange={(e) => setFormNationality(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs cursor-pointer"
                        >
                          <option value="">Select Nationality</option>
                          {WORLD_NATIONALITIES.map((nat) => (
                            <option key={nat} value={nat}>{nat}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Phone Number (Max 10 Digits)</label>
                        <input
                          type="tel"
                          maxLength={10}
                          placeholder="e.g. 9845012345"
                          value={formPhone}
                          onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Email Address</label>
                        <input
                          type="email"
                          value={formEmail}
                          onChange={(e) => setFormEmail(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Health Care Provider</label>
                        <input
                          type="text"
                          value={formHealthCare}
                          onChange={(e) => setFormHealthCare(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Personal Tax ID</label>
                        <input
                          type="text"
                          maxLength={10}
                          value={formTaxId}
                          onChange={(e) =>
                            setFormTaxId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Social Insurance / PF</label>
                        <input
                          type="text"
                          maxLength={12}
                          value={formSocialInsurance}
                          onChange={(e) =>
                            setFormSocialInsurance(e.target.value.replace(/\D/g, '').slice(0, 12))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsEditingPersonalInfo(false)}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold cursor-pointer transition-colors text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white font-bold cursor-pointer transition-all shadow-xs text-xs"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Section 1b: Bank Details */}
              <div className="bg-white border border-[#dde4e9] rounded-[12px] p-6 sm:p-7 shadow-xs text-[#172234] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#f3f5f7]">
                  <h3 className="text-[15px] font-bold text-[#172234] tracking-tight">Bank Details</h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleStartBankEdit}
                      className="p-2 rounded-[7px] text-[#687789] hover:text-[#172234] hover:bg-[#f3f5f7] transition-colors cursor-pointer"
                      title={isEditingBankDetails ? 'Cancel' : 'Edit bank details'}
                    >
                      <Edit2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>

                {!isEditingBankDetails ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 pt-1 text-xs">
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-[#687789] font-semibold">Account holder</span>
                        <span className="font-bold text-[#172234] truncate">
                          {blankBankValue(employee.bankDetails?.accountHolderName) || employee.fullName || employee.name || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-[#687789] font-semibold">Bank name</span>
                        <span className="font-bold text-[#172234] truncate">
                          {blankBankValue(employee.bankDetails?.bankName) || '—'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-[#687789] font-semibold">Account number</span>
                        <span className="font-bold text-[#172234] font-mono">
                          {(() => {
                            const accountNumber = blankBankValue(employee.bankDetails?.accountNumber);
                            return accountNumber ? `•••• ${accountNumber.slice(-4)}` : '—';
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                        <span className="text-[#687789] font-semibold">IFSC / routing</span>
                        <span className="font-bold text-[#172234] font-mono">
                          {blankBankValue(employee.bankDetails?.ifscCode) || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveBankDetails} className="space-y-3.5 text-xs pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[#5e6c7b] font-bold mb-1">Account holder name</label>
                        <input
                          type="text"
                          required
                          value={formAccountHolderName}
                          onChange={(e) => setFormAccountHolderName(e.target.value)}
                          className="w-full rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-xs"
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
                          className="w-full rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-xs cursor-pointer"
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
                            className="w-full mt-1.5 rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2 outline-none focus:border-[#17324e] font-medium text-[#172234] text-xs"
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
                          className="w-full rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-xs font-mono"
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
                          className="w-full rounded-[7px] border border-[#c5d0d8] bg-white px-4 py-2.5 outline-none focus:border-[#17324e] font-medium text-[#172234] text-xs uppercase font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2.5 pt-3 border-t border-[#f3f5f7]">
                      <button
                        type="button"
                        disabled={savingBankDetails}
                        onClick={() => setIsEditingBankDetails(false)}
                        className="px-4 py-2 rounded-[7px] border border-[#dde4e9] font-bold text-[#17324e] hover:bg-[#f3f5f7] cursor-pointer text-xs disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingBankDetails}
                        className="px-5 py-2 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white font-bold shadow-xs cursor-pointer text-xs disabled:opacity-50"
                      >
                        {savingBankDetails ? 'Saving…' : 'Save bank details'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Section 2: Address Card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Residential Address</h3>
                  {canEditAddress && (
                    <button
                      onClick={() => setIsEditingAddress(!isEditingAddress)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                      title={isEditingAddress ? 'Cancel' : 'Edit Address'}
                    >
                      <Edit2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>

                {!isEditingAddress ? (
                  <div className="space-y-3 pt-1 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-400 font-semibold">Primary Address</span>
                      <span className="font-bold text-slate-900">
                        {employee.primaryAddress || '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-400 font-semibold">City & State</span>
                      <span className="font-bold text-slate-900">
                        {employee.city || employee.stateProvince
                          ? `${employee.city || ''}${employee.city && employee.stateProvince ? ', ' : ''}${employee.stateProvince || ''}`
                          : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-400 font-semibold">Country & Postal Code</span>
                      <span className="font-bold text-slate-900">
                        {employee.country || employee.postalCode
                          ? `${employee.country || ''}${employee.country && employee.postalCode ? ' — ' : ''}${employee.postalCode || ''}`
                          : '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveAddress} className="pt-2 space-y-4 text-xs">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Primary Address</label>
                      <input
                        type="text"
                        value={formPrimaryAddress}
                        onChange={(e) => setFormPrimaryAddress(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">City</label>
                        <input
                          type="text"
                          value={formCity}
                          onChange={(e) => setFormCity(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">State / Province</label>
                        <input
                          type="text"
                          value={formStateProvince}
                          onChange={(e) => setFormStateProvince(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Country</label>
                        <select
                          value={formCountry}
                          onChange={(e) => setFormCountry(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs cursor-pointer"
                        >
                          <option value="">Select Country</option>
                          {WORLD_COUNTRIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Postal Code</label>
                        <input
                          type="text"
                          maxLength={10}
                          value={formPostCode}
                          onChange={(e) =>
                            setFormPostCode(e.target.value.toUpperCase().replace(/[^A-Z0-9\s-]/g, '').slice(0, 10))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsEditingAddress(false)}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs text-xs"
                      >
                        Save Address
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Section 3: Emergency Contact Card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Emergency Contact</h3>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditingEmergency(!isEditingEmergency)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                      title={isEditingEmergency ? 'Cancel' : 'Edit Emergency Contact'}
                    >
                      <Edit2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>

                {!isEditingEmergency ? (
                  <div className="space-y-3 pt-1 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-400 font-semibold">Contact Name</span>
                      <span className="font-bold text-slate-900">
                        {(!isDummyEmergency && employee.emergencyContact?.name) || '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-400 font-semibold">Relationship</span>
                      <span className="font-bold text-slate-900">
                        {(!isDummyEmergency && employee.emergencyContact?.relation) || '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                      <span className="text-slate-400 font-semibold">Emergency Phone</span>
                      <span className="font-bold text-slate-900">
                        {(!isDummyEmergency && employee.emergencyContact?.phone) || '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveEmergency} className="pt-2 space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Contact Name</label>
                        <input
                          type="text"
                          value={formEmergencyName}
                          onChange={(e) => setFormEmergencyName(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Relationship</label>
                        <input
                          type="text"
                          value={formEmergencyRelation}
                          onChange={(e) => setFormEmergencyRelation(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Emergency Phone (Max 10 Digits)</label>
                        <input
                          type="tel"
                          maxLength={10}
                          placeholder="e.g. 9845099887"
                          value={formEmergencyPhone}
                          onChange={(e) => setFormEmergencyPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsEditingEmergency(false)}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs text-xs"
                      >
                        Save Contact
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
            <div className="space-y-6">
              {/* Section 1: Employment Information */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Employment & Role Details</h3>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditingJobInfo(!isEditingJobInfo)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                      title="Edit Job Information"
                    >
                      <Edit2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>

                {!isEditingJobInfo ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1 text-xs">
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">Employee ID</span>
                      <span className="font-bold text-slate-900 mt-1 block font-mono text-sm">
                        {employee.employeeId || '—'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">Job Role</span>
                      <span className="font-bold text-slate-900 mt-1 block truncate">
                        {employee.designation || '—'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">Department</span>
                      <span className="font-bold text-blue-600 mt-1 block">
                        {employee.department || '—'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">Office Location</span>
                      <span className="font-bold text-slate-900 mt-1 block">
                        {employee.offices && employee.offices.length > 1
                          ? employee.offices.map((o) => o.name).filter(Boolean).join(', ')
                          : employee.officeName || employee.location || '—'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">
                        {isInstitution ? 'Staff Lead / Department Head' : 'Reporting Manager'}
                      </span>
                      <span className="font-bold text-emerald-600 mt-1 block truncate">
                        {managerDisplayName || '—'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">Service Duration</span>
                      <span className="font-bold text-slate-900 mt-1 block">
                        {employee.serviceYear || '—'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">Joining Date</span>
                      <span className="font-bold text-slate-900 mt-1 block">
                        {employee.joinDate || employee.joiningDate || '—'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">Employment Status</span>
                      <span className="font-bold text-slate-900 mt-1 block">
                        {employee.status || 'Active'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">Account Status</span>
                      <span className={`font-bold text-xs mt-1 inline-flex items-center ${
                        (employee.accountStatus === 'Active' || employee.accountStatus === 'In Probation')
                          ? 'text-emerald-700'
                          : employee.accountStatus === 'On Leave'
                          ? 'text-purple-700'
                          : (employee.accountStatus === 'Deactivated' || employee.accountStatus === 'Suspended')
                          ? 'text-rose-700'
                          : 'text-amber-700'
                      }`}>
                        {employee.accountStatus || (!isActivated ? 'Not Activated' : 'Active')}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-semibold block">Probation Status</span>
                      <span className="font-bold text-slate-900 mt-1 block">
                        {(employee.probationStatus || 'in_probation') === 'confirmed'
                          ? 'Confirmed Permanent'
                          : (employee.probationStatus || 'in_probation') === 'extended'
                          ? `Extended (${employee.probationEndDate || 'Active'})`
                          : `In Probation (${employee.probationEndDate ? 'Ends ' + employee.probationEndDate : (employee.probationPeriodMonths || 3) + 'm'})`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveJobInfo} className="pt-2 space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Employee ID</label>
                        <input
                          type="text"
                          value={formEmployeeId}
                          onChange={(e) => setFormEmployeeId(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-slate-700 font-bold">Job Designation</label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomDesignation(!isCustomDesignation);
                              if (!isCustomDesignation) setFormDesignation('');
                            }}
                            className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
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
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
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
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs cursor-pointer"
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
                            <option value="__custom__" className="text-blue-600 font-semibold">
                              + Enter Custom Designation...
                            </option>
                          </select>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-slate-700 font-bold">Department</label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomDepartment(!isCustomDepartment);
                              if (!isCustomDepartment) setFormDepartment('');
                            }}
                            className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                          >
                            {isCustomDepartment ? 'Choose Preset' : '+ Custom'}
                          </button>
                        </div>
                        {isCustomDepartment ? (
                          <input
                            type="text"
                            value={formDepartment}
                            onChange={(e) => setFormDepartment(e.target.value)}
                            placeholder="Enter custom department..."
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                            required
                            autoFocus
                          />
                        ) : (
                          <select
                            value={formDepartment}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                setIsCustomDepartment(true);
                                setFormDepartment('');
                              } else {
                                setFormDepartment(e.target.value);
                              }
                            }}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs cursor-pointer"
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
                            <option value="__custom__" className="text-blue-600 font-semibold">
                              + Enter Custom Department...
                            </option>
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">
                          {isInstitution ? 'Reporting Staff Lead / HOD' : 'Reporting Line Manager'}
                        </label>
                        <select
                          value={formManagerId}
                          onChange={(e) => setFormManagerId(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs cursor-pointer"
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
                        <label className="block text-slate-700 font-bold mb-1">
                          Office Location{availableOffices.length > 1 ? 's' : ''}
                        </label>
                        {availableOffices.length === 0 ? (
                          <p className="text-xs text-slate-500 py-2">(No offices configured)</p>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 space-y-2 max-h-40 overflow-y-auto">
                            {availableOffices.map((o) => {
                              const checked = formOfficeNames.includes(o);
                              return (
                                <label
                                  key={o}
                                  className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer"
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
                                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
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
                                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                                        formPrimaryOfficeName === o
                                          ? 'bg-slate-900 text-white'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                          <p className="text-[11px] text-slate-500 mt-1.5">
                            Primary: {formPrimaryOfficeName || formOfficeNames[0]}
                            {formOfficeNames.length > 1
                              ? ` · ${formOfficeNames.length} offices assigned`
                              : ''}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">Join Date</label>
                        <input
                          type="date"
                          value={formJoinDate}
                          onChange={(e) => setFormJoinDate(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingJobInfo(false);
                          setIsCustomDesignation(false);
                          setIsCustomDepartment(false);
                          setFormDesignation(employee.designation || '');
                          setFormDepartment(employee.department || '');
                        }}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs text-xs"
                      >
                        Save Organization Details
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Section 2: Job Timeline */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Job Progression Timeline</h3>
                  {canEdit && (
                    <button
                      onClick={() => setShowAddJobTimelineModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Milestone</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto pt-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="font-bold text-slate-400 bg-slate-50 border-b border-slate-100">
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
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-semibold text-slate-800">{item.effectiveDate}</td>
                            <td className="p-3 font-bold text-slate-900">{item.jobTitle}</td>
                            <td className="p-3 text-slate-600">{item.positionType || '-'}</td>
                            <td className="p-3 text-slate-800">{item.employmentType}</td>
                            <td className="p-3 text-blue-600 font-semibold">{item.lineManager}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400 font-medium">
                            No job progression milestones recorded.
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 3: Contract Timeline */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Contract Records</h3>
                  {canEdit && (
                    <button
                      onClick={() => setShowAddContractModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Contract</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto pt-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="font-bold text-slate-400 bg-slate-50 border-b border-slate-100">
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
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-mono font-bold text-slate-900">{item.contractNumber}</td>
                            <td className="p-3 font-semibold text-slate-900">{item.contractName}</td>
                            <td className="p-3 text-slate-600">{item.contractType}</td>
                            <td className="p-3 text-slate-800">{item.startDate}</td>
                            <td className="p-3 text-slate-500">{item.endDate || 'Indefinite'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400 font-medium">
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
            <div className="space-y-6">
              {/* Header Card / Profile Identity */}
              <div className="bg-white dark:bg-[#151518] border border-slate-200/80 dark:border-[#282830] rounded-xl p-5 shadow-2xs text-slate-900 dark:text-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-[#282830]">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      {isInstitution ? 'Staff Attendance & Leave Profile' : 'Attendance & Leave Profile'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {employee.designation || employee.name} ({employee.employeeId || 'EMP-ID'}) &bull; {employee.department}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(employee.officeName || employee.location) && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-[#1f1f26] text-slate-600 dark:text-slate-300">
                        {employee.officeName || employee.location}
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        (employee.status || 'Active') === 'Active'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                          : (employee.status || '').includes('Probation') || (employee.status || '') === 'Not Activated'
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                          : (employee.status || '') === 'On Leave'
                          ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50'
                          : (employee.status || '') === 'Notice Period'
                          ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50'
                      }`}
                    >
                      {employee.status || 'Active'}
                    </span>
                  </div>
                </div>

                {/* 4 Clean Minimalist Metric Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3.5">
                  {/* Present Days */}
                  <div className="p-3.5 sm:p-4 rounded-lg bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830]">
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Present Days
                    </span>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                      {presentDaysCount}{' '}
                      <span className="text-xs font-normal text-slate-400">/ {employeeAttendanceLogs.length}</span>
                    </p>
                  </div>

                  {/* On-Time Rate */}
                  <div className="p-3.5 sm:p-4 rounded-lg bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830]">
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      On-Time Rate
                    </span>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                      {employeeAttendanceLogs.length > 0 ? `${onTimePercent}%` : '—'}
                    </p>
                  </div>

                  {/* Avg Log-In */}
                  <div className="p-3.5 sm:p-4 rounded-lg bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830]">
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Avg Log-In
                    </span>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                      {avgLogInStr}
                    </p>
                  </div>

                  {/* Avg Hours */}
                  <div className="p-3.5 sm:p-4 rounded-lg bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830]">
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      Avg Hours
                    </span>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                      {avgHoursStr}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 1: DAILY ATTENDANCE & PUNCH-IN RECORDS */}
              <div className="bg-white dark:bg-[#151518] border border-slate-200/80 dark:border-[#282830] rounded-xl p-5 sm:p-6 shadow-2xs text-slate-900 dark:text-white space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#282830]">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isInstitution ? 'Staff Attendance Logs & Daily Punch-In Record' : 'Attendance & Shift Punch Records'}
                  </h4>

                  {/* Filter Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-medium">Status:</span>
                    <select
                      value={attStatusFilter}
                      onChange={(e) => setAttStatusFilter(e.target.value)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#282830] bg-slate-50 dark:bg-[#18181d] text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500 cursor-pointer"
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
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="font-bold text-slate-400 dark:text-slate-500 bg-slate-50/70 dark:bg-[#18181d] border-b border-slate-100 dark:border-[#282830]">
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
                        .slice(0, 15)
                        .map((log, idx) => (
                          <tr key={`${log.date}-${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-[#18181d]/50 transition-colors">
                            <td className="p-3 pl-4 whitespace-nowrap">
                              <span className="font-bold text-slate-900 dark:text-white font-mono">{log.date}</span>
                              <span className="ml-2 text-slate-400 text-[11px] font-medium">{log.day}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">{log.inTime}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">{log.outTime}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold text-slate-900 dark:text-white font-mono">{log.hours}</span>
                            </td>
                            <td className="p-3 text-slate-500 font-mono">{log.breakH}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">{log.loc}</td>
                            <td className="p-3 pr-4 text-right whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  log.status === 'Present'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/40'
                                    : log.status === 'Work From Home'
                                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/40'
                                    : log.status === 'Late' || log.status === 'Half Day'
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40'
                                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/40'
                                }`}
                              >
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {employeeAttendanceLogs.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400 font-medium text-xs">
                            No attendance logs recorded for this employee.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION 2: LEAVE BALANCE & ENTITLEMENTS */}
              <div className="bg-white dark:bg-[#151518] border border-slate-200/80 dark:border-[#282830] rounded-xl p-5 sm:p-6 shadow-2xs text-slate-900 dark:text-white space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#282830]">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Leave Balances & Accrual Entitlements
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {effectiveQuotas.isMonthlyCycle
                        ? effectiveQuotas.enableMonthlyRollover
                          ? `Monthly grant with unused rollover (month ${effectiveQuotas.monthsElapsed} of 12 in ${new Date().getFullYear()})`
                          : `Monthly grant — unused days expire each month (month ${effectiveQuotas.monthsElapsed} of 12)`
                        : `Yearly quota (calendar year ${new Date().getFullYear()})`}
                    </p>
                  </div>

                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#1f1f26] text-slate-600 dark:text-slate-300">
                    Policy: {effectiveQuotas.roleKey.toUpperCase()}
                  </span>
                </div>

                {/* Probation Warning Banner */}
                {effectiveQuotas.inProbation && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#18181d] border-l-4 border-amber-400 dark:border-amber-500 flex items-start gap-2.5 text-slate-600 dark:text-slate-300 text-xs">
                    <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold text-slate-800 dark:text-slate-200">Probation Active: </strong>
                      {effectiveQuotas.probationPolicyNotice ||
                        'Paid leaves (Earned, Casual, Sick) are restricted during probation. Absences are recorded as Loss of Pay (LOP / Unpaid).'}
                    </div>
                  </div>
                )}

                {/* 4 Leave Balance Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* Paid / Privilege Leave (Earned Leave) */}
                  <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830] flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Paid / Privilege Leave (PL)
                      </span>
                      <div className="mt-2.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums font-mono">
                          {earnedLeft}
                        </span>
                        <span className="text-xs font-medium text-slate-400">days available</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#282830] text-[11px]">
                      {effectiveQuotas.isMonthlyCycle ? (
                        <>
                          <div className="flex justify-between text-slate-500 dark:text-slate-400">
                            <span>Accrued to Date:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                              {effectiveQuotas.accruedThisCycle.earnedLeave} d ({effectiveQuotas.monthlyRates.earnedLeave} d/mo)
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-500 dark:text-slate-400">
                            <span>Annual Total:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                              {effectiveQuotas.annualQuotas.earnedLeave} d / year
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Annual Quota:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                            {effectiveQuotas.annualQuotas.earnedLeave} d / year
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Used / Approved:</span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">{earnedUsed} d</span>
                      </div>
                      {effectiveQuotas.carryOver.earnedLeave > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                          <span>Carry-Over:</span>
                          <span className="font-mono">+{effectiveQuotas.carryOver.earnedLeave} d</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Casual Leave (CL) */}
                  <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830] flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Casual Leave (CL)
                      </span>
                      <div className="mt-2.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums font-mono">
                          {casualLeft}
                        </span>
                        <span className="text-xs font-medium text-slate-400">days available</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#282830] text-[11px]">
                      {effectiveQuotas.isMonthlyCycle ? (
                        <>
                          <div className="flex justify-between text-slate-500 dark:text-slate-400">
                            <span>Accrued to Date:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                              {effectiveQuotas.accruedThisCycle.casualLeave} d ({effectiveQuotas.monthlyRates.casualLeave} d/mo)
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-500 dark:text-slate-400">
                            <span>Annual Total:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                              {effectiveQuotas.annualQuotas.casualLeave} d / year
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Annual Quota:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                            {effectiveQuotas.annualQuotas.casualLeave} d / year
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Used / Approved:</span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">{casualUsed} d</span>
                      </div>
                      {effectiveQuotas.carryOver.casualLeave > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                          <span>Carry-Over:</span>
                          <span className="font-mono">+{effectiveQuotas.carryOver.casualLeave} d</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sick Leave (SL) */}
                  <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830] flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Sick Leave (SL)
                      </span>
                      <div className="mt-2.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums font-mono">
                          {sickLeft}
                        </span>
                        <span className="text-xs font-medium text-slate-400">days available</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#282830] text-[11px]">
                      {effectiveQuotas.isMonthlyCycle ? (
                        <>
                          <div className="flex justify-between text-slate-500 dark:text-slate-400">
                            <span>Accrued to Date:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                              {effectiveQuotas.accruedThisCycle.sickLeave} d ({effectiveQuotas.monthlyRates.sickLeave} d/mo)
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-500 dark:text-slate-400">
                            <span>Annual Total:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                              {effectiveQuotas.annualQuotas.sickLeave} d / year
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Annual Quota:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                            {effectiveQuotas.annualQuotas.sickLeave} d / year
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Used / Approved:</span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">{sickUsed} d</span>
                      </div>
                      {effectiveQuotas.carryOver.sickLeave > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                          <span>Carry-Over:</span>
                          <span className="font-mono">+{effectiveQuotas.carryOver.sickLeave} d</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comp-Off / Work From Home */}
                  <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830] flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Comp-Off / WFH
                      </span>
                      <div className="mt-2.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums font-mono">
                          {wfhLeft}
                        </span>
                        <span className="text-xs font-medium text-slate-400">days available</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#282830] text-[11px]">
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Allowance Quota:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">
                          {totalWfh} d / year
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Used / Taken:</span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">{wfhUsed} d</span>
                      </div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Authorization:</span>
                        <span className="font-semibold text-slate-600 dark:text-slate-300">Manager Approval</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: LEAVE APPLICATION HISTORY */}
              <div className="bg-white dark:bg-[#151518] border border-slate-200/80 dark:border-[#282830] rounded-xl p-5 sm:p-6 shadow-2xs text-slate-900 dark:text-white space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#282830]">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Leave Application History
                  </h4>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-medium">Status:</span>
                    <select
                      value={leaveStatusFilter}
                      onChange={(e) => setLeaveStatusFilter(e.target.value)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#282830] bg-slate-50 dark:bg-[#18181d] text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Approved">Approved</option>
                      <option value="Pending">Pending</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="font-bold text-slate-400 dark:text-slate-500 bg-slate-50/70 dark:bg-[#18181d] border-b border-slate-100 dark:border-[#282830]">
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
                          <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-[#18181d]/50 transition-colors">
                            <td className="p-3 pl-4 whitespace-nowrap">
                              <span className="font-bold text-slate-900 dark:text-white">{l.leaveType}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold text-slate-900 dark:text-white font-mono">
                                {l.startDate} to {l.endDate}
                              </span>
                              <span className="ml-1.5 text-blue-600 dark:text-blue-400 font-bold text-[11px]">
                                ({l.daysCount}d)
                              </span>
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={l.reason}>
                              {l.reason}
                            </td>
                            <td className="p-3 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap font-mono">
                              {l.appliedOn || l.startDate || new Date().toISOString().substring(0, 10)}
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-300 text-[11px] whitespace-nowrap">
                              {l.approvedBy || (isInstitution ? 'Staff Lead / Academic Dean' : 'Line Manager')}
                            </td>
                            <td className="p-3 pr-4 text-right whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  l.status === 'Approved'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/40'
                                    : l.status === 'Pending'
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40'
                                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/40'
                                }`}
                              >
                                {l.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {employeeLeaveRecords.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 font-medium text-xs">
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
            <div className="space-y-6">
              {/* Header with Edit Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Salary Structure & Compensation
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
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
                          className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
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
                          className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-xs cursor-pointer"
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
                        className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:text-blue-600 hover:border-blue-300 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        Edit Payroll Structure
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Edit Mode Panel: Interactive Salary & Allowance Builder */}
              {isEditingPayroll ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                  {/* Group & Classification */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
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
                        className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold"
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
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Salary Type *
                      </label>
                      <select
                        value={formSalaryType}
                        onChange={(e) => setFormSalaryType(e.target.value as SalaryType)}
                        className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold"
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
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-slate-900 text-xs block">
                              Group Defaults Available: {matchedGroup.name}
                            </span>
                            <p className="text-[11px] text-slate-500 mt-0.5">
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
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer shadow-xs whitespace-nowrap self-start sm:self-auto"
                          >
                            Apply Group Defaults
                          </button>
                        </div>

                        {/* Group Custom Fields */}
                        {groupCustomFields.length > 0 && (
                          <div className="pt-3 border-t border-slate-200">
                            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide block mb-2">
                              Group Custom Fields & Metadata
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {groupCustomFields.map((field) => (
                                <div key={field.id} className="space-y-1">
                                  <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
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
                                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
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
                                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
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
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Hourly Wage Rate (₹ / hr) *
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={moneyInputValue(formHourlyRate)}
                          onChange={(e) => setFormHourlyRate(parseMoneyInput(e.target.value))}
                          placeholder="0"
                          className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold"
                        />
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-700">
                        <div>
                          <span className="font-bold">Hourly Tracking Active:</span>
                          <p className="text-[11px] text-slate-500 mt-0.5">
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
                          <h4 className="text-xs font-bold text-slate-900">
                            1. Base Pay & Allowances (Earnings)
                          </h4>
                          <span className="text-[11px] text-slate-400">
                            Customizable allowances per company policy
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          {/* Basic Salary */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Basic Salary (₹) *
                              </label>
                              <span className="text-[10px] text-slate-400">Core Pay</span>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formBaseSalary)}
                              onChange={(e) => setFormBaseSalary(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold"
                            />
                          </div>

                          {/* House Rent Allowance (HRA) */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                House Rent Allowance (HRA ₹)
                              </label>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => setFormHra(Math.round(formBaseSalary * 0.4))}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
                                  title="Set to 40% of Basic (Non-Metro)"
                                >
                                  40%
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormHra(Math.round(formBaseSalary * 0.5))}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
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
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold"
                            />
                          </div>

                          {/* Special Allowance */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Special Allowance (₹)
                              </label>
                              <span className="text-[10px] text-slate-400">Balancing Pay</span>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formSpecialAllowance)}
                              onChange={(e) => setFormSpecialAllowance(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold"
                            />
                          </div>

                          {/* Conveyance Allowance */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Conveyance Allowance (₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormConveyanceAllowance(1600)}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
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
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold"
                            />
                          </div>

                          {/* Medical Allowance */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Medical Reimbursement (₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormMedicalAllowance(1250)}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
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
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold"
                            />
                          </div>

                          {/* Other Allowances */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Other Fixed Allowance (₹)
                              </label>
                              <span className="text-[10px] text-slate-400">General</span>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={moneyInputValue(formOtherAllowances)}
                              onChange={(e) => setFormOtherAllowances(parseMoneyInput(e.target.value))}
                              placeholder="0"
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold"
                            />
                          </div>
                        </div>

                        {/* Dynamic Custom Allowances */}
                        <div className="pt-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-slate-700">
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
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                            >
                              + Add Custom Allowance
                            </button>
                          </div>

                          {formCustomAllowances.length === 0 ? (
                            <div className="p-3 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                              No custom allowances added. Click "+ Add Custom Allowance" to add allowances like Remote Work, Food, Shift, or Travel.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {formCustomAllowances.map((alw, index) => (
                                <div
                                  key={alw.id || `form_alw_${index}`}
                                  className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
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
                                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none font-semibold text-slate-900"
                                  />
                                  <div className="relative w-36">
                                    <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">₹</span>
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
                                      className="w-full pl-6 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none font-bold text-slate-900"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormCustomAllowances(formCustomAllowances.filter((_, i) => i !== index));
                                    }}
                                    className="px-2 py-1 text-xs text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
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
                      <div className="space-y-3 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-900">
                            2. Statutory & Tax Deductions
                          </h4>
                          <span className="text-[11px] text-slate-400">
                            Automatic formulas and statutory ceilings
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          {/* PF Deduction */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Employee PF / EPF (₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormPfDeduction(Math.round(Math.min(formBaseSalary, 15000) * 0.12))}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
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
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold"
                            />
                          </div>

                          {/* Professional Tax */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Professional Tax (PT ₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormProfessionalTax(200)}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
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
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold"
                            />
                          </div>

                          {/* Income Tax / TDS */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Tax Withholding (TDS ₹)
                              </label>
                              <button
                                type="button"
                                onClick={() => setFormTaxDeduction(Math.round(formBaseSalary * 0.08))}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
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
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-semibold"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. STATUTORY IDENTIFIERS */}
                  <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-900 mb-3">
                      3. Statutory Identifiers & Tax Codes
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                          className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          PF Universal Account (UAN)
                        </label>
                        <input
                          type="text"
                          maxLength={12}
                          placeholder="e.g. 100918273645"
                          value={formPfUan}
                          onChange={(e) => setFormPfUan(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          ESIC Insurance Number
                        </label>
                        <input
                          type="text"
                          maxLength={17}
                          placeholder="e.g. 31000889210001"
                          value={formEsiNumber}
                          onChange={(e) => setFormEsiNumber(e.target.value.replace(/\D/g, '').slice(0, 17))}
                          className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
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
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Monthly Gross</span>
                          <span className="text-base font-bold text-slate-900">
                            ₹{gross.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Monthly Deductions</span>
                          <span className="text-base font-bold text-slate-700">
                            -₹{deductions.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Net Take-Home</span>
                          <span className="text-base font-bold text-blue-600">
                            ₹{net.toLocaleString('en-IN')} / mo
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Annualized CTC</span>
                          <span className="text-base font-bold text-slate-900">
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
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                            <CreditCard className="w-6 h-6" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">Salary Structure Not Configured</h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
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
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h4 className="text-xs font-bold text-slate-900">
                              Compensation Overview
                            </h4>
                            <span className="text-xs text-slate-400 font-normal">
                              {employee.salaryType === 'hourly'
                                ? 'Hourly Timesheet • Bi-weekly cycle'
                                : employee.salaryType === 'compliance'
                                ? 'Statutory Compliance • Monthly cycle'
                                : 'Monthly Fixed CTC • Monthly cycle'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
                            <div>
                              <span className="text-xs font-medium text-slate-500 block">Net Take-Home Pay</span>
                              <div className="text-2xl font-bold text-blue-600 tracking-tight mt-1 flex items-baseline">
                                <span>
                                  {employee.salaryType === 'hourly'
                                    ? `₹${(employee.hourlyRate || 650).toLocaleString('en-IN')}`
                                    : `₹${net.toLocaleString('en-IN')}`}
                                </span>
                                <span className="text-xs font-normal text-slate-400 ml-1">
                                  {employee.salaryType === 'hourly' ? '/ hr' : '/ mo'}
                                </span>
                              </div>
                            </div>

                            <div>
                              <span className="text-xs font-medium text-slate-500 block">Gross Remuneration</span>
                              <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-baseline">
                                <span>₹{gross.toLocaleString('en-IN')}</span>
                                <span className="text-xs font-normal text-slate-400 ml-1">/ mo</span>
                              </div>
                            </div>

                            <div>
                              <span className="text-xs font-medium text-slate-500 block">Monthly Deductions</span>
                              <div className="text-2xl font-bold text-slate-700 tracking-tight mt-1 flex items-baseline">
                                <span>-₹{deductions.toLocaleString('en-IN')}</span>
                                <span className="text-xs font-normal text-slate-400 ml-1">/ mo</span>
                              </div>
                            </div>

                            <div>
                              <span className="text-xs font-medium text-slate-500 block">Annualized Gross CTC</span>
                              <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-baseline">
                                <span>₹{(gross * 12).toLocaleString('en-IN')}</span>
                                <span className="text-xs font-normal text-slate-400 ml-1">/ yr</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Detailed Remuneration Breakdown: Earnings vs Deductions */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                          {/* 1. Earnings & Allowances Card */}
                          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
                            <div>
                              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                                <h4 className="font-bold text-xs text-slate-900">
                                  Earnings & Allowances
                                </h4>
                                <span className="text-[11px] font-medium text-slate-400">Monthly (₹)</span>
                              </div>
                              <div className="divide-y divide-slate-100 text-xs">
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                  <span className="text-slate-600 font-medium">Basic Salary</span>
                                  <span className="font-semibold text-slate-900">
                                    ₹{basic.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                  <span className="text-slate-600 font-medium">House Rent Allowance (HRA)</span>
                                  <span className="font-medium text-slate-900">
                                    ₹{hra.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                  <span className="text-slate-600 font-medium">Special Allowance</span>
                                  <span className="font-medium text-slate-900">
                                    ₹{special.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                {conv > 0 && (
                                  <div className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                    <span className="text-slate-600 font-medium">Conveyance Allowance</span>
                                    <span className="font-medium text-slate-900">
                                      ₹{conv.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                )}
                                {med > 0 && (
                                  <div className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                    <span className="text-slate-600 font-medium">Medical Reimbursement</span>
                                    <span className="font-medium text-slate-900">
                                      ₹{med.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                )}
                                {other > 0 && (
                                  <div className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                    <span className="text-slate-600 font-medium">Other Allowances</span>
                                    <span className="font-medium text-slate-900">
                                      ₹{other.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                )}
                                {customItems.map((alw, idx) => (
                                  <div key={alw.id || `alw_${idx}_${alw.name}`} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                    <span className="text-slate-600 font-medium">
                                      {alw.name}
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      ₹{Number(alw.amount).toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between font-bold text-xs">
                              <span className="text-slate-900">Gross Remuneration (A)</span>
                              <span className="text-slate-900 text-sm font-bold">
                                ₹{gross.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>

                          {/* 2. Deductions Card */}
                          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
                            <div>
                              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                                <h4 className="font-bold text-xs text-slate-900">
                                  Statutory & Tax Deductions
                                </h4>
                                <span className="text-[11px] font-medium text-slate-400">Monthly (₹)</span>
                              </div>
                              <div className="divide-y divide-slate-100 text-xs">
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                  <div>
                                    <span className="text-slate-600 font-medium block">
                                      Employees' Provident Fund (EPF)
                                    </span>
                                    <span className="text-[10px] text-slate-400">12% on statutory basic</span>
                                  </div>
                                  <span className="font-semibold text-slate-900">
                                    ₹{pf.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                  <div>
                                    <span className="text-slate-600 font-medium block">
                                      Professional Tax (PT)
                                    </span>
                                    <span className="text-[10px] text-slate-400">State employment tax</span>
                                  </div>
                                  <span className="font-medium text-slate-900">
                                    ₹{pt.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                  <div>
                                    <span className="text-slate-600 font-medium block">
                                      Tax Deducted at Source (TDS)
                                    </span>
                                    <span className="text-[10px] text-slate-400">Income tax withholding</span>
                                  </div>
                                  <span className="font-medium text-slate-900">
                                    ₹{tax.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between font-bold text-xs">
                              <span className="text-slate-900">Total Deductions (B)</span>
                              <span className="text-slate-900 text-sm font-bold">
                                -₹{deductions.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Statutory Identifiers Card */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-bold text-slate-900">
                              Statutory & Account Identifiers
                            </h4>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={handleOpenBankDetailsModal}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                                title="Edit bank details"
                              >
                                <Edit2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">PAN / Tax ID</span>
                              <span className="font-medium text-slate-800">
                                {employee.panNumber || employee.personalTaxId || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">PF UAN Number</span>
                              <span className="font-medium text-slate-800">
                                {employee.pfUanNumber || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">ESIC Insurance No</span>
                              <span className="font-medium text-slate-800">
                                {employee.esiNumber || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">Salary Bank Account</span>
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
                                    className="font-medium text-slate-800 hover:text-blue-700 text-left cursor-pointer underline-offset-2 hover:underline"
                                  >
                                    {masked}
                                  </button>
                                ) : (
                                  <span className="font-medium text-slate-800">{masked}</span>
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
                            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                <h4 className="text-xs font-bold text-slate-900">
                                  Assigned Pay Group
                                </h4>
                                <span className="text-xs font-semibold text-slate-700">
                                  {assignedPg?.name || 'Direct Individual Structure'}
                                </span>
                              </div>

                              {customFields.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                                  {customFields.map((f, fIdx) => (
                                    <div key={f.id || `cf_${fIdx}`} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                        {f.label}
                                      </span>
                                      <span className="font-semibold text-xs text-slate-800 block mt-0.5">
                                        {customFieldVals[f.id] || f.defaultValue || '—'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400">
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
            <div className="space-y-6">
              {/* Section 1: Upload Dropzone (HR/Admin) or Document list */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Personal & Verified Documents</h3>
                  {canEdit && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Document</span>
                    </button>
                  )}
                </div>

                {canEdit && (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      isDragging ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/60'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => handleFileUpload(e.target.files)}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    />
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="text-xs font-bold text-slate-800">Drag & drop files here to upload, or click to browse</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Supports PDF, DOCX, JPG, PNG up to 25MB</p>
                  </div>
                )}

                {/* Uploaded Documents List */}
                <div className="space-y-2 pt-2">
                  {employee.personalDocuments && employee.personalDocuments.length > 0 ? (
                    employee.personalDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-white text-blue-600 border border-slate-200/80 flex items-center justify-center font-bold text-xs shadow-2xs">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-xs text-slate-900">{doc.name}</p>
                            <p className="text-[11px] text-slate-400">
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
                            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
                            title="Download Document"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleDeletePersonalDoc(doc.id)}
                              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-xs font-medium">
                      No personal documents uploaded yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Payslips Table */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Issued Payslips</h3>
                  {canEdit && (
                    <button
                      onClick={() => setShowAddPayslipModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Issue Payslip</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="font-bold text-slate-400 bg-slate-50 border-b border-slate-100">
                        <th className="p-3 rounded-l-xl">Pay Period</th>
                        <th className="p-3">File Name</th>
                        <th className="p-3">Net Disbursed</th>
                        <th className="p-3 text-right rounded-r-xl">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(employee.payslipDocuments || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-xs text-slate-400 font-medium">
                            No payslip documents issued yet.
                          </td>
                        </tr>
                      ) : (
                        (employee.payslipDocuments || []).map((ps) => (
                          <tr key={ps.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-bold text-slate-900">{ps.period}</td>
                            <td className="p-3 font-mono text-slate-600">{ps.name}</td>
                            <td className="p-3 font-mono font-bold text-emerald-600">{ps.amount}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setPayslipToPrint(ps)}
                                  className="px-3 py-1 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold transition-colors cursor-pointer"
                                >
                                  Print
                                </button>
                                {canEdit && (
                                  <button
                                    onClick={() => handleDeletePayslip(ps.id)}
                                    className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
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
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Assigned Hardware & Assets</h3>
                </div>

                <div className="space-y-2.5 pt-1">
                  {(employee.assignedAssets || []).length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200 rounded-2xl">
                      No hardware assets assigned yet.
                    </div>
                  ) : (
                    (employee.assignedAssets || []).map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-100 bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                          {asset.type === 'laptop' && <Laptop className="w-4 h-4" />}
                          {asset.type === 'monitor' && <Monitor className="w-4 h-4" />}
                          {asset.type === 'smartphone' && <Smartphone className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-bold text-xs text-slate-900">{asset.name}</p>
                          <p className="text-[11px] text-slate-400">
                            S/N: {asset.serial} • Allocated on {asset.assignedDate}
                          </p>
                        </div>
                      </div>

                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
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
            <div className="space-y-6">
              {/* Account Settings */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Account Preferences</h3>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditingAccountSettings(!isEditingAccountSettings)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  )}
                </div>

                {!isEditingAccountSettings ? (
                  <div className="flex items-center justify-between text-xs py-2">
                    <span className="text-slate-400 font-semibold">Configured Timezone</span>
                    <span className="font-bold text-slate-900">{formTimezone || '—'}</span>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs pt-1">
                    <label className="block text-slate-700 font-bold">Timezone</label>
                    <select
                      value={formTimezone}
                      onChange={(e) => setFormTimezone(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 font-semibold outline-none focus:border-slate-900 cursor-pointer text-xs"
                    >
                      <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST) GMT +05:30</option>
                      <option value="America/New_York (EST)">America/New_York (EST) GMT -05:00</option>
                      <option value="Europe/London (BST)">Europe/London (BST) GMT +00:00</option>
                      <option value="Asia/Singapore (SGT)">Asia/Singapore (SGT) GMT +08:00</option>
                    </select>
                    <div className="flex justify-end gap-2.5 pt-2">
                      <button
                        onClick={() => setIsEditingAccountSettings(false)}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 cursor-pointer text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingAccountSettings(false);
                          showToast('Timezone preference updated');
                        }}
                        className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer text-xs shadow-xs"
                      >
                        Save Preferences
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Privacy */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs text-slate-900 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Calendar & Privacy</h3>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-1">
                  <span className="text-slate-700 font-bold">
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
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-slate-900 font-semibold outline-none focus:border-slate-900 cursor-pointer appearance-none shadow-2xs text-xs disabled:bg-slate-50 disabled:cursor-not-allowed"
                    >
                      <option value="Everyone">Everyone</option>
                      <option value="Department">Department Only</option>
                      <option value="Managers">Managers Only</option>
                      <option value="Only Me">Only Me</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
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
      {showBankDetailsModal && canEdit && (
        <SlideOverDrawer
          title="Salary Bank Details"
          onClose={() => !savingBankDetails && setShowBankDetailsModal(false)}
        >
            <form onSubmit={handleSaveBankDetails} className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className={slideOverBodyClass}>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Account holder name</label>
                <input
                  type="text"
                  required
                  value={formAccountHolderName}
                  onChange={(e) => setFormAccountHolderName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Bank name</label>
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
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs cursor-pointer"
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
                    className="w-full mt-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                  />
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Account number</label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={18}
                  value={formAccountNumber}
                  onChange={(e) => setFormAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))}
                  placeholder="e.g. 50100234567890"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">IFSC / routing code</label>
                <input
                  type="text"
                  required
                  maxLength={11}
                  value={formIfscCode}
                  onChange={(e) =>
                    setFormIfscCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))
                  }
                  placeholder="e.g. HDFC0001234"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs uppercase"
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
                <label className="block text-slate-700 font-bold mb-1">Effective Date</label>
                <input
                  type="date"
                  required
                  value={newJtEffectiveDate}
                  onChange={(e) => setNewJtEffectiveDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Job Title</label>
                <input
                  type="text"
                  required
                  value={newJtJobTitle}
                  onChange={(e) => setNewJtJobTitle(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Position Type</label>
                  <input
                    type="text"
                    value={newJtPositionType}
                    onChange={(e) => setNewJtPositionType(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Employment Type</label>
                  <input
                    type="text"
                    value={newJtEmploymentType}
                    onChange={(e) => setNewJtEmploymentType(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Reporting Lead / Manager</label>
                <input
                  type="text"
                  value={newJtLineManager}
                  onChange={(e) => setNewJtLineManager(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
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
                  <label className="block text-slate-700 font-bold mb-1">Contract #</label>
                  <input
                    type="text"
                    required
                    value={newCtNumber}
                    onChange={(e) => setNewCtNumber(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-mono font-medium text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Contract Type</label>
                  <input
                    type="text"
                    required
                    value={newCtType}
                    onChange={(e) => setNewCtType(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Contract Name</label>
                <input
                  type="text"
                  required
                  value={newCtName}
                  onChange={(e) => setNewCtName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={newCtStartDate}
                    onChange={(e) => setNewCtStartDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">End Date</label>
                  <input
                    type="text"
                    value={newCtEndDate}
                    onChange={(e) => setNewCtEndDate(e.target.value)}
                    placeholder="Indefinite"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
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
                <label className="block text-slate-700 font-bold mb-1">Document File Name</label>
                <input
                  type="text"
                  required
                  value={newPsName}
                  onChange={(e) => setNewPsName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-mono font-medium text-slate-900 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Pay Period</label>
                  <input
                    type="text"
                    required
                    value={newPsPeriod}
                    onChange={(e) => setNewPsPeriod(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Payment Amount</label>
                  <input
                    type="text"
                    required
                    value={newPsAmount}
                    onChange={(e) => setNewPsAmount(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-mono font-medium text-slate-900 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Disbursed Date</label>
                <input
                  type="text"
                  value={newPsDate}
                  onChange={(e) => setNewPsDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-slate-900 font-medium text-slate-900 text-xs"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Employment Status</label>
                <select
                  value={statusChoice}
                  onChange={(e) => setStatusChoice(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 font-semibold outline-none focus:border-slate-400 cursor-pointer"
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
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3 text-xs">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Notice Duration</label>
                    <select
                      value={statusNoticeDays}
                      onChange={(e) => {
                        const days = Number(e.target.value);
                        setStatusNoticeDays(days);
                        const d = new Date();
                        d.setDate(d.getDate() + days);
                        setStatusNoticeEndDate(d.toISOString().split('T')[0]);
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 font-medium cursor-pointer"
                    >
                      <option value={15}>15 Days</option>
                      <option value={30}>30 Days (Standard 1 Month)</option>
                      <option value={60}>60 Days (2 Months)</option>
                      <option value={90}>90 Days (3 Months)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Last Working Day / End Date</label>
                    <input
                      type="date"
                      value={statusNoticeEndDate}
                      onChange={(e) => setStatusNoticeEndDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 font-medium cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {statusChoice === 'Probation' && (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3 text-xs">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Probation Duration</label>
                    <select
                      value={statusProbationMonths}
                      onChange={(e) => {
                        const m = Number(e.target.value);
                        setStatusProbationMonths(m);
                        const d = new Date();
                        d.setMonth(d.getMonth() + m);
                        setStatusProbationEndDate(d.toISOString().split('T')[0]);
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 font-medium cursor-pointer"
                    >
                      <option value={1}>1 Month</option>
                      <option value={2}>2 Months</option>
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Probation Review Date</label>
                    <input
                      type="date"
                      value={statusProbationEndDate}
                      onChange={(e) => setStatusProbationEndDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 font-medium cursor-pointer"
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
    </div>
  );
};
