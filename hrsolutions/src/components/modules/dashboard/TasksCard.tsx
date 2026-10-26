'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { DashPanel } from './DashPanel';

export const TasksCard: React.FC<{ className?: string; title?: string; limit?: number }> = ({ className = '', title = 'Open tasks', limit = 3 }) => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const projectTasks = React.useMemo(() => {
    const all = dashboardState.tasks || state.tasks || [];
    const isExecutive =
      state.currentPersona?.role === 'super_admin' || state.currentPersona?.role === 'admin' || state.currentPersona?.role === 'hr_manager';
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
  }, [dashboardState.tasks, state.tasks, state.currentPersona, state.employees]);

  const openTasks = projectTasks.filter((task) => task.status !== 'Completed');
  const displayTasks = openTasks.slice(0, limit);
  const remainingCount = displayTasks.filter((t) => t.status !== 'Completed').length;
  const totalCount = displayTasks.length;

  const formatDueDate = (dueDateStr?: string, status?: string) => {
    if (status === 'Completed') return 'Completed';
    if (!dueDateStr) return 'No due date';
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
      <button
        type="button"
        onClick={() => router.push('/projects')}
        className="w-7 h-7 rounded-[6px] border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
        title={`Create task. ${remainingCount} of ${totalCount} remaining`}
      >
        <Plus className="w-3 h-3" />
      </button>
      <button type="button" onClick={() => router.push('/projects')} className="dash-quiet-link">
        Projects ›
      </button>
    </div>
  );

  return (
    <DashPanel title={title} action={headerAction} className={`${className} ${!dashboardState.loading && displayTasks.length === 0 ? 'dash-panel--empty-work' : ''}`.trim()} purpose="tasks-checklist">

      {dashboardState.loading ? (
        <div className="space-y-2">
          <Skeleton height="40px" borderRadius="8px" />
          <Skeleton height="40px" borderRadius="8px" />
          <Skeleton height="40px" borderRadius="8px" />
          <Skeleton height="40px" borderRadius="8px" />
        </div>
      ) : displayTasks.length === 0 ? (
        <div className="dash-work-empty">
          <p className="dash-work-empty-title">No open tasks</p>
          <p className="dash-work-empty-description">You're all caught up. New tasks will appear here.</p>
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="dash-quiet-link dash-work-empty-action"
          >
            Go to projects
          </button>
        </div>
      ) : (
        <div className="dash-task-list">
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
                <span className="dash-check" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={`dash-people-name ${isCompleted ? 'line-through text-[var(--text-muted)]' : ''}`}>
                    {task.title}
                  </p>
                  <p className="dash-people-meta">
                    {[task.projectName, task.assigneeName].filter(Boolean).join(' · ') || 'Project task'}
                  </p>
                </div>
                <span className="dash-people-return">{dueText.replace(/^Due /, '')}</span>
              </button>
            );
          })}
        </div>
      )}
      {openTasks.length > displayTasks.length && (
        <button type="button" className="dash-quiet-link dash-tasks-more" onClick={() => router.push('/projects')}>
          View all {openTasks.length} open tasks ↗
        </button>
      )}
    </DashPanel>
  );
};
