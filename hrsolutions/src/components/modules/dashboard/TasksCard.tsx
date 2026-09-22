'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FolderKanban } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { Skeleton } from '@/components/ui/Skeleton';

export const TasksCard: React.FC = () => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const projectTasks = React.useMemo(() => {
    const all = dashboardState.tasks || state.tasks || [];
    const isExecutive =
      state.currentPersona?.role === 'super_admin' || state.currentPersona?.role === 'hr_manager';
    if (isExecutive) return all;
    return all.filter(
      (t) =>
        t.assigneeId === state.currentPersona?.id ||
        t.assigneeName?.toLowerCase() === state.currentPersona?.name?.toLowerCase()
    );
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

  return (
    <div className="dash-card p-5" data-purpose="tasks-checklist">
      <div className="flex items-center justify-between mb-3.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Tasks</h2>
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="w-5 h-5 rounded-full bg-[var(--bg-surface-subtle)] hover:bg-[color-mix(in_srgb,var(--primary-blue)_12%,transparent)] text-[var(--text-muted)] hover:text-[var(--primary-blue)] flex items-center justify-center transition-[background-color,color,transform] duration-150 cursor-pointer active:scale-[0.97]"
            title="Create Task"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-semibold text-[var(--text-muted)] tabular-nums">
            {remainingCount} of {totalCount} Remaining
          </span>
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="text-xs font-bold text-[var(--primary-blue)] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>Board</span>
          </button>
        </div>
      </div>

      {dashboardState.loading ? (
        <div className="space-y-2">
          <Skeleton height="60px" borderRadius="0.75rem" />
          <Skeleton height="60px" borderRadius="0.75rem" />
          <Skeleton height="60px" borderRadius="0.75rem" />
          <Skeleton height="60px" borderRadius="0.75rem" />
        </div>
      ) : displayTasks.length === 0 ? (
        <div className="py-6 text-center text-[var(--text-muted)] border border-dashed border-[var(--border-color)] rounded-xl">
          <p className="text-xs font-medium">No tasks found on your Project Board</p>
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="mt-2 text-xs font-bold text-[var(--text-secondary)] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Go to Projects</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayTasks.map((task) => {
            const isCompleted = task.status === 'Completed';
            const dueText = formatDueDate(task.dueDate, task.status);

            return (
              <div
                key={task.id}
                onClick={() => router.push('/projects')}
                className={`p-3 rounded-xl border transition-[border-color,background-color] duration-150 cursor-pointer select-none ${
                  isCompleted
                    ? 'bg-[var(--bg-surface-subtle)]/60 border-transparent'
                    : 'bg-[var(--bg-surface-subtle)] border-transparent hover:border-[var(--border-strong)]'
                }`}
              >
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
            );
          })}
        </div>
      )}
    </div>
  );
};
