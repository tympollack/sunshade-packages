import React, { useMemo, useState } from 'react';
import type { CadenceWidgetProps } from '../registry';

export interface SpatialPuzzleChallenge {
  id: string;
  title: string;
  sequence: readonly [string, string, string];
  options: readonly [string, string, string];
  correctPiece: string;
}

export const DEFAULT_PUZZLE_DECK: readonly SpatialPuzzleChallenge[] = [
  {
    id: 'puzzle-quarter-turn',
    title: '90° Clockwise Rotation',
    sequence: ['↑', '→', '↓'],
    options: ['←', '↑', '↘'],
    correctPiece: '←',
  },
  {
    id: 'puzzle-diagonal-orbit',
    title: 'Diagonal Compass Step',
    sequence: ['↖', '↗', '↘'],
    options: ['↙', '↖', '↓'],
    correctPiece: '↙',
  },
  {
    id: 'puzzle-phase-cycle',
    title: 'Geometric Symmetry',
    sequence: ['◐', '◓', '◑'],
    options: ['◒', '◐', '◯'],
    correctPiece: '◒',
  },
];

export interface PuzzleWidgetProps extends CadenceWidgetProps {
  /** Optional explicit spatial puzzle override for deterministic testing. */
  puzzle?: SpatialPuzzleChallenge;
}

/**
 * 3-Second Spatial Teaser Widget (`TASK-CADENCE-WIDGET-PUZZLE`).
 * Quick visual rotation / missing-piece pattern completion that resolves in a single tap.
 */
export function PuzzleWidget({
  onComplete,
  onDismiss,
  context,
  className = '',
  puzzle: explicitPuzzle,
}: PuzzleWidgetProps) {
  const activePuzzle = useMemo<SpatialPuzzleChallenge>(() => {
    if (explicitPuzzle) return explicitPuzzle;
    const idx =
      typeof context?.chapterIndex === 'number' && context.chapterIndex >= 0
        ? context.chapterIndex % DEFAULT_PUZZLE_DECK.length
        : 0;
    return DEFAULT_PUZZLE_DECK[idx];
  }, [explicitPuzzle, context?.chapterIndex]);

  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  const handleSelectPiece = (piece: string) => {
    setSelectedPiece(piece);
    if (piece === activePuzzle.correctPiece) {
      setSolved(true);
      onComplete({
        widgetId: 'spatial-puzzle',
        puzzleId: activePuzzle.id,
        selectedPiece: piece,
        solved: true,
      });
    }
  };

  return (
    <div
      data-testid="cadence-puzzle-widget"
      className={`rounded-2xl border border-slate-800 bg-slate-950/90 p-4 text-slate-100 shadow-lg ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
          3s Spatial Teaser · {activePuzzle.title}
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

      <p className="mt-2 text-xs text-slate-300">
        Tap the missing fourth piece to complete the spatial sequence:
      </p>

      <div
        aria-label="Spatial sequence"
        className="mt-3 grid grid-cols-4 gap-2 text-center"
      >
        {activePuzzle.sequence.map((glyph, index) => (
          <div
            key={`${activePuzzle.id}-seq-${index}`}
            className="flex h-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-lg font-bold text-slate-100"
          >
            {glyph}
          </div>
        ))}
        <div
          data-testid="puzzle-missing-slot"
          className={`flex h-11 items-center justify-center rounded-xl border border-dashed text-lg font-bold ${
            solved
              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
              : 'border-amber-400/60 bg-slate-900/60 text-amber-300'
          }`}
        >
          {solved ? activePuzzle.correctPiece : '?'}
        </div>
      </div>

      <div
        role="group"
        aria-label="Candidate pieces"
        className="mt-3 grid grid-cols-3 gap-2"
      >
        {activePuzzle.options.map((piece) => {
          const isPicked = selectedPiece === piece;
          const isMatch = isPicked && piece === activePuzzle.correctPiece;
          const isMismatch = isPicked && piece !== activePuzzle.correctPiece;

          return (
            <button
              key={piece}
              type="button"
              data-testid={`puzzle-option-${piece}`}
              onClick={() => handleSelectPiece(piece)}
              className={`flex h-10 items-center justify-center rounded-xl border text-base font-semibold transition-colors ${
                isMatch
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                  : isMismatch
                    ? 'border-rose-500/60 bg-rose-950/40 text-rose-200'
                    : 'border-slate-800 bg-slate-900/80 text-slate-100 hover:border-slate-700 hover:bg-slate-800'
              }`}
            >
              {piece}
            </button>
          );
        })}
      </div>

      {selectedPiece && !solved && (
        <p
          role="status"
          data-testid="puzzle-feedback-retry"
          className="mt-2 text-xs text-amber-300"
        >
          Try rotating one more step in the sequence.
        </p>
      )}
    </div>
  );
}

export default PuzzleWidget;
