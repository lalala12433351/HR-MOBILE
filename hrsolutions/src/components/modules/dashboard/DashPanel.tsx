'use client';

import React from 'react';

type DashPanelProps = {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  purpose?: string;
};

export function DashPanel({
  title,
  action,
  children,
  className = '',
  bodyClassName = '',
  padded = true,
  purpose,
}: DashPanelProps) {
  return (
    <section className={`dash-panel ${className}`.trim()} data-purpose={purpose}>
      {(title || action) && (
        <header className="dash-panel-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      )}
      <div className={`dash-panel-body ${padded ? '' : 'dash-panel-body--flush'} ${bodyClassName}`.trim()}>
        {children}
      </div>
    </section>
  );
}
