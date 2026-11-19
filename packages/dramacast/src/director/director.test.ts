import { describe, it, expect } from 'vitest';
import type { RollTrajectoryStep } from '@digitalcanopy/reels-engine';
import {
  buildDirectorTimelinePlan,
  createDirectorTimelineFromTrajectory,
  scoreDramaMoment,
  scoreDramaSequence,
} from './index';

describe('@digitalcanopy/dramacast Drama Index Scorer & 60s Director Keyframe Pacing', () => {
  it('scores comeback swings, snake-eyes misfires, and miracle clutches higher than routine rolls', () => {
    const routine = scoreDramaMoment({
      rollIndex: 0,
      timestampMs: 0,
      winProbability: 0.52,
      prevWinProbability: 0.5,
      selectedTier: 'tier0_baseline',
      normalizedSkillRatio: 0.4,
    });

    const misfire = scoreDramaMoment({
      rollIndex: 1,
      timestampMs: 3000,
      winProbability: 0.12,
      prevWinProbability: 0.52,
      selectedTier: 'tier0_baseline',
      normalizedSkillRatio: 0.3,
      isDoubleOneMisfire: true,
      hullIntegrity: 3,
      isHighStakes: true,
    });

    const miracleClutch = scoreDramaMoment({
      rollIndex: 2,
      timestampMs: 6000,
      winProbability: 0.82,
      prevWinProbability: 0.12,
      selectedTier: 'tier3_miracle',
      normalizedSkillRatio: 0.96,
      isBlindCheckRecovery: true,
      isHighStakes: true,
    });

    expect(routine.dramaIndex).toBeLessThan(25);
    expect(misfire.beatType).toBe('MISFIRE_SHOCK');
    expect(misfire.cameraCue).toBe('PIP_REACTION_FOCUS');
    expect(misfire.dramaIndex).toBeGreaterThan(60);

    expect(miracleClutch.beatType).toBe('MIRACLE_CLUTCH');
    expect(miracleClutch.cameraCue).toBe('SLOW_MO_HIGHLIGHT');
    expect(miracleClutch.dramaIndex).toBeGreaterThan(85);
    expect(miracleClutch.dramaIndex).toBeLessThanOrEqual(100);
  });

  it('paces a 45-roll trajectory into an exact 60,000ms DirectorTimelinePlan preserving climax & hook', () => {
    const steps: RollTrajectoryStep[] = Array.from({ length: 45 }, (_, idx) => {
      if (idx === 12) {
        return {
          rollIndex: idx,
          winProbability: 0.08,
          selectedTier: 'tier0_baseline',
          selectedSubSeed: 'a'.repeat(64),
          normalizedSkillRatio: 0.2,
          isDoubleOneMisfire: true,
          hullIntegrity: 2,
          score: 200,
        };
      }
      if (idx === 31) {
        return {
          rollIndex: idx,
          winProbability: 0.84,
          selectedTier: 'tier3_miracle',
          selectedSubSeed: 'b'.repeat(64),
          normalizedSkillRatio: 0.97,
          isBlindCheckRecovery: true,
          score: 1850,
        };
      }
      return {
        rollIndex: idx,
        winProbability: 0.45 + (idx % 5) * 0.03,
        selectedTier: idx % 4 === 0 ? 'tier1_favorable' : 'tier0_baseline',
        selectedSubSeed: 'c'.repeat(64),
        normalizedSkillRatio: 0.55,
        score: 100 + idx * 35,
      };
    });

    const { breakdowns, plan } = createDirectorTimelineFromTrajectory(steps, {
      matchId: 'match-45-rolls',
      cartridgeId: 'sector-smuggler',
      targetDurationMs: 60_000,
      stepDurationMs: 4_000,
    });

    expect(breakdowns).toHaveLength(45);
    expect(plan.targetDurationMs).toBe(60_000);
    expect(plan.totalSourceDurationMs).toBe(44 * 4_000 + 3_000);
    expect(plan.keyframes.length).toBeGreaterThan(3);
    expect(plan.keyframes.length).toBeLessThanOrEqual(30);

    // Exact millisecond coverage with contiguous start/end
    const totalMs = plan.keyframes.reduce((acc, kf) => acc + kf.durationMs, 0);
    expect(totalMs).toBe(60_000);
    expect(plan.keyframes[0].startMs).toBe(0);
    expect(plan.keyframes[plan.keyframes.length - 1].endMs).toBe(60_000);

    for (let i = 1; i < plan.keyframes.length; i++) {
      expect(plan.keyframes[i].startMs).toBe(plan.keyframes[i - 1].endMs);
      expect(plan.keyframes[i].sourceRollIndex).toBeGreaterThan(
        plan.keyframes[i - 1].sourceRollIndex
      );
    }

    // Peak climax roll (31) and misfire roll (12) must be preserved in the cut
    const includedRolls = plan.keyframes.map((k) => k.sourceRollIndex);
    expect(includedRolls).toContain(0);
    expect(includedRolls).toContain(12);
    expect(includedRolls).toContain(31);
    expect(includedRolls).toContain(44);
    expect(plan.peakRollIndex).toBe(31);
    expect(plan.climaxKeyframeId).toContain('r31');

    const climaxKf = plan.keyframes.find((k) => k.keyframeId === plan.climaxKeyframeId);
    expect(climaxKf?.playbackRate).toBe(0.75);
    expect(climaxKf?.cameraCue).toBe('SLOW_MO_HIGHLIGHT');
  });

  it('handles empty and single-moment timelines safely without NaN or drift', () => {
    const emptyPlan = buildDirectorTimelinePlan([], {
      matchId: 'empty',
      cartridgeId: 'sector-smuggler',
    });
    expect(emptyPlan.keyframes).toEqual([]);
    expect(emptyPlan.peakDramaIndex).toBe(0);

    const single = scoreDramaSequence([
      {
        rollIndex: 0,
        timestampMs: 0,
        winProbability: 0.75,
        selectedTier: 'tier2_clutch',
        normalizedSkillRatio: 0.88,
      },
    ]);
    const singlePlan = buildDirectorTimelinePlan(single, {
      matchId: 'single',
      cartridgeId: 'sector-smuggler',
      targetDurationMs: 15_000,
    });
    expect(singlePlan.keyframes).toHaveLength(1);
    expect(singlePlan.keyframes[0].durationMs).toBe(15_000);
    expect(singlePlan.keyframes[0].endMs).toBe(15_000);
  });
});
