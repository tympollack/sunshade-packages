import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  cadenceReducer,
  createInitialSessionState,
  getCooldownRemainingSeconds,
  selectSessionMetrics,
} from '../core/machine';
import {
  createLocalStorageAdapter,
  type CadenceStorageAdapter,
} from '../core/storage';
import type {
  BoundaryPolicy,
  CadenceConfig,
  SessionMetrics,
  WidgetEventCallbacks,
} from '../core/types';

export interface UseCadenceSessionOptions
  extends Partial<CadenceConfig>,
    WidgetEventCallbacks {
  /** Optional nested config object (merged with top-level config fields). */
  config?: Partial<CadenceConfig>;
  /** Custom zero-knowledge storage adapter (defaults to LocalStorage adapter). */
  storage?: CadenceStorageAdapter | null;
  /** Storage key prefix when using default LocalStorage adapter. */
  storageKeyPrefix?: string;
  /** Disable automatic persistence when false (default: true). */
  persist?: boolean;
  /** Deterministic clock provider for testing wall-clock cooldowns. */
  now?: () => number;
}

export interface UseCadenceSessionResult {
  /** Units consumed in the current chapter. */
  currentCount: number;
  /** Active chapter unit limit (accounts for snooze extension if active). */
  limit: number;
  /** True when the user has reached the chapter threshold. */
  isChapterComplete: boolean;
  /** Remaining hard cooldown time in whole seconds (0 when not in hard cooldown). */
  cooldownRemaining: number;
  /** Zero-based chapter index for the current session. */
  chapterIndex: number;
  /** Active boundary enforcement mode. */
  mode: BoundaryPolicy;
  /** Resolved Cadence configuration. */
  config: CadenceConfig;
  /** Current zero-knowledge session metrics snapshot. */
  metrics: SessionMetrics;
  /** Registers consumption of 1 (or `amount`) content units. */
  registerAction: (amount?: number) => void;
  /** Completes the current chapter break and advances to the next chapter. */
  advanceChapter: () => void;
  /** Snoozes a soft prompt off-ramp by `snoozeUnits` units. */
  snoozeOfframp: (snoozeUnits?: number) => void;
  /** Resets session counters and cooldown state back to zero. */
  resetSession: () => void;
}

function extractConfigFromOptions(
  options?: UseCadenceSessionOptions
): Partial<CadenceConfig> {
  if (!options) return {};
  const merged: Partial<CadenceConfig> = {
    ...(options.config ?? {}),
  };
  if (options.unitLimit !== undefined) merged.unitLimit = options.unitLimit;
  if (options.mode !== undefined) merged.mode = options.mode;
  if (options.cooldownMinutes !== undefined) {
    merged.cooldownMinutes = options.cooldownMinutes;
  }
  if (options.enabledCategories !== undefined) {
    merged.enabledCategories = options.enabledCategories;
  }
  if (options.snoozeUnits !== undefined) {
    merged.snoozeUnits = options.snoozeUnits;
  }
  return merged;
}

function hasExplicitConfigFields(config: Partial<CadenceConfig>): boolean {
  return (
    config.unitLimit !== undefined ||
    config.mode !== undefined ||
    config.cooldownMinutes !== undefined ||
    config.enabledCategories !== undefined ||
    config.snoozeUnits !== undefined
  );
}

/**
 * React consumer hook providing unit registration, chapter threshold status,
 * deterministic cooldown tracking, and local zero-knowledge persistence.
 */
