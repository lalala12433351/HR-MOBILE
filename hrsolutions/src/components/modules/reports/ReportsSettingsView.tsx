'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppState } from '@/services/store';
import { api } from '@/services/apiClient';
import { ArrowLeft, Save } from 'lucide-react';
import {
  ATTENDANCE_REPORT_CATALOG,
  OVERVIEW_WIDGET_CATALOG,
  REPORT_FIELD_CATALOG,
  getDefaultReportSettings,
  AttendanceReportId,
  OverviewWidgetId,
} from '@/utils/reportCatalog';
import { ReportCustomizationSettings } from '@/types';

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
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-16">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link
            href="/reports"
            className="mt-0.5 h-9 w-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-xs transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Reports Settings
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize overview widgets, attendance reports, filters, columns and exports
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold transition-all cursor-pointer self-start sm:self-auto"
          style={{ boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.20)' }}
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save Report Settings'}
        </button>
      </div>

      {/* 1. Defaults */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-sm font-bold text-slate-900">Default Landing</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Choose what opens first when visiting Reports & Analytics
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">Default tab</span>
            <select
              value={defaultTab}
              onChange={(e) => setDefaultTab(e.target.value as 'overview' | 'attendance')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 outline-none focus:border-blue-600 focus:bg-white cursor-pointer"
            >
              <option value="overview">Overview</option>
              <option value="attendance">Attendance</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">Default attendance report</span>
            <select
              value={defaultReport}
              onChange={(e) => setDefaultReport(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 outline-none focus:border-blue-600 focus:bg-white cursor-pointer"
            >
              {ATTENDANCE_REPORT_CATALOG.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">Default month</span>
            <select
              value={defaultMonthOffset}
              onChange={(e) => setDefaultMonthOffset(Number(e.target.value) as 0 | -1)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 outline-none focus:border-blue-600 focus:bg-white cursor-pointer"
            >
              <option value={0}>Current month</option>
              <option value={-1}>Previous month</option>
            </select>
          </label>
        </div>
      </section>

      {/* 2. Overview widgets */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-sm font-bold text-slate-900">Overview Widgets</h4>
          <p className="text-xs text-slate-500 mt-0.5">
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
                  checked ? 'border-blue-600/50 bg-blue-50/20' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleWidget(w.id as OverviewWidgetId)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">{w.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{w.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* 3. Attendance reports */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-sm font-bold text-slate-900">Attendance Report Categories</h4>
          <p className="text-xs text-slate-500 mt-0.5">
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
                  checked ? 'border-blue-600/50 bg-blue-50/20' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleReport(rep.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">{rep.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{rep.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* 4. Visuals */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-sm font-bold text-slate-900">Visual Elements</h4>
          <p className="text-xs text-slate-500 mt-0.5">Applies to Overview and Attendance reports</p>
        </div>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all cursor-pointer select-none">
            <div>
              <div className="text-xs font-bold text-slate-900">Display charts & graphs</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Bar, pie and area charts above tables</div>
            </div>
            <input
              type="checkbox"
              checked={showCharts}
              onChange={(e) => setShowCharts(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all cursor-pointer select-none">
            <div>
              <div className="text-xs font-bold text-slate-900">Display KPI metric cards</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Summary metrics at the top of each view</div>
            </div>
            <input
              type="checkbox"
              checked={showKpiCards}
              onChange={(e) => setShowKpiCards(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </label>
        </div>
      </section>

      {/* 5. Filters */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-sm font-bold text-slate-900">Attendance Filters</h4>
          <p className="text-xs text-slate-500 mt-0.5">Show or hide filter controls on attendance reports</p>
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
                f.value ? 'border-blue-600/50 bg-blue-50/20' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={f.value}
                onChange={(e) => f.set(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-900">{f.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* 6. Table & hours */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-sm font-bold text-slate-900">Table & Hours</h4>
          <p className="text-xs text-slate-500 mt-0.5">Pagination and expected hours for working-hours reports</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">Rows per page</span>
            <input
              type="number"
              min={5}
              max={100}
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono font-medium text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">Expected hours per day</span>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={expectedHoursPerDay}
              onChange={(e) => setExpectedHoursPerDay(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono font-medium text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
            />
          </label>
        </div>
      </section>

      {/* 7. Column visibility */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Report Column Visibility</h4>
            <p className="text-xs text-slate-500 mt-0.5">Select a report to customize its table columns</p>
          </div>
          <select
            value={selectedReportForFields}
            onChange={(e) => setSelectedReportForFields(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 outline-none focus:border-blue-600 cursor-pointer"
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
                  checked ? 'border-blue-600/50 bg-blue-50/20' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleField(selectedReportForFields, f.key)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-800">{f.label}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* 8. Export */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <div className="border-b border-slate-100 pb-3">
          <h4 className="text-sm font-bold text-slate-900">CSV Export</h4>
          <p className="text-xs text-slate-500 mt-0.5">Control export availability and geofence columns</p>
        </div>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all cursor-pointer select-none">
            <div>
              <div className="text-xs font-bold text-slate-900">Allow CSV export</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Show Export CSV on overview and attendance reports</div>
            </div>
            <input
              type="checkbox"
              checked={allowCsvExport}
              onChange={(e) => setAllowCsvExport(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all cursor-pointer select-none">
            <div>
              <div className="text-xs font-bold text-slate-900">Include geofence in daily punch CSV</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Adds Verified Inside / Outside Geofence column</div>
            </div>
            <input
              type="checkbox"
              checked={csvIncludeGeofence}
              onChange={(e) => setCsvIncludeGeofence(e.target.checked)}
              disabled={!allowCsvExport}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
            />
          </label>
        </div>
      </section>
    </div>
  );
};
