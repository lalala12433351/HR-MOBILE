import React from 'react';
import { Skeleton, SkeletonText, SkeletonAvatar } from '@/components/ui/Skeleton';

interface TabsTablePageSkeletonProps {
  /** Number of tab pills to show */
  tabCount?: number;
  /** Number of table body rows */
  rowCount?: number;
  className?: string;
}

export function TabsTablePageSkeleton({
  tabCount = 5,
  rowCount = 8,
  className = '',
}: TabsTablePageSkeletonProps) {
  return (
    <div
      className={`space-y-5 ${className}`}
      aria-busy="true"
      aria-label="Loading page"
    >
      {/* Title + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton height={28} width={200} borderRadius="0.375rem" />
          <SkeletonText width={240} />
        </div>
        <div className="flex gap-2">
          <Skeleton height={36} width={100} borderRadius="0.5rem" />
          <Skeleton height={36} width={120} borderRadius="0.5rem" />
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 overflow-hidden border-b border-slate-200 pb-3">
        {Array.from({ length: tabCount }).map((_, i) => (
          <Skeleton
            key={i}
            height={32}
            width={i === 0 ? 110 : 88 + (i % 3) * 12}
            borderRadius="0.5rem"
          />
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Skeleton height={36} width="100%" className="max-w-xs" borderRadius="0.5rem" />
        <div className="flex gap-2">
          <Skeleton height={36} width={80} borderRadius="0.5rem" />
          <Skeleton height={36} width={90} borderRadius="0.5rem" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 bg-slate-50/80">
          <Skeleton height={12} width={24} borderRadius="0.25rem" />
          <Skeleton height={12} width="18%" borderRadius="0.25rem" />
          <Skeleton height={12} width="14%" borderRadius="0.25rem" className="hidden sm:block" />
          <Skeleton height={12} width="12%" borderRadius="0.25rem" className="hidden md:block" />
          <Skeleton height={12} width="10%" borderRadius="0.25rem" className="hidden lg:block" />
          <Skeleton height={12} width={48} borderRadius="0.25rem" className="ml-auto" />
        </div>

        {Array.from({ length: rowCount }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3.5 border-b border-slate-50 last:border-0"
          >
            <SkeletonAvatar size={36} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton height={14} width={`${55 + (i % 4) * 8}%`} borderRadius="0.25rem" />
              <Skeleton
                height={10}
                width={`${35 + (i % 3) * 10}%`}
                borderRadius="0.25rem"
                className="sm:hidden"
              />
            </div>
            <Skeleton
              height={14}
              width={80}
              borderRadius="0.25rem"
              className="hidden sm:block"
            />
            <Skeleton
              height={14}
              width={64}
              borderRadius="0.25rem"
              className="hidden md:block"
            />
            <Skeleton
              height={22}
              width={64}
              borderRadius="9999px"
              className="hidden lg:block"
            />
            <Skeleton height={28} width={28} borderRadius="0.375rem" />
          </div>
        ))}
      </div>
    </div>
  );
}
