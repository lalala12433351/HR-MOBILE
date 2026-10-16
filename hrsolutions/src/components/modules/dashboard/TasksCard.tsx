'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FolderKanban } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { DashPanel } from './DashPanel';

export const TasksCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const projectTasks = React.useMemo(() => {
    const all = dashboardState.tasks || state.tasks || [];
    const isExecutive =
      state.currentPersona?.role === 'super_admin' || state.currentPersona?.role === 'hr_manager';
    if (isExecutive) return all;
    const personaId = state.currentPersona?.id;
    const personaName = state.currentPersona?.name?.toLowerCase();
    return all.filter((t) => {
      const ids = [...(t.assigneeIds || []), t.assigneeId].filter(Boolean);
      const names = [...(t.assigneeNames || []), t.assigneeName].map((name) => (name || '').toLowerCase());
      const isMine = (!!personaId && ids.includes(personaId)) || (!!personaName && names.includes(personaName));
      if (!isMine) return false;
      const assignee = (state.employees || []).find(
        (e) => e.id === t.assigneeId || e.name?.toLowerCase() === t.assigneeName?.toLowerCase()
      );
      const assigneeIsExecutive =
        assignee?.role === 'super_admin' ||
        /ceo|founder|chief executive/i.test(assignee?.designation || t.assigneeName || '');
      if (assigneeIsExecutive && assignee?.id !== personaId && !ids.includes(personaId || '')) return false;
      return true;
    });
  }, [dashboardState.tasks, state.tasks, state.currentPersona]);

  const displayTasks = projectTasks.slice(0, 4);
  const remainingCount = displayTasks.filter((t) => t.status !== 'Completed').length;
  const totalCount = displayTasks.length;

  const formatDueDate = (dueDateStr?: string, status?: string) => {
    if (status === 'Completed') return 'Completed';
    if (!dueDateStr) return 'Due Today';
    try {
      const cleanStr = dueDateStr.includes('T') ? dueDateStr.split('T')[0] : dueDateStr;
      const d = new Date(cleanStr + 'T00:00:00');
      if (isNaN(d.getTime())) return `Due ${dueDateStr}`;
      const now = new Date();
      if (d.toDateString() === now.toDateString()) return 'Due Today';
      return `Due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } catch {
      return `Due ${dueDateStr}`;
    }
  };

  const headerAction = (
    <div className="flex items-center gap-3 shrink-0">
      <span className="text-xs font-semibold text-[var(--text-muted)] tabular-nums">
        {remainingCount} of {totalCount} remaining
      </span>
      <button
        type="button"
        onClick={() => router.push('/projects')}
        className="w-7 h-7 rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] hover:text-[var(--primary-blue)] flex items-center justify-center cursor-pointer"
        title="Create task"
      >
        <Plus className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={() => router.push('/projects')}
        className="text-xs font-bold text-[var(--studio-navy)] hover:underline inline-flex items-center gap-1 cursor-pointer"
      >
        <FolderKanban className="w-3.5 h-3.5" />
        Board
      </button>
    </div>
  );

  return (
    <DashPanel title="Open tasks" action={headerAction} className={className} purpose="tasks-checklist">
      {!dashboardState.loading && totalCount > 0 && (
        <div className="w-full h-1 bg-[var(--bg-surface-subtle)] mb-2 overflow-hidden">
          <div
            className="h-full bg-[var(--primary-blue)] transition-[width] duration-200 ease-out"
            style={{ width: `${totalCount > 0 ? ((totalCount - remainingCount) / totalCount) * 100 : 0}%` }}
          />
        </div>
      )}

      {dashboardState.loading ? (
        <div className="space-y-2">
          <Skeleton height="40px" borderRadius="8px" />
          <Skeleton height="40px" borderRadius="8px" />
          <Skeleton height="40px" borderRadius="8px" />
          <Skeleton height="40px" borderRadius="8px" />
        </div>
      ) : displayTasks.length === 0 ? (
        <div className="dash-empty-state">
          <p>No tasks on your board</p>
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="mt-2 text-xs font-bold text-[var(--studio-navy)] hover:underline cursor-pointer"
          >
            Go to projects
          </button>
        </div>
      ) : (
        <div>
          {displayTasks.map((task) => {
            const isCompleted = task.status === 'Completed';
            const dueText = formatDueDate(task.dueDate, task.status);

            return (
              <button
                key={task.id}
                type="button"
                onClick={() => router.push('/projects')}
                className="dash-row dash-row--clickable"
              >
                <div className="min-w-0">
                  <p
                    className={`text-xs text-pretty ${
                      isCompleted
                        ? 'font-medium text-[var(--text-muted)] line-through'
                        : 'font-semibold text-[var(--text-primary)]'
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">{dueText}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </DashPanel>
  );
};
