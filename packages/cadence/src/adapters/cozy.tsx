import React, { useCallback, useMemo, useState } from 'react';
import { ChapterEndCard } from '../components/ChapterEndCard';
import type {
  CadenceConfig,
  CadenceWidgetCategory,
  SessionMetrics,
} from '../core/types';
import {
  useCadenceSession,
  type UseCadenceSessionOptions,
  type UseCadenceSessionResult,
} from '../hooks/useCadenceSession';
import {
  getRandomWidget,
  type CadenceWidgetDefinition,
} from '../widgets/registry';

export const DEFAULT_COZY_CHAPTER_INTERVAL = 15;

export interface CozyFeedItemRow<T> {
  kind: 'feed_item';
  key: string;
  itemIndex: number;
  chapterNumber: number;
  item: T;
}

export interface CozyFeedChapterRow {
  kind: 'cadence_chapter';
  key: string;
  chapterNumber: number;
  afterItemIndex: number;
  unitsInChapter: number;
  totalUnitsConsumed: number;
  widget: CadenceWidgetDefinition | null;
}

export type CozyVirtualizedFeedRow<T> =
  | CozyFeedItemRow<T>
  | CozyFeedChapterRow;

export interface CozyFeedVirtualizerOptions<T> {
  /** Number of feed items per chapter before slotting a Cadence ChapterEndCard (default: 15). */
  chapterInterval?: number;
  /** Enabled widget categories for selecting the in-feed micro-interaction widget. */
  enabledCategories?: CadenceWidgetCategory[];
  /** Custom key extractor for feed items. */
  getItemKey?: (item: T, index: number) => string;
  /** Optional deterministic RNG (`() => number` in `[0, 1)`) for widget selection. */
  rng?: () => number;
}

/**
 * Slots a Cadence chapter card and randomized micro-widget into a Cozy post feed
 * after every `chapterInterval` (default: 15) items.
 */
export function injectCozyChapterSlots<T>(
  items: readonly T[],
  options: CozyFeedVirtualizerOptions<T> = {}
): CozyVirtualizedFeedRow<T>[] {
  const interval =
    typeof options.chapterInterval === 'number' &&
    Number.isFinite(options.chapterInterval) &&
    options.chapterInterval >= 1
      ? Math.floor(options.chapterInterval)
      : DEFAULT_COZY_CHAPTER_INTERVAL;

  const rows: CozyVirtualizedFeedRow<T>[] = [];

  for (let i = 0; i < items.length; i++) {
    const chapterNumber = Math.floor(i / interval) + 1;
    const item = items[i];
    const key = options.getItemKey
      ? options.getItemKey(item, i)
      : `cozy-feed-item-${i}`;

    rows.push({
      kind: 'feed_item',
      key,
      itemIndex: i,
      chapterNumber,
      item,
    });

    const consumedCount = i + 1;
    if (consumedCount % interval === 0) {
      const widget = getRandomWidget(options.enabledCategories, options.rng);
      rows.push({
        kind: 'cadence_chapter',
        key: `cozy-cadence-chapter-${chapterNumber}`,
        chapterNumber,
        afterItemIndex: i,
        unitsInChapter: interval,
        totalUnitsConsumed: consumedCount,
        widget,
      });
    }
  }

  return rows;
}

/** Alias for `injectCozyChapterSlots`. */
export const injectCadenceChapterSlots = injectCozyChapterSlots;

export interface CozyFeedChapterCardProps {
  /** Chapter row metadata produced by `injectCozyChapterSlots`. */
  chapter: CozyFeedChapterRow;
  /** Live session metrics from `useCadenceSession`. */
  metrics?: SessionMetrics;
  /** Remaining cooldown seconds when in `hard_cooldown` mode. */
  cooldownRemaining?: number;
  /** Invoked when the user chooses 'Take a break' (or 'Close App & Step Away'). */
  onTakeBreak?: (chapterNumber: number) => void;
  /** Invoked when the user chooses 'Keep scrolling' (or 'Load next chapter'). */
  onKeepScrolling?: (chapterNumber: number) => void;
  /** Invoked when the embedded micro-interaction widget completes. */
  onWidgetComplete?: (
    chapterNumber: number,
    payload?: Record<string, unknown>
  ) => void;
  className?: string;
}

