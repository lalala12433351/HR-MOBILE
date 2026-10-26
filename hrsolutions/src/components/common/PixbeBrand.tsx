'use client';

import React, { useState } from 'react';
import { KiteLogoMark } from './KiteLogoMark';
import { DEFAULT_ORG_LOGO } from '@/data/initialData';

export interface PixbeWordmarkProps {
  className?: string;
  markClassName?: string;
  label?: string;
}

/** Pixel wordmark from the Pixbe design foundation: navy stem and two blocks. */
export const PixbePixelMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`pixbe-pixel ${className}`} aria-hidden>
    <span className="pixbe-pixel__stem" />
    <span className="pixbe-pixel__col">
      <span className="pixbe-pixel__a" />
      <span className="pixbe-pixel__b" />
    </span>
  </span>
);

/** A monochrome lockup: color is inherited so it works on both light and sapphire surfaces. */
export const PixbeWordmark: React.FC<PixbeWordmarkProps> = ({
  className = '',
  markClassName = 'h-5 w-5',
  label = 'Pixbe',
}) => (
  <span className={`inline-flex items-center gap-2 text-current ${className}`}>
    <KiteLogoMark className={markClassName} />
    <span className="font-bold tracking-[-0.045em] leading-none">{label}</span>
  </span>
);

/** Exact 28px pixel mark and lowercase lockup used by the Figma onboarding screens. */
export const PixbeDesignWordmark: React.FC<{ className?: string; markClassName?: string }> = ({ className = '' }) => (
  <span className={`figma-wordmark ${className}`} aria-label="Pixbe"><PixbePixelMark/><span>pixbe</span></span>
);

function isCustomOrgLogo(src?: string | null): src is string {
  if (!src || src === DEFAULT_ORG_LOGO) return false;
  return /^(https?:|data:image\/|blob:|\/)/i.test(src);
}

/** Navy tile with the workspace logo, or the Pixbe kite when none is set. */
export const OrgBrandMark: React.FC<{
  src?: string | null;
  className?: string;
  markClassName?: string;
}> = ({
  src,
  className = 'w-6 h-6 rounded-[7px] bg-[var(--studio-navy)] text-white flex items-center justify-center shrink-0 overflow-hidden',
  markClassName = 'w-3.5 h-3.5',
}) => {
  const [failed, setFailed] = useState(false);
  const showImage = isCustomOrgLogo(src) && !failed;

  return (
    <span className={className} aria-hidden>
      {showImage ? (
        // Uploaded org marks are arbitrary URLs / data URIs — not Next static assets.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <KiteLogoMark className={markClassName} />
      )}
    </span>
  );
};
