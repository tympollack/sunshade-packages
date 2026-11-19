import type {
  CastLedgerBadge,
  CastLedgerEntry,
  MiracleSeedCandidate,
  MiracleSeedSnapshot,
  RollTrajectoryStep,
} from '../types';
import { sha256HexSync } from '../prng';

export const MIRACLE_WIN_PROBABILITY_THRESHOLD = 0.12;

export interface MatchLedgerContext {
  matchId: string;
  cartridgeId: string;
  rootSeed: string;
  playerId: string;
  didWin: boolean;
  steps: RollTrajectoryStep[];
  awardedAt?: string;
}

/**
 * Evaluates a match's roll trajectory and returns a `MiracleSeedCandidate` if the player
 * won after recovering from `<12%` win probability (`0.12`) or a lowest-tier double-1
 * misfire (`isDoubleOneMisfire`).
 */
export function detectMiracleSeedCandidate(
  context: MatchLedgerContext
): MiracleSeedCandidate | null {
  if (!context.didWin || context.steps.length === 0) {
    return null;
  }

  let lowestProbabilityStep = context.steps[0];
  let snakeEyesStep: RollTrajectoryStep | null = null;

  for (const step of context.steps) {
    if (step.winProbability < lowestProbabilityStep.winProbability) {
      lowestProbabilityStep = step;
    }
    if (step.isDoubleOneMisfire && !snakeEyesStep) {
      snakeEyesStep = step;
    }
  }

  const finalScore = context.steps[context.steps.length - 1].score;

  if (
    lowestProbabilityStep.winProbability < MIRACLE_WIN_PROBABILITY_THRESHOLD
  ) {
    return {
      matchId: context.matchId,
      cartridgeId: context.cartridgeId,
      rootSeed: context.rootSeed,
      checkpointRollIndex: lowestProbabilityStep.rollIndex,
      lowestWinProbability: lowestProbabilityStep.winProbability,
      triggerReason: 'LOW_WIN_PROBABILITY',
      finalScore,
    };
  }

  if (snakeEyesStep) {
    return {
      matchId: context.matchId,
      cartridgeId: context.cartridgeId,
      rootSeed: context.rootSeed,
      checkpointRollIndex: snakeEyesStep.rollIndex,
      lowestWinProbability: lowestProbabilityStep.winProbability,
      triggerReason: 'SNAKE_EYES_RECOVERY',
      finalScore,
    };
  }

  return null;
}

/**
 * Creates a playable `MiracleSeedSnapshot` from a match trajectory and `MiracleSeedCandidate`
 * so other players can load the exact checkpoint board state and attempt to beat `targetScoreToBeat`.
 */
export function createMiracleSeedSnapshot(
  candidate: MiracleSeedCandidate,
  steps: RollTrajectoryStep[]
): MiracleSeedSnapshot {
  const checkpointStep =
    steps.find((s) => s.rollIndex === candidate.checkpointRollIndex) ??
    steps[0];

  const boardSnapshot: Record<string, unknown> = checkpointStep?.boardState
    ? JSON.parse(JSON.stringify(checkpointStep.boardState))
    : {
        rollIndex: candidate.checkpointRollIndex,
        scoreAtCheckpoint: checkpointStep?.score ?? 0,
        winProbabilityAtCheckpoint:
          checkpointStep?.winProbability ?? candidate.lowestWinProbability,
      };

  return {
    rootSeed: candidate.rootSeed,
    cartridgeId: candidate.cartridgeId,
    checkpointRollIndex: candidate.checkpointRollIndex,
    boardSnapshot,
    targetScoreToBeat: candidate.finalScore,
  };
}

/**
 * Serializes a `MiracleSeedSnapshot` to a compact deterministic JSON string.
 */
export function serializeMiracleSeedSnapshot(
  snapshot: MiracleSeedSnapshot
): string {
  return JSON.stringify(snapshot);
}

/**
 * Deserializes and validates a `MiracleSeedSnapshot` JSON payload, reproducing
 * the exact checkpoint board state.
 */
export function deserializeMiracleSeedSnapshot(
  payload: string
): MiracleSeedSnapshot {
  const parsed = JSON.parse(payload) as MiracleSeedSnapshot;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof parsed.rootSeed !== 'string' ||
    typeof parsed.cartridgeId !== 'string' ||
    typeof parsed.checkpointRollIndex !== 'number' ||
    typeof parsed.targetScoreToBeat !== 'number' ||
    typeof parsed.boardSnapshot !== 'object' ||
    parsed.boardSnapshot === null
  ) {
    throw new Error('Invalid MiracleSeedSnapshot payload.');
  }

  return {
    rootSeed: parsed.rootSeed,
    cartridgeId: parsed.cartridgeId,
    checkpointRollIndex: parsed.checkpointRollIndex,
    boardSnapshot: JSON.parse(JSON.stringify(parsed.boardSnapshot)),
    targetScoreToBeat: parsed.targetScoreToBeat,
  };
}

