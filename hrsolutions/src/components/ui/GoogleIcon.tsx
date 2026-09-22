import React from 'react';

export interface GoogleIconProps {
  name: string;
  size?: number | string;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;
  filled?: boolean;
  className?: string;
}

/**
 * Google Material Symbols (Rounded) icon component.
 * Renders high-quality Google rounded symbols with configurable weight and fill.
 */
export const GoogleIcon: React.FC<GoogleIconProps> = ({
  name,
  size = 20,
  weight = 500,
  filled = false,
  className = '',
}) => {
  const sizePx = typeof size === 'number' ? `${size}px` : size;
  return (
    <span
      className={`material-symbols-rounded select-none inline-flex items-center justify-center shrink-0 leading-none ${className}`}
      style={{
        fontSize: sizePx,
        width: sizePx,
        height: sizePx,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
};
