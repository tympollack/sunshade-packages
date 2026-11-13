// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CozyFeedChapterCard,
  type CozyFeedChapterRow,
  injectCadenceChapterSlots,
  injectCozyChapterSlots,
  useCozyCadenceFeed,
} from '../adapters/cozy';
import { ChapterEndCard } from '../components/ChapterEndCard';
import { createLocalStorageAdapter, createMemoryStorage } from '../core/storage';

describe('ChapterEndCard & Cozy Feed Virtualization Adapter (STORY-CADENCE-ADAPTERS)', () => {
  it('slots a Cadence chapter card after every 15 feed items', () => {
    const posts = Array.from({ length: 32 }, (_, i) => ({
      id: `post-${i + 1}`,
      title: `Neighborhood Post ${i + 1}`,
    }));

    const rows = injectCozyChapterSlots(posts, {
      chapterInterval: 15,
      rng: () => 0,
    });

    expect(injectCadenceChapterSlots).toBe(injectCozyChapterSlots);

    // 32 posts + 2 chapter cards (after post 15 and post 30) = 34 rows
    expect(rows).toHaveLength(34);
    expect(rows[15]).toMatchObject({
      kind: 'cadence_chapter',
      chapterNumber: 1,
      afterItemIndex: 14,
      unitsInChapter: 15,
      totalUnitsConsumed: 15,
    });
    expect(rows[31]).toMatchObject({
      kind: 'cadence_chapter',
      chapterNumber: 2,
      afterItemIndex: 29,
      unitsInChapter: 15,
      totalUnitsConsumed: 30,
    });
  });

  it('renders ChapterEndCard with SunShade copy, step-away action, and 20-20-20 optical reset toggle', () => {
    const onStepAway = vi.fn();
    const onLoadNextChapter = vi.fn();

    render(
      <ChapterEndCard
        unitsReviewed={15}
        chapterNumber={1}
        onStepAway={onStepAway}
        onLoadNextChapter={onLoadNextChapter}
      />
    );

    expect(
      screen.getByText('Chapter Complete · Your Space is Preserved')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'You have reviewed all 15 active neighborhood updates. Your attention belongs to your life.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cadence-optical-reset-link'));
    expect(screen.getByTestId('cadence-eye-break-widget')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cadence-step-away-button'));
    expect(onStepAway).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('cadence-load-next-chapter-link'));
    expect(onLoadNextChapter).toHaveBeenCalledTimes(1);
  });

  it('renders CozyFeedChapterCard with cumulative session stats across chapters, widget, and Take a break vs Keep scrolling actions', () => {
    const onTakeBreak = vi.fn();
    const onKeepScrolling = vi.fn();
    const posts = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    const rows = injectCozyChapterSlots(posts, {
      chapterInterval: 15,
      rng: () => 0,
    });
    const chapter1Row = rows.find(
      (r): r is CozyFeedChapterRow =>
        r.kind === 'cadence_chapter' && r.chapterNumber === 1
    )!;

    const { rerender } = render(
      <CozyFeedChapterCard
        chapter={chapter1Row}
        metrics={{ unitsConsumed: 0, chapterIndex: 1, lastActiveTimestamp: 100 }}
        onTakeBreak={onTakeBreak}
        onKeepScrolling={onKeepScrolling}
      />
    );

    // Even when chapterIndex advanced to 1 and chapter-local unitsConsumed is 0, cumulative session total is 15
    expect(screen.getByTestId('cozy-chapter-session-stats')).toHaveTextContent(
      'Session total: 15 posts'
    );
    expect(screen.getByTestId('cadence-vocab-widget')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cozy-take-a-break-button'));
    expect(onTakeBreak).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByTestId('cozy-keep-scrolling-button'));
    expect(onKeepScrolling).toHaveBeenCalledWith(1);

    rerender(
      <CozyFeedChapterCard
        chapter={chapter1Row}
        metrics={{ unitsConsumed: 5, chapterIndex: 1, lastActiveTimestamp: 200 }}
      />
    );
    expect(screen.getByTestId('cozy-chapter-session-stats')).toHaveTextContent(
      'Session total: 20 posts'
    );
  });

  it('useCozyCadenceFeed gates subsequent chapters until chapter completion and advances on Keep scrolling', () => {
    const posts = Array.from({ length: 30 }, (_, i) => ({ id: `p-${i}` }));
    const storage = createLocalStorageAdapter({
      keyPrefix: 'cozy:test',
      storage: createMemoryStorage(),
    });

    const { result } = renderHook(() =>
      useCozyCadenceFeed(posts, {
        chapterInterval: 15,
        unitLimit: 20, // chapterInterval takes precedence so cards and session limit match
        storage,
        rng: () => 0,
      })
    );

    // Chapter 2 posts are gated while on Chapter 1 (15 posts + 1 chapter card = 16 rows)
    expect(result.current.rows).toHaveLength(16);
    expect(result.current.session.limit).toBe(15);

    // Premature Keep scrolling before completing 15 items is ignored
    act(() => {
      result.current.registerFeedItemView(10);
      result.current.handleKeepScrolling(1);
    });
    expect(result.current.session.chapterIndex).toBe(0);
    expect(result.current.session.currentCount).toBe(10);
    expect(result.current.rows).toHaveLength(16);

    // Finish remaining 5 items in Chapter 1
    act(() => {
      result.current.registerFeedItemView(5);
    });
    expect(result.current.session.isChapterComplete).toBe(true);

    act(() => {
      result.current.handleTakeBreak(1);
    });
    expect(result.current.isOnBreak).toBe(true);

    // Advance past Chapter 1 -> reveals Chapter 2 rows (32 total rows)
    act(() => {
      result.current.handleKeepScrolling(1);
    });
    expect(result.current.isOnBreak).toBe(false);
    expect(result.current.completedChapters).toEqual([1]);
    expect(result.current.session.chapterIndex).toBe(1);
    expect(result.current.rows).toHaveLength(32);
  });
});
