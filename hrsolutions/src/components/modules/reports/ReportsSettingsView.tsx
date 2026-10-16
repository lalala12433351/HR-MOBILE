'use client';

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

      <div className="settings-page__header">
        <h2 className="settings-page__heading">Reports Settings</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="settings-page__action shrink-0"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* 1. Defaults */}
      <section className="settings-page__card space-y-4">
        <div className="border-b border-[var(--border-color)] pb-3">
          <h4 className="settings-page__section-heading">Default Landing</h4>
          <p className="settings-page__section-description">
            Choose what opens first when visiting Reports & Analytics
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Default tab</span>
            <select
              value={defaultTab}
              onChange={(e) => setDefaultTab(e.target.value as 'overview' | 'attendance')}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 focus:bg-[var(--bg-surface)] cursor-pointer"
            >
              <option value="overview">Overview</option>
              <option value="attendance">Attendance</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Default attendance report</span>
            <select
              value={defaultReport}
              onChange={(e) => setDefaultReport(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 focus:bg-[var(--bg-surface)] cursor-pointer"
            >
              {ATTENDANCE_REPORT_CATALOG.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Default month</span>
            <select
              value={defaultMonthOffset}
              onChange={(e) => setDefaultMonthOffset(Number(e.target.value) as 0 | -1)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 focus:bg-[var(--bg-surface)] cursor-pointer"
            >
              <option value={0}>Current month</option>
              <option value={-1}>Previous month</option>
            </select>
          </label>
        </div>
      </section>

      {/* 2. Overview widgets */}
      <section className="settings-page__card space-y-4">
        <div className="border-b border-[var(--border-color)] pb-3">
          <h4 className="settings-page__section-heading">Overview Widgets</h4>
          <p className="settings-page__section-description">
            Toggle live ops analytics cards on the Overview tab
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {OVERVIEW_WIDGET_CATALOG.map((w) => {
            const checked = enabledOverviewWidgets.includes(w.id);
            return (
              <label
                key={w.id}
                className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all cursor-pointer select-none ${
                  checked ? 'settings-page__choice settings-page__choice--active' : 'settings-page__choice'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleWidget(w.id as OverviewWidgetId)}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-[var(--primary-blue)] cursor-pointer"
                />
                <div>
                  <div className="text-[14px] font-semibold text-[var(--text-primary)]">{w.name}</div>
                  <div className="settings-page__hint mt-0.5">{w.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* 3. Attendance reports */}
      <section className="settings-page__card space-y-4">
        <div className="border-b border-[var(--border-color)] pb-3">
          <h4 className="settings-page__section-heading">Attendance Report Categories</h4>
          <p className="settings-page__section-description">
            Choose which reports appear in the Attendance tab sidebar
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ATTENDANCE_REPORT_CATALOG.map((rep) => {
            const checked = enabledReports.includes(rep.id);
            return (
              <label
                key={rep.id}
                className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all cursor-pointer select-none ${
                  checked ? 'settings-page__choice settings-page__choice--active' : 'settings-page__choice'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleReport(rep.id)}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-[var(--primary-blue)] cursor-pointer"
                />
                <div>
                  <div className="text-[14px] font-semibold text-[var(--text-primary)]">{rep.name}</div>
                  <div className="settings-page__hint mt-0.5">{rep.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* 4. Visuals */}
      <section className="settings-page__card space-y-4">
        <div className="border-b border-[var(--border-color)] pb-3">
          <h4 className="settings-page__section-heading">Visual Elements</h4>
          <p className="settings-page__section-description">Applies to Overview and Attendance reports</p>
        </div>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] transition-all cursor-pointer select-none">
            <div>
              <div className="text-[14px] font-semibold text-[var(--text-primary)]">Display charts & graphs</div>
              <div className="settings-page__hint mt-0.5">Bar, pie and area charts above tables</div>
            </div>
            <input
              type="checkbox"
              checked={showCharts}
              onChange={(e) => setShowCharts(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-[var(--primary-blue)] cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] transition-all cursor-pointer select-none">
            <div>
              <div className="text-[14px] font-semibold text-[var(--text-primary)]">Display KPI metric cards</div>
              <div className="settings-page__hint mt-0.5">Summary metrics at the top of each view</div>
            </div>
            <input
              type="checkbox"
              checked={showKpiCards}
              onChange={(e) => setShowKpiCards(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-[var(--primary-blue)] cursor-pointer"
            />
          </label>
        </div>
      </section>

      {/* 5. Filters */}
      <section className="settings-page__card space-y-4">
        <div className="border-b border-[var(--border-color)] pb-3">
          <h4 className="settings-page__section-heading">Attendance Filters</h4>
          <p className="settings-page__section-description">Show or hide filter controls on attendance reports</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { key: 'dept', label: 'Department filter', value: showDepartmentFilter, set: setShowDepartmentFilter },
            { key: 'branch', label: 'Branch filter', value: showBranchFilter, set: setShowBranchFilter },
            { key: 'shift', label: 'Shift filter', value: showShiftFilter, set: setShowShiftFilter },
          ].map((f) => (
            <label
              key={f.key}
              className={`flex items-center gap-3 p-3.5 rounded-lg border transition-all cursor-pointer select-none ${
                  f.value ? 'settings-page__choice settings-page__choice--active' : 'settings-page__choice'
              }`}
            >
              <input
                type="checkbox"
                checked={f.value}
                onChange={(e) => f.set(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-[var(--primary-blue)] cursor-pointer"
              />
              <span className="text-xs font-bold text-[var(--text-primary)]">{f.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* 6. Table & hours */}
      <section className="settings-page__card space-y-4">
        <div className="border-b border-[var(--border-color)] pb-3">
          <h4 className="settings-page__section-heading">Table & Hours</h4>
          <p className="settings-page__section-description">Pagination and expected hours for working-hours reports</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Rows per page</span>
            <input
              type="number"
              min={5}
              max={100}
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-xs font-mono font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 focus:bg-[var(--bg-surface)]"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Expected hours per day</span>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={expectedHoursPerDay}
              onChange={(e) => setExpectedHoursPerDay(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-xs font-mono font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 focus:bg-[var(--bg-surface)]"
            />
          </label>
        </div>
      </section>

      {/* 7. Column visibility */}
      <section className="settings-page__card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
          <div>
            <h4 className="settings-page__section-heading">Report Column Visibility</h4>
            <p className="settings-page__section-description">Select a report to customize its table columns</p>
          </div>
          <select
            value={selectedReportForFields}
            onChange={(e) => setSelectedReportForFields(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer"
          >
            {ATTENDANCE_REPORT_CATALOG.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {fieldOptions.map((f) => {
            const current = visibleFields[selectedReportForFields] || [];
            const checked = current.includes(f.key);
            return (
              <label
                key={f.key}
                className={`flex items-center gap-2.5 p-3 rounded-lg border transition-all cursor-pointer select-none ${
                  checked ? 'settings-page__choice settings-page__choice--active' : 'settings-page__choice'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleField(selectedReportForFields, f.key)}
                  className="h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-[var(--primary-blue)] cursor-pointer"
                />
                <span className="text-xs font-semibold text-[var(--text-primary)]">{f.label}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* 8. Export */}
      <section className="settings-page__card space-y-4">
        <div className="border-b border-[var(--border-color)] pb-3">
          <h4 className="settings-page__section-heading">CSV Export</h4>
          <p className="settings-page__section-description">Control export availability and geofence columns</p>
        </div>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] transition-all cursor-pointer select-none">
            <div>
              <div className="text-[14px] font-semibold text-[var(--text-primary)]">Allow CSV export</div>
              <div className="settings-page__hint mt-0.5">Show Export CSV on overview and attendance reports</div>
            </div>
            <input
              type="checkbox"
              checked={allowCsvExport}
              onChange={(e) => setAllowCsvExport(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-[var(--primary-blue)] cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] transition-all cursor-pointer select-none">
            <div>
              <div className="text-[14px] font-semibold text-[var(--text-primary)]">Include geofence in daily punch CSV</div>
              <div className="settings-page__hint mt-0.5">Adds Verified Inside / Outside Geofence column</div>
            </div>
            <input
              type="checkbox"
              checked={csvIncludeGeofence}
              onChange={(e) => setCsvIncludeGeofence(e.target.checked)}
              disabled={!allowCsvExport}
              className="h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-[var(--primary-blue)] cursor-pointer disabled:opacity-40"
            />
          </label>
        </div>
      </section>
    </div>
  );
};
