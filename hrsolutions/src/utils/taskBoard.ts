import { api } from '@/services/apiClient';
import { mapApiTimesheet } from '@/services/backendSync';
import { normalizeTaskStatus } from '@/services/store';
import { Task, TimesheetEntry } from '@/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function localDateString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isUuid(val?: string | null): boolean {
  return !!val && UUID_REGEX.test(val);
}

export function isTaskOverdue(task: Pick<Task, 'dueDate' | 'status'>): boolean {
  if (!task.dueDate) return false;
  if (normalizeTaskStatus(task.status) === 'Completed') return false;
  return task.dueDate.slice(0, 10) < localDateString();
}

export function recurrenceLabel(rule?: Task['recurrenceRule'] | null): string | null {
  if (!rule?.frequency) return null;
  if (rule.frequency === 'daily') return 'Every day';
  if (rule.frequency === 'weekly') return 'Every week';
  if (rule.frequency === 'biweekly') return 'Every 2 weeks';
  if (rule.frequency === 'monthly') return 'Every month';
  return null;
}

function clockLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function findOpenTimesheet(task: Task, timesheets: TimesheetEntry[]): TimesheetEntry | undefined {
  return timesheets.find(
    (ts) => (task.openTimesheetId && ts.id === task.openTimesheetId) || (ts.taskId === task.id && !ts.endTime)
  );
}

export async function openTaskTimesheet(
  task: Task,
  employeeId: string,
  employeeName: string
): Promise<TimesheetEntry> {
  const now = new Date();
  const res = await api.projects.logTimesheet({
    projectId: task.projectId || '',
    taskId: task.id,
    employeeId: task.assigneeId || employeeId,
    workDate: localDateString(now),
    hoursSpent: 0,
    description: `Live work log for ${task.title}`,
    startTime: clockLabel(now),
    billable: task.billable !== false,
    status: 'draft',
    title: task.title,
    category: 'Development',
  });
  if (!res.success || !res.data?.id) {
    throw new Error(res.error?.message || 'Failed to create timesheet');
  }
  const mapped = mapApiTimesheet(res.data);
  return {
    ...mapped,
    employeeName: mapped.employeeName || task.assigneeName || employeeName,
    projectName: mapped.projectName || task.projectName || 'General Project',
    taskTitle: mapped.taskTitle || task.title,
    endTime: undefined,
    status: 'Draft',
  };
}

export async function closeTaskTimesheet(
  task: Task,
  timesheets: TimesheetEntry[],
  nowMs: number
): Promise<{ timeSpentSeconds: number; hours: number; endTime: string; timesheet: TimesheetEntry | null }> {
  const now = new Date(nowMs);
  const endTime = clockLabel(now);
  const elapsed =
    task.isTimerRunning && task.timerStartedAt ? Math.max(0, Math.floor((nowMs - task.timerStartedAt) / 1000)) : 0;
  const timeSpentSeconds = (task.timeSpentSeconds || 0) + elapsed;
  const open = findOpenTimesheet(task, timesheets);
  const hours = Math.max(0.01, Number((((open?.hours || 0) * 3600 + elapsed) / 3600).toFixed(2)));

  if (open && isUuid(open.id)) {
    const res = await api.projects.updateTimesheet(open.id, {
      hoursSpent: hours,
      endTime,
      status: 'submitted',
    });
    const timesheet =
      res.success && res.data
        ? { ...open, ...mapApiTimesheet(res.data), hours, endTime, status: 'Submitted' as const }
        : { ...open, hours, endTime, status: 'Submitted' as const };
    return { timeSpentSeconds, hours, endTime, timesheet };
  }

  const res = await api.projects.logTimesheet({
    projectId: task.projectId || '',
    taskId: task.id,
    employeeId: task.assigneeId,
    workDate: localDateString(now),
    hoursSpent: hours,
    description: `Work log for ${task.title}`,
    startTime: open?.startTime,
    endTime,
    billable: task.billable !== false,
    status: 'submitted',
    title: task.title,
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message || 'Failed to save timesheet');
  }
  return { timeSpentSeconds, hours, endTime, timesheet: mapApiTimesheet(res.data) };
}

/** Close open work logs when someone clocks out, so the timesheet survives a refresh. */
export async function persistClockOutTaskSessions(
  tasks: Task[],
  timesheets: TimesheetEntry[],
  personaId: string,
  personaName: string,
  nowMs: number
): Promise<void> {
  const mine = tasks.filter((task) => {
    const ids = [...(task.assigneeIds || []), task.assigneeId].filter(Boolean);
    const names = [...(task.assigneeNames || []), task.assigneeName].map((name) => (name || '').toLowerCase());
    const isMine = ids.includes(personaId) || names.includes((personaName || '').toLowerCase());
    return isMine && normalizeTaskStatus(task.status) === 'In Progress' && Boolean(task.isTimerRunning && task.timerStartedAt);
  });

  for (const task of mine) {
    const closed = await closeTaskTimesheet(task, timesheets, nowMs);
    await api.projects.updateTask(task.id, {
      timeSpentSeconds: closed.timeSpentSeconds,
      timerStartedAt: null,
    });
  }
}
