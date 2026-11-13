import React, { useMemo, useState } from 'react';
import { createMemoryStorage, type StorageLike } from '../../core/storage';
import type { CadenceWidgetProps } from '../registry';

export interface ValeriePollOption {
  id: string;
  label: string;
}

export interface ValeriePollQuestion {
  id: string;
  topic: string;
  question: string;
  options: readonly ValeriePollOption[];
}

export interface ValeriePollSubmission {
  pollId: string;
  optionId: string;
  timestamp: number;
}

export const VALERIE_POLL_STORAGE_KEY = 'sunshade:cadence:valerie-polls';

export const DEFAULT_VALERIE_POLL_DECK: readonly ValeriePollQuestion[] = [
  {
    id: 'valerie-poll-transit-priority',
    topic: 'Civic Infrastructure',
    question:
      'Should neighborhood micro-grants prioritize protected bike lanes or shaded bus shelters this quarter?',
    options: [
      { id: 'bike-lanes', label: 'Protected bike lanes' },
      { id: 'bus-shelters', label: 'Shaded bus shelters' },
      { id: 'equal-split', label: '50/50 split across wards' },
    ],
  },
  {
    id: 'valerie-poll-third-spaces',
    topic: 'Community Commons',
    question:
      'Would you support extending evening quiet reading hours at municipal branch libraries?',
    options: [
      { id: 'yes-extend', label: 'Yes, extend evening hours' },
      { id: 'keep-current', label: 'Keep current schedule' },
    ],
  },
  {
    id: 'valerie-poll-tool-library',
    topic: 'Mutual Aid',
    question:
      'Which shared resource would be most useful at a block-level lending hub?',
    options: [
      { id: 'garden-tools', label: 'Soil & garden equipment' },
      { id: 'repair-kits', label: 'Home & bike repair kits' },
      { id: 'emergency-power', label: 'Portable solar battery banks' },
    ],
  },
];

const fallbackMemoryStorage = createMemoryStorage();

function recordAnonymousPollVote(
  submission: ValeriePollSubmission,
  customStorage?: StorageLike | null
): void {
  const store: StorageLike =
    customStorage ??
    (typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : fallbackMemoryStorage);

  try {
    const raw = store.getItem(VALERIE_POLL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list: ValeriePollSubmission[] = Array.isArray(parsed) ? parsed : [];
    const next = [
      ...list.filter((entry) => entry.pollId !== submission.pollId),
      {
        pollId: submission.pollId,
        optionId: submission.optionId,
        timestamp: submission.timestamp,
      },
    ];
    store.setItem(VALERIE_POLL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore storage quota errors */
  }
}

export interface ValeriePollWidgetProps extends CadenceWidgetProps {
  /** Optional explicit poll question override. */
  poll?: ValeriePollQuestion;
  /** Optional zero-knowledge callback receiving only `{ pollId, optionId, timestamp }`. */
  onSubmitAnonymous?: (
    submission: ValeriePollSubmission
  ) => void | Promise<void>;
  /** Optional storage override for persisting local anonymous vote state. */
  storage?: StorageLike | null;
}

/**
 * Project Valerie One-Tap Poll Widget (`TASK-CADENCE-WIDGET-POLL`).
 * Embeds a randomized or chapter-indexed civic sentiment question with zero-knowledge local submission.
 */
export function ValeriePollWidget({
  onComplete,
  onDismiss,
  context,
  className = '',
  poll: explicitPoll,
  onSubmitAnonymous,
  storage,
}: ValeriePollWidgetProps) {
  const activePoll = useMemo<ValeriePollQuestion>(() => {
    if (explicitPoll) return explicitPoll;
    const idx =
      typeof context?.chapterIndex === 'number' && context.chapterIndex >= 0
        ? context.chapterIndex % DEFAULT_VALERIE_POLL_DECK.length
        : 0;
    return DEFAULT_VALERIE_POLL_DECK[idx];
  }, [explicitPoll, context?.chapterIndex]);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const handleVote = (optionId: string) => {
    if (selectedOptionId !== null) return;
    setSelectedOptionId(optionId);

    const submission: ValeriePollSubmission = {
      pollId: activePoll.id,
      optionId,
      timestamp: Date.now(),
    };

    recordAnonymousPollVote(submission, storage);
    void onSubmitAnonymous?.(submission);

    onComplete({
      widgetId: 'valerie-poll',
      pollId: activePoll.id,
      optionId,
      anonymous: true,
    });
  };

  return (
    <div
      data-testid="cadence-valerie-poll-widget"
      className={`rounded-2xl border border-slate-800 bg-slate-950/90 p-4 text-slate-100 shadow-lg ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
          Project Valerie · {activePoll.topic}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-slate-400 underline hover:text-slate-200"
          >
            Skip
          </button>
        )}
      </div>

      <h4 className="mt-2.5 text-sm font-semibold leading-snug text-slate-100">
        {activePoll.question}
      </h4>

      <div
        role="group"
        aria-label={activePoll.question}
        className="mt-3 flex flex-col gap-2"
      >
        {activePoll.options.map((opt) => {
          const isChosen = selectedOptionId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={selectedOptionId !== null}
              data-testid={`valerie-poll-option-${opt.id}`}
              onClick={() => {
                void handleVote(opt.id);
              }}
              className={`flex items-center justify-between rounded-xl border px-3.5 py-2 text-left text-xs font-medium transition-colors ${
                isChosen
                  ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                  : 'border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <span>{opt.label}</span>
              {isChosen && (
                <span className="text-[11px] font-semibold text-amber-300">
                  Recorded locally
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2.5 text-[11px] text-slate-400">
        Zero-knowledge civic pulse · No personal identifiers attached.
      </p>
    </div>
  );
}

export default ValeriePollWidget;
