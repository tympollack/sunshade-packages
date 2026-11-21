import { describe, it, expect } from 'vitest';
import type {
  AvatarRigBlendShapeFrame,
  CartridgePluginManifest,
  DirectorKeyframe,
  DirectorTimelinePlan,
  DramaScoreBreakdown,
  EncodedTelemetryBundle,
  PresencePiPLayout,
  ScrubSyncState,
  TelemetryFrame,
} from './index';

describe('@digitalcanopy/dramacast domain contracts', () => {
  it('supports CartridgePluginManifest, DirectorTimelinePlan, TelemetryFrame, and PresencePiPLayout contracts', () => {
    const manifest: CartridgePluginManifest = {
      cartridgeId: 'sector-smuggler',
      version: '1.0.0',
      title: 'Sector Smuggler',
      genre: 'smuggler',
      minReelsEngineVersion: '0.1.0',
      viewport: {
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        cameraMode: 'board_overview',
      },
      eventTags: ['CUSTOMS_SWEEP', 'WARP_ANOMALY', 'JACKPOT_VAULT'],
      dramaWeights: {
        comebackSwingWeight: 1.25,
        miracleTierWeight: 1.4,
      },
      telemetryFields: [
        { key: 'hullIntegrity', type: 'uint16', min: 0, max: 100 },
        { key: 'contrabandCount', type: 'uint16', min: 0, max: 16 },
        { key: 'alertState', type: 'enum', enumValues: ['calm', 'pursuit', 'lockdown'] },
      ],
      supportsPresencePiP: true,
    };

    const score: DramaScoreBreakdown = {
      rollIndex: 4,
      timestampMs: 12400,
      dramaIndex: 92,
      beatType: 'MIRACLE_CLUTCH',
      cameraCue: 'SLOW_MO_HIGHLIGHT',
      components: {
        probabilitySwing: 28,
        comebackTension: 24,
        skillClutch: 18,
        tierMultiplier: 12,
        misfireDrama: 0,
        highStakesBonus: 10,
      },
    };

    const keyframe: DirectorKeyframe = {
      keyframeId: 'kf_04',
      startMs: 18000,
      endMs: 26000,
      durationMs: 8000,
      sourceRollIndex: 4,
      dramaIndex: 92,
      beatType: 'MIRACLE_CLUTCH',
      cameraCue: 'SLOW_MO_HIGHLIGHT',
      playbackRate: 0.75,
      captionOverlay: 'MIRACLE RECOVERY!',
      transitionToNext: 'whip_pan',
    };

    const plan: DirectorTimelinePlan = {
      matchId: 'match-01',
      cartridgeId: 'sector-smuggler',
      targetDurationMs: 60000,
      totalSourceDurationMs: 180000,
      keyframes: [keyframe],
      peakDramaIndex: 92,
      peakRollIndex: 4,
      hookKeyframeId: 'kf_04',
      climaxKeyframeId: 'kf_04',
    };

    const frame: TelemetryFrame = {
      seq: 0,
      tMs: 12400,
      rollIndex: 4,
      winProbability: 0.64,
      dramaIndex: 92,
      score: 1450,
      tierIndex: 3,
      flags: 0b0001,
      boardVector: [12, 3, 100],
    };

    const bundle: EncodedTelemetryBundle = {
      header: {
        magic: 'DCAST1',
        version: 1,
        matchId: 'match-01',
        cartridgeId: 'sector-smuggler',
        rootSeedHash: 'a'.repeat(64),
        durationMs: 60000,
        frameCount: 1,
        vectorDimensions: 3,
        quantizationScale: 1000,
      },
      payload: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      compressionRatioEstimate: 4.5,
    };

    const scrub: ScrubSyncState = {
      playheadMs: 20000,
      durationMs: 60000,
      activeFrame: frame,
      activeKeyframe: keyframe,
      interpolatedWinProbability: 0.64,
      interpolatedDramaIndex: 92,
      interpolatedScore: 1450,
      presenceCueTimeMs: 20000,
      isPlaying: true,
      playbackRate: 0.75,
    };

    const pipLayout: PresencePiPLayout = {
      corner: 'bottom_right',
      widthRatio: 0.28,
      aspectRatio: 1,
      marginPx: 16,
      borderRadiusPx: 20,
      opacity: 1,
      mirrorVideo: true,
      visible: true,
    };

    const avatarFrame: AvatarRigBlendShapeFrame = {
      timestampMs: 20000,
      headRotationEuler: [0.05, -0.1, 0],
      jawOpen: 0.6,
      blinkLeft: 0,
      blinkRight: 0,
      browInnerUp: 0.75,
      mouthSmile: 0.8,
      expressionTag: 'pog',
    };

    expect(manifest.cartridgeId).toBe('sector-smuggler');
    expect(score.dramaIndex).toBe(92);
    expect(plan.targetDurationMs).toBe(60000);
    expect(bundle.header.magic).toBe('DCAST1');
    expect(scrub.activeKeyframe?.keyframeId).toBe('kf_04');
    expect(pipLayout.corner).toBe('bottom_right');
    expect(avatarFrame.expressionTag).toBe('pog');
  });
});
