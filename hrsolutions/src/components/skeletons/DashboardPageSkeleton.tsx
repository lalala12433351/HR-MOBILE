import React from 'react';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';

export function DashboardPageSkeleton({
  variant = 'admin',
}: {
  variant?: 'admin' | 'employee' | 'hr';
}) {
  const showWorkday = variant === 'employee' || variant === 'hr';
  const workdayCard = (
    <div className="workday-card">
      <div className="workday-card-head">
        <Skeleton height={16} width={110} borderRadius="7px" />
        <Skeleton height={28} width={88} borderRadius="7px" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
        <Skeleton
          height={variant === 'employee' ? 132 : 176}
          width={variant === 'employee' ? 132 : 176}
          borderRadius="88px"
        />
      </div>
      <Skeleton height={14} width="70%" borderRadius="7px" />
      <Skeleton height={36} width="100%" borderRadius="7px" />
      <Skeleton height={36} width="100%" borderRadius="7px" />
    </div>
  );

  return (
    <div className="dash-page" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton height={24} width={280} borderRadius="7px" />

      <div className={`dash-figures${variant === 'employee' ? ' dash-figures--member' : ''}`}>
        {showWorkday ? (
          variant === 'employee' ? <div className="dash-workday">{workdayCard}</div> : workdayCard
        ) : (
          <div className="dash-figure-lead">
            <SkeletonText width="48%" />
            <Skeleton height={32} width="28%" borderRadius="7px" />
          </div>
        )}

        {variant === 'employee' ? (
          <>
            <div className="dash-action-rail">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="dash-action">
                  <SkeletonText width="42%" />
                  <Skeleton height={14} width="28%" borderRadius="7px" />
                </div>
              ))}
            </div>
            <div className="dash-today-fill">
              <WidgetSkeleton rows={3} rowHeight={36} />
              <WidgetSkeleton rows={3} rowHeight={36} />
            </div>
          </>
        ) : (
          <div className="dash-figure-rail">
            {Array.from({ length: variant === 'hr' ? 4 : 3 }).map((_, i) => (
              <div key={i} className="dash-figure-item">
                <SkeletonText width="42%" />
                <Skeleton height={18} width="18%" borderRadius="7px" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dash-board">
        {variant === 'employee' ? (
          <>
            <WidgetSkeleton className="dash-span-7" rows={4} rowHeight={40} />
            <WidgetSkeleton className="dash-span-5" height={220} />
            <WidgetSkeleton className="dash-span-7" rows={3} rowHeight={44} />
            <WidgetSkeleton className="dash-span-5" rows={3} rowHeight={48} />
          </>
        ) : variant === 'hr' ? (
          <>
            <WidgetSkeleton className="dash-span-7" rows={5} rowHeight={40} />
            <WidgetSkeleton className="dash-span-5" rows={4} rowHeight={40} />
            <WidgetSkeleton className="dash-span-7" rows={4} rowHeight={40} />
            <WidgetSkeleton className="dash-span-5" rows={4} rowHeight={36} />
            <WidgetSkeleton className="dash-span-12" rows={5} rowHeight={40} />
          </>
        ) : (
          <>
            <WidgetSkeleton className="dash-span-8" height={180} />
            <WidgetSkeleton className="dash-span-4" height={220} />
            <WidgetSkeleton className="dash-span-6" rows={4} rowHeight={40} />
            <WidgetSkeleton className="dash-span-6" rows={4} rowHeight={40} />
            <WidgetSkeleton className="dash-span-5" rows={3} rowHeight={44} />
            <WidgetSkeleton className="dash-span-7" rows={4} rowHeight={40} />
            <WidgetSkeleton className="dash-span-12" rows={4} rowHeight={36} />
            <WidgetSkeleton className="dash-span-12" rows={5} rowHeight={40} />
          </>
        )}
      </div>
    </div>
  );
}

function WidgetSkeleton({
  height,
  rows,
  rowHeight = 60,
  className = '',
}: {
  height?: number;
  rows?: number;
  rowHeight?: number;
  className?: string;
}) {
  return (
    <div className={`dash-panel ${className}`.trim()}>
      <div className="dash-panel-head">
        <Skeleton height={16} width={140} borderRadius="4px" />
        <Skeleton height={14} width={60} borderRadius="4px" />
      </div>
      <div className="dash-panel-body space-y-3">
        {height != null && <Skeleton height={height} width="100%" borderRadius="8px" />}
        {rows != null &&
          Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} height={rowHeight} width="100%" borderRadius="8px" />
          ))}
      </div>
    </div>
  );
}
