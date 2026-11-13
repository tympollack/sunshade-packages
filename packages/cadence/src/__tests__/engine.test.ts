// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  cadenceReducer,
  createInitialSessionState,
  getCooldownRemainingMs,
  getCooldownRemainingSeconds,
  isHardCooldownActive,
  resolveCadenceConfig,
} from '../core/machine';
import {
  createLocalStorageAdapter,
  createMemoryStorage,
  sanitizePersistedConfig,
  sanitizePersistedSession,
} from '../core/storage';
import { useCadenceSession } from '../hooks/useCadenceSession';

describe('Cadence Engine State Machine (TASK-CADENCE-ENGINE-TYPES & MACHINE)', () => {
  it('resolves default CadenceConfig values safely', () => {
    const config = resolveCadenceConfig({});
    expect(config.unitLimit).toBe(15);
    expect(config.mode).toBe('soft_prompt');
    expect(config.cooldownMinutes).toBe(20);
    expect(config.enabledCategories).toEqual(['vocab', 'poll', 'puzzle', 'eye']);
  });

  it('increments unitsConsumed on CONSUME_UNIT and marks chapter complete at unitLimit', () => {
    let state = createInitialSessionState({ unitLimit: 3, mode: 'soft_prompt' }, 1000);

    state = cadenceReducer(state, { type: 'CONSUME_UNIT', now: 1100 });
    expect(state.unitsConsumed).toBe(1);
    expect(state.isChapterComplete).toBe(false);
    expect(state.lastActiveTimestamp).toBe(1100);

    state = cadenceReducer(state, { type: 'CONSUME_UNIT', amount: 2, now: 1200 });
    expect(state.unitsConsumed).toBe(3);
    expect(state.isChapterComplete).toBe(true);
    expect(state.lastActiveTimestamp).toBe(1200);
  });

  it('advances chapterIndex and resets chapter units on COMPLETE_CHAPTER only after boundary is reached', () => {
    let state = createInitialSessionState({ unitLimit: 2, mode: 'soft_prompt' }, 1000);
    state = cadenceReducer(state, { type: 'CONSUME_UNIT', amount: 1, now: 1500 });

    // Premature COMPLETE_CHAPTER before reaching unitLimit is a no-op
    const premature = cadenceReducer(state, { type: 'COMPLETE_CHAPTER', now: 1600 });
    expect(premature.chapterIndex).toBe(0);
    expect(premature.unitsConsumed).toBe(1);

    state = cadenceReducer(state, { type: 'CONSUME_UNIT', amount: 1, now: 2000 });
    expect(state.isChapterComplete).toBe(true);

    state = cadenceReducer(state, { type: 'COMPLETE_CHAPTER', now: 3000 });
    expect(state.chapterIndex).toBe(1);
    expect(state.unitsConsumed).toBe(0);
    expect(state.isChapterComplete).toBe(false);
    expect(state.lastActiveTimestamp).toBe(3000);
  });

  it('extends threshold on SNOOZE_OFFRAMP in soft_prompt mode but blocks snooze in hard_cooldown mode', () => {
    let state = createInitialSessionState(
      { unitLimit: 5, mode: 'soft_prompt', snoozeUnits: 3 },
      1000
    );
    state = cadenceReducer(state, { type: 'CONSUME_UNIT', amount: 5, now: 1500 });
    expect(state.isChapterComplete).toBe(true);

    state = cadenceReducer(state, { type: 'SNOOZE_OFFRAMP', now: 1600 });
    expect(state.isChapterComplete).toBe(false);
    expect(state.snoozedUntilUnit).toBe(8);

    state = cadenceReducer(state, { type: 'CONSUME_UNIT', amount: 2, now: 1700 });
    expect(state.isChapterComplete).toBe(false);

    state = cadenceReducer(state, { type: 'CONSUME_UNIT', amount: 1, now: 1800 });
    expect(state.unitsConsumed).toBe(8);
    expect(state.isChapterComplete).toBe(true);

    // In hard_cooldown mode, SNOOZE_OFFRAMP before the boundary is also rejected
    let hardState = createInitialSessionState(
      { unitLimit: 5, mode: 'hard_cooldown', cooldownMinutes: 10 },
      1000
    );
    hardState = cadenceReducer(hardState, { type: 'CONSUME_UNIT', amount: 4, now: 1200 });
    hardState = cadenceReducer(hardState, { type: 'SNOOZE_OFFRAMP', snoozeUnits: 5, now: 1300 });
    expect(hardState.snoozedUntilUnit).toBeNull();
    hardState = cadenceReducer(hardState, { type: 'CONSUME_UNIT', amount: 1, now: 1400 });
    expect(hardState.isChapterComplete).toBe(true);
    expect(hardState.cooldownStartedAt).toBe(1400);
  });

  it('initializes cooldown timestamps when UPDATE_CONFIG transitions a completed chapter into hard_cooldown', () => {
    let state = createInitialSessionState(
      { unitLimit: 5, mode: 'soft_prompt', cooldownMinutes: 10 },
      1000
    );
    state = cadenceReducer(state, { type: 'CONSUME_UNIT', amount: 5, now: 2000 });
    expect(state.isChapterComplete).toBe(true);
    expect(state.cooldownStartedAt).toBeNull();

    state = cadenceReducer(state, {
      type: 'UPDATE_CONFIG',
      config: { mode: 'hard_cooldown', cooldownMinutes: 10 },
      now: 5000,
    });
    expect(state.isChapterComplete).toBe(true);
    expect(state.cooldownStartedAt).toBe(5000);
    expect(getCooldownRemainingSeconds(state, 5000)).toBe(600);
  });

  it('evaluates wall-clock deltas deterministically in hard_cooldown mode', () => {
    const startMs = 1_700_000_000_000;
    let state = createInitialSessionState(
      { unitLimit: 2, mode: 'hard_cooldown', cooldownMinutes: 10 },
      startMs
    );

    state = cadenceReducer(state, {
      type: 'CONSUME_UNIT',
      amount: 2,
      now: startMs + 5_000,
    });
    expect(state.isChapterComplete).toBe(true);
    expect(state.cooldownStartedAt).toBe(startMs + 5_000);

    // 3 minutes elapsed -> 7 minutes (420,000 ms / 420 s) remaining
    const threeMinutesLater = startMs + 5_000 + 3 * 60 * 1000;
    expect(getCooldownRemainingMs(state, threeMinutesLater)).toBe(420_000);
    expect(getCooldownRemainingSeconds(state, threeMinutesLater)).toBe(420);
    expect(isHardCooldownActive(state, threeMinutesLater)).toBe(true);

    // Attempting CONSUME_UNIT, SNOOZE_OFFRAMP, or COMPLETE_CHAPTER during active cooldown is blocked
    const blockedConsume = cadenceReducer(state, {
      type: 'CONSUME_UNIT',
      now: threeMinutesLater,
    });
    expect(blockedConsume.unitsConsumed).toBe(2);

    const blockedSnooze = cadenceReducer(state, {
      type: 'SNOOZE_OFFRAMP',
      now: threeMinutesLater,
    });
    expect(blockedSnooze.isChapterComplete).toBe(true);

    const blockedComplete = cadenceReducer(state, {
      type: 'COMPLETE_CHAPTER',
      now: threeMinutesLater,
    });
    expect(blockedComplete.chapterIndex).toBe(0);
    expect(blockedComplete.isChapterComplete).toBe(true);

    // 10 minutes elapsed -> cooldown expired (0 ms remaining)
    const tenMinutesLater = startMs + 5_000 + 10 * 60 * 1000;
    expect(getCooldownRemainingMs(state, tenMinutesLater)).toBe(0);
    expect(isHardCooldownActive(state, tenMinutesLater)).toBe(false);

    // COMPLETE_CHAPTER now succeeds and transitions to chapter 1
    const advanced = cadenceReducer(state, {
      type: 'COMPLETE_CHAPTER',
      now: tenMinutesLater,
    });
    expect(advanced.chapterIndex).toBe(1);
    expect(advanced.unitsConsumed).toBe(0);
    expect(advanced.isChapterComplete).toBe(false);
    expect(advanced.cooldownStartedAt).toBeNull();
  });

  it('resets all counters and cooldowns on RESET_SESSION', () => {
    let state = createInitialSessionState(
      { unitLimit: 2, mode: 'hard_cooldown', cooldownMinutes: 5 },
      1000
    );
    state = cadenceReducer(state, { type: 'CONSUME_UNIT', amount: 2, now: 2000 });
    expect(state.isChapterComplete).toBe(true);

    state = cadenceReducer(state, { type: 'RESET_SESSION', now: 3000 });
    expect(state.unitsConsumed).toBe(0);
    expect(state.chapterIndex).toBe(0);
    expect(state.isChapterComplete).toBe(false);
    expect(state.cooldownStartedAt).toBeNull();
    expect(state.lastActiveTimestamp).toBe(3000);
  });
});

