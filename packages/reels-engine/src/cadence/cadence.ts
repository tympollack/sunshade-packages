import {
  cadenceReducer,
  createInitialSessionState,
  getCooldownRemainingMs,
  isHardCooldownActive,
  type BoundaryPolicy,
  type CadenceSessionState,
} from '@digitalcanopy/cadence/core';
import type { BankedStub, DeterministicRoll } from '../types';
import { generateDeterministicRoll } from '../prng';
import { StubVault } from '../vault';

export const CHAPTER_BOUNDARY_REACHED = 'CHAPTER_BOUNDARY_REACHED' as const;

export type ChapterCompleteErrorCode =
  | 'CHAPTER_COMPLETE'
  | 'COOLDOWN_ACTIVE'
  | 'DAILY_CAP_REACHED'
  | 'FLUSH_PENDING';

/**
 * Thrown when a caller attempts to pull another roll after reaching `pullsPerChapter`
 * (or during an active cooldown / daily chapter cap / pending storage flush)
 * before acknowledging the chapter boundary.
 */
export class ChapterCompleteError extends Error {
  readonly code: ChapterCompleteErrorCode;
  readonly chapterIndex: number;
  readonly pullsPerChapter: number;
  readonly cooldownRemainingMs: number;

  constructor(
    message: string,
    details: {
      code?: ChapterCompleteErrorCode;
      chapterIndex: number;
      pullsPerChapter: number;
      cooldownRemainingMs?: number;
    }
  ) {
    super(message);
    this.name = 'ChapterCompleteError';
    this.code = details.code ?? 'CHAPTER_COMPLETE';
    this.chapterIndex = details.chapterIndex;
    this.pullsPerChapter = details.pullsPerChapter;
    this.cooldownRemainingMs = details.cooldownRemainingMs ?? 0;
    Object.setPrototypeOf(this, ChapterCompleteError.prototype);
  }
}

/**
 * Salvage summary returned when a bounded chapter concludes (`pullsRemaining === 0`).
 */
export interface ChapterSalvageSummary {
  matchId: string;
  cartridgeId: string;
  chapterIndex: number;
  pullsCompleted: number;
  highStakesTriggeredCount: number;
  autoVaultedStubs: BankedStub[];
  pausePromptMessage: string;
  cooldownUntil: number | null;
}

/**
 * Payload emitted with the `CHAPTER_BOUNDARY_REACHED` event.
 */
export interface ChapterBoundaryReachedEvent {
  type: typeof CHAPTER_BOUNDARY_REACHED;
  timestamp: number;
  chapterIndex: number;
  pullsConsumed: number;
  pullsPerChapter: number;
  salvageSummary: ChapterSalvageSummary;
}

export type ChapterEventListener = (
  event: ChapterBoundaryReachedEvent
) => void;

export interface ChapterSessionConfig {
  matchId: string;
  cartridgeId: string;
  rootSeed: string;
  /** Number of pulls per chapter (default: 15). */
  pullsPerChapter?: number;
  /** Boundary enforcement mode forwarded to @digitalcanopy/cadence (`soft_prompt` | `hard_cooldown` | `disabled`). */
  boundaryMode?: BoundaryPolicy;
  /** Optional cooldown duration in minutes between chapters (default: 0). */
  cooldownMinutes?: number;
  /** Optional daily cap on completed chapters per UTC calendar day. */
  dailyChapterCap?: number;
  /** Optional StubVault instance where unplayed high-stakes triggers are auto-vaulted at chapter end. */
  stubVault?: StubVault;
  /** Starting global roll index (default: 0). */
  initialRollIndex?: number;
  /** High-stakes trigger probability threshold for generated rolls (default: 0.25). */
  highStakesThreshold?: number;
}