/**
 * In-feed Cozy chapter break card displaying session stats, a randomized Cadence widget,
 * and explicit 'Take a break' vs 'Keep scrolling' actions.
 */
export function CozyFeedChapterCard({
  chapter,
  metrics,
  cooldownRemaining = 0,
  onTakeBreak,
  onKeepScrolling,
  onWidgetComplete,
  className = '',
}: CozyFeedChapterCardProps) {
  const [breakTaken, setBreakTaken] = useState(false);
  const [widgetCompleted, setWidgetCompleted] = useState(false);

  const unitsDisplay = metrics
    ? Math.max(
        chapter.totalUnitsConsumed,
        metrics.chapterIndex * chapter.unitsInChapter + metrics.unitsConsumed
      )
    : chapter.totalUnitsConsumed;
  const isLocked = cooldownRemaining > 0;

  return (
    <div
      data-testid={`cozy-chapter-card-${chapter.chapterNumber}`}
      className={`my-4 flex flex-col gap-3 ${className}`.trim()}
    >
      <div
        data-testid="cozy-chapter-session-stats"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-900/90 px-4 py-2 text-xs text-slate-300"
      >
        <span>
          Cozy Feed · Chapter {chapter.chapterNumber} ({chapter.unitsInChapter}{' '}
          posts in chapter)
        </span>
        <span className="font-mono text-amber-300">
          Session total: {unitsDisplay} posts
        </span>
      </div>

      <ChapterEndCard
        chapterNumber={chapter.chapterNumber}
        unitsReviewed={chapter.unitsInChapter}
        widget={chapter.widget}
        cooldownRemainingSeconds={cooldownRemaining}
        onStepAway={() => {
          setBreakTaken(true);
          onTakeBreak?.(chapter.chapterNumber);
        }}
        onLoadNextChapter={() => {
          onKeepScrolling?.(chapter.chapterNumber);
        }}
        onWidgetComplete={(payload) => {
          setWidgetCompleted(true);
          onWidgetComplete?.(chapter.chapterNumber, payload);
        }}
      />

      <div
        role="group"
        aria-label="Cozy chapter pacing actions"
        className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/90 px-4 py-3"
      >
        <button
          type="button"
          data-testid="cozy-take-a-break-button"
          onClick={() => {
            setBreakTaken(true);
            onTakeBreak?.(chapter.chapterNumber);
          }}
          className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/30"
        >
          Take a break
        </button>

        <div className="flex items-center gap-3">
          {widgetCompleted && (
            <span
              data-testid="cozy-widget-complete-pill"
              className="text-xs font-medium text-emerald-300"
            >
              Micro-break complete
            </span>
          )}
          {breakTaken && (
            <span
              data-testid="cozy-break-active-pill"
              className="text-xs font-medium text-amber-300"
            >
              Break active
            </span>
          )}
          <button
            type="button"
            disabled={isLocked}
            data-testid="cozy-keep-scrolling-button"
            onClick={() => {
              if (!isLocked) {
                onKeepScrolling?.(chapter.chapterNumber);
              }
            }}
            className={`rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
              isLocked
                ? 'cursor-not-allowed border-slate-800 bg-slate-900 text-slate-600'
                : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800'
            }`}
          >
            Keep scrolling
          </button>
        </div>
      </div>
    </div>
  );
}

export interface UseCozyCadenceFeedOptions<T>
  extends UseCadenceSessionOptions,
    CozyFeedVirtualizerOptions<T> {
  /** Optional callback when the user triggers 'Take a break'. */
  onTakeBreak?: (chapterNumber: number, metrics: SessionMetrics) => void;
  /** Optional callback when the user triggers 'Keep scrolling'. */
  onKeepScrolling?: (chapterNumber: number, metrics: SessionMetrics) => void;
}

