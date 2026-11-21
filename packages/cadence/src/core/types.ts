/**
 * Boundary enforcement policy when a user reaches a Cadence chapter threshold.
 * - `soft_prompt`: Displays an intentional off-ramp / micro-widget with an option to continue or snooze.
 * - `hard_cooldown`: Enforces a deterministic wall-clock cooldown window before advancing.
 * - `disabled`: Tracks session metrics passively without triggering chapter boundaries.
 */
export type BoundaryPolicy = 'soft_prompt' | 'hard_cooldown' | 'disabled';

/**
 * Standard widget categories supported by the Cadence widget deck.
 */
export type CadenceWidgetCategory =
  | 'vocab'
  | 'poll'
  | 'puzzle'
  | 'eye'
  | 'custom'
  | (string & {});

/**
 * Configuration contract for a Cadence pacing session.
 */
export interface CadenceConfig {
  /** Number of content units (posts, cards, items) per chapter before triggering an off-ramp. */
  unitLimit: number;
  /** Enforcement policy when `unitLimit` is reached. */
  mode: BoundaryPolicy;
  /** Cooldown duration in minutes when `mode` is `'hard_cooldown'`. */
  cooldownMinutes: number;
  /** Enabled micro-interaction widget categories for chapter breaks. */
  enabledCategories: CadenceWidgetCategory[];
  /** Number of extra units granted when a soft off-ramp is snoozed (default: 5). */
  snoozeUnits?: number;
}

/**
 * Core zero-knowledge session telemetry counters stored locally.
 */
export interface SessionMetrics {
  /** Units consumed within the current chapter. */
  unitsConsumed: number;
  /** Zero-based index of the current chapter in this session. */
  chapterIndex: number;
  /** Epoch millisecond timestamp of the most recent user unit action. */
  lastActiveTimestamp: number;
}

/**
 * Complete reducer state for the Cadence headless state machine.
 */
export interface CadenceSessionState extends SessionMetrics {
  /** Resolved configuration governing this session. */
  config: CadenceConfig;
  /** True when the current chapter unit threshold has been reached. */
  isChapterComplete: boolean;
  /** Epoch millisecond timestamp when a hard cooldown began, or null. */
  cooldownStartedAt: number | null;
  /** Epoch millisecond timestamp when the active hard cooldown expires, or null. */
  cooldownUntil: number | null;
  /** Effective unit threshold when the user snoozes a soft prompt off-ramp, or null. */
  snoozedUntilUnit: number | null;
}

/**
 * Lifecycle event types emitted by Cadence micro-interaction widgets.
 */
export type WidgetEventType = 'impression' | 'complete' | 'dismiss' | 'skip';

/**
 * Event payload emitted when a user interacts with a Cadence widget.
 */
export interface WidgetEvent {
  widgetId: string;
  category: CadenceWidgetCategory;
  type: WidgetEventType;
  timestamp: number;
  chapterIndex: number;
  payload?: Record<string, unknown>;
}

/**
 * Callback signature for widget lifecycle events.
 */
export type WidgetEventCallback = (event: WidgetEvent) => void;

/**
 * Optional callback hooks for host applications observing widget and chapter boundaries.
 */
export interface WidgetEventCallbacks {
  onWidgetEvent?: WidgetEventCallback;
  onWidgetComplete?: WidgetEventCallback;
  onWidgetDismiss?: WidgetEventCallback;
  onChapterComplete?: (metrics: SessionMetrics) => void;
}

/**
 * Actions accepted by the pure Cadence session state machine reducer.
 */
export type CadenceAction =
  | {
      type: 'CONSUME_UNIT';
      amount?: number;
      now?: number;
    }
  | {
      type: 'COMPLETE_CHAPTER';
      now?: number;
    }
  | {
      type: 'SNOOZE_OFFRAMP';
      snoozeUnits?: number;
      now?: number;
    }
  | {
      type: 'RESET_SESSION';
      now?: number;
    }
  | {
      type: 'HYDRATE_SESSION';
      metrics: Partial<SessionMetrics> & {
        isChapterComplete?: boolean;
        cooldownStartedAt?: number | null;
        cooldownUntil?: number | null;
        snoozedUntilUnit?: number | null;
      };
      now?: number;
    }
  | {
      type: 'UPDATE_CONFIG';
      config: Partial<CadenceConfig>;
      now?: number;
    };