export interface PullRollOptions {
  /**Timestamp override in epoch milliseconds (default: `Date.now()`). */
  now?: number;
  /**
   * When true, marks the pulled roll as immediately played by the caller so a
   * high-stakes boundary roll is not auto-vaulted as an unplayed bonus stub.
   */
  markRollAsPlayed?: boolean;
}

export interface PullRollResult {
  roll: DeterministicRoll;
  chapterIndex: number;
  pullsConsumed: number;
  pullsRemaining: number;
  isChapterBoundaryReached: boolean;
  boundaryEvent?: ChapterBoundaryReachedEvent;
  salvageSummary?: ChapterSalvageSummary;
}

function getUtcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Bounded chapter session governor integrating `@digitalcanopy/cadence` with
 * `@digitalcanopy/reels-engine` roll loops and automatic `StubVault` off-ramps.
 */
export class ChapterSessionController {
  private readonly matchId: string;
  private readonly cartridgeId: string;
  private readonly rootSeed: string;
  private readonly pullsPerChapter: number;
  private readonly cooldownMinutes: number;
  private readonly dailyChapterCap: number | null;
  private readonly stubVault?: StubVault;
  private readonly highStakesThreshold?: number;

  private cadenceState: CadenceSessionState;
  private nextRollIndex: number;
  private chapterPulls: DeterministicRoll[] = [];
  private playedHighStakesIndices = new Set<number>();
  private vaultedStubsByRollIndex = new Map<number, BankedStub>();
  private pendingBoundaryFlush = false;
  private lastBoundaryRoll: DeterministicRoll | null = null;
  private lastSalvageSummary: ChapterSalvageSummary | null = null;
  private listeners = new Set<ChapterEventListener>();
  private dailyChaptersCompletedByDay = new Map<string, number>();
  private pullQueue: Promise<unknown> = Promise.resolve();

  constructor(config: ChapterSessionConfig, now: number = Date.now()) {
    this.matchId = config.matchId;
    this.cartridgeId = config.cartridgeId;
    this.rootSeed = config.rootSeed;
    this.pullsPerChapter =
      typeof config.pullsPerChapter === 'number' &&
      Number.isFinite(config.pullsPerChapter)
        ? Math.max(1, Math.floor(config.pullsPerChapter))
        : 15;

    this.cooldownMinutes =
      typeof config.cooldownMinutes === 'number' &&
      Number.isFinite(config.cooldownMinutes)
        ? Math.max(0, config.cooldownMinutes)
        : 0;

    this.dailyChapterCap =
      typeof config.dailyChapterCap === 'number' &&
      Number.isFinite(config.dailyChapterCap) &&
      config.dailyChapterCap > 0
        ? Math.floor(config.dailyChapterCap)
        : null;

    this.stubVault = config.stubVault;
    this.highStakesThreshold = config.highStakesThreshold;
    this.nextRollIndex = Math.max(0, Math.floor(config.initialRollIndex ?? 0));

    const mode: BoundaryPolicy =
      config.boundaryMode ??
      (this.cooldownMinutes > 0 ? 'hard_cooldown' : 'soft_prompt');

    this.cadenceState = createInitialSessionState(
      {
        unitLimit: this.pullsPerChapter,
        mode,
        cooldownMinutes: this.cooldownMinutes,
      },
      now
    );
  }

