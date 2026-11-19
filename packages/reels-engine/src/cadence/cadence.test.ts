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
      highStakesThreshold: 0.5,
    });

    expect(controller.getPullsPerChapter()).toBe(15);
    expect(controller.getPullsRemaining()).toBe(15);

    const boundaryEvents: ChapterBoundaryReachedEvent[] = [];
    controller.onChapterBoundaryReached((ev) => boundaryEvents.push(ev));

    let playedHighStakesCount = 0;

    for (let i = 0; i < 15; i++) {
      const res = await controller.pullNextRoll({
        now: 1_700_000_000_000 + i * 1000,
        markRollAsPlayed: i === 0,
      });

      if (res.roll.isHighStakes && i === 0) {
        playedHighStakesCount++;
      } else if (res.roll.isHighStakes && playedHighStakesCount === 0 && i < 14) {
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

  it('does not bank a high-stakes boundary roll when markRollAsPlayed is true', async () => {
    const stubVault = new StubVault(new MemoryStubAdapter());
    const controller = new ChapterSessionController({
      matchId: 'match-boundary-played',
      cartridgeId: 'sector-smuggler',
      rootSeed: 'seed-boundary-played',
      pullsPerChapter: 1,
      highStakesThreshold: 1,
      stubVault,
    });

    const res = await controller.pullNextRoll({
      now: 1_700_000_000_000,
      markRollAsPlayed: true,
    });
    expect(res.roll.isHighStakes).toBe(true);
    expect(res.isChapterBoundaryReached).toBe(true);
    expect(res.salvageSummary?.autoVaultedStubs).toHaveLength(0);
    expect(await stubVault.listActiveStubs()).toHaveLength(0);
  });

  it('retains pending bonuses and retries cleanly when storage fails on first or intermediate boundary writes', async () => {
    const baseAdapter = new MemoryStubAdapter();
    let callCount = 0;
    let shouldFailOnCall: number | null = 1; // Fail on the very first write

    const flakyAdapter = {
      putStub: async (stub: Parameters<typeof baseAdapter.putStub>[0]) => {
        callCount++;
        if (shouldFailOnCall !== null && callCount === shouldFailOnCall) {
          throw new Error('Transient disk write error');
        }
        return baseAdapter.putStub(stub);
      },
      listActiveStubs: (nowIso?: string) => baseAdapter.listActiveStubs(nowIso),
      markStubResolved: (
        id: string,
        res: Parameters<typeof baseAdapter.markStubResolved>[1]
      ) => baseAdapter.markStubResolved(id, res),
      purgeExpired: (nowIso?: string) => baseAdapter.purgeExpired(nowIso),
      getStub: (id: string) => baseAdapter.getStub(id),
    };

    const stubVault = new StubVault(flakyAdapter);
    const controller = new ChapterSessionController({
      matchId: 'match-flaky-flush',
      cartridgeId: 'sector-smuggler',
      rootSeed: 'flaky-seed',
      pullsPerChapter: 3,
      highStakesThreshold: 1, // All 3 pulls are high-stakes
      stubVault,
    });

    const events: ChapterBoundaryReachedEvent[] = [];
    controller.onChapterBoundaryReached((e) => events.push(e));

    await controller.pullNextRoll(1000);
    await controller.pullNextRoll(2000);

    // 3rd pull hits boundary and fails on 1st write
    await expect(controller.pullNextRoll(3000)).rejects.toThrow(
      /Transient disk write error/
    );
    expect(controller.hasPendingBoundaryFlush()).toBe(true);
    expect(events).toHaveLength(0);
    expect(controller.getChaptersCompletedToday(3000)).toBe(0);

    // Acknowledging while flush is pending throws FLUSH_PENDING
    expect(() => controller.acknowledgeNewChapter(3500)).toThrowError(
      ChapterCompleteError
    );

    // Next retry fails on the 2nd stub (intermediate write failure)
    callCount = 0;
    shouldFailOnCall = 2;
    await expect(controller.pullNextRoll(4000)).rejects.toThrow(
      /Transient disk write error/
    );
    expect(controller.hasPendingBoundaryFlush()).toBe(true);
    expect(events).toHaveLength(0);

    // Third retry succeeds and flushes the remaining 2 stubs without duplicating the 1st
    shouldFailOnCall = null;
    const recovered = await controller.pullNextRoll(5000);
    expect(recovered.isChapterBoundaryReached).toBe(true);
    expect(controller.hasPendingBoundaryFlush()).toBe(false);
    expect(events).toHaveLength(1);
    expect(controller.getChaptersCompletedToday(5000)).toBe(1);

    const active = await stubVault.listActiveStubs();
    expect(active).toHaveLength(3);
    expect(active.map((s) => s.rollIndex)).toEqual([0, 1, 2]);
  });

  it('serializes concurrent pullNextRoll calls so overlapping pulls cannot overrun pullsPerChapter', async () => {
    const controller = new ChapterSessionController({
      matchId: 'match-concurrency',
      cartridgeId: 'sector-smuggler',
      rootSeed: 'concurrency-seed',
      pullsPerChapter: 1,
    });

    const events: ChapterBoundaryReachedEvent[] = [];
    controller.onChapterBoundaryReached((e) => events.push(e));

    const results = await Promise.allSettled([
      controller.pullNextRoll(1000),
      controller.pullNextRoll(1000),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(controller.getChaptersCompletedToday(1000)).toBe(1);
  });

  it('supports boundaryMode: "disabled" without locking the session', async () => {
    const controller = new ChapterSessionController({
      matchId: 'match-disabled',
      cartridgeId: 'sector-smuggler',
      rootSeed: 'disabled-seed',
      pullsPerChapter: 1,
      boundaryMode: 'disabled',
    });

    const pull1 = await controller.pullNextRoll(1000);
    const pull2 = await controller.pullNextRoll(2000);
    const pull3 = await controller.pullNextRoll(3000);

    expect(pull1.isChapterBoundaryReached).toBe(false);
    expect(pull2.isChapterBoundaryReached).toBe(false);
    expect(pull3.isChapterBoundaryReached).toBe(false);
    expect(pull3.pullsConsumed).toBe(3);
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

    expect(() =>
      controller.acknowledgeNewChapter(startTime + 3000 + 5 * 60 * 1000)
    ).toThrowError(ChapterCompleteError);

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

    expect(() =>
      controller.acknowledgeNewChapter(day1Time + 3000)
    ).toThrowError(ChapterCompleteError);

    await expect(
      controller.pullNextRoll(day1Time + 4000)
    ).rejects.toThrowError(ChapterCompleteError);

    const day2Time = Date.parse('2026-11-20T09:00:00.000Z');
    const unsub = controller.onChapterBoundaryReached(vi.fn());
    unsub();

    controller.acknowledgeNewChapter(day2Time);
    const day2Pull = await controller.pullNextRoll(day2Time + 1000);
    expect(day2Pull.chapterIndex).toBe(1);
    expect(day2Pull.pullsRemaining).toBe(1);
  });
});
