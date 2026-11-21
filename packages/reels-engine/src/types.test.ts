import { describe, it, expect } from 'vitest';
import type {
  DeterministicRoll,
  BlindSkillSubmission,
  BankedStub,
  CastLedgerBadge,
  RollPool,
  BlindCheckResult,
  CastLedgerEntry,
} from './index';

describe('@digitalcanopy/reels-engine domain contracts', () => {
  it('supports DeterministicRoll, BlindSkillSubmission, BankedStub, and CastLedgerBadge contracts', () => {
    const roll: DeterministicRoll = {
      index: 0,
      baseSeedHash: 'a'.repeat(64),
      candidateSubSeeds: ['b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64), 'e'.repeat(64)],
      isHighStakes: true,
      eventTag: 'WARP_JUMP',
    };

    const submission: BlindSkillSubmission = {
      rollIndex: 0,
      minigameId: 'lockpick-pulse',
      rawScore: 88,
      maxScore: 100,
      clientSignature: 'sig_01',
      submittedAt: '2026-11-19T14:00:00.000Z',
    };

    const stub: BankedStub = {
      stubId: 'stub_01',
      matchId: 'match_01',
      cartridgeId: 'sector-smuggler',
      rollIndex: 0,
      sealedPayload: 'encrypted_payload_base64',
      expiresAt: null,
    };

    const badges: CastLedgerBadge[] = [
      'SNAKE_EYES',
      'GAME_MASTER',
      'SECOND_WIND',
      'SMUGGLER_KING',
      'GHOST_SHIP',
      'AGAINST_ALL_ODDS',
    ];

    const pool: RollPool = {
      rootSeed: 'seed_root',
      matchId: 'match_01',
      cartridgeId: 'sector-smuggler',
      rolls: [roll],
    };

    const checkResult: BlindCheckResult = {
      rollIndex: 0,
      minigameId: 'lockpick-pulse',
      normalizedRatio: 0.88,
      selectedTierIndex: 2,
      selectedTier: 'tier2_clutch',
      selectedSubSeed: roll.candidateSubSeeds[2],
      selectionRoll: 0.72,
      tierProbabilities: {
        tier0_baseline: 0.1,
        tier1_favorable: 0.3,
        tier2_clutch: 0.45,
        tier3_miracle: 0.15,
      },
      isDoubleOneMisfire: false,
    };

    const ledgerEntry: CastLedgerEntry = {
      entryId: 'entry_01',
      matchId: 'match_01',
      cartridgeId: 'sector-smuggler',
      playerId: 'player_01',
      badge: 'SNAKE_EYES',
      awardedAt: '2026-11-19T14:05:00.000Z',
      rollIndex: 0,
      summary: 'Recovered from a double-1 misfire via blind check.',
    };

    expect(roll.candidateSubSeeds).toHaveLength(4);
    expect(submission.rawScore / submission.maxScore).toBeCloseTo(0.88);
    expect(stub.expiresAt).toBeNull();
    expect(badges).toContain('AGAINST_ALL_ODDS');
    expect(pool.rolls[0]).toEqual(roll);
    expect(checkResult.selectedTier).toBe('tier2_clutch');
    expect(ledgerEntry.badge).toBe('SNAKE_EYES');
  });
});
