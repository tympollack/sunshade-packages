import type { ComponentType } from 'react';
import type { CadenceWidgetCategory } from '../core/types';
import { EyeBreakWidget } from './builtins/EyeBreakWidget';
import { PuzzleWidget } from './builtins/PuzzleWidget';
import { ValeriePollWidget } from './builtins/ValeriePollWidget';
import { VocabWidget } from './builtins/VocabWidget';

/**
 * Contextual session metadata supplied to a rendered Cadence widget.
 */
export interface CadenceWidgetContext {
  chapterIndex?: number;
  unitsConsumed?: number;
  appSlug?: string;
  [key: string]: unknown;
}

/**
 * Standardized props contract implemented by every Cadence micro-interaction widget.
 */
export interface CadenceWidgetProps {
  /** Invoked when the user completes the micro-interaction (typically 3–20 seconds). */
  onComplete: (payload?: Record<string, unknown>) => void;
  /** Optional handler when the user skips or dismisses the widget. */
  onDismiss?: () => void;
  /** Optional host & chapter context. */
  context?: CadenceWidgetContext;
  /** Optional wrapper CSS classes. */
  className?: string;
}

/**
 * Registration metadata and component reference for a pluggable Cadence widget.
 */
export interface CadenceWidgetDefinition {
  /** Unique identifier for the widget (e.g. `'vocab-builder'`, `'valerie-poll'`). */
  id: string;
  /** Human-readable display title. */
  title: string;
  /** Category key used for filtering against `CadenceConfig.enabledCategories`. */
  category: CadenceWidgetCategory;
  /** Short summary of the micro-interaction's purpose. */
  description?: string;
  /** Target interaction time in seconds (3 to 20 seconds). */
  estimatedDurationSeconds?: number;
  /** React component implementing `CadenceWidgetProps`. */
  component: ComponentType<CadenceWidgetProps>;
  /** Whether this widget is enabled by default when no category filter is passed. */
  defaultEnabled?: boolean;
}

export const BUILTIN_WIDGET_DEFINITIONS: readonly CadenceWidgetDefinition[] = [
  {
    id: 'vocab-builder',
    title: 'VocabBuilder 3-Second Match',
    category: 'vocab',
    description: 'Single-tap synonym match with immediate positive reinforcement.',
    estimatedDurationSeconds: 3,
    component: VocabWidget,
    defaultEnabled: true,
  },
  {
    id: 'valerie-poll',
    title: 'Project Valerie One-Tap Civic Poll',
    category: 'poll',
    description: 'Zero-knowledge civic sentiment micro-poll.',
    estimatedDurationSeconds: 5,
    component: ValeriePollWidget,
    defaultEnabled: true,
  },
  {
    id: 'spatial-puzzle',
    title: '3-Second Spatial Teaser',
    category: 'puzzle',
    description: 'Quick visual rotation or missing-piece pattern puzzle.',
    estimatedDurationSeconds: 3,
    component: PuzzleWidget,
    defaultEnabled: true,
  },
  {
    id: 'eye-break',
    title: '20-20-20 Optical Reset',
    category: 'eye',
    description: 'Low-luminance 20-second distance vision and posture reset.',
    estimatedDurationSeconds: 20,
    component: EyeBreakWidget,
    defaultEnabled: true,
  },
];

const widgetRegistry = new Map<string, CadenceWidgetDefinition>();

function seedBuiltinWidgets(): void {
  for (const def of BUILTIN_WIDGET_DEFINITIONS) {
    widgetRegistry.set(def.id, def);
  }
}

seedBuiltinWidgets();

/**
 * Registers or updates a widget definition in the Cadence widget deck.
 */
export function registerWidget(
  definition: CadenceWidgetDefinition
): CadenceWidgetDefinition {
  if (!definition || !definition.id || typeof definition.id !== 'string') {
    throw new Error('Cadence widget definition requires a non-empty string id.');
  }
  if (!definition.category || typeof definition.category !== 'string') {
    throw new Error(
      `Cadence widget "${definition.id}" requires a non-empty category.`
    );
  }
  if (typeof definition.component !== 'function') {
    throw new Error(
      `Cadence widget "${definition.id}" requires a valid React component.`
    );
  }

  const normalized: CadenceWidgetDefinition = {
    ...definition,
    defaultEnabled: definition.defaultEnabled ?? true,
  };
  widgetRegistry.set(normalized.id, normalized);
  return normalized;
}

/**
 * Removes a widget definition from the registry by ID.
 */
export function unregisterWidget(id: string): boolean {
  return widgetRegistry.delete(id);
}

/**
 * Looks up a registered widget definition by its unique ID.
 */
export function getWidgetById(id: string): CadenceWidgetDefinition | undefined {
  return widgetRegistry.get(id);
}

/**
 * Returns all currently registered widget definitions in insertion order.
 */
export function getAllWidgets(): CadenceWidgetDefinition[] {
  return Array.from(widgetRegistry.values());
}

/**
 * Returns registered widgets matching the provided `enabledCategories` list
 * (matches either `widget.category` or `widget.id`).
 * When `enabledCategories` is omitted, returns all widgets with `defaultEnabled !== false`.
 */
export function getEnabledWidgets(
  enabledCategories?: readonly string[]
): CadenceWidgetDefinition[] {
  const all = getAllWidgets();
  if (enabledCategories === undefined) {
    return all.filter((w) => w.defaultEnabled !== false);
  }
  if (enabledCategories.length === 0) {
    return [];
  }
  const normalizedSet = new Set(
    enabledCategories.map((item) => item.trim().toLowerCase())
  );
  return all.filter(
    (w) =>
      normalizedSet.has(w.category.toLowerCase()) ||
      normalizedSet.has(w.id.toLowerCase())
  );
}

/**
 * Selects a random enabled widget from the registry (or `null` if no widgets match).
 * Accepts an optional deterministic `rng` (`() => number` in `[0, 1)`) for testing.
 */
export function getRandomWidget(
  enabledCategories?: readonly string[],
  rng: () => number = Math.random
): CadenceWidgetDefinition | null {
  const candidates = getEnabledWidgets(enabledCategories);
  if (candidates.length === 0) {
    return null;
  }
  const raw = rng();
  const clamped = Number.isFinite(raw)
    ? Math.min(0.999999, Math.max(0, raw))
    : 0;
  const index = Math.floor(clamped * candidates.length);
  return candidates[index] ?? candidates[0];
}

/**
 * Resets the widget registry to a clean state (re-seeding the 4 baseline built-in widgets by default).
 */
export function resetWidgetRegistry(restoreBuiltins = true): void {
  widgetRegistry.clear();
  if (restoreBuiltins) {
    seedBuiltinWidgets();
  }
}
