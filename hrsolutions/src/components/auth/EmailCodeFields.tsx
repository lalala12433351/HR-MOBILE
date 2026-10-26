'use client';

import React, { useRef } from 'react';

export function EmailCodeFields({
  digits,
  onChange,
  invalid,
}: {
  digits: string[];
  onChange: (digits: string[]) => void;
  invalid?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const write = (next: string[], focusIndex: number) => {
    onChange(next);
    refs.current[Math.max(0, Math.min(focusIndex, 5))]?.focus();
  };

  return (
    <div className="setup-otp" role="group" aria-label="Verification code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          autoFocus={index === 0}
          aria-label={`Digit ${index + 1}`}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            const clean = event.target.value.replace(/\D/g, '').slice(-1);
            const next = [...digits];
            next[index] = clean;
            write(next, clean ? index + 1 : index);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digits[index] && index > 0) {
              const next = [...digits];
              next[index - 1] = '';
              write(next, index - 1);
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const paste = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (!paste) return;
            const next = ['', '', '', '', '', ''];
            for (let i = 0; i < paste.length; i += 1) next[i] = paste[i];
            write(next, Math.min(paste.length, 5));
          }}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
