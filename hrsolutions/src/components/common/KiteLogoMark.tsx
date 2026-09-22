import React from 'react';

export const KiteLogoMark: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Upper aerodynamic canopy */}
    <path
      d="M12 2.2L3.6 9.8C3.2 10.1 3.3 10.7 3.8 10.9L12 14.2L20.2 10.9C20.7 10.7 20.8 10.1 20.4 9.8L12 2.2Z"
      fill="currentColor"
    />
    {/* Lower left facet */}
    <path
      d="M3.6 11.8L11.4 21.6C11.6 21.8 11.8 21.7 11.8 21.4V15.1L4.2 11.8C3.8 11.6 3.4 11.8 3.6 12.2Z"
      fill="currentColor"
      fillOpacity="0.82"
    />
    {/* Lower right facet */}
    <path
      d="M20.4 11.8L12.6 21.6C12.4 21.8 12.2 21.7 12.2 21.4V15.1L19.8 11.8C20.2 11.6 20.6 11.8 20.4 12.2Z"
      fill="currentColor"
      fillOpacity="0.6"
    />
  </svg>
);
