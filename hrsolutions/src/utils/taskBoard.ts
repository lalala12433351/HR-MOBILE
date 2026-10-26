import { api } from '@/services/apiClient';
import { mapApiTask, mapApiTimesheet } from '@/services/backendSync';
import { normalizeTaskStatus } from '@/services/store';
import { Task, TimesheetEntry } from '@/types';

const PRIORITY_RANK: Record<string, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export type PriorityTone = 'urgent' | 'high' | 'medium' | 'low';

export function priorityTone(priority?: string | null): PriorityTone {
  if (priority === 'Urgent') return 'urgent';
  if (priority === 'High') return 'high';
  if (priority === 'Low') return 'low';
  return 'medium';
}

export function priorityRank(priority?: string | null): number {
  return PRIORITY_RANK[priority || ''] ?? PRIORITY_RANK.Medium;
}

export function compareTaskPriority(
  a: Pick<Task, 'priority' | 'dueDate' | 'title'>,
  b: Pick<Task, 'priority' | 'dueDate' | 'title'>
): number {
  const rank = priorityRank(a.priority) - priorityRank(b.priority);
  if (rank !== 0) return rank;
  const ad = a.dueDate || '9999-12-31';
  const bd = b.dueDate || '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return (a.title || '').localeCompare(b.title || '');
}

/** Saved board positions win. Tasks that have never been moved stay in priority order. */
export function sortColumnTasks(tasks: Task[]): Task[] {
  const byPriority = (a: Task, b: Task) => compareTaskPriority(a, b);
  const manual = tasks
    .filter((task) => typeof task.boardOrder === 'number')
    .sort((a, b) => (a.boardOrder! - b.boardOrder!) || byPriority(a, b));
  const fresh = tasks.filter((task) => typeof task.boardOrder !== 'number').sort(byPriority);
  if (!manual.length) return fresh;

  const result = [...manual];
  for (const task of fresh) {
    const rank = priorityRank(task.priority);
    const index = result.findIndex((item) => priorityRank(item.priority) > rank);
    if (index === -1) result.push(task);
    else result.splice(index, 0, task);
  }
  return result;
}

