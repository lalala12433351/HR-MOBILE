import React from 'react';

export const KiteLogoMark: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2.3 3.5 10.15 12 13.9 20.5 10.15Z" fill="currentColor" />
    <path d="M12 13.9 3.5 10.15 4.15 12.1 12 21.5Z" fill="currentColor" fillOpacity="0.82" />
    <path d="M12 13.9 20.5 10.15 19.85 12.1 12 21.5Z" fill="currentColor" fillOpacity="0.6" />
  </svg>
);
