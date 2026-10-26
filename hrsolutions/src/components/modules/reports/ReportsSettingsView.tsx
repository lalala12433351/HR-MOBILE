'use client';

import { SettingsPageHeader, SettingsButton, SettingsCard, SettingsField, SettingsSwitchRow } from '../settings/SettingsPrimitives';
import React, { useState } from 'react';
import { AppState } from '@/services/store';
import { api } from '@/services/apiClient';
import {
  ATTENDANCE_REPORT_CATALOG,
  OVERVIEW_WIDGET_CATALOG,
  REPORT_FIELD_CATALOG,
  getDefaultReportSettings,
  AttendanceReportId,
  OverviewWidgetId,
} from '@/utils/reportCatalog';
import { ReportCustomizationSettings } from '@/types';
import { SettingsToast } from '../settings/SettingsToast';

interface ReportsSettingsViewProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const ReportsSettingsView: React.FC<ReportsSettingsViewProps> = ({ state, onUpdateState }) => {
  const defaults = getDefaultReportSettings();
  const initial: ReportCustomizationSettings = {
    ...defaults,
    ...(state.customOptions?.reportSettings || {}),
  };

  const [enabledReports, setEnabledReports] = useState<string[]>(
    initial.enabledReports?.length ? initial.enabledReports : defaults.enabledReports
  );
  const [enabledOverviewWidgets, setEnabledOverviewWidgets] = useState<string[]>(
    initial.enabledOverviewWidgets?.length
      ? initial.enabledOverviewWidgets
      : defaults.enabledOverviewWidgets
  );
  const [showCharts, setShowCharts] = useState(initial.showCharts ?? true);
  const [showKpiCards, setShowKpiCards] = useState(initial.showKpiCards ?? true);
  const [defaultTab, setDefaultTab] = useState<'overview' | 'attendance'>(
    initial.defaultTab || 'overview'
  );
  const [defaultReport, setDefaultReport] = useState(initial.defaultReport || 'attendance_master');
  const [defaultMonthOffset, setDefaultMonthOffset] = useState<0 | -1>(
    (initial.defaultMonthOffset as 0 | -1) ?? 0
  );
  const [rowsPerPage, setRowsPerPage] = useState(initial.rowsPerPage ?? 25);
  const [expectedHoursPerDay, setExpectedHoursPerDay] = useState(initial.expectedHoursPerDay ?? 8);
  const [showDepartmentFilter, setShowDepartmentFilter] = useState(
    initial.showDepartmentFilter !== false
  );
  const [showBranchFilter, setShowBranchFilter] = useState(initial.showBranchFilter !== false);
  const [showShiftFilter, setShowShiftFilter] = useState(initial.showShiftFilter !== false);
  const [allowCsvExport, setAllowCsvExport] = useState(initial.allowCsvExport !== false);
  const [csvIncludeGeofence, setCsvIncludeGeofence] = useState(initial.csvIncludeGeofence !== false);
  const [visibleFields, setVisibleFields] = useState<Record<string, string[]>>(
    initial.visibleFields || defaults.visibleFields
  );
  const [selectedReportForFields, setSelectedReportForFields] = useState<string>('attendance_master');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleReport = (id: string) => {
    if (enabledReports.includes(id)) {
      if (enabledReports.length <= 1) {
        showToast('At least one attendance report must remain active');
        return;
      }
      setEnabledReports(enabledReports.filter((r) => r !== id));
    } else {
      setEnabledReports([...enabledReports, id]);
    }
  };

  const toggleWidget = (id: string) => {
    if (enabledOverviewWidgets.includes(id)) {
      if (enabledOverviewWidgets.length <= 1) {
        showToast('At least one overview widget must remain active');
        return;
      }
      setEnabledOverviewWidgets(enabledOverviewWidgets.filter((w) => w !== id));
    } else {
      setEnabledOverviewWidgets([...enabledOverviewWidgets, id]);
    }
  };

  const toggleField = (reportId: string, fieldKey: string) => {
    setVisibleFields((prev) => {
      const current = prev[reportId] || [];
      if (current.includes(fieldKey)) {
        if (current.length <= 1) {
          showToast('At least one column must remain visible');
          return prev;
        }
        return { ...prev, [reportId]: current.filter((k) => k !== fieldKey) };
      }
      return { ...prev, [reportId]: [...current, fieldKey] };
    });
  };

  const buildPayload = (): ReportCustomizationSettings => ({
    enabledReports,
    enabledOverviewWidgets,
    showCharts,
    showKpiCards,
    visibleFields,
    defaultTab,
    defaultReport,
    rowsPerPage: Number(rowsPerPage) || 25,
    expectedHoursPerDay: Number(expectedHoursPerDay) || 8,
    showDepartmentFilter,
    showBranchFilter,
    showShiftFilter,
    allowCsvExport,
    csvIncludeGeofence,
    defaultMonthOffset,
  });

