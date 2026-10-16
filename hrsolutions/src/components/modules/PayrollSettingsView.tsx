'use client';

import React, { useState, useMemo } from 'react';
import { AppState } from '@/services/store';
import { api } from '@/services/apiClient';
import { SettingsToast } from './settings/SettingsToast';
import { SlideOverDrawer } from '@/components/common/SlideOverDrawer';
import {
  DEFAULT_ATTENDANCE_PAY,
  PayrollGroup,
  PayrollSettings,
  SalaryType,
  SalaryComponentDefinition,
  Employee,
  GroupAllowanceItem,
  GroupDeductionItem,
  GroupCustomField,
} from '@/types';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  Building2,
  Users,
  Settings,
  Layers,
  Percent,
  DollarSign,
  ShieldCheck,
  Calendar,
  Clock,
  Sparkles,
  HelpCircle,
  ChevronDown,
  Sliders,
  FileText,
  RefreshCw,
  Eye,
  Info,
} from 'lucide-react';
import {
  initialPayrollGroups,
  initialPayrollSettings,
  initialSalaryComponents,
} from '@/data/initialData';

interface PayrollSettingsViewProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onBackToPayroll?: () => void;
}

export const PayrollSettingsView: React.FC<PayrollSettingsViewProps> = ({
  state,
  onUpdateState,
  onBackToPayroll,
}) => {
  const [activeTab, setActiveTab] = useState<
    'groups' | 'salary_types' | 'general_settings' | 'compliance' | 'components'
  >('groups');

  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const payrollGroups: PayrollGroup[] = useMemo(() => {
    return state.customOptions?.payrollGroups || initialPayrollGroups;
  }, [state.customOptions?.payrollGroups]);

  const payrollSettings: PayrollSettings = useMemo(() => {
    return state.customOptions?.payrollSettings || initialPayrollSettings;
  }, [state.customOptions?.payrollSettings]);

  const salaryComponents: SalaryComponentDefinition[] = useMemo(() => {
    return state.customOptions?.salaryComponents || initialSalaryComponents;
  }, [state.customOptions?.salaryComponents]);

  // Search & Filter for Payroll Groups
  const [groupSearch, setGroupSearch] = useState('');
  const [groupTypeFilter, setGroupTypeFilter] = useState<'all' | SalaryType>('all');

  const filteredGroups = useMemo(() => {
    return payrollGroups.filter((g) => {
      const matchSearch =
        g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
        g.code.toLowerCase().includes(groupSearch.toLowerCase()) ||
        g.description.toLowerCase().includes(groupSearch.toLowerCase());
      const matchType = groupTypeFilter === 'all' || g.salaryType === groupTypeFilter;
      return matchSearch && matchType;
    });
  }, [payrollGroups, groupSearch, groupTypeFilter]);

  // Modal / Drawer state for creating or editing Payroll Group
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupModalTab, setGroupModalTab] = useState<
    'details' | 'structure' | 'allowances' | 'deductions' | 'custom_fields'
  >('details');

  // Group Form Data with Full Allowances, Deductions & Custom Fields
  const [groupForm, setGroupForm] = useState<{
    name: string;
    code: string;
    description: string;
    salaryType: SalaryType;
    payFrequency: 'Monthly' | 'Bi-Weekly' | 'Weekly' | 'Semi-Monthly';
    payDay: number;
    currency: string;
    standardHoursPerDay: number;
    workingDaysPerMonth: number;
    overtimeMultiplier: number;
    baseSalaryDefault: number;
    hraDefault: number;
    specialAllowanceDefault: number;
    conveyanceAllowanceDefault: number;
    medicalAllowanceDefault: number;
    defaultAllowances: GroupAllowanceItem[];
    defaultDeductions: GroupDeductionItem[];
    customFields: GroupCustomField[];
    enableEPF: boolean;
    enableESIC: boolean;
    enableProfessionalTax: boolean;
    professionalTaxAmount: number;
    enableGratuity: boolean;
    enableTDS: boolean;
    assignedEmployeeIds: string[];
    status: 'active' | 'inactive';
  }>({
    name: '',
    code: '',
    description: '',
    salaryType: 'monthly',
    payFrequency: 'Monthly',
    payDay: 30,
    currency: 'INR',
    standardHoursPerDay: 8,
    workingDaysPerMonth: 22,
    overtimeMultiplier: 1.5,
    baseSalaryDefault: 75000,
    hraDefault: 25000,
    specialAllowanceDefault: 15000,
    conveyanceAllowanceDefault: 2000,
    medicalAllowanceDefault: 1500,
    defaultAllowances: [],
    defaultDeductions: [],
    customFields: [],
    enableEPF: false,
    enableESIC: false,
    enableProfessionalTax: false,
    professionalTaxAmount: 200,
    enableGratuity: false,
    enableTDS: true,
    assignedEmployeeIds: [],
    status: 'active',
  });

  // Assign Members Modal State
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedGroupForMembers, setSelectedGroupForMembers] = useState<PayrollGroup | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // Salary Components & Allowances Registry State
  const [showComponentModal, setShowComponentModal] = useState(false);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [componentSearch, setComponentSearch] = useState('');
  const [componentTypeFilter, setComponentTypeFilter] = useState<'all' | 'earning' | 'deduction' | 'statutory'>('all');
  const [componentForm, setComponentForm] = useState<SalaryComponentDefinition>({
    id: '',
    name: '',
    code: '',
    type: 'earning',
    calculationType: 'fixed',
    value: 0,
    taxable: true,
    isStatutory: false,
    isActive: true,
    description: '',
  });

  const filteredComponents = useMemo(() => {
    return salaryComponents.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(componentSearch.toLowerCase()) ||
        c.code.toLowerCase().includes(componentSearch.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(componentSearch.toLowerCase());
      const matchType = componentTypeFilter === 'all' || c.type === componentTypeFilter;
      return matchSearch && matchType;
    });
  }, [salaryComponents, componentSearch, componentTypeFilter]);

  // General Settings State
  const [settingsForm, setSettingsForm] = useState<PayrollSettings>(() => ({
    ...payrollSettings,
    attendancePay: { ...DEFAULT_ATTENDANCE_PAY, ...(payrollSettings.attendancePay || {}) },
  }));

  // Live Gross-to-Net Simulator State (Rupees)
  const [simSalaryType, setSimSalaryType] = useState<SalaryType>('monthly');
  const [simBaseOrCtc, setSimBaseOrCtc] = useState<number>(75000);
  const [simHourlyRate, setSimHourlyRate] = useState<number>(650);
  const [simLoggedHours, setSimLoggedHours] = useState<number>(160);
  const [simOvertimeHours, setSimOvertimeHours] = useState<number>(10);

  // Simulator Calculation Engine (Rupees)
  const simResults = useMemo(() => {
    if (simSalaryType === 'hourly') {
      const regularPay = simHourlyRate * Math.min(simLoggedHours, 160);
      const overtimeRate = simHourlyRate * 1.5;
      const overtimePay = overtimeRate * simOvertimeHours;
      const gross = regularPay + overtimePay;
      const tds = Math.round(gross * 0.1);
      const totalDeductions = tds;
      const netPay = gross - totalDeductions;

      return {
        gross,
        basic: regularPay,
        hra: 0,
        special: 0,
        overtimePay,
        epfEmployee: 0,
        epfEmployer: 0,
        esicEmployee: 0,
        esicEmployer: 0,
        pt: 0,
        tds,
        totalDeductions,
        netPay,
      };
    } else if (simSalaryType === 'compliance') {
      const ctc = simBaseOrCtc;
      const basic = Math.round(ctc * 0.5);
      const hra = Math.round(basic * 0.4);
      const statutoryBonus = Math.round(basic * 0.0833);
      const special = Math.max(0, ctc - basic - hra - statutoryBonus);
      const gross = basic + hra + statutoryBonus + special;

      const epfBase = Math.min(basic, 15000);
      const epfEmployee = Math.round(epfBase * 0.12);
      const epfEmployer = epfEmployee;
      const isEsicEligible = gross <= 21000;
      const esicEmployee = isEsicEligible ? Math.round(gross * 0.0075) : 0;
      const esicEmployer = isEsicEligible ? Math.round(gross * 0.0325) : 0;
      const pt = 200;
      const tds = Math.round(gross * 0.08);
      const totalDeductions = epfEmployee + esicEmployee + pt + tds;
      const netPay = gross - totalDeductions;

      return {
        gross,
        basic,
        hra,
        special,
        overtimePay: 0,
        epfEmployee,
        epfEmployer,
        esicEmployee,
        esicEmployer,
        pt,
        tds,
        totalDeductions,
        netPay,
      };
    } else {
      // Monthly Fixed CTC
      const base = Math.round(simBaseOrCtc * 0.6);
      const hra = Math.round(base * 0.4);
      const special = Math.max(0, simBaseOrCtc - base - hra);
      const gross = simBaseOrCtc;

      const epf = Math.round(Math.min(base, 15000) * 0.12);
      const pt = 200;
      const tds = Math.round(gross * 0.08);
      const totalDeductions = epf + pt + tds;
      const netPay = gross - totalDeductions;

      return {
        gross,
        basic: base,
        hra,
        special,
        overtimePay: 0,
        epfEmployee: epf,
        epfEmployer: epf,
        esicEmployee: 0,
        esicEmployer: 0,
        pt,
        tds,
        totalDeductions,
        netPay,
      };
    }
  }, [simSalaryType, simBaseOrCtc, simHourlyRate, simLoggedHours, simOvertimeHours]);

  // Group Allowance Handlers
  const handleAddGroupAllowance = (preset?: Partial<GroupAllowanceItem>) => {
    const newAllowance: GroupAllowanceItem = {
      id: `alw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: preset?.name || '',
      type: preset?.type || 'fixed',
      amount: preset?.amount || 2500,
      taxable: preset?.taxable ?? true,
      frequency: preset?.frequency || 'Monthly',
      description: preset?.description || '',
    };
    setGroupForm((prev) => ({
      ...prev,
      defaultAllowances: [...prev.defaultAllowances, newAllowance],
    }));
  };

  const handleUpdateGroupAllowance = (id: string, updates: Partial<GroupAllowanceItem>) => {
    setGroupForm((prev) => ({
      ...prev,
      defaultAllowances: prev.defaultAllowances.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
  };

  const handleRemoveGroupAllowance = (id: string) => {
    setGroupForm((prev) => ({
      ...prev,
      defaultAllowances: prev.defaultAllowances.filter((a) => a.id !== id),
    }));
  };

  // Group Deduction Handlers
  const handleAddGroupDeduction = (preset?: Partial<GroupDeductionItem>) => {
    const newDed: GroupDeductionItem = {
      id: `ded_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: preset?.name || '',
      type: preset?.type || 'fixed',
      amount: preset?.amount || 1000,
      isStatutory: preset?.isStatutory || false,
      description: preset?.description || '',
    };
    setGroupForm((prev) => ({
      ...prev,
      defaultDeductions: [...prev.defaultDeductions, newDed],
    }));
  };

  const handleUpdateGroupDeduction = (id: string, updates: Partial<GroupDeductionItem>) => {
    setGroupForm((prev) => ({
      ...prev,
      defaultDeductions: prev.defaultDeductions.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    }));
  };

  const handleRemoveGroupDeduction = (id: string) => {
    setGroupForm((prev) => ({
      ...prev,
      defaultDeductions: prev.defaultDeductions.filter((d) => d.id !== id),
    }));
  };

  // Group Custom Field Handlers
  const handleAddGroupCustomField = (preset?: Partial<GroupCustomField>) => {
    const newField: GroupCustomField = {
      id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: preset?.label || 'New Field',
      fieldType: preset?.fieldType || 'text',
      defaultValue: preset?.defaultValue || '',
      required: preset?.required || false,
      options: preset?.options || ['Option 1', 'Option 2'],
      description: preset?.description || '',
    };
    setGroupForm((prev) => ({
      ...prev,
      customFields: [...prev.customFields, newField],
    }));
  };

  const handleUpdateGroupCustomField = (id: string, updates: Partial<GroupCustomField>) => {
    setGroupForm((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    }));
  };

  const handleRemoveGroupCustomField = (id: string) => {
    setGroupForm((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((f) => f.id !== id),
    }));
  };

  const handleOpenCreateGroup = () => {
    setEditingGroupId(null);
    setGroupModalTab('details');
    setGroupForm({
      name: '',
      code: `PG-${Math.floor(10 + Math.random() * 90)}`,
      description: '',
      salaryType: 'monthly',
      payFrequency: 'Monthly',
      payDay: 30,
      currency: 'INR',
      standardHoursPerDay: 8,
      workingDaysPerMonth: 22,
      overtimeMultiplier: 1.5,
      baseSalaryDefault: 75000,
      hraDefault: 25000,
      specialAllowanceDefault: 15000,
      conveyanceAllowanceDefault: 2000,
      medicalAllowanceDefault: 1500,
      defaultAllowances: [
        { id: `alw_${Date.now()}_1`, name: 'Remote Work Allowance', type: 'fixed', amount: 3000, taxable: true, frequency: 'Monthly' },
        { id: `alw_${Date.now()}_2`, name: 'Meal / Food Voucher', type: 'fixed', amount: 2200, taxable: false, frequency: 'Monthly' },
      ],
      defaultDeductions: [
        { id: `ded_${Date.now()}_1`, name: 'Group Health Insurance', type: 'fixed', amount: 1200, isStatutory: false },
      ],
      customFields: [
        { id: `cf_${Date.now()}_1`, label: 'Cost Center Code', fieldType: 'text', defaultValue: 'CC-GEN-01', required: true },
        { id: `cf_${Date.now()}_2`, label: 'Tax Region', fieldType: 'select', defaultValue: 'Default', options: ['Default', 'North / NCR', 'South / BLR', 'West / MUM'], required: false },
      ],
      enableEPF: false,
      enableESIC: false,
      enableProfessionalTax: false,
      professionalTaxAmount: 200,
      enableGratuity: false,
      enableTDS: true,
      assignedEmployeeIds: [],
      status: 'active',
    });
    setShowGroupModal(true);
  };

  const handleOpenEditGroup = (group: PayrollGroup) => {
    setEditingGroupId(group.id);
    setGroupModalTab('details');
    setGroupForm({
      name: group.name,
      code: group.code,
      description: group.description,
      salaryType: group.salaryType,
      payFrequency: group.payFrequency,
      payDay: Number(group.payDay) || 30,
      currency: group.currency || 'INR',
      standardHoursPerDay: group.standardHoursPerDay,
      workingDaysPerMonth: group.workingDaysPerMonth,
      overtimeMultiplier: group.overtimeMultiplier,
      baseSalaryDefault: group.baseSalaryDefault ?? 75000,
      hraDefault: group.hraDefault ?? 25000,
      specialAllowanceDefault: group.specialAllowanceDefault ?? 15000,
      conveyanceAllowanceDefault: group.conveyanceAllowanceDefault ?? 2000,
      medicalAllowanceDefault: group.medicalAllowanceDefault ?? 1500,
      defaultAllowances: group.defaultAllowances ? [...group.defaultAllowances] : [],
      defaultDeductions: group.defaultDeductions ? [...group.defaultDeductions] : [],
      customFields: group.customFields ? [...group.customFields] : [],
      enableEPF: group.complianceRules?.enableEPF || false,
      enableESIC: group.complianceRules?.enableESIC || false,
      enableProfessionalTax: group.complianceRules?.enableProfessionalTax || false,
      professionalTaxAmount: group.complianceRules?.professionalTaxAmount || 200,
      enableGratuity: group.complianceRules?.enableGratuity || false,
      enableTDS: group.complianceRules?.enableTDS ?? true,
      assignedEmployeeIds: group.assignedEmployeeIds || [],
      status: group.status,
    });
    setShowGroupModal(true);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;

    setIsSaving(true);
    try {
      let updatedList = payrollGroups;

      if (editingGroupId) {
        updatedList = payrollGroups.map((g) => {
          if (g.id !== editingGroupId) return g;
          return {
            ...g,
            name: groupForm.name.trim(),
            code: groupForm.code.trim() || g.code,
            description: groupForm.description.trim(),
            salaryType: groupForm.salaryType,
            payFrequency: groupForm.payFrequency,
            payDay: Number(groupForm.payDay) || g.payDay,
            standardHoursPerDay: Number(groupForm.standardHoursPerDay) || g.standardHoursPerDay,
            workingDaysPerMonth: Number(groupForm.workingDaysPerMonth) || g.workingDaysPerMonth,
            overtimeMultiplier: Number(groupForm.overtimeMultiplier) || g.overtimeMultiplier,
            baseSalaryDefault: groupForm.baseSalaryDefault,
            hraDefault: groupForm.hraDefault,
            specialAllowanceDefault: groupForm.specialAllowanceDefault,
            conveyanceAllowanceDefault: groupForm.conveyanceAllowanceDefault,
            medicalAllowanceDefault: groupForm.medicalAllowanceDefault,
            defaultAllowances: groupForm.defaultAllowances,
            defaultDeductions: groupForm.defaultDeductions,
            customFields: groupForm.customFields,
            complianceRules: {
              ...g.complianceRules,
              enableEPF: groupForm.enableEPF,
              enableESIC: groupForm.enableESIC,
              enableProfessionalTax: groupForm.enableProfessionalTax,
              professionalTaxAmount: groupForm.professionalTaxAmount,
              enableGratuity: groupForm.enableGratuity,
              enableTDS: groupForm.enableTDS,
            },
            status: groupForm.status,
            updatedAt: new Date().toISOString().split('T')[0],
          };
        });
      } else {
        const newGroup: PayrollGroup = {
          id: `pg_${Date.now()}`,
          name: groupForm.name.trim(),
          code: groupForm.code.trim() || `PG-${Date.now().toString().slice(-4)}`,
          description: groupForm.description.trim(),
          salaryType: groupForm.salaryType,
          payFrequency: groupForm.payFrequency,
          payDay: Number(groupForm.payDay) || 30,
          currency: 'INR',
          standardHoursPerDay: Number(groupForm.standardHoursPerDay) || 8,
          workingDaysPerMonth: Number(groupForm.workingDaysPerMonth) || 22,
          overtimeMultiplier: Number(groupForm.overtimeMultiplier) || 1.5,
          baseSalaryDefault: groupForm.baseSalaryDefault,
          hraDefault: groupForm.hraDefault,
          specialAllowanceDefault: groupForm.specialAllowanceDefault,
          conveyanceAllowanceDefault: groupForm.conveyanceAllowanceDefault,
          medicalAllowanceDefault: groupForm.medicalAllowanceDefault,
          defaultAllowances: groupForm.defaultAllowances,
          defaultDeductions: groupForm.defaultDeductions,
          customFields: groupForm.customFields,
          complianceRules: {
            enableEPF: groupForm.enableEPF,
            epfEmployeeRate: 12,
            epfEmployerRate: 12,
            epfWageCeilingLimit: 15000,
            enableESIC: groupForm.enableESIC,
            esicEmployeeRate: 0.75,
            esicEmployerRate: 3.25,
            esicGrossWageLimit: 21000,
            enableProfessionalTax: groupForm.enableProfessionalTax,
            professionalTaxAmount: groupForm.professionalTaxAmount,
            enableGratuity: groupForm.enableGratuity,
            gratuityRate: 4.81,
            enableTDS: groupForm.enableTDS,
            tdsRegime: 'new_regime',
          },
          assignedEmployeeIds: [],
          status: groupForm.status,
          createdAt: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString().split('T')[0],
        };
        updatedList = [...payrollGroups, newGroup];
      }

      await api.setup.savePayrollSettings({
        payrollGroups: updatedList,
      });

      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          payrollGroups: updatedList,
        },
      }));
      showToast(editingGroupId ? `Payroll group "${groupForm.name}" updated` : `Payroll group created`);
      setShowGroupModal(false);
    } catch (e) {
      console.error('Failed to save payroll group', e);
      showToast('Failed to save payroll group');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (payrollGroups.length <= 1) {
      showToast('Cannot delete the last remaining payroll group');
      return;
    }
    
    setIsSaving(true);
    try {
      const updated = payrollGroups.filter((g) => g.id !== groupId);
      await api.setup.savePayrollSettings({
        payrollGroups: updated,
      });

      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          payrollGroups: updated,
        },
      }));
      showToast(`Payroll group "${groupName}" removed`);
    } catch (e) {
      console.error('Failed to delete payroll group', e);
      showToast('Failed to delete payroll group');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenMembersModal = (group: PayrollGroup) => {
    setSelectedGroupForMembers(group);
    setShowMembersModal(true);
  };

  const handleToggleEmployeeInGroup = async (empId: string) => {
    if (!selectedGroupForMembers) return;
    const currentList = selectedGroupForMembers.assignedEmployeeIds || [];
    const isAssigned = currentList.includes(empId);
    const nextList = isAssigned
      ? currentList.filter((id) => id !== empId)
      : [...currentList, empId];

    const updatedGroups = payrollGroups.map((g) => {
      if (g.id === selectedGroupForMembers.id) {
        return { ...g, assignedEmployeeIds: nextList };
      }
      if (!isAssigned) {
        return {
          ...g,
          assignedEmployeeIds: (g.assignedEmployeeIds || []).filter((id) => id !== empId),
        };
      }
      return g;
    });

    const targetEmp = state.employees.find((e) => e.id === empId);
    if (!targetEmp) return;

    setIsSaving(true);
    try {
      const newSalaryType = !isAssigned ? selectedGroupForMembers.salaryType : targetEmp.salaryType;
      
      // Update Employee
      await api.identity.updateEmployee(empId, {
        ...targetEmp,
        payrollGroupId: !isAssigned ? selectedGroupForMembers.id : undefined,
      } as any);

      // Update Payroll Settings to persist the group assignments
      await api.setup.savePayrollSettings({
        payrollGroups: updatedGroups,
      });

      const updatedEmployees = state.employees.map((emp) => {
        if (emp.id === empId) {
          return {
            ...emp,
            payrollGroupId: !isAssigned ? selectedGroupForMembers.id : undefined,
            salaryType: newSalaryType,
          };
        }
        return emp;
      });

      onUpdateState((prev) => ({
        ...prev,
        employees: updatedEmployees,
        customOptions: {
          ...prev.customOptions,
          payrollGroups: updatedGroups,
        },
      }));

      setSelectedGroupForMembers((prev) => (prev ? { ...prev, assignedEmployeeIds: nextList } : null));
    } catch (e) {
      console.error('Failed to map employee', e);
      showToast('Failed to map employee');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGeneralSettings = async () => {
    setIsSaving(true);
    try {
      const updatedSettings: PayrollSettings = {
        ...settingsForm,
        defaultCurrency: settingsForm.defaultCurrency || 'INR',
        attendancePay: {
          ...DEFAULT_ATTENDANCE_PAY,
          ...(settingsForm.attendancePay || {}),
        },
      };
      await api.setup.savePayrollSettings({
        payrollSettings: updatedSettings,
      });
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          payrollSettings: updatedSettings,
        },
      }));
      showToast('Payroll Settings Saved Successfully');
    } catch (e) {
      console.error('Failed to save general settings', e);
      showToast('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenCreateComponent = () => {
    setEditingComponentId(null);
    setComponentForm({
      id: `comp_${Date.now()}`,
      name: '',
      code: '',
      type: 'earning',
      calculationType: 'fixed',
      value: 0,
      taxable: true,
      isStatutory: false,
      isActive: true,
      description: '',
    });
    setShowComponentModal(true);
  };

  const handleOpenEditComponent = (comp: SalaryComponentDefinition) => {
    setEditingComponentId(comp.id);
    setComponentForm({ ...comp });
    setShowComponentModal(true);
  };

  const handleSaveComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!componentForm.name.trim() || !componentForm.code.trim()) return;

    const formattedCode = componentForm.code.trim().toUpperCase().replace(/\s+/g, '_');
    const updatedForm: SalaryComponentDefinition = {
      ...componentForm,
      name: componentForm.name.trim(),
      code: formattedCode,
      value: Number(componentForm.value) || 0,
      description: componentForm.description.trim(),
    };

    const updated = editingComponentId
      ? salaryComponents.map((c) => (c.id === editingComponentId ? updatedForm : c))
      : [...salaryComponents, { ...updatedForm, id: updatedForm.id || `comp_${Date.now()}` }];

    setIsSaving(true);
    try {
      await api.setup.savePayrollSettings({
        salaryComponents: updated,
      });

      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          salaryComponents: updated,
        },
      }));

      setShowComponentModal(false);
      showToast(editingComponentId ? `Component "${updatedForm.name}" updated` : `Component "${updatedForm.name}" added`);
    } catch (e) {
      console.error('Failed to save component', e);
      showToast('Failed to save component');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteComponent = async (comp: SalaryComponentDefinition) => {
    if (comp.isStatutory) {
      alert('Statutory components are mandated by payroll regulation and cannot be deleted.');
      return;
    }

    setIsSaving(true);
    try {
      const updated = salaryComponents.filter((c) => c.id !== comp.id);
      await api.setup.savePayrollSettings({
        salaryComponents: updated,
      });

      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          salaryComponents: updated,
        },
      }));
      showToast(`Component "${comp.name}" removed from registry`);
    } catch (e) {
      console.error('Failed to delete component', e);
      showToast('Failed to delete component');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleComponentActive = async (id: string) => {
    setIsSaving(true);
    try {
      const updated = salaryComponents.map((c) => (c.id === id ? { ...c, isActive: !c.isActive } : c));
      await api.setup.savePayrollSettings({
        salaryComponents: updated,
      });

      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          salaryComponents: updated,
        },
      }));
      showToast('Salary component status updated');
    } catch (e) {
      console.error('Failed to toggle component status', e);
      showToast('Failed to toggle component status');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <SettingsToast message={toastMessage} />

      <div className="settings-page__header">
        <h2 className="settings-page__heading">
          Payroll & Compensation Settings
        </h2>

        <div className="settings-page__actions">
          {onBackToPayroll && (
            <button
              type="button"
              onClick={onBackToPayroll}
              className="settings-page__action--secondary"
            >
              Back to Payslips
            </button>
          )}
          {activeTab === 'groups' && (
            <button
              type="button"
              onClick={handleOpenCreateGroup}
              className="settings-page__action"
            >
              Create Pay Group
            </button>
          )}
          {activeTab === 'general_settings' && (
            <button
              type="button"
              onClick={handleSaveGeneralSettings}
              className="settings-page__action"
            >
              Save Settings
            </button>
          )}
          {activeTab === 'components' && (
            <button
              type="button"
              onClick={handleOpenCreateComponent}
              className="settings-page__action"
            >
              Add Component
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="settings-page__tabs" role="tablist" aria-label="Payroll settings categories">
        {[
          { id: 'groups', label: `Payroll Groups (${payrollGroups.length})` },
          { id: 'salary_types', label: 'Salary Simulator' },
          { id: 'general_settings', label: 'Pay Cycles & Rules' },
          { id: 'compliance', label: 'Statutory Compliance' },
          { id: 'components', label: `Salary Components (${salaryComponents.length})` },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              role="tab"
              aria-selected={isActive}
              aria-controls={`payroll-settings-${tab.id}`}
              className={`settings-page__tab ${
                isActive
                  ? 'settings-page__tab--active'
                  : ''
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div id={`payroll-settings-${activeTab}`} role="tabpanel" className="space-y-5">
      {/* ========================================================================= */}
      {/* TAB 1: PAYROLL GROUPS MANAGER                                             */}
      {/* ========================================================================= */}
      {activeTab === 'groups' && (
        <div className="space-y-4">
          {/* Search & Simple Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search groups by name or code..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(['all', 'monthly', 'hourly', 'compliance'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setGroupTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                    groupTypeFilter === t
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'all' ? 'All Types' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Clean Groups Table */}
          <div className="settings-page__data-card overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold text-[11px]">
                <tr>
                  <th className="p-3.5 pl-4">Group Name & Code</th>
                  <th className="p-3.5">Salary Type</th>
                  <th className="p-3.5">Allowances & Structure</th>
                  <th className="p-3.5">Custom Fields</th>
                  <th className="p-3.5">Schedule</th>
                  <th className="p-3.5">Members</th>
                  <th className="p-3.5 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No payroll groups found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map((grp) => {
                    const assignedCount = (grp.assignedEmployeeIds || []).length;
                    const customAllowancesCount = grp.defaultAllowances?.length || 0;
                    const customFieldsCount = grp.customFields?.length || 0;

                    return (
                      <tr key={grp.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-3.5 pl-4">
                          <div className="font-bold text-slate-900 text-sm">{grp.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">{grp.code}</div>
                          {grp.description && (
                            <div className="text-[10px] text-slate-500 mt-1 max-w-xs truncate">{grp.description}</div>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                            {grp.salaryType}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="space-y-1">
                            {grp.baseSalaryDefault ? (
                              <div className="text-slate-900 font-semibold text-[11px]">
                                Base: ₹{grp.baseSalaryDefault.toLocaleString('en-IN')}
                                {grp.hraDefault ? ` • HRA: ₹${grp.hraDefault.toLocaleString('en-IN')}` : ''}
                              </div>
                            ) : (
                              <div className="text-slate-500 text-[11px]">Dynamic Timesheet / Formula</div>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {customAllowancesCount > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10px] font-bold">
                                  <Layers className="h-3 w-3" />
                                  {customAllowancesCount} Custom Allowance{customAllowancesCount > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Standard Allowances</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          {customFieldsCount > 0 ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/60 text-[10px] font-bold">
                                <Sliders className="h-3 w-3" />
                                {customFieldsCount} Field{customFieldsCount > 1 ? 's' : ''}
                              </span>
                              <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                                {grp.customFields?.map((f) => f.label).join(', ')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">None</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-900 text-[11px]">{grp.payFrequency}</div>
                          <div className="text-[10px] text-slate-400">{grp.payDay}th of month</div>
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-slate-900">{assignedCount}</span>{' '}
                          <span className="text-slate-400">emp</span>
                        </td>
                        <td className="p-3.5 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenMembersModal(grp)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer transition-all shadow-2xs"
                            >
                              Members
                            </button>
                            <button
                              onClick={() => handleOpenEditGroup(grp)}
                              className="p-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-blue-600 cursor-pointer transition-all shadow-2xs"
                              title="Edit Group, Allowances & Fields"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteGroup(grp.id, grp.name)}
                              className="p-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer shadow-2xs"
                              title="Delete Group"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SALARY TYPES & SIMULATOR                                           */}
      {/* ========================================================================= */}
      {activeTab === 'salary_types' && (
        <div className="space-y-6">
          {/* Explanation Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="settings-page__card space-y-2">
              <h3 className="text-sm font-bold text-slate-900 ">1. Monthly Fixed CTC</h3>
              <p className="text-xs text-slate-500  leading-relaxed">
                Traditional salaried model with fixed gross pay comprising Basic, HRA (40%), Special Allowances, and standard deductions.
              </p>
              <div className="pt-2 text-xs text-slate-600  font-mono">
                Gross = Basic + HRA + Allowances
              </div>
            </div>

            <div className="settings-page__card space-y-2">
              <h3 className="text-sm font-bold text-slate-900 ">2. Hourly Timesheet Wages</h3>
              <p className="text-xs text-slate-500  leading-relaxed">
                Wages calculated based on logged timesheet hours, hourly base rates (e.g. ₹650/hr), and 1.5x overtime rates with contractor TDS.
              </p>
              <div className="pt-2 text-xs text-slate-600  font-mono">
                Gross = (Hours × Rate) + (OT × 1.5× Rate)
              </div>
            </div>

            <div className="settings-page__card space-y-2">
              <h3 className="text-sm font-bold text-slate-900 ">3. Statutory Compliance</h3>
              <p className="text-xs text-slate-500  leading-relaxed">
                Automated Indian labour statutory structure: EPF (12%), ESIC (0.75%), Professional Tax (₹200), and TDS withholding.
              </p>
              <div className="pt-2 text-xs text-slate-600  font-mono">
                Net = Gross - (EPF + ESIC + PT + TDS)
              </div>
            </div>
          </div>

          {/* Clean Gross-to-Net Calculator */}
          <div className="settings-page__card space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200  pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 ">Gross-to-Net Salary Calculator</h3>
                <p className="text-xs text-slate-500 ">Test salary parameters and preview net take-home in Rupees (₹)</p>
              </div>
              <div className="flex items-center gap-2">
                {(['monthly', 'hourly', 'compliance'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSimSalaryType(t)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg capitalize cursor-pointer transition-all ${simSalaryType === t
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200  text-slate-600  hover:bg-white'
                      }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {simSalaryType === 'hourly' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600  mb-1">
                      Hourly Rate (₹ / hr)
                    </label>
                    <input
                      type="number"
                      value={simHourlyRate}
                      onChange={(e) => setSimHourlyRate(Number(e.target.value))}
                      className="w-full px-3.5 py-2 text-xs bg-white  border border-slate-200  rounded-lg-xl outline-none font-bold text-slate-900 "
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600  mb-1">
                      Logged Hours
                    </label>
                    <input
                      type="number"
                      value={simLoggedHours}
                      onChange={(e) => setSimLoggedHours(Number(e.target.value))}
                      className="w-full px-3.5 py-2 text-xs bg-white  border border-slate-200  rounded-lg-xl outline-none font-bold text-slate-900 "
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600  mb-1">
                      Overtime Hours
                    </label>
                    <input
                      type="number"
                      value={simOvertimeHours}
                      onChange={(e) => setSimOvertimeHours(Number(e.target.value))}
                      className="w-full px-3.5 py-2 text-xs bg-white  border border-slate-200  rounded-lg-xl outline-none font-bold text-slate-900 "
                    />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600  mb-1">
                    Monthly Gross / CTC (₹)
                  </label>
                  <input
                    type="number"
                    value={simBaseOrCtc}
                    onChange={(e) => setSimBaseOrCtc(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs bg-white  border border-slate-200  rounded-lg-xl outline-none font-bold text-slate-900 "
                  />
                </div>
              )}
            </div>

            {/* Results Table */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div className="p-4 rounded-lg-xl border border-slate-200  bg-white/50  space-y-2.5 text-xs">
                <div className="font-bold text-slate-900  border-b border-slate-200  pb-2">
                  Earnings Breakdown
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Basic Pay</span>
                  <span className="font-bold">₹{simResults.basic.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">House Rent Allowance (HRA)</span>
                  <span className="font-bold">₹{simResults.hra.toLocaleString('en-IN')}</span>
                </div>
                {simResults.special > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Special Allowance</span>
                    <span className="font-bold">₹{simResults.special.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {simResults.overtimePay > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Overtime Pay (1.5x)</span>
                    <span className="font-bold">₹{simResults.overtimePay.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200  pt-2 font-bold text-slate-900 ">
                  <span>Gross Remuneration</span>
                  <span>₹{simResults.gross.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="p-4 rounded-lg-xl border border-slate-200  bg-white/50  space-y-2.5 text-xs">
                <div className="font-bold text-slate-900  border-b border-slate-200  pb-2">
                  Deductions & Statutory
                </div>
                {simResults.epfEmployee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Provident Fund (EPF 12%)</span>
                    <span className="font-semibold text-slate-800 ">-₹{simResults.epfEmployee.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {simResults.esicEmployee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">ESIC (0.75%)</span>
                    <span className="font-semibold text-slate-800 ">-₹{simResults.esicEmployee.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {simResults.pt > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Professional Tax (PT)</span>
                    <span className="font-semibold text-slate-800 ">-₹{simResults.pt.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">TDS / Income Tax</span>
                  <span className="font-semibold text-slate-800 ">-₹{simResults.tds.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200  pt-2 font-bold text-slate-900 ">
                  <span>Net Take-Home Pay</span>
                  <span className="font-bold text-slate-900  text-sm">
                    ₹{simResults.netPay.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PAY CYCLES & GENERAL RULES                                         */}
      {/* ========================================================================= */}
      {activeTab === 'general_settings' && (
        <div className="settings-page__card space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700  mb-1.5">
                Default Currency
              </label>
              <input
                type="text"
                disabled
                value="INR (₹) - Indian Rupee"
                className="w-full px-3.5 py-2.5 text-xs bg-white  border border-slate-200  rounded-lg-xl font-bold text-slate-700  cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700  mb-1.5">
                Default Pay Frequency
              </label>
              <select
                value={settingsForm.defaultPayFrequency}
                onChange={(e) => setSettingsForm({ ...settingsForm, defaultPayFrequency: e.target.value as any })}
                className="w-full px-3.5 py-2.5 text-xs bg-white  border border-slate-200  rounded-lg-xl font-medium outline-none"
              >
                <option value="Monthly">Monthly</option>
                <option value="Bi-Weekly">Bi-Weekly</option>
                <option value="Weekly">Weekly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700  mb-1.5">
                Attendance & Timesheet Cut-off Day
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={settingsForm.attendanceCutoffDay}
                onChange={(e) => setSettingsForm({ ...settingsForm, attendanceCutoffDay: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 text-xs bg-white  border border-slate-200  rounded-lg-xl font-medium outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700  mb-1.5">
                Salary Disbursement Day
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={settingsForm.disbursementDay}
                onChange={(e) => setSettingsForm({ ...settingsForm, disbursementDay: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 text-xs bg-white  border border-slate-200  rounded-lg-xl font-medium outline-none"
              />
            </div>
          </div>

          <AttendancePayRulesForm
            settings={settingsForm}
            onChange={setSettingsForm}
          />

          <div className="pt-4 border-t border-slate-200  flex justify-end">
            <button
              onClick={handleSaveGeneralSettings}
              className="px-5 py-2.5 rounded-lg-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer "
            >
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: STATUTORY COMPLIANCE RULES                                         */}
      {/* ========================================================================= */}
      {activeTab === 'compliance' && (
        <div className="settings-page__data-card overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-white  text-slate-600  border-b border-slate-200  font-semibold text-[11px]">
              <tr>
                <th className="p-3.5 pl-4">Statutory Component</th>
                <th className="p-3.5">Employee Share</th>
                <th className="p-3.5">Employer Share</th>
                <th className="p-3.5">Statutory Wage Cap</th>
                <th className="p-3.5 pr-4">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100  text-slate-700  font-medium">
              <tr className="hover:bg-white/60 ">
                <td className="p-3.5 pl-4 font-bold text-slate-900 ">Employees' Provident Fund (EPF)</td>
                <td className="p-3.5">12% of Basic</td>
                <td className="p-3.5">12% (3.67% EPF + 8.33% EPS)</td>
                <td className="p-3.5 font-mono">₹15,000 / month</td>
                <td className="p-3.5 pr-4 text-slate-500">Standard statutory retirement fund for salaried employees</td>
              </tr>
              <tr className="hover:bg-white/60 ">
                <td className="p-3.5 pl-4 font-bold text-slate-900 ">Employees' State Insurance (ESIC)</td>
                <td className="p-3.5">0.75% of Gross</td>
                <td className="p-3.5">3.25% of Gross</td>
                <td className="p-3.5 font-mono">₹21,000 gross wage ceiling</td>
                <td className="p-3.5 pr-4 text-slate-500">Medical insurance benefit for employees with gross &le; ₹21,000</td>
              </tr>
              <tr className="hover:bg-white/60 ">
                <td className="p-3.5 pl-4 font-bold text-slate-900 ">Professional Tax (PT)</td>
                <td className="p-3.5 font-mono">₹200 / month</td>
                <td className="p-3.5">—</td>
                <td className="p-3.5 font-mono">₹2,500 / year max</td>
                <td className="p-3.5 pr-4 text-slate-500">State-level tax on professions and employment</td>
              </tr>
              <tr className="hover:bg-white/60 ">
                <td className="p-3.5 pl-4 font-bold text-slate-900 ">Gratuity (Payment of Gratuity Act)</td>
                <td className="p-3.5">—</td>
                <td className="p-3.5">4.81% (15/26 days per year)</td>
                <td className="p-3.5 font-mono">₹20,00,000 statutory max</td>
                <td className="p-3.5 pr-4 text-slate-500">Lump sum statutory benefit paid upon 5+ years of continuous service</td>
              </tr>
              <tr className="hover:bg-white/60 ">
                <td className="p-3.5 pl-4 font-bold text-slate-900 ">TDS (Tax Deducted at Source)</td>
                <td className="p-3.5">As per Tax Slabs</td>
                <td className="p-3.5">—</td>
                <td className="p-3.5">Sec 115BAC (New Regime)</td>
                <td className="p-3.5 pr-4 text-slate-500">Income tax withheld and remitted directly to Government</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SALARY COMPONENTS REGISTRY                                         */}
      {/* ========================================================================= */}
      {activeTab === 'components' && (
        <div className="space-y-4">
          {/* Search, Filters & Quick Add */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search allowances & deductions..."
                value={componentSearch}
                onChange={(e) => setComponentSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {(
                  [
                    { id: 'all', label: 'All Components' },
                    { id: 'earning', label: 'Earnings & Allowances' },
                    { id: 'deduction', label: 'Deductions' },
                    { id: 'statutory', label: 'Statutory' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setComponentTypeFilter(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer whitespace-nowrap ${
                      componentTypeFilter === t.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleOpenCreateComponent}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all cursor-pointer shrink-0 shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Component</span>
              </button>
            </div>
          </div>

          {/* Interactive Components Table */}
          <div className="settings-page__data-card overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold text-[11px]">
                <tr>
                  <th className="p-3.5 pl-4">Component & Code</th>
                  <th className="p-3.5">Classification</th>
                  <th className="p-3.5">Calculation Formula</th>
                  <th className="p-3.5">Taxable</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {filteredComponents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No salary components or allowances found matching your filter.
                    </td>
                  </tr>
                ) : (
                  filteredComponents.map((comp) => (
                    <tr key={comp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 pl-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{comp.name}</span>
                          {comp.isStatutory && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200/60">
                              Statutory
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block mt-0.5">{comp.code}</span>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            comp.type === 'earning'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : comp.type === 'deduction'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                          }`}
                        >
                          {comp.type === 'earning' ? 'Earning / Allowance' : comp.type}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-[11px]">
                        {comp.calculationType === 'percentage_of_gross'
                          ? `${comp.value}% of Gross`
                          : comp.calculationType === 'percentage_of_basic'
                          ? `${comp.value}% of Basic`
                          : comp.calculationType === 'fixed'
                          ? `₹${Number(comp.value).toLocaleString('en-IN')}/mo`
                          : 'Statutory Formula'}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            comp.taxable
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {comp.taxable ? 'Taxable' : 'Tax Exempt'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggleComponentActive(comp.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                            comp.isActive !== false
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {comp.isActive !== false ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="p-3.5 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditComponent(comp)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer shadow-2xs"
                            title="Edit Component"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          {!comp.isStatutory && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComponent(comp)}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shadow-2xs"
                              title="Delete Component"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
      )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT PAYROLL GROUP (ALLOWANCES, FIELDS & RULES)           */}
      {/* ========================================================================= */}
      {showGroupModal && (
        <SlideOverDrawer
          title={editingGroupId ? 'Configure Pay Group' : 'Create New Pay Group'}
          description="Define salary structure, custom allowances, deductions, and group-level custom fields"
          onClose={() => setShowGroupModal(false)}
          panelClassName="md:max-w-3xl"
        >
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Sub-Tab Navigation Bar */}
            <div className="px-6 pt-2 bg-white border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
              <button
                type="button"
                onClick={() => setGroupModalTab('details')}
                className={`px-3 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  groupModalTab === 'details'
                    ? 'border-blue-600 text-blue-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>1. General & Schedule</span>
              </button>

              <button
                type="button"
                onClick={() => setGroupModalTab('structure')}
                className={`px-3 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  groupModalTab === 'structure'
                    ? 'border-blue-600 text-blue-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <DollarSign className="h-3.5 w-3.5" />
                <span>2. Base & Standard Pay</span>
              </button>

              <button
                type="button"
                onClick={() => setGroupModalTab('allowances')}
                className={`px-3 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  groupModalTab === 'allowances'
                    ? 'border-blue-600 text-blue-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>3. Custom Allowances</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  groupForm.defaultAllowances.length > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {groupForm.defaultAllowances.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setGroupModalTab('deductions')}
                className={`px-3 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  groupModalTab === 'deductions'
                    ? 'border-blue-600 text-blue-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Percent className="h-3.5 w-3.5" />
                <span>4. Deductions & Rules</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  groupForm.defaultDeductions.length > 0
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {groupForm.defaultDeductions.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setGroupModalTab('custom_fields')}
                className={`px-3 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  groupModalTab === 'custom_fields'
                    ? 'border-blue-600 text-blue-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>5. Custom Fields</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  groupForm.customFields.length > 0
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {groupForm.customFields.length}
                </span>
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveGroup} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs custom-scrollbar">
              
              {/* ========================================================================= */}
              {/* SUB-TAB 1: GENERAL & SCHEDULE                                             */}
              {/* ========================================================================= */}
              {groupModalTab === 'details' && (
                <div className="space-y-4">
                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 ">
                      Group Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Core Engineering & Product Staff"
                      value={groupForm.name}
                      onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-semibold text-slate-900 "
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Group Code *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="PG-ENG-01"
                        value={groupForm.code}
                        onChange={(e) => setGroupForm({ ...groupForm, code: e.target.value.toUpperCase() })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-mono text-slate-900  font-bold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Salary Structure Type *
                      </label>
                      <select
                        value={groupForm.salaryType}
                        onChange={(e) => setGroupForm({ ...groupForm, salaryType: e.target.value as SalaryType })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-bold text-slate-900 "
                      >
                        <option value="monthly">Monthly Fixed CTC (Annual Package)</option>
                        <option value="hourly">Hourly Timesheet Wages (Logged Hours)</option>
                        <option value="compliance">Statutory Compliance (EPF/ESIC/PT)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Pay Frequency
                      </label>
                      <select
                        value={groupForm.payFrequency}
                        onChange={(e) => setGroupForm({ ...groupForm, payFrequency: e.target.value as any })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white "
                      >
                        <option value="Monthly">Monthly</option>
                        <option value="Bi-Weekly">Bi-Weekly</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Semi-Monthly">Semi-Monthly</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Salary Disbursement Day
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={groupForm.payDay}
                        onChange={(e) => setGroupForm({ ...groupForm, payDay: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Overtime Multiplier
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        min={1.0}
                        max={3.0}
                        value={groupForm.overtimeMultiplier}
                        onChange={(e) => setGroupForm({ ...groupForm, overtimeMultiplier: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Standard Hours / Day
                      </label>
                      <input
                        type="number"
                        min={4}
                        max={16}
                        value={groupForm.standardHoursPerDay}
                        onChange={(e) => setGroupForm({ ...groupForm, standardHoursPerDay: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Working Days / Month
                      </label>
                      <input
                        type="number"
                        min={15}
                        max={31}
                        value={groupForm.workingDaysPerMonth}
                        onChange={(e) => setGroupForm({ ...groupForm, workingDaysPerMonth: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-slate-700 ">
                      Description & Criteria
                    </label>
                    <textarea
                      rows={2}
                      value={groupForm.description}
                      onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                      placeholder="Eligibility criteria, department scope, or contract terms..."
                      className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  resize-none"
                    />
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* SUB-TAB 2: BASE STRUCTURE & STANDARD ALLOWANCES                           */}
              {/* ========================================================================= */}
              {groupModalTab === 'structure' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg-xl bg-white/70  border border-blue-200/60  flex items-start gap-2.5">
                    
                    <p className="text-[11px] text-blue-900  leading-relaxed">
                      Set default standard salary components for members assigned to this group. Employees can inherit these values or have customized individual overrides.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Default Basic Salary (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={groupForm.baseSalaryDefault || 0}
                        onChange={(e) => setGroupForm({ ...groupForm, baseSalaryDefault: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-bold text-slate-900 "
                      />
                    </div>

                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        House Rent Allowance (HRA ₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={groupForm.hraDefault || 0}
                        onChange={(e) => setGroupForm({ ...groupForm, hraDefault: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-bold text-slate-900 "
                      />
                    </div>

                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Special Allowance (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={groupForm.specialAllowanceDefault || 0}
                        onChange={(e) => setGroupForm({ ...groupForm, specialAllowanceDefault: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-bold text-slate-900 "
                      />
                    </div>

                    <div>
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Conveyance Allowance (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={groupForm.conveyanceAllowanceDefault || 0}
                        onChange={(e) => setGroupForm({ ...groupForm, conveyanceAllowanceDefault: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-bold text-slate-900 "
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-semibold mb-1 text-slate-700 ">
                        Medical Allowance (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={groupForm.medicalAllowanceDefault || 0}
                        onChange={(e) => setGroupForm({ ...groupForm, medicalAllowanceDefault: Number(e.target.value) })}
                        className="w-full px-3.5 py-2.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-bold text-slate-900 "
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* SUB-TAB 3: CUSTOM ALLOWANCES & BONUSES                                    */}
              {/* ========================================================================= */}
              {groupModalTab === 'allowances' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200 ">
                    <div>
                      <h4 className="font-bold text-slate-900 ">Custom Allowances & Stipends</h4>
                      <p className="text-[11px] text-slate-500">Add group-specific allowances with custom calculation formulas</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddGroupAllowance()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg-xl font-bold cursor-pointer transition-all "
                    >
                      
                      <span>Add Allowance</span>
                    </button>
                  </div>

                  {/* Quick-Add Suggestion Chips */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Quick Add Presets:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { name: 'Remote Work Stipend', amount: 3500, type: 'fixed' as const, frequency: 'Monthly' as const, taxable: true },
                        { name: 'Meal & Food Voucher', amount: 2200, type: 'fixed' as const, frequency: 'Monthly' as const, taxable: false },
                        { name: 'Performance Bonus', amount: 10, type: 'percentage_of_basic' as const, frequency: 'Monthly' as const, taxable: true },
                        { name: 'Night Shift Allowance', amount: 1500, type: 'fixed' as const, frequency: 'Monthly' as const, taxable: true },
                        { name: 'Travel & Fuel Allowance', amount: 3000, type: 'fixed' as const, frequency: 'Monthly' as const, taxable: false },
                        { name: 'Broadband / Internet', amount: 1200, type: 'fixed' as const, frequency: 'Monthly' as const, taxable: false },
                      ].map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => handleAddGroupAllowance(preset)}
                          className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200  bg-white  text-slate-700  hover:border-blue-600 hover:text-slate-900 transition-all cursor-pointer font-medium"
                        >
                          + {preset.name} ({preset.type === 'percentage_of_basic' ? `${preset.amount}%` : `₹${preset.amount.toLocaleString('en-IN')}`})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Allowances List */}
                  {groupForm.defaultAllowances.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-slate-200  rounded-lg-xl text-slate-400">
                      
                      <p className="font-semibold">No custom allowances configured for this group yet.</p>
                      <p className="text-[11px] mt-0.5">Click "Add Allowance" or choose a quick preset above.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {groupForm.defaultAllowances.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="p-3.5 rounded-lg-xl border border-slate-200  bg-white/60  space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold text-slate-900  uppercase tracking-wider">
                              Allowance #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveGroupAllowance(item.id)}
                              className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors cursor-pointer"
                              title="Delete Allowance"
                            >
                              
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Allowance Name</label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Remote Work Allowance"
                                value={item.name}
                                onChange={(e) => handleUpdateGroupAllowance(item.id, { name: e.target.value })}
                                className="w-full px-3 py-1.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-semibold"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Calculation Type</label>
                              <select
                                value={item.type}
                                onChange={(e) => handleUpdateGroupAllowance(item.id, { type: e.target.value as any })}
                                className="w-full px-2.5 py-1.5 border border-slate-200  rounded-lg-xl outline-none bg-white "
                              >
                                <option value="fixed">Fixed (₹)</option>
                                <option value="percentage_of_basic">% of Basic</option>
                                <option value="percentage_of_ctc">% of CTC</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                {item.type === 'fixed' ? 'Amount (₹)' : 'Percent (%)'}
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={item.amount}
                                onChange={(e) => handleUpdateGroupAllowance(item.id, { amount: Number(e.target.value) })}
                                className="w-full px-3 py-1.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-mono font-bold"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200/60 ">
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.taxable !== false}
                                  onChange={(e) => handleUpdateGroupAllowance(item.id, { taxable: e.target.checked })}
                                  className="w-3.5 h-3.5 rounded-lg text-slate-900 cursor-pointer"
                                />
                                <span className="text-[11px] font-medium text-slate-700 ">
                                  Taxable Component
                                </span>
                              </label>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">Frequency:</span>
                              <select
                                value={item.frequency || 'Monthly'}
                                onChange={(e) => handleUpdateGroupAllowance(item.id, { frequency: e.target.value as any })}
                                className="px-2 py-0.5 border border-slate-200  rounded-lg text-[11px] bg-white "
                              >
                                <option value="Monthly">Monthly</option>
                                <option value="Quarterly">Quarterly</option>
                                <option value="Annually">Annually</option>
                                <option value="One-Time">One-Time</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* SUB-TAB 4: DEDUCTIONS & COMPLIANCE RULES                                  */}
              {/* ========================================================================= */}
              {groupModalTab === 'deductions' && (
                <div className="space-y-4">
                  {/* Statutory Toggles */}
                  <div>
                    <h4 className="font-bold text-slate-900  mb-2">Statutory Compliance Rules</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="p-3 rounded-lg-xl border border-slate-200  bg-white/50  flex items-center justify-between cursor-pointer">
                        <div>
                          <div className="font-bold text-slate-900 ">EPF (Provident Fund)</div>
                          <div className="text-[10px] text-slate-500">12% Employee + 12% Employer (₹15,000 cap)</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={groupForm.enableEPF}
                          onChange={(e) => setGroupForm({ ...groupForm, enableEPF: e.target.checked })}
                          className="w-4 h-4 rounded-lg text-slate-900 cursor-pointer"
                        />
                      </label>

                      <label className="p-3 rounded-lg-xl border border-slate-200  bg-white/50  flex items-center justify-between cursor-pointer">
                        <div>
                          <div className="font-bold text-slate-900 ">ESIC (Employee State Insurance)</div>
                          <div className="text-[10px] text-slate-500">0.75% Employee + 3.25% Employer (&le; ₹21k)</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={groupForm.enableESIC}
                          onChange={(e) => setGroupForm({ ...groupForm, enableESIC: e.target.checked })}
                          className="w-4 h-4 rounded-lg text-slate-900 cursor-pointer"
                        />
                      </label>

                      <label className="p-3 rounded-lg-xl border border-slate-200  bg-white/50  flex items-center justify-between cursor-pointer">
                        <div>
                          <div className="font-bold text-slate-900 ">Professional Tax (PT)</div>
                          <div className="text-[10px] text-slate-500">₹200 / month state employment tax</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={groupForm.enableProfessionalTax}
                          onChange={(e) => setGroupForm({ ...groupForm, enableProfessionalTax: e.target.checked })}
                          className="w-4 h-4 rounded-lg text-slate-900 cursor-pointer"
                        />
                      </label>

                      <label className="p-3 rounded-lg-xl border border-slate-200  bg-white/50  flex items-center justify-between cursor-pointer">
                        <div>
                          <div className="font-bold text-slate-900 ">TDS (Income Tax Deductions)</div>
                          <div className="text-[10px] text-slate-500">New Tax Regime default computation</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={groupForm.enableTDS}
                          onChange={(e) => setGroupForm({ ...groupForm, enableTDS: e.target.checked })}
                          className="w-4 h-4 rounded-lg text-slate-900 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Custom Deductions */}
                  <div className="pt-3 border-t border-slate-200 ">
                    <div className="flex items-center justify-between pb-1">
                      <div>
                        <h4 className="font-bold text-slate-900 ">Custom Deductions</h4>
                        <p className="text-[11px] text-slate-500">Group health insurance, advance repayments, canteen charges</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddGroupDeduction()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600  text-white  rounded-lg-xl font-bold cursor-pointer transition-all "
                      >
                        
                        <span>Add Deduction</span>
                      </button>
                    </div>

                    {/* Quick Deductions Presets */}
                    <div className="my-2 flex flex-wrap gap-1.5">
                      {[
                        { name: 'Group Health Insurance', amount: 1200, type: 'fixed' as const },
                        { name: 'Canteen / Mess Recovery', amount: 1500, type: 'fixed' as const },
                        { name: 'Gym & Wellness Recovery', amount: 800, type: 'fixed' as const },
                        { name: 'Salary Advance EMI', amount: 5000, type: 'fixed' as const },
                      ].map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => handleAddGroupDeduction(preset)}
                          className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200  bg-white  text-slate-700  hover:border-rose-500 hover:text-rose-600 transition-all cursor-pointer font-medium"
                        >
                          + {preset.name} (₹{preset.amount.toLocaleString('en-IN')})
                        </button>
                      ))}
                    </div>

                    {/* Deductions List */}
                    {groupForm.defaultDeductions.length === 0 ? (
                      <div className="p-6 text-center border-2 border-dashed border-slate-200  rounded-lg-xl text-slate-400">
                        <p className="font-semibold text-xs">No custom deductions configured for this group.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {groupForm.defaultDeductions.map((ded, idx) => (
                          <div
                            key={ded.id || idx}
                            className="p-3 rounded-lg-xl border border-slate-200  bg-white/50  flex items-center gap-3"
                          >
                            <input
                              type="text"
                              required
                              placeholder="Deduction Name"
                              value={ded.name}
                              onChange={(e) => handleUpdateGroupDeduction(ded.id, { name: e.target.value })}
                              className="flex-1 px-3 py-1.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-semibold"
                            />
                            <div className="w-32">
                              <input
                                type="number"
                                min={0}
                                placeholder="Amount ₹"
                                value={ded.amount}
                                onChange={(e) => handleUpdateGroupDeduction(ded.id, { amount: Number(e.target.value) })}
                                className="w-full px-3 py-1.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-mono font-bold"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveGroupDeduction(ded.id)}
                              className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg transition-colors cursor-pointer"
                              title="Delete"
                            >
                              
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* SUB-TAB 5: CUSTOM GROUP FIELDS & METADATA                                 */}
              {/* ========================================================================= */}
              {groupModalTab === 'custom_fields' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200 ">
                    <div>
                      <h4 className="font-bold text-slate-900 ">Group Custom Metadata & Fields</h4>
                      <p className="text-[11px] text-slate-500">Add custom fields like Cost Center, Project Billing, or Regional Tax Codes</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddGroupCustomField()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg-xl font-bold cursor-pointer transition-all "
                    >
                      
                      <span>Add Custom Field</span>
                    </button>
                  </div>

                  {/* Quick-Add Suggestions */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Common Field Presets:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Cost Center Code', fieldType: 'text' as const, defaultValue: 'CC-ENG-01', required: true },
                        { label: 'Client Billable Role', fieldType: 'boolean' as const, defaultValue: 'true', required: false },
                        { label: 'Payroll Tax Region', fieldType: 'select' as const, defaultValue: 'South / BLR', options: ['North / NCR', 'South / BLR', 'West / MUM', 'Remote Pan-India'], required: true },
                        { label: 'Project Allocation Code', fieldType: 'text' as const, defaultValue: 'PRJ-2026-CORE', required: false },
                        { label: 'Overtime Approver Role', fieldType: 'text' as const, defaultValue: 'Engineering Lead', required: true },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handleAddGroupCustomField(preset)}
                          className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200  bg-white  text-slate-700  hover:border-blue-600 hover:text-slate-900 transition-all cursor-pointer font-medium"
                        >
                          + {preset.label} ({preset.fieldType})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Fields List */}
                  {groupForm.customFields.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-slate-200  rounded-lg-xl text-slate-400">
                      
                      <p className="font-semibold text-xs">No custom fields added yet.</p>
                      <p className="text-[11px] mt-0.5">Click "Add Custom Field" or choose a preset above.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {groupForm.customFields.map((field, idx) => (
                        <div
                          key={field.id || idx}
                          className="p-3.5 rounded-lg-xl border border-slate-200  bg-white/60  space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold text-slate-900  uppercase tracking-wider">
                              Field #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveGroupCustomField(field.id)}
                              className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors cursor-pointer"
                              title="Delete Field"
                            >
                              
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Field Label</label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Cost Center Code"
                                value={field.label}
                                onChange={(e) => handleUpdateGroupCustomField(field.id, { label: e.target.value })}
                                className="w-full px-3 py-1.5 border border-slate-200  rounded-lg-xl outline-none bg-white  font-semibold"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Field Type</label>
                              <select
                                value={field.fieldType}
                                onChange={(e) => handleUpdateGroupCustomField(field.id, { fieldType: e.target.value as any })}
                                className="w-full px-2.5 py-1.5 border border-slate-200  rounded-lg-xl outline-none bg-white "
                              >
                                <option value="text">Text Input</option>
                                <option value="number">Number</option>
                                <option value="select">Dropdown Select</option>
                                <option value="boolean">Boolean (Yes/No)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Default Value</label>
                              <input
                                type="text"
                                placeholder="e.g. CC-100"
                                value={field.defaultValue || ''}
                                onChange={(e) => handleUpdateGroupCustomField(field.id, { defaultValue: e.target.value })}
                                className="w-full px-3 py-1.5 border border-slate-200  rounded-lg-xl outline-none bg-white "
                              />
                            </div>
                          </div>

                          {field.fieldType === 'select' && (
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                Dropdown Options (comma-separated)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Option 1, Option 2, Option 3"
                                value={(field.options || []).join(', ')}
                                onChange={(e) =>
                                  handleUpdateGroupCustomField(field.id, {
                                    options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                                  })
                                }
                                className="w-full px-3 py-1.5 border border-slate-200  rounded-lg-xl outline-none bg-white  text-[11px]"
                              />
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.required || false}
                                onChange={(e) => handleUpdateGroupCustomField(field.id, { required: e.target.checked })}
                                className="w-3.5 h-3.5 rounded-lg text-slate-900 cursor-pointer"
                              />
                              <span className="text-[11px] font-medium text-slate-700 ">
                                Required field for assigned members
                              </span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Modal Footer with Actions */}
              <div className="pt-4 border-t border-slate-200  flex items-center justify-between">
                <div className="text-[11px] text-slate-500">
                  {groupForm.defaultAllowances.length} allowance{groupForm.defaultAllowances.length !== 1 ? 's' : ''} •{' '}
                  {groupForm.customFields.length} custom field{groupForm.customFields.length !== 1 ? 's' : ''}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGroupModal(false)}
                    className="px-4 py-2 border border-slate-200  rounded-lg-xl text-slate-600  font-semibold cursor-pointer hover:bg-white  transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg-xl font-bold cursor-pointer  transition-all"
                  >
                    {editingGroupId ? 'Save Pay Group & Allowances' : 'Create Pay Group'}
                  </button>
                </div>
              </div>
            </form>
            </div>
        </SlideOverDrawer>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MANAGE GROUP MEMBERS                                               */}
      {/* ========================================================================= */}
      {showMembersModal && selectedGroupForMembers && (
        <SlideOverDrawer
          title={`Assign Members — ${selectedGroupForMembers.name}`}
          description={`${selectedGroupForMembers.assignedEmployeeIds?.length || 0} employees currently assigned`}
          onClose={() => setShowMembersModal(false)}
        >

            <div className="p-4 border-b border-slate-200 ">
              <div className="relative">
                
                <input
                  type="text"
                  placeholder="Filter employees by name or designation..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white  border border-slate-200  rounded-lg-xl outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar text-xs">
              {state.employees
                .filter((emp) =>
                  emp.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                  (emp.designation || '').toLowerCase().includes(memberSearchQuery.toLowerCase())
                )
                .map((emp) => {
                  const isAssigned = (selectedGroupForMembers.assignedEmployeeIds || []).includes(emp.id);
                  return (
                    <div
                      key={emp.id}
                      onClick={() => handleToggleEmployeeInGroup(emp.id)}
                      className={`p-3 rounded-lg-xl border flex items-center justify-between cursor-pointer transition-all ${isAssigned
                          ? 'border-blue-600 bg-white/50 '
                          : 'border-slate-200  hover:bg-white '
                        }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900 ">{emp.name}</div>
                        <div className="text-[11px] text-slate-500">{emp.designation || 'Staff'} • {emp.department || 'General'}</div>
                      </div>
                      <div className={`w-5 h-5 rounded-lg-xl flex items-center justify-center border ${isAssigned
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-slate-300 '
                        }`}>
                        {isAssigned  && null}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-4 sm:p-5 sm:px-8 border-t border-[var(--border-color)] bg-[var(--bg-surface)] flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowMembersModal(false)}
                className="flex-1 py-2.5 sm:py-3 rounded-xl bg-[var(--studio-navy)] hover:bg-[var(--studio-navy-hover)] text-white text-sm font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
        </SlideOverDrawer>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: CREATE / EDIT SALARY COMPONENT & ALLOWANCE                         */}
      {/* ========================================================================= */}
      {showComponentModal && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
          onClick={() => setShowComponentModal(false)}
        >
          <div
            className="relative w-full max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-7 px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-slate-900">
                  {editingComponentId ? 'Edit Salary Component' : 'Add Salary Component'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {editingComponentId
                    ? `Update configuration and calculation formula for ${componentForm.name || 'component'}`
                    : 'Configure new allowance, deduction, or statutory component'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowComponentModal(false)}
                className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors shrink-0"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleSaveComponent} className="flex-1 flex flex-col justify-between overflow-hidden bg-white">
              <div className="p-8 space-y-5 overflow-y-auto custom-scrollbar text-xs">
                {/* Component Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Component Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Remote Work Allowance, Shift Allowance"
                    value={componentForm.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setComponentForm({
                        ...componentForm,
                        name: val,
                        code: editingComponentId ? componentForm.code : val.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 10),
                      });
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                  />
                </div>

                {/* Code & Classification */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Component Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. REMOTE_ALW"
                      value={componentForm.code}
                      onChange={(e) => setComponentForm({ ...componentForm, code: e.target.value.toUpperCase() })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 font-mono font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Classification <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={componentForm.type}
                      onChange={(e) => setComponentForm({ ...componentForm, type: e.target.value as any })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                    >
                      <option value="earning">Earning / Allowance</option>
                      <option value="deduction">Deduction</option>
                      <option value="statutory">Statutory Component</option>
                    </select>
                  </div>
                </div>

                {/* Calculation Method & Value */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Calculation Method
                    </label>
                    <select
                      value={componentForm.calculationType}
                      onChange={(e) => setComponentForm({ ...componentForm, calculationType: e.target.value as any })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                    >
                      <option value="fixed">Fixed Monthly Amount (₹)</option>
                      <option value="percentage_of_basic">% of Basic Salary</option>
                      <option value="percentage_of_gross">% of Gross CTC</option>
                      <option value="statutory_formula">Statutory Formula</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Default Value {componentForm.calculationType === 'fixed' ? '(₹)' : '(%)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={componentForm.value || 0}
                      onChange={(e) => setComponentForm({ ...componentForm, value: Number(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-mono font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={componentForm.taxable}
                      onChange={(e) => setComponentForm({ ...componentForm, taxable: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700">Subject to Income Tax (Taxable)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={componentForm.isActive !== false}
                      onChange={(e) => setComponentForm({ ...componentForm, isActive: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700">Active Status</span>
                  </label>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Description & Statutory Notes
                  </label>
                  <textarea
                    rows={3}
                    value={componentForm.description}
                    onChange={(e) => setComponentForm({ ...componentForm, description: e.target.value })}
                    placeholder="Purpose, tax exemption limit, or disbursement conditions..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all resize-none"
                  />
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-6 px-8 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowComponentModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-xs transition-all cursor-pointer"
                >
                  {editingComponentId ? 'Save Changes' : 'Create Component'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function AttendancePayRulesForm({
  settings,
  onChange,
}: {
  settings: PayrollSettings;
  onChange: (next: PayrollSettings) => void;
}) {
  const pay = { ...DEFAULT_ATTENDANCE_PAY, ...(settings.attendancePay || {}) };
  const patch = (partial: Partial<typeof pay>) =>
    onChange({ ...settings, attendancePay: { ...pay, ...partial } });

  const exampleGross = 50000;
  const exampleDays = 22;
  const exampleCalendar = 30;
  const perDay =
    pay.lopDayRate === 'gross_per_calendar_day' ? exampleGross / exampleCalendar : exampleGross / exampleDays;

  return (
    <div className="pt-5 border-t border-slate-200 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">Attendance, LOP and salary</h3>
        <p className="mt-1 text-[13px] text-slate-500">
          These rules apply to every employee on a payroll run. Required days and hours still come from the payroll group.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">How monthly salary is calculated</label>
          <select
            value={pay.salaryMethod}
            onChange={(e) => patch({ salaryMethod: e.target.value as typeof pay.salaryMethod })}
            className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-lg-xl font-medium outline-none"
          >
            <option value="full_then_deduct">Pay full salary, then deduct LOP</option>
            <option value="payable_days">Pay only credited days (gross × days / required days)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">LOP day rate</label>
          <select
            value={pay.lopDayRate}
            onChange={(e) => patch({ lopDayRate: e.target.value as typeof pay.lopDayRate })}
            className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-lg-xl font-medium outline-none"
          >
            <option value="gross_per_working_day">Gross ÷ working days in the group</option>
            <option value="basic_per_working_day">Basic ÷ working days in the group</option>
            <option value="gross_per_calendar_day">Gross ÷ calendar days in the cycle</option>
          </select>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Example: ₹{exampleGross.toLocaleString('en-IN')} over{' '}
            {pay.lopDayRate === 'gross_per_calendar_day' ? exampleCalendar : exampleDays} days → ₹
            {Math.round(perDay).toLocaleString('en-IN')} per LOP day.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Cost of missing attendance hours</label>
          <select
            value={pay.missingHours}
            onChange={(e) => patch({ missingHours: e.target.value as typeof pay.missingHours })}
            className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-lg-xl font-medium outline-none"
          >
            <option value="hours_to_lop">Convert missing hours into extra LOP days</option>
            <option value="hourly_rate">Deduct hourly rate × missing hours</option>
            <option value="gross_per_hour">Deduct (gross ÷ required hours) × missing hours</option>
            <option value="ignore">Do not deduct — only mark hours as short</option>
          </select>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-700 mb-2">Count as LOP</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(
            [
              ['lopFromUnpaidLeave', 'Approved unpaid / Loss of Pay leave'],
              ['lopFromAbsent', 'Absent days'],
              ['lopFromHalfDay', 'Half day as 0.5 LOP'],
              ['lopFromDayShortfall', 'Shortfall vs required working days'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={pay[key]} onChange={(e) => patch({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-start gap-2 text-[13px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.autoCalculateFromAttendance}
            onChange={(e) => onChange({ ...settings, autoCalculateFromAttendance: e.target.checked })}
          />
          <span>Calculate LOP and payable days from attendance</span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.autoCalculateFromTimesheets}
            onChange={(e) => onChange({ ...settings, autoCalculateFromTimesheets: e.target.checked })}
          />
          <span>Use approved timesheets for hourly hours</span>
        </label>
      </div>
    </div>
  );
}
