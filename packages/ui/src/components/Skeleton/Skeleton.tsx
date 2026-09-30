import React from 'react';
import { cn } from '../../utils/cn';

export interface SkeletonProps {
  /** Polymorphic shape variant */
  variant?: 'text' | 'circular' | 'rectangular';
  /** Explicit width dimension */
  width?: number | string;
  /** Explicit height dimension */
  height?: number | string;
  /** Whether shimmer animation is active (default true) */
  animate?: boolean;
  /** Additional classes */
  className?: string;
  /** Inline style overrides */
  style?: React.CSSProperties;
  /** Testing identifier */
  testID?: string;
}

const VARIANT_CLASSES = {
  text: 'rounded-md h-4 w-full my-1',
  circular: 'rounded-full shrink-0',
  rectangular: 'rounded-xl w-full',
};

/**
 * Skeleton - Polymorphic shimmer placeholder primitive for @digitalcanopy/ui.
 * Employs hardware-accelerated linear-gradient shimmer animation on stone-800/60 base
 * to prevent layout shifts during asynchronous state transitions.
 */
export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  animate = true,
  className,
  style,
  testID = 'canopy-skeleton',
}: SkeletonProps) {
  const inlineStyles: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  return (
    <>
      <style>{`
        @keyframes canopy-shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .canopy-shimmer-active {
          background: linear-gradient(
            90deg,
            rgba(41, 37, 36, 0.6) 0%,
            rgba(68, 64, 60, 0.4) 50%,
            rgba(41, 37, 36, 0.6) 100%
          );
          background-size: 200% 100%;
          animation: canopy-shimmer 1.8s infinite ease-in-out;
        }
      `}</style>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        data-testid={testID}
        style={inlineStyles}
        className={cn(
          'overflow-hidden select-none bg-stone-800/60',
          animate ? 'canopy-shimmer-active' : 'bg-stone-800/60',
          VARIANT_CLASSES[variant] || VARIANT_CLASSES.rectangular,
          className
        )}
      >
        <span className="sr-only">Loading...</span>
      </div>
    </>
  );
}

export default Skeleton;
