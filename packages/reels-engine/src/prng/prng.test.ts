import { describe, it, expect } from 'vitest';
import {
  SUB_SEED_TIERS,
  computeTierProbabilities,
  deriveCandidateSubSeeds,
  deriveRollSeed,
  generateDeterministicRoll,
  generateRollPool,
  normalizeSkillRatio,
  resolveBlindCheckSubSeed,
  sha256Hex,
  sha256HexSync,
  toClientRollPreview,
} from './index';
import type { BlindSkillSubmission } from '../types';

describe('@digitalcanopy/reels-engine PRNG & Blind Score Sub-Seed Shifter', () => {
  it('matches Web Crypto SHA-256 and synchronous fallback identically', async () => {
    const sample = 'reels:roll:v1:seed-alpha:match-99:42';
    const asyncHash = await sha256Hex(sample);
    const syncHash = sha256HexSync(sample);

    expect(asyncHash).toHaveLength(64);
    expect(asyncHash).toBe(syncHash);
  });

  it('derives independent, reproducible roll seeds and 4 tiered candidate sub-seeds', async () => {
    const seed0A = await deriveRollSeed('root-seed-1', 'match-1', 0);
    const seed0B = await deriveRollSeed('root-seed-1', 'match-1', 0);
    const seed1 = await deriveRollSeed('root-seed-1', 'match-1', 1);

    expect(seed0A).toBe(seed0B);
    expect(seed0A).not.toBe(seed1);

    const subSeeds = await deriveCandidateSubSeeds(seed0A);
    expect(subSeeds).toHaveLength(4);
    expect(new Set(subSeeds).size).toBe(4);
  });

  it('maps normalized ratio onto a monotonic probability curve where no tier is 0% or 100%', () => {
    const low = computeTierProbabilities(0);
    const mid = computeTierProbabilities(0.5);
    const high = computeTierProbabilities(1);

    for (const dist of [low, mid, high]) {
      const total =
        dist.tier0_baseline +
        dist.tier1_favorable +
        dist.tier2_clutch +
        dist.tier3_miracle;
      expect(total).toBeCloseTo(1, 10);

      for (const tier of SUB_SEED_TIERS) {
        expect(dist[tier]).toBeGreaterThan(0);
        expect(dist[tier]).toBeLessThan(1);
      }
    }

    // Higher skill ratio shifts cumulative probability toward upper tiers
    const lowUpper = low.tier2_clutch + low.tier3_miracle;
    const midUpper = mid.tier2_clutch + mid.tier3_miracle;
    const highUpper = high.tier2_clutch + high.tier3_miracle;

    expect(midUpper).toBeGreaterThan(lowUpper);
    expect(highUpper).toBeGreaterThan(midUpper);
    expect(high.tier3_miracle).toBeGreaterThan(mid.tier3_miracle);
    expect(mid.tier3_miracle).toBeGreaterThan(low.tier3_miracle);
    expect(high.tier0_baseline).toBeLessThan(low.tier0_baseline);
  });

  it('normalizes edge-case skill scores safely into [0, 1]', () => {
    expect(normalizeSkillRatio(-15, 100)).toBe(0);
    expect(normalizeSkillRatio(150, 100)).toBe(1);
    expect(normalizeSkillRatio(50, 0)).toBe(0);
    expect(normalizeSkillRatio(Number.NaN, 100)).toBe(0);
    expect(normalizeSkillRatio(75, 100)).toBe(0.75);
  });

  it('strips candidateSubSeeds and outcome spoiler flags in toClientRollPreview', async () => {
    const pool = await generateRollPool('leak-test-root', 'match-leak', 50);

    for (const roll of pool.rolls) {
      const preview = toClientRollPreview(roll);
      const serialized = JSON.stringify(preview);

      expect(Object.keys(preview).sort()).toEqual(
        ['baseSeedHash', 'eventTag', 'index'].sort()
      );
      expect('candidateSubSeeds' in preview).toBe(false);
      expect('isHighStakes' in preview).toBe(false);

      for (const subSeed of roll.candidateSubSeeds) {
        expect(serialized).not.toContain(subSeed);
      }
    }
  });

  it('reproduces identical replay outputs across 10,000 simulated rolls given identical (rootSeed, submissions)', async () => {
    const totalRolls = 10_000;
    const rootSeed = 'production-replay-verification-seed-2026';
    const matchId = 'match-10k-verification';

    const submissions: BlindSkillSubmission[] = Array.from(
      { length: totalRolls },
      (_, i) => ({
        rollIndex: i,
        minigameId: i % 2 === 0 ? 'warp-calibration' : 'customs-jammer',
        rawScore: (i * 37) % 101,
        maxScore: 100,
        clientSignature: `sig-${i}`,
        submittedAt: '2026-11-19T14:00:00.000Z',
      })
    );

    const runSimulation = async () => {
      const results: string[] = new Array(totalRolls);
      const batchSize = 500;
      for (let start = 0; start < totalRolls; start += batchSize) {
        const end = Math.min(totalRolls, start + batchSize);
        const batchPromises: Promise<void>[] = [];
        for (let i = start; i < end; i++) {
          batchPromises.push(
            (async () => {
              const roll = await generateDeterministicRoll(rootSeed, matchId, i);
              const res = await resolveBlindCheckSubSeed(roll, submissions[i]);
              results[i] = `${res.selectedTier}:${res.selectedSubSeed}`;
            })()
          );
        }
        await Promise.all(batchPromises);
      }
      return results;
    };

    const [firstRun, secondRun] = await Promise.all([
      runSimulation(),
      runSimulation(),
    ]);

    expect(firstRun).toHaveLength(totalRolls);
    expect(firstRun).toEqual(secondRun);
  }, 30_000);
});
