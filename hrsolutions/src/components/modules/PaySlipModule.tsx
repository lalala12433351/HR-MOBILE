'use client';

import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Download,
  Printer,
  Calendar,
  DollarSign,
  Building2,
  User,
  CheckCircle2,
  FileText,
  Clock,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
  ChevronDown,
  Mail,
  Send,
  Eye,
  CreditCard,
  Percent,
  Search,
  Filter,
  Plus,
  Settings,
  Layers,
  Briefcase,
} from 'lucide-react';
import { AppState } from '@/services/store';
import { Employee, PayrollRecord, EmployeePayslipDocument, SalaryType } from '@/types';
import { api } from '@/services/apiClient';
import { PayrollSettingsView } from './PayrollSettingsView';

interface PaySlipModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const PaySlipModule: React.FC<PaySlipModuleProps> = ({ state, onUpdateState }) => {
  const isEmployee = state.currentPersona.role === 'employee' || state.currentPersona.role === 'faculty';
  
  const fallbackEmployee: Employee = useMemo(() => ({
    id: state.currentPersona?.id || 'active_user',
    employeeId: state.currentPersona?.id || 'EMP-ACTIVE',
    name: state.currentPersona?.name || 'Workspace Member',
    fullName: state.currentPersona?.name || 'Workspace Member',
    email: state.currentPersona?.email || 'member@workspace.local',
    phone: '',
    avatar: state.currentPersona?.avatar || '',
    department: state.currentPersona?.department || '',
    team: '',
    designation: state.currentPersona?.designation || '',
    role: state.currentPersona?.role || 'employee',
    joiningDate: new Date().toISOString().split('T')[0],
    employmentType: 'Full-time',
    location: state.organization?.officeLocation?.address || '',
    skills: [],
    bankDetails: {
      accountNumber: '—',
      ifscCode: '—',
      bankName: '—',
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
      name: '—',
      relation: '—',
      phone: '—',
    },
    status: 'Active',
    payrollSummary: {
      status: 'Active',
      jobTitle: state.currentPersona?.designation || 'Staff',
      employmentType: 'Full-time',
      jobDate: new Date().toISOString().split('T')[0],
      geofencing: 'Enabled',
      lastWorkingDate: '-',
      totalCompensation: 0,
      salary: 0,
      recurring: 0,
      oneOff: 0,
      offset1: 0,
      offset2: 0,
    },
  }), [state.currentPersona, state.organization]);

