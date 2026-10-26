'use client';

import React from 'react';

export function SettingsToggle({
  checked,
  onChange,
  id,
  labelledBy,
  disabled = false,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  id?: string;
  labelledBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      disabled={disabled}
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`settings-toggle${checked ? ' is-on' : ''}`}
    >
      <span className="settings-toggle__track" aria-hidden="true" />
      <span className="settings-toggle__thumb" aria-hidden="true" />
    </button>
  );
}
