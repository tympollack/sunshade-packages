import type { RollTrajectoryStep } from '@digitalcanopy/reels-engine';
import type {
  CartridgeDramaWeights,
  DirectorKeyframe,
  DirectorTimelinePlan,
  DirectorTransition,
  DramaBeatType,
  DramaScoreBreakdown,
} from '../types';
import { scoreRollTrajectory, selectCameraCueForBeat } from './scorer';

export const DEFAULT_TARGET_REEL_DURATION_MS = 60_000;
export const DEFAULT_MIN_KEYFRAME_MS = 2_000;
export const DEFAULT_MAX_KEYFRAME_MS = 10_000;

export interface DirectorPacingOptions {
  matchId: string;
  cartridgeId: string;
  /** Target highlight reel duration in ms (default: 60,000 ms). */
  targetDurationMs?: number;
  /** Minimum duration per keyframe in ms (default: 2,000 ms). */
  minKeyframeDurationMs?: number;
  /** Maximum duration per keyframe in ms (default: 10,000 ms). */
  maxKeyframeDurationMs?: number;
  /** Optional explicit total source match duration in ms. */
  totalSourceDurationMs?: number;
  /** Optional cartridge drama weight overrides when scoring raw trajectories. */
  dramaWeights?: CartridgeDramaWeights;
  /** Whether the cartridge supports creator webcam PiP cues (default: true). */
  supportsPresencePiP?: boolean;
}

function getCaptionForBeat(beatType: DramaBeatType, dramaIndex: number): string | undefined {
  switch (beatType) {
    case 'OPENING_HOOK':
      return 'THE SETUP';
    case 'MISFIRE_SHOCK':
      return 'SNAKE EYES MISFIRE!';
    case 'MIRACLE_CLUTCH':
      return 'MIRACLE CLUTCH!';
    case 'COMEBACK_PIVOT':
      return 'COMEBACK PIVOT';
    case 'CLIMAX_SPIKE':
      return dramaIndex >= 85 ? 'PEAK DRAMA!' : 'HIGH STAKES CLASH';
    case 'FINALE_PAYOFF':
      return 'FINAL OUTCOME';
    default:
      return undefined;
  }
}

function getPlaybackRateForBeat(beatType: DramaBeatType, dramaIndex: number): number {
  if (beatType === 'MIRACLE_CLUTCH' || beatType === 'CLIMAX_SPIKE') {
    return 0.75;
  }
  if (beatType === 'TENSION_BUILD' && dramaIndex < 40) {
    return 1.25;
  }
  return 1.0;
}

function getTransitionForNextBeat(
  currentBeat: DramaBeatType,
  nextBeat?: DramaBeatType
): DirectorTransition {
  if (!nextBeat) return 'crossfade';
  if (currentBeat === 'MISFIRE_SHOCK') return 'glitch';
  if (nextBeat === 'MIRACLE_CLUTCH' || nextBeat === 'CLIMAX_SPIKE') {
    return 'whip_pan';
  }
  if (nextBeat === 'FINALE_PAYOFF') return 'crossfade';
  return 'cut';
}

/**
 * Selects the most compelling moments up to `budget` while preserving chronological order
 * and guaranteeing coverage of the opening hook, peak climax, and finale.
 */
function selectNarrativeIndices(
  breakdowns: readonly DramaScoreBreakdown[],
  budget: number
): number[] {
  const n = breakdowns.length;
  if (n <= budget) {
    return Array.from({ length: n }, (_, i) => i);
  }

  let peakIdx = 0;
  for (let i = 1; i < n; i++) {
    if (breakdowns[i].dramaIndex > breakdowns[peakIdx].dramaIndex) {
      peakIdx = i;
    }
  }

  const chosen = new Set<number>();
  chosen.add(0);
  chosen.add(peakIdx);
  if (n > 1) {
    chosen.add(n - 1);
  }

  const remainingSlots = Math.max(0, budget - chosen.size);
  if (remainingSlots > 0) {
    const ranked = breakdowns
      .map((b, idx) => ({ idx, score: b.dramaIndex }))
      .filter((entry) => !chosen.has(entry.idx))
      .sort((a, b) => b.score - a.score || a.idx - b.idx)
      .slice(0, remainingSlots);

    for (const entry of ranked) {
      chosen.add(entry.idx);
    }
  }

  return Array.from(chosen).sort((a, b) => a - b);
}

/**
 * Allocates exact integer millisecond durations summing to `targetDurationMs`,
 * weighted by drama intensity while respecting `[minMs, maxMs]` bounds when feasible.
 */
function allocateKeyframeDurations(
  selected: readonly DramaScoreBreakdown[],
  targetDurationMs: number,
  minMs: number,
  maxMs: number
): number[] {
  const count = selected.length;
  if (count === 0) return [];
  if (count === 1) return [targetDurationMs];

  const effectiveMin = Math.min(minMs, Math.floor(targetDurationMs / count));
  const effectiveMax = Math.max(maxMs, Math.ceil(targetDurationMs / count));

  const weights = selected.map((b) => 20 + b.dramaIndex);
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  const durations = weights.map((w) => {
    const proportional = Math.round((w / totalWeight) * targetDurationMs);
    return Math.max(effectiveMin, Math.min(effectiveMax, proportional));
  });

  // Reconcile residual delta so sum === targetDurationMs exactly
  let currentSum = durations.reduce((acc, d) => acc + d, 0);
  let diff = targetDurationMs - currentSum;

  const orderByDrama = selected
    .map((b, idx) => ({ idx, drama: b.dramaIndex }))
    .sort((a, b) => (diff > 0 ? b.drama - a.drama : a.drama - b.drama));

  let safety = 0;
  while (diff !== 0 && safety < count * 4) {
    let adjusted = false;
    for (const { idx } of orderByDrama) {
      if (diff === 0) break;
      if (diff > 0 && durations[idx] < effectiveMax) {
        const step = Math.min(diff, effectiveMax - durations[idx]);
        durations[idx] += step;
        diff -= step;
        adjusted = true;
      } else if (diff < 0 && durations[idx] > effectiveMin) {
        const step = Math.min(-diff, durations[idx] - effectiveMin);
        durations[idx] -= step;
        diff += step;
        adjusted = true;
      }
    }
    if (!adjusted) break;
    safety++;
  }

  if (diff !== 0) {
    durations[durations.length - 1] += diff;
  }

  return durations;
}

