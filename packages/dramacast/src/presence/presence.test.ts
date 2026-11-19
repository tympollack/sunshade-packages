import { describe, it, expect, vi } from 'vitest';
import {
  AvatarRigPresenceTrack,
  DEFAULT_OPUS_PROFILE,
  WebRTCPiPPresenceTrack,
  buildWebRTCMediaConstraints,
  computePiPRect,
  createCreatorPresenceTrack,
  tuneOpusSdpFmtp,
} from './index';
import type { PresenceTrackEvent } from '../types';

describe('@digitalcanopy/dramacast CreatorPresenceTrack (V1 WebRTC PiP + V2 Avatar Seam)', () => {
  it('computes PiP overlay geometry, builds Opus constraints, and tunes WebRTC SDP fmtp', () => {
    const rect = computePiPRect(1080, 1920, {
      corner: 'bottom_right',
      widthRatio: 0.25,
      aspectRatio: 1,
      marginPx: 20,
      borderRadiusPx: 18,
      opacity: 1,
      mirrorVideo: true,
      visible: true,
    });

    expect(rect.width).toBe(270);
    expect(rect.height).toBe(270);
    expect(rect.x).toBe(1080 - 270 - 20);
    expect(rect.y).toBe(1920 - 270 - 20);
    expect(rect.mirrorX).toBe(true);

    const constraints = buildWebRTCMediaConstraints(DEFAULT_OPUS_PROFILE);
    expect(constraints.audio).toMatchObject({
      sampleRate: 48000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    });

    const sampleSdp = [
      'v=0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10;useinbandfec=0',
    ].join('\r\n');

    const tuned = tuneOpusSdpFmtp(sampleSdp, {
      ...DEFAULT_OPUS_PROFILE,
      bitrateBps: 64000,
      fec: true,
      dtx: true,
    });

    expect(tuned).toContain(
      'a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=64000;stereo=0'
    );
  });

  it('acquires WebRTC media stream via injected mediaDevices, syncs playback element, and stops tracks cleanly', async () => {
    const stopTrack = vi.fn();
    const fakeStream = {
      getVideoTracks: () => [
        {
          stop: stopTrack,
          getSettings: () => ({ width: 480, height: 480, frameRate: 30 }),
        },
      ],
      getAudioTracks: () => [{ stop: stopTrack }],
      getTracks: () => [{ stop: stopTrack }, { stop: stopTrack }],
    } as unknown as MediaStream;

    const getUserMedia = vi.fn(async () => fakeStream);
    const playbackEl = { currentTime: 0 };

    const track = new WebRTCPiPPresenceTrack({
      mediaDevices: { getUserMedia },
      playbackElement: playbackEl,
      offsetMs: 150,
    });

    const events: PresenceTrackEvent[] = [];
    const unsubscribe = track.onEvent((e) => events.push(e));

    await track.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(track.isActive()).toBe(true);

    const caps = track.getCapabilities();
    expect(caps.hasVideo).toBe(true);
    expect(caps.hasAudio).toBe(true);
    expect(caps.videoWidth).toBe(480);
    expect(caps.opusProfile.codec).toBe('audio/opus');

    track.updateLayout({ corner: 'top_left', widthRatio: 0.8 });
    expect(track.getLayout().corner).toBe('top_left');
    expect(track.getLayout().widthRatio).toBe(0.5);

    track.syncToTimeline(4000);
    expect(playbackEl.currentTime).toBeCloseTo(4.15);

    await track.stop();
    expect(stopTrack).toHaveBeenCalledTimes(2);
    expect(track.isActive()).toBe(false);
    expect(events.map((e) => e.type)).toEqual([
      'PRESENCE_STARTED',
      'PRESENCE_LAYOUT_UPDATED',
      'PRESENCE_SEEK_SYNCED',
      'PRESENCE_STOPPED',
    ]);
    unsubscribe();
  });

  it('supports seamless V2 AvatarRigPresenceTrack swap via createCreatorPresenceTrack seam', async () => {
    const avatar = createCreatorPresenceTrack({
      mode: 'v2_avatar_rig',
      rigId: 'smuggler-captain-v2',
      frames: [
        {
          timestampMs: 0,
          headRotationEuler: [0, 0, 0],
          jawOpen: 0.1,
          blinkLeft: 0,
          blinkRight: 0,
          browInnerUp: 0.1,
          mouthSmile: 0.2,
          expressionTag: 'idle',
        },
        {
          timestampMs: 2000,
          headRotationEuler: [0.2, -0.4, 0],
          jawOpen: 0.9,
          blinkLeft: 0,
          blinkRight: 0,
          browInnerUp: 0.9,
          mouthSmile: 0.8,
          expressionTag: 'hype',
        },
      ],
    }) as AvatarRigPresenceTrack;

    expect(avatar.mode).toBe('v2_avatar_rig');
    await avatar.start();
    avatar.syncToTimeline(1000);

    const sampled = avatar.getLatestFrame();
    expect(sampled?.jawOpen).toBeCloseTo(0.5);
    expect(sampled?.browInnerUp).toBeCloseTo(0.5);
    expect(sampled?.headRotationEuler[1]).toBeCloseTo(-0.2);

    await avatar.stop();
  });
});
