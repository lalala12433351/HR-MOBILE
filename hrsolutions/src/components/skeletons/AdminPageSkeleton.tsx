import React from 'react';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';

interface AdminPageSkeletonProps {
  className?: string;
  /** When true, fill the viewport (master-admin full-page shell) */
  fullPage?: boolean;
}

export function AdminPageSkeleton({
  className = '',
  fullPage = false,
}: AdminPageSkeletonProps) {
  const content = (
    <div
      className={`space-y-6 ${className}`}
      aria-busy="true"
      aria-label="Loading admin"
    >
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton height={28} width={220} borderRadius="0.375rem" />
          <SkeletonText width={260} />
        </div>
        <div className="flex gap-2">
          <Skeleton height={36} width={110} borderRadius="0.5rem" />
          <Skeleton height={36} width={120} borderRadius="0.5rem" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-3"
          >
            <SkeletonText width="45%" />
            <Skeleton height={28} width="40%" borderRadius="0.375rem" />
          </div>
        ))}
      </div>

      {/* Filters + table */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Skeleton height={36} width="100%" className="max-w-xs" borderRadius="0.5rem" />
        <Skeleton height={36} width={100} borderRadius="0.5rem" />
        <Skeleton height={36} width={100} borderRadius="0.5rem" />
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 bg-slate-50/80">
          <Skeleton height={12} width="20%" borderRadius="0.25rem" />
          <Skeleton height={12} width="14%" borderRadius="0.25rem" className="hidden sm:block" />
          <Skeleton height={12} width="12%" borderRadius="0.25rem" className="hidden md:block" />
          <Skeleton height={12} width="10%" borderRadius="0.25rem" className="hidden lg:block" />
          <Skeleton height={12} width={48} borderRadius="0.25rem" className="ml-auto" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3.5 border-b border-slate-50 last:border-0"
          >
            <div className="flex-1 space-y-1.5 min-w-0">
              <Skeleton height={14} width={`${50 + (i % 5) * 8}%`} borderRadius="0.25rem" />
              <Skeleton height={10} width={`${30 + (i % 3) * 8}%`} borderRadius="0.25rem" />
            </div>
            <Skeleton height={22} width={64} borderRadius="9999px" className="hidden sm:block" />
            <Skeleton height={14} width={72} borderRadius="0.25rem" className="hidden md:block" />
            <Skeleton height={28} width={72} borderRadius="0.5rem" />
          </div>
        ))}
      </div>
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen w-full bg-[#f8fafc] p-4 sm:p-6 lg:p-8 font-sans">
        <div className="max-w-7xl mx-auto">{content}</div>
      </div>
    );
  }

  return content;
}
