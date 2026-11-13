import type {
  CadenceAction,
  CadenceConfig,
  CadenceSessionState,
  SessionMetrics,
} from './types';

export const DEFAULT_CADENCE_CONFIG: CadenceConfig = {
  unitLimit: 15,
  mode: 'soft_prompt',
  cooldownMinutes: 20,
  enabledCategories: ['vocab', 'poll', 'puzzle', 'eye'],
  snoozeUnits: 5,
};

/**
 * Normalizes a partial Cadence configuration with safe defaults.
 */
export function resolveCadenceConfig(
  partial?: Partial<CadenceConfig>
): CadenceConfig {
  const unitLimit =
    typeof partial?.unitLimit === 'number' && Number.isFinite(partial.unitLimit)
      ? Math.max(1, Math.floor(partial.unitLimit))
      : DEFAULT_CADENCE_CONFIG.unitLimit;

  const cooldownMinutes =
    typeof partial?.cooldownMinutes === 'number' &&
    Number.isFinite(partial.cooldownMinutes)
      ? Math.max(0, partial.cooldownMinutes)
      : DEFAULT_CADENCE_CONFIG.cooldownMinutes;

  const mode = partial?.mode ?? DEFAULT_CADENCE_CONFIG.mode;
  const enabledCategories = Array.isArray(partial?.enabledCategories)
    ? [...partial.enabledCategories]
    : [...DEFAULT_CADENCE_CONFIG.enabledCategories];

  const snoozeUnits =
    typeof partial?.snoozeUnits === 'number' &&
    Number.isFinite(partial.snoozeUnits)
      ? Math.max(1, Math.floor(partial.snoozeUnits))
      : DEFAULT_CADENCE_CONFIG.snoozeUnits;

  return {
    unitLimit,
    mode,
    cooldownMinutes,
    enabledCategories,
    snoozeUnits,
  };
}

/**
 * Creates a fresh initial Cadence session state.
 */
export function createInitialSessionState(
  config?: Partial<CadenceConfig>,
  now: number = Date.now()
): CadenceSessionState {
  return {
    config: resolveCadenceConfig(config),
    unitsConsumed: 0,
    chapterIndex: 0,
    lastActiveTimestamp: now,
    isChapterComplete: false,
    cooldownStartedAt: null,
    cooldownUntil: null,
    snoozedUntilUnit: null,
  };
}

/**
 * Deterministically computes the remaining hard cooldown duration in milliseconds
 * from wall-clock timestamps (`now - cooldownStartedAt`).
 */
export function getCooldownRemainingMs(
  state: Pick<
    CadenceSessionState,
    'config' | 'isChapterComplete' | 'cooldownStartedAt' | 'cooldownUntil'
  >,
  now: number = Date.now()
): number {
  if (
    state.config.mode !== 'hard_cooldown' ||
    !state.isChapterComplete ||
    state.config.cooldownMinutes <= 0
  ) {
    return 0;
  }

  const totalCooldownMs = state.config.cooldownMinutes * 60 * 1000;

  if (typeof state.cooldownStartedAt === 'number') {
    const elapsedMs = Math.max(0, now - state.cooldownStartedAt);
    return Math.max(0, totalCooldownMs - elapsedMs);
  }

  if (typeof state.cooldownUntil === 'number') {
    return Math.max(0, state.cooldownUntil - now);
  }

  return 0;
}

/**
 * Deterministically computes the remaining hard cooldown duration in whole seconds.
 */
