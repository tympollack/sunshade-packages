import type {
  DirectorKeyframe,
  DirectorTimelinePlan,
  ICreatorPresenceProvider,
  ScrubSyncState,
  TelemetryFrame,
} from '../types';

export interface SourceClipWindow {
  sourceStartMs: number;
  sourceEndMs: number;
}

export interface ScrubSynchronizerConfig {
  frames: readonly TelemetryFrame[];
  timelinePlan?: DirectorTimelinePlan;
  /** Optional explicit mapping from `keyframeId` to source match `[sourceStartMs, sourceEndMs]` clip bounds. */
  sourceClipWindows?: Readonly<Record<string, SourceClipWindow>>;
  presenceProvider?: ICreatorPresenceProvider;
  /** Optional audio/webcam alignment offset in ms added when syncing presence track. */
  presenceOffsetMs?: number;
  /** Default playback rate when no keyframe override is active (default: 1). */
  defaultPlaybackRate?: number;
}

export type ScrubSyncListener = (state: ScrubSyncState) => void;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Binary-searches sorted telemetry frames for the bracketing indices around `sourceTimeMs`.
 */
function findBracketingFrames(
  frames: readonly TelemetryFrame[],
  sourceTimeMs: number
): [TelemetryFrame | null, TelemetryFrame | null, number] {
  const n = frames.length;
  if (n === 0) return [null, null, 0];
  if (sourceTimeMs <= frames[0].tMs) return [frames[0], frames[0], 0];
  if (sourceTimeMs >= frames[n - 1].tMs) return [frames[n - 1], frames[n - 1], 0];

  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midT = frames[mid].tMs;
    if (midT === sourceTimeMs) {
      return [frames[mid], frames[mid], 0];
    }
    if (midT < sourceTimeMs) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const prev = frames[Math.max(0, hi)];
  const next = frames[Math.min(n - 1, lo)];
  const span = next.tMs - prev.tMs;
  const alpha = span > 0 ? clamp((sourceTimeMs - prev.tMs) / span, 0, 1) : 0;
  return [prev, next, alpha];
}

function findActiveKeyframe(
  keyframes: readonly DirectorKeyframe[],
  playheadMs: number
): DirectorKeyframe | null {
  if (keyframes.length === 0) return null;
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const isLast = i === keyframes.length - 1;
    if (
      playheadMs >= kf.startMs &&
      (playheadMs < kf.endMs || (isLast && playheadMs <= kf.endMs))
    ) {
      return kf;
    }
  }
  return playheadMs < keyframes[0].startMs
    ? keyframes[0]
    : keyframes[keyframes.length - 1];
}

