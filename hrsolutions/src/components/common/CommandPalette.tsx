'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, ArrowUp, ArrowDown, CornerDownLeft } from 'lucide-react';
import { AppState } from '../../services/store';
import { PixbeIcon, PixbeIconName } from '@/components/common/PixbeIcon';
import { canManageTask, isExecutiveOrAdmin } from '@/utils/teamAccess';
import { flattenWorkspaceNav, getWorkspaceModeLabel } from '@/utils/workspaceNav';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  state: AppState;
  onSelectModule: (module: string) => void;
  onOpenAIAssistantWithQuery: (query: string) => void;
}

export type SearchCategory =
  | 'all'
  | 'pages'
  | 'people'
  | 'work'
  | 'announcements';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'Page' | 'Person' | 'Student' | 'Task' | 'Project' | 'Announcement' | 'Invoice';
  icon: PixbeIconName;
  action: () => void;
  keywords?: string[];
  score?: number;
  meta?: string;
}

function computeFuzzyScore(query: string, target: string): number {
  if (!query || !target) return 0;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();

  if (t === q) return 1000;
  if (t.startsWith(q)) return 500 + (100 - t.length);

  const words = t.split(/[\s\-_\/]+/);
  for (const w of words) {
    if (w.startsWith(q)) return 350 + (50 - w.length);
  }

  const subIdx = t.indexOf(q);
  if (subIdx >= 0) return 200 - subIdx;

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

  return matches === q.length ? score : 0;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpen,
  state,
  onSelectModule,
  onOpenAIAssistantWithQuery: _onOpenAIAssistantWithQuery,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const mode = getWorkspaceModeLabel(state.organization, state.currentPersona);
  const isCompany = mode === 'company';
  const isInstitution = mode === 'institution';
  const isStudent = mode === 'student';
  const canManageFinance = isExecutiveOrAdmin(state.currentPersona);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          onOpen?.();
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setSelectedCategory('all');
      const t = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
  }, [isOpen]);

  const categoryTabs = useMemo(() => {
    const tabs: Array<{ id: SearchCategory; label: string }> = [{ id: 'all', label: 'All' }];
    tabs.push({ id: 'pages', label: 'Pages' });
    if (!isStudent) {
      tabs.push({ id: 'people', label: isInstitution ? 'Staff & students' : 'People' });
    }
    if (isCompany) {
      tabs.push({ id: 'work', label: 'Work' });
    }
    tabs.push({ id: 'announcements', label: 'Announcements' });
    return tabs;
  }, [isCompany, isInstitution, isStudent]);

  const searchPlaceholder = isStudent
    ? 'Search pages and announcements…'
    : isInstitution
      ? 'Search pages, staff, students…'
      : 'Search pages, people, projects…';

  const allSearchableItems: SearchResultItem[] = useMemo(() => {
    const items: SearchResultItem[] = [];
    const go = (moduleId: string) => {
      onSelectModule(moduleId);
      onClose();
    };

    flattenWorkspaceNav(state.organization, state.currentPersona).forEach((nav) => {
      items.push({
        id: `nav_${nav.id}`,
        title: nav.label,
        subtitle: nav.subtitle,
        category: 'Page',
        icon: nav.icon,
        keywords: nav.keywords,
        meta: 'Page',
        action: () => go(nav.id),
      });
    });

    if (!isStudent) {
      (state.employees || []).forEach((emp) => {
        items.push({
          id: `emp_${emp.id}`,
          title: emp.name,
          subtitle: [emp.designation, emp.department].filter(Boolean).join(' · ') || 'Team member',
          category: 'Person',
          icon: 'people',
          keywords: [emp.name, emp.email, emp.employeeId, emp.department, emp.designation, emp.phone].filter(
            Boolean
          ) as string[],
          meta: emp.department || 'Team',
          action: () => go('hr'),
        });
      });
    }

    if (isInstitution) {
      (state.students || []).forEach((stu) => {
        items.push({
          id: `stu_${stu.id}`,
          title: stu.name,
          subtitle: [`Roll ${stu.rollNumber}`, stu.grade, stu.section ? `Sec ${stu.section}` : '']
            .filter(Boolean)
            .join(' · '),
          category: 'Student',
          icon: 'students',
          keywords: [
            stu.name,
            stu.rollNumber,
            stu.grade,
            stu.section || '',
            stu.email,
            stu.guardianName || '',
          ].filter(Boolean) as string[],
          meta: stu.grade || 'Student',
          action: () => go('student-directory'),
        });
      });
    }

    if (isCompany) {
      (state.tasks || [])
        .filter((task) => canManageTask(state.currentPersona, task, state.employees || []))
        .forEach((task) => {
        items.push({
          id: `task_${task.id}`,
          title: task.title,
          subtitle: [task.projectName, task.assigneeName, task.status].filter(Boolean).join(' · '),
          category: 'Task',
          icon: 'tasks',
          keywords: [
            task.title,
            task.description,
            task.projectName,
            task.assigneeName,
            task.status,
            task.priority,
            task.taskKey || '',
          ].filter(Boolean) as string[],
          meta: task.status,
          action: () => go('projects'),
        });
      });

      (state.projects || []).forEach((proj) => {
        items.push({
          id: `proj_${proj.id}`,
          title: proj.name,
          subtitle: [proj.code, proj.managerName, proj.category].filter(Boolean).join(' · '),
          category: 'Project',
          icon: 'projects',
          keywords: [proj.name, proj.code, proj.clientName || '', proj.managerName, proj.category || ''].filter(
            Boolean
          ) as string[],
          meta: proj.status || 'Active',
          action: () => go('projects'),
        });
      });

      if (canManageFinance) {
        (state.invoices || []).forEach((inv) => {
          items.push({
            id: `inv_${inv.id}`,
            title: `${inv.invoiceNumber} — ${inv.customerName}`,
            subtitle: `₹${(inv.totalAmount || 0).toLocaleString('en-IN')} · ${inv.status}`,
            category: 'Invoice',
            icon: 'payslips',
            keywords: [inv.invoiceNumber, inv.customerName, inv.status, String(inv.totalAmount)],
            meta: inv.status,
            action: () => go('payroll'),
          });
        });
      }
    }

    (state.announcements || []).forEach((ann) => {
      items.push({
        id: `ann_${ann.id}`,
        title: ann.title,
        subtitle: [ann.authorName, ann.date, ann.category].filter(Boolean).join(' · '),
        category: 'Announcement',
        icon: 'announcements',
        keywords: [ann.title, ann.content, ann.authorName, ann.category, ...(ann.tags || [])].filter(
          Boolean
        ) as string[],
        meta: ann.category,
        action: () => go('announcements'),
      });
    });

    return items;
  }, [state, onSelectModule, onClose, isCompany, isInstitution, isStudent, canManageFinance]);

  const searchResults = useMemo(() => {
    const trimmed = query.trim();
    let list = allSearchableItems;

    if (selectedCategory !== 'all') {
      list = list.filter((item) => {
        if (selectedCategory === 'pages') return item.category === 'Page';
        if (selectedCategory === 'people') return item.category === 'Person' || item.category === 'Student';
        if (selectedCategory === 'work') return item.category === 'Task' || item.category === 'Project' || item.category === 'Invoice';
        if (selectedCategory === 'announcements') return item.category === 'Announcement';
        return true;
      });
    }

    if (!trimmed) {
      // Prefer pages first when browsing; keep the list short.
      const pages = list.filter((i) => i.category === 'Page');
      const rest = list.filter((i) => i.category !== 'Page');
      return [...pages, ...rest].slice(0, 14);
    }

    const scored = list
      .map((item) => {
        let maxScore = computeFuzzyScore(trimmed, item.title);
        const subScore = computeFuzzyScore(trimmed, item.subtitle);
        if (subScore > maxScore) maxScore = subScore * 0.8;
        const catScore = computeFuzzyScore(trimmed, item.category);
        if (catScore > maxScore) maxScore = catScore * 0.55;
        if (item.keywords) {
          for (const kw of item.keywords) {
            if (!kw) continue;
            const kwScore = computeFuzzyScore(trimmed, kw);
            if (kwScore > maxScore) maxScore = kwScore * 0.9;
          }
        }
        return { ...item, score: maxScore };
      })
      .filter((item) => (item.score || 0) > 0)
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    return scored.slice(0, 24);
  }, [allSearchableItems, query, selectedCategory]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, selectedCategory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      searchResults[selectedIndex]?.action();
    }
  };

  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search workspace"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="command-palette-search">
          <Search className="command-palette-search-icon" aria-hidden strokeWidth={1.9} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="command-palette-input"
            aria-label="Search"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="command-palette-clear"
              aria-label="Clear search"
            >
              <X size={15} strokeWidth={1.9} />
            </button>
          ) : null}
          <kbd className="command-palette-esc">Esc</kbd>
        </div>

        <div className="command-palette-tabs" role="tablist" aria-label="Filter results">
          {categoryTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className="command-palette-tab"
              data-active={selectedCategory === tab.id ? 'true' : 'false'}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div ref={listRef} className="command-palette-results custom-scrollbar">
          {searchResults.length > 0 ? (
            <ul className="command-palette-list">
              {searchResults.map((item, idx) => {
                const selected = idx === selectedIndex;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      data-index={idx}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className="command-palette-item"
                      data-selected={selected ? 'true' : 'false'}
                    >
                      <span className="command-palette-item-icon" aria-hidden>
                        <PixbeIcon name={item.icon} size={18} />
                      </span>
                      <span className="command-palette-item-copy">
                        <span className="command-palette-item-title">{item.title}</span>
                        <span className="command-palette-item-sub">{item.subtitle}</span>
                      </span>
                      <span className="command-palette-item-meta">{item.meta || item.category}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="command-palette-empty">
              <p>No matches for “{query}”</p>
              <span>Try a page name, person, or shorter keyword.</span>
            </div>
          )}
        </div>

        <div className="command-palette-footer">
          <span className="command-palette-hint">
            <kbd aria-hidden>
              <ArrowUp size={10} strokeWidth={2.2} />
            </kbd>
            <kbd aria-hidden>
              <ArrowDown size={10} strokeWidth={2.2} />
            </kbd>
            Move
          </span>
          <span className="command-palette-hint">
            <kbd aria-hidden>
              <CornerDownLeft size={10} strokeWidth={2.2} />
            </kbd>
            Open
          </span>
        </div>
      </div>
    </div>
  );
};