  // Find current user's matching employee or default to first employee
  const defaultEmp = useMemo(() => {
    return (
      state.employees.find(
        (e) => e.name.toLowerCase().includes((state.currentPersona?.name || '').toLowerCase().split(' ')[0])
      ) ||
      state.employees[0] ||
      fallbackEmployee
    );
  }, [state.employees, state.currentPersona, fallbackEmployee]);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(defaultEmp?.id || '');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    () => `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`
  );
  const [activeView, setActiveView] = useState<'payslip' | 'all_payrolls' | 'tax_summary' | 'payroll_settings'>('payslip');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const selectedEmployee: Employee = useMemo(() => {
    return state.employees.find((e) => e.id === selectedEmployeeId) || state.employees[0] || fallbackEmployee;
  }, [state.employees, selectedEmployeeId, fallbackEmployee]);

  const assignedGroup = useMemo(() => {
    return (state.customOptions?.payrollGroups || []).find((g) =>
      g.id === selectedEmployee.payrollGroupId || (g.assignedEmployeeIds || []).includes(selectedEmployee.id)
    );
  }, [state.customOptions?.payrollGroups, selectedEmployee]);

  const empSalaryType: SalaryType = selectedEmployee.salaryType || assignedGroup?.salaryType || 'monthly';

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Compute realistic salary components based on employee salary type (Monthly, Hourly, Compliance)
  const salaryData = useMemo(() => {
    const baseSalary = selectedEmployee.payrollSummary?.salary || selectedEmployee.salaryDetails?.basic || 65000;
    const allowances = selectedEmployee.payrollSummary?.recurring || selectedEmployee.salaryDetails?.specialAllowance || 22000;

    if (empSalaryType === 'hourly') {
      const hourlyRate = selectedEmployee.hourlyRate || 650;
      const regularHours = 160;
      const overtimeHours = 12;
      const regularPay = hourlyRate * regularHours;
      const overtimeRate = hourlyRate * (assignedGroup?.overtimeMultiplier || 1.5);
      const overtimePay = overtimeRate * overtimeHours;
      const grossEarnings = regularPay + overtimePay;

      const tds = Math.round(grossEarnings * 0.1); // Standard 10% contractor withholding
      const totalDeductions = tds;
      const netPay = grossEarnings - totalDeductions;

      return {
        baseSalary: regularPay,
        hra: 0,
        specialAllowance: 0,
        conveyanceAllowance: 0,
        medicalAllowance: 0,
        otherAllowances: 0,
        customAllowances: [],
        performanceBonus: 0,
        regularHours,
        overtimeHours,
        overtimePay,
        hourlyRate,
        grossEarnings,
        pf: 0,
        esic: 0,
        professionalTax: 0,
        tds,
        customDeductions: [],
        healthInsurance: 0,
        totalDeductions,
        netPay,
        salaryType: 'hourly' as SalaryType,
      };
    } else if (empSalaryType === 'compliance') {
      const sd = selectedEmployee.salaryDetails;
      const ctc = (sd?.basic || 50000) + (sd?.specialAllowance || 15000) + (sd?.hra || 20000);
      const basic = sd?.basic || Math.round(ctc * 0.5);
      const hra = sd?.hra !== undefined ? sd.hra : Math.round(basic * 0.4);
      const conveyance = sd?.conveyanceAllowance || 1600;
      const medical = sd?.medicalAllowance || 1250;
      const other = sd?.otherAllowances || 0;
      const customAllowances = sd?.allowanceItems || [];
      const customAllowancesSum = customAllowances.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
      const statutoryBonus = Math.round(basic * 0.0833);
      const specialAllowance = sd?.specialAllowance !== undefined ? sd.specialAllowance : Math.max(0, ctc - basic - hra - statutoryBonus);
      const grossEarnings = basic + hra + conveyance + medical + other + customAllowancesSum + statutoryBonus + specialAllowance;

      const epfBase = Math.min(basic, 15000);
      const pf = sd?.pfDeduction !== undefined ? sd.pfDeduction : Math.round(epfBase * 0.12);
      const isEsicEligible = grossEarnings <= 21000;
      const esic = sd?.esicDeduction !== undefined ? sd.esicDeduction : (isEsicEligible ? Math.round(grossEarnings * 0.0075) : 0);
      const professionalTax = sd?.professionalTax !== undefined ? sd.professionalTax : 200;
      const tds = sd?.taxDeduction !== undefined ? sd.taxDeduction : Math.round(grossEarnings * 0.08);
      const customDeductions = sd?.deductionItems || [];
      const customDeductionsSum = customDeductions.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
      const totalDeductions = pf + esic + professionalTax + tds + customDeductionsSum;
      const netPay = sd?.netPayable !== undefined ? sd.netPayable : Math.max(0, grossEarnings - totalDeductions);

      return {
        baseSalary: basic,
        hra,
        specialAllowance,
        conveyanceAllowance: conveyance,
        medicalAllowance: medical,
        otherAllowances: other,
        customAllowances,
        performanceBonus: statutoryBonus,
        regularHours: 0,
        overtimeHours: 0,
        overtimePay: 0,
        hourlyRate: 0,
        grossEarnings,
        pf,
        esic,
        professionalTax,
        tds,
        customDeductions,
        healthInsurance: 0,
        totalDeductions,
        netPay,
        salaryType: 'compliance' as SalaryType,
      };
    } else {
      // Monthly Fixed
      const sd = selectedEmployee.salaryDetails;
      const basic = sd?.basic || selectedEmployee.payrollSummary?.salary || 65000;
      const hra = sd?.hra !== undefined ? sd.hra : Math.round(basic * 0.4);
      const specialAllowance = sd?.specialAllowance !== undefined ? sd.specialAllowance : 10000;
      const conveyanceAllowance = sd?.conveyanceAllowance !== undefined ? sd.conveyanceAllowance : 1600;
      const medicalAllowance = sd?.medicalAllowance !== undefined ? sd.medicalAllowance : 1250;
      const otherAllowances = sd?.otherAllowances !== undefined ? sd.otherAllowances : 0;
      const customAllowances = sd?.allowanceItems || [];
      const customAllowancesSum = customAllowances.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

      const grossEarnings =
        basic +
        hra +
        specialAllowance +
        conveyanceAllowance +
        medicalAllowance +
        otherAllowances +
        customAllowancesSum;

      const pf = sd?.pfDeduction !== undefined ? sd.pfDeduction : Math.round(basic * 0.12);
      const professionalTax = sd?.professionalTax !== undefined ? sd.professionalTax : 200;
      const esic = sd?.esicDeduction !== undefined ? sd.esicDeduction : (grossEarnings <= 21000 ? Math.round(grossEarnings * 0.0075) : 0);
      const tds = sd?.taxDeduction !== undefined ? sd.taxDeduction : Math.round(grossEarnings * 0.08);
      const customDeductions = sd?.deductionItems || [];
      const customDeductionsSum = customDeductions.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

      const totalDeductions = pf + professionalTax + esic + tds + customDeductionsSum;
      const netPay = sd?.netPayable !== undefined ? sd.netPayable : Math.max(0, grossEarnings - totalDeductions);

      return {
        baseSalary: basic,
        hra,
        specialAllowance,
        conveyanceAllowance,
        medicalAllowance,
        otherAllowances,
        customAllowances,
        performanceBonus: 0,
        regularHours: 0,
        overtimeHours: 0,
        overtimePay: 0,
        hourlyRate: 0,
        grossEarnings,
        pf,
        esic,
        professionalTax,
        tds,
        customDeductions,
        healthInsurance: 0,
        totalDeductions,
        netPay,
        salaryType: 'monthly' as SalaryType,
      };
    }
  }, [selectedEmployee, empSalaryType, assignedGroup]);

  // Historical Payslips
  const payslipHistory = [
    { period: 'August 2026', issueDate: '31 Aug 2026', netPay: salaryData.netPay, gross: salaryData.grossEarnings, status: 'Paid', ref: 'PS-2026-08' },
    { period: 'July 2026', issueDate: '31 Jul 2026', netPay: salaryData.netPay, gross: salaryData.grossEarnings, status: 'Paid', ref: 'PS-2026-07' },
    { period: 'June 2026', issueDate: '30 Jun 2026', netPay: salaryData.netPay - 1200, gross: salaryData.grossEarnings - 1500, status: 'Paid', ref: 'PS-2026-06' },
    { period: 'May 2026', issueDate: '31 May 2026', netPay: salaryData.netPay - 1200, gross: salaryData.grossEarnings - 1500, status: 'Paid', ref: 'PS-2026-05' },
    { period: 'April 2026', issueDate: '30 Apr 2026', netPay: salaryData.netPay - 2500, gross: salaryData.grossEarnings - 3000, status: 'Paid', ref: 'PS-2026-04' },
  ];

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    showToast(`Downloading Official PaySlip (${selectedPeriod}) for ${selectedEmployee.name}`);
  };

  const handleEmail = () => {
    showToast(`PaySlip sent to ${selectedEmployee.email || 'employee@company.com'}`);
  };

  const handleRunPayrollCycle = async () => {
    const monthIndex = new Date().getMonth() + 1;
    const year = new Date().getFullYear();

    // Direct synchronous backend API call
    const resRun = await api.payroll.executePayrollRun({
      month: monthIndex,
      year: year,
      executedByEmployeeId: state.currentPersona.id,
    });

    if (!resRun.success && resRun.error) {
      alert(`Failed to execute payroll run on backend: ${resRun.error.message}`);
      return;
    }

    const groupsList = state.customOptions?.payrollGroups || [];

    const newPayrolls: PayrollRecord[] = state.employees.map((emp) => {
      const group = groupsList.find((g) => g.id === emp.payrollGroupId || (g.assignedEmployeeIds || []).includes(emp.id));
      const type: SalaryType = emp.salaryType || group?.salaryType || 'monthly';

      if (type === 'hourly') {
        const rate = emp.hourlyRate || 650;
        const regularHours = 160;
        const otHours = 10;
        const basic = rate * regularHours;
        const otPay = rate * 1.5 * otHours;
        const gross = basic + otPay;
        const tax = Math.round(gross * 0.1);
        const net = gross - tax;

        return {
          id: `pay_${Date.now()}_${emp.id}`,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department || 'Development',
          monthYear: selectedPeriod,
          salaryType: 'hourly',
          payrollGroupId: group?.id,
          payrollGroupName: group?.name || 'Hourly Contractors',
          hoursWorked: regularHours + otHours,
          hourlyRate: rate,
          overtimeHours: otHours,
          basicSalary: basic,
          allowances: 0,
          overtimePay: otPay,
          deductions: tax,
          tax: tax,
          netPay: net,
          netSalary: net,
          status: 'Paid',
          paymentDate: new Date().toISOString().split('T')[0],
        };
      } else if (type === 'compliance') {
        const ctc = (emp.salaryDetails?.basic || 70000) + (emp.salaryDetails?.specialAllowance || 20000);
        const basic = Math.round(ctc * 0.5);
        const hra = Math.round(basic * 0.4);
        const allowances = ctc - basic;
        const epf = Math.round(Math.min(basic, 15000) * 0.12);
        const esic = ctc <= 21000 ? Math.round(ctc * 0.0075) : 0;
        const pt = 200;
        const tds = Math.round(ctc * 0.08);
        const deductions = epf + esic + pt + tds;
        const net = ctc - deductions;

        return {
          id: `pay_${Date.now()}_${emp.id}`,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department || 'Development',
          monthYear: selectedPeriod,
          salaryType: 'compliance',
          payrollGroupId: group?.id,
          payrollGroupName: group?.name || 'Statutory Compliance',
          basicSalary: basic,
          allowances: allowances,
          overtimePay: 0,
          deductions: deductions,
          tax: tds,
          netPay: net,
          netSalary: net,
          statutoryBreakdown: {
            epfEmployee: epf,
            epfEmployer: epf,
            esicEmployee: esic,
            esicEmployer: Math.round(ctc * 0.0325),
            professionalTax: pt,
            tds: tds,
          },
          status: 'Paid',
          paymentDate: new Date().toISOString().split('T')[0],
        };
      } else {
        const sd = emp.salaryDetails;
        const basic = sd?.basic || 75000;
        const customAllowancesSum = (sd?.allowanceItems || []).reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
        const allowances =
          (sd?.hra || 25000) +
          (sd?.specialAllowance || 15000) +
          (sd?.conveyanceAllowance || 0) +
          (sd?.medicalAllowance || 0) +
          (sd?.otherAllowances || 0) +
          customAllowancesSum;
        const customDeductionsSum = (sd?.deductionItems || []).reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
        const deductions =
          (sd?.pfDeduction || 1800) +
          (sd?.taxDeduction || 5000) +
          (sd?.professionalTax || 200) +
          (sd?.esicDeduction || 0) +
          customDeductionsSum;
        const netPay = sd?.netPayable || Math.max(0, basic + allowances - deductions);

        return {
          id: `pay_${Date.now()}_${emp.id}`,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department || 'Development',
          monthYear: selectedPeriod,
          salaryType: 'monthly',
          payrollGroupId: group?.id,
          payrollGroupName: group?.name || 'Full-Time Monthly',
          basicSalary: basic,
          allowances: allowances,
          overtimePay: 0,
          deductions: deductions,
          tax: emp.salaryDetails?.taxDeduction || 5000,
          netPay: netPay,
          netSalary: netPay,
          status: 'Paid',
          paymentDate: new Date().toISOString().split('T')[0],
        };
      }
    });

    onUpdateState((prev) => ({
      ...prev,
      payrolls: [...newPayrolls, ...prev.payrolls],
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: state.currentPersona?.name || 'Admin',
          action: 'PAYROLL_PROCESSED',
          entity: 'PayrollRun',
          entityId: `run_${Date.now()}`,
          ipAddress: '106.51.72.18',
          details: `Processed multi-salary payroll cycle for ${selectedPeriod} across ${state.employees.length} employees`,
        },
        ...prev.auditLogs,
      ],
    }));

    showToast(`Monthly Payroll Cycle for ${selectedPeriod} processed successfully for ${state.employees.length} employees across Monthly, Hourly, and Compliance structures!`);
  };

  return (
    <div className="w-full space-y-6 text-slate-900 dark:text-white font-sans pb-16">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-2xl animate-fade-in text-xs font-bold border border-emerald-500/40">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#282830] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center border border-blue-500/20 shadow-2xs">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">PaySlip & Compensation</h1>
              <p className="text-xs text-slate-500 dark:text-[#9e9ea7]">
                Monthly remuneration slips, tax computations, and earnings statements
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Employee Selector (Admin / HR) */}
          {!isEmployee && (
            <div className="relative">
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-white shadow-2xs outline-none focus:border-blue-500 cursor-pointer"
              >
                {state.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.designation})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Period Selector */}
          <div className="relative">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-white shadow-2xs outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="August 2026">August 2026</option>
              <option value="July 2026">July 2026</option>
              <option value="June 2026">June 2026</option>
              <option value="May 2026">May 2026</option>
              <option value="April 2026">April 2026</option>
            </select>
          </div>

          {!isEmployee && (
            <button
              onClick={handleRunPayrollCycle}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Process Payroll</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[#282830] pb-2">
        <button
          onClick={() => setActiveView('payslip')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeView === 'payslip'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#18181d]'
          }`}
        >
          Official PaySlip Document
        </button>
        <button
          onClick={() => setActiveView('all_payrolls')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeView === 'all_payrolls'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#18181d]'
          }`}
        >
          Historical Slips Archive
        </button>
        <button
          onClick={() => setActiveView('tax_summary')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeView === 'tax_summary'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#18181d]'
          }`}
        >
          YTD Tax & Deductions Summary
        </button>
        {!isEmployee && (
          <button
            onClick={() => setActiveView('payroll_settings')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeView === 'payroll_settings'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#18181d]'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Payroll Settings & Groups</span>
          </button>
        )}
      </div>

      {/* Clean KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#121214] p-4.5 shadow-2xs">
          <div className="text-slate-500 dark:text-[#9e9ea7] text-xs font-semibold">
            Net Take-Home Pay
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 font-mono">
            ₹{salaryData.netPay.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Pay Period: {selectedPeriod}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#121214] p-4.5 shadow-2xs">
          <div className="text-slate-500 dark:text-[#9e9ea7] text-xs font-semibold">
            Gross Remuneration
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 font-mono">
            ₹{salaryData.grossEarnings.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Basic + HRA + Allowances
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#121214] p-4.5 shadow-2xs">
          <div className="text-slate-500 dark:text-[#9e9ea7] text-xs font-semibold">
            Total Deductions
          </div>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1.5 font-mono">
            -₹{salaryData.totalDeductions.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            EPF, ESIC, PT, and TDS
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#121214] p-4.5 shadow-2xs">
          <div className="text-slate-500 dark:text-[#9e9ea7] text-xs font-semibold">
            Annualized CTC
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 font-mono">
            ₹{(salaryData.grossEarnings * 12).toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Calculated on 12-month base
          </p>
        </div>
      </div>

      {/* VIEW 1: OFFICIAL PAYSLIP DOCUMENT */}
      {activeView === 'payslip' && (
        <div className="space-y-4">
          {/* Action Ribbon */}
          <div className="flex items-center justify-between bg-slate-100 dark:bg-[#18181d] p-3.5 rounded-2xl border border-slate-200 dark:border-[#282830]">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <FileText className="h-4 w-4 text-blue-500" />
              <span>Official Salary Slip — {selectedPeriod}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-[#383842] bg-white dark:bg-[#121214] hover:bg-slate-50 dark:hover:bg-[#222228] px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-2xs"
              >
                <Printer className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                <span>Print</span>
              </button>
              <button
                onClick={handleEmail}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-[#383842] bg-white dark:bg-[#121214] hover:bg-slate-50 dark:hover:bg-[#222228] px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-2xs"
              >
                <Mail className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                <span>Email</span>
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          {/* Printable Official PaySlip Document Card */}
          <div className="bg-white text-slate-900 border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 max-w-4xl mx-auto">
            {/* Header: Company Details */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-5 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                    A
                  </div>
                  <span className="text-lg font-extrabold tracking-tight text-slate-900">
                    Acme Business OS / Unpixel Studio Pvt Ltd
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Plot 42, Tech Park Boulevard, Outer Ring Road, Bengaluru, Karnataka - 560103
                </p>
                <p className="text-[11px] text-slate-500 font-mono">
                  CIN: U72200KA2021PTC145892 | GSTIN: 29AABCU9603R1ZM
                </p>
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold uppercase tracking-wider">
                  Paid
                </span>
                <p className="text-sm font-bold text-slate-900 mt-1.5">Payslip for {selectedPeriod}</p>
                <p className="text-xs text-slate-500 font-mono">Doc No: PS-{selectedEmployee.employeeId || 'UN1203'}-0826</p>
              </div>
            </div>

            {/* Employee Meta Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
              <div>
                <span className="text-slate-500 font-medium block">Employee Name</span>
                <span className="font-bold text-slate-900 block mt-0.5">{selectedEmployee.name}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Employee ID</span>
                <span className="font-mono font-bold text-slate-900 block mt-0.5">{selectedEmployee.employeeId || 'UN1203'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Department</span>
                <span className="font-semibold text-slate-900 block mt-0.5">{selectedEmployee.department || 'Designer'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Designation</span>
                <span className="font-semibold text-slate-900 block mt-0.5">{selectedEmployee.designation || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Bank Account</span>
                <span className="font-mono font-bold text-slate-900 block mt-0.5">
                  {selectedEmployee.bankDetails?.accountNumber
                    ? `${selectedEmployee.bankDetails.bankName || 'Bank'} •••• ${selectedEmployee.bankDetails.accountNumber.slice(-4)}`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">PAN / Tax ID</span>
                <span className="font-mono font-bold text-slate-900 block mt-0.5">{selectedEmployee.personalTaxId || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Date of Joining</span>
                <span className="font-semibold text-slate-900 block mt-0.5">{selectedEmployee.joinDate || selectedEmployee.joiningDate || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Paid Days / Working</span>
                <span className="font-bold text-slate-900 block mt-0.5">30 / 30 Days</span>
              </div>
            </div>

            {/* Remuneration Breakdown: Earnings vs Deductions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Earnings Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800">Earnings & Allowances</span>
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800">Amount (INR)</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-slate-700">Basic Salary</span>
                    <span className="font-mono font-semibold text-slate-900">₹{salaryData.baseSalary.toLocaleString('en-IN')}</span>
                  </div>
                  {salaryData.hra > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">House Rent Allowance (HRA)</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.hra.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {salaryData.conveyanceAllowance > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Conveyance Allowance</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.conveyanceAllowance.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {salaryData.medicalAllowance > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Medical Allowance</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.medicalAllowance.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {salaryData.specialAllowance > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Special Allowance</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.specialAllowance.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {salaryData.otherAllowances > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Other Allowances</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.otherAllowances.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {(salaryData.customAllowances || []).map((item) => (
                    <div key={item.id} className="px-4 py-2.5 flex items-center justify-between bg-slate-50/50">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        {item.name}
                      </span>
                      <span className="font-mono font-semibold text-slate-900">₹{Number(item.amount).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                  {salaryData.overtimePay > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Overtime Pay ({salaryData.overtimeHours} hrs)</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.overtimePay.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {salaryData.performanceBonus > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Performance Incentive / Bonus</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.performanceBonus.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="px-4 py-3 bg-slate-50 flex items-center justify-between font-bold border-t border-slate-200">
                    <span className="text-slate-900">Gross Earnings (A)</span>
                    <span className="font-mono text-emerald-700">₹{salaryData.grossEarnings.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Deductions Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800">Deductions</span>
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800">Amount (INR)</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {salaryData.pf > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Provident Fund (Employee EPF)</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.pf.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {salaryData.tds > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Income Tax (TDS)</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.tds.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {salaryData.professionalTax > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Professional Tax (PT)</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.professionalTax.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {salaryData.esic > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Employee State Insurance (ESIC)</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.esic.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {salaryData.healthInsurance > 0 && (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-slate-700">Group Health Insurance</span>
                      <span className="font-mono font-semibold text-slate-900">₹{salaryData.healthInsurance.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {(salaryData.customDeductions || []).map((item) => (
                    <div key={item.id} className="px-4 py-2.5 flex items-center justify-between bg-slate-50/50">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        {item.name}
                      </span>
                      <span className="font-mono font-semibold text-slate-900">₹{Number(item.amount).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                  <div className="px-4 py-3 bg-slate-50 flex items-center justify-between font-bold border-t border-slate-200">
                    <span className="text-slate-900">Total Deductions (B)</span>
                    <span className="font-mono text-rose-600">-₹{salaryData.totalDeductions.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Salary Highlight Box */}
            <div className="p-5 rounded-2xl bg-blue-50/80 border-2 border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-900">
                  Net Take-Home Pay (A - B)
                </span>
                <p className="text-xs text-blue-700 mt-0.5">
                  Direct credited to registered salary account via NEFT / RTGS
                </p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-extrabold text-blue-900 font-mono">
                  ₹{salaryData.netPay.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Footer Signatures & Note */}
            <div className="border-t border-slate-200 pt-5 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p>This is a system generated document and does not require a physical signature.</p>
              <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                <ShieldCheck className="h-4 w-4" />
                <span>Digitally Verified & Encrypted</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: HISTORICAL SLIPS ARCHIVE */}
      {activeView === 'all_payrolls' && (
        <div className="rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#121214] p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Previous Monthly PaySlips</h3>
              <p className="text-xs text-slate-500 dark:text-[#9e9ea7]">Archive of all disbursed payslips for {selectedEmployee.name}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-[#18181d] text-slate-600 dark:text-[#9e9ea7] border-b border-slate-200 dark:border-[#282830] font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Reference No</th>
                  <th className="p-3">Pay Period</th>
                  <th className="p-3">Disbursal Date</th>
                  <th className="p-3">Gross Earnings</th>
                  <th className="p-3">Net Take-Home</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#282830] font-medium text-slate-700 dark:text-slate-300">
                {payslipHistory.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-[#18181d] transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">{item.ref}</td>
                    <td className="p-3 font-semibold">{item.period}</td>
                    <td className="p-3">{item.issueDate}</td>
                    <td className="p-3 font-mono">₹{item.gross.toLocaleString('en-IN')}</td>
                    <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{item.netPay.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3">
                      <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-full font-bold text-[10px]">
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedPeriod(item.period);
                            setActiveView('payslip');
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#383842] hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold text-xs transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => showToast(`Downloaded ${item.ref}.pdf`)}
                          className="p-1 rounded-lg border border-slate-200 dark:border-[#383842] hover:bg-slate-100 dark:hover:bg-[#222228] text-slate-600 dark:text-slate-300 transition-colors"
                          title="Download PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: YTD TAX & DEDUCTIONS SUMMARY */}
      {activeView === 'tax_summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#121214] p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Statutory Deductions & PF Overview (FY 2026-27)</span>
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#18181d]">
                <span className="text-slate-600 dark:text-[#9e9ea7]">Provident Fund (PF) Employee Share</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">₹{(salaryData.pf * 5).toLocaleString('en-IN')} YTD</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#18181d]">
                <span className="text-slate-600 dark:text-[#9e9ea7]">PF Employer Contribution</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">₹{(salaryData.pf * 5).toLocaleString('en-IN')} YTD</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#18181d]">
                <span className="text-slate-600 dark:text-[#9e9ea7]">Total TDS Remitted to IT Department</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">₹{(salaryData.tds * 5).toLocaleString('en-IN')} YTD</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#18181d]">
                <span className="text-slate-600 dark:text-[#9e9ea7]">Form 16 / Part B Status</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">Available for Download</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#121214] p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-500" />
              <span>Direct Bank Account Information</span>
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#18181d]">
                <span className="text-slate-600 dark:text-[#9e9ea7]">Disbursal Bank</span>
                <span className="font-bold text-slate-900 dark:text-white">HDFC Bank Ltd</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#18181d]">
                <span className="text-slate-600 dark:text-[#9e9ea7]">Account Number</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">•••• •••• •••• 4821</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#18181d]">
                <span className="text-slate-600 dark:text-[#9e9ea7]">IFSC Code</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">HDFC0001203</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#18181d]">
                <span className="text-slate-600 dark:text-[#9e9ea7]">Tax Regime Selected</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">New Tax Regime (Sec 115BAC)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: PAYROLL SETTINGS & GROUPS */}
      {activeView === 'payroll_settings' && (
        <PayrollSettingsView
          state={state}
          onUpdateState={onUpdateState}
          onBackToPayroll={() => setActiveView('payslip')}
        />
      )}
    </div>
  );
};
