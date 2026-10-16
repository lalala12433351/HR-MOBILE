'use client';

import React from 'react';

export function SettingsToast({ message }: { message: string | null }) {
  if (!message) return null;
  const failed = /fail|error|must remain|try again/i.test(message);
  return (
    <div
      role="status"
      className={`settings-toast ${failed ? 'settings-toast--err' : 'settings-toast--ok'}`}
    >
      {message}
    </div>
  );
}
