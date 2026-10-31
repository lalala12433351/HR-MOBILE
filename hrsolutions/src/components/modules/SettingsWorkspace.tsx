'use client';

import styles from './mobile-settings.module.css';
import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useApp } from '@/context/AppContext';
import { MobileRow, MobileSection } from '@/components/mobile/MobilePrimitives';
import Link from 'next/link';
import { Building2, ChevronRight, Search, X } from 'lucide-react';
import { AppState } from '@/services/store';
import { isAdminPersona, isExecutiveOrAdmin } from '@/utils/teamAccess';
import { isInstitutionMode } from '@/utils/organizationMode';
import { AttendanceSettingsView } from './AttendanceSettingsView';
import { EmployeeSettingsView } from './EmployeeSettingsView';
import { LicenseSettingsView } from './LicenseSettingsView';
import { PayrollSettingsView } from './PayrollSettingsView';
import { ReportsSettingsView } from './reports/ReportsSettingsView';

type SettingsSection = 'attendance' | 'people' | 'payroll' | 'reports' | 'license';

type SettingsPane = { id: string; label: string };

type SettingsGroup = {
  id: SettingsSection;
  label: string;
  panes: SettingsPane[];
};

const PEOPLE_PANES: SettingsPane[] = [
  { id: 'general', label: 'General & profile' },
  { id: 'initial_passwords', label: 'Account invites' },
  { id: 'job_posts', label: 'Job roles' },
  { id: 'departments_teams', label: 'Departments & teams' },
  { id: 'employment_types', label: 'Employment types' },
  { id: 'office_locations', label: 'Office locations' },
  { id: 'onboarding', label: 'Onboarding fields' },
  { id: 'offboarding', label: 'Offboarding' },
];

const PAYROLL_PANES: SettingsPane[] = [
  { id: 'groups', label: 'Pay groups' },
  { id: 'general_settings', label: 'Pay cycles' },
  { id: 'components', label: 'Salary components' },
];

function attendancePanes(isInstitution: boolean): SettingsPane[] {
  return [
    { id: 'general', label: isInstitution ? 'Batches & schedules' : 'Shifts & schedules' },
    ...(isInstitution ? [{ id: 'students', label: 'Students' }] : []),
    { id: 'policy', label: 'Policy & geofencing' },
    { id: 'office_location', label: isInstitution ? 'Campuses' : 'Offices' },
    { id: 'leaves', label: 'Leave policies' },
    { id: 'holidays', label: 'Holidays' },
  ];
}

function groupsFor(isInstitution: boolean, allowLicense: boolean): SettingsGroup[] {
  const groups: SettingsGroup[] = [
    { id: 'attendance', label: 'Attendance and leave', panes: attendancePanes(isInstitution) },
    { id: 'people', label: 'People and organization', panes: PEOPLE_PANES },
    { id: 'payroll', label: 'Payroll', panes: PAYROLL_PANES },
    { id: 'reports', label: 'Reports', panes: [{ id: 'reports', label: 'Reports' }] },
  ];
  if (allowLicense) {
    groups.push({ id: 'license', label: 'License', panes: [{ id: 'license', label: 'License' }] });
  }
  return groups;
}

function sectionFrom(value: string | null, groups: SettingsGroup[]): SettingsSection {
  return groups.some((group) => group.id === value) ? (value as SettingsSection) : 'attendance';
}

