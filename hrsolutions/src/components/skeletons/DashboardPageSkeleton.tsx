import React from 'react';
import { Skeleton, SkeletonText, SkeletonAvatar } from '@/components/ui/Skeleton';

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6 pb-12" aria-busy="true" aria-label="Loading dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton height={28} width={200} borderRadius="0.375rem" />
          <SkeletonText width={280} />
        </div>
        <div className="flex gap-2">
          <Skeleton height={36} width={100} borderRadius="0.5rem" />
          <Skeleton height={36} width={120} borderRadius="0.5rem" />
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-3"
          >
            <SkeletonText width="40%" />
            <Skeleton height={32} width="50%" borderRadius="0.375rem" />
            <SkeletonText width="60%" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 space-y-6">
          <WidgetSkeleton height={280} />
          <WidgetSkeleton rows={3} rowHeight={86} />
          <WidgetSkeleton rows={4} rowHeight={60} />
        </section>
        <section className="lg:col-span-6 space-y-6">
          <WidgetSkeleton height={220} />
          <WidgetSkeleton height={80} />
          <WidgetSkeleton rows={4} rowHeight={52} />
        </section>
      </div>

      {/* Bottom table */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton height={20} width={180} borderRadius="0.25rem" />
          <Skeleton height={32} width={120} borderRadius="0.5rem" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <SkeletonAvatar size={32} />
            <SkeletonText className="flex-1" width="100%" />
            <Skeleton height={16} width={64} borderRadius="0.25rem" />
            <Skeleton height={16} width={48} borderRadius="0.25rem" />
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetSkeleton({
  height,
  rows,
  rowHeight = 60,
}: {
  height?: number;
  rows?: number;
  rowHeight?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton height={18} width={140} borderRadius="0.25rem" />
        <Skeleton height={14} width={60} borderRadius="0.25rem" />
      </div>
      {height != null && (
        <Skeleton height={height} width="100%" borderRadius="0.5rem" />
      )}
      {rows != null &&
        Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} height={rowHeight} width="100%" borderRadius="0.75rem" />
        ))}
    </div>
  );
}