export function getCooldownRemainingSeconds(
  state: Pick<
    CadenceSessionState,
    'config' | 'isChapterComplete' | 'cooldownStartedAt' | 'cooldownUntil'
  >,
  now: number = Date.now()
): number {
  const remainingMs = getCooldownRemainingMs(state, now);
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/**
 * Returns true if the session is currently locked in an active hard cooldown window.
 */
export function isHardCooldownActive(
  state: Pick<
    CadenceSessionState,
    'config' | 'isChapterComplete' | 'cooldownStartedAt' | 'cooldownUntil'
  >,
  now: number = Date.now()
): boolean {
  return getCooldownRemainingMs(state, now) > 0;
}

/**
 * Extracts pure SessionMetrics from a full CadenceSessionState.
 */
export function selectSessionMetrics(
  state: CadenceSessionState
): SessionMetrics {
  return {
    unitsConsumed: state.unitsConsumed,
    chapterIndex: state.chapterIndex,
    lastActiveTimestamp: state.lastActiveTimestamp,
  };
}

/**
 * Pure reducer managing unit consumption, chapter boundary detection,
 * snooze extensions, deterministic wall-clock cooldown checks, and resets.
 */
export function cadenceReducer(
  state: CadenceSessionState,
  action: CadenceAction
): CadenceSessionState {
  const now = action.now ?? Date.now();

  switch (action.type) {
    case 'CONSUME_UNIT': {
      const amount =
        typeof action.amount === 'number' && Number.isFinite(action.amount)
          ? Math.max(1, Math.floor(action.amount))
          : 1;

      if (state.config.mode === 'disabled') {
        return {
          ...state,
          unitsConsumed: state.unitsConsumed + amount,
          lastActiveTimestamp: now,
          isChapterComplete: false,
          cooldownStartedAt: null,
          cooldownUntil: null,
        };
      }

      if (
        state.config.mode === 'hard_cooldown' &&
        isHardCooldownActive(state, now)
      ) {
        return state;
      }

      const nextUnits = state.unitsConsumed + amount;
      const effectiveLimit = state.snoozedUntilUnit ?? state.config.unitLimit;
      const reachedBoundary = nextUnits >= effectiveLimit;
      const isHard = state.config.mode === 'hard_cooldown';
      const totalCooldownMs = state.config.cooldownMinutes * 60 * 1000;

      const cooldownStartedAt =
        reachedBoundary && isHard && totalCooldownMs > 0
          ? (state.cooldownStartedAt ?? now)
          : null;

      const cooldownUntil =
        cooldownStartedAt !== null ? cooldownStartedAt + totalCooldownMs : null;

      return {
        ...state,
        unitsConsumed: nextUnits,
        lastActiveTimestamp: now,
        isChapterComplete: reachedBoundary,
        cooldownStartedAt,
        cooldownUntil,
      };
    }

    case 'COMPLETE_CHAPTER': {
      if (
        state.config.mode === 'hard_cooldown' &&
        isHardCooldownActive(state, now)
      ) {
        return state;
      }

      return {
        ...state,
        unitsConsumed: 0,
        chapterIndex: state.chapterIndex + 1,
        lastActiveTimestamp: now,
        isChapterComplete: false,
        cooldownStartedAt: null,
        cooldownUntil: null,
        snoozedUntilUnit: null,
      };
    }

    case 'SNOOZE_OFFRAMP': {
      if (state.config.mode === 'disabled') {
        return state;
      }

      if (
        state.config.mode === 'hard_cooldown' &&
        isHardCooldownActive(state, now)
      ) {
        return state;
      }

      const increment =
        typeof action.snoozeUnits === 'number' &&
        Number.isFinite(action.snoozeUnits)
          ? Math.max(1, Math.floor(action.snoozeUnits))
          : (state.config.snoozeUnits ?? 5);

      const baseUnits = Math.max(
        state.unitsConsumed,
        state.snoozedUntilUnit ?? state.config.unitLimit
      );

      return {
        ...state,
        isChapterComplete: false,
        cooldownStartedAt: null,
        cooldownUntil: null,
        snoozedUntilUnit: baseUnits + increment,
        lastActiveTimestamp: now,
      };
    }

    case 'RESET_SESSION': {
      return {
        ...state,
        unitsConsumed: 0,
        chapterIndex: 0,
        lastActiveTimestamp: now,
        isChapterComplete: false,
        cooldownStartedAt: null,
        cooldownUntil: null,
        snoozedUntilUnit: null,
      };
    }

    case 'HYDRATE_SESSION': {
      const { metrics } = action;
      const unitsConsumed =
        typeof metrics.unitsConsumed === 'number' &&
        Number.isFinite(metrics.unitsConsumed)
          ? Math.max(0, Math.floor(metrics.unitsConsumed))
          : state.unitsConsumed;

      const chapterIndex =
        typeof metrics.chapterIndex === 'number' &&
        Number.isFinite(metrics.chapterIndex)
          ? Math.max(0, Math.floor(metrics.chapterIndex))
          : state.chapterIndex;

      const lastActiveTimestamp =
        typeof metrics.lastActiveTimestamp === 'number' &&
        Number.isFinite(metrics.lastActiveTimestamp)
          ? metrics.lastActiveTimestamp
          : state.lastActiveTimestamp;

      const snoozedUntilUnit =
        metrics.snoozedUntilUnit !== undefined
          ? metrics.snoozedUntilUnit
          : state.snoozedUntilUnit;

      const effectiveLimit = snoozedUntilUnit ?? state.config.unitLimit;
      const isChapterComplete =
        state.config.mode === 'disabled'
          ? false
          : (metrics.isChapterComplete ?? unitsConsumed >= effectiveLimit);

      const cooldownStartedAt =
        metrics.cooldownStartedAt !== undefined
          ? metrics.cooldownStartedAt
          : state.cooldownStartedAt;

      const cooldownUntil =
        metrics.cooldownUntil !== undefined
          ? metrics.cooldownUntil
          : cooldownStartedAt !== null && state.config.mode === 'hard_cooldown'
            ? cooldownStartedAt + state.config.cooldownMinutes * 60 * 1000
            : null;

      return {
        ...state,
        unitsConsumed,
        chapterIndex,
        lastActiveTimestamp,
        isChapterComplete,
        cooldownStartedAt,
        cooldownUntil,
        snoozedUntilUnit,
      };
    }

    case 'UPDATE_CONFIG': {
      const nextConfig = resolveCadenceConfig({
        ...state.config,
        ...action.config,
      });
      const effectiveLimit = state.snoozedUntilUnit ?? nextConfig.unitLimit;
      const isChapterComplete =
        nextConfig.mode === 'disabled'
          ? false
          : state.unitsConsumed >= effectiveLimit;

      return {
        ...state,
        config: nextConfig,
        isChapterComplete,
      };
    }

    default:
      return state;
  }
}
