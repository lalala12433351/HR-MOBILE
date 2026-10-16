'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppState } from '@/services/store';
import { isAdminPersona, isExecutiveOrAdmin } from '@/utils/teamAccess';
import { AttendanceSettingsView } from './AttendanceSettingsView';
import { EmployeeSettingsView } from './EmployeeSettingsView';
import { LicenseSettingsView } from './LicenseSettingsView';
import { PayrollSettingsView } from './PayrollSettingsView';
import { ReportsSettingsView } from './reports/ReportsSettingsView';
import { HelpSupportWidget } from '@/components/support/HelpSupportWidget';

type SettingsSection = 'attendance' | 'people' | 'payroll' | 'reports' | 'license';

const BASE_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'attendance', label: 'Attendance & leave' },
  { id: 'people', label: 'People & organization' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'reports', label: 'Reports' },
];

function sectionFrom(value: string | null, allowLicense: boolean): SettingsSection {
  if (value === 'license' && allowLicense) return 'license';
  return BASE_SECTIONS.some((section) => section.id === value) ? (value as SettingsSection) : 'attendance';
}

export function SettingsWorkspace({ state, onUpdateState }: { state: AppState; onUpdateState: (updater: (prev: AppState) => AppState) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManageLicense = isAdminPersona(state.currentPersona);
  const sections = canManageLicense
    ? [...BASE_SECTIONS, { id: 'license' as const, label: 'License' }]
    : BASE_SECTIONS;
  const activeSection = sectionFrom(searchParams.get('section'), canManageLicense);
  const canManageSettings = isExecutiveOrAdmin(state.currentPersona);
  const activeSectionDetails = sections.find((section) => section.id === activeSection)!;

  useEffect(() => {
    if (!canManageSettings) router.replace('/dashboard');
  }, [canManageSettings, router]);

  const selectSection = (section: SettingsSection) => router.replace(`/settings?section=${section}`, { scroll: false });

  if (!canManageSettings) return null;

  return (
    <div className="settings-studio">
      <h1 className="settings-studio__title">Workspace settings</h1>

      <div className="settings-studio__layout">
        <aside className="settings-studio__rail">
          <nav role="tablist" aria-label="Settings sections" className="settings-studio__areas">
            {sections.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => selectSection(section.id)}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`settings-panel-${section.id}`}
                  className={`settings-studio__area${isActive ? ' is-active' : ''}`}
                >
                  {section.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <section
          id={`settings-panel-${activeSection}`}
          role="tabpanel"
          aria-label={activeSectionDetails.label}
          className="settings-studio__sheet"
        >
          {activeSection === 'attendance' && <AttendanceSettingsView state={state} onUpdateState={onUpdateState} />}
          {activeSection === 'people' && <EmployeeSettingsView state={state} onUpdateState={onUpdateState} showPayrollSettings={false} />}
          {activeSection === 'payroll' && <PayrollSettingsView state={state} onUpdateState={onUpdateState} />}
          {activeSection === 'reports' && <ReportsSettingsView state={state} onUpdateState={onUpdateState} />}
          {activeSection === 'license' && canManageLicense && (
            <LicenseSettingsView state={state} onUpdateState={onUpdateState} />
          )}
        </section>
      </div>

      <HelpSupportWidget />
    </div>
  );
}
