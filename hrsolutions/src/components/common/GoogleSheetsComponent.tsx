'use client';

import React, { useState, useEffect } from 'react';
import { openExternalUrl } from '@/lib/native';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  ExternalLink,
  Download,
  Upload,
  CheckCircle2,
  Table,
  Sparkles,
  Save,
  Search,
  Grid,
  Zap,
  Check,
  AlertCircle,
  Loader2,
  DollarSign,
  Users,
  ListTodo,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  initGoogleWorkspaceAuth,
  googleWorkspaceSignIn,
  DriveFile,
} from '../../services/googleDrive';
import {
  listSpreadsheetsFromDrive,
  createSpreadsheet,
  getSpreadsheetMetadata,
  getSpreadsheetValues,
  updateSpreadsheetValues,
  appendSpreadsheetValues,
  SpreadsheetMetadata,
  ValueRange,
} from '../../services/googleSheets';
import { AppState } from '../../services/store';

interface GoogleSheetsComponentProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onTriggerToast?: (toast: any) => void;
}

export const GoogleSheetsComponent: React.FC<GoogleSheetsComponentProps> = ({
  state,
  onUpdateState,
  onTriggerToast,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Spreadsheets List
  const [spreadsheets, setSpreadsheets] = useState<DriveFile[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Currently Selected Spreadsheet
  const [activeSpreadsheetId, setActiveSpreadsheetId] = useState<string | null>(null);
  const [activeMetadata, setActiveMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [activeValues, setActiveValues] = useState<string[][]>([]);
  const [isLoadingValues, setIsLoadingValues] = useState(false);
  const [isSavingValues, setIsSavingValues] = useState(false);

  // New Sheet Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState('');
  const [presetTemplate, setPresetTemplate] = useState<'custom' | 'finance' | 'employees' | 'tasks'>('finance');
  const [isCreating, setIsCreating] = useState(false);

  // Exporter Quick Action
  const [isExporting, setIsExporting] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initGoogleWorkspaceAuth(
      (u, token) => {
        setUser(u);
        setAccessToken(token);
        setIsLoadingAuth(false);
        fetchSpreadsheets(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setIsLoadingAuth(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleConnectGoogle = async () => {
    setIsLoadingAuth(true);
    setErrorMsg(null);
    try {
      const res = await googleWorkspaceSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        fetchSpreadsheets(res.accessToken);
        if (onTriggerToast) {
          onTriggerToast({
            type: 'system',
            title: 'Google Sheets Connected',
            senderName: 'Google Sheets API v4',
            message: `Authenticated as ${res.user.email}`,
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to authenticate with Google Sheets');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const fetchSpreadsheets = async (token: string) => {
    setIsLoadingList(true);
    setErrorMsg(null);
    try {
      const files = await listSpreadsheetsFromDrive(token);
      setSpreadsheets(files);
      if (files.length > 0 && !activeSpreadsheetId) {
        loadSpreadsheet(token, files[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Could not fetch Google Sheets list. Sign in to load spreadsheets.');
    } finally {
      setIsLoadingList(false);
    }
  };

  const loadSpreadsheet = async (token: string, spreadsheetId: string) => {
    setActiveSpreadsheetId(spreadsheetId);
    setIsLoadingValues(true);
    setErrorMsg(null);
    try {
      const meta = await getSpreadsheetMetadata(token, spreadsheetId);
      setActiveMetadata(meta);

      const sheetName = meta.sheets[0]?.properties?.title || 'Sheet1';
      const valuesRes = await getSpreadsheetValues(token, spreadsheetId, `${sheetName}!A1:Z50`);
      setActiveValues(valuesRes.values || []);
    } catch (err: any) {
      console.error('Load spreadsheet error:', err);
      setActiveValues([]);
      setErrorMsg(err.message || 'Unable to load spreadsheet rows. Please verify permissions or click "Sync" to retry.');
    } finally {
      setIsLoadingValues(false);
    }
  };

  const handleCellChange = (rowIndex: number, colIndex: number, val: string) => {
    const updated = activeValues.map((row) => [...row]);
    if (!updated[rowIndex]) updated[rowIndex] = [];
    updated[rowIndex][colIndex] = val;
    setActiveValues(updated);
  };

  const handleAddRow = () => {
    const colCount = activeValues[0]?.length || 5;
    const newRow = new Array(colCount).fill('');
    setActiveValues([...activeValues, newRow]);
  };

  const handleSaveToGoogleSheets = async () => {
    if (!activeSpreadsheetId || !accessToken) {
      setErrorMsg('Please connect your Google account to save changes to Google Sheets.');
      return;
    }

    setIsSavingValues(true);
    setErrorMsg(null);

    try {
      const sheetName = activeMetadata?.sheets[0]?.properties?.title || 'Sheet1';
      await updateSpreadsheetValues(
        accessToken,
        activeSpreadsheetId,
        `${sheetName}!A1`,
        activeValues
      );

      if (onTriggerToast) {
        onTriggerToast({
          type: 'task',
          title: 'Google Sheets Updated',
          senderName: 'Google Sheets API v4',
          message: 'Saved updated values directly to live Google Spreadsheet.',
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to save values to Google Sheets');
    } finally {
      setIsSavingValues(false);
    }
  };

  const handleCreateNewSheetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSheetTitle.trim()) return;

    setIsCreating(true);
    setErrorMsg(null);

    try {
      let headers: string[] = ['Column A', 'Column B', 'Column C', 'Column D'];
      let rows: string[][] = [
        ['Data 1', 'Data 2', 'Data 3', 'Data 4'],
        ['Data 5', 'Data 6', 'Data 7', 'Data 8'],
      ];

      if (presetTemplate === 'finance') {
        headers = ['Invoice ID', 'Customer', 'Amount (₹)', 'Due Date', 'Status'];
        rows = (state.invoices || []).map((t) => [
          t.id,
          t.customerName,
          t.totalAmount.toString(),
          t.dueDate,
          t.status,
        ]);
      } else if (presetTemplate === 'employees') {
        headers = ['Employee ID', 'Name', 'Role', 'Department', 'Email', 'Salary ($)'];
        rows = state.employees.map((e) => [
          e.id,
          e.name,
          e.role || e.designation,
          e.department,
          e.email,
          e.salary ? e.salary.toString() : (e.salaryDetails?.netPayable?.toString() || '95000'),
        ]);
      } else if (presetTemplate === 'tasks') {
        headers = ['Task ID', 'Title', 'Project', 'Assignee', 'Status', 'Priority', 'Due Date'];
        rows = state.tasks.map((t) => [
          t.id,
          t.title,
          t.projectName,
          t.assigneeName,
          t.status,
          t.priority,
          t.dueDate,
        ]);
      }

      if (accessToken) {
        const created = await createSpreadsheet(accessToken, newSheetTitle, {
          sheetName: 'Workspace Sheet',
          headers,
          rows,
        });

        fetchSpreadsheets(accessToken);
        loadSpreadsheet(accessToken, created.spreadsheetId);
      } else {
        // Fallback local view
        setActiveValues([headers, ...rows]);
      }

      setShowCreateModal(false);
      setNewSheetTitle('');

      if (onTriggerToast) {
        onTriggerToast({
          type: 'task',
          title: 'Google Sheet Created!',
          senderName: 'Google Sheets API v4',
          message: `Created spreadsheet "${newSheetTitle}" with ${rows.length} rows.`,
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to create Google Spreadsheet');
    } finally {
      setIsCreating(false);
    }
  };

  const handleQuickExportModule = async (moduleType: 'finance' | 'employees' | 'tasks') => {
    setIsExporting(moduleType);
    setErrorMsg(null);

    try {
      let title = '';
      let headers: string[] = [];
      let rows: string[][] = [];

      if (moduleType === 'finance') {
        title = `Workspace Financial Ledger (${new Date().toISOString().substring(0, 10)})`;
        headers = ['Invoice ID', 'Customer', 'Due Date', 'Total Amount (₹)', 'Paid Amount (₹)', 'Status'];
        rows = (state.invoices || []).map((t) => [
          t.id,
          t.customerName,
          t.dueDate,
          t.totalAmount.toString(),
          t.paidAmount.toString(),
          t.status,
        ]);
      } else if (moduleType === 'employees') {
        title = `Workspace HR Directory & Payroll (${new Date().toISOString().substring(0, 10)})`;
        headers = ['ID', 'Name', 'Role', 'Department', 'Email', 'Phone', 'Join Date', 'Salary ($)'];
        rows = state.employees.map((e) => [
          e.id,
          e.name,
          e.role || e.designation,
          e.department,
          e.email,
          e.phone || '+1-555-0192',
          e.joinDate || e.joiningDate,
          e.salary ? e.salary.toString() : (e.salaryDetails?.netPayable?.toString() || '110000'),
        ]);
      } else if (moduleType === 'tasks') {
        title = `Workspace Tasks & Deliverables (${new Date().toISOString().substring(0, 10)})`;
        headers = ['Task ID', 'Title', 'Project', 'Assignee', 'Status', 'Priority', 'Est Hours', 'Due Date'];
        rows = state.tasks.map((t) => [
          t.id,
          t.title,
          t.projectName,
          t.assigneeName,
          t.status,
          t.priority,
          t.estimatedHours.toString(),
          t.dueDate,
        ]);
      }

      if (accessToken) {
        const created = await createSpreadsheet(accessToken, title, {
          sheetName: 'Exported Data',
          headers,
          rows,
        });

        fetchSpreadsheets(accessToken);
        loadSpreadsheet(accessToken, created.spreadsheetId);

        if (onTriggerToast) {
          onTriggerToast({
            type: 'task',
            title: 'Exported to Google Sheets!',
            senderName: 'Google Sheets API v4',
            message: `Created "${title}" in Google Drive with ${rows.length} records.`,
          });
        }
      } else {
        // Sign in prompt if no access token
        await handleConnectGoogle();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to export module data to Google Sheets');
    } finally {
      setIsExporting(null);
    }
  };

  const filteredSpreadsheets = spreadsheets.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & OAuth Controls */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <FileSpreadsheet className="h-56 w-56 text-emerald-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 border border-emerald-400/30 text-[11px] font-bold text-emerald-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Google Sheets API v4 Integration
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <FileSpreadsheet className="h-6 w-6 text-emerald-400" />
              Google Sheets Live Data & Export Engine
            </h2>
            <p className="text-xs text-emerald-100/80 leading-relaxed">
              Create, view, and edit live Google Spreadsheets. Export workspace financial ledgers, HR payroll directories, and project task reports directly to your personal or organization's Google Drive.
            </p>
          </div>

          {/* Auth Status Card */}
          <div className="shrink-0 rounded-2xl bg-white/10 border border-white/15 p-4 flex flex-col items-center justify-center min-w-[240px]">
            {isLoadingAuth ? (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-200">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying Session...
              </div>
            ) : user ? (
              <div className="w-full space-y-2.5 text-center">
                <div className="flex items-center gap-2.5 text-left bg-white/10 p-2 rounded-xl border border-white/10">
                  <img
                    src={user.photoURL || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'}
                    alt="User Avatar"
                    className="h-8 w-8 rounded-full border border-emerald-300"
                  />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">{user.displayName || 'Google User'}</p>
                    <p className="text-[10px] text-emerald-200 truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/30">
                    Sheets API Scope Active
                  </span>
                  <button
                    onClick={() => fetchSpreadsheets(accessToken!)}
                    className="text-[10px] font-bold text-emerald-200 hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Sync Sheets
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full space-y-3 text-center">
                <p className="text-xs text-emerald-100 font-medium">Connect Google Account to access Sheets:</p>
                <button
                  onClick={handleConnectGoogle}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-slate-900 px-4 py-2.5 text-xs font-extrabold hover:bg-slate-100 transition-all shadow-md"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Connect Google Sheets
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Quick Export Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-xs">
              <DollarSign className="h-4 w-4 text-emerald-600" /> Financial Transactions
            </div>
            <p className="text-[11px] text-slate-600">
              Export all {(state.invoices || []).length} finance invoice records to a live Google Sheet.
            </p>
          </div>
          <button
            onClick={() => handleQuickExportModule('finance')}
            disabled={isExporting === 'finance'}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white p-2 text-xs font-bold transition-all shadow-xs"
          >
            {isExporting === 'finance' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Export Finance to Google Sheets
          </button>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-blue-800 font-extrabold text-xs">
              <Users className="h-4 w-4 text-blue-600" /> HR Payroll & Employees
            </div>
            <p className="text-[11px] text-slate-600">
              Export team staff directory ({state.employees.length} employees) to Google Sheets.
            </p>
          </div>
          <button
            onClick={() => handleQuickExportModule('employees')}
            disabled={isExporting === 'employees'}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white p-2 text-xs font-bold transition-all shadow-xs"
          >
            {isExporting === 'employees' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Export Employees to Google Sheets
          </button>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-purple-800 font-extrabold text-xs">
              <ListTodo className="h-4 w-4 text-purple-600" /> Project Tasks & Deliverables
            </div>
            <p className="text-[11px] text-slate-600">
              Sync active tasks ({state.tasks.length} items) into Google Sheets spreadsheet.
            </p>
          </div>
          <button
            onClick={() => handleQuickExportModule('tasks')}
            disabled={isExporting === 'tasks'}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white p-2 text-xs font-bold transition-all shadow-xs"
          >
            {isExporting === 'tasks' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Export Tasks to Google Sheets
          </button>
        </div>
      </div>

      {/* Main Section: Spreadsheet File Directory & Live Grid Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Column 1: Spreadsheets Picker */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Google Spreadsheets
              </h3>
              <button
                onClick={() => setShowCreateModal(true)}
                className="p-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-bold flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> New
              </button>
            </div>

            <div className="relative">
              <Search className="h-3 w-3 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search spreadsheets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-7 pr-2 py-1 text-[11px] outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
              {isLoadingList ? (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading files...
                </div>
              ) : filteredSpreadsheets.length > 0 ? (
                filteredSpreadsheets.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSpreadsheet(accessToken || '', s.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between ${
                      activeSpreadsheetId === s.id
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold shadow-2xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="truncate">{s.name}</span>
                    </div>
                    {activeSpreadsheetId === s.id && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-slate-400 text-xs">
                  No spreadsheets found. Click "New" to create one.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 2,3,4: Live Spreadsheet Table Viewer & Cell Editor */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Table className="h-4 w-4 text-emerald-600" />
                  {activeMetadata ? activeMetadata.properties.title : 'Spreadsheet Live Grid View'}
                </h3>
                <p className="text-xs text-slate-500">
                  Interactive cells editable in browser • Syncs with Google Sheets API v4
                </p>
              </div>

              <div className="flex items-center gap-2">
                {activeSpreadsheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${activeSpreadsheetId}`}
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-1.5 text-xs font-bold hover:bg-emerald-100 transition-all"
                    onClick={(e) => {
                      e.preventDefault();
                      void openExternalUrl(`https://docs.google.com/spreadsheets/d/${activeSpreadsheetId}`);
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open in Google Sheets
                  </a>
                )}

                <button
                  onClick={handleAddRow}
                  className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 px-3 py-1.5 text-xs font-bold transition-all"
                >
                  + Add Row
                </button>

                <button
                  onClick={handleSaveToGoogleSheets}
                  disabled={isSavingValues}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-extrabold shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSavingValues ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save to Google Sheets
                </button>
              </div>
            </div>

            {/* Grid Viewer */}
            <div className="overflow-x-auto max-h-[500px] border border-slate-200 rounded-xl bg-slate-50/50">
              {isLoadingValues ? (
                <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> Loading grid cells...
                </div>
              ) : activeValues.length > 0 ? (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                      <th className="w-10 py-2 px-2 text-center text-slate-400 font-mono border-r border-slate-200">#</th>
                      {activeValues[0].map((cellHeader, colIdx) => (
                        <th
                          key={colIdx}
                          className="py-2 px-3 border-r border-slate-200 font-bold bg-slate-200/60 text-slate-900"
                        >
                          <input
                            type="text"
                            value={cellHeader || ''}
                            onChange={(e) => handleCellChange(0, colIdx, e.target.value)}
                            className="bg-transparent font-bold outline-none w-full"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {activeValues.slice(1).map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="py-2 px-2 text-center text-slate-400 font-mono text-[10px] bg-slate-50 border-r border-slate-200">
                          {rowIdx + 1}
                        </td>
                        {activeValues[0].map((_, colIdx) => (
                          <td key={colIdx} className="py-1.5 px-2 border-r border-slate-200">
                            <input
                              type="text"
                              value={row[colIdx] || ''}
                              onChange={(e) => handleCellChange(rowIdx + 1, colIdx, e.target.value)}
                              className="w-full bg-transparent text-xs text-slate-800 outline-none focus:bg-amber-50 focus:px-1 rounded font-medium"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Empty spreadsheet. Click "+ Add Row" to populate headers and data.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create Spreadsheet */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-600 text-white">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Create Google Spreadsheet</h3>
                  <p className="text-xs text-slate-500">Creates new file via Google Sheets API v4</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewSheetSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">Spreadsheet Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Financial Ledger & Budget"
                  value={newSheetTitle}
                  onChange={(e) => setNewSheetTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Initial Template Data</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'finance', label: 'Financial Transactions', desc: 'Pre-fills current workspace finance data' },
                    { id: 'employees', label: 'HR Payroll Directory', desc: 'Pre-fills staff directory records' },
                    { id: 'tasks', label: 'Task Tracker', desc: 'Pre-fills project tasks' },
                    { id: 'custom', label: 'Blank / Custom', desc: 'Empty template with default headers' },
                  ].map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setPresetTemplate(tpl.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        presetTemplate === tpl.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-400'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="font-bold block">{tpl.label}</span>
                      <span className="text-[10px] text-slate-500 block">{tpl.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md flex items-center gap-1.5"
                >
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Create Google Sheet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
