'use client';

import React from 'react';
import { OfficeLocationPickerMap } from '@/components/common/OfficeLocationPickerMap';
import { DEFAULT_OFFICE_RADIUS_METERS, MAX_GEOFENCE_LIMIT_METERS, MIN_GEOFENCE_LIMIT_METERS } from '@/config/constants';

type Mode = 'remote' | 'onsite' | 'hybrid';
type Office = { id?: string; name: string; address: string; latitude: number; longitude: number; radius: number; timezone: string; saved: boolean };
type OfficeForm = { name: string; address: string; latitude: number | null; longitude: number | null; radius: number; timezone: string };

function WorkModeIcon({ mode }: { mode: Mode }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" {...common}>
    {mode === 'remote' && <><rect x="5" y="10" width="25" height="20" rx="2.5" /><path d="M11 36h25M17 30v6M36 14a7 7 0 0 1 0 14M38 18a3 3 0 0 1 0 6" /><circle cx="23" cy="20" r="3" fill="currentColor" stroke="none" /></>}
    {mode === 'onsite' && <><path d="M9 37V15l15-7 15 7v22H9Z" /><path d="M17 37V25h14v12M16 18h3m10 0h3M16 22h3m10 0h3" /><circle cx="24" cy="31" r="1.5" fill="currentColor" stroke="none" /></>}
    {mode === 'hybrid' && <><rect x="5" y="10" width="19" height="25" rx="2.5" /><path d="M11 17h7m-7 5h7M30 17l9-4v22H29V17h10M24 25h6M24 30h6" /><circle cx="35" cy="26" r="2" fill="currentColor" stroke="none" /></>}
  </svg>;
}

export function SetupWorkplaceStep({
  mode, setMode, offices, officeForm, setOfficeForm, timezones, addOffice, removeOffice, saveWorkplace, busy,
}: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  offices: Office[];
  officeForm: OfficeForm;
  setOfficeForm: React.Dispatch<React.SetStateAction<OfficeForm>>;
  timezones: string[];
  addOffice: () => void;
  removeOffice: (index: number) => void;
  saveWorkplace: () => void;
  busy: boolean;
}) {
  const physical = mode !== 'remote';
  return <div className="setup-workplace">
    <div className="setup-workplace__heading">
      <h2>Where will your team work?</h2>
    </div>

    <div className="setup-mode-list" role="radiogroup" aria-label="Work arrangement">
      {([
        { value: 'remote', title: 'Remote', detail: 'Your team works without a shared workplace.' },
        { value: 'onsite', title: 'On-site', detail: 'Your team works from one or more physical locations.' },
        { value: 'hybrid', title: 'Hybrid', detail: 'Your team splits time between locations and remote work.' },
      ] as const).map((option) => <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={mode === option.value}
        className={`setup-mode ${mode === option.value ? 'setup-mode--selected' : ''}`}
        onClick={() => setMode(option.value)}
      >
        <span className="setup-mode__icon"><WorkModeIcon mode={option.value} /></span>
        <span className="setup-mode__copy"><strong>{option.title}</strong><small>{option.detail}</small></span>
        <span className="setup-mode__radio" aria-hidden="true" />
      </button>)}
    </div>

    {physical ? <section className="setup-location">
      <div className="setup-location__heading">
        <div><h3>Add your first workplace</h3></div>
        <span>{offices.length} {offices.length === 1 ? 'location' : 'locations'} added</span>
      </div>
      <div className="setup-location__body">
        <div className="setup-location__fields">
          <label>Workplace name
            <input value={officeForm.name} onChange={(event) => setOfficeForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. Main office" maxLength={128} />
          </label>
          <label>Address
            <input
              value={officeForm.address}
              readOnly
              tabIndex={-1}
              placeholder="Pick a point or search on the map"
              className="cursor-default bg-[#f6f8fa]"
              aria-describedby="setup-address-hint"
              onBeforeInput={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              onKeyDown={(event) => event.preventDefault()}
            />
          </label>
          <p id="setup-address-hint" className={`setup-location__hint ${officeForm.latitude === null ? '' : 'setup-location__hint--ready'}`}>
            {officeForm.latitude === null ? 'Search or click the map to set the address. This field cannot be typed in.' : 'Map location confirmed. You can add this workplace.'}
          </p>
          <div className="setup-location__field-row">
            <label>Time zone
              <select value={officeForm.timezone} onChange={(event) => setOfficeForm((previous) => ({ ...previous, timezone: event.target.value }))}>
                {timezones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <label>Future GPS radius
              <input type="number" min={MIN_GEOFENCE_LIMIT_METERS} max={MAX_GEOFENCE_LIMIT_METERS} step="1" value={officeForm.radius} onChange={(event) => setOfficeForm((previous) => ({ ...previous, radius: event.target.value === '' ? DEFAULT_OFFICE_RADIUS_METERS : Number(event.target.value) }))} />
            </label>
          </div>
          <button type="button" className="setup-button setup-button--secondary" onClick={addOffice}>Add workplace <span aria-hidden="true">+</span></button>
        </div>
        <div className="setup-location__map">
          <OfficeLocationPickerMap latitude={officeForm.latitude} longitude={officeForm.longitude} radiusMeters={officeForm.radius} requireSelection onLocationChange={(latitude, longitude, address) => setOfficeForm((previous) => ({ ...previous, latitude, longitude, address: address || previous.address }))} className="setup-location__map-canvas" />
          <p>Search for an address, press Enter to use the first match, or place a pin manually.</p>
        </div>
      </div>
      {offices.length > 0 && <div className="setup-location__saved" aria-label="Added workplaces">
        {offices.map((office, index) => <div key={`${office.name}-${index}`} className="setup-location__saved-item">
          <span className="setup-location__saved-mark" aria-hidden="true" />
          <div><strong>{office.name}</strong><small>{office.address}</small></div>
          <button type="button" disabled={busy} onClick={() => removeOffice(index)} aria-label={`Remove ${office.name}`}>Remove</button>
        </div>)}
      </div>}
    </section> : <div className="setup-remote-note"><strong>No workplace needed yet.</strong><span>You can add one later if your team starts using an office.</span></div>}

    <div className="setup-workplace__footer">
      <p>{physical ? 'At least one confirmed location is required to continue.' : 'You can invite your team without a physical location.'}</p>
      <button type="button" className="setup-button setup-button--primary" disabled={busy || (physical && offices.length === 0)} onClick={saveWorkplace}>{busy ? 'Saving…' : 'Continue to structure'}<span aria-hidden="true">→</span></button>
    </div>
  </div>;
}