describe('Local Zero-Knowledge Storage Adapter (TASK-CADENCE-ENGINE-STORAGE)', () => {
  it('persists and hydrates metrics and config locally while stripping unknown/PII keys', () => {
    const memory = createMemoryStorage();
    const adapter = createLocalStorageAdapter({
      keyPrefix: 'test:cadence',
      storage: memory,
    });

    const dirtySession = {
      unitsConsumed: 12,
      chapterIndex: 2,
      lastActiveTimestamp: 99_000,
      userId: 'secret-user-123',
      email: 'alice@example.com',
      ipAddress: '192.168.1.1',
    };

    const sanitized = sanitizePersistedSession(dirtySession);
    expect(sanitized).toEqual({
      unitsConsumed: 12,
      chapterIndex: 2,
      lastActiveTimestamp: 99_000,
    });
    expect('userId' in sanitized).toBe(false);

    adapter.saveMetrics(dirtySession);
    const loaded = adapter.loadMetrics();
    expect(loaded).toEqual({
      unitsConsumed: 12,
      chapterIndex: 2,
      lastActiveTimestamp: 99_000,
    });

    const rawJson = memory.getItem('test:cadence:metrics') ?? '';
    expect(rawJson).not.toContain('secret-user-123');
    expect(rawJson).not.toContain('alice@example.com');

    const cleanConfig = sanitizePersistedConfig({
      unitLimit: 20,
      mode: 'hard_cooldown',
      cooldownMinutes: 15,
      enabledCategories: ['vocab', 'eye'],
    });
    adapter.saveConfig(cleanConfig);
    expect(adapter.loadConfig()).toEqual(cleanConfig);

    adapter.clearAll();
    expect(adapter.loadMetrics()).toBeNull();
    expect(adapter.loadConfig()).toBeNull();
  });

  it('retains fallback snapshots when primary browser storage throws on setItem', () => {
    const throwingStore = {
      getItem: () => JSON.stringify({ unitsConsumed: 1, chapterIndex: 0, lastActiveTimestamp: 10 }),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };

    const adapter = createLocalStorageAdapter({
      keyPrefix: 'quota:test',
      storage: throwingStore,
    });

    adapter.saveMetrics({
      unitsConsumed: 15,
      chapterIndex: 0,
      lastActiveTimestamp: 500,
      isChapterComplete: true,
    });

    expect(adapter.loadMetrics()).toEqual({
      unitsConsumed: 15,
      chapterIndex: 0,
      lastActiveTimestamp: 500,
      isChapterComplete: true,
    });
  });
});

