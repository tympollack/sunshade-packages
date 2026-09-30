import React, { useState, useRef, useId, useMemo } from 'react';
import { cn } from '../../utils/cn';

export interface SparklineProps {
  /** Numerical telemetry data series */
  data: number[];
  /** Optional timestamps matching data points */
  timestamps?: string[];
  /** Stroke color for the Bézier curve (default '#38bdf8' / sky-400) */
  strokeColor?: string;
  /** Gradient fill color beneath curve (default matches strokeColor) */
  fillColor?: string;
  /** Fixed or responsive width (default '100%') */
  width?: number | string;
  /** Fixed height in pixels (default 80) */
  height?: number;
  /** Stroke width in pixels (default 2) */
  strokeWidth?: number;
  /** Show interactive hover tracker and value bubble (default true) */
  interactive?: boolean;
  /** Custom formatter for the displayed value */
  valueFormatter?: (val: number) => string;
  /** Additional container classes */
  className?: string;
  /** Testing identifier */
  testID?: string;
}

interface Point {
  x: number;
  y: number;
  value: number;
  index: number;
}

/**
 * Computes smooth cubic Bézier SVG path through an array of 2D points
 * using Catmull-Rom to Cubic Bézier spline conversion.
 */
function buildCubicBezierPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return path;
}

/**
 * Sparkline - Pure zero-dependency SVG telemetry sparkline primitive for @digitalcanopy/ui.
 * Renders smooth cubic Bézier spline curves with fading gradient fills, responsive viewBox scaling,
 * and pointer-tracking micro-tooltips (< 5KB bundle impact).
 */
export function Sparkline({
  data,
  timestamps,
  strokeColor = '#38bdf8',
  fillColor,
  width = '100%',
  height = 80,
  strokeWidth = 2,
  interactive = true,
  valueFormatter = (val: number) => val.toLocaleString(),
  className,
  testID = 'canopy-sparkline',
}: SparklineProps) {
  const gradientId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);

  const effectiveFillColor = fillColor || strokeColor;

  const VBW = 300;
  const VBH = 100;
  const padY = 12;

  const points = useMemo<Point[]>(() => {
    if (!data || data.length === 0) return [];

    let min = Math.min(...data);
    let max = Math.max(...data);

    if (min === max) {
      min -= 1;
      max += 1;
    }

    const range = max - min;
    const stepX = data.length > 1 ? VBW / (data.length - 1) : VBW / 2;

    return data.map((val, idx) => {
      const x = data.length > 1 ? idx * stepX : VBW / 2;
      const normalized = (val - min) / range;
      // Invert Y because SVG coordinate 0 is top
      const y = VBH - padY - normalized * (VBH - padY * 2);
      return { x, y, value: val, index: idx };
    });
  }, [data]);

  const linePath = useMemo(() => buildCubicBezierPath(points), [points]);

  const areaPath = useMemo(() => {
    if (points.length < 2) return '';
    const firstX = points[0].x.toFixed(2);
    const lastX = points[points.length - 1].x.toFixed(2);
    return `${linePath} L ${lastX} ${VBH} L ${firstX} ${VBH} Z`;
  }, [linePath, points]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || points.length === 0 || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const containerW = rect.width > 0 ? rect.width : (containerRef.current.offsetWidth || 300);
    const clientX = e.clientX ?? 0;
    const left = rect.left ?? 0;
    const relativeX = Math.max(0, Math.min(1, (clientX - left) / containerW));
    const targetIdx = Math.max(0, Math.min(points.length - 1, Math.round(relativeX * (points.length - 1))));

    setHoveredPoint(points[targetIdx]);
  };

  const handlePointerLeave = () => {
    setHoveredPoint(null);
  };

  return (
    <div
      ref={containerRef}
      data-testid={testID}
      onPointerMove={handlePointerMove}
      onMouseMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onMouseLeave={handlePointerLeave}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: `${height}px`,
      }}
      className={cn('relative select-none touch-none overflow-visible', className)}
    >
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        data-testid={`${testID}-svg`}
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={effectiveFillColor} stopOpacity="0.35" />
            <stop offset="80%" stopColor={effectiveFillColor} stopOpacity="0.05" />
            <stop offset="100%" stopColor={effectiveFillColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        {areaPath && (
          <path
            d={areaPath}
            fill={`url(#${gradientId})`}
            data-testid={`${testID}-area`}
          />
        )}

        {/* Bézier curve line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            data-testid={`${testID}-curve`}
          />
        )}

        {/* Hover vertical guide line & indicator dot */}
        {interactive && hoveredPoint && (
          <g>
            <line
              x1={hoveredPoint.x}
              y1={0}
              x2={hoveredPoint.x}
              y2={VBH}
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="4.5"
              fill={strokeColor}
              stroke="#1c1917"
              strokeWidth="2"
              data-testid={`${testID}-point`}
            />
          </g>
        )}
      </svg>

      {/* Floating Value Bubble */}
      {interactive && hoveredPoint && (
        <div
          role="tooltip"
          data-testid={`${testID}-tooltip`}
          style={{
            left: `${(hoveredPoint.x / VBW) * 100}%`,
            top: `${(hoveredPoint.y / VBH) * 100}%`,
          }}
          className={cn(
            'absolute -translate-x-1/2 -translate-y-[135%] z-20 pointer-events-none',
            'px-2 py-1 text-xs font-semibold rounded-md shadow-xl whitespace-nowrap',
            'bg-stone-900/95 border border-stone-700 text-stone-100 backdrop-blur-md'
          )}
        >
          <div>{valueFormatter(hoveredPoint.value)}</div>
          {timestamps && timestamps[hoveredPoint.index] && (
            <div className="text-[10px] text-stone-400 font-normal">
              {timestamps[hoveredPoint.index]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Sparkline;
