'use client';

import React, { useState } from 'react';
import { FileText, Folder, Upload, Download, Share2, CheckCircle2, Search, Plus, Trash2, HardDrive } from 'lucide-react';
import { AppState } from '../../services/store';
import { DriveItem } from '../../types';
import { api } from '../../services/apiClient';
import { GoogleDriveComponent } from '../common/GoogleDriveComponent';

interface DocumentsModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onTriggerToast?: (toast: any) => void;
}

export const DocumentsModule: React.FC<DocumentsModuleProps> = ({ state, onUpdateState, onTriggerToast }) => {
  const [activeTab, setActiveTab] = useState<'google-drive' | 'local-drive'>('google-drive');
  const [selectedFolder, setSelectedFolder] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // New Upload Form
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState<'Personal' | 'Company' | 'Team' | 'Projects'>('Company');
  const [docSize, setDocSize] = useState('2.4 MB');

  const [isSaving, setIsSaving] = useState(false);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const newItem: DriveItem = {
        id: `doc_${Date.now()}`,
        name: docName || 'Untitled Document.pdf',
        type: 'pdf',
        folderCategory: docCategory,
        size: docSize,
        modifiedDate: new Date().toISOString().substring(0, 10),
        owner: state.currentPersona.name,
        sharedWith: ['All Team'],
      };

      // Async register document with backend storage API
      await api.storage.registerDocument({
        employeeId: state.currentPersona.id,
        docType: newItem.folderCategory || 'documents',
        fileName: newItem.name,
        s3Key: `documents/${state.currentPersona.id}/${newItem.id}_${newItem.name}`,
        fileSizeBytes: 2400000,
      });

      onUpdateState((prev) => ({
        ...prev,
        driveItems: [newItem, ...prev.driveItems],
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'DOCUMENT_UPLOADED',
            entity: 'DriveItem',
            entityId: newItem.id,
            ipAddress: '106.51.72.18',
            details: `Uploaded document ${newItem.name} to ${newItem.folderCategory}`,
          },
          ...prev.auditLogs,
        ],
      }));

      setShowUploadModal(false);
      setDocName('');
    } catch (err) {
      console.error('[DocumentsModule] Backend storage register error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    setIsSaving(true);
    try {
      await api.storage.deleteDocument(id);
      onUpdateState((prev) => ({
        ...prev,
        driveItems: prev.driveItems.filter((i) => i.id !== id),
      }));
    } catch (err) {
      console.error('[DocumentsModule] Backend storage delete error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadItem = (name: string) => {
    const blob = new Blob([`HR Document System Export: ${name}\nGenerated: ${new Date().toISOString()}`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name.includes('.') ? name : `${name}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredItems = state.driveItems.filter((item) => {
    const matchesFolder = selectedFolder === 'All' || item.folderCategory === selectedFolder;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.owner.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  const categories = ['All', 'Personal Drive', 'Company Drive', 'Team Folder', 'Project Files'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Document Drive & Cloud Storage</h1>
          <p className="hidden sm:block text-xs text-slate-500 mt-0.5">Google Drive API integration, Meet transcript automation, and local document workflow</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/90 p-1 shadow-2xs w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('google-drive')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'google-drive'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <HardDrive className="h-3.5 w-3.5 shrink-0" />
              <span>Google Drive</span>
            </button>

            <button
              onClick={() => setActiveTab('local-drive')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'local-drive'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span>Local Drive</span>
            </button>
          </div>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-all cursor-pointer w-full sm:w-auto"
          >
            <Upload className="h-4 w-4" /> Upload Document
          </button>
        </div>
      </div>

      {activeTab === 'google-drive' ? (
        <GoogleDriveComponent
          state={state}
          onUpdateState={onUpdateState}
          onTriggerToast={onTriggerToast}
        />
      ) : (
        <>

          {/* Folders Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {['Personal Drive', 'Company Drive', 'Team Folder', 'Project Files'].map((cat) => {
              const count = state.driveItems.filter((i) => i.folderCategory === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedFolder(cat === selectedFolder ? 'All' : cat)}
                  className={`rounded-2xl border p-4 text-left transition-all flex items-center gap-3 ${selectedFolder === cat
                      ? 'border-blue-600 bg-blue-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                    }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold shrink-0">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-900 truncate">{cat}</p>
                    <p className="text-[10px] text-slate-500 font-medium">{count} Files</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Search Bar & Category Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x w-full sm:w-auto pb-1 sm:pb-0 whitespace-nowrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedFolder(cat)}
                  className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all shrink-0 cursor-pointer ${selectedFolder === cat
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Documents Cards (Responsive) */}
          <div className="block md:hidden space-y-3">
            {filteredItems.map((item) => (
              <div key={item.id} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shrink-0">
                      <FileText className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-slate-900 truncate">{item.name}</h3>
                      <p className="text-[11px] text-slate-500">{item.owner} • {item.modifiedDate}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 shrink-0">
                    {item.folderCategory}
                  </span>
                </div>

                {item.taskTitle && (
                  <div className="text-[11px] font-medium text-blue-700 bg-blue-50/70 border border-blue-200/60 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-blue-500" />
                    <span>Task: {item.taskTitle}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                  <span className="text-xs font-medium text-slate-500 tabular-nums">{item.size}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadItem(item.name)}
                      className="flex items-center gap-1 rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-all cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                    <button
                      disabled={isSaving}
                      onClick={() => handleDeleteItem(item.id)}
                      className="flex items-center gap-1 rounded-xl bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-all cursor-pointer disabled:opacity-50"
                      title="Delete Document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredItems.length === 0 && (
              <div className="p-8 rounded-2xl border border-slate-200 bg-white text-center text-xs text-slate-400 font-medium shadow-2xs">
                No documents found matching &quot;{searchQuery}&quot;
              </div>
            )}
          </div>

          {/* Desktop Documents Table */}
          <div className="hidden md:block rounded-2xl border border-slate-200 bg-white overflow-x-auto custom-scrollbar touch-pan-x shadow-2xs">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3.5">Document Name</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Size</th>
                  <th className="p-3.5">Modified</th>
                  <th className="p-3.5">Owner</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </div>
                      {item.taskTitle && (
                        <div className="mt-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                          <FileText className="h-3 w-3 text-blue-500" />
                          Task: {item.taskTitle}
                        </div>
                      )}
                    </td>
                    <td className="p-3.5 font-semibold text-blue-600">{item.folderCategory}</td>
                    <td className="p-3.5 text-slate-500">{item.size}</td>
                    <td className="p-3.5 text-slate-500">{item.modifiedDate}</td>
                    <td className="p-3.5 font-semibold text-slate-800">{item.owner}</td>
                    <td className="p-3.5 text-right space-x-2">
                      <button
                        onClick={() => handleDownloadItem(item.name)}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200 transition-all cursor-pointer"
                      >
                        <Download className="h-3 w-3 inline mr-1" /> Download
                      </button>
                      <button
                        disabled={isSaving}
                        onClick={() => handleDeleteItem(item.id)}
                        className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-100 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3 inline" />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-slate-400 font-semibold">
                      No documents found matching "{searchQuery}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Upload Document Modal */}
          {showUploadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
              <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                <h3 className="text-base font-bold text-slate-900 mb-3">Upload Document to Drive</h3>
                <form onSubmit={handleUploadSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Document Title</label>
                    <input
                      type="text"
                      required
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      placeholder="e.g. Q3 Financial Audit Report.pdf"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Folder Category</label>
                    <select
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 font-medium"
                    >
                      <option value="Personal">Personal Drive</option>
                      <option value="Company">Company Drive</option>
                      <option value="Team">Team Folder</option>
                      <option value="Projects">Project Files</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">File Size</label>
                    <input
                      type="text"
                      value={docSize}
                      onChange={(e) => setDocSize(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 font-medium"
                    />
                  </div>

                  <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-4 text-center">
                    <Upload className="h-6 w-6 text-blue-600 mx-auto mb-1" />
                    <p className="text-xs font-bold text-blue-900">Drag & Drop files or click to browse</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Supports PDF, DOCX, XLSX, PNG up to 100MB</p>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {isSaving ? 'Uploading...' : 'Upload Now'}
                </button>
              </div>  </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