export interface UseCozyCadenceFeedResult<T> {
  /** Virtualized feed rows gated to the current unlocked chapter. */
  rows: CozyVirtualizedFeedRow<T>[];
  /** Underlying `useCadenceSession` state and controllers. */
  session: UseCadenceSessionResult;
  /** Chapter numbers the user has consciously chosen to continue past. */
  completedChapters: number[];
  /** True when the user tapped 'Take a break'. */
  isOnBreak: boolean;
  /** Registers visibility/consumption of a feed item in the virtualizer. */
  registerFeedItemView: (amount?: number) => void;
  /** Handler for 'Take a break' action on a chapter card. */
  handleTakeBreak: (chapterNumber: number) => void;
  /** Handler for 'Keep scrolling' action on a chapter card. */
  handleKeepScrolling: (chapterNumber: number) => void;
}

/**
 * Integrates `useCadenceSession` with the Cozy feed virtualizer (`TASK-CADENCE-ADAPTER-COZY`).
 * Slots an in-feed chapter card after every 15 items (by default), gates subsequent chapters
 * until the current chapter is completed and advanced, and wires session actions.
 */
export function useCozyCadenceFeed<T>(
  items: readonly T[],
  options: UseCozyCadenceFeedOptions<T> = {}
): UseCozyCadenceFeedResult<T> {
  const explicitInterval =
    options.chapterInterval ?? options.unitLimit ?? options.config?.unitLimit;

  const normalizedExplicitInterval =
    typeof explicitInterval === 'number' &&
    Number.isFinite(explicitInterval) &&
    explicitInterval >= 1
      ? Math.floor(explicitInterval)
      : undefined;

  const sessionConfig: Partial<CadenceConfig> = {
    ...options.config,
    ...(normalizedExplicitInterval !== undefined
      ? { unitLimit: normalizedExplicitInterval }
      : {}),
    ...(options.mode !== undefined ? { mode: options.mode } : {}),
    ...(options.cooldownMinutes !== undefined
      ? { cooldownMinutes: options.cooldownMinutes }
      : {}),
    ...(options.enabledCategories !== undefined
      ? { enabledCategories: [...options.enabledCategories] }
      : {}),
  };

  const session = useCadenceSession({
    ...options,
    unitLimit: normalizedExplicitInterval,
    config: sessionConfig,
  });

  const effectiveInterval =
    normalizedExplicitInterval ??
    session.config.unitLimit ??
    DEFAULT_COZY_CHAPTER_INTERVAL;

  const [isOnBreak, setIsOnBreak] = useState(false);

  const allRows = useMemo(
    () =>
      injectCozyChapterSlots(items, {
        chapterInterval: effectiveInterval,
        enabledCategories: session.config.enabledCategories,
        getItemKey: options.getItemKey,
        rng: options.rng,
      }),
    [
      items,
      effectiveInterval,
      session.config.enabledCategories,
      options.getItemKey,
      options.rng,
    ]
  );

  // Gate feed rows by the current unlocked chapter so later chapters are not
  // accessible before completing the current chapter and any active hard cooldown.
  const maxAllowedChapter =
    session.mode === 'disabled'
      ? Number.POSITIVE_INFINITY
      : session.chapterIndex + 1;

  const rows = useMemo(
    () => allRows.filter((row) => row.chapterNumber <= maxAllowedChapter),
    [allRows, maxAllowedChapter]
  );

  const completedChapters = useMemo(
    () => Array.from({ length: session.chapterIndex }, (_, idx) => idx + 1),
    [session.chapterIndex]
  );

  const registerFeedItemView = useCallback(
    (amount = 1) => {
      session.registerAction(amount);
    },
    [session]
  );

  const handleTakeBreak = useCallback(
    (chapterNumber: number) => {
      setIsOnBreak(true);
      options.onTakeBreak?.(chapterNumber, session.metrics);
    },
    [options, session.metrics]
  );

  const handleKeepScrolling = useCallback(
    (chapterNumber: number) => {
      const activeChapterNumber = session.chapterIndex + 1;
      if (
        chapterNumber !== activeChapterNumber ||
        !session.isChapterComplete ||
        session.cooldownRemaining > 0
      ) {
        return;
      }
      setIsOnBreak(false);
      session.advanceChapter();
      options.onKeepScrolling?.(chapterNumber, session.metrics);
    },
    [options, session]
  );

  return {
    rows,
    session,
    completedChapters,
    isOnBreak,
    registerFeedItemView,
    handleTakeBreak,
    handleKeepScrolling,
  };
}
