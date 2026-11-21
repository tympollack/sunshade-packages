import React, { useMemo, useState } from 'react';
import {
  glassPresets,
  VARIANT_CONTRAST_TOKENS,
} from '@digitalcanopy/ui/tokens';
import type { CadenceWidgetProps } from '../registry';

export interface VocabChallenge {
  id: string;
  word: string;
  partOfSpeech: string;
  pronunciation: string;
  contextHint: string;
  options: readonly [string, string, string];
  correctSynonym: string;
}

export const DEFAULT_VOCAB_DECK: readonly VocabChallenge[] = [
  {
    id: 'vocab-equanimity',
    word: 'Equanimity',
    partOfSpeech: 'noun',
    pronunciation: '/ˌiː.kwəˈnɪm.ɪ.ti/',
    contextHint: 'Steady composure amid neighborhood noise and urgent headlines.',
    options: ['Composure', 'Haste', 'Obscurity'],
    correctSynonym: 'Composure',
  },
  {
    id: 'vocab-ephemeral',
    word: 'Ephemeral',
    partOfSpeech: 'adjective',
    pronunciation: '/ɪˈfem.ər.əl/',
    contextHint: 'Lasting for a very brief window, like morning mist over the porch.',
    options: ['Permanent', 'Fleeting', 'Resonant'],
    correctSynonym: 'Fleeting',
  },
  {
    id: 'vocab-alacrity',
    word: 'Alacrity',
    partOfSpeech: 'noun',
    pronunciation: '/əˈlæk.rə.ti/',
    contextHint: 'Brisk and cheerful readiness to step in and help a neighbor.',
    options: ['Hesitation', 'Eagerness', 'Solitude'],
    correctSynonym: 'Eagerness',
  },
  {
    id: 'vocab-perspicacious',
    word: 'Perspicacious',
    partOfSpeech: 'adjective',
    pronunciation: '/ˌpɜː.spɪˈkeɪ.ʃəs/',
    contextHint: 'Having a clear, discerning grasp of subtle civic details.',
    options: ['Discerning', 'Redundant', 'Tactile'],
    correctSynonym: 'Discerning',
  },
];

export interface VocabWidgetProps extends CadenceWidgetProps {
  /** Optional explicit vocabulary challenge override for deterministic rendering. */
  challenge?: VocabChallenge;
}

/**
 * VocabBuilder 3-Second Widget (`TASK-CADENCE-WIDGET-VOCAB`).
 * Single-tap word matching/synonym card built with Tailwind and `@digitalcanopy/ui` design tokens
 * with immediate positive reinforcement.
 */
export function VocabWidget({
  onComplete,
  onDismiss,
  context,
  className = '',
  challenge: explicitChallenge,
}: VocabWidgetProps) {
  const activeChallenge = useMemo<VocabChallenge>(() => {
    if (explicitChallenge) return explicitChallenge;
    const idx =
      typeof context?.chapterIndex === 'number' && context.chapterIndex >= 0
        ? context.chapterIndex % DEFAULT_VOCAB_DECK.length
        : 0;
    return DEFAULT_VOCAB_DECK[idx];
  }, [explicitChallenge, context?.chapterIndex]);

  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'correct' | 'retry'>('idle');

  const handleSelectChoice = (choice: string) => {
    setSelectedChoice(choice);
    if (choice === activeChallenge.correctSynonym) {
      setStatus('correct');
      onComplete({
        widgetId: 'vocab-builder',
        challengeId: activeChallenge.id,
        word: activeChallenge.word,
        selectedSynonym: choice,
        correct: true,
      });
    } else {
      setStatus('retry');
    }
  };

  return (
    <div
      data-testid="cadence-vocab-widget"
      className={`${glassPresets.cozy} flex flex-col gap-3 border border-slate-800 bg-slate-950/90 p-5 text-slate-100 ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${VARIANT_CONTRAST_TOKENS.amber.borderStrokeClass} ${VARIANT_CONTRAST_TOKENS.amber.surfaceTintClass} text-amber-300`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          3s Vocab Builder
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

      <div>
        <div className="flex items-baseline gap-2">
          <h4 className="text-lg font-semibold tracking-tight text-amber-200">
            {activeChallenge.word}
          </h4>
          <span className="text-xs italic text-slate-400">
            {activeChallenge.partOfSpeech} · {activeChallenge.pronunciation}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-300">
          {activeChallenge.contextHint}
        </p>
      </div>

      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        Tap the closest synonym:
      </p>

      <div
        role="group"
        aria-label={`Synonyms for ${activeChallenge.word}`}
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {activeChallenge.options.map((choice) => {
          const isSelected = selectedChoice === choice;
          const isCorrect =
            isSelected && choice === activeChallenge.correctSynonym;
          const isWrong =
            isSelected && choice !== activeChallenge.correctSynonym;

          const stateClasses = isCorrect
            ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
            : isWrong
              ? 'border-rose-400/60 bg-rose-950/40 text-rose-200'
              : `${VARIANT_CONTRAST_TOKENS.slate.borderStrokeClass} ${VARIANT_CONTRAST_TOKENS.slate.surfaceTintClass} text-slate-100 hover:border-amber-500/40 hover:bg-slate-900`;

          return (
            <button
              key={choice}
              type="button"
              onClick={() => handleSelectChoice(choice)}
              data-testid={`vocab-choice-${choice.toLowerCase()}`}
              className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-150 ${stateClasses}`}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {status === 'correct' && (
        <p
          role="status"
          data-testid="vocab-feedback-correct"
          className="text-xs font-medium text-emerald-300"
        >
          Spot on — &ldquo;{activeChallenge.correctSynonym}&rdquo; matches{' '}
          {activeChallenge.word.toLowerCase()}.
        </p>
      )}

      {status === 'retry' && (
        <p
          role="status"
          data-testid="vocab-feedback-retry"
          className="text-xs text-amber-300"
        >
          Not quite &ldquo;{selectedChoice}&rdquo; — try another synonym.
        </p>
      )}
    </div>
  );
}

export default VocabWidget;
