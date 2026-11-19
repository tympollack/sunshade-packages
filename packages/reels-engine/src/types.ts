/**
 * Tier labels for deterministic roll candidate sub-seeds.
 */
export type SubSeedTier =
  | 'tier0_baseline'
  | 'tier1_favorable'
  | 'tier2_clutch'
  | 'tier3_miracle';

/**
 * Deterministic roll record produced by the SHA-256 roll pool generator.
 */
export interface DeterministicRoll {
  index: number;
  baseSeedHash: string;
  candidateSubSeeds: string[];
  isHighStakes: boolean;
  eventTag: string;
}

/**
 * Client-safe projection of a DeterministicRoll with all candidate sub-seeds
 * and spoiler flags stripped.
 */
export interface ClientRollPreview {
  index: number;
  baseSeedHash: string;
  eventTag: string;
}

/**
 * Complete deterministic roll pool for a match or cartridge chapter.
 */
export interface RollPool {
  rootSeed: string;
  matchId: string;
  cartridgeId: string;
  rolls: DeterministicRoll[];
}

/**
 * Blind skill minigame submission sent by a client prior to outcome reveal.
 */
export interface BlindSkillSubmission {
  rollIndex: number;
  minigameId: string;
  rawScore: number;
  maxScore: number;
  clientSignature: string;
  submittedAt: string;
}

/**
 * Tier selection probability distribution across the 4 candidate sub-seeds.
 */
export interface TierProbabilityDistribution {
  tier0_baseline: number;
  tier1_favorable: number;
  tier2_clutch: number;
  tier3_miracle: number;
}

/**
 * Deterministic result of resolving a blind skill submission against a roll's candidate sub-seeds.
 */
export interface BlindCheckResult {
  rollIndex: number;
  minigameId: string;
  normalizedRatio: number;
  selectedTierIndex: 0 | 1 | 2 | 3;
  selectedTier: SubSeedTier;
  selectedSubSeed: string;
  selectionRoll: number;
  tierProbabilities: TierProbabilityDistribution;
  isDoubleOneMisfire: boolean;
}

/**
 * Status of a banked bonus stub in the offline-first Stub Vault.
 */
export type StubResolutionStatus = 'active' | 'resolved' | 'expired';

/**
 * Offline-first encrypted/sealed bonus stub banked when a high-stakes trigger
 * is interrupted or deferred at a chapter boundary.
 */
export interface BankedStub {
  stubId: string;
  matchId: string;
  cartridgeId: string;
  rollIndex: number;
  sealedPayload: string;
  expiresAt: string | null;
}

/**
 * Resolution receipt returned when a BankedStub is claimed.
 * Enforces idempotent resolution so repeated claims return the exact original record.
 */
export interface StubResolutionRecord {
  stubId: string;
  matchId: string;
  cartridgeId: string;
  rollIndex: number;
  resolvedAt: string;
  selectedSubSeed: string;
  selectedTier: SubSeedTier;
  outcomeHash: string;
  submission?: BlindSkillSubmission;
}

/**
 * Prestige badges awarded to a player's permanent Cast Ledger.
 */
export type CastLedgerBadge =
  | 'SNAKE_EYES'
  | 'GAME_MASTER'
  | 'SECOND_WIND'
  | 'SMUGGLER_KING'
  | 'GHOST_SHIP'
  | 'AGAINST_ALL_ODDS';

/**
 * Permanent Cast Ledger prestige entry awarded upon completing remarkable match feats.
 */
export interface CastLedgerEntry {
  entryId: string;
  matchId: string;
  cartridgeId: string;
  playerId: string;
  badge: CastLedgerBadge;
  awardedAt: string;
  rollIndex: number;
  miracleSeedHash?: string;
  summary: string;
}

/**
 * Step telemetry record tracking win probability and roll events across a match.
 */
export interface RollTrajectoryStep {
  rollIndex: number;
  winProbability: number;
  selectedTier: SubSeedTier;
  selectedSubSeed: string;
  normalizedSkillRatio: number;
  isDoubleOneMisfire?: boolean;
  isBlindCheckRecovery?: boolean;
  contrabandHoldCount?: number;
  hullIntegrity?: number;
  boardState?: Record<string, unknown>;
  score: number;
}

/**
 * Candidate flagged when a player wins a match after recovering from <12% win probability
 * or a lowest-tier Snake Eyes misfire.
 */
export interface MiracleSeedCandidate {
  matchId: string;
  cartridgeId: string;
  rootSeed: string;
  checkpointRollIndex: number;
  lowestWinProbability: number;
  triggerReason: 'LOW_WIN_PROBABILITY' | 'SNAKE_EYES_RECOVERY';
  finalScore: number;
}

/**
 * Playable puzzle snapshot exported from a MiracleSeedCandidate so other players
 * can challenge the exact comeback scenario.
 */
export interface MiracleSeedSnapshot {
  rootSeed: string;
  cartridgeId: string;
  checkpointRollIndex: number;
  boardSnapshot: Record<string, unknown>;
  targetScoreToBeat: number;
}