function buildClipWindowMap(
  frames: readonly TelemetryFrame[],
  timelinePlan?: DirectorTimelinePlan,
  explicitWindows?: Readonly<Record<string, SourceClipWindow>>
): Map<string, SourceClipWindow> {
  const map = new Map<string, SourceClipWindow>();
  if (!timelinePlan || timelinePlan.keyframes.length === 0) {
    return map;
  }

  const frameIndexByRoll = new Map<number, number>();
  frames.forEach((f, idx) => {
    if (!frameIndexByRoll.has(f.rollIndex)) {
      frameIndexByRoll.set(f.rollIndex, idx);
    }
  });

  const maxSourceMs =
    frames.length > 0
      ? frames[frames.length - 1].tMs
      : timelinePlan.totalSourceDurationMs;

  for (let i = 0; i < timelinePlan.keyframes.length; i++) {
    const kf = timelinePlan.keyframes[i];
    const explicit = explicitWindows?.[kf.keyframeId];
    if (explicit) {
      map.set(kf.keyframeId, {
        sourceStartMs: Math.max(0, explicit.sourceStartMs),
        sourceEndMs: Math.max(explicit.sourceStartMs, explicit.sourceEndMs),
      });
      continue;
    }

    const frameIdx = frameIndexByRoll.get(kf.sourceRollIndex);
    if (frameIdx !== undefined) {
      const startMs = frames[frameIdx].tMs;
      const nextFrame = frames[frameIdx + 1];
      const nextKf = timelinePlan.keyframes[i + 1];
      const nextKfIdx = nextKf
        ? frameIndexByRoll.get(nextKf.sourceRollIndex)
        : undefined;
      const nextKfStartMs =
        nextKfIdx !== undefined ? frames[nextKfIdx].tMs : maxSourceMs;

      const endMs = nextFrame
        ? Math.min(nextFrame.tMs, nextKfStartMs)
        : Math.max(startMs, maxSourceMs);

      map.set(kf.keyframeId, {
        sourceStartMs: startMs,
        sourceEndMs: Math.max(startMs, endMs),
      });
    } else {
      const ratioStart =
        timelinePlan.targetDurationMs > 0
          ? kf.startMs / timelinePlan.targetDurationMs
          : 0;
      const ratioEnd =
        timelinePlan.targetDurationMs > 0
          ? kf.endMs / timelinePlan.targetDurationMs
          : 1;
      map.set(kf.keyframeId, {
        sourceStartMs: ratioStart * timelinePlan.totalSourceDurationMs,
        sourceEndMs: ratioEnd * timelinePlan.totalSourceDurationMs,
      });
    }
  }

  return map;
}

/**
 * Synchronizes Director timeline keyframes, quantized telemetry frames, and the
 * creator PiP/avatar presence track for deterministic timeline scrubbing and replay.
 */
export class ReactionTimelineSynchronizer {
  private readonly frames: TelemetryFrame[];
  private readonly timelinePlan?: DirectorTimelinePlan;
  private readonly clipWindows: Map<string, SourceClipWindow>;
  private presenceProvider?: ICreatorPresenceProvider;
  private readonly presenceOffsetMs: number;
  private readonly defaultPlaybackRate: number;
  private readonly durationMs: number;

  private playheadMs = 0;
  private isPlaying = false;
  private listeners = new Set<ScrubSyncListener>();

  constructor(config: ScrubSynchronizerConfig) {
    this.frames = [...config.frames].sort((a, b) => a.tMs - b.tMs || a.seq - b.seq);
    this.timelinePlan = config.timelinePlan;
    this.clipWindows = buildClipWindowMap(
      this.frames,
      this.timelinePlan,
      config.sourceClipWindows
    );
    this.presenceProvider = config.presenceProvider;
    this.presenceOffsetMs = config.presenceOffsetMs ?? 0;
    this.defaultPlaybackRate = config.defaultPlaybackRate ?? 1;

    if (this.timelinePlan) {
      const lastKfEnd =
        this.timelinePlan.keyframes.length > 0
          ? this.timelinePlan.keyframes[this.timelinePlan.keyframes.length - 1]
              .endMs
          : 0;
      this.durationMs = Math.max(this.timelinePlan.targetDurationMs, lastKfEnd);
    } else {
      this.durationMs =
        this.frames.length > 0 ? this.frames[this.frames.length - 1].tMs : 0;
    }
  }

  attachPresenceProvider(provider: ICreatorPresenceProvider | undefined): void {
    this.presenceProvider = provider;
    if (provider) {
      const state = this.getState();
      provider.syncToTimeline(state.presenceCueTimeMs);
    }
  }

  private mapReelToSourceTimeMs(
    playheadMs: number,
    activeKeyframe: DirectorKeyframe | null
  ): number {
    if (!this.timelinePlan || !activeKeyframe) {
      return playheadMs;
    }
    const window = this.clipWindows.get(activeKeyframe.keyframeId);
    if (!window) {
      return playheadMs;
    }
    const progress =
      activeKeyframe.durationMs > 0
        ? clamp(
            (playheadMs - activeKeyframe.startMs) / activeKeyframe.durationMs,
            0,
            1
          )
        : 0;
    return lerp(window.sourceStartMs, window.sourceEndMs, progress);
  }