export function useCadenceSession(
  options?: UseCadenceSessionOptions
): UseCadenceSessionResult {
  const persistEnabled = options?.persist !== false;
  const getNow = useRef(options?.now ?? (() => Date.now()));
  getNow.current = options?.now ?? (() => Date.now());

  const storageAdapter = useMemo<CadenceStorageAdapter | null>(() => {
    if (!persistEnabled || options?.storage === null) {
      return null;
    }
    return (
      options?.storage ??
      createLocalStorageAdapter({ keyPrefix: options?.storageKeyPrefix })
    );
  }, [persistEnabled, options?.storage, options?.storageKeyPrefix]);

  const explicitConfig = extractConfigFromOptions(options);
  const hasExplicitConfig = hasExplicitConfigFields(explicitConfig);

  const [state, dispatch] = useReducer(
    cadenceReducer,
    undefined,
    () => {
      const storedConfig = storageAdapter?.loadConfig() ?? {};
      const initial = createInitialSessionState(
        { ...storedConfig, ...explicitConfig },
        getNow.current()
      );
      const storedMetrics = storageAdapter?.loadMetrics();
      if (!storedMetrics) {
        return initial;
      }
      return cadenceReducer(initial, {
        type: 'HYDRATE_SESSION',
        metrics: storedMetrics,
        now: getNow.current(),
      });
    }
  );

  const [, setTick] = useState(0);
  const hydratedAdapterRef = useRef<CadenceStorageAdapter | null>(storageAdapter);
  const adapterChangedThisRender = hydratedAdapterRef.current !== storageAdapter;
  const prevCompleteRef = useRef(state.isChapterComplete);

  // Re-hydrate from the new storageAdapter when switching apps/namespaces without unmounting,
  // before any persistence effects run so previous app state never overwrites the new namespace.
  useEffect(() => {
    if (!adapterChangedThisRender) return;
    hydratedAdapterRef.current = storageAdapter;
    const now = getNow.current();
    const storedConfig = storageAdapter?.loadConfig() ?? {};
    const mergedInitialConfig = { ...storedConfig, ...explicitConfig };
    const storedMetrics = storageAdapter?.loadMetrics();
    const nextInitial = createInitialSessionState(mergedInitialConfig, now);
    const nextHydrated = storedMetrics
      ? cadenceReducer(nextInitial, {
          type: 'HYDRATE_SESSION',
          metrics: storedMetrics,
          now,
        })
      : nextInitial;
    prevCompleteRef.current = nextHydrated.isChapterComplete;

    dispatch({
      type: 'RESET_SESSION',
      config: mergedInitialConfig,
      now,
    });
    if (storedMetrics) {
      dispatch({
        type: 'HYDRATE_SESSION',
        metrics: storedMetrics,
        now,
      });
    }
  }, [adapterChangedThisRender, storageAdapter]);

  // Sync config updates if caller changes unitLimit, mode, cooldownMinutes, or enabledCategories
  const categoriesKey = explicitConfig.enabledCategories?.join(',') ?? '';
  useEffect(() => {
    if (adapterChangedThisRender) return;
    if (hasExplicitConfig) {
      dispatch({
        type: 'UPDATE_CONFIG',
        config: explicitConfig,
        now: getNow.current(),
      });
    }
  }, [
    adapterChangedThisRender,
    hasExplicitConfig,
    explicitConfig.unitLimit,
    explicitConfig.mode,
    explicitConfig.cooldownMinutes,
    explicitConfig.snoozeUnits,
    categoriesKey,
  ]);

  // Persist explicit config preferences locally when provided or changed
  const stateCategoriesKey = state.config.enabledCategories.join(',');
  useEffect(() => {
    if (adapterChangedThisRender || !storageAdapter || !hasExplicitConfig) return;
    storageAdapter.saveConfig(state.config);
  }, [
    adapterChangedThisRender,
    storageAdapter,
    hasExplicitConfig,
    state.config.unitLimit,
    state.config.mode,
    state.config.cooldownMinutes,
    state.config.snoozeUnits,
    stateCategoriesKey,
  ]);

  // Persist metrics snapshot locally on change
  useEffect(() => {
    if (adapterChangedThisRender || !storageAdapter) return;
    storageAdapter.saveMetrics({
      unitsConsumed: state.unitsConsumed,
      chapterIndex: state.chapterIndex,
      lastActiveTimestamp: state.lastActiveTimestamp,
      isChapterComplete: state.isChapterComplete,
      cooldownStartedAt: state.cooldownStartedAt,
      cooldownUntil: state.cooldownUntil,
      snoozedUntilUnit: state.snoozedUntilUnit,
    });
  }, [
    adapterChangedThisRender,
    storageAdapter,
    state.unitsConsumed,
    state.chapterIndex,
    state.lastActiveTimestamp,
    state.isChapterComplete,
    state.cooldownStartedAt,
    state.cooldownUntil,
    state.snoozedUntilUnit,
  ]);

  // Trigger onChapterComplete callback when transitioning from false -> true
  const onChapterCompleteRef = useRef(options?.onChapterComplete);
  onChapterCompleteRef.current = options?.onChapterComplete;

  useEffect(() => {
    if (adapterChangedThisRender) return;
    if (!prevCompleteRef.current && state.isChapterComplete) {
      onChapterCompleteRef.current?.(selectSessionMetrics(state));
    }
    prevCompleteRef.current = state.isChapterComplete;
  }, [
    adapterChangedThisRender,
    state.isChapterComplete,
    state.unitsConsumed,
    state.chapterIndex,
    state.lastActiveTimestamp,
  ]);

  const cooldownRemaining = getCooldownRemainingSeconds(state, getNow.current());

  // Tick every second while hard cooldown is active so cooldownRemaining updates live
  useEffect(() => {
    if (state.config.mode !== 'hard_cooldown' || !state.isChapterComplete) {
      return;
    }
    if (getCooldownRemainingSeconds(state, getNow.current()) <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [
    state.config.mode,
    state.config.cooldownMinutes,
    state.isChapterComplete,
    state.cooldownStartedAt,
  ]);

  const registerAction = useCallback((amount = 1) => {
    dispatch({
      type: 'CONSUME_UNIT',
      amount,
      now: getNow.current(),
    });
  }, []);

  const advanceChapter = useCallback(() => {
    dispatch({
      type: 'COMPLETE_CHAPTER',
      now: getNow.current(),
    });
  }, []);

  const snoozeOfframp = useCallback((snoozeUnits?: number) => {
    dispatch({
      type: 'SNOOZE_OFFRAMP',
      snoozeUnits,
      now: getNow.current(),
    });
  }, []);

  const resetSession = useCallback(() => {
    storageAdapter?.clearMetrics();
    dispatch({
      type: 'RESET_SESSION',
      now: getNow.current(),
    });
  }, [storageAdapter]);

  const effectiveLimit =
    state.config.mode === 'soft_prompt'
      ? (state.snoozedUntilUnit ?? state.config.unitLimit)
      : state.config.unitLimit;

  const metrics = useMemo(() => selectSessionMetrics(state), [
    state.unitsConsumed,
    state.chapterIndex,
    state.lastActiveTimestamp,
  ]);

  return {
    currentCount: state.unitsConsumed,
    limit: effectiveLimit,
    isChapterComplete: state.isChapterComplete,
    cooldownRemaining,
    chapterIndex: state.chapterIndex,
    mode: state.config.mode,
    config: state.config,
    metrics,
    registerAction,
    advanceChapter,
    snoozeOfframp,
    resetSession,
  };
}