function buildLedgerEntry(
  context: MatchLedgerContext,
  badge: CastLedgerBadge,
  rollIndex: number,
  summary: string
): CastLedgerEntry {
  const awardedAt = context.awardedAt ?? new Date().toISOString();
  const miracleSeedHash = sha256HexSync(
    `reels:miracle:v1:${context.rootSeed}:${context.matchId}:${rollIndex}:${badge}`
  );

  return {
    entryId: `ledger:${context.matchId}:${context.playerId}:${badge}`,
    matchId: context.matchId,
    cartridgeId: context.cartridgeId,
    playerId: context.playerId,
    badge,
    awardedAt,
    rollIndex,
    miracleSeedHash,
    summary,
  };
}

/**
 * Evaluates all Cast Ledger prestige title rules across a match trajectory:
 * - `SNAKE_EYES`: Double-1 misfire (`isDoubleOneMisfire`) followed by a blind skill check recovery
 *   (`isBlindCheckRecovery` or subsequent step reaching `tier2_clutch`/`tier3_miracle` or `normalizedSkillRatio >= 0.8`).
 * - `GAME_MASTER`: Achieving 3 or more high-precision blind skill checks (`normalizedSkillRatio >= 0.9`)
 *   and winning the match.
 * - `SECOND_WIND`: Winning a match after dropping below `<12%` (`0.12`) win probability.
 * - `SMUGGLER_KING`: Winning a match after successfully carrying contraband (`contrabandHoldCount >= 3`)
 *   or resolving a `tier3_miracle` sub-seed on a high-score haul.
 * - `GHOST_SHIP`: Winning or surviving a step at critical hull integrity (`0 < hullIntegrity <= 5`).
 * - `AGAINST_ALL_ODDS`: Winning a match after dropping below `<5%` (`0.05`) win probability.
 */
export function evaluateCastLedgerBadges(
  context: MatchLedgerContext
): CastLedgerEntry[] {
  const entries: CastLedgerEntry[] = [];
  const { steps, didWin } = context;
  if (steps.length === 0) return entries;

  // 1. SNAKE_EYES: double-1 misfire + blind check recovery
  const misfireIndex = steps.findIndex((s) => s.isDoubleOneMisfire === true);
  if (misfireIndex !== -1) {
    const misfireStep = steps[misfireIndex];
    const recoveredOnSameOrLaterStep = steps
      .slice(misfireIndex)
      .find(
        (s, idx) =>
          s.isBlindCheckRecovery === true ||
          (idx > 0 &&
            (s.selectedTier === 'tier2_clutch' ||
              s.selectedTier === 'tier3_miracle' ||
              s.normalizedSkillRatio >= 0.8))
      );

    if (recoveredOnSameOrLaterStep) {
      entries.push(
        buildLedgerEntry(
          context,
          'SNAKE_EYES',
          misfireStep.rollIndex,
          'Recovered from a double-1 misfire via blind skill check recovery.'
        )
      );
    }
  }

  // 2. GAME_MASTER: 3+ elite blind checks (>= 0.90) in a victorious match
  const eliteChecks = steps.filter((s) => s.normalizedSkillRatio >= 0.9);
  if (didWin && eliteChecks.length >= 3) {
    const lastElite = eliteChecks[eliteChecks.length - 1];
    entries.push(
      buildLedgerEntry(
        context,
        'GAME_MASTER',
        lastElite.rollIndex,
        `Executed ${eliteChecks.length} master-grade blind skill checks (>=90% precision).`
      )
    );
  }

  // 3. SECOND_WIND: Victory after dropping below 12% win probability
  const sub12Step = steps.find(
    (s) => s.winProbability < MIRACLE_WIN_PROBABILITY_THRESHOLD
  );
  if (didWin && sub12Step) {
    entries.push(
      buildLedgerEntry(
        context,
        'SECOND_WIND',
        sub12Step.rollIndex,
        `Rallied to victory from ${(sub12Step.winProbability * 100).toFixed(1)}% win probability.`
      )
    );
  }

  // 4. SMUGGLER_KING: Contraband hold >= 3 in a victorious match
  const smugglerStep = steps.find((s) => (s.contrabandHoldCount ?? 0) >= 3);
  if (didWin && smugglerStep) {
    entries.push(
      buildLedgerEntry(
        context,
        'SMUGGLER_KING',
        smugglerStep.rollIndex,
        `Cleared customs with ${smugglerStep.contrabandHoldCount} contraband holds intact.`
      )
    );
  }

  // 5. GHOST_SHIP: Victory after surviving critical hull integrity (<= 5%)
  const ghostStep = steps.find(
    (s) =>
      typeof s.hullIntegrity === 'number' &&
      s.hullIntegrity > 0 &&
      s.hullIntegrity <= 5
  );
  if (didWin && ghostStep) {
    entries.push(
      buildLedgerEntry(
        context,
        'GHOST_SHIP',
        ghostStep.rollIndex,
        `Limped across the finish line at ${ghostStep.hullIntegrity}% hull integrity.`
      )
    );
  }

  // 6. AGAINST_ALL_ODDS: Victory after dropping below 5% win probability
  const sub5Step = steps.find((s) => s.winProbability < 0.05);
  if (didWin && sub5Step) {
    entries.push(
      buildLedgerEntry(
        context,
        'AGAINST_ALL_ODDS',
        sub5Step.rollIndex,
        `Defied elimination from ${(sub5Step.winProbability * 100).toFixed(1)}% win probability.`
      )
    );
  }

  return entries;
}
