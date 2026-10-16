'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Command,
  ArrowRight,
  User,
  FolderKanban,
  Receipt,
  Building2,
  Bot,
  Clock,
  Calendar,
  Layers,
  FileText,
  Megaphone,
  Sparkles,
  Shield,
  HelpCircle,
  FileCode,
  GraduationCap,
  Briefcase,
  Paperclip,
  CheckCircle2,
  DollarSign,
  ChevronRight,
  X,
  CreditCard,
  Settings,
  Bell,
  Users,
} from 'lucide-react';
import { AppState } from '../../services/store';
import { isExecutiveOrAdmin } from '@/utils/teamAccess';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onSelectModule: (module: string) => void;
  onOpenAIAssistantWithQuery: (query: string) => void;
}

export type SearchCategory =
  | 'all'
  | 'navigation'
  | 'people'
  | 'tasks_projects'
  | 'broadcasts'
  | 'finance_docs';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'Navigation' | 'Employee' | 'Student' | 'Task' | 'Project' | 'Announcement' | 'Invoice' | 'Document' | 'Ticket';
  badge?: string;
  badgeType?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
  score?: number;
}

// Precision Fuzzy Matching Algorithm with Subsequence & Prefix Scoring
function computeFuzzyScore(query: string, target: string): number {
  if (!query || !target) return 0;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (t === q) return 1000;
  if (t.startsWith(q)) return 500 + (100 - t.length);

  // Word boundary match
  const words = t.split(/[\s\-_\/]+/);
  for (const w of words) {
    if (w.startsWith(q)) return 350 + (50 - w.length);
  }

  // Substring index match
  const subIdx = t.indexOf(q);
  if (subIdx >= 0) return 200 - subIdx;

  // Subsequence match (all query characters in order)
  let qIdx = 0;
  let tIdx = 0;
  let matches = 0;
  let consecutive = 0;
  let score = 0;

  while (qIdx < q.length && tIdx < t.length) {
    if (q[qIdx] === t[tIdx]) {
      matches++;
      consecutive++;
      score += 10 + consecutive * 5;
      qIdx++;
    } else {
      consecutive = 0;
    }
    tIdx++;
  }

  if (matches === q.length) {
    return score;
  }

  return 0;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  state,
  onSelectModule,
  onOpenAIAssistantWithQuery,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global Keyboard Shortcut (Cmd+K / Ctrl+K / Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          setQuery('');
          setSelectedIndex(0);
          setSelectedCategory('all');
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus input automatically on open
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build Comprehensive Searchable Entity Catalog
  const allSearchableItems: SearchResultItem[] = useMemo(() => {
    const items: SearchResultItem[] = [];

    // 1. Navigation Modules & Fast Shortcuts
    const navigationList: Array<{
      id: string;
      title: string;
      subtitle: string;
      icon: React.ComponentType<{ className?: string }>;
      moduleId: string;
      keywords: string[];
    }> = [
      {
        id: 'nav_dashboard',
        title: 'Executive Dashboard',
        subtitle: 'Overview KPIs, employee telemetry & quick analytics',
        icon: Command,
        moduleId: 'dashboard',
        keywords: ['home', 'kpi', 'metrics', 'stats', 'analytics'],
      },
      {
        id: 'nav_hr',
        title: 'HRMS Employee Directory',
        subtitle: 'Manage staff records, contracts, onboarding & profiles',
        icon: User,
        moduleId: 'hr',
        keywords: ['employees', 'staff', 'people', 'workers', 'team', 'faculty'],
      },
      {
        id: 'nav_projects',
        title: 'Projects & Tasks',
        subtitle: 'Kanban boards, deliverables, milestones & sprints',
        icon: FolderKanban,
        moduleId: 'projects',
        keywords: ['sprint', 'kanban', 'tasks', 'deliverables', 'issues', 'bugs'],
      },
      {
        id: 'nav_timesheets',
        title: 'Timesheets & Work Logs',
        subtitle: 'Live time tracking, work hour logs & approval workflows',
        icon: Clock,
        moduleId: 'timesheets',
        keywords: ['timer', 'hours', 'logs', 'attendance', 'clock in', 'shifts'],
      },
      {
        id: 'nav_attendance',
        title: 'Staff Attendance & Bio-Logs',
        subtitle: 'Shift tracking, check-ins, geofencing & regularizations',
        icon: Calendar,
        moduleId: 'attendance',
        keywords: ['clock in', 'clock out', 'shifts', 'punctuality', 'leaves'],
      },
      {
        id: 'nav_leaves',
        title: 'Leaves & Time Off',
        subtitle: 'Vacation, sick leave requests, holidays & balances',
        icon: Briefcase,
        moduleId: 'leaves',
        keywords: ['vacation', 'pto', 'holiday', 'sick', 'timeoff', 'absence'],
      },
      {
        id: 'nav_payroll',
        title: 'Payroll & Compensation',
        subtitle: 'Salary structures, payslips, deductions & direct deposits',
        icon: Receipt,
        moduleId: 'payroll',
        keywords: ['salary', 'payslip', 'wages', 'compensation', 'bonus', 'tax'],
      },
      {
        id: 'nav_announcements',
        title: 'Announcements & Broadcasts',
        subtitle: 'Company bulletins, policy updates & milestone feeds',
        icon: Megaphone,
        moduleId: 'announcements',
        keywords: ['news', 'broadcast', 'bulletin', 'updates', 'notices', 'feed'],
      },
      {
        id: 'nav_student_dir',
        title: 'Student & Academic Directory',
        subtitle: 'Student enrollment, roll numbers, class batches & profiles',
        icon: GraduationCap,
        moduleId: 'student-directory',
        keywords: ['students', 'classes', 'grades', 'batches', 'academics', 'roll number'],
      },
      {
        id: 'nav_student_att',
        title: 'Student Attendance Logs',
        subtitle: 'Classroom roll call, subject shifts & academic percentages',
        icon: Users,
        moduleId: 'student-attendance',
        keywords: ['roll call', 'student attendance', 'absenteeism', 'classes'],
      },
      {
        id: 'nav_reports',
        title: 'Reports & Analytics',
        subtitle: 'Ops overview plus attendance, leave & muster reports',
        icon: FileText,
        moduleId: 'reports',
        keywords: ['export', 'csv', 'pdf', 'charts', 'headcount', 'metrics'],
      },
      {
        id: 'nav_notifications',
        title: 'Activity Notifications',
        subtitle: 'System alerts, task assignments & audit activity feed',
        icon: Bell,
        moduleId: 'notifications',
        keywords: ['alerts', 'notifications', 'updates', 'unread'],
      },
    ];

    const canAccessReports = isExecutiveOrAdmin(state.currentPersona);
    navigationList
      .filter((nav) => nav.moduleId !== 'reports' || canAccessReports)
      .forEach((nav) => {
      items.push({
        id: nav.id,
        title: nav.title,
        subtitle: nav.subtitle,
        category: 'Navigation',
        badge: 'Module',
        badgeType: 'primary',
        icon: nav.icon,
        keywords: nav.keywords,
        action: () => {
          onSelectModule(nav.moduleId);
          onClose();
        },
      });
    });

    // 2. Employees & Staff
    (state.employees || []).forEach((emp) => {
      items.push({
        id: `emp_${emp.id}`,
        title: emp.name,
        subtitle: `${emp.designation || 'Team Member'} • ${emp.department || 'General'} (${emp.employeeId || 'ID: ' + emp.id})`,
        category: 'Employee',
        badge: emp.department || 'Staff',
        badgeType: 'neutral',
        icon: User,
        keywords: [emp.name, emp.email, emp.employeeId, emp.department, emp.designation, emp.phone],
        action: () => {
          onSelectModule('hr');
          onClose();
        },
      });
    });

    // 3. Students (Academic Mode)
    (state.students || []).forEach((stu) => {
      items.push({
        id: `stu_${stu.id}`,
        title: stu.name,
        subtitle: `Roll: ${stu.rollNumber} • ${stu.grade}${stu.section ? ` - Sec ${stu.section}` : ''} • ${stu.email}`,
        category: 'Student',
        badge: stu.grade || 'Student',
        badgeType: 'primary',
        icon: GraduationCap,
        keywords: [stu.name, stu.rollNumber, stu.grade, stu.section || '', stu.email, stu.guardianName || ''],
        action: () => {
          onSelectModule('student-directory');
          onClose();
        },
      });
    });

    // 4. Tasks & Deliverables
    (state.tasks || []).forEach((task) => {
      const isDone = task.status === 'Completed';
      items.push({
        id: `task_${task.id}`,
        title: task.title,
        subtitle: `${task.projectName || 'General Workspace'} • Assignee: ${task.assigneeName || 'Unassigned'} • Priority: ${task.priority}`,
        category: 'Task',
        badge: task.status,
        badgeType: isDone ? 'success' : task.status === 'In Progress' ? 'primary' : 'warning',
        icon: FolderKanban,
        keywords: [task.title, task.description, task.projectName, task.assigneeName, task.status, task.priority, task.taskKey || ''],
        action: () => {
          onSelectModule('projects');
          onClose();
        },
      });
    });

    // 5. Projects & Workspaces
    (state.projects || []).forEach((proj) => {
      items.push({
        id: `proj_${proj.id}`,
        title: proj.name,
        subtitle: `Code: ${proj.code} • Lead: ${proj.managerName || 'Admin'} • Category: ${proj.category || 'General'}`,
        category: 'Project',
        badge: proj.status || 'Active',
        badgeType: 'primary',
        icon: Layers,
        keywords: [proj.name, proj.code, proj.clientName || '', proj.managerName, proj.category || ''],
        action: () => {
          onSelectModule('projects');
          onClose();
        },
      });
    });

    // 6. Announcements & Broadcasts
    (state.announcements || []).forEach((ann) => {
      items.push({
        id: `ann_${ann.id}`,
        title: ann.title,
        subtitle: `By ${ann.authorName} (${ann.authorRole}) • ${ann.date} • ${ann.category}`,
        category: 'Announcement',
        badge: ann.category,
        badgeType: ann.category === 'Urgent' ? 'error' : 'neutral',
        icon: Megaphone,
        keywords: [ann.title, ann.content, ann.authorName, ann.category, ...(ann.tags || [])],
        action: () => {
          onSelectModule('announcements');
          onClose();
        },
      });
    });

    // 7. Invoices & Expenses
    (state.invoices || []).forEach((inv) => {
      items.push({
        id: `inv_${inv.id}`,
        title: `${inv.invoiceNumber} — ${inv.customerName}`,
        subtitle: `Total: ₹${(inv.totalAmount || 0).toLocaleString('en-IN')} • Due: ${inv.dueDate || 'N/A'}`,
        category: 'Invoice',
        badge: inv.status,
        badgeType: inv.status === 'Paid' ? 'success' : 'warning',
        icon: Receipt,
        keywords: [inv.invoiceNumber, inv.customerName, inv.status, String(inv.totalAmount)],
        action: () => {
          onSelectModule('payroll');
          onClose();
        },
      });
    });

    // 8. Documents & Drive Files
    (state.driveItems || []).forEach((doc) => {
      items.push({
        id: `doc_${doc.id}`,
        title: doc.name,
        subtitle: `Owner: ${doc.owner} • Category: ${doc.folderCategory}${doc.size ? ` • ${doc.size}` : ''}`,
        category: 'Document',
        badge: (doc.type || 'file').toUpperCase(),
        badgeType: 'neutral',
        icon: Paperclip,
        keywords: [doc.name, doc.owner, doc.folderCategory, doc.type || '', ...(doc.tags || [])],
        action: () => {
          onSelectModule('projects');
          onClose();
        },
      });
    });

    return items;
  }, [state, onSelectModule, onClose]);

  // Compute Scored & Filtered Search Results
  const searchResults = useMemo(() => {
    const trimmed = query.trim();

    let list = allSearchableItems;

    // Filter by active category tab
    if (selectedCategory !== 'all') {
      list = list.filter((item) => {
        if (selectedCategory === 'navigation') return item.category === 'Navigation';
        if (selectedCategory === 'people') return item.category === 'Employee' || item.category === 'Student';
        if (selectedCategory === 'tasks_projects') return item.category === 'Task' || item.category === 'Project';
        if (selectedCategory === 'broadcasts') return item.category === 'Announcement';
        if (selectedCategory === 'finance_docs') return item.category === 'Invoice' || item.category === 'Document';
        return true;
      });
    }

    if (!trimmed) {
      // Default initial view: Navigation items + Recent top items
      return list.slice(0, 18);
    }

    // Score and sort by fuzzy relevance
    const scored = list
      .map((item) => {
        let maxScore = computeFuzzyScore(trimmed, item.title);

        const subScore = computeFuzzyScore(trimmed, item.subtitle);
        if (subScore > maxScore) maxScore = subScore * 0.8;

        const catScore = computeFuzzyScore(trimmed, item.category);
        if (catScore > maxScore) maxScore = catScore * 0.6;

        if (item.keywords) {
          for (const kw of item.keywords) {
            if (kw) {
              const kwScore = computeFuzzyScore(trimmed, kw);
              if (kwScore > maxScore) maxScore = kwScore * 0.9;
            }
          }
        }

        return { ...item, score: maxScore };
      })
      .filter((item) => (item.score || 0) > 0)
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    return scored.slice(0, 25);
  }, [allSearchableItems, query, selectedCategory]);

  // Handle Keyboard Navigation within the list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        searchResults[selectedIndex].action();
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const getBadgeClass = (type?: SearchResultItem['badgeType']) => {
    switch (type) {
      case 'primary':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'success':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'warning':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'error':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border-[var(--border-color)]';
    }
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-start justify-center pt-8 sm:pt-16 px-3 sm:px-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--text-primary)] cursor-default flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 1. Header Search Input Bar */}
        <div className="flex items-center border-b border-[var(--border-color)] px-4 py-3 bg-[var(--bg-surface)] shrink-0 gap-3">
          <Search className="h-5 w-5 text-blue-600 shrink-0 stroke-[2.2]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search tasks, employees, students, invoices, deliverables..."
            className="flex-1 bg-transparent text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-md hover:bg-[var(--bg-surface-subtle)] cursor-pointer transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-mono font-semibold text-[var(--text-muted)]">
            ESC
          </kbd>
        </div>

        {/* 2. Category Filter Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/70 overflow-x-auto custom-scrollbar shrink-0 text-xs">
          {[
            { id: 'all', label: 'All Results' },
            { id: 'navigation', label: 'Navigation' },
            { id: 'people', label: 'Employees & Students' },
            { id: 'tasks_projects', label: 'Tasks & Projects' },
            { id: 'broadcasts', label: 'Broadcasts' },
            { id: 'finance_docs', label: 'Finance & Files' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedCategory(tab.id as SearchCategory);
                setSelectedIndex(0);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === tab.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 3. Results Container */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--border-color)] custom-scrollbar bg-[var(--bg-surface)]"
        >
          {/* Search Result Items */}
          {searchResults.length > 0 ? (
            <div className="space-y-1 p-1">
              {searchResults.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const Icon = item.icon;

                return (
                  <div
                    key={item.id}
                    data-index={idx}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-50/80 border border-blue-200 text-[var(--text-primary)] shadow-2xs'
                        : 'hover:bg-[var(--bg-surface-subtle)] border border-transparent text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <Icon className="h-4 w-4 stroke-[1.8]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {item.title}
                          </p>
                          {item.badge && (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${getBadgeClass(
                                item.badgeType
                              )}`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] truncate font-medium mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden sm:inline">
                        {item.category}
                      </span>
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition-colors ${
                          isSelected ? 'text-blue-600' : 'text-slate-300'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 px-4 text-center space-y-3">
              <Search className="h-8 w-8 text-slate-300 mx-auto stroke-[1.5]" />
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  No matches found for &quot;{query}&quot;
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Try searching with different keywords, names, or module titles.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 4. Footer Help & Shortcut Bar */}
        <div className="px-4 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-surface-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)] shrink-0 font-medium">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--border-color)] bg-[var(--bg-surface)] px-1 py-0.5 font-mono text-[10px] font-semibold shadow-2xs">
                ↑
              </kbd>
              <kbd className="rounded border border-[var(--border-color)] bg-[var(--bg-surface)] px-1 py-0.5 font-mono text-[10px] font-semibold shadow-2xs">
                ↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--border-color)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-2xs">
                ↵
              </kbd>
              <span>Select</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">Total index:</span>
            <span className="font-bold text-[var(--text-secondary)] font-mono">
              {allSearchableItems.length} entities
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
