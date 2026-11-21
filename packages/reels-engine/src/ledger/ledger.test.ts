import { describe, it, expect } from 'vitest';
import {
  createMiracleSeedSnapshot,
  deserializeMiracleSeedSnapshot,
  detectMiracleSeedCandidate,
  evaluateCastLedgerBadges,
  serializeMiracleSeedSnapshot,
  type MatchLedgerContext,
} from './index';
import { generateDeterministicRoll } from '../prng';

describe('@digitalcanopy/reels-engine Miracle Seed Snapshotter & Cast Ledger Prestige Title Evaluator', () => {
  it('triggers SNAKE_EYES on double-1 misfire + blind check recovery, reproduces exact board state, and regenerates identical subsequent source rolls from MiracleSeedSnapshot', async () => {
    const expectedCheckpointBoard = {
      sector: 'Orion-Belt-7',
      fuelCells: 1,
      credits: 420,
      enemiesApproaching: ['Corsair-Alpha', 'Dreadnought-V'],
      shieldActive: false,
    };

    const sourceMatchId = 'match-snake-eyes-01';
    const sourceRootSeed = 'miracle-seed-root-9921';
    const sourceNextRoll = await generateDeterministicRoll(
      sourceRootSeed,
      sourceMatchId,
      2
    );

    const context: MatchLedgerContext = {
      matchId: sourceMatchId,
      cartridgeId: 'sector-smuggler',
      rootSeed: sourceRootSeed,
      playerId: 'player-tymz',
      didWin: true,
      awardedAt: '2026-11-19T14:30:00.000Z',
      steps: [
        {
          rollIndex: 0,
          winProbability: 0.52,
          selectedTier: 'tier1_favorable',
          selectedSubSeed: 'a'.repeat(64),
          normalizedSkillRatio: 0.65,
          score: 120,
        },
        {
          rollIndex: 1,
          winProbability: 0.14,
          selectedTier: 'tier0_baseline',
          selectedSubSeed: 'b'.repeat(64),
          normalizedSkillRatio: 0.25,
          isDoubleOneMisfire: true,
          boardState: expectedCheckpointBoard,
          score: 60,
        },
        {
          rollIndex: 2,
          winProbability: 0.68,
          selectedTier: 'tier2_clutch',
          selectedSubSeed: sourceNextRoll.candidateSubSeeds[2],
          normalizedSkillRatio: 0.92,
          isBlindCheckRecovery: true,
          score: 840,
        },
      ],
    };

    const badges = evaluateCastLedgerBadges(context);
    const badgeTypes = badges.map((b) => b.badge);
    expect(badgeTypes).toContain('SNAKE_EYES');

    const snakeEyesEntry = badges.find((b) => b.badge === 'SNAKE_EYES')!;
    expect(snakeEyesEntry.rollIndex).toBe(1);
    expect(snakeEyesEntry.miracleSeedHash).toHaveLength(64);

    const candidate = detectMiracleSeedCandidate(context);
    expect(candidate).not.toBeNull();
    expect(candidate?.triggerReason).toBe('SNAKE_EYES_RECOVERY');
    expect(candidate?.checkpointRollIndex).toBe(1);
    expect(candidate?.finalScore).toBe(840);

    const snapshot = createMiracleSeedSnapshot(candidate!, context.steps);
    const serialized = serializeMiracleSeedSnapshot(snapshot);
    const restored = deserializeMiracleSeedSnapshot(serialized);

    expect(restored.matchId).toBe(sourceMatchId);
    expect(restored.rootSeed).toBe(sourceRootSeed);
    expect(restored.cartridgeId).toBe('sector-smuggler');
    expect(restored.checkpointRollIndex).toBe(1);
    expect(restored.targetScoreToBeat).toBe(840);
    expect(restored.boardSnapshot).toEqual(expectedCheckpointBoard);

    // Regenerate subsequent roll using only the exported snapshot fields
    const replayedNextRoll = await generateDeterministicRoll(
      restored.rootSeed,
      restored.matchId,
      restored.checkpointRollIndex + 1
    );
    expect(replayedNextRoll).toEqual(sourceNextRoll);
  });

  it('flags <12% win-probability comeback as MiracleSeedCandidate and awards GAME_MASTER, SECOND_WIND, SMUGGLER_KING, GHOST_SHIP, and AGAINST_ALL_ODDS', () => {
    const context: MatchLedgerContext = {
      matchId: 'match-grand-comeback',
      cartridgeId: 'sector-smuggler',
      rootSeed: 'seed-comeback-777',
      playerId: 'player-ace',
      didWin: true,
      awardedAt: '2026-11-19T15:00:00.000Z',
      steps: [
        {
          rollIndex: 0,
          winProbability: 0.45,
          selectedTier: 'tier1_favorable',
          selectedSubSeed: '1'.repeat(64),
          normalizedSkillRatio: 0.91,
          score: 200,
        },
        {
          rollIndex: 1,
          winProbability: 0.04,
          selectedTier: 'tier0_baseline',
          selectedSubSeed: '2'.repeat(64),
          normalizedSkillRatio: 0.4,
          hullIntegrity: 3,
          boardState: { hull: 3, sector: 'Abyss-9' },
          score: 90,
        },
        {
          rollIndex: 2,
          winProbability: 0.55,
          selectedTier: 'tier2_clutch',
          selectedSubSeed: '3'.repeat(64),
          normalizedSkillRatio: 0.95,
          contrabandHoldCount: 4,
          score: 650,
        },
        {
          rollIndex: 3,
          winProbability: 0.99,
          selectedTier: 'tier3_miracle',
          selectedSubSeed: '4'.repeat(64),
          normalizedSkillRatio: 0.98,
          score: 1500,
        },
      ],
    };

    const candidate = detectMiracleSeedCandidate(context);
    expect(candidate).not.toBeNull();
    expect(candidate?.triggerReason).toBe('LOW_WIN_PROBABILITY');
    expect(candidate?.checkpointRollIndex).toBe(1);
    expect(candidate?.lowestWinProbability).toBe(0.04);

    const badges = evaluateCastLedgerBadges(context).map((b) => b.badge);
    expect(badges).toContain('GAME_MASTER');
    expect(badges).toContain('SECOND_WIND');
    expect(badges).toContain('SMUGGLER_KING');
    expect(badges).toContain('GHOST_SHIP');
    expect(badges).toContain('AGAINST_ALL_ODDS');
  });

  it('awards SMUGGLER_KING on tier3_miracle high-score haul without contraband and GHOST_SHIP on non-victorious critical-hull survival', () => {
    const miracleHaulContext: MatchLedgerContext = {
      matchId: 'match-miracle-haul',
      cartridgeId: 'sector-smuggler',
      rootSeed: 'seed-haul',
      playerId: 'player-haul',
      didWin: true,
      steps: [
        {
          rollIndex: 0,
          winProbability: 0.8,
          selectedTier: 'tier3_miracle',
          selectedSubSeed: '9'.repeat(64),
          normalizedSkillRatio: 0.85,
          score: 1250,
        },
      ],
    };

    const haulBadges = evaluateCastLedgerBadges(miracleHaulContext).map(
      (b) => b.badge
    );
    expect(haulBadges).toContain('SMUGGLER_KING');

    const nonVictorGhostContext: MatchLedgerContext = {
      matchId: 'match-ghost-survivor',
      cartridgeId: 'sector-smuggler',
      rootSeed: 'seed-ghost',
      playerId: 'player-ghost',
      didWin: false,
      steps: [
        {
          rollIndex: 0,
          winProbability: 0.2,
          selectedTier: 'tier0_baseline',
          selectedSubSeed: '5'.repeat(64),
          normalizedSkillRatio: 0.4,
          hullIntegrity: 2,
          score: 50,
        },
        {
          rollIndex: 1,
          winProbability: 0.3,
          selectedTier: 'tier1_favorable',
          selectedSubSeed: '6'.repeat(64),
          normalizedSkillRatio: 0.6,
          hullIntegrity: 2,
          score: 110,
        },
      ],
    };

    const ghostBadges = evaluateCastLedgerBadges(nonVictorGhostContext).map(
      (b) => b.badge
    );
    expect(ghostBadges).toContain('GHOST_SHIP');
  });

  it('does not flag a MiracleSeedCandidate when the player loses the match', () => {
    const lostContext: MatchLedgerContext = {
      matchId: 'match-loss',
      cartridgeId: 'sector-smuggler',
      rootSeed: 'seed-loss',
      playerId: 'player-1',
      didWin: false,
      steps: [
        {
          rollIndex: 0,
          winProbability: 0.02,
          selectedTier: 'tier0_baseline',
          selectedSubSeed: '0'.repeat(64),
          normalizedSkillRatio: 0.1,
          score: 10,
        },
      ],
    };

    expect(detectMiracleSeedCandidate(lostContext)).toBeNull();
  });
});