/**
 * Generates a paced 60-second (or custom duration) `DirectorTimelinePlan` from scored moments.
 */
export function buildDirectorTimelinePlan(
  breakdowns: readonly DramaScoreBreakdown[],
  options: DirectorPacingOptions
): DirectorTimelinePlan {
  const targetDurationMs = Math.max(
    1000,
    Math.floor(options.targetDurationMs ?? DEFAULT_TARGET_REEL_DURATION_MS)
  );
  const minKeyframeDurationMs = Math.max(
    250,
    Math.floor(options.minKeyframeDurationMs ?? DEFAULT_MIN_KEYFRAME_MS)
  );
  const maxKeyframeDurationMs = Math.max(
    minKeyframeDurationMs,
    Math.floor(options.maxKeyframeDurationMs ?? DEFAULT_MAX_KEYFRAME_MS)
  );
  const supportsPiP = options.supportsPresencePiP ?? true;

  if (breakdowns.length === 0) {
    return {
      matchId: options.matchId,
      cartridgeId: options.cartridgeId,
      targetDurationMs,
      totalSourceDurationMs: options.totalSourceDurationMs ?? 0,
      keyframes: [],
      peakDramaIndex: 0,
      peakRollIndex: 0,
      hookKeyframeId: '',
      climaxKeyframeId: '',
    };
  }

  const maxBudget = Math.max(
    1,
    Math.floor(targetDurationMs / minKeyframeDurationMs)
  );
  const selectedIndices = selectNarrativeIndices(breakdowns, maxBudget);
  const selectedBreakdowns = selectedIndices.map((idx) => breakdowns[idx]);
  const durations = allocateKeyframeDurations(
    selectedBreakdowns,
    targetDurationMs,
    minKeyframeDurationMs,
    maxKeyframeDurationMs
  );

  // Assign sequence-level OPENING_HOOK and FINALE_PAYOFF where appropriate
  const effectiveBeats: DramaBeatType[] = selectedBreakdowns.map((b, i) => {
    if (i === 0 && b.beatType === 'TENSION_BUILD') {
      return 'OPENING_HOOK';
    }
    if (
      i === selectedBreakdowns.length - 1 &&
      selectedBreakdowns.length > 1 &&
      b.beatType === 'TENSION_BUILD'
    ) {
      return 'FINALE_PAYOFF';
    }
    return b.beatType;
  });

  let cursorMs = 0;
  let peakDramaIndex = -1;
  let peakRollIndex = selectedBreakdowns[0].rollIndex;
  let climaxKeyframeId = '';

  const keyframes: DirectorKeyframe[] = selectedBreakdowns.map((b, i) => {
    const durationMs = durations[i];
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    cursorMs = endMs;

    const beatType = effectiveBeats[i];
    const nextBeat =
      i + 1 < effectiveBeats.length ? effectiveBeats[i + 1] : undefined;
    const keyframeId = `kf_${String(i).padStart(2, '0')}_r${b.rollIndex}`;

    if (b.dramaIndex > peakDramaIndex) {
      peakDramaIndex = b.dramaIndex;
      peakRollIndex = b.rollIndex;
      climaxKeyframeId = keyframeId;
    }

    return {
      keyframeId,
      startMs,
      endMs,
      durationMs,
      sourceRollIndex: b.rollIndex,
      dramaIndex: b.dramaIndex,
      beatType,
      cameraCue: selectCameraCueForBeat(beatType, b.dramaIndex, supportsPiP),
      playbackRate: getPlaybackRateForBeat(beatType, b.dramaIndex),
      captionOverlay: getCaptionForBeat(beatType, b.dramaIndex),
      transitionToNext: getTransitionForNextBeat(beatType, nextBeat),
    };
  });

  const lastTimestamp = breakdowns[breakdowns.length - 1].timestampMs;
  const totalSourceDurationMs =
    options.totalSourceDurationMs ?? lastTimestamp + 3000;

  return {
    matchId: options.matchId,
    cartridgeId: options.cartridgeId,
    targetDurationMs,
    totalSourceDurationMs,
    keyframes,
    peakDramaIndex,
    peakRollIndex,
    hookKeyframeId: keyframes[0].keyframeId,
    climaxKeyframeId,
  };
}

/**
 * Convenience pipeline transforming `RollTrajectoryStep[]` from `@digitalcanopy/reels-engine`
 * directly into scored moments and a paced `DirectorTimelinePlan`.
 */
export function createDirectorTimelineFromTrajectory(
  steps: readonly RollTrajectoryStep[],
  options: DirectorPacingOptions & { stepDurationMs?: number }
): { breakdowns: DramaScoreBreakdown[]; plan: DirectorTimelinePlan } {
  const breakdowns = scoreRollTrajectory(
    steps,
    options.stepDurationMs ?? 3000,
    options.dramaWeights,
    options.supportsPresencePiP ?? true
  );
  const plan = buildDirectorTimelinePlan(breakdowns, options);
  return { breakdowns, plan };
}
