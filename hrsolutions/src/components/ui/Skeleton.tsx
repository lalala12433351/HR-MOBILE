import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  borderRadius,
}) => {
  return (
    <div
      className={`animate-pulse bg-[#e2e8f0] ${className}`}
      style={{
        width,
        height,
        borderRadius,
      }}
    />
  );
};

interface SkeletonTextProps {
  className?: string;
  width?: string | number;
  lines?: number;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  className = '',
  width = '100%',
  lines = 1,
}) => {
  if (lines <= 1) {
    return (
      <Skeleton
        className={`h-3 ${className}`}
        width={width}
        borderRadius="0.25rem"
      />
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          width={i === lines - 1 && typeof width === 'string' ? '60%' : width}
          borderRadius="0.25rem"
        />
      ))}
    </div>
  );
};

interface SkeletonCircleProps {
  className?: string;
  size?: string | number;
}

export const SkeletonCircle: React.FC<SkeletonCircleProps> = ({
  className = '',
  size = 40,
}) => (
  <Skeleton
    className={`shrink-0 ${className}`}
    width={size}
    height={size}
    borderRadius="9999px"
  />
);

interface SkeletonAvatarProps {
  className?: string;
  size?: string | number;
}

export const SkeletonAvatar: React.FC<SkeletonAvatarProps> = ({
  className = '',
  size = 40,
}) => <SkeletonCircle className={className} size={size} />;
