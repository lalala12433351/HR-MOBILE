'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';
import {
  distanceMeters,
  getCurrentPosition,
  isNativePlatform,
  showAppNotification,
  watchPosition,
  type NativeCoords,
  type PositionWatchHandle,
} from '@/lib/native';
import { DEFAULT_OFFICE_RADIUS_METERS } from '@/config/constants';
import {
  aggregatePunchesToDaily,
  applyPunchToDailyRecord,
  hasOpenAttendanceSession,
  isRemoteAttendanceRecord,
  openSessionCheckInDate,
  toLocalDateKey,
} from '@/utils/attendancePunches';
import { persistClockOutTaskSessions } from '@/utils/taskBoard';
import { AttendanceRecord, OfficeLocationRecord } from '@/types';

/** Continuous outside-geofence grace before auto clock-out. */
export const OUTSIDE_OFFICE_GRACE_MS = 15 * 60 * 1000;
/** Backup poll while watchPosition is quiet. */
const POLL_INTERVAL_MS = 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 2 * 60 * 1000;
const PUNCH_REFRESH_MS = 5 * 60 * 1000;

type WatchMemory = {
  sessionKey: string;
  /** First time we observed the employee outside every assigned office. */
  outsideSince: number | null;
};

type Workplace = {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

function storageKey(employeeId: string) {
  return `pixbe.workplaceWatch.${employeeId}`;
}

function readMemory(employeeId: string): WatchMemory | null {
  try {
    const raw = localStorage.getItem(storageKey(employeeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WatchMemory;
    if (!parsed?.sessionKey) return null;
    return {
      sessionKey: parsed.sessionKey,
      outsideSince:
        typeof parsed.outsideSince === 'number' && Number.isFinite(parsed.outsideSince)
          ? parsed.outsideSince
          : null,
    };
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

function hasValidCoords(lat: unknown, lng: unknown): boolean {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude !== 0 &&
    longitude !== 0
  );
}

function workplacesFromState(
  officeRecords: OfficeLocationRecord[] | undefined,
  orgLocation:
    | {
        latitude?: number;
        longitude?: number;
        address?: string;
        name?: string;
        allowedRadiusMeters?: number;
      }
    | undefined,
  policyRadius: number,
  employeeOfficeIds: string[] | undefined
): Workplace[] {
  const records = Array.isArray(officeRecords) ? officeRecords : [];
  const filtered =
    employeeOfficeIds && employeeOfficeIds.length > 0
      ? records.filter((r) => employeeOfficeIds.includes(String(r.id)))
      : records;

  const list: Workplace[] = [];
  const push = (row: {
    id?: string;
    name?: string;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
    geofencingStatus?: string;
  }) => {
    if (!hasValidCoords(row.latitude, row.longitude)) return;
    if (row.geofencingStatus === 'Inactive') return;
    list.push({
      id: row.id,
      name: row.name || 'Office',
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      radiusMeters: Number(row.radiusMeters) || policyRadius || DEFAULT_OFFICE_RADIUS_METERS,
    });
  };

  filtered.forEach(push);
  if (list.length === 0) records.forEach(push);

  if (list.length === 0 && orgLocation && hasValidCoords(orgLocation.latitude, orgLocation.longitude)) {
    list.push({
      name: orgLocation.name || 'Office',
      latitude: Number(orgLocation.latitude),
      longitude: Number(orgLocation.longitude),
      radiusMeters:
        Number(orgLocation.allowedRadiusMeters) || policyRadius || DEFAULT_OFFICE_RADIUS_METERS,
    });
  }

  return list;
}

function isInsideAnyWorkplace(coords: NativeCoords, workplaces: Workplace[]): boolean {
  if (workplaces.length === 0) return true; // no coords → skip enforcement client-side
  const slack = Math.min(50, Math.max(0, coords.accuracy || 0));
  return workplaces.some((office) => {
    const dist = distanceMeters(coords.latitude, coords.longitude, office.latitude, office.longitude);
    return dist <= office.radiusMeters + slack;
  });
}

/**
 * While punched in at a workplace, continuously track GPS on mobile.
 * If the employee stays outside every assigned office geofence for 15 minutes,
 * auto clock-out and fire an OS app notification.
 */
export function useWorkplaceLocationWatch() {
  const { state, updateState, currentPersona, triggerToast } = useApp();
  const stateRef = useRef(state);
  const checkingRef = useRef(false);
  const retryAtRef = useRef(0);
  const lastPunchFetchRef = useRef(0);
  const lastCoordsRef = useRef<NativeCoords | null>(null);
  const lastCoordsAtRef = useRef(0);
  const memoryRef = useRef<WatchMemory | null>(null);
  stateRef.current = state;

  useEffect(() => {
    if (!state.isAuthenticated || !currentPersona?.id) return;
    if (currentPersona.role === 'student' || currentPersona.role === 'super_admin') return;
    if (typeof window === 'undefined') return;

    const employeeId = currentPersona.id;
    const employeeName = currentPersona.name;
    const avatar = currentPersona.avatar;
    let cancelled = false;
    let watchHandle: PositionWatchHandle | null = null;

    const employee = (stateRef.current.employees || []).find(
      (e) => e.id === employeeId || e.email?.toLowerCase() === currentPersona.email?.toLowerCase()
    );
    const employeeOfficeIds =
      employee?.officeIds ||
      employee?.offices?.map((o) => o.id).filter(Boolean) ||
      (employee?.officeId ? [employee.officeId] : undefined);

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

    const resolveWorkplaces = (): Workplace[] => {
      const policyRadius =
        stateRef.current.customOptions?.attendanceSettings?.geofenceRadiusMeters ||
        stateRef.current.customOptions?.attendancePolicies?.geofenceRadiusMeters ||
        DEFAULT_OFFICE_RADIUS_METERS;
      return workplacesFromState(
        stateRef.current.customOptions?.officeRecords,
        stateRef.current.organization?.officeLocation,
        policyRadius,
        employeeOfficeIds as string[] | undefined
      );
    };

    const notifyClockOut = async (message: string, officeName?: string) => {
      const body =
        message ||
        `You were outside ${officeName || 'the office'} for 15 minutes, so you have been clocked out. Punch in again when you return.`;
      triggerToast({
        type: 'attendance',
        title: 'Clocked out',
        message: body,
        priority: 'high',
        linkModule: 'attendance',
      });
      await showAppNotification(
        {
          id: `workplace-logout:${employeeId}:${toLocalDateKey()}:${Date.now()}`,
          title: 'You have been clocked out',
          body,
          linkUrl: '/attendance',
        },
        { force: true }
      );
    };

    const performServerClockOut = async (
      record: AttendanceRecord,
      position: NativeCoords,
      sessionKey: string
    ) => {
      const res = await api.attendance.verifyWorkplaceLocation({
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      });

      if (!res.success) {
        retryAtRef.current = Date.now() + RETRY_AFTER_FAILURE_MS;
        return false;
      }

      const data = res.data;
      if (data?.skipped) {
        memoryRef.current = { sessionKey, outsideSince: null };
        writeMemory(employeeId, memoryRef.current);
        return false;
      }

      if (!data?.clockedOut) {
        // Server still considers them inside (or already closed).
        memoryRef.current = { sessionKey, outsideSince: null };
        writeMemory(employeeId, memoryRef.current);
        return false;
      }

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
      memoryRef.current = null;
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
      await notifyClockOut(
        data.message ||
          `You left ${data.officeName || 'the office'} for over 15 minutes, so your shift was closed.`,
        data.officeName
      );
      return true;
    };

    const evaluateCoords = async (coords: NativeCoords, forcePunchFetch = false) => {
      if (cancelled || checkingRef.current) return;
      if (Date.now() < retryAtRef.current) return;

      // Web: skip while tab hidden. Native: keep evaluating (background watch / poll).
      if (!isNativePlatform() && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      checkingRef.current = true;
      try {
        const record = await resolveRecord(forcePunchFetch);
        if (!record || !hasOpenAttendanceSession(record) || isRemoteAttendanceRecord(record)) {
          clearMemory(employeeId);
          memoryRef.current = null;
          return;
        }

        const sessionStarted = openSessionCheckInDate(record);
        const sessionKey = `${toLocalDateKey()}:${sessionStarted?.toISOString() || record?.checkIn || 'open'}`;
        let memory = memoryRef.current;
        if (!memory || memory.sessionKey !== sessionKey) {
          const stored = readMemory(employeeId);
          memory =
            stored?.sessionKey === sessionKey
              ? stored
              : { sessionKey, outsideSince: null };
          memoryRef.current = memory;
        }

        const workplaces = resolveWorkplaces();
        if (workplaces.length === 0) {
          // No office GPS configured — let the server decide only on rare polls.
          return;
        }

        const inside = isInsideAnyWorkplace(coords, workplaces);
        if (inside) {
          if (memory.outsideSince != null) {
            memory = { sessionKey, outsideSince: null };
            memoryRef.current = memory;
            writeMemory(employeeId, memory);
          }
          return;
        }

        const now = Date.now();
        if (memory.outsideSince == null) {
          memory = { sessionKey, outsideSince: now };
          memoryRef.current = memory;
          writeMemory(employeeId, memory);
          return;
        }

        if (now - memory.outsideSince < OUTSIDE_OFFICE_GRACE_MS) {
          return;
        }

        await performServerClockOut(record, coords, sessionKey);
      } catch {
        retryAtRef.current = Date.now() + RETRY_AFTER_FAILURE_MS;
      } finally {
        checkingRef.current = false;
      }
    };

    const pollOnce = async (forcePunchFetch = false) => {
      try {
        const freshEnough =
          lastCoordsRef.current && Date.now() - lastCoordsAtRef.current < 90_000
            ? lastCoordsRef.current
            : null;
        const coords =
          freshEnough ||
          (await getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 60_000,
          }));
        if (!freshEnough) {
          lastCoordsRef.current = coords;
          lastCoordsAtRef.current = Date.now();
        }
        await evaluateCoords(coords, forcePunchFetch);
      } catch {
        retryAtRef.current = Date.now() + RETRY_AFTER_FAILURE_MS;
      }
    };

    void (async () => {
      watchHandle = await watchPosition(
        (coords) => {
          lastCoordsRef.current = coords;
          lastCoordsAtRef.current = Date.now();
          void evaluateCoords(coords, false);
        },
        () => {
          // Fall back to interval polling on watch errors.
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 30_000,
          minIntervalMs: 20_000,
        }
      );
      void pollOnce(true);
    })();

    const tickId = window.setInterval(() => {
      void pollOnce(false);
    }, POLL_INTERVAL_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible') void pollOnce(true);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);

    return () => {
      cancelled = true;
      window.clearInterval(tickId);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      watchHandle?.clear();
    };
  }, [
    state.isAuthenticated,
    currentPersona?.id,
    currentPersona?.name,
    currentPersona?.avatar,
    currentPersona?.email,
    currentPersona?.role,
    triggerToast,
    updateState,
  ]);
}
