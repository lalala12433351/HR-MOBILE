import React from 'react';
import { Skeleton, SkeletonText, SkeletonAvatar } from '@/components/ui/Skeleton';

interface ListFeedPageSkeletonProps {
  itemCount?: number;
  className?: string;
}

export function ListFeedPageSkeleton({
  itemCount = 6,
  className = '',
}: ListFeedPageSkeletonProps) {
  return (
    <div
      className={`space-y-5 ${className}`}
      aria-busy="true"
      aria-label="Loading feed"
    >
      {/* Title + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton height={28} width={180} borderRadius="0.375rem" />
          <SkeletonText width={220} />
        </div>
        <Skeleton height={36} width={130} borderRadius="0.5rem" />
      </div>

      {/* Filter / search */}
      <div className="flex gap-2">
        <Skeleton height={36} width="100%" className="max-w-sm" borderRadius="0.5rem" />
        <Skeleton height={36} width={88} borderRadius="0.5rem" />
      </div>

      {/* Feed items */}
      <div className="space-y-3">
        {Array.from({ length: itemCount }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--border-color)]/80 bg-[var(--bg-surface)] p-4 flex gap-3"
          >
            <SkeletonAvatar size={40} />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <Skeleton
                  height={16}
                  width={`${45 + (i % 4) * 10}%`}
                  borderRadius="0.25rem"
                />
                <Skeleton height={12} width={56} borderRadius="0.25rem" />
              </div>
              <SkeletonText lines={2} />
              <div className="flex gap-2 pt-1">
                <Skeleton height={22} width={64} borderRadius="9999px" />
                <Skeleton height={22} width={72} borderRadius="9999px" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