describe('useCadenceSession Consumer Hook (TASK-CADENCE-ENGINE-HOOK)', () => {
  it('registers actions, triggers chapter boundary, advances chapters, and persists config across remounts', () => {
    let clock = 10_000;
    const storage = createLocalStorageAdapter({
      keyPrefix: 'hook:test',
      storage: createMemoryStorage(),
    });
    const onChapterComplete = vi.fn();

    const { result, unmount } = renderHook(() =>
      useCadenceSession({
        unitLimit: 3,
        mode: 'soft_prompt',
        cooldownMinutes: 5,
        storage,
        now: () => clock,
        onChapterComplete,
      })
    );

    expect(result.current.currentCount).toBe(0);
    expect(result.current.limit).toBe(3);
    expect(result.current.isChapterComplete).toBe(false);
    expect(result.current.cooldownRemaining).toBe(0);

    act(() => {
      clock = 11_000;
      result.current.registerAction();
      result.current.registerAction();
    });
    expect(result.current.currentCount).toBe(2);
    expect(result.current.isChapterComplete).toBe(false);

    act(() => {
      clock = 12_000;
      result.current.registerAction();
    });
    expect(result.current.currentCount).toBe(3);
    expect(result.current.isChapterComplete).toBe(true);
    expect(onChapterComplete).toHaveBeenCalledTimes(1);

    act(() => {
      clock = 13_000;
      result.current.advanceChapter();
    });
    expect(result.current.chapterIndex).toBe(1);
    expect(result.current.currentCount).toBe(0);
    expect(result.current.isChapterComplete).toBe(false);

    // Remount without explicit config props: restores persisted unitLimit: 3 & chapterIndex: 1
    unmount();
    const remounted = renderHook(() =>
      useCadenceSession({
        storage,
        now: () => clock,
      })
    );
    expect(remounted.result.current.limit).toBe(3);
    expect(remounted.result.current.chapterIndex).toBe(1);

    act(() => {
      clock = 14_000;
      remounted.result.current.resetSession();
    });
    expect(remounted.result.current.chapterIndex).toBe(0);
    expect(remounted.result.current.currentCount).toBe(0);
  });
});
