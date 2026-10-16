'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';
import { getCurrentPosition } from '@/lib/native';
import {
  aggregatePunchesToDaily,
  applyPunchToDailyRecord,
  hasOpenAttendanceSession,
  isRemoteAttendanceRecord,
  openSessionCheckInDate,
  toLocalDateKey,
} from '@/utils/attendancePunches';
import { persistClockOutTaskSessions } from '@/utils/taskBoard';
import { AttendanceRecord } from '@/types';

export const WORKPLACE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const PUNCH_REFRESH_MS = 5 * 60 * 1000;
const TICK_MS = 30 * 1000;

type WatchMemory = {
  lastOkAt: number;
  sessionKey: string;
};

function storageKey(employeeId: string) {
  return `pixbe.workplaceCheck.${employeeId}`;
}

function readMemory(employeeId: string): WatchMemory | null {
  try {
    const raw = localStorage.getItem(storageKey(employeeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WatchMemory;
    if (!parsed?.sessionKey || !Number.isFinite(parsed.lastOkAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeMemory(employeeId: string, memory: WatchMemory) {
  try {
    localStorage.setItem(storageKey(employeeId), JSON.stringify(memory));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function clearMemory(employeeId: string) {
  try {
    localStorage.removeItem(storageKey(employeeId));
  } catch {
    // ignore
  }
}

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function recordForEmployee(
  rows: AttendanceRecord[] | undefined,
  employeeId: string,
  employeeName: string
): AttendanceRecord | undefined {
  const today = toLocalDateKey();
  return (rows || []).find(
    (row) =>
      row.date === today &&
      (row.employeeId === employeeId ||
        row.employeeName?.toLowerCase() === String(employeeName || '').toLowerCase())
  );
}

/**
 * While an employee is punched in at a workplace, fetch GPS about every hour.
 * If they are outside the office geofence, clock them out until they punch in again.
 */
export function useWorkplaceLocationWatch() {
  const { state, updateState, currentPersona, triggerToast } = useApp();
  const stateRef = useRef(state);
  const checkingRef = useRef(false);
  const retryAtRef = useRef(0);
  const lastPunchFetchRef = useRef(0);
  stateRef.current = state;

  useEffect(() => {
    if (!state.isAuthenticated || !currentPersona?.id) return;
    if (currentPersona.role === 'student' || currentPersona.role === 'super_admin') return;
    if (typeof window === 'undefined') return;

    const employeeId = currentPersona.id;
    const employeeName = currentPersona.name;
    const avatar = currentPersona.avatar;
    let cancelled = false;

    const applyLocalRecord = (record: AttendanceRecord) => {
      updateState((prev) => ({
        ...prev,
        attendance: [
          record,
          ...prev.attendance.filter((row) => !(row.employeeId === record.employeeId && row.date === record.date)),
        ],
      }));
    };

    const fetchTodayRecord = async (): Promise<AttendanceRecord | undefined> => {
      const res = await api.attendance.getPunches({ employeeId, date: toLocalDateKey() });
      if (!res.success || !Array.isArray(res.data)) return undefined;
      const daily = aggregatePunchesToDaily(res.data as any[], {
        employeeLookup: { [employeeId]: { name: employeeName, avatar } },
      });
      return recordForEmployee(daily, employeeId, employeeName) || daily[0];
    };

    const resolveRecord = async (forceFetch: boolean): Promise<AttendanceRecord | undefined> => {
      const local = recordForEmployee(stateRef.current.attendance, employeeId, employeeName);
      const due = Date.now() - lastPunchFetchRef.current >= PUNCH_REFRESH_MS;
      if (!forceFetch && !due && hasOpenAttendanceSession(local)) return local;
      if (!forceFetch && !due && lastPunchFetchRef.current > 0) return local;
      lastPunchFetchRef.current = Date.now();
      try {
        const remote = await fetchTodayRecord();
        if (remote && !hasOpenAttendanceSession(local) && hasOpenAttendanceSession(remote)) {
          applyLocalRecord(remote);
        }
        return remote || local;
      } catch {
        return local;
      }
    };

    const maybeCheck = async (forcePunchFetch = false) => {
      if (cancelled || checkingRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const record = await resolveRecord(forcePunchFetch);
      if (!record || !hasOpenAttendanceSession(record) || isRemoteAttendanceRecord(record)) {
        clearMemory(employeeId);
        return;
      }

      const sessionStarted = openSessionCheckInDate(record);
      const sessionKey = `${toLocalDateKey()}:${sessionStarted?.toISOString() || record?.checkIn || 'open'}`;
      const memory = readMemory(employeeId);
      const lastOkAt =
        memory?.sessionKey === sessionKey && memory.lastOkAt > 0
          ? memory.lastOkAt
          : sessionStarted?.getTime() || Date.now();
      const now = Date.now();
      if (now < retryAtRef.current) return;
      if (now - lastOkAt < WORKPLACE_CHECK_INTERVAL_MS) return;

      checkingRef.current = true;
      try {
        const position = await getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60_000,
        });
        if (cancelled) return;
        const res = await api.attendance.verifyWorkplaceLocation({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
        });

        if (!res.success) {
          retryAtRef.current = Date.now() + RETRY_AFTER_FAILURE_MS;
          return;
        }

        const data = res.data;
        if (data?.skipped) {
          writeMemory(employeeId, { lastOkAt: Date.now(), sessionKey });
          return;
        }

        if (data?.clockedOut) {
          const stamped = new Date();
          const next = applyPunchToDailyRecord(record, {
            type: 'check_out',
            time: formatClock(stamped),
            date: toLocalDateKey(stamped),
            employeeId,
            employeeName,
            avatar,
            locationName: record?.locationName || data.officeName || 'Office',
            latitude: position.latitude,
            longitude: position.longitude,
            isWithinGeofence: false,
            device: 'Auto Clock-Out · Left workplace',
            status: record?.status || 'Present',
          });
          applyLocalRecord(next);
          clearMemory(employeeId);
          try {
            await persistClockOutTaskSessions(
              stateRef.current.tasks,
              stateRef.current.timesheets,
              employeeId,
              employeeName,
              stamped.getTime()
            );
          } catch {
            // Attendance clock-out still stands.
          }
          triggerToast({
            type: 'attendance',
            title: 'Clocked out',
            message:
              data.message ||
              'You left the workplace, so your shift was closed. Punch in again when you return.',
            priority: 'high',
            linkModule: 'attendance',
          });
          return;
        }

        if (data?.clockedIn) {
          writeMemory(employeeId, { lastOkAt: Date.now(), sessionKey });
        } else {
          clearMemory(employeeId);
        }
      } catch {
        retryAtRef.current = Date.now() + RETRY_AFTER_FAILURE_MS;
      } finally {
        checkingRef.current = false;
      }
    };

    const tickId = window.setInterval(() => {
      void maybeCheck(false);
    }, TICK_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void maybeCheck(true);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    void maybeCheck(true);

    return () => {
      cancelled = true;
      window.clearInterval(tickId);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [
    state.isAuthenticated,
    currentPersona?.id,
    currentPersona?.name,
    currentPersona?.avatar,
    currentPersona?.role,
    triggerToast,
    updateState,
  ]);
}
