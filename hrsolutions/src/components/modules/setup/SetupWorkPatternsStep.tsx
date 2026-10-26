'use client';

import React, { useState } from 'react';
import { ChevronDown, Plus, Trash2, Check } from 'lucide-react';
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

function DayPicker({
  value,
  onToggle,
  label,
}: {
  value: string[];
  onToggle: (day: string) => void;
  label: string;
}) {
  return (
    <fieldset className="fs-days-fieldset"><legend>Working days</legend><div className="setup-days" role="group" aria-label={label}>
      {WEEKDAYS.map((day) => (
        <button
          key={day}
          type="button"
          className={value.includes(day) ? 'is-on' : ''}
          onClick={() => onToggle(day)}
          aria-pressed={value.includes(day)}
        >
          {value.includes(day) && <Check size={12}/>} {day.slice(0, 3)}
        </button>
      ))}
    </div></fieldset>
  );
}

export function SetupWorkPatternsStep({
  employmentTypes,
  setEmploymentTypes,
  shifts,
  setShifts,
  saveWorkPatterns,
  goBack,
  busy,
  onNotify,
}: {
  employmentTypes: EmploymentTypeCategory[];
  setEmploymentTypes: React.Dispatch<React.SetStateAction<EmploymentTypeCategory[]>>;
  shifts: WorkShift[];
  setShifts: React.Dispatch<React.SetStateAction<WorkShift[]>>;
  saveWorkPatterns: () => void;
  goBack: () => void;
  busy: boolean;
  onNotify?: (kind: 'error' | 'success', text: string) => void;
}) {
  const [typeName, setTypeName] = useState('');
  const [typeBenefits, setTypeBenefits] = useState(true);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [addingShift, setAddingShift] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    name: '',
    startTime: '09:00',
    endTime: '18:00',
    gracePeriodMinutes: 15,
    workingDays: WEEKDAYS.slice(0, 5),
  });

  const addType = () => {
    const name = typeName.trim();
    if (name.length < 2) {
      onNotify?.('error', 'Use an employment type name of at least two characters.');
      return;
    }
    if (employmentTypes.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      onNotify?.('error', 'That employment type is already listed.');
      return;
    }
    setEmploymentTypes((previous) => [
      ...previous,
      { id: `et_${Date.now()}`, name, hasBenefits: typeBenefits, isPermanent: /full|permanent/i.test(name) },
    ]);
    setTypeName('');
  };

  const addShift = () => {
    const name = shiftForm.name.trim();
    if (name.length < 2) {
      onNotify?.('error', 'Enter a shift name of at least two characters.');
      return;
    }
    if (!shiftForm.workingDays.length) {
      onNotify?.('error', 'Choose at least one working day for this shift.');
      return;
    }
    if (shifts.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      onNotify?.('error', 'That shift name is already listed.');
      return;
    }
    const id = `sh_${Date.now()}`;
    setShifts((previous) => [
      ...previous,
      {
        id,
        name,
        startTime: fromTimeInput(shiftForm.startTime),
        endTime: fromTimeInput(shiftForm.endTime),
        gracePeriodMinutes: Number(shiftForm.gracePeriodMinutes) || 0,
        workingDays: shiftForm.workingDays,
        rosterCode: name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'SHIFT',
      },
    ]);
    setShiftForm({ name: '', startTime: '09:00', endTime: '18:00', gracePeriodMinutes: 15, workingDays: WEEKDAYS.slice(0, 5) });
    setAddingShift(false);
    setEditingShiftId(null);
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
      const workingDays = current.includes(day)
        ? current.filter((item) => item !== day)
        : [...WEEKDAYS.filter((item) => current.includes(item) || item === day)];
      return { ...shift, workingDays };
    }));
  };

  const updateShift = (shiftId: string, patch: Partial<WorkShift>) => {
    setShifts((previous) => previous.map((item) => (item.id === shiftId ? { ...item, ...patch } : item)));
  };

  const openAddShift = () => {
    setEditingShiftId(null);
    setAddingShift(true);
  };

  const openEditShift = (shiftId: string) => {
    setAddingShift(false);
    setEditingShiftId((current) => (current === shiftId ? null : shiftId));
  };

  return (
    <div className="setup-patterns">
      <div className="setup-patterns__heading">
        <h2>Set your team’s working rhythm</h2><p>Define employment types and reusable shifts. You’ll assign these defaults to people in the next step.</p>
      </div>

      <div className="setup-patterns__grid">
        <section>
          <div className="setup-patterns__section-head">
            <h3>Employment types</h3>
            <span>{employmentTypes.length}</span>
          </div>

          <div className="setup-patterns__rows">
            {employmentTypes.map((item) => (
              <div key={item.id} className="setup-patterns__row">
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.hasBenefits ? 'Benefits eligible' : 'No benefits'}
                    {item.isPermanent ? ' · Permanent' : ''}
                  </small>
                </div>
                <button type="button" aria-expanded={editingTypeId === item.id} onClick={() => setEditingTypeId((current) => current === item.id ? null : item.id)}>Edit</button>
                {editingTypeId === item.id && <div className="fs-type-editor"><label><input type="checkbox" checked={item.hasBenefits} onChange={(event) => setEmploymentTypes((previous) => previous.map((type) => type.id === item.id ? { ...type, hasBenefits: event.target.checked } : type))}/> Benefits eligible</label><button type="button" onClick={() => setEditingTypeId(null)}>Done</button></div>}

                <button
                  type="button"
                  disabled={employmentTypes.length <= 1}
                  onClick={() => setEmploymentTypes((previous) => previous.filter((type) => type.id !== item.id))}
                  aria-label={`Remove ${item.name}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <details className="fs-add-composer"><summary>+ Add employment type</summary>          <div className="setup-patterns__composer">
            <input
              value={typeName}
              onChange={(event) => setTypeName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addType(); } }}
              placeholder="e.g. Consultant"
              maxLength={80}
              aria-label="New employment type"
            />
            <button
              type="button"
              className={`setup-toggle ${typeBenefits ? 'is-on' : ''}`}
              aria-pressed={typeBenefits}
              onClick={() => setTypeBenefits((previous) => !previous)}
            >
              Benefits
            </button>
            <button type="button" onClick={addType} className="setup-icon-btn" aria-label="Add employment type">
              <Plus className="size-4" />
            </button>
          </div>
</details>
        </section>

        <section>
          <div className="setup-patterns__section-head">
            <h3>Shifts and schedules</h3>
            <span>{shifts.length}</span>
          </div>

          <div className="setup-patterns__rows">
            {shifts.map((shift) => {
              const isEditing = editingShiftId === shift.id;
              return (
                <div key={shift.id} className={`setup-patterns__shift ${isEditing ? 'is-open' : ''}`}>
                  <div className="setup-patterns__row setup-patterns__row--shift">
                    <div
                      className="setup-patterns__shift-toggle"
                    >
                      <span>
                        <input className="fs-shift-name" aria-label="Shift name" value={shift.name} maxLength={80} onChange={(event) => updateShift(shift.id, { name: event.target.value })}/>
                        <small>{shiftSummary(shift)} · {shift.gracePeriodMinutes || 0} min grace</small>
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={shifts.length <= 1}
                      onClick={() => {
                        setShifts((previous) => previous.filter((item) => item.id !== shift.id));
                        if (editingShiftId === shift.id) setEditingShiftId(null);
                      }}
                      aria-label={`Remove ${shift.name}`}
                    >
                      Remove
                    </button>
                  </div>

                  {(
                    <div className="setup-patterns__shift-body">
                      <div className="setup-patterns__time-row">
                        <label className="setup-field">
                          Start time *
                          <input
                            type="time"
                            value={toTimeInput(shift.startTime)}
                            onChange={(event) => updateShift(shift.id, { startTime: fromTimeInput(event.target.value) })}
                          />
                        </label>
                        <label className="setup-field">
                          End time *
                          <input
                            type="time"
                            value={toTimeInput(shift.endTime)}
                            onChange={(event) => updateShift(shift.id, { endTime: fromTimeInput(event.target.value) })}
                          />
                        </label>
                        <label className="setup-field">Unpaid break *<select value={shift.unpaidBreakMinutes || 0} onChange={(event) => updateShift(shift.id, { unpaidBreakMinutes: Number(event.target.value) })}>{Array.from(new Set([0,15,30,45,60,90,120,shift.unpaidBreakMinutes || 0])).sort((a,b) => a-b).map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
                      </div>
                      <DayPicker
                        label={`${shift.name} working days`}
                        value={shift.workingDays || []}
                        onToggle={(day) => toggleShiftDay(shift.id, day)}
                      />
                      <p className="fs-shift-summary">{(() => { const [startHour,startMinute] = toTimeInput(shift.startTime).split(':').map(Number); const [endHour,endMinute] = toTimeInput(shift.endTime).split(':').map(Number); const start=startHour*60+startMinute, end=endHour*60+endMinute; const paid=Math.max(0, ((end-start+1440)%1440) - (shift.unpaidBreakMinutes || 0)); const weekly=paid*(shift.workingDays?.length || 0); const label=(minutes:number)=>`${Math.floor(minutes/60)}h${minutes%60 ? ` ${minutes%60}m` : ''}`; return `${label(paid)} paid / day, ${label(weekly)} / week`; })()}</p>
                      <details className="fs-shift-advanced"><summary>Additional shift options</summary>                        <label className="setup-field">
                          Late grace (min)
                          <input
                            type="number"
                            min={0}
                            max={120}
                            value={shift.gracePeriodMinutes || 0}
                            onChange={(event) => updateShift(shift.id, { gracePeriodMinutes: Number(event.target.value) || 0 })}
                          />
                        </label></details>

                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {addingShift ? (
            <div className="setup-patterns__shift-form">
              <label className="setup-field">
                Shift name
                <input
                  value={shiftForm.name}
                  onChange={(event) => setShiftForm((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="e.g. Morning shift"
                  maxLength={80}
                  autoFocus
                />
              </label>
              <div className="setup-patterns__time-row">
                <label className="setup-field">
                  Starts
                  <input
                    type="time"
                    value={shiftForm.startTime}
                    onChange={(event) => setShiftForm((previous) => ({ ...previous, startTime: event.target.value }))}
                  />
                </label>
                <label className="setup-field">
                  Ends
                  <input
                    type="time"
                    value={shiftForm.endTime}
                    onChange={(event) => setShiftForm((previous) => ({ ...previous, endTime: event.target.value }))}
                  />
                </label>
                <label className="setup-field">
                  Late grace (min)
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={shiftForm.gracePeriodMinutes}
                    onChange={(event) => setShiftForm((previous) => ({ ...previous, gracePeriodMinutes: Number(event.target.value) }))}
                  />
                </label>
              </div>
              <DayPicker
                label="Working days for new shift"
                value={shiftForm.workingDays}
                onToggle={toggleDay}
              />
              <div className="setup-patterns__form-actions">
                <button type="button" className="setup-button setup-button--secondary" onClick={() => setAddingShift(false)}>
                  Cancel
                </button>
                <button type="button" className="setup-button setup-button--primary" onClick={addShift}>
                  Save shift
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={openAddShift} className="setup-button setup-button--secondary setup-patterns__add-shift">
              <Plus className="size-4" />
              Add shift
            </button>
          )}
        </section>
      </div>

      <div className="setup-workplace__footer">
        <button type="button" className="setup-button setup-button--secondary" onClick={goBack}>Back</button>
        <button
          type="button"
          className="setup-button setup-button--primary"
          disabled={busy || !employmentTypes.length || !shifts.length}
          onClick={saveWorkPatterns}
        >
          {busy ? 'Saving…' : 'Continue'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