  const handleSave = async () => {
    const reportSettings = buildPayload();
    setSaving(true);
    try {
      await api.setup.saveAttendanceSettings({ reportSettings });
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          reportSettings,
        },
      }));
      showToast('Report settings saved');
    } catch (e: any) {
      showToast(e?.message || 'Failed to save report settings');
    } finally {
      setSaving(false);
    }
  };

  const fieldOptions =
    REPORT_FIELD_CATALOG[selectedReportForFields as AttendanceReportId] || [];

  return (
    <div className="settings-page">
      <SettingsToast message={toast} />
      <SettingsPageHeader title="Reports" actions={<SettingsButton loading={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</SettingsButton>} />
      <SettingsCard title="Report defaults">
        <div className="settings-fields-grid settings-fields-grid--three">
          <SettingsField label="Default tab"><select value={defaultTab} onChange={(event) => setDefaultTab(event.target.value as 'overview' | 'attendance')}><option value="overview">Overview</option><option value="attendance">Attendance</option></select></SettingsField>
          <SettingsField label="Default attendance report"><select value={defaultReport} onChange={(event) => setDefaultReport(event.target.value)}>{ATTENDANCE_REPORT_CATALOG.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></SettingsField>
          <SettingsField label="Default month"><select value={defaultMonthOffset} onChange={(event) => setDefaultMonthOffset(Number(event.target.value) as 0 | -1)}><option value={0}>Current month</option><option value={-1}>Previous month</option></select></SettingsField>
        </div>
      </SettingsCard>
      <SettingsCard title="Overview widgets" description="Choose the analytics shown in the overview.">
        <div className="settings-choice-grid">{OVERVIEW_WIDGET_CATALOG.map((item) => <label key={item.id} className={`settings-page__choice${enabledOverviewWidgets.includes(item.id) ? ' settings-page__choice--active' : ''}`}><input type="checkbox" checked={enabledOverviewWidgets.includes(item.id)} onChange={() => toggleWidget(item.id as OverviewWidgetId)} /><span>{item.name}<span className="settings-choice__description">{item.desc}</span></span></label>)}</div>
      </SettingsCard>
      <SettingsCard title="Attendance report categories" description="At least one report must remain available.">
        <div className="settings-choice-grid">{ATTENDANCE_REPORT_CATALOG.map((item) => <label key={item.id} className={`settings-page__choice${enabledReports.includes(item.id) ? ' settings-page__choice--active' : ''}`}><input type="checkbox" checked={enabledReports.includes(item.id)} onChange={() => toggleReport(item.id)} /><span>{item.name}<span className="settings-choice__description">{item.desc}</span></span></label>)}</div>
      </SettingsCard>
      <SettingsCard title="Display & filters">
        <div>
          <SettingsSwitchRow title="Display charts" description="Show graphs above report tables." checked={showCharts} onChange={setShowCharts} />
          <SettingsSwitchRow title="Display metric cards" description="Show summary figures at the top of each view." checked={showKpiCards} onChange={setShowKpiCards} />
          <SettingsSwitchRow title="Department filter" checked={showDepartmentFilter} onChange={setShowDepartmentFilter} />
          <SettingsSwitchRow title="Branch filter" checked={showBranchFilter} onChange={setShowBranchFilter} />
          <SettingsSwitchRow title="Shift filter" checked={showShiftFilter} onChange={setShowShiftFilter} />
        </div>
      </SettingsCard>
      <SettingsCard title="Tables & working hours">
        <div className="settings-fields-grid">
          <SettingsField label="Rows per page" hint="Between 5 and 100 rows."><input type="number" min={5} max={100} value={rowsPerPage} onChange={(event) => setRowsPerPage(Number(event.target.value))} /></SettingsField>
          <SettingsField label="Expected hours per day"><input type="number" min={1} max={24} step={0.5} value={expectedHoursPerDay} onChange={(event) => setExpectedHoursPerDay(Number(event.target.value))} /></SettingsField>
        </div>
      </SettingsCard>
      <SettingsCard title="Visible columns">
        <SettingsField label="Report"><select value={selectedReportForFields} onChange={(event) => setSelectedReportForFields(event.target.value)}>{ATTENDANCE_REPORT_CATALOG.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></SettingsField>
        <div className="settings-choice-grid">{fieldOptions.map((field) => { const checked = (visibleFields[selectedReportForFields] || []).includes(field.key); return <label key={field.key} className={`settings-page__choice${checked ? ' settings-page__choice--active' : ''}`}><input type="checkbox" checked={checked} onChange={() => toggleField(selectedReportForFields, field.key)} /><span>{field.label}</span></label>; })}</div>
      </SettingsCard>
      <SettingsCard title="Export permissions"><div>
        <SettingsSwitchRow title="Allow CSV export" description="Make CSV downloads available on reports." checked={allowCsvExport} onChange={setAllowCsvExport} />
        <SettingsSwitchRow title="Include geofence in daily punch CSV" description="Add the inside or outside geofence verification column." checked={csvIncludeGeofence} onChange={setCsvIncludeGeofence} disabled={!allowCsvExport} />
      </div></SettingsCard>
    </div>
  );
};
