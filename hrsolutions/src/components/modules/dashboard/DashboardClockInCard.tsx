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
  isArrivalLate,
  isRemotePlace,
  orgGraceMinutes,
  sessionsFromRecord,
} from '@/utils/attendancePunches';
import { resolveEmployeeShiftTiming } from '@/utils/employeeShift';
import { ensurePendingWfhRegularization, isWfhRegularization } from '@/utils/wfhRegularization';
import { useWfhRejectionWatch } from '@/hooks/useWfhRejectionWatch';
import type { AttendanceRegularization } from '@/types';

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
  const matchesToday = (a: AttendanceRecord) =>
    a.date === todayStr &&
    (a.employeeId === persona?.id || a.employeeName?.toLowerCase() === persona?.name?.toLowerCase());
  const dashToday = dashboardState.attendance.find(matchesToday);
  const appToday = (state.attendance || []).find(matchesToday);
  const appOpen = hasOpenAttendanceSession(appToday, now);
  const dashOpen = hasOpenAttendanceSession(dashToday, now);
  const todayRecord =
    appToday && dashToday && appOpen !== dashOpen ? appToday : dashToday || appToday;
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

  useWfhRejectionWatch(isCheckedIn, persona?.id, todayStr, () => {
    if (!persona || !todayRecord || !hasOpenAttendanceSession(todayRecord)) return;
    const timeStr = formatClock(new Date());
    const closed = applyPunchToDailyRecord(todayRecord, {
      type: 'check_out',
      time: timeStr,
      date: todayStr,
      employeeId: persona.id,
      employeeName: persona.name,
      avatar: persona.avatar,
      locationName: 'Work from home',
      isWithinGeofence: false,
      device: 'Dashboard',
      status: todayRecord.status,
    });
    applyLocalRecord(closed);
    void api.attendance.recordPunch({
      employeeId: persona.id,
      punchType: 'check_out',
      deviceInfo: 'WFH regularization rejected',
      workFromHome: true,
    });
    updateState((prev) => ({
      ...prev,
      regularizations: (prev.regularizations || []).map((reg: AttendanceRegularization) =>
        reg.employeeId === persona.id &&
        String(reg.date).slice(0, 10) === todayStr &&
        reg.status === 'Pending' &&
        isWfhRegularization(reg)
          ? { ...reg, status: 'Rejected' as const }
          : reg
      ),
    }));
    void persistClockOutTaskSessions(
      state.tasks,
      state.timesheets,
      persona.id,
      persona.name,
      Date.now()
    ).catch(() => {});
    triggerToast({
      title: 'Punched out',
      message: 'Your manager rejected work from home, so this session was closed.',
      type: 'info',
    });
  });

  const submitPunch = async (payload: PunchConfirmPayload) => {
    if (!persona) return;
    setSaving(true);
    try {
      const lat = payload.latitude;
      const lng = payload.longitude;
      const selfiePhoto = payload.selfiePhoto;
      const notes = payload.notes ?? clockOutNotes;
      const punchType = isCheckedIn ? 'check_out' : 'check_in';
      const openPlace = sessionsFromRecord(todayRecord).find((session) => !session.checkOut)?.locationName;
      const asRemote =
        punchType === 'check_out' ? isRemotePlace(openPlace) : payload.asRemote || selectedLocation === 'wfh';
      const timeStr = formatClock(new Date());

      const res = await api.attendance.recordPunch({
        employeeId: persona.id,
        punchType,
        officeId: selectedLocation !== 'wfh' ? selectedOffice?.id : undefined,
        latitude: lat,
        longitude: lng,
        deviceInfo: [
          asRemote ? 'Work From Home' : 'Dashboard · Web',
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

      let wfhRegularization: AttendanceRegularization | null = null;
      let waitingOnManager = false;
      if (asRemote && punchType === 'check_in') {
        const shiftStart =
          attSettings?.workDayStartTime || attPolicies?.workDayStartTime || '09:00 AM';
        const shiftEnd = attSettings?.workDayEndTime || attPolicies?.workDayEndTime || '06:00 PM';
        try {
          const filed = await ensurePendingWfhRegularization({
            employeeId: persona.id,
            employeeName: persona.name,
            avatar: persona.avatar,
            department: persona.department,
            date: todayStr,
            shiftStart,
            shiftEnd,
            remarks:
              selectedLocation === 'wfh'
                ? 'Work from home selected at punch time'
                : 'Requested while outside office geofence',
            existing: state.regularizations || [],
          });
          if (filed.kind === 'created') wfhRegularization = filed.regularization;
          waitingOnManager = filed.kind === 'created' || filed.kind === 'pending';
        } catch (err: any) {
          triggerToast({
            title: 'WFH request was not sent',
            message: err?.message || 'You are punched in. Ask your manager if the request is missing.',
            type: 'error',
          });
        }
      }

      const me = dashboardState.employees.find((employee) => employee.id === persona.id);
      const timing = resolveEmployeeShiftTiming(
        me || { id: persona.id },
        state.customOptions?.shifts,
        state.customOptions?.employeeShiftAssignments,
        {
          date: todayStr,
          enableRosterShifts: attSettings?.enableRosterShifts,
          rosterRotationCycle: attSettings?.rosterRotationCycle,
          rosterMatrix: state.customOptions?.employeeRosterMatrix,
        }
      );
      const assignedShift = state.customOptions?.shifts?.find((shift) => shift.id === timing?.shiftId);
      const shiftStart = assignedShift?.startTime || timing?.startTime || attSettings?.workDayStartTime || attPolicies?.workDayStartTime || '09:00 AM';
      const orgGrace = orgGraceMinutes(attSettings, attPolicies);
      const graceMinutes = assignedShift
        ? assignedShift.gracePeriodMinutes != null
          ? Number(assignedShift.gracePeriodMinutes)
          : orgGrace
        : orgGrace;
      const skipLate =
        Boolean(timing?.isHourlyShift) ||
        timing?.shiftId === 'OFF' ||
        String(timing?.startTime || '').trim().toLowerCase() === 'flexible';
      const firstPunch = punchType === 'check_in' && !todayRecord?.checkIn;
      const placeName = asRemote ? 'Work from home' : selectedLocation || 'Office';
      const places =
        punchType === 'check_in'
          ? [...sessionsFromRecord(todayRecord).map((session) => session.locationName), placeName]
          : sessionsFromRecord(todayRecord).map((session) => session.locationName);
      const everyLoginRemote = places.length > 0 && places.every((place) => isRemotePlace(place));
      const lateArrival = firstPunch && !skipLate && isArrivalLate(new Date(), shiftStart, graceMinutes);
      const punchStatus = lateArrival
        ? 'Late'
        : everyLoginRemote
          ? 'Work From Home'
          : todayRecord?.status === 'Late'
            ? 'Late'
            : 'Present';

      const record = applyPunchToDailyRecord(todayRecord, {
        type: punchType,
        time: timeStr,
        date: todayStr,
        employeeId: persona.id,
        employeeName: persona.name,
        avatar: persona.avatar,
        locationName:
          punchType === 'check_out'
            ? sessionsFromRecord(todayRecord).find((session) => !session.checkOut)?.locationName || placeName
            : placeName,
        latitude: lat ?? 0,
        longitude: lng ?? 0,
        isWithinGeofence: !asRemote,
        ipAddress: todayRecord?.ipAddress || '',
        device: 'Dashboard',
        status: punchStatus,
        selfiePhoto,
      });
      applyLocalRecord(record);
      if (wfhRegularization) {
        updateState((prev) => ({
          ...prev,
          regularizations: [wfhRegularization, ...(prev.regularizations || [])],
        }));
      }
      setModalOpen(false);
      setClockOutNotes('');
      triggerToast({
        title: punchType === 'check_in' ? 'Punched in' : 'Punched out',
        message:
          punchType === 'check_in'
            ? waitingOnManager
              ? `Recorded at ${timeStr}. Waiting on your manager to approve work from home.`
              : `Recorded at ${timeStr}${asRemote ? ' · work from home' : ''}.`
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
        compact
        statusKind={statusKind}
        elapsedSeconds={elapsedSeconds}
        targetSeconds={shiftTargetSeconds(shiftStart, shiftEnd)}
        shiftName={`General shift · ${selectedLocation === 'wfh' ? 'Work from home' : selectedLocation}`}
        shiftHours={`${shiftStart} – ${shiftEnd}`}
        locationSelect={
          <label className="dash-clock-location">
            <span className="dash-kpi-label">Location</span>
            <select
              aria-label="Punch location"
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
