import React, { useState, type ReactNode } from 'react';
import { EyeBreakWidget } from '../widgets/builtins/EyeBreakWidget';
import type { CadenceWidgetDefinition } from '../widgets/registry';

export interface ChapterEndCardProps {
  /** Number of feed units reviewed in this chapter (default: 15). */
  unitsReviewed?: number;
  /** Zero-based or one-based chapter number for badge display. */
  chapterNumber?: number;
  /** Custom headline override. */
  headline?: string;
  /** Custom subtext override. */
  subtext?: string;
  /** Invoked when the user clicks 'Close App & Step Away' or 'Take a break'. */
  onStepAway?: () => void;
  /** Invoked when the user clicks 'Load next chapter' or 'Keep scrolling'. */
  onLoadNextChapter?: () => void;
  /** Invoked when the 20-20-20 optical reset completes. */
  onEyeResetComplete?: (payload?: Record<string, unknown>) => void;
  /** Optional micro-interaction widget definition or node to embed inside the card. */
  widget?: CadenceWidgetDefinition | null;
  /** Optional custom rendered widget node. */
  children?: ReactNode;
  /** Invoked when an embedded micro-widget completes. */
  onWidgetComplete?: (payload?: Record<string, unknown>) => void;
  /** Remaining hard cooldown seconds, if hard_cooldown policy is active. */
  cooldownRemainingSeconds?: number;
  /** Optional extra CSS class names. */
  className?: string;
}

/**
 * Standardized off-ramp completion card (`ChapterEndCard.tsx`) for `@digitalcanopy/cadence`.
 * Caps feed consumption, encourages stepping away, embeds a micro-interaction widget,
 * and offers a 20-20-20 optical recovery reset with zero layout shift.
 */
export function ChapterEndCard({
  unitsReviewed = 15,
  chapterNumber = 1,
  headline = 'Chapter Complete · Your Space is Preserved',
  subtext,
  onStepAway,
  onLoadNextChapter,
  onEyeResetComplete,
  widget,
  children,
  onWidgetComplete,
  cooldownRemainingSeconds = 0,
  className = '',
}: ChapterEndCardProps) {
  const [showEyeReset, setShowEyeReset] = useState(false);
  const [steppedAway, setSteppedAway] = useState(false);

  const resolvedSubtext =
    subtext ??
    `You have reviewed all ${unitsReviewed} active neighborhood updates. Your attention belongs to your life.`;

  const isCooldownLocked = cooldownRemainingSeconds > 0;
  const WidgetComponent = widget?.component;

  const handlePrimaryStepAway = () => {
    setSteppedAway(true);
    onStepAway?.();
  };

  return (
    <section
      aria-label={headline}
      data-testid="cadence-chapter-end-card"
      className={`w-full rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-slate-100 shadow-xl ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          data-testid="cadence-chapter-badge"
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-amber-300"
        >
          Chapter {chapterNumber} · {unitsReviewed} units reviewed
        </span>

        {isCooldownLocked && (
          <span
            data-testid="cadence-cooldown-pill"
            className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono text-xs text-slate-300"
          >
            Cooldown: {cooldownRemainingSeconds}s
          </span>
        )}
      </div>

      <h3 className="mt-4 text-xl font-semibold tracking-tight text-amber-200 sm:text-2xl">
        {headline}
      </h3>

      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        {resolvedSubtext}
      </p>

      {(WidgetComponent || children) && (
        <div
          data-testid="cadence-chapter-widget-slot"
          className="mt-4 min-h-[140px]"
        >
          {children ? (
            children
          ) : WidgetComponent ? (
            <WidgetComponent
              context={{
                chapterIndex: Math.max(0, chapterNumber - 1),
                unitsConsumed: unitsReviewed,
              }}
              onComplete={(payload) => {
                onWidgetComplete?.(payload);
              }}
            />
          ) : null}
        </div>
      )}

      {showEyeReset && (
        <div data-testid="cadence-chapter-eye-reset-slot" className="mt-4">
          <EyeBreakWidget
            onComplete={(payload) => {
              setShowEyeReset(false);
              onEyeResetComplete?.(payload);
            }}
            onDismiss={() => setShowEyeReset(false)}
          />
        </div>
      )}

      {steppedAway && (
        <p
          role="status"
          data-testid="cadence-step-away-confirmation"
          className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-200"
        >
          Session paused. Lock your screen and enjoy your offline time.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          data-testid="cadence-step-away-button"
          onClick={handlePrimaryStepAway}
          className="inline-flex items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/20 px-5 py-2.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/30"
        >
          Close App &amp; Step Away
        </button>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            data-testid="cadence-optical-reset-link"
            onClick={() => setShowEyeReset((prev) => !prev)}
            className="text-xs font-medium text-amber-300/90 underline hover:text-amber-200"
          >
            Take a 20-second eye reset
          </button>

          <button
            type="button"
            disabled={isCooldownLocked}
            data-testid="cadence-load-next-chapter-link"
            onClick={() => {
              if (!isCooldownLocked) {
                onLoadNextChapter?.();
              }
            }}
            className={`text-xs underline transition-colors ${
              isCooldownLocked
                ? 'cursor-not-allowed text-slate-600'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Load next chapter
          </button>
        </div>
      </div>
    </section>
  );
}

export default ChapterEndCard;