  private runSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.pullQueue.then(fn, fn);
    this.pullQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /**
   * Subscribes to `CHAPTER_BOUNDARY_REACHED` events. Returns an unsubscribe function.
   */
  onChapterBoundaryReached(listener: ChapterEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Marks a high-stakes roll index as actively played during the chapter so it is
   * not treated as an unplayed trigger when flushing to `StubVault` at chapter end.
   */
  markHighStakesRollPlayed(rollIndex: number): void {
    this.playedHighStakesIndices.add(rollIndex);
    this.vaultedStubsByRollIndex.delete(rollIndex);
  }

  /**
   * Queues an external unplayed high-stakes roll into the current chapter buffer
   * so it will be flushed to `StubVault` when the chapter concludes.
   */
  queueUnplayedHighStakesRoll(roll: DeterministicRoll): void {
    if (!roll.isHighStakes) return;
    const exists = this.chapterPulls.some((r) => r.index === roll.index);
    if (!exists) {
      this.chapterPulls.push(roll);
    }
  }

  getCadenceState(): CadenceSessionState {
    return this.cadenceState;
  }

  getPullsPerChapter(): number {
    return this.pullsPerChapter;
  }

  getPullsConsumed(): number {
    return this.cadenceState.unitsConsumed;
  }

  getPullsRemaining(): number {
    if (this.cadenceState.config.mode === 'disabled') {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, this.pullsPerChapter - this.cadenceState.unitsConsumed);
  }

  getChapterIndex(): number {
    return this.cadenceState.chapterIndex;
  }

  isChapterComplete(): boolean {
    return this.cadenceState.isChapterComplete && !this.pendingBoundaryFlush;
  }

  hasPendingBoundaryFlush(): boolean {
    return this.pendingBoundaryFlush;
  }

  getCooldownRemainingMs(now: number = Date.now()): number {
    return getCooldownRemainingMs(this.cadenceState, now);
  }

  getChaptersCompletedToday(now: number = Date.now()): number {
    return this.dailyChaptersCompletedByDay.get(getUtcDayKey(now)) ?? 0;
  }

  getLastSalvageSummary(): ChapterSalvageSummary | null {
    return this.lastSalvageSummary;
  }

  /**
   * Retries or completes flushing unplayed high-stakes triggers to `StubVault` for
   * a chapter that has reached its pull limit, emitting `CHAPTER_BOUNDARY_REACHED`
   * and incrementing the daily chapter count exactly once when all writes succeed.
   */
  async flushPendingChapterBoundary(
    now: number = Date.now()
  ): Promise<PullRollResult> {
    return this.runSerialized(async () => {
      if (!this.pendingBoundaryFlush || !this.lastBoundaryRoll) {
        throw new Error(
          'No pending chapter boundary flush is awaiting completion.'
        );
      }
      return this.finalizeChapterBoundaryInternal(this.lastBoundaryRoll, now);
    });
  }

  private async finalizeChapterBoundaryInternal(
    boundaryRoll: DeterministicRoll,
    now: number
  ): Promise<PullRollResult> {
    const pullsConsumed = this.cadenceState.unitsConsumed;
    const unplayedHighStakes = this.chapterPulls.filter(
      (r) => r.isHighStakes && !this.playedHighStakesIndices.has(r.index)
    );

    if (this.stubVault) {
      for (const highStakesRoll of unplayedHighStakes) {
        if (this.vaultedStubsByRollIndex.has(highStakesRoll.index)) {
          continue;
        }
        const stub = await this.stubVault.bankRollStub({
          stubId: `stub:${this.matchId}:${this.cartridgeId}:${highStakesRoll.index}`,
          matchId: this.matchId,
          cartridgeId: this.cartridgeId,
          roll: highStakesRoll,
        });
        this.vaultedStubsByRollIndex.set(highStakesRoll.index, stub);
      }
    }

    const autoVaultedStubs = unplayedHighStakes
      .map((r) => this.vaultedStubsByRollIndex.get(r.index))
      .filter((s): s is BankedStub => Boolean(s));

    const totalHighStakes = this.chapterPulls.filter(
      (r) => r.isHighStakes
    ).length;

    const salvageSummary: ChapterSalvageSummary = {
      matchId: this.matchId,
      cartridgeId: this.cartridgeId,
      chapterIndex: this.cadenceState.chapterIndex,
      pullsCompleted: pullsConsumed,
      highStakesTriggeredCount: totalHighStakes,
      autoVaultedStubs,
      pausePromptMessage:
        autoVaultedStubs.length > 0
          ? `Chapter ${this.cadenceState.chapterIndex + 1} complete. ${autoVaultedStubs.length} unplayed bonus stub(s) safely vaulted. Take a breath or step away anytime.`
          : `Chapter ${this.cadenceState.chapterIndex + 1} complete (${pullsConsumed} pulls). Healthy off-ramp reached — pause or continue when ready.`,
      cooldownUntil: this.cadenceState.cooldownUntil,
    };

    this.pendingBoundaryFlush = false;
    this.lastSalvageSummary = salvageSummary;

    const dayKey = getUtcDayKey(now);
    this.dailyChaptersCompletedByDay.set(
      dayKey,
      (this.dailyChaptersCompletedByDay.get(dayKey) ?? 0) + 1
    );

    const boundaryEvent: ChapterBoundaryReachedEvent = {
      type: CHAPTER_BOUNDARY_REACHED,
      timestamp: now,
      chapterIndex: this.cadenceState.chapterIndex,
      pullsConsumed,
      pullsPerChapter: this.pullsPerChapter,
      salvageSummary,
    };

    for (const listener of this.listeners) {
      listener(boundaryEvent);
    }

    return {
      roll: boundaryRoll,
      chapterIndex: this.cadenceState.chapterIndex,
      pullsConsumed,
      pullsRemaining: 0,
      isChapterBoundaryReached: true,
      boundaryEvent,
      salvageSummary,
    };
  }

  /**
   * Executes a single deterministic roll pull within the bounded chapter.
   *
   * - Serializes concurrent calls so overlapping `pullNextRoll` invocations cannot overrun
   *   `pullsPerChapter` or duplicate chapter boundary finalization.
   * - If a previous boundary flush failed midway due to a transient storage error,
   *   calling `pullNextRoll` retries the pending boundary flush without generating an extra roll.
   * - Throws `ChapterCompleteError` if the current chapter has already completed its flush,
   *   if a cooldown timer is active, or if the user's `dailyChapterCap` has been reached.
   */
  async pullNextRoll(
    nowOrOptions: number | PullRollOptions = Date.now()
  ): Promise<PullRollResult> {
    const now =
      typeof nowOrOptions === 'number'
        ? nowOrOptions
        : (nowOrOptions.now ?? Date.now());
    const markRollAsPlayed =
      typeof nowOrOptions === 'object' &&
      nowOrOptions !== null &&
      nowOrOptions.markRollAsPlayed === true;

    return this.runSerialized(async () => {
      if (this.pendingBoundaryFlush && this.lastBoundaryRoll) {
        if (markRollAsPlayed) {
          this.markHighStakesRollPlayed(this.lastBoundaryRoll.index);
        }
        return this.finalizeChapterBoundaryInternal(this.lastBoundaryRoll, now);
      }

      const isDisabled = this.cadenceState.config.mode === 'disabled';

      if (!isDisabled && this.dailyChapterCap !== null) {
        const completedToday = this.getChaptersCompletedToday(now);
        if (completedToday >= this.dailyChapterCap) {
          throw new ChapterCompleteError(
            `Daily chapter cap of ${this.dailyChapterCap} reached for today.`,
            {
              code: 'DAILY_CAP_REACHED',
              chapterIndex: this.cadenceState.chapterIndex,
              pullsPerChapter: this.pullsPerChapter,
            }
          );
        }
      }

      if (
        !isDisabled &&
        (this.cadenceState.isChapterComplete ||
          this.cadenceState.unitsConsumed >= this.pullsPerChapter)
      ) {
        const cooldownMs = this.getCooldownRemainingMs(now);
        throw new ChapterCompleteError(
          `Chapter ${this.cadenceState.chapterIndex} is complete (${this.pullsPerChapter}/${this.pullsPerChapter} pulls). Acknowledge chapter boundary before pulling again.`,
          {
            code: cooldownMs > 0 ? 'COOLDOWN_ACTIVE' : 'CHAPTER_COMPLETE',
            chapterIndex: this.cadenceState.chapterIndex,
            pullsPerChapter: this.pullsPerChapter,
            cooldownRemainingMs: cooldownMs,
          }
        );
      }

      const rollIndex = this.nextRollIndex++;
      const roll = await generateDeterministicRoll(
        this.rootSeed,
        this.matchId,
        rollIndex,
        { highStakesThreshold: this.highStakesThreshold }
      );
      this.chapterPulls.push(roll);

      if (markRollAsPlayed && roll.isHighStakes) {
        this.playedHighStakesIndices.add(roll.index);
      }

      this.cadenceState = cadenceReducer(this.cadenceState, {
        type: 'CONSUME_UNIT',
        amount: 1,
        now,
      });

      const pullsConsumed = this.cadenceState.unitsConsumed;

      if (isDisabled) {
        return {
          roll,
          chapterIndex: this.cadenceState.chapterIndex,
          pullsConsumed,
          pullsRemaining: Number.POSITIVE_INFINITY,
          isChapterBoundaryReached: false,
        };
      }

      const pullsRemaining = Math.max(0, this.pullsPerChapter - pullsConsumed);
      const isBoundary =
        pullsRemaining === 0 || this.cadenceState.isChapterComplete;

      if (!isBoundary) {
        return {
          roll,
          chapterIndex: this.cadenceState.chapterIndex,
          pullsConsumed,
          pullsRemaining,
          isChapterBoundaryReached: false,
        };
      }

      this.pendingBoundaryFlush = true;
      this.lastBoundaryRoll = roll;
      return this.finalizeChapterBoundaryInternal(roll, now);
    });
  }

  /**
   * Explicitly acknowledges the completed chapter off-ramp and advances to the next chapter.
   * Throws `ChapterCompleteError` if a boundary storage flush is still pending, if a hard cooldown
   * window is active, or if the daily cap is reached.
   */
  acknowledgeNewChapter(now: number = Date.now()): CadenceSessionState {
    if (this.pendingBoundaryFlush) {
      throw new ChapterCompleteError(
        `Cannot acknowledge chapter ${this.cadenceState.chapterIndex} while unplayed bonus stubs are pending storage flush.`,
        {
          code: 'FLUSH_PENDING',
          chapterIndex: this.cadenceState.chapterIndex,
          pullsPerChapter: this.pullsPerChapter,
        }
      );
    }

    if (!this.cadenceState.isChapterComplete) {
      return this.cadenceState;
    }

    if (
      this.cadenceState.config.mode === 'hard_cooldown' &&
      isHardCooldownActive(this.cadenceState, now)
    ) {
      const remainingMs = this.getCooldownRemainingMs(now);
      throw new ChapterCompleteError(
        `Cannot start new chapter while cooldown timer is active (${Math.ceil(remainingMs / 1000)}s remaining).`,
        {
          code: 'COOLDOWN_ACTIVE',
          chapterIndex: this.cadenceState.chapterIndex,
          pullsPerChapter: this.pullsPerChapter,
          cooldownRemainingMs: remainingMs,
        }
      );
    }

    if (this.dailyChapterCap !== null) {
      const completedToday = this.getChaptersCompletedToday(now);
      if (completedToday >= this.dailyChapterCap) {
        throw new ChapterCompleteError(
          `Daily chapter cap of ${this.dailyChapterCap} reached for today.`,
          {
            code: 'DAILY_CAP_REACHED',
            chapterIndex: this.cadenceState.chapterIndex,
            pullsPerChapter: this.pullsPerChapter,
          }
        );
      }
    }

    this.cadenceState = cadenceReducer(this.cadenceState, {
      type: 'COMPLETE_CHAPTER',
      now,
    });
    this.chapterPulls = [];
    this.playedHighStakesIndices.clear();
    this.vaultedStubsByRollIndex.clear();
    this.lastBoundaryRoll = null;
    return this.cadenceState;
  }
}
