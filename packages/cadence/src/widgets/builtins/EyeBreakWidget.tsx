import React, { useEffect, useRef, useState } from 'react';
import type { CadenceWidgetProps } from '../registry';

export interface EyeBreakWidgetProps extends CadenceWidgetProps {
  /** Countdown duration in seconds (default: 20 for the 20-20-20 optical rule). */
  durationSeconds?: number;
  /** Whether the countdown starts automatically on mount (default: true). */
  autoStart?: boolean;
}

/**
 * 20-20-20 Optical Reset Widget (`TASK-CADENCE-WIDGET-EYE`).
 * Low-luminance resting screen encouraging distance vision reset and posture relaxation,
 * with a 20-second breathing/vision timer and an immediate 'Done' skip link.
 */
export function EyeBreakWidget({
  onComplete,
  onDismiss,
  className = '',
  durationSeconds = 20,
  autoStart = true,
}: EyeBreakWidgetProps) {
  const initialTotal = Math.max(1, Math.floor(durationSeconds));
  const [secondsLeft, setSecondsLeft] = useState<number>(initialTotal);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!autoStart) return;
    if (secondsLeft <= 0) {
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current({
          widgetId: 'eye-break',
          durationSeconds: initialTotal,
          skipped: false,
        });
      }
      return;
    }

    const timer = setTimeout(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoStart, secondsLeft, initialTotal]);

  const handleDoneNow = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete({
      widgetId: 'eye-break',
      durationSeconds: initialTotal,
      secondsRemaining: secondsLeft,
      skipped: secondsLeft > 0,
    });
  };

  const progressPct = Math.min(
    100,
    Math.max(0, Math.round(((initialTotal - secondsLeft) / initialTotal) * 100))
  );

  const breathingCue =
    secondsLeft % 8 >= 4
      ? 'Inhale · Soften your gaze 20 feet away'
      : 'Exhale · Unclench your jaw and drop your shoulders';

  return (
    <div
      data-testid="cadence-eye-break-widget"
      className={`rounded-2xl border border-slate-800/90 bg-slate-950 p-5 text-slate-200 shadow-inner ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
          20-20-20 Optical Reset
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="eye-break-done-link"
            onClick={handleDoneNow}
            className="text-xs font-medium text-amber-300 underline hover:text-amber-200"
          >
            Done
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-slate-400 underline hover:text-slate-200"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center text-center">
        <div
          aria-live="polite"
          data-testid="eye-break-countdown"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-800 bg-slate-900/90 font-mono text-xl font-semibold text-amber-200"
        >
          {secondsLeft}s
        </div>

        <p className="mt-3 text-sm font-medium text-slate-100">
          {breathingCue}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Look at an object 20 feet away for 20 seconds to relax ciliary eye tension.
        </p>

        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-900"
        >
          <div
            className="h-full rounded-full bg-emerald-500/70 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default EyeBreakWidget;
