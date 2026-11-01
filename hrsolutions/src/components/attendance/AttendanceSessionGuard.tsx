'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';
import { persistClockOutTaskSessions } from '@/utils/taskBoard';
import { applyRemoteCheckout } from '@/utils/attendancePunches';
import { publishAttendanceCheckout } from '@/utils/attendanceSessionEvents';
import {
  ensureAlwaysLocationPermission,
  getCurrentPosition,
  isNativePlatform,
  openAlwaysLocationSettings,
  requestAppNotificationPermission,
  startBackgroundAttendanceTracking,
  stopBackgroundAttendanceTracking,
  watchPosition,
  type BackgroundPresenceResult,
  type PositionWatchHandle,
} from '@/lib/native';

const GEOFENCE_WARN_NOTIF_ID = 915001;

type MissedCheckout = {
  workDate: string;
  checkInLabel: string;
  lastSeenLabel: string | null;
};

type GeofenceSignOut = {
  workDate: string;
  checkOutLabel: string;
  at: string;
};

const DISMISS_KEY = 'missed-punch-prompt';

function dismissKey(employeeId: string) {
  return `${DISMISS_KEY}:${employeeId}`;
}

function signOutKey(at: string) {
  return `geofence-signout:${at}`;
}

function formatWorkDate(workDate: string) {
  const parsed = new Date(`${workDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return workDate;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function AttendanceSessionGuard() {
  const { state, updateState, triggerToast } = useApp();
  const persona = state.currentPersona;
  const [missed, setMissed] = useState<MissedCheckout | null>(null);
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const outsideToast = useRef('');
  const alwaysPrompt = useRef(false);
  const tracking = useRef(false);
  const watchHandle = useRef<PositionWatchHandle | null>(null);
  const pingTimer = useRef<number | null>(null);
  const lastPing = useRef(0);
  const tasksRef = useRef(state.tasks);
  const sheetsRef = useRef(state.timesheets);
  tasksRef.current = state.tasks;
  sheetsRef.current = state.timesheets;

  useEffect(() => {
    if (!persona?.id || persona.role === 'student' || !api.getToken()) return;
    const employeeId = persona.id;
    let stopped = false;

    const applyCheckout = (workDate: string, checkOutLabel: string) => {
      const detail = { employeeId, workDate, checkOutLabel };
      updateState((prev) => ({
        ...prev,
        attendance: prev.attendance ? applyRemoteCheckout(prev.attendance, detail) : prev.attendance,
      }));
      publishAttendanceCheckout(detail);
    };

    const noteSignOut = (signOut: GeofenceSignOut) => {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem(signOutKey(signOut.at))) return;
      window.sessionStorage.setItem(signOutKey(signOut.at), '1');
      applyCheckout(signOut.workDate, signOut.checkOutLabel);
      // Server notify + inbox bridge / FCM own the OS tray — in-app toast only here.
      triggerToast({
        title: 'Punched out',
        message: 'You stayed outside the office location, so this shift was punched out.',
        type: 'info',
        suppressOsNotification: true,
      });
      void persistClockOutTaskSessions(
        tasksRef.current,
        sheetsRef.current,
        employeeId,
        persona.name || '',
        Date.now()
      ).catch(() => {});
    };

    const applyPresence = (data: BackgroundPresenceResult) => {
      if (stopped || !data) return;
      if (data.status === 'outside' && data.outsideSince && outsideToast.current !== data.outsideSince) {
        outsideToast.current = data.outsideSince;
        const warning =
          'You left the office geofence. You will be clocked out within 15 minutes.';
        // Server notify + inbox bridge / FCM own the OS tray — in-app toast only here.
        triggerToast({
          title: 'Outside the office',
          message: warning,
          type: 'info',
          suppressOsNotification: true,
        });
        if (isNativePlatform() && data.signsOutAt) {
          const at = new Date(data.signsOutAt);
          if (!Number.isNaN(at.getTime()) && at.getTime() > Date.now() + 5000) {
            void LocalNotifications.schedule({
              notifications: [
                {
                  id: GEOFENCE_WARN_NOTIF_ID,
                  title: 'Clock-out soon',
                  body: 'You are still outside the office. This shift will punch out now.',
                  schedule: { at },
                  extra: { linkUrl: '/attendance' },
                },
              ],
            }).catch(() => {});
          }
        }
      }
      if (data.status === 'inside') {
        outsideToast.current = '';
        if (isNativePlatform()) {
          void LocalNotifications.cancel({ notifications: [{ id: GEOFENCE_WARN_NOTIF_ID }] }).catch(() => {});
        }
      }
      if (data.status === 'signed_out' && data.workDate && data.checkOutLabel) {
        if (isNativePlatform()) {
          void LocalNotifications.cancel({ notifications: [{ id: GEOFENCE_WARN_NOTIF_ID }] }).catch(() => {});
        }
        const at = data.outsideSince || new Date().toISOString();
        noteSignOut({ workDate: data.workDate, checkOutLabel: data.checkOutLabel, at });
        stopWatch();
      }
    };

    const sendFix = (latitude: number, longitude: number, accuracy?: number | null) => {
      const now = Date.now();
      if (now - lastPing.current < 15000) return;
      lastPing.current = now;
      void api.attendance
        .postPresence({ latitude, longitude, accuracy: accuracy ?? null })
        .then((res) => {
          if (stopped || !res.success || !res.data) return;
          applyPresence(res.data);
        })
        .catch(() => {});
    };

    const stopWatch = () => {
      tracking.current = false;
      watchHandle.current?.clear();
      watchHandle.current = null;
      if (pingTimer.current != null) {
        window.clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
      void stopBackgroundAttendanceTracking();
    };

    const promptAlwaysRequired = () => {
      if (alwaysPrompt.current || stopped) return;
      alwaysPrompt.current = true;
      triggerToast({
        title: 'Allow all the time',
        message:
          'Attendance tracking needs location set to “Allow all the time”. Open settings, change it, then return to the app.',
        type: 'info',
      });
      void openAlwaysLocationSettings().catch(() => {});
    };

    const startWatch = () => {
      if (tracking.current) return;
      tracking.current = true;
      void requestAppNotificationPermission();

      // Native: only track when OS location is “Allow all the time”.
      if (isNativePlatform()) {
        void (async () => {
          const always = await ensureAlwaysLocationPermission();
          if (!tracking.current || stopped) return;
          if (!always) {
            tracking.current = false;
            promptAlwaysRequired();
            return;
          }
          alwaysPrompt.current = false;
          try {
            await startBackgroundAttendanceTracking({
              onPresence: (data) => {
                if (!tracking.current || stopped) return;
                applyPresence(data);
              },
              onError: () => {
                if (!tracking.current || stopped) return;
                void stopBackgroundAttendanceTracking();
                tracking.current = false;
                promptAlwaysRequired();
              },
            });
          } catch {
            tracking.current = false;
            promptAlwaysRequired();
          }
        })();
        return;
      }

      const onCoords = (coords: { latitude: number; longitude: number; accuracy?: number }) => {
        sendFix(coords.latitude, coords.longitude, coords.accuracy);
      };
      void watchPosition(onCoords, () => {}, {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000,
        minIntervalMs: 15000,
      }).then((handle) => {
        if (!tracking.current) {
          handle.clear();
          return;
        }
        watchHandle.current = handle;
      });
      pingTimer.current = window.setInterval(() => {
        void getCurrentPosition({
          enableHighAccuracy: true,
          maximumAge: 15000,
          timeout: 20000,
        })
          .then(onCoords)
          .catch(() => {});
      }, 30000);
    };

    const refresh = async () => {
      const res = await api.attendance.getSession();
      if (stopped || !res.success || !res.data) return;
      const dismissed = window.sessionStorage.getItem(dismissKey(employeeId)) === '1';
      const nextMissed = res.data.missedCheckouts?.[0] || null;
      setMissed(dismissed ? null : nextMissed);
      if (!nextMissed) window.sessionStorage.removeItem(dismissKey(employeeId));
      if (res.data.recentGeofenceSignOut) noteSignOut(res.data.recentGeofenceSignOut);
      if (res.data.openOfficePunch) startWatch();
      else stopWatch();
    };

    void refresh().catch(() => {});
    const poll = window.setInterval(() => {
      void refresh().catch(() => {});
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      stopWatch();
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Session tracking follows the signed-in person. Task lists are read when a sign-out arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona?.id, persona?.role]);

  if (!missed || !persona?.id) return null;

  const submit = async () => {
    if (!time || saving) return;
    setSaving(true);
    setError('');
    const res = await api.attendance.submitMissedCheckout({ workDate: missed.workDate, time });
    setSaving(false);
    if (!res.success || !res.data) {
      setError(res.error?.message || 'That time could not be saved.');
      return;
    }
    publishAttendanceCheckout({
      employeeId: res.data.employeeId || persona.id,
      workDate: res.data.workDate,
      checkOutLabel: res.data.checkOutLabel,
    });
    updateState((prev) => ({
      ...prev,
      attendance: prev.attendance
        ? applyRemoteCheckout(prev.attendance, {
            employeeId: res.data?.employeeId || persona.id,
            workDate: res.data?.workDate || missed.workDate,
            checkOutLabel: res.data?.checkOutLabel || '',
          })
        : prev.attendance,
    }));
    setTime('');
    const again = await api.attendance.getSession();
    const next = again.success ? again.data?.missedCheckouts?.[0] || null : null;
    setMissed(next);
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="missed-punch-title"
        className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 shadow-xl"
      >
        <h2 id="missed-punch-title" className="text-base font-semibold text-[var(--text-primary)]">
          What time did you leave?
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          You punched in at {missed.checkInLabel} on {formatWorkDate(missed.workDate)} and did not punch out. The
          punch-out is blank until you enter it.
        </p>
        {missed.lastSeenLabel ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">Last seen at the office around {missed.lastSeenLabel}.</p>
        ) : null}
        <label className="mt-4 block text-xs font-semibold text-[var(--text-secondary)]" htmlFor="missed-punch-time">
          Punch-out time
        </label>
        <input
          id="missed-punch-time"
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)]"
            onClick={() => {
              window.sessionStorage.setItem(dismissKey(persona.id), '1');
              setMissed(null);
            }}
          >
            Not now
          </button>
          <button
            type="button"
            disabled={!time || saving}
            className="rounded-lg bg-[var(--studio-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void submit()}
          >
            {saving ? 'Saving…' : 'Save punch-out'}
          </button>
        </div>
      </div>
    </div>
  );
}
