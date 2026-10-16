'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  User,
  MapPin,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  UploadCloud,
  FileText,
  Check,
  FileCheck,
  Sparkles,
  Building,
  Trash2,
  Paperclip,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';
import { Employee, UserPersona, CustomProfileField, OnboardingSectionKey } from '@/types';
import { initialOnboardingFields } from '@/data/initialData';
import { WORLD_NATIONALITIES, WORLD_COUNTRIES } from '@/data/nations';
import { saveStoredState } from '@/services/store';
import { evaluateCognitoPassword } from '@/utils/cognitoPasswordPolicy';

interface EmployeeOnboardingViewProps {
  employeeId?: string;
  onComplete?: () => void;
}

export const EmployeeOnboardingView: React.FC<EmployeeOnboardingViewProps> = ({
  employeeId,
  onComplete,
}) => {
  const { state, updateState, triggerToast, selectPersona, syncWithBackend } = useApp();

  // Find targeted employee or current persona
  const targetEmployee = useMemo(() => {
    if (employeeId) {
      const found = state.employees.find((e) => e.id === employeeId || e.employeeId === employeeId);
      if (found) return found;
    }
    const persona = state.currentPersona;
    const currentMatch = (state.employees || []).find(
      (e) =>
        (persona?.id && e.id === persona.id) ||
        (persona?.email && e.email?.toLowerCase() === persona.email.toLowerCase())
    );
    if (currentMatch) return currentMatch;
    // Never fall back to a random incomplete row — that can update the wrong employee.
    return undefined;
  }, [employeeId, state.employees, state.currentPersona]);

  // Dynamic configured onboarding fields
  const configuredFields = useMemo<CustomProfileField[]>(() => {
    if (state.customOptions?.onboardingFields && state.customOptions.onboardingFields.length > 0) {
      return state.customOptions.onboardingFields;
    }
    return initialOnboardingFields;
  }, [state.customOptions?.onboardingFields]);

  // Current Step: 1 to 5
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // STEP 1: Change / Set Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [step1Error, setStep1Error] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // STEP 2: Personal Details State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<string>('None');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [maritalStatus, setMaritalStatus] = useState<string>('Single');
  const [nationality, setNationality] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [step2Error, setStep2Error] = useState('');

  // STEP 3: Residential Address & Emergency Contacts State
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('United States');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('Family');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [step3Error, setStep3Error] = useState('');

  // STEP 4: Document Uploads State
  const [uploadedFiles, setUploadedFiles] = useState<
    Record<string, { id: string; name: string; size: string; type: string; uploadDate: string }>
  >({});
  const [step5Error, setStep5Error] = useState('');

  // Custom User-Defined Field Values Map: { [fieldId]: value }
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});

  // STEP 5: Review & Confirmation State
  const [agreedToDeclaration, setAgreedToDeclaration] = useState(true);
  const [step5ReviewError, setStep5ReviewError] = useState('');

  // Hydrate fields from target employee
  useEffect(() => {
    if (targetEmployee) {
      setFullName(targetEmployee.name || '');
      setEmail(targetEmployee.email || '');
      setPhone(targetEmployee.phone && targetEmployee.phone !== '—' ? targetEmployee.phone : '');
      if (targetEmployee.dateOfBirth) setDateOfBirth(targetEmployee.dateOfBirth);
      if (targetEmployee.gender) setGender(targetEmployee.gender);
      if (targetEmployee.bloodGroup) setBloodGroup(targetEmployee.bloodGroup);
      if (targetEmployee.maritalStatus) setMaritalStatus(targetEmployee.maritalStatus);
      if (targetEmployee.nationality) setNationality(targetEmployee.nationality);
      if (targetEmployee.primaryAddress) setStreetAddress(targetEmployee.primaryAddress);
      if (targetEmployee.city) setCity(targetEmployee.city);
      if (targetEmployee.stateProvince) setStateProvince(targetEmployee.stateProvince);
      if (targetEmployee.postalCode) setPostalCode(targetEmployee.postalCode);
      if (targetEmployee.country) setCountry(targetEmployee.country);

      if (targetEmployee.emergencyContact?.name && targetEmployee.emergencyContact.name !== '—') {
        setEmergencyName(targetEmployee.emergencyContact.name);
      }
      if (targetEmployee.emergencyContact?.relation && targetEmployee.emergencyContact.relation !== '—') {
        setEmergencyRelation(targetEmployee.emergencyContact.relation);
      }
      if (targetEmployee.emergencyContact?.phone && targetEmployee.emergencyContact.phone !== '—') {
        setEmergencyPhone(targetEmployee.emergencyContact.phone);
      }
      if (targetEmployee.customFieldValues) {
        setCustomFieldValues(targetEmployee.customFieldValues);
      }
    }
  }, [targetEmployee]);

  // Helper to handle real file selection
  const handleSimulateFileUpload = (fieldId: string, fieldLabel: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setUploadedFiles((prev) => ({
        ...prev,
        [fieldId]: {
          id: `doc_${Date.now()}`,
          name: file.name,
          size: `${sizeMb} MB`,
          type: file.type || 'application/pdf',
          uploadDate: new Date().toISOString().split('T')[0],
        },
      }));
    }
  };

  const handleRemoveUploadedFile = (fieldId: string) => {
    setUploadedFiles((prev) => {
      const copy = { ...prev };
      delete copy[fieldId];
      return copy;
    });
  };

  // Step Validation & Navigation
  const handleNextStep = () => {
    // Step 1: Password Change
    if (step === 1) {
      // Optional: the account password was already created from the invite link.
      if (!newPassword.trim() && !confirmPassword.trim()) {
        setStep1Error('');
        setStep(2);
        return;
      }
      const strength = evaluateCognitoPassword(newPassword);
      if (!strength.isValid) {
        const missingStr = strength.missingRequirements.join(', ');
        setStep1Error(`Password must meet all security requirements. Missing: ${missingStr}.`);
        return;
      }
      if (newPassword !== confirmPassword) {
        setStep1Error('New passwords do not match');
        return;
      }
      setStep1Error('');
      setStep(2);
      return;
    }

    // Step 2: Personal Details & Basic Info
    if (step === 2) {
      const basicPersonalFields = configuredFields.filter(
        (f) => f.enabled && (f.section === 'basic' || f.section === 'personal')
      );
      for (const field of basicPersonalFields) {
        if (!field.required) continue;
        if (field.name === 'name' && !fullName.trim()) {
          setStep2Error('Full Legal Name is mandatory');
          return;
        }
        if (field.name === 'phone' && !phone.trim()) {
          setStep2Error('Contact Phone Number is mandatory');
          return;
        }
        if (field.name === 'phone' && phone.trim() && phone.replace(/\D/g, '').length !== 10) {
          setStep2Error('Phone number must be exactly 10 digits');
          return;
        }
        if (field.name === 'dateOfBirth') {
          if (!dateOfBirth.trim()) {
            setStep2Error('Date of Birth is mandatory');
            return;
          }
          const today = new Date().toISOString().split('T')[0];
          if (dateOfBirth > today) {
            setStep2Error('Date of Birth cannot be in the future');
            return;
          }
        }
        // Custom fields validation
        if (!field.isSystemDefault) {
          const val = customFieldValues[field.id];
          if (!val || String(val).trim() === '') {
            setStep2Error(`"${field.label}" is required`);
            return;
          }
        }
      }
      setStep2Error('');
      setStep(3);
      return;
    }

    // Step 3: Address & Emergency Contacts
    if (step === 3) {
      const addressFields = configuredFields.filter((f) => f.enabled && f.section === 'address');
      for (const field of addressFields) {
        if (!field.required) continue;
        if (field.name === 'primaryAddress' && !streetAddress.trim()) {
          setStep3Error('Residential Street Address is required');
          return;
        }
        if (field.name === 'city' && !city.trim()) {
          setStep3Error('City is required');
          return;
        }
        if (field.name === 'postalCode' && !postalCode.trim()) {
          setStep3Error('Postal / ZIP Code is required');
          return;
        }
        if (field.name === 'postalCode' && postalCode.trim() && !/^[A-Z0-9][A-Z0-9\s-]{1,9}$/i.test(postalCode.trim())) {
          setStep3Error('Enter a valid postal / ZIP code (3–10 letters or digits)');
          return;
        }
        if (field.name === 'emergencyContactName' && !emergencyName.trim()) {
          setStep3Error('Emergency Contact Name is required');
          return;
        }
        if (field.name === 'emergencyContactPhone' && !emergencyPhone.trim()) {
          setStep3Error('Emergency Contact Phone is required');
          return;
        }
        if (field.name === 'emergencyContactPhone' && emergencyPhone.trim() && emergencyPhone.replace(/\D/g, '').length !== 10) {
          setStep3Error('Emergency phone must be exactly 10 digits');
          return;
        }
        if (!field.isSystemDefault) {
          const val = customFieldValues[field.id];
          if (!val || String(val).trim() === '') {
            setStep3Error(`"${field.label}" is required`);
            return;
          }
        }
      }
      setStep3Error('');
      setStep(4);
      return;
    }

    // Step 4: Document Uploads
    if (step === 4) {
      const docFields = configuredFields.filter((f) => f.enabled && f.section === 'documents');
      for (const field of docFields) {
        if (field.required && !uploadedFiles[field.id]) {
          setStep5Error(`Please upload the required document: "${field.label}"`);
          return;
        }
      }
      setStep5Error('');
      setStep(5);
      return;
    }

    // Step 5: Review & Final Submission
    if (step === 5) {
      if (!agreedToDeclaration) {
        setStep5ReviewError('Please confirm the profile accuracy declaration');
        return;
      }
      setStep5ReviewError('');
      handleFinishOnboarding();
    }
  };

  const handleFinishOnboarding = async () => {
    if (!targetEmployee?.id || isSubmitting) {
      if (!targetEmployee?.id) {
        triggerToast({
          title: 'Profile not ready',
          message: 'Your employee record has not loaded yet. Refresh and try again.',
          type: 'error',
        });
      }
      return;
    }

    setIsSubmitting(true);
    // The password was set from the invite email; only change it if the user chose a new one here.
    const changedPassword = newPassword.trim() || undefined;

    const docsArray = Object.entries(uploadedFiles).map(([fieldId, file]) => {
      const fieldDef = configuredFields.find((f) => f.id === fieldId);
      return {
        id: file.id,
        fieldId,
        name: file.name,
        size: file.size,
        type: file.type,
        category: fieldDef?.label || 'General Document',
        uploadDate: file.uploadDate,
      };
    });

    const nameParts = fullName.trim().split(' ');
    const fName = nameParts[0] || fullName.trim();
    const lName = nameParts.slice(1).join(' ') || '';

    try {
      // Backend first — localStorage no longer holds domain data, so this must succeed.
      await api.identity.updateEmployee(targetEmployee.id, {
        firstName: fName,
        lastName: lName,
        password: changedPassword,
        isActivated: true,
        accountStatus: 'Active',
        hasCompletedProfile: true,
        onboardingProgress: 100,
        phone: phone.trim(),
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
        bloodGroup: bloodGroup || undefined,
        maritalStatus: maritalStatus || undefined,
        nationality: nationality || undefined,
        primaryAddress: streetAddress || undefined,
        city: city || undefined,
        stateProvince: stateProvince || undefined,
        postalCode: postalCode || undefined,
        country: country || undefined,
        emergencyContact: {
          name: emergencyName.trim(),
          relation: emergencyRelation.trim(),
          phone: emergencyPhone.trim(),
        },
        customFieldValues,
        uploadedDocuments: docsArray,
        employmentStatus: 'active',
      });

      const updatedEmployees: Employee[] = (state.employees || []).map((emp) => {
        if (emp.id === targetEmployee.id || emp.employeeId === targetEmployee.employeeId) {
          return {
            ...emp,
            name: fullName.trim(),
            fullName: fullName.trim(),
            phone: phone.trim(),
            dateOfBirth: dateOfBirth || emp.dateOfBirth,
            gender: (gender as any) || emp.gender,
            bloodGroup: bloodGroup || emp.bloodGroup,
            maritalStatus: maritalStatus || emp.maritalStatus,
            nationality: nationality || emp.nationality,
            primaryAddress: streetAddress || emp.primaryAddress,
            city: city || emp.city,
            stateProvince: stateProvince || emp.stateProvince,
            postalCode: postalCode || emp.postalCode,
            country: country || emp.country,
            customFieldValues: {
              ...(emp.customFieldValues || {}),
              ...customFieldValues,
            },
            uploadedDocuments: docsArray,
            isActivated: true,
            hasCompletedProfile: true,
            status: 'Active',
            accountStatus: 'Active',
            onboardingProgress: 100,
            emergencyContact: {
              name: emergencyName.trim() || emp.emergencyContact?.name || '',
              relation: emergencyRelation.trim() || emp.emergencyContact?.relation || '',
              phone: emergencyPhone.trim() || emp.emergencyContact?.phone || '',
            },
          };
        }
        return emp;
      });

      const updatedPersona: UserPersona = {
        id: targetEmployee.id,
        name: fullName.trim(),
        email: targetEmployee.email,
        role: (targetEmployee.role as any) || 'employee',
        designation: targetEmployee.designation,
        department: targetEmployee.department,
        avatar: targetEmployee.avatar,
      };

      const nextState = {
        ...state,
        employees: updatedEmployees,
        currentPersona: updatedPersona,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: fullName.trim(),
            action: 'EMPLOYEE_ONBOARDING_COMPLETED',
            entity: 'EmployeeProfile',
            entityId: targetEmployee.id,
            ipAddress: '106.51.72.18',
            details: `Profile and onboarding successfully completed by ${fullName.trim()} with ${docsArray.length} verified documents.`,
          },
          ...(state.auditLogs || []),
        ],
      };

      updateState((prev) => ({
        ...prev,
        employees: updatedEmployees,
        currentPersona: updatedPersona,
        auditLogs: nextState.auditLogs,
      }));
      selectPersona(updatedPersona);
      saveStoredState({
        ...state,
        ...nextState,
      });

      // Re-hydrate from backend so AppShell gates see durable completion flags.
      try {
        await syncWithBackend({
          ...state,
          employees: updatedEmployees,
          currentPersona: updatedPersona,
        } as any);
      } catch (syncErr) {
        console.warn('[Onboarding] Post-complete sync note:', syncErr);
      }

      triggerToast({
        title: 'Onboarding Complete',
        message: `Welcome to the workspace, ${fullName.trim()}! Your profile has been activated.`,
        type: 'success',
      });

      if (onComplete) onComplete();
    } catch (err: any) {
      console.error('[Onboarding] Backend sync error:', err);
      triggerToast({
        title: 'Could not finish onboarding',
        message: err?.message || 'Your profile was not saved. Please try again.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to render custom user-added fields
  const renderCustomFieldsForSection = (sec: OnboardingSectionKey) => {
    const customFields = configuredFields.filter((f) => f.enabled && !f.isSystemDefault && f.section === sec);
    if (customFields.length === 0) return null;

    return (
      <div className="pt-4 border-t border-slate-100 dark:border-[#282830] space-y-4">
        <div>
          <h4 className="font-extrabold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
            Additional Required Information
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">Custom details specified by HR for your onboarding.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {customFields.map((field) => (
            <div key={field.id} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>

              {field.type === 'select' ? (
                <select
                  value={customFieldValues[field.id] || ''}
                  onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-600 font-medium cursor-pointer"
                >
                  <option value="">Select option...</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={customFieldValues[field.id] || ''}
                  onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder || 'Enter details...'}
                  className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-600 font-medium resize-none"
                />
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
                  value={customFieldValues[field.id] || ''}
                  onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                  className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-600 font-medium transition-all"
                />
              )}
              {field.description && <p className="text-[10px] text-slate-400 mt-1">{field.description}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-full bg-white dark:bg-[#0c0c0e] flex flex-col font-sans text-slate-900 dark:text-white overflow-hidden">
      {!targetEmployee?.id ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-semibold text-slate-800 dark:text-white">Loading your employee profile…</p>
          <p className="text-xs text-slate-500 dark:text-[#9e9ea7] max-w-sm">
            If this does not resolve in a few seconds, refresh the page or sign in again.
          </p>
        </div>
      ) : null}
      {/* Split Main Area */}
      <div className={`flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 ${!targetEmployee?.id ? 'hidden' : ''}`}>
        {/* Left Area (Step Progress & Typography) */}
        <div className="w-full lg:w-[38%] bg-white dark:bg-[#121214] p-6 sm:p-8 md:p-12 lg:p-14 flex flex-col justify-between overflow-y-auto shrink-0 border-r border-slate-100 dark:border-[#282830]">
          <div>
            {/* 5 Step Progress Indicators */}
            <div className="space-y-3 mb-6 sm:mb-8">
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-2 rounded-sm transition-all ${
                      i <= step ? 'w-6 sm:w-7 bg-blue-600' : 'w-6 sm:w-7 bg-slate-200 dark:bg-[#282830]'
                    }`}
                  />
                ))}
              </div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pt-1">
                STEP {step} OF 5
              </p>
            </div>

            {/* Contextual Step Headings & Copy */}
            <div className="space-y-3 max-w-md">
              {step === 1 && (
                <>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight">
                    Account Security
                  </h1>
                  <p className="text-slate-500 dark:text-[#9e9ea7] text-xs sm:text-sm leading-relaxed">
                    You created your password from the invitation email. You can change it here, or continue to your profile.
                  </p>
                </>
              )}

              {step === 2 && (
                <>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight">
                    Personal Details & Identity
                  </h1>
                  <p className="text-slate-500 dark:text-[#9e9ea7] text-xs sm:text-sm leading-relaxed">
                    Confirm your official legal identity, date of birth, and primary contact coordinates for company directory records.
                  </p>
                </>
              )}

              {step === 3 && (
                <>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight">
                    Address & Emergency Contact
                  </h1>
                  <p className="text-slate-500 dark:text-[#9e9ea7] text-xs sm:text-sm leading-relaxed">
                    Provide your residential location and primary emergency contact for workplace compliance and safety.
                  </p>
                </>
              )}

              {step === 4 && (
                <>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight">
                    Document Uploads
                  </h1>
                  <p className="text-slate-500 dark:text-[#9e9ea7] text-xs sm:text-sm leading-relaxed">
                    Upload official copies of your government photo ID, academic certificates, and signed NDA for verification.
                  </p>
                </>
              )}

              {step === 5 && (
                <>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight">
                    Review & Complete Setup
                  </h1>
                  <p className="text-slate-500 dark:text-[#9e9ea7] text-xs sm:text-sm leading-relaxed">
                    Review your profile summary, accept the accuracy declaration, and enter your workspace.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Action Navigation Buttons */}
          <div className="flex items-center gap-3 pt-8 mt-auto">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.max(1, prev - 1) as any)}
                className="px-6 py-3 rounded-xl border border-slate-200 dark:border-[#282830] text-slate-700 dark:text-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-50 dark:hover:bg-[#18181d] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Go Back</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNextStep}
              disabled={isSubmitting}
              className="flex-1 py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs sm:text-sm transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? 'Saving & Activating Profile...' : step === 5 ? 'Complete Onboarding & Enter' : 'Continue'}</span>
              {!isSubmitting && step < 5 && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Right Area (Scrollable Form Canvas on #f8fafc) */}
        <div className="flex-1 bg-[#f8fafc] dark:bg-[#0c0c0e] p-4 sm:p-8 md:p-10 lg:p-12 overflow-y-auto custom-scrollbar">
          <div className="max-w-2xl mx-auto w-full pb-12">
            
            {/* ========================================================================= */}
            {/* STEP 1: CHANGE PASSWORD                                                   */}
            {/* ========================================================================= */}
            {step === 1 && (
              <div className="bg-white dark:bg-[#121214] rounded-3xl p-6 sm:p-8 md:p-9 border border-slate-200/80 dark:border-[#282830] shadow-2xs space-y-5 animate-fade-in text-slate-900 dark:text-white">
                <div className="border-b border-slate-100 dark:border-[#282830] pb-4">
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">Change password (optional)</h3>
                  <p className="text-xs text-slate-500 dark:text-[#9e9ea7] mt-1">Leave these fields empty to keep the password you just created.</p>
                </div>

                {step1Error && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{step1Error}</span>
                  </div>
                )}

                <div className="space-y-4">
                  {/* New Password */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Leave empty to keep your current password"
                        autoComplete="new-password"
                        className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium bg-white dark:bg-[#18181d] text-slate-900 dark:text-white transition-all pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 cursor-pointer"
                      >
                        {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPass ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium bg-white dark:bg-[#18181d] text-slate-900 dark:text-white transition-all pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 cursor-pointer"
                      >
                        {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 2: PERSONAL DETAILS                                                  */}
            {/* ========================================================================= */}
            {step === 2 && (
              <div className="bg-white dark:bg-[#121214] rounded-3xl p-6 sm:p-8 md:p-9 border border-slate-200/80 dark:border-[#282830] shadow-2xs space-y-5 animate-fade-in text-slate-900 dark:text-white">
                <div className="border-b border-slate-100 dark:border-[#282830] pb-4">
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">Identity & Contact Info</h3>
                  <p className="text-xs text-slate-500 dark:text-[#9e9ea7] mt-1">Please confirm your legal name, birthday, and contact numbers.</p>
                </div>

                {step2Error && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{step2Error}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Full Legal Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Alex Mercer"
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Official Work Email <span className="text-slate-400 font-normal">(Verified)</span>
                    </label>
                    <input
                      type="email"
                      disabled
                      value={email}
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-slate-50 dark:bg-[#18181d] px-4.5 py-3 text-sm text-slate-500 dark:text-[#9e9ea7] font-medium cursor-not-allowed font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Phone Number (10 Digits) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="e.g. 9876543210"
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Date of Birth <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      max={new Date().toISOString().split('T')[0]}
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all cursor-pointer"
                    />
                  </div>
                </div>

                {/* Gender Identity */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                    Gender Identity
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                    {(['None', 'Male', 'Female', 'Non-Binary', 'Prefer not to say'] as const).map((g) => {
                      const isSel = gender === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGender(g)}
                          className={`px-3 py-2.5 rounded-2xl border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                            isSel
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-2xs ring-1 ring-blue-500'
                              : 'border-slate-200 dark:border-[#282830] text-slate-700 dark:text-slate-300 bg-white dark:bg-[#18181d]'
                          }`}
                        >
                          <span className="truncate">{g}</span>
                          <div
                            className={`w-3 h-3 rounded-full border flex items-center justify-center shrink-0 ml-1.5 ${
                              isSel ? 'border-blue-600 bg-blue-600' : 'border-slate-300 dark:border-slate-600'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Blood Group & Marital Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Blood Group
                    </label>
                    <select
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-600 font-medium cursor-pointer"
                    >
                      {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Marital Status
                    </label>
                    <select
                      value={maritalStatus}
                      onChange={(e) => setMaritalStatus(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-600 font-medium cursor-pointer"
                    >
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Nationality & Personal Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Nationality / Citizenship
                    </label>
                    <select
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all cursor-pointer"
                    >
                      <option value="">Select Nationality</option>
                      {WORLD_NATIONALITIES.map((nat) => (
                        <option key={nat} value={nat}>
                          {nat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Personal Backup Email
                    </label>
                    <input
                      type="email"
                      value={personalEmail}
                      onChange={(e) => setPersonalEmail(e.target.value)}
                      placeholder="e.g. personal@gmail.com"
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all"
                    />
                  </div>
                </div>

                {/* Dynamic Custom Fields for Personal section */}
                {renderCustomFieldsForSection('personal')}
                {renderCustomFieldsForSection('basic')}
              </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 3: ADDRESS & EMERGENCY CONTACTS                                      */}
            {/* ========================================================================= */}
            {step === 3 && (
              <div className="bg-white dark:bg-[#121214] rounded-3xl p-6 sm:p-8 md:p-9 border border-slate-200/80 dark:border-[#282830] shadow-2xs space-y-5 animate-fade-in text-slate-900 dark:text-white">
                <div className="border-b border-slate-100 dark:border-[#282830] pb-4">
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">Residential & Emergency Contact</h3>
                  <p className="text-xs text-slate-500 dark:text-[#9e9ea7] mt-1">Your residential address and emergency contact details.</p>
                </div>

                {step3Error && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{step3Error}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Street Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      placeholder="e.g. 42 Park Avenue, Apartment 5B"
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. New York, Bengaluru"
                        className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                        State / Province <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={stateProvince}
                        onChange={(e) => setStateProvince(e.target.value)}
                        placeholder="e.g. NY, Karnataka"
                        className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                        Postal / ZIP Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={10}
                        value={postalCode}
                        onChange={(e) =>
                          setPostalCode(e.target.value.toUpperCase().replace(/[^A-Z0-9\s-]/g, '').slice(0, 10))
                        }
                        placeholder="e.g. 10001"
                        className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                        Country <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all cursor-pointer"
                      >
                        <option value="">Select Country</option>
                        {WORLD_COUNTRIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact Section */}
                <div className="pt-4 border-t border-slate-100 dark:border-[#282830] space-y-4">
                  <div>
                    <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">Emergency Point of Contact</h4>
                    <p className="text-xs text-slate-500 dark:text-[#9e9ea7] mt-0.5">Primary individual to contact in case of workplace emergencies.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                        Contact Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={emergencyName}
                        onChange={(e) => setEmergencyName(e.target.value)}
                        placeholder="e.g. Sarah Mercer"
                        className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                        Relationship <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={emergencyRelation}
                        onChange={(e) => setEmergencyRelation(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-600 font-medium cursor-pointer"
                      >
                        <option value="Spouse">Spouse</option>
                        <option value="Parent">Parent</option>
                        <option value="Sibling">Sibling</option>
                        <option value="Family">Family Member</option>
                        <option value="Friend">Friend / Guardian</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      Emergency Phone (10 Digits) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="e.g. 9876543210"
                      className="w-full rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4.5 py-3 text-sm outline-none focus:border-blue-600 font-medium text-slate-900 dark:text-white transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Dynamic Custom Fields for Address section */}
                {renderCustomFieldsForSection('address')}
              </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 4: DOCUMENT UPLOADS                                                  */}
            {/* ========================================================================= */}
            {step === 4 && (
              <div className="bg-white dark:bg-[#121214] rounded-3xl p-6 sm:p-8 md:p-9 border border-slate-200/80 dark:border-[#282830] shadow-2xs space-y-6 animate-fade-in text-slate-900 dark:text-white">
                <div className="border-b border-slate-100 dark:border-[#282830] pb-4">
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">
                    Compliance & Supporting Documents
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#9e9ea7] mt-1">
                    Upload official PDF scans or clear photos for compliance and background verification.
                  </p>
                </div>

                {step5Error && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{step5Error}</span>
                  </div>
                )}

                {/* Document Slots Grid */}
                <div className="space-y-3">
                  {configuredFields
                    .filter((f) => f.enabled && f.section === 'documents')
                    .map((field) => {
                      const uploaded = uploadedFiles[field.id];

                      return (
                        <div
                          key={field.id}
                          className="p-4 sm:p-4.5 rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#18181d] hover:border-slate-300 dark:hover:border-[#383842] transition-all"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white">
                                  {field.label}
                                </span>
                                {field.required ? (
                                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-[#25252c] text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-[#32323c]">
                                    Required
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
                                    Optional
                                  </span>
                                )}
                              </div>
                              {field.description && (
                                <p className="text-[11px] text-slate-400 leading-relaxed">{field.description}</p>
                              )}
                            </div>

                            {/* Upload Action / Uploaded File Status */}
                            <div className="shrink-0">
                              {uploaded ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#202026] border border-slate-200/80 dark:border-[#2e2e38] text-slate-700 dark:text-slate-200 text-xs">
                                    <div className="w-4 h-4 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    </div>
                                    <span className="font-medium text-slate-800 dark:text-slate-200 max-w-[150px] truncate">{uploaded.name}</span>
                                    <span className="text-[10px] text-slate-400 font-normal">({uploaded.size})</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveUploadedFile(field.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-[#282830] transition-colors cursor-pointer"
                                    title="Remove file"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-xs cursor-pointer active:scale-95">
                                  <UploadCloud className="w-3.5 h-3.5" />
                                  <span>Select File</span>
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                    onChange={(e) => handleSimulateFileUpload(field.id, field.label, e)}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* STEP 5: REVIEW & DECLARATION                                              */}
            {/* ========================================================================= */}
            {step === 5 && (
              <div className="bg-white dark:bg-[#121214] rounded-3xl p-6 sm:p-8 md:p-9 border border-slate-200/80 dark:border-[#282830] shadow-2xs space-y-5 animate-fade-in text-slate-900 dark:text-white">
                <div className="border-b border-slate-100 dark:border-[#282830] pb-4">
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">Review Profile & Credentials</h3>
                  <p className="text-xs text-slate-500 dark:text-[#9e9ea7] mt-1">Please review your submitted profile details before completing onboarding.</p>
                </div>

                {step5ReviewError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-300 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{step5ReviewError}</span>
                  </div>
                )}

                {/* Profile Summary Roster */}
                <div className="space-y-3.5">
                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#16161a] border border-slate-200/90 dark:border-[#282830] space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-[#24242c]">
                      <span>1. Account Credentials</span>
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-semibold text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Password Configured
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                      Login password updated and secured.
                    </p>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#16161a] border border-slate-200/90 dark:border-[#282830] space-y-3 shadow-2xs">
                    <div className="text-xs font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-[#24242c]">2. Personal & Contact Details</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
                      <div>
                        <span className="text-slate-400 text-[11px] font-medium block mb-0.5">Legal Name</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{fullName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] font-medium block mb-0.5">Official Email</span>
                        <span className="font-semibold text-slate-900 dark:text-white truncate block">{email}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] font-medium block mb-0.5">Phone</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{phone || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] font-medium block mb-0.5">Date of Birth</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{dateOfBirth || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] font-medium block mb-0.5">Gender</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{gender}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] font-medium block mb-0.5">Blood Group</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{bloodGroup}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#16161a] border border-slate-200/90 dark:border-[#282830] space-y-3 shadow-2xs">
                    <div className="text-xs font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-[#24242c]">3. Residence & Emergency</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <div>
                        <span className="text-slate-400 text-[11px] font-medium block mb-0.5">Residential Address</span>
                        <span className="font-semibold text-slate-900 dark:text-white leading-snug">{streetAddress}, {city}, {stateProvince} {postalCode}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] font-medium block mb-0.5">Emergency Contact</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{emergencyName} ({emergencyRelation}) — {emergencyPhone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Uploaded Documents Summary */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#16161a] border border-slate-200/90 dark:border-[#282830] space-y-3 shadow-2xs">
                    <div className="text-xs font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-[#24242c]">4. Uploaded Verification Documents</div>
                    <div className="space-y-2">
                      {Object.values(uploadedFiles).length === 0 ? (
                        <span className="text-xs text-slate-400 font-normal">No documents attached</span>
                      ) : (
                        Object.entries(uploadedFiles).map(([fieldId, file]) => {
                          const f = configuredFields.find((x) => x.id === fieldId);
                          return (
                            <div key={fieldId} className="flex items-center justify-between text-xs py-1 border-b last:border-b-0 border-slate-50 dark:border-[#222228]">
                              <span className="text-slate-500 dark:text-slate-400 font-medium">{f?.label || 'Document'}</span>
                              <span className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>{file.name}</span>
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Legal Declaration Checkbox */}
                <div className="pt-2">
                  <label className="flex items-start gap-3 cursor-pointer p-4.5 rounded-2xl border border-slate-200/90 dark:border-[#282830] bg-white dark:bg-[#16161a] hover:border-slate-300 dark:hover:border-[#383842] transition-all shadow-2xs">
                    <input
                      type="checkbox"
                      checked={agreedToDeclaration}
                      onChange={(e) => setAgreedToDeclaration(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Profile Accuracy Confirmation</span>
                      I confirm that all personal, residential, and document uploads submitted are accurate, authentic, and up to date.
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
