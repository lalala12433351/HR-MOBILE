'use client';

import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  iconClassName?: string;
  alt?: string;
}

const getInitials = (name?: string): string => {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getAvatarTheme = (_name?: string) => {
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  name,
  className = 'h-8 w-8',
  iconClassName,
  alt,
}) => {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [src]);

  const cleanSrc = typeof src === 'string' ? src.trim() : '';
  const isInvalidSrc =
    !cleanSrc ||
    cleanSrc === '' ||
    cleanSrc === 'undefined' ||
    cleanSrc === 'null' ||
    cleanSrc.includes('data:image/svg+xml');

  if (!isInvalidSrc && !imageError) {
    return (
      <img
        src={cleanSrc}
        alt={alt || name || 'User avatar'}
        className={`rounded-full object-cover shrink-0 ${className}`}
        onError={() => setImageError(true)}
      />
    );
  }

  const initials = getInitials(name || alt);
  const themeClass = getAvatarTheme(name || alt);

  if (initials) {
    return (
      <div
        className={`rounded-full border flex items-center justify-center shrink-0 select-none font-bold text-xs ${themeClass} ${className}`}
        title={name || alt || 'User'}
      >
        <span>{initials}</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-full bg-slate-100 text-slate-500 border border-slate-200/80 flex items-center justify-center shrink-0 select-none overflow-hidden ${className}`}
      title={name || alt || 'User'}
    >
      <User className={`text-slate-400 stroke-[2] ${iconClassName || 'h-[55%] w-[55%]'}`} />
    </div>
  );
};