export function SettingsWorkspace({ state, onUpdateState }: { state: AppState; onUpdateState: (updater: (prev: AppState) => AppState) => void }) {
  const router = useRouter();
  const mobile = useMobileViewport();
  const { themeMode, toggleThemeMode } = useApp();
  const [search, setSearch] = useState('');
  const searchParams = useSearchParams();
  const canManageLicense = isAdminPersona(state.currentPersona);
  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);
  const groups = groupsFor(isInstitution, canManageLicense);
  const activeSection = sectionFrom(searchParams.get('section'), groups);
  const activeGroup = groups.find((group) => group.id === activeSection)!;
  const requestedTab = searchParams.get('tab');
  const activePane = activeGroup.panes.some((pane) => pane.id === requestedTab)
    ? activeGroup.panes.find((pane) => pane.id === requestedTab)!
    : activeGroup.panes[0];
  const canManageSettings = isExecutiveOrAdmin(state.currentPersona);

  useEffect(() => {
    if (!canManageSettings && (!window.matchMedia('(max-width: 767px)').matches || searchParams.has('section'))) router.replace('/dashboard');
  }, [canManageSettings, mobile, searchParams, router]);

  const select = (section: SettingsSection, tab?: string) => {
    const params = new URLSearchParams();
    params.set('section', section);
    if (tab) params.set('tab', tab);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  const searchTerm = search.trim().toLowerCase();
  const visibleGroups = searchTerm ? groups.map((group) => ({ ...group, panes: group.panes.filter((pane) => `${group.label} ${pane.label}`.toLowerCase().includes(searchTerm)) })).filter((group) => group.panes.length) : [activeGroup];

  if (mobile && !searchParams.has('section')) {
    const profile = '/hr?emp=' + encodeURIComponent(state.currentPersona?.id || '');
    return <div className={`m2-page ${styles.home}`}>
      <MobileSection title="Personal">
        <MobileRow title="Account & security" detail="Password and signed-in devices" href={profile + '&empTab=setting'} />
        <MobileRow title="Notifications" detail="Choose what reaches you" href="/notifications" />
        <div className={styles.appearance}><span><strong>Dark theme</strong><small>{themeMode === 'dark' ? 'Dark appearance is on' : 'Light appearance is on'}</small></span><button type="button" role="switch" aria-checked={themeMode === 'dark'} aria-label="Dark theme" onClick={toggleThemeMode}><span /></button></div>
      </MobileSection>
      {canManageSettings && <MobileSection title="Workspace administration">
        <MobileRow title="Organisation" detail="Identity, departments and people" href="/settings?section=people&tab=general" />
        <MobileRow title="Attendance policies" detail="Shifts, locations and geofencing" href="/settings?section=attendance&tab=general" />
        <MobileRow title="Leave policies" detail="Quotas, holidays and eligibility" href="/settings?section=attendance&tab=leaves" />
        <MobileRow title="Payroll settings" detail="Salary periods and payment rules" href="/settings?section=payroll" />
        <MobileRow title="GPS & verification" detail="Geofencing, selfie and office Wi-Fi" href="/settings?section=attendance&tab=policy" />
        <MobileRow title="Offices & locations" detail="Coordinates and office QR" href="/settings?section=attendance&tab=office_location" />
        <MobileRow title="Holiday administration" detail="Published dates and templates" href="/settings?section=attendance&tab=holidays" />
        {isInstitution && <MobileRow title="Student policies" detail="Batch schedules and absence alerts" href="/settings?section=attendance&tab=students" />}
        {canManageLicense && <MobileRow title="Billing & license" detail="Workspace plan and subscription" href="/settings?section=license" />}
      </MobileSection>}
    </div>;
  }
  if (!canManageSettings) return null;

  return (
    <div className={`settings-studio ${styles.workspace}`}>
      {mobile && <Link href="/settings" className="m2-row m2-settings-back">All settings</Link>}
      <header className="settings-studio__page-head">
        <h1 className="settings-studio__title">Settings</h1>
        <button type="button" className={styles.desktopTheme} role="switch" aria-checked={themeMode === 'dark'} aria-label="Dark theme" onClick={toggleThemeMode}>Dark theme: {themeMode === 'dark' ? 'On' : 'Off'}</button>
        <div className="settings-studio__workspace"><Building2 size={15} aria-hidden="true" /><span>{state.organization?.name || 'Your workspace'}</span><span className="settings-studio__workspace-type">{isInstitution ? 'Institute' : 'Company'}</span></div>
      </header>
      <nav className="settings-studio__area-strip" aria-label="Settings areas">
        {groups.map((group) => <button key={group.id} type="button" aria-current={group.id === activeSection ? 'page' : undefined} className={`settings-studio__area${group.id === activeSection ? ' is-active' : ''}`} onClick={() => { setSearch(''); select(group.id, group.panes[0].id); }}>{group.label}</button>)}
      </nav>
      <div className="settings-studio__layout">
        <aside className="settings-studio__rail">
          <label className="settings-studio__search"><Search size={15} aria-hidden="true" /><input aria-label="Find a setting" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a setting…" />{search && <button type="button" aria-label="Clear settings search" onClick={() => setSearch('')}><X size={14} /></button>}</label>
          <label className="settings-mobile-picker">Settings page<select aria-label="Settings page" value={`${activeSection}:${activePane.id}`} onChange={(event) => { const [section, tab] = event.target.value.split(':'); setSearch(''); select(section as SettingsSection, tab); }}>{groups.map((group) => <optgroup key={group.id} label={group.label}>{group.panes.map((pane) => <option key={pane.id} value={`${group.id}:${pane.id}`}>{pane.label}</option>)}</optgroup>)}</select></label><nav className="settings-studio__index" aria-label="Settings pages">
            {visibleGroups.map((group) => <div key={group.id} className="settings-studio__group">
              <p className="settings-studio__group-label">{group.label}</p>
              <div className="settings-studio__panes">
                {group.panes.map((pane) => { const isActive = group.id === activeSection && pane.id === activePane.id; return <button key={pane.id} type="button" aria-current={isActive ? 'page' : undefined} className={`settings-studio__pane${isActive ? ' is-active' : ''}`} onClick={() => { setSearch(''); select(group.id, pane.id); }}><span>{pane.label}</span>{isActive && <ChevronRight size={14} aria-hidden="true" />}</button>; })}
              </div>
            </div>)}
            {!visibleGroups.length && <p className="settings-studio__no-results">No settings found. Try a different search.</p>}
          </nav>
          <div className="settings-studio__scope"><span>Workspace settings</span><p>Changes apply to this workspace. Existing records are preserved.</p></div>
        </aside>

        <section
          id={`settings-panel-${activeSection}`}
          role="region"
          aria-label={activePane.label}
          className="settings-studio__body"
        >
          {activeSection === 'attendance' && (
            <AttendanceSettingsView
              state={state}
              onUpdateState={onUpdateState}
              pane={activePane.id}
              paneLabel={activePane.label}
              onPaneChange={(tab) => select('attendance', tab)}
            />
          )}
          {activeSection === 'people' && (
            <EmployeeSettingsView
              state={state}
              onUpdateState={onUpdateState}
              showPayrollSettings={false}
              pane={activePane.id}
              paneLabel={activePane.label}
              onPaneChange={(tab) => select('people', tab)}
            />
          )}
          {activeSection === 'payroll' && (
            <PayrollSettingsView
              state={state}
              onUpdateState={onUpdateState}
              pane={activePane.id}
              paneLabel={activePane.label}
              onPaneChange={(tab) => select('payroll', tab)}
            />
          )}
          {activeSection === 'reports' && <ReportsSettingsView state={state} onUpdateState={onUpdateState} />}
          {activeSection === 'license' && canManageLicense && (
            <LicenseSettingsView state={state} onUpdateState={onUpdateState} />
          )}
        </section>
      </div>
    </div>
  );
}
