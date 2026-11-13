// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../core/storage';
import { EyeBreakWidget } from '../widgets/builtins/EyeBreakWidget';
import { PuzzleWidget } from '../widgets/builtins/PuzzleWidget';
import {
  VALERIE_POLL_STORAGE_KEY,
  ValeriePollWidget,
} from '../widgets/builtins/ValeriePollWidget';
import { VocabWidget } from '../widgets/builtins/VocabWidget';
import {
  getAllWidgets,
  getEnabledWidgets,
  getRandomWidget,
  registerWidget,
  resetWidgetRegistry,
} from '../widgets/registry';

describe('Cadence Widget Registry (TASK-CADENCE-REGISTRY-CONTRACT)', () => {
  afterEach(() => {
    resetWidgetRegistry(true);
  });

  it('pre-registers all 4 baseline widgets and filters by enabledCategories', () => {
    const all = getAllWidgets();
    expect(all.map((w) => w.id)).toEqual([
      'vocab-builder',
      'valerie-poll',
      'spatial-puzzle',
      'eye-break',
    ]);

    const onlyVocabAndEye = getEnabledWidgets(['vocab', 'eye']);
    expect(onlyVocabAndEye.map((w) => w.category)).toEqual(['vocab', 'eye']);

    expect(getEnabledWidgets([])).toEqual([]);
  });

  it('registers custom third-party widgets and selects deterministically via getRandomWidget', () => {
    const CustomWidget = ({ onComplete }: { onComplete: () => void }) => (
      <button type="button" onClick={() => onComplete()}>
        Custom
      </button>
    );

    registerWidget({
      id: 'breath-pacer',
      title: 'Box Breathing',
      category: 'custom',
      component: CustomWidget,
    });

    const picked = getRandomWidget(['custom'], () => 0);
    expect(picked?.id).toBe('breath-pacer');
  });
});

describe('Baseline Micro-Interaction Widgets (STORY-CADENCE-WIDGETS)', () => {
  it('VocabWidget renders word + 3 synonym choices and calls onComplete on correct tap', () => {
    const onComplete = vi.fn();
    render(
      <VocabWidget
        onComplete={onComplete}
        challenge={{
          id: 'test-vocab',
          word: 'Equanimity',
          partOfSpeech: 'noun',
          pronunciation: '/ˌiː.kwəˈnɪm.ɪ.ti/',
          contextHint: 'Calm composure under pressure.',
          options: ['Composure', 'Haste', 'Obscurity'],
          correctSynonym: 'Composure',
        }}
      />
    );

    expect(screen.getByText('Equanimity')).toBeInTheDocument();

    // Tap wrong choice first
    fireEvent.click(screen.getByText('Haste'));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId('vocab-feedback-retry')).toBeInTheDocument();

    // Tap correct choice
    fireEvent.click(screen.getByText('Composure'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetId: 'vocab-builder',
        word: 'Equanimity',
        selectedSynonym: 'Composure',
        correct: true,
      })
    );
  });

  it('ValeriePollWidget records anonymous local vote and calls onComplete', async () => {
    const onComplete = vi.fn();
    const memory = createMemoryStorage();

    render(
      <ValeriePollWidget
        onComplete={onComplete}
        storage={memory}
        poll={{
          id: 'poll-solar',
          topic: 'Energy Commons',
          question: 'Support rooftop community solar credits?',
          options: [
            { id: 'yes', label: 'Yes, prioritize rooftop solar' },
            { id: 'no', label: 'Defer to next cycle' },
          ],
        }}
      />
    );

    fireEvent.click(screen.getByTestId('valerie-poll-option-yes'));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetId: 'valerie-poll',
        pollId: 'poll-solar',
        optionId: 'yes',
        anonymous: true,
      })
    );

    const stored = JSON.parse(memory.getItem(VALERIE_POLL_STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      pollId: 'poll-solar',
      optionId: 'yes',
    });
  });

  it('PuzzleWidget completes in a single tap on the matching missing piece', () => {
    const onComplete = vi.fn();
    render(
      <PuzzleWidget
        onComplete={onComplete}
        puzzle={{
          id: 'puzzle-test',
          title: '90° Turn',
          sequence: ['↑', '→', '↓'],
          options: ['←', '↑', '↘'],
          correctPiece: '←',
        }}
      />
    );

    fireEvent.click(screen.getByTestId('puzzle-option-←'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetId: 'spatial-puzzle',
        puzzleId: 'puzzle-test',
        selectedPiece: '←',
        solved: true,
      })
    );
  });

  it('EyeBreakWidget renders 20s countdown and completes immediately via Done skip link', () => {
    const onComplete = vi.fn();
    render(
      <EyeBreakWidget
        onComplete={onComplete}
        durationSeconds={20}
        autoStart={false}
      />
    );

    expect(screen.getByTestId('eye-break-countdown')).toHaveTextContent('20s');

    fireEvent.click(screen.getByTestId('eye-break-done-link'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetId: 'eye-break',
        skipped: true,
      })
    );
  });
});
