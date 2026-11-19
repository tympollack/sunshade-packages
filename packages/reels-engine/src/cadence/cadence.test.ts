import { describe, it, expect, vi } from 'vitest';
import {
  CHAPTER_BOUNDARY_REACHED,
  ChapterCompleteError,
  ChapterSessionController,
  type ChapterBoundaryReachedEvent,
} from './index';
import { MemoryStubAdapter, StubVault } from '../vault';

describe('@digitalcanopy/reels-engine Cadence Bounded Session Chapters & Auto-Vault Off-Ramps', () => {
  it('defaults pullsPerChapter to 15, emits CHAPTER_BOUNDARY_REACHED, flushes unplayed high-stakes triggers to StubVault, and throws ChapterCompleteError on extra pulls', async () => {
    const adapter = new MemoryStubAdapter();
    const stubVault = new StubVault(adapter);

    const controller = new ChapterSessionController({
      matchId: 'match-cadence-01',
      cartridgeId: 'sector-smuggler',
      rootSeed: 'cadence-seed-alpha',
      stubVault,
      highStakesThreshold: 0.5, // ensure multiple high-stakes rolls occur
    });

    expect(controller.getPullsPerChapter()).toBe(15);
    expect(controller.getPullsRemaining()).toBe(15);

    const boundaryEvents: ChapterBoundaryReachedEvent[] = [];
    controller.onChapterBoundaryReached((ev) => boundaryEvents.push(ev));

    let playedHighStakesCount = 0;

    for (let i = 0; i < 15; i++) {
      const res = await controller.pullNextRoll(1_700_000_000_000 + i * 1000);

      // Simulate the player actively playing the very first high-stakes trigger,
      // while leaving subsequent high-stakes triggers unplayed so they auto-vault.
      if (res.roll.isHighStakes && playedHighStakesCount === 0) {
        controller.markHighStakesRollPlayed(res.roll.index);
        playedHighStakesCount++;
      }

      if (i < 14) {
        expect(res.isChapterBoundaryReached).toBe(false);
        expect(res.pullsRemaining).toBe(15 - (i + 1));
      } else {
        expect(res.isChapterBoundaryReached).toBe(true);
        expect(res.pullsRemaining).toBe(0);
        expect(res.boundaryEvent?.type).toBe(CHAPTER_BOUNDARY_REACHED);
        expect(res.salvageSummary).toBeDefined();
        expect(res.salvageSummary?.pullsCompleted).toBe(15);
      }
    }

    expect(boundaryEvents).toHaveLength(1);
    const summary = boundaryEvents[0].salvageSummary;
    const activeStubs = await stubVault.listActiveStubs();

    expect(activeStubs.length).toBe(summary.autoVaultedStubs.length);
    expect(summary.highStakesTriggeredCount - playedHighStakesCount).toBe(
      activeStubs.length
    );

    // Pulling past pullsPerChapter must throw ChapterCompleteError
    await expect(
      controller.pullNextRoll(1_700_000_020_000)
    ).rejects.toThrowError(ChapterCompleteError);

    // Explicitly acknowledge new chapter and verify pulling resumes cleanly
    controller.acknowledgeNewChapter(1_700_000_025_000);
    expect(controller.getChapterIndex()).toBe(1);
    expect(controller.getPullsRemaining()).toBe(15);

    const nextChapterPull = await controller.pullNextRoll(1_700_000_026_000);
    expect(nextChapterPull.chapterIndex).toBe(1);
    expect(nextChapterPull.roll.index).toBe(15);
    expect(nextChapterPull.pullsRemaining).toBe(14);
  });

  it('enforces optional cooldown timers between chapters', async () => {
    const startTime = 1_700_100_000_000;
    const controller = new ChapterSessionController(
      {
        matchId: 'match-cooldown',
        cartridgeId: 'sector-smuggler',
        rootSeed: 'cooldown-seed',
        pullsPerChapter: 3,
        cooldownMinutes: 10,
      },
      startTime
    );

    await controller.pullNextRoll(startTime + 1000);
    await controller.pullNextRoll(startTime + 2000);
    const boundaryPull = await controller.pullNextRoll(startTime + 3000);

    expect(boundaryPull.isChapterBoundaryReached).toBe(true);
    expect(controller.getCooldownRemainingMs(startTime + 3000)).toBe(
      10 * 60 * 1000
    );

    // Attempting to acknowledge before 10-minute cooldown expires throws ChapterCompleteError
    expect(() =>
      controller.acknowledgeNewChapter(startTime + 3000 + 5 * 60 * 1000)
    ).toThrowError(ChapterCompleteError);

    // After 10 minutes have elapsed, acknowledging the new chapter succeeds
    controller.acknowledgeNewChapter(startTime + 3000 + 10 * 60 * 1000);
    expect(controller.getChapterIndex()).toBe(1);
    expect(controller.getPullsRemaining()).toBe(3);
  });

  it('enforces optional daily chapter caps per user preference', async () => {
    const day1Time = Date.parse('2026-11-19T12:00:00.000Z');
    const controller = new ChapterSessionController(
      {
        matchId: 'match-daily-cap',
        cartridgeId: 'sector-smuggler',
        rootSeed: 'cap-seed',
        pullsPerChapter: 2,
        dailyChapterCap: 1,
      },
      day1Time
    );

    await controller.pullNextRoll(day1Time + 1000);
    const lastPull = await controller.pullNextRoll(day1Time + 2000);
    expect(lastPull.isChapterBoundaryReached).toBe(true);
    expect(controller.getChaptersCompletedToday(day1Time + 2000)).toBe(1);

    // Cannot acknowledge or pull another chapter on the same UTC day
    expect(() =>
      controller.acknowledgeNewChapter(day1Time + 3000)
    ).toThrowError(ChapterCompleteError);

    await expect(
      controller.pullNextRoll(day1Time + 4000)
    ).rejects.toThrowError(ChapterCompleteError);

    // Next UTC day unlocks the daily chapter cap
    const day2Time = Date.parse('2026-11-20T09:00:00.000Z');
    const unsub = controller.onChapterBoundaryReached(vi.fn());
    unsub();

    controller.acknowledgeNewChapter(day2Time);
    const day2Pull = await controller.pullNextRoll(day2Time + 1000);
    expect(day2Pull.chapterIndex).toBe(1);
    expect(day2Pull.pullsRemaining).toBe(1);
  });
});