/** Keep tasks hidden by filters in place, and write the visible order into the gaps they leave. */
export function mergeVisibleColumnOrder(allInColumn: Task[], visibleOrdered: Task[]): string[] {
  const visibleIds = new Set(visibleOrdered.map((task) => task.id));
  const queue = visibleOrdered.map((task) => task.id);
  const ids = sortColumnTasks(allInColumn).map((task) => (visibleIds.has(task.id) ? queue.shift() || task.id : task.id));
  for (const id of queue) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Index in the column after the dragged card is removed. */
export function boardInsertionIndex(
  tasks: { id: string }[],
  draggedId: string | null,
  cardIndex: number,
  after: boolean
): number {
  let index = after ? cardIndex + 1 : cardIndex;
  if (draggedId) {
    const from = tasks.findIndex((task) => task.id === draggedId);
    if (from >= 0 && index > from) index -= 1;
  }
  const length = draggedId && tasks.some((task) => task.id === draggedId) ? tasks.length - 1 : tasks.length;
  return Math.max(0, Math.min(index, length));
}

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

export function findOpenTimesheet(
  task: Task,
  timesheets: TimesheetEntry[] | undefined,
  employeeId?: string
): TimesheetEntry | undefined {
  const open = (timesheets || []).filter((ts) => {
    if (ts.endTime || ts.entryType === 'schedule') return false;
    if (employeeId && ts.employeeId && ts.employeeId !== employeeId) return false;
    return ts.taskId === task.id || ts.id === task.openTimesheetId;
  });
  if (employeeId) return open.find((ts) => ts.employeeId === employeeId);
  return open.find((ts) => ts.taskId === task.id);
}

export function clockToMinutes(timeStr?: string | null): number {
  const value = String(timeStr || '').trim();
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return Number.POSITIVE_INFINITY;
  let hours = Number(match[1]) || 0;
  const minutes = Number(match[2] || 0);
  const meridiem = (match[3] || '').toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export type TaskDayMergePlan = {
  keeper: TimesheetEntry;
  extras: TimesheetEntry[];
  merged: TimesheetEntry;
};

function mutableTaskEntry(entry: TimesheetEntry): boolean {
  return !!entry.taskId && entry.entryType !== 'schedule' && (entry.status === 'Draft' || entry.status === 'Submitted');
}

/** Stop + start on the same task and day is one block, including after the second session is stopped. */
export function taskDayMergePlans(entries: TimesheetEntry[]): TaskDayMergePlan[] {
  const groups = new Map<string, TimesheetEntry[]>();
  for (const entry of entries) {
    if (!mutableTaskEntry(entry)) continue;
    const key = `${entry.employeeId || ''}|${entry.taskId}|${entry.date}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  const plans: TaskDayMergePlan[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const byStart = [...bucket].sort((a, b) => clockToMinutes(a.startTime) - clockToMinutes(b.startTime));
    const earliest = byStart[0];
    const open = bucket.find((entry) => !entry.endTime);
    const latestEnd = [...bucket].sort((a, b) => clockToMinutes(a.endTime) - clockToMinutes(b.endTime)).at(-1);
    const hours = bucket.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
    const keeper = open || earliest;
    plans.push({
      keeper,
      extras: bucket.filter((entry) => entry.id !== keeper.id),
      merged: {
        ...keeper,
        startTime: earliest.startTime || keeper.startTime,
        endTime: open ? undefined : latestEnd?.endTime,
        hours: Number(Math.min(24, hours).toFixed(2)),
        status: open ? 'Draft' : 'Submitted',
      },
    });
  }
  return plans;
}

export function combineResumedTaskEntries(entries: TimesheetEntry[]): TimesheetEntry[] {
  const plans = taskDayMergePlans(entries);
  if (!plans.length) return entries;
  const drop = new Set(plans.flatMap((plan) => [plan.keeper.id, ...plan.extras.map((entry) => entry.id)]));
  return [...plans.map((plan) => plan.merged), ...entries.filter((entry) => !drop.has(entry.id))];
}

export function adoptOpenedTimesheet(
  list: TimesheetEntry[] | undefined,
  sheet: TimesheetEntry | null
): TimesheetEntry[] {
  if (!sheet) return [...(list || [])];
  const stored: TimesheetEntry = { ...sheet, endTime: undefined, status: sheet.status || 'Draft' };
  const kept = (list || []).filter((ts) => {
    if (ts.id === sheet.id) return false;
    const sameSession =
      !!sheet.taskId &&
      ts.taskId === sheet.taskId &&
      ts.date === sheet.date &&
      ts.entryType !== 'schedule' &&
      (ts.status === 'Draft' || ts.status === 'Submitted') &&
      (!sheet.employeeId || !ts.employeeId || ts.employeeId === sheet.employeeId);
    return !sameSession;
  });
  return [stored, ...kept];
}

export function mergeTimesheet(
  list: TimesheetEntry[] | undefined,
  sheet: TimesheetEntry | null,
  keepOpen = false
): TimesheetEntry[] {
  const nextList = [...(list || [])];
  if (!sheet) return nextList;
  const stored = keepOpen ? { ...sheet, endTime: undefined } : sheet;
  const idx = nextList.findIndex(
    (ts) => ts.id === sheet.id || (ts.taskId === sheet.taskId && !ts.endTime && (!sheet.employeeId || ts.employeeId === sheet.employeeId))
  );
  if (idx < 0) return [stored, ...nextList];
  const merged = { ...nextList[idx], ...stored };
  if (keepOpen) delete merged.endTime;
  nextList[idx] = merged;
  return nextList;
}

async function loadOpenTimesheet(
  task: Task,
  timesheets: TimesheetEntry[] | undefined,
  employeeId?: string
): Promise<TimesheetEntry | undefined> {
  const local = findOpenTimesheet(task, timesheets, employeeId);
  if (local || !employeeId) return local;
  const res = await api.projects.getTimesheets({ employeeId });
  if (!res.success || !Array.isArray(res.data)) return undefined;
  return findOpenTimesheet(task, res.data.map(mapApiTimesheet), employeeId);
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
    employeeId,
    workDate: localDateString(now),
    hoursSpent: 0,
    description: `Live work log for ${task.title}`,
    startTime: clockLabel(now),
    billable: task.billable !== false,
    status: 'draft',
    title: task.title,
    category: 'Development',
    entryType: 'task',
  });
  if (!res.success || !res.data?.id) {
    throw new Error(res.error?.message || 'Failed to create timesheet');
  }
  const mapped = mapApiTimesheet(res.data);
  return {
    ...mapped,
    employeeId: mapped.employeeId || employeeId,
    employeeName: mapped.employeeName || employeeName,
    projectName: mapped.projectName || task.projectName || 'General Project',
    taskTitle: mapped.taskTitle || task.title,
    taskId: mapped.taskId || task.id,
    endTime: undefined,
    status: mapped.status || 'Draft',
  };
}

export async function closeTaskTimesheet(
  task: Task,
  timesheets: TimesheetEntry[] | undefined,
  nowMs: number,
  options?: { keepOpen?: boolean; employeeId?: string }
): Promise<{ timeSpentSeconds: number; hours: number; endTime?: string; timesheet: TimesheetEntry | null }> {
  const now = new Date(nowMs);
  const endTime = clockLabel(now);
  const keepOpen = options?.keepOpen === true;
  const elapsed =
    task.isTimerRunning && task.timerStartedAt ? Math.max(0, Math.floor((nowMs - task.timerStartedAt) / 1000)) : 0;
  const timeSpentSeconds = (task.timeSpentSeconds || 0) + elapsed;
  const open = await loadOpenTimesheet(task, timesheets, options?.employeeId);
  const hours = Number((((open?.hours || 0) * 3600 + elapsed) / 3600).toFixed(2));
  const hoursSpent = keepOpen ? hours : Math.max(0.01, hours);
  const workerId = options?.employeeId || open?.employeeId || task.assigneeId;

  if (open && isUuid(open.id)) {
    const res = await api.projects.updateTimesheet(open.id, {
      hoursSpent,
      endTime: keepOpen ? '' : endTime,
      status: keepOpen ? 'draft' : 'submitted',
    });
    const mapped = res.success && res.data ? mapApiTimesheet(res.data) : null;
    const timesheet = mapped
      ? { ...open, ...mapped, hours: hoursSpent, endTime: keepOpen ? undefined : mapped.endTime || endTime, status: keepOpen ? ('Draft' as const) : mapped.status }
      : { ...open, hours: hoursSpent, endTime: keepOpen ? undefined : endTime, status: keepOpen ? ('Draft' as const) : ('Submitted' as const) };
    return { timeSpentSeconds, hours: hoursSpent, endTime: keepOpen ? undefined : endTime, timesheet };
  }

  const res = await api.projects.logTimesheet({
    projectId: task.projectId || '',
    taskId: task.id,
    employeeId: workerId,
    workDate: localDateString(now),
    hoursSpent,
    description: `Work log for ${task.title}`,
    startTime: open?.startTime || (elapsed > 0 ? clockLabel(new Date(nowMs - elapsed * 1000)) : clockLabel(now)),
    endTime: keepOpen ? undefined : endTime,
    billable: task.billable !== false,
    status: keepOpen ? 'draft' : 'submitted',
    title: task.title,
    entryType: 'task',
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message || 'Failed to save timesheet');
  }
  const created = mapApiTimesheet(res.data);
  return {
    timeSpentSeconds,
    hours: hoursSpent,
    endTime: keepOpen ? undefined : endTime,
    timesheet: keepOpen ? { ...created, endTime: undefined, status: 'Draft' } : created,
  };
}

export type TaskSessionUpdate = {
  taskId: string;
  timeSpentSeconds: number;
  timesheet: TimesheetEntry | null;
};

function taskAssignedTo(task: Task, personaId: string, personaName: string): boolean {
  const ids = [...(task.assigneeIds || []), task.assigneeId].map((id) => String(id || '').trim()).filter(Boolean);
  if (personaId && ids.includes(personaId)) return true;
  const needle = personaName.trim().toLowerCase();
  if (!needle) return false;
  const names = [...(task.assigneeNames || []), task.assigneeName]
    .map((name) => String(name || '').trim().toLowerCase())
    .filter(Boolean);
  return names.includes(needle);
}

/**
 * On sign-out, move this employee's In Progress tasks back to To Do.
 * Open timers are saved onto the timesheet first so the logged time is kept.
 */
export async function returnAssignedInProgressTasksToTodo(personaId: string, personaName: string): Promise<void> {
  let employeeId = String(personaId || '').trim();
  let employeeName = String(personaName || '').trim();
  try {
    const me = await api.auth.me();
    const user = me.success ? ((me.data as { user?: Record<string, unknown> })?.user || (me.data as Record<string, unknown>)) : null;
    const resolvedId = String(user?.employeeId || user?.id || '').trim();
    const resolvedName = String(user?.name || '').trim();
    if (resolvedId) employeeId = resolvedId;
    if (resolvedName) employeeName = resolvedName;
  } catch {
    /* use the persona already on the session */
  }
  if (!employeeId && !employeeName) return;

  const [taskRes, sheetRes] = await Promise.all([
    api.projects.getTasks(),
    employeeId
      ? api.projects.getTimesheets({ employeeId }).catch(() => ({ success: false as const, data: [] as unknown[] }))
      : Promise.resolve({ success: false as const, data: [] as unknown[] }),
  ]);
  if (!taskRes.success || !Array.isArray(taskRes.data)) return;

  const tasks = taskRes.data.map(mapApiTask);
  const timesheets =
    sheetRes.success && Array.isArray(sheetRes.data) ? sheetRes.data.map(mapApiTimesheet) : [];
  const mine = tasks.filter(
    (task) =>
      normalizeTaskStatus(task.status) === 'In Progress' &&
      (taskAssignedTo(task, employeeId, employeeName) ||
        (personaId && personaId !== employeeId && taskAssignedTo(task, personaId, personaName)))
  );
  if (!mine.length) return;

  const nowMs = Date.now();
  await Promise.all(
    mine.map(async (task) => {
      const open = findOpenTimesheet(task, timesheets, employeeId) || findOpenTimesheet(task, timesheets);
      const timerRunning = Boolean(task.isTimerRunning && task.timerStartedAt);
      let timeSpentSeconds = task.timeSpentSeconds || 0;
      if (timerRunning && task.timerStartedAt) {
        timeSpentSeconds += Math.max(0, Math.floor((nowMs - task.timerStartedAt) / 1000));
      }
      if (open || timerRunning) {
        try {
          const closed = await closeTaskTimesheet(task, timesheets, nowMs, { employeeId });
          timeSpentSeconds = closed.timeSpentSeconds;
        } catch (err) {
          console.error('Failed to close timesheet before moving task back to To Do', task.id, err);
        }
      }
      const updated = await api.projects.updateTask(task.id, {
        status: 'To Do',
        timerStartedAt: null,
        ...(open || timerRunning ? { timeSpentSeconds } : {}),
      });
      if (!updated.success) {
        throw new Error(updated.error?.message || `Failed to move "${task.title}" back to To Do`);
      }
    })
  );
}

/** Save the current stretch on the open entry when someone clocks out. The task stays In Progress. */
export async function persistClockOutTaskSessions(
  tasks: Task[],
  timesheets: TimesheetEntry[] | undefined,
  personaId: string,
  personaName: string,
  nowMs: number
): Promise<TaskSessionUpdate[]> {
  const mine = (tasks || []).filter((task) => {
    const ids = [...(task.assigneeIds || []), task.assigneeId].filter(Boolean);
    const names = [...(task.assigneeNames || []), task.assigneeName].map((name) => (name || '').toLowerCase());
    const isMine = ids.includes(personaId) || names.includes((personaName || '').toLowerCase());
    return isMine && normalizeTaskStatus(task.status) === 'In Progress' && Boolean(task.isTimerRunning && task.timerStartedAt);
  });

  const saved: TaskSessionUpdate[] = [];
  for (const task of mine) {
    const closed = await closeTaskTimesheet(task, timesheets, nowMs, { keepOpen: true, employeeId: personaId });
    await api.projects.updateTask(task.id, {
      timeSpentSeconds: closed.timeSpentSeconds,
      timerStartedAt: null,
    });
    saved.push({ taskId: task.id, timeSpentSeconds: closed.timeSpentSeconds, timesheet: closed.timesheet });
  }
  return saved;
}

export function applyTaskSessions<T extends Task>(
  tasks: T[],
  timesheets: TimesheetEntry[] | undefined,
  sessions: TaskSessionUpdate[]
): { tasks: T[]; timesheets: TimesheetEntry[] } {
  let nextSheets = [...(timesheets || [])];
  for (const session of sessions) {
    if (session.timesheet) nextSheets = mergeTimesheet(nextSheets, session.timesheet, true);
  }
  const byId = new Map(sessions.map((session) => [session.taskId, session]));
  const nextTasks = tasks.map((task) => {
    const session = byId.get(task.id);
    if (!session) return task;
    return {
      ...task,
      isTimerRunning: false,
      timerStartedAt: undefined,
      timeSpentSeconds: session.timeSpentSeconds,
      actualHours: Number((session.timeSpentSeconds / 3600).toFixed(2)),
      openTimesheetId: session.timesheet?.id || task.openTimesheetId,
    };
  });
  return { tasks: nextTasks, timesheets: nextSheets };
}
