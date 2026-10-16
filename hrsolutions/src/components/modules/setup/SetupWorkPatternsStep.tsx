'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WorkShift } from '@/types';

export type EmploymentTypeCategory = { id: string; name: string; hasBenefits: boolean; isPermanent: boolean };

export const DEFAULT_EMPLOYMENT_TYPES: EmploymentTypeCategory[] = [
  { id: 'et_1', name: 'Full-time', hasBenefits: true, isPermanent: true },
  { id: 'et_2', name: 'Contract', hasBenefits: false, isPermanent: false },
  { id: 'et_3', name: 'Part-time', hasBenefits: true, isPermanent: false },
  { id: 'et_4', name: 'Intern', hasBenefits: false, isPermanent: false },
];

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const DEFAULT_SHIFT: WorkShift = {
  id: 'sh-1',
  name: 'General Day Shift',
  startTime: '09:00 AM',
  endTime: '06:00 PM',
  gracePeriodMinutes: 15,
  workingDays: WEEKDAYS.slice(0, 5),
  rosterCode: 'GEN',
};

export function toTimeInput(value: string): string {
  const raw = String(value || '').trim();
  const match24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return `${String(Number(match24[1])).padStart(2, '0')}:${match24[2]}`;
  const match12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match12) return '09:00';
  let hour = Number(match12[1]) % 12;
  if (match12[3].toUpperCase() === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${match12[2]}`;
}

export function fromTimeInput(value: string): string {
  const [hourRaw, minute = '00'] = String(value || '09:00').split(':');
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelve = ((hour + 11) % 12) + 1;
  return `${String(twelve).padStart(2, '0')}:${minute} ${suffix}`;
}

export function shiftSummary(shift: WorkShift): string {
  const days = shift.workingDays?.length
    ? shift.workingDays.length === 7
      ? 'Every day'
      : shift.workingDays.length === 5 && shift.workingDays[0] === 'Monday' && shift.workingDays[4] === 'Friday'
        ? 'Mon–Fri'
        : shift.workingDays.map((day) => day.slice(0, 3)).join(', ')
    : 'No days set';
  return `${shift.startTime} – ${shift.endTime} · ${days}`;
}

export function SetupWorkPatternsStep({
  employmentTypes,
  setEmploymentTypes,
  shifts,
  setShifts,
  saveWorkPatterns,
  goBack,
  busy,
}: {
  employmentTypes: EmploymentTypeCategory[];
  setEmploymentTypes: React.Dispatch<React.SetStateAction<EmploymentTypeCategory[]>>;
  shifts: WorkShift[];
  setShifts: React.Dispatch<React.SetStateAction<WorkShift[]>>;
  saveWorkPatterns: () => void;
  goBack: () => void;
  busy: boolean;
}) {
  const [typeName, setTypeName] = useState('');
  const [typeBenefits, setTypeBenefits] = useState(true);
  const [shiftForm, setShiftForm] = useState({
    name: '',
    startTime: '09:00',
    endTime: '18:00',
    gracePeriodMinutes: 15,
    workingDays: WEEKDAYS.slice(0, 5),
  });

  const addType = () => {
    const name = typeName.trim();
    if (name.length < 2) return;
    if (employmentTypes.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    setEmploymentTypes((previous) => [
      ...previous,
      { id: `et_${Date.now()}`, name, hasBenefits: typeBenefits, isPermanent: /full|permanent/i.test(name) },
    ]);
    setTypeName('');
  };

  const addShift = () => {
    const name = shiftForm.name.trim();
    if (name.length < 2 || !shiftForm.workingDays.length) return;
    if (shifts.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    setShifts((previous) => [
      ...previous,
      {
        id: `sh_${Date.now()}`,
        name,
        startTime: fromTimeInput(shiftForm.startTime),
        endTime: fromTimeInput(shiftForm.endTime),
        gracePeriodMinutes: Number(shiftForm.gracePeriodMinutes) || 0,
        workingDays: shiftForm.workingDays,
        rosterCode: name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'SHIFT',
      },
    ]);
    setShiftForm({ name: '', startTime: '09:00', endTime: '18:00', gracePeriodMinutes: 15, workingDays: WEEKDAYS.slice(0, 5) });
  };

  const toggleDay = (day: string) => {
    setShiftForm((previous) => ({
      ...previous,
      workingDays: previous.workingDays.includes(day)
        ? previous.workingDays.filter((item) => item !== day)
        : [...WEEKDAYS.filter((item) => previous.workingDays.includes(item) || item === day)],
    }));
  };

  const toggleShiftDay = (shiftId: string, day: string) => {
    setShifts((previous) => previous.map((shift) => {
      if (shift.id !== shiftId) return shift;
      const current = shift.workingDays || [];
      const workingDays = current.includes(day) ? current.filter((item) => item !== day) : [...WEEKDAYS.filter((item) => current.includes(item) || item === day)];
      return { ...shift, workingDays };
    }));
  };

  return (
    <div className="setup-patterns">
      <div className="setup-patterns__heading">
        <h2>How does your team work?</h2>
      </div>

      <div className="setup-patterns__grid">
        <section>
          <div className="setup-patterns__section-head">
            <h3>Employment types</h3>
            <span>{employmentTypes.length}</span>
          </div>
          <div className="setup-patterns__add">
            <input
              value={typeName}
              onChange={(event) => setTypeName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addType(); } }}
              placeholder="Add a type, e.g. Consultant"
              maxLength={80}
            />
            <label className="setup-patterns__check">
              <input type="checkbox" checked={typeBenefits} onChange={(event) => setTypeBenefits(event.target.checked)} />
              Benefits
            </label>
            <button type="button" onClick={addType} className="setup-button setup-button--secondary" aria-label="Add employment type">
              <Plus className="size-4" />
              Add
            </button>
          </div>
          <div className="setup-patterns__rows">
            {employmentTypes.map((item) => (
              <div key={item.id} className="setup-patterns__row">
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.hasBenefits ? 'Benefits eligible' : 'No benefits'}{item.isPermanent ? ' · Permanent' : ''}</small>
                </div>
                <label className="setup-patterns__check">
                  <input
                    type="checkbox"
                    checked={item.hasBenefits}
                    onChange={() => setEmploymentTypes((previous) => previous.map((type) => type.id === item.id ? { ...type, hasBenefits: !type.hasBenefits } : type))}
                  />
                  Benefits
                </label>
                <button
                  type="button"
                  disabled={employmentTypes.length <= 1}
                  onClick={() => setEmploymentTypes((previous) => previous.filter((type) => type.id !== item.id))}
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="setup-patterns__section-head">
            <h3>Shifts and schedules</h3>
            <span>{shifts.length}</span>
          </div>
          <div className="setup-patterns__shift-form">
            <input
              value={shiftForm.name}
              onChange={(event) => setShiftForm((previous) => ({ ...previous, name: event.target.value }))}
              placeholder="e.g. Morning shift"
              maxLength={80}
            />
            <div className="setup-patterns__time-row">
              <label>Starts
                <input type="time" value={shiftForm.startTime} onChange={(event) => setShiftForm((previous) => ({ ...previous, startTime: event.target.value }))} />
              </label>
              <label>Ends
                <input type="time" value={shiftForm.endTime} onChange={(event) => setShiftForm((previous) => ({ ...previous, endTime: event.target.value }))} />
              </label>
              <label>Grace (min)
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={shiftForm.gracePeriodMinutes}
                  onChange={(event) => setShiftForm((previous) => ({ ...previous, gracePeriodMinutes: Number(event.target.value) }))}
                />
              </label>
            </div>
            <div className="setup-days" role="group" aria-label="Working days">
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={shiftForm.workingDays.includes(day) ? 'is-on' : ''}
                  onClick={() => toggleDay(day)}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
            <button type="button" onClick={addShift} className="setup-button setup-button--secondary">
              <Plus className="size-4" />
              Add shift
            </button>
          </div>
          <div className="setup-patterns__rows">
            {shifts.map((shift) => (
              <div key={shift.id} className="setup-patterns__shift">
                <div className="setup-patterns__row">
                  <div>
                    <strong>{shift.name}</strong>
                    <small>{shiftSummary(shift)} · {shift.gracePeriodMinutes || 0} min grace</small>
                  </div>
                  <button
                    type="button"
                    disabled={shifts.length <= 1}
                    onClick={() => setShifts((previous) => previous.filter((item) => item.id !== shift.id))}
                    aria-label={`Remove ${shift.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="setup-patterns__time-row">
                  <label>Starts
                    <input
                      type="time"
                      value={toTimeInput(shift.startTime)}
                      onChange={(event) => setShifts((previous) => previous.map((item) => item.id === shift.id ? { ...item, startTime: fromTimeInput(event.target.value) } : item))}
                    />
                  </label>
                  <label>Ends
                    <input
                      type="time"
                      value={toTimeInput(shift.endTime)}
                      onChange={(event) => setShifts((previous) => previous.map((item) => item.id === shift.id ? { ...item, endTime: fromTimeInput(event.target.value) } : item))}
                    />
                  </label>
                </div>
                <div className="setup-days" role="group" aria-label={`${shift.name} working days`}>
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={(shift.workingDays || []).includes(day) ? 'is-on' : ''}
                      onClick={() => toggleShiftDay(shift.id, day)}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="setup-workplace__footer">
        <button type="button" className="setup-button setup-button--secondary" onClick={goBack}>Back</button>
        <button type="button" className="setup-button setup-button--primary" disabled={busy || !employmentTypes.length || !shifts.length} onClick={saveWorkPatterns}>
          {busy ? 'Saving…' : 'Save hours & continue'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
