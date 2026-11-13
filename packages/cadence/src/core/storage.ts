import type { CadenceConfig, SessionMetrics } from './types';

export const DEFAULT_CADENCE_STORAGE_PREFIX = 'sunshade:cadence';

/**
 * Minimal Web Storage / IndexedDB-compatible synchronous or in-memory key-value contract.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Sanitized zero-knowledge session snapshot persisted locally.
 * Strictly excludes user IDs, session tokens, IP addresses, or cloud telemetry identifiers.
 */
export interface PersistedCadenceSession extends SessionMetrics {
  isChapterComplete?: boolean;
  cooldownStartedAt?: number | null;
  cooldownUntil?: number | null;
  snoozedUntilUnit?: number | null;
}

/**
 * Agnostic persistence contract for Cadence session metrics and user preferences.
 */
export interface CadenceStorageAdapter {
  loadMetrics(): PersistedCadenceSession | null;
  saveMetrics(metrics: PersistedCadenceSession): void;
  clearMetrics(): void;
  loadConfig(): Partial<CadenceConfig> | null;
  saveConfig(config: Partial<CadenceConfig>): void;
  clearConfig(): void;
  clearAll(): void;
}

export interface LocalStorageAdapterOptions {
  /** Key namespace prefix (default: `'sunshade:cadence'`). */
  keyPrefix?: string;
  /** Explicit Storage implementation (defaults to `window.localStorage` with in-memory fallback). */
  storage?: StorageLike | null;
}

/**
 * Creates an in-memory storage backend for SSR, Node tests, or restricted environments.
 */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

function resolveBrowserStorage(explicit?: StorageLike | null): StorageLike {
  if (explicit) {
    return explicit;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return createMemoryStorage();
}

/**
 * Sanitizes a session snapshot so only numeric cadence counters are persisted.
 * Guarantees zero PII or user/device identifiers ever touch local storage.
 */
export function sanitizePersistedSession(
  input: Partial<PersistedCadenceSession> | Record<string, unknown>
): PersistedCadenceSession {
  const unitsConsumed =
    typeof input.unitsConsumed === 'number' &&
    Number.isFinite(input.unitsConsumed)
      ? Math.max(0, Math.floor(input.unitsConsumed))
      : 0;

  const chapterIndex =
    typeof input.chapterIndex === 'number' &&
    Number.isFinite(input.chapterIndex)
      ? Math.max(0, Math.floor(input.chapterIndex))
      : 0;

  const lastActiveTimestamp =
    typeof input.lastActiveTimestamp === 'number' &&
    Number.isFinite(input.lastActiveTimestamp)
      ? input.lastActiveTimestamp
      : 0;

  const sanitized: PersistedCadenceSession = {
    unitsConsumed,
    chapterIndex,
    lastActiveTimestamp,
  };

  if (typeof input.isChapterComplete === 'boolean') {
    sanitized.isChapterComplete = input.isChapterComplete;
  }
  if (
    typeof input.cooldownStartedAt === 'number' ||
    input.cooldownStartedAt === null
  ) {
    sanitized.cooldownStartedAt = input.cooldownStartedAt;
  }
  if (typeof input.cooldownUntil === 'number' || input.cooldownUntil === null) {
    sanitized.cooldownUntil = input.cooldownUntil;
  }
  if (
    typeof input.snoozedUntilUnit === 'number' ||
    input.snoozedUntilUnit === null
  ) {
    sanitized.snoozedUntilUnit = input.snoozedUntilUnit;
  }

  return sanitized;
}

/**
 * Sanitizes persisted user CadenceConfig preferences.
 */
export function sanitizePersistedConfig(
  input: Partial<CadenceConfig> | Record<string, unknown>
): Partial<CadenceConfig> {
  const sanitized: Partial<CadenceConfig> = {};

  if (
    typeof input.unitLimit === 'number' &&
    Number.isFinite(input.unitLimit) &&
    input.unitLimit >= 1
  ) {
    sanitized.unitLimit = Math.floor(input.unitLimit);
  }

  if (
    input.mode === 'soft_prompt' ||
    input.mode === 'hard_cooldown' ||
    input.mode === 'disabled'
  ) {
    sanitized.mode = input.mode;
  }

  if (
    typeof input.cooldownMinutes === 'number' &&
    Number.isFinite(input.cooldownMinutes) &&
    input.cooldownMinutes >= 0
  ) {
    sanitized.cooldownMinutes = input.cooldownMinutes;
  }

  if (Array.isArray(input.enabledCategories)) {
    sanitized.enabledCategories = input.enabledCategories.filter(
      (cat): cat is string => typeof cat === 'string' && cat.trim().length > 0
    );
  }

  if (
    typeof input.snoozeUnits === 'number' &&
    Number.isFinite(input.snoozeUnits) &&
    input.snoozeUnits >= 1
  ) {
    sanitized.snoozeUnits = Math.floor(input.snoozeUnits);
  }

  return sanitized;
}

/**
 * Builds a zero-knowledge local persistence adapter backed by LocalStorage (or a custom StorageLike).
 * Never performs network I/O or transmits usage telemetry to remote endpoints.
 */
export function createLocalStorageAdapter(
  options: LocalStorageAdapterOptions = {}
): CadenceStorageAdapter {
  const prefix = options.keyPrefix ?? DEFAULT_CADENCE_STORAGE_PREFIX;
  const metricsKey = `${prefix}:metrics`;
  const configKey = `${prefix}:config`;
  const fallbackMemory = createMemoryStorage();

  const getStore = (): StorageLike => {
    try {
      return resolveBrowserStorage(options.storage);
    } catch {
      return fallbackMemory;
    }
  };

  return {
    loadMetrics(): PersistedCadenceSession | null {
      try {
        const raw = getStore().getItem(metricsKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return sanitizePersistedSession(parsed as Record<string, unknown>);
      } catch {
        return null;
      }
    },

    saveMetrics(metrics: PersistedCadenceSession): void {
      const clean = sanitizePersistedSession(metrics);
      const serialized = JSON.stringify(clean);
      try {
        getStore().setItem(metricsKey, serialized);
      } catch {
        fallbackMemory.setItem(metricsKey, serialized);
      }
    },

    clearMetrics(): void {
      try {
        getStore().removeItem(metricsKey);
      } catch {
        /* ignore */
      }
      fallbackMemory.removeItem(metricsKey);
    },

    loadConfig(): Partial<CadenceConfig> | null {
      try {
        const raw = getStore().getItem(configKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return sanitizePersistedConfig(parsed as Record<string, unknown>);
      } catch {
        return null;
      }
    },

    saveConfig(config: Partial<CadenceConfig>): void {
      const clean = sanitizePersistedConfig(config);
      const serialized = JSON.stringify(clean);
      try {
        getStore().setItem(configKey, serialized);
      } catch {
        fallbackMemory.setItem(configKey, serialized);
      }
    },

    clearConfig(): void {
      try {
        getStore().removeItem(configKey);
      } catch {
        /* ignore */
      }
      fallbackMemory.removeItem(configKey);
    },

    clearAll(): void {
      this.clearMetrics();
      this.clearConfig();
    },
  };
}
