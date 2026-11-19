import { describe, it, expect, vi } from 'vitest';
import {
  ReactionTimelineSynchronizer,
  TELEMETRY_FLAG_HIGH_STAKES,
  TELEMETRY_FLAG_MISFIRE,
  TELEMETRY_MAGIC,
  TelemetryCodecError,
  base64UrlToTelemetryBytes,
  decodeTelemetryBundle,
  encodeTelemetryBundle,
  telemetryBytesToBase64Url,
  type TelemetryFrame,
} from './index';
import { buildDirectorTimelinePlan, scoreDramaSequence } from '../director';
import type { ICreatorPresenceProvider, PresencePiPLayout } from '../types';

describe('@digitalcanopy/dramacast Vector Telemetry Codec & Scrub Synchronizer', () => {
  it('round-trips quantized vector telemetry frames and stateDelta with high compression and base64url portability', () => {
    const frames: TelemetryFrame[] = [
      {
        seq: 0,
        tMs: 0,
        rollIndex: 0,
        winProbability: 0.5,
        dramaIndex: 18.5,
        score: 100,
        tierIndex: 0,
        flags: 0,
        boardVector: [100, 12.25, 0],
      },
      {
        seq: 1,
        tMs: 3200,
        rollIndex: 1,
        winProbability: 0.1125,
        dramaIndex: 76.25,
        score: 85,
        tierIndex: 0,
        flags: TELEMETRY_FLAG_HIGH_STAKES | TELEMETRY_FLAG_MISFIRE,
        boardVector: [18, 12.5, 1],
        stateDelta: {
          doorOpen: true,
          sector: 'vault',
          heatLevel: 3.5,
        },
      },
      {
        seq: 2,
        tMs: 6500,
        rollIndex: 2,
        winProbability: 0.894,
        dramaIndex: 94.75,
        score: 1420,
        tierIndex: 3,
        flags: TELEMETRY_FLAG_HIGH_STAKES,
        boardVector: [24, 15.75, 4],
      },
    ];

    const bundle = encodeTelemetryBundle(frames, {
      matchId: 'match-telemetry-01',
      cartridgeId: 'sector-smuggler',
      rootSeedHash: 'f'.repeat(64),
    });

    expect(bundle.header.magic).toBe(TELEMETRY_MAGIC);
    expect(bundle.header.frameCount).toBe(3);
    expect(bundle.header.vectorDimensions).toBe(3);
    expect(bundle.compressionRatioEstimate).toBeGreaterThan(2);

    const b64 = telemetryBytesToBase64Url(bundle.payload);
    const restoredBytes = base64UrlToTelemetryBytes(b64);
    const decoded = decodeTelemetryBundle(restoredBytes);

    expect(decoded.header).toEqual(bundle.header);
    expect(decoded.frames).toHaveLength(3);
    expect(decoded.frames[1].winProbability).toBeCloseTo(0.1125, 4);
    expect(decoded.frames[1].dramaIndex).toBeCloseTo(76.25, 2);
    expect(decoded.frames[1].flags).toBe(
      TELEMETRY_FLAG_HIGH_STAKES | TELEMETRY_FLAG_MISFIRE
    );
    expect(decoded.frames[1].stateDelta).toEqual({
      doorOpen: true,
      sector: 'vault',
      heatLevel: 3.5,
    });
    expect(decoded.frames[2].score).toBe(1420);
    expect(decoded.frames[2].tierIndex).toBe(3);
    expect(decoded.frames[2].boardVector).toEqual([24, 15.75, 4]);
  });

  it('rejects corrupted, truncated, unbounded-allocation, and invalid base64url payloads with TelemetryCodecError', () => {
    expect(() =>
      decodeTelemetryBundle(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
    ).toThrow(TelemetryCodecError);

    const valid = encodeTelemetryBundle(
      [
        {
          seq: 0,
          tMs: 0,
          rollIndex: 0,
          winProbability: 0.5,
          dramaIndex: 20,
          score: 50,
          tierIndex: 0,
          flags: 0,
        },
      ],
      { matchId: 'm1', cartridgeId: 'c1' }
    );

    const truncated = valid.payload.slice(0, valid.payload.length - 3);
    expect(() => decodeTelemetryBundle(truncated)).toThrow(TelemetryCodecError);

    // Crafted header requesting huge vectorDimensions (e.g., 1_000_000_000) with 0 frames
    const crafted = new Uint8Array([
      68, 67, 65, 83, 84, 49, // DCAST1
      1, // version
      0, // matchId len 0
      0, // cartridgeId len 0
      0, // rootSeedHash len 0
      0, 0, 0, 0, // durationMs
      0, // frameCount = 0
      0x80, 0x94, 0xeb, 0xdc, 0x03, // vectorDimensions = 1_000_000_000
      1, // quantizationScale
    ]);
    expect(() => decodeTelemetryBundle(crafted)).toThrow(TelemetryCodecError);

    // Invalid 3rd/4th quartet base64url characters must throw rather than silently truncate
    expect(() => base64UrlToTelemetryBytes('ab$d')).toThrow(TelemetryCodecError);
    expect(() => base64UrlToTelemetryBytes('abc$')).toThrow(TelemetryCodecError);
    expect(() => base64UrlToTelemetryBytes('a')).toThrow(TelemetryCodecError);
  });

  it('maps reel playhead to source match clock so jumping to any selected roll returns its source telemetry and creator cue', () => {
    const scored = scoreDramaSequence([
      {
        rollIndex: 0,
        timestampMs: 0,
        winProbability: 0.2,
        selectedTier: 'tier0_baseline',
        normalizedSkillRatio: 0.3,
      },
      {
        rollIndex: 1,
        timestampMs: 10000,
        winProbability: 0.8,
        selectedTier: 'tier3_miracle',
        normalizedSkillRatio: 0.96,
      },
    ]);

    const plan = buildDirectorTimelinePlan(scored, {
      matchId: 'match-sync',
      cartridgeId: 'sector-smuggler',
      targetDurationMs: 10000,
      totalSourceDurationMs: 25000,
    });

    const frames: TelemetryFrame[] = [
      {
        seq: 0,
        tMs: 0,
        rollIndex: 0,
        winProbability: 0.2,
        dramaIndex: scored[0].dramaIndex,
        score: 100,
        tierIndex: 0,
        flags: 0,
      },
      {
        seq: 1,
        tMs: 10000,
        rollIndex: 1,
        winProbability: 0.8,
        dramaIndex: scored[1].dramaIndex,
        score: 1100,
        tierIndex: 3,
        flags: TELEMETRY_FLAG_HIGH_STAKES,
      },
    ];

    const syncCalls: number[] = [];
    const mockLayout: PresencePiPLayout = {
      corner: 'bottom_right',
      widthRatio: 0.25,
      aspectRatio: 1,
      marginPx: 16,
      borderRadiusPx: 16,
      opacity: 1,
      mirrorVideo: true,
      visible: true,
    };

    const mockPresence: ICreatorPresenceProvider = {
      mode: 'v1_webrtc_pip',
      getCapabilities: () => ({
        hasVideo: true,
        hasAudio: true,
        mode: 'v1_webrtc_pip',
        opusProfile: {
          codec: 'audio/opus',
          sampleRateHz: 48000,
          channels: 1,
          bitrateBps: 48000,
          dtx: true,
          fec: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      }),
      getLayout: () => mockLayout,
      updateLayout: () => mockLayout,
      attachMediaStream: vi.fn(),
      start: async () => {},
      stop: async () => {},
      syncToTimeline: (ms) => {
        syncCalls.push(ms);
      },
      onEvent: () => () => {},
    };

    const sync = new ReactionTimelineSynchronizer({
      frames,
      timelinePlan: plan,
      presenceProvider: mockPresence,
      presenceOffsetMs: 250,
    });

    // Duration bounded to paced reel duration (10,000ms), not source 25,000ms
    expect(sync.getState().durationMs).toBe(10000);

    // Jumping to roll 0 aligns to source tMs=0 and presenceCue=250
    const roll0 = sync.jumpToRoll(0);
    expect(roll0.activeFrame?.rollIndex).toBe(0);
    expect(roll0.interpolatedScore).toBe(100);
    expect(roll0.sourceTimeMs).toBe(0);
    expect(roll0.presenceCueTimeMs).toBe(250);

    // Scrubbing halfway through keyframe 0 interpolates source time halfway to roll 1
    const kf0 = plan.keyframes[0];
    const midKf0 = sync.seek(kf0.startMs + kf0.durationMs / 2);
    expect(midKf0.sourceTimeMs).toBeCloseTo(5000, 1);
    expect(midKf0.interpolatedWinProbability).toBeCloseTo(0.5, 4);
    expect(midKf0.interpolatedScore).toBe(600);
    expect(midKf0.presenceCueTimeMs).toBeCloseTo(5250, 1);

    // Jumping to roll 1 (climax keyframe) resolves roll 1 source telemetry (score 1100, tMs 10000) and creator cue 10250
    const climaxKf = plan.keyframes.find((k) => k.sourceRollIndex === 1)!;
    const jumped = sync.jumpToRoll(1);
    expect(jumped.playheadMs).toBe(climaxKf.startMs);
    expect(jumped.activeKeyframe?.keyframeId).toBe(climaxKf.keyframeId);
    expect(jumped.activeFrame?.rollIndex).toBe(1);
    expect(jumped.interpolatedScore).toBe(1100);
    expect(jumped.interpolatedWinProbability).toBeCloseTo(0.8, 4);
    expect(jumped.sourceTimeMs).toBe(10000);
    expect(jumped.presenceCueTimeMs).toBe(10250);
    expect(jumped.playbackRate).toBe(0.75);
    expect(syncCalls[syncCalls.length - 1]).toBe(10250);

    sync.play();
    const stepped = sync.step(1000);
    expect(stepped.playheadMs).toBeCloseTo(climaxKf.startMs + 750);
  });
});
