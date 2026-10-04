import React, { useState } from 'react';
import { cn } from '../../utils/cn';

export interface ProgressBarSegment {
  id?: string;
  label: string;
  value: number;
  color: string;
}

export interface ProgressBarProps {
  /** Array of progress segments */
  segments: ProgressBarSegment[];
  /** Optional custom total (defaults to sum of all positive segment values) */
  total?: number;
  /** Bar thickness tier */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show tooltips on segment hover */
  showTooltips?: boolean;
  /** Whether to show legend row under the bar */
  showLegend?: boolean;
  /** Additional container classes */
  className?: string;
  /** Testing identifier */
  testID?: string;
}

const HEIGHT_CLASSES = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

/**
 * ProgressBar - Multi-state segmented progress bar primitive for @digitalcanopy/ui.
 * Computes dynamic relative percentages without subpixel gaps, animates segment changes
 * with smooth spring physics, and supports interactive hover micro-tooltips and legends.
 */
export function ProgressBar({
  segments,
  total,
  size = 'md',
  showTooltips = true,
  showLegend = false,
  className,
  testID = 'canopy-progress-bar',
}: ProgressBarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const sum = segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const effectiveTotal = total !== undefined ? total : (sum > 0 ? sum : 100);
  // Cap/normalize visual total so segments never overflow 100% of track when sum > total
  const visualTotal = Math.max(effectiveTotal, sum);

  // Calculate percentages and visual offsets
  let cumulativeVisualOffset = 0;
  const computedSegments = segments.map((seg, idx) => {
    const rawVal = Math.max(0, seg.value);
    const visualPercentage = visualTotal > 0 ? (rawVal / visualTotal) * 100 : 0;
    const truthfulPercentage = effectiveTotal > 0 ? (rawVal / effectiveTotal) * 100 : 0;
    const centerPercentage = cumulativeVisualOffset + visualPercentage / 2;
    cumulativeVisualOffset += visualPercentage;
    return {
      ...seg,
      index: idx,
      visualPercentage,
      percentage: truthfulPercentage,
      centerPercentage,
    };
  });

  const hoveredSegment = hoveredIndex !== null ? computedSegments.find((s) => s.index === hoveredIndex) : null;

  return (
    <div data-testid={testID} className={cn('w-full flex flex-col gap-2', className)}>
      <div className="relative w-full">
        {/* Unclipped Tooltip Overlay Layer */}
        {showTooltips && hoveredSegment && hoveredSegment.visualPercentage > 0 && (
          <div
            role="tooltip"
            data-testid={`${testID}-tooltip-${hoveredSegment.index}`}
            style={{
              left: `${Math.min(95, Math.max(5, hoveredSegment.centerPercentage))}%`,
            }}
            className={cn(
              'absolute bottom-full mb-2 -translate-x-1/2 z-20 whitespace-nowrap pointer-events-none',
              'px-2 py-1 text-[11px] font-medium rounded-md shadow-lg',
              'bg-stone-900/95 border border-stone-700 text-stone-200 backdrop-blur-md'
            )}
          >
            <span className="font-semibold text-stone-100">{hoveredSegment.label}</span>
            <span className="text-stone-400 ml-1.5">
              {hoveredSegment.value} ({hoveredSegment.percentage.toFixed(1)}%)
            </span>
          </div>
        )}

        {/* Outer Track */}
        <div
          className={cn(
            'relative w-full flex items-stretch overflow-hidden rounded-full',
            'bg-stone-800/80 border border-stone-800',
            HEIGHT_CLASSES[size]
          )}
        >
          {computedSegments.map((segment) => {
            if (segment.visualPercentage <= 0) return null;

            const isHovered = hoveredIndex === segment.index;

            return (
              <div
                key={segment.id || segment.index}
                data-testid={`${testID}-segment-${segment.index}`}
                style={{
                  width: `${segment.visualPercentage}%`,
                  transition: 'width 350ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease-out',
                  backgroundColor: segment.color.startsWith('#') || segment.color.startsWith('rgb') ? segment.color : undefined,
                }}
                className={cn(
                  'relative h-full first:rounded-l-full last:rounded-r-full group cursor-pointer',
                  !segment.color.startsWith('#') && !segment.color.startsWith('rgb') ? segment.color : '',
                  isHovered && 'brightness-110'
                )}
                onMouseEnter={() => setHoveredIndex(segment.index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {computedSegments.map((seg) => (
            <div
              key={seg.id || seg.index}
              className="flex items-center gap-1.5 text-xs text-stone-400"
            >
              <span
                style={{
                  backgroundColor: seg.color.startsWith('#') || seg.color.startsWith('rgb') ? seg.color : undefined,
                }}
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  !seg.color.startsWith('#') && !seg.color.startsWith('rgb') ? seg.color : ''
                )}
              />
              <span className="font-medium text-stone-300">{seg.label}:</span>
              <span>{seg.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