  private computePresenceCueTimeMs(sourceTimeMs: number): number {
    return Math.max(0, sourceTimeMs + this.presenceOffsetMs);
  }

  getState(): ScrubSyncState {
    const activeKeyframe = this.timelinePlan
      ? findActiveKeyframe(this.timelinePlan.keyframes, this.playheadMs)
      : null;
    const sourceTimeMs = this.mapReelToSourceTimeMs(
      this.playheadMs,
      activeKeyframe
    );
    const [prevFrame, nextFrame, alpha] = findBracketingFrames(
      this.frames,
      sourceTimeMs
    );

    const interpolatedWinProbability =
      prevFrame && nextFrame
        ? lerp(prevFrame.winProbability, nextFrame.winProbability, alpha)
        : 0;
    const interpolatedDramaIndex =
      prevFrame && nextFrame
        ? lerp(prevFrame.dramaIndex, nextFrame.dramaIndex, alpha)
        : 0;
    const interpolatedScore =
      prevFrame && nextFrame
        ? Math.round(lerp(prevFrame.score, nextFrame.score, alpha))
        : 0;

    return {
      playheadMs: this.playheadMs,
      sourceTimeMs,
      durationMs: this.durationMs,
      activeFrame: prevFrame,
      activeKeyframe,
      interpolatedWinProbability,
      interpolatedDramaIndex,
      interpolatedScore,
      presenceCueTimeMs: this.computePresenceCueTimeMs(sourceTimeMs),
      isPlaying: this.isPlaying,
      playbackRate: activeKeyframe?.playbackRate ?? this.defaultPlaybackRate,
    };
  }

  private emitState(): ScrubSyncState {
    const state = this.getState();
    this.presenceProvider?.syncToTimeline(state.presenceCueTimeMs);
    for (const listener of this.listeners) {
      listener(state);
    }
    return state;
  }

  subscribe(listener: ScrubSyncListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  play(): ScrubSyncState {
    this.isPlaying = true;
    return this.emitState();
  }

  pause(): ScrubSyncState {
    this.isPlaying = false;
    return this.emitState();
  }

  seek(playheadMs: number): ScrubSyncState {
    this.playheadMs = clamp(playheadMs, 0, this.durationMs);
    return this.emitState();
  }

  /**
   * Advances playback by `deltaWallMs` scaled by the active keyframe's `playbackRate`.
   */
  step(deltaWallMs: number): ScrubSyncState {
    if (!this.isPlaying || !Number.isFinite(deltaWallMs) || deltaWallMs <= 0) {
      return this.getState();
    }
    const current = this.getState();
    const nextPlayhead = this.playheadMs + deltaWallMs * current.playbackRate;
    if (nextPlayhead >= this.durationMs) {
      this.playheadMs = this.durationMs;
      this.isPlaying = false;
    } else {
      this.playheadMs = nextPlayhead;
    }
    return this.emitState();
  }

  jumpToKeyframe(keyframeId: string): ScrubSyncState {
    const target = this.timelinePlan?.keyframes.find(
      (kf) => kf.keyframeId === keyframeId
    );
    if (!target) {
      throw new Error(`Director keyframe "${keyframeId}" not found.`);
    }
    return this.seek(target.startMs);
  }

  jumpToRoll(rollIndex: number): ScrubSyncState {
    const targetKeyframe = this.timelinePlan?.keyframes.find(
      (kf) => kf.sourceRollIndex === rollIndex
    );
    if (targetKeyframe) {
      return this.seek(targetKeyframe.startMs);
    }
    const targetFrame = this.frames.find((f) => f.rollIndex === rollIndex);
    if (!targetFrame) {
      throw new Error(`Roll index ${rollIndex} not found in telemetry stream.`);
    }
    return this.seek(targetFrame.tMs);
  }
}
