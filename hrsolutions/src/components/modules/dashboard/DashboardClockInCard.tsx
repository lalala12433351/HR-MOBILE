'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { api } from '@/services/apiClient';
import { AttendanceRecord } from '@/types';
import { persistClockOutTaskSessions } from '@/utils/taskBoard';
import { isInstitutionMode } from '@/utils/organizationMode';
import { WorkdayClockCard, WorkdayStatusKind } from '@/components/attendance/WorkdayClockCard';
import { WorkdayPunchDialogs, PunchConfirmPayload } from '@/components/attendance/WorkdayPunchDialogs';
import {
  applyPunchToDailyRecord,
  attendanceElapsedSeconds,
  hasOpenAttendanceSession,
} from '@/utils/attendancePunches';

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function parseClockToMinutes(value?: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function shiftTargetSeconds(start?: string | null, end?: string | null) {
  const from = parseClockToMinutes(start);
  const to = parseClockToMinutes(end);
  if (from == null || to == null) return 8 * 3600;
  const span = to <= from ? to + 24 * 60 - from : to - from;
  return Math.max(60, span * 60);
}

function hasValidCoords(loc?: { latitude?: number | null; longitude?: number | null } | null) {
  const lat = Number(loc?.latitude);
  const lng = Number(loc?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

export const DashboardClockInCard: React.FC = () => {
  const { state, updateState, triggerToast } = useApp();
  const dashboardState = useDashboardContext();
  const persona = state.currentPersona;
  const isInstitution = isInstitutionMode(state.organization, persona);
  const attSettings = state.customOptions?.attendanceSettings;
  const attPolicies = state.customOptions?.attendancePolicies;

  const [now, setNow] = useState(() => new Date());
  const [selectedLocation, setSelectedLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [clockOutNotes, setClockOutNotes] = useState('');

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const officeRecords = state.customOptions?.officeRecords || [];
  const offices = useMemo(() => {
    const names = officeRecords.map((o) => o.name).filter(Boolean);
    const extras = (state.customOptions?.offices || []).filter(
      (o) => o && o !== 'Corporate Headquarters' && o !== 'Office Location'
    );
    const unique = Array.from(new Set([...names, ...extras]));
    if (unique.length > 0) return unique;
    const addr = state.organization?.officeLocation?.address?.trim() || '';
    return addr && hasValidCoords(state.organization?.officeLocation) ? [addr] : [];
  }, [officeRecords, state.customOptions?.offices, state.organization?.officeLocation]);

  useEffect(() => {
    if (!selectedLocation && offices[0]) setSelectedLocation(offices[0]);
  }, [offices, selectedLocation]);

  const todayStr = localToday();
  const attendancePool = dashboardState.attendance?.length ? dashboardState.attendance : state.attendance || [];
  const todayRecord = attendancePool.find(
    (a) =>
      a.date === todayStr &&
      (a.employeeId === persona?.id || a.employeeName?.toLowerCase() === persona?.name?.toLowerCase())
  );
  const hasPunchedToday = Boolean(todayRecord?.checkIn);
  const isCheckedIn = hasOpenAttendanceSession(todayRecord);
  const isCheckedOut = hasPunchedToday && !isCheckedIn;

  const elapsedSeconds = useMemo(
    () => attendanceElapsedSeconds(todayRecord, now),
    [todayRecord, now]
  );

  const selectedOffice = officeRecords.find(
    (o) => o.name?.trim().toLowerCase() === selectedLocation.trim().toLowerCase()
  );
  const requireGps = attSettings?.requireLocationGPS !== false && attSettings?.geofenceEnabled !== false;
  const geofenceOptional =
    selectedLocation === 'wfh' || attSettings?.geofenceEnabled === false;
  const outOfRadiusAction: 'Block' | 'Allow' | 'Warn' =
    attSettings?.outOfRadiusAction === 'Allow' || attSettings?.outOfRadiusAction === 'Block'
      ? attSettings.outOfRadiusAction
      : 'Warn';
  const radius =
    selectedOffice?.radiusMeters ||
    attSettings?.geofenceRadiusMeters ||
    attPolicies?.geofenceRadiusMeters ||
    150;
  const requireSelfie = isCheckedIn
    ? attSettings?.requireSelfieCheckOut === true
    : attSettings?.requireSelfieCheckIn === true;

  const applyLocalRecord = (record: AttendanceRecord) => {
    updateState((prev) => ({
      ...prev,
      attendance: [
        record,
        ...prev.attendance.filter((a) => !(a.employeeId === record.employeeId && a.date === record.date)),
      ],
    }));
    dashboardState.setAttendance((prev) => [
      record,
      ...prev.filter((a) => !(a.employeeId === record.employeeId && a.date === record.date)),
    ]);
  };

  const submitPunch = async (payload: PunchConfirmPayload) => {
    if (!persona) return;
    setSaving(true);
    try {
      const lat = payload.latitude;
      const lng = payload.longitude;
      const asRemote = payload.asRemote || selectedLocation === 'wfh';
      const selfiePhoto = payload.selfiePhoto;
      const notes = payload.notes ?? clockOutNotes;

      const punchType = isCheckedIn ? 'check_out' : 'check_in';
      const timeStr = formatClock(new Date());
      const res = await api.attendance.recordPunch({
        employeeId: persona.id,
        punchType,
        officeId: selectedLocation !== 'wfh' ? selectedOffice?.id : undefined,
        latitude: lat,
        longitude: lng,
        deviceInfo: [
          asRemote ? 'Dashboard · Remote' : 'Dashboard · Web',
          punchType === 'check_out' && notes.trim() ? notes.trim() : '',
        ]
          .filter(Boolean)
          .join(' · '),
        selfiePhoto: selfiePhoto || undefined,
        workFromHome: asRemote,
      });

      if (!res.success) {
        triggerToast({
          title: punchType === 'check_in' ? 'Could not punch in' : 'Could not punch out',
          message: res.error?.message || 'The attendance service did not record this punch.',
          type: 'error',
        });
        setSaving(false);
        return;
      }

      if (punchType === 'check_out') {
        try {
          await persistClockOutTaskSessions(
            state.tasks,
            state.timesheets,
            persona.id,
            persona.name,
            Date.now()
          );
        } catch {
          // Punch still stands if timesheets fail to close.
        }
      }

      const record = applyPunchToDailyRecord(todayRecord, {
        type: punchType,
        time: timeStr,
        date: todayStr,
        employeeId: persona.id,
        employeeName: persona.name,
        avatar: persona.avatar,
        locationName: asRemote ? 'Work from home' : selectedLocation || 'Office',
        latitude: lat ?? 0,
        longitude: lng ?? 0,
        isWithinGeofence: !asRemote,
        ipAddress: todayRecord?.ipAddress || '',
        device: 'Dashboard',
        status: asRemote ? 'Work From Home' : todayRecord?.status || 'Present',
        selfiePhoto,
      });
      applyLocalRecord(record);
      setModalOpen(false);
      setClockOutNotes('');
      triggerToast({
        title: punchType === 'check_in' ? 'Punched in' : 'Punched out',
        message:
          punchType === 'check_in'
            ? `Recorded at ${timeStr}${asRemote ? ' · remote' : ''}.`
            : `Shift closed at ${timeStr}.`,
        type: 'success',
      });
    } catch (err: any) {
      triggerToast({
        title: 'Punch failed',
        message: err?.message || 'Something went wrong recording attendance.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePunch = () => {
    if (offices.length === 0 && selectedLocation !== 'wfh') {
      triggerToast({
        title: 'Office not set up',
        message: 'Ask HR to add a workplace before punching in.',
        type: 'error',
      });
      return;
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setClockOutNotes('');
  };

  const shiftStart =
    attSettings?.workDayStartTime || attPolicies?.workDayStartTime || (isInstitution ? '08:30 AM' : '09:00 AM');
  const shiftEnd =
    attSettings?.workDayEndTime || attPolicies?.workDayEndTime || (isInstitution ? '03:30 PM' : '06:00 PM');
  const statusKind: WorkdayStatusKind = !hasPunchedToday
    ? 'idle'
    : isCheckedIn
      ? 'live'
      : 'done';

  return (
    <>
      <WorkdayClockCard
        statusKind={statusKind}
        elapsedSeconds={elapsedSeconds}
        targetSeconds={shiftTargetSeconds(shiftStart, shiftEnd)}
        shiftName="General shift"
        shiftHours={`${shiftStart} – ${shiftEnd}`}
        locationSelect={
          <label className="dash-clock-location">
            <span className="dash-kpi-label">Location</span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              disabled={isCheckedIn}
            >
              {offices.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {!isInstitution && <option value="wfh">Work from home</option>}
            </select>
          </label>
        }
        primaryAction={
          <button
            type="button"
            className="dash-clock-punch"
            onClick={handlePunch}
            disabled={saving || (offices.length === 0 && selectedLocation !== 'wfh')}
          >
            {saving
              ? 'Recording…'
              : isCheckedIn
                ? 'Clock out'
                : isCheckedOut
                  ? 'Punch in again'
                  : 'Punch in'}
          </button>
        }
      />

      <WorkdayPunchDialogs
        open={modalOpen}
        now={now}
        isCheckedIn={isCheckedIn}
        selectedLocation={selectedLocation}
        locationLabel={selectedLocation === 'wfh' ? 'Work from home' : selectedLocation || 'Office'}
        requireSelfie={requireSelfie}
        requireGps={requireGps}
        geofenceOptional={geofenceOptional}
        outOfRadiusAction={outOfRadiusAction}
        officeLat={Number(selectedOffice?.latitude ?? state.organization?.officeLocation?.latitude ?? 0)}
        officeLng={Number(selectedOffice?.longitude ?? state.organization?.officeLocation?.longitude ?? 0)}
        radiusMeters={radius}
        isInstitution={isInstitution}
        saving={saving}
        clockOutNotes={clockOutNotes}
        onClockOutNotesChange={setClockOutNotes}
        onClose={closeModal}
        onConfirm={(payload) => void submitPunch(payload)}
      />
    </>
  );
};
