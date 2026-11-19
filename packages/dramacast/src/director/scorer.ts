import type { RollTrajectoryStep, SubSeedTier } from '@digitalcanopy/reels-engine';
import type {
  CartridgeDramaWeights,
  DirectorCameraCue,
  DramaBeatType,
  DramaScoreBreakdown,
  DramaSignalInput,
} from '../types';

export const DEFAULT_DRAMA_WEIGHTS: Required<CartridgeDramaWeights> = {
  comebackSwingWeight: 1.0,
  nearMissWeight: 1.0,
  miracleTierWeight: 1.0,
  misfireRecoveryWeight: 1.0,
  streakMomentumWeight: 1.0,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const TIER_BASE_POINTS: Record<SubSeedTier, number> = {
  tier0_baseline: 0,
  tier1_favorable: 4,
  tier2_clutch: 11,
  tier3_miracle: 20,
};

function resolveWeights(
  overrides?: CartridgeDramaWeights
): Required<CartridgeDramaWeights> {
  return {
    comebackSwingWeight:
      overrides?.comebackSwingWeight ?? DEFAULT_DRAMA_WEIGHTS.comebackSwingWeight,
    nearMissWeight:
      overrides?.nearMissWeight ?? DEFAULT_DRAMA_WEIGHTS.nearMissWeight,
    miracleTierWeight:
      overrides?.miracleTierWeight ?? DEFAULT_DRAMA_WEIGHTS.miracleTierWeight,
    misfireRecoveryWeight:
      overrides?.misfireRecoveryWeight ??
      DEFAULT_DRAMA_WEIGHTS.misfireRecoveryWeight,
    streakMomentumWeight:
      overrides?.streakMomentumWeight ??
      DEFAULT_DRAMA_WEIGHTS.streakMomentumWeight,
  };
}

function classifyBeatType(
  input: DramaSignalInput,
  dramaIndex: number,
  prevProb: number,
  currProb: number
): DramaBeatType {
  if (input.isDoubleOneMisfire) {
    return 'MISFIRE_SHOCK';
  }
  if (input.selectedTier === 'tier3_miracle') {
    return 'MIRACLE_CLUTCH';
  }
  if (
    input.isBlindCheckRecovery ||
    (prevProb < 0.15 && currProb - prevProb >= 0.2)
  ) {
    return 'COMEBACK_PIVOT';
  }
  if (dramaIndex >= 70) {
    return 'CLIMAX_SPIKE';
  }
  return 'TENSION_BUILD';
}

export function selectCameraCueForBeat(
  beatType: DramaBeatType,
  dramaIndex: number,
  supportsPresencePiP: boolean = true
): DirectorCameraCue {
  switch (beatType) {
    case 'MIRACLE_CLUTCH':
    case 'CLIMAX_SPIKE':
      return 'SLOW_MO_HIGHLIGHT';
    case 'MISFIRE_SHOCK':
      return supportsPresencePiP ? 'PIP_REACTION_FOCUS' : 'TIGHT_BOARD_ZOOM';
    case 'COMEBACK_PIVOT':
      return 'SPLIT_CHALLENGE';
    case 'FINALE_PAYOFF':
      return dramaIndex >= 65 ? 'SLOW_MO_HIGHLIGHT' : 'WIDE_ESTABLISH';
    case 'OPENING_HOOK':
      return supportsPresencePiP ? 'PIP_REACTION_FOCUS' : 'WIDE_ESTABLISH';
    case 'TENSION_BUILD':
    default:
      return dramaIndex >= 48 ? 'TIGHT_BOARD_ZOOM' : 'WIDE_ESTABLISH';
  }
}

/**
 * Computes a deterministic Drama Index in `[0, 100]` and editorial beat classification
 * for a single roll/gameplay moment.
 */
export function scoreDramaMoment(
  input: DramaSignalInput,
  weights?: CartridgeDramaWeights,
  supportsPresencePiP: boolean = true
): DramaScoreBreakdown {
  const w = resolveWeights(weights);
  const currProb = clamp(input.winProbability, 0, 1);
  const prevProb = clamp(input.prevWinProbability ?? currProb, 0, 1);
  const probDelta = currProb - prevProb;

  // 1. Probability swing (up to ~35 pts)
  const probabilitySwing = round2(
    clamp(Math.abs(probDelta) * 52 * w.comebackSwingWeight, 0, 35)
  );

  // 2. Comeback / near-miss tension (critical low probability or critical hull)
  const lowProbTension =
    currProb < 0.22 ? (0.22 - currProb) * 90 * w.nearMissWeight : 0;
  const comebackSurge =
    prevProb < 0.15 && probDelta > 0.1
      ? probDelta * 36 * w.comebackSwingWeight
      : 0;
  const criticalHullTension =
    typeof input.hullIntegrity === 'number' &&
    input.hullIntegrity > 0 &&
    input.hullIntegrity <= 5
      ? (6 - input.hullIntegrity) * 4 * w.nearMissWeight
      : 0;
  const comebackTension = round2(
    clamp(lowProbTension + comebackSurge + criticalHullTension, 0, 32)
  );

  // 3. Blind skill check precision clutch
  const ratio = clamp(input.normalizedSkillRatio, 0, 1);
  const skillClutch = round2(
    ratio >= 0.85
      ? (10 + (ratio - 0.85) * 60) * w.streakMomentumWeight
      : ratio * 9 * w.streakMomentumWeight
  );

  // 4. Candidate sub-seed tier multiplier
  const tierMultiplier = round2(
    TIER_BASE_POINTS[input.selectedTier] * w.miracleTierWeight
  );

  // 5. Misfire & recovery drama
  const misfirePts = input.isDoubleOneMisfire ? 22 * w.misfireRecoveryWeight : 0;
  const recoveryPts = input.isBlindCheckRecovery
    ? 16 * w.misfireRecoveryWeight
    : 0;
  const misfireDrama = round2(clamp(misfirePts + recoveryPts, 0, 30));

  // 6. High-stakes & cartridge custom tension boost
  const baseHighStakes = input.isHighStakes ? 10 : 0;
  const customBoost = clamp(input.customTensionBoost ?? 0, 0, 15);
  const highStakesBonus = round2(baseHighStakes + customBoost);

  const rawTotal =
    probabilitySwing +
    comebackTension +
    skillClutch +
    tierMultiplier +
    misfireDrama +
    highStakesBonus;

  const dramaIndex = round2(clamp(rawTotal, 0, 100));
  const beatType = classifyBeatType(input, dramaIndex, prevProb, currProb);
  const cameraCue = selectCameraCueForBeat(
    beatType,
    dramaIndex,
    supportsPresencePiP
  );

  return {
    rollIndex: input.rollIndex,
    timestampMs: Math.max(0, Math.floor(input.timestampMs)),
    dramaIndex,
    beatType,
    cameraCue,
    components: {
      probabilitySwing,
      comebackTension,
      skillClutch,
      tierMultiplier,
      misfireDrama,
      highStakesBonus,
    },
  };
}

/**
 * Scores an ordered sequence of drama signal inputs, threading `prevWinProbability`
 * from each preceding frame when not explicitly supplied.
 */
export function scoreDramaSequence(
  inputs: readonly DramaSignalInput[],
  weights?: CartridgeDramaWeights,
  supportsPresencePiP: boolean = true
): DramaScoreBreakdown[] {
  const results: DramaScoreBreakdown[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const current = inputs[i];
    const prevWinProbability =
      current.prevWinProbability ??
      (i > 0 ? inputs[i - 1].winProbability : current.winProbability);
    results.push(
      scoreDramaMoment(
        { ...current, prevWinProbability },
        weights,
        supportsPresencePiP
      )
    );
  }
  return results;
}

/**
 * Adapts `@digitalcanopy/reels-engine` `RollTrajectoryStep[]` records into
 * DramaCast `DramaScoreBreakdown[]` outputs.
 */
export function scoreRollTrajectory(
  steps: readonly RollTrajectoryStep[],
  stepDurationMs: number = 3000,
  weights?: CartridgeDramaWeights,
  supportsPresencePiP: boolean = true
): DramaScoreBreakdown[] {
  const safeStepMs = Math.max(100, Math.floor(stepDurationMs));
  const inputs: DramaSignalInput[] = steps.map((step, index) => ({
    rollIndex: step.rollIndex,
    timestampMs: index * safeStepMs,
    winProbability: step.winProbability,
    prevWinProbability:
      index > 0 ? steps[index - 1].winProbability : step.winProbability,
    selectedTier: step.selectedTier,
    normalizedSkillRatio: step.normalizedSkillRatio,
    isDoubleOneMisfire: step.isDoubleOneMisfire,
    isBlindCheckRecovery: step.isBlindCheckRecovery,
    scoreDelta: index > 0 ? step.score - steps[index - 1].score : step.score,
    totalScore: step.score,
    hullIntegrity: step.hullIntegrity,
  }));

  return scoreDramaSequence(inputs, weights, supportsPresencePiP);
}
