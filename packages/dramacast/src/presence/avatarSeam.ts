import type {
  AvatarRigBlendShapeFrame,
  ICreatorPresenceProvider,
  OpusAudioProfile,
  PresencePiPLayout,
  PresenceStreamCapabilities,
  PresenceTrackEvent,
  PresenceTrackMode,
} from '../types';
import {
  DEFAULT_OPUS_PROFILE,
  DEFAULT_PIP_LAYOUT,
  WebRTCPiPPresenceTrack,
  normalizePiPLayout,
  type WebRTCPiPPresenceOptions,
} from './track';

export interface AvatarRigPresenceOptions {
  rigId?: string;
  layout?: Partial<PresencePiPLayout>;
  opusProfile?: Partial<OpusAudioProfile>;
  frames?: readonly AvatarRigBlendShapeFrame[];
  offsetMs?: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateAvatarFrame(
  prev: AvatarRigBlendShapeFrame,
  next: AvatarRigBlendShapeFrame,
  t: number,
  timestampMs: number
): AvatarRigBlendShapeFrame {
  return {
    timestampMs,
    headRotationEuler: [
      lerp(prev.headRotationEuler[0], next.headRotationEuler[0], t),
      lerp(prev.headRotationEuler[1], next.headRotationEuler[1], t),
      lerp(prev.headRotationEuler[2], next.headRotationEuler[2], t),
    ],
    jawOpen: lerp(prev.jawOpen, next.jawOpen, t),
    blinkLeft: lerp(prev.blinkLeft, next.blinkLeft, t),
    blinkRight: lerp(prev.blinkRight, next.blinkRight, t),
    browInnerUp: lerp(prev.browInnerUp, next.browInnerUp, t),
    mouthSmile: lerp(prev.mouthSmile, next.mouthSmile, t),
    expressionTag: t < 0.5 ? prev.expressionTag : next.expressionTag,
  };
}

/**
 * V2 Avatar Rig Presence Seam implementing `ICreatorPresenceProvider`.
 * Enables drop-in replacement of V1 WebRTC webcam PiP with lightweight blend-shape puppeteering.
 */
export class AvatarRigPresenceTrack implements ICreatorPresenceProvider {
  readonly mode = 'v2_avatar_rig' as const;
  readonly rigId: string;

  private layout: PresencePiPLayout;
  private readonly opusProfile: OpusAudioProfile;
  private readonly frames: AvatarRigBlendShapeFrame[];
  private readonly offsetMs: number;
  private active = false;
  private stream: MediaStream | null = null;
  private latestFrame: AvatarRigBlendShapeFrame | null = null;
  private listeners = new Set<(event: PresenceTrackEvent) => void>();

  constructor(options: AvatarRigPresenceOptions = {}) {
    this.rigId = options.rigId ?? 'default-rig-v2';
    this.layout = normalizePiPLayout(DEFAULT_PIP_LAYOUT, options.layout);
    this.opusProfile = {
      ...DEFAULT_OPUS_PROFILE,
      ...(options.opusProfile ?? {}),
    };
    this.frames = [...(options.frames ?? [])].sort(
      (a, b) => a.timestampMs - b.timestampMs
    );
    this.offsetMs = options.offsetMs ?? 0;
  }

  private emit(event: PresenceTrackEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  getCapabilities(): PresenceStreamCapabilities {
    return {
      hasVideo: true,
      hasAudio: (this.stream?.getAudioTracks?.().length ?? 0) > 0,
      mode: this.mode,
      opusProfile: { ...this.opusProfile },
    };
  }

  getLayout(): PresencePiPLayout {
    return { ...this.layout };
  }

  updateLayout(patch: Partial<PresencePiPLayout>): PresencePiPLayout {
    this.layout = normalizePiPLayout(this.layout, patch);
    const snapshot = this.getLayout();
    this.emit({ type: 'PRESENCE_LAYOUT_UPDATED', layout: snapshot });
    return snapshot;
  }

  attachMediaStream(stream: MediaStream | null): void {
    this.stream = stream;
  }

  pushBlendShapeFrame(frame: AvatarRigBlendShapeFrame): void {
    this.frames.push(frame);
    this.frames.sort((a, b) => a.timestampMs - b.timestampMs);
    this.latestFrame = frame;
    this.emit({ type: 'PRESENCE_AVATAR_FRAME', frame });
  }

  getLatestFrame(): AvatarRigBlendShapeFrame | null {
    return this.latestFrame;
  }

  sampleAt(timestampMs: number): AvatarRigBlendShapeFrame | null {
    const n = this.frames.length;
    if (n === 0) return null;
    if (timestampMs <= this.frames[0].timestampMs) return this.frames[0];
    if (timestampMs >= this.frames[n - 1].timestampMs) return this.frames[n - 1];

    let lo = 0;
    let hi = n - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const midT = this.frames[mid].timestampMs;
      if (midT === timestampMs) return this.frames[mid];
      if (midT < timestampMs) lo = mid + 1;
      else hi = mid - 1;
    }

    const prev = this.frames[Math.max(0, hi)];
    const next = this.frames[Math.min(n - 1, lo)];
    const span = next.timestampMs - prev.timestampMs;
    const t = span > 0 ? (timestampMs - prev.timestampMs) / span : 0;
    return interpolateAvatarFrame(prev, next, t, timestampMs);
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.emit({
      type: 'PRESENCE_STARTED',
      mode: this.mode,
      timestampMs: Date.now(),
    });
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    this.emit({
      type: 'PRESENCE_STOPPED',
      mode: this.mode,
      timestampMs: Date.now(),
    });
  }

  syncToTimeline(playheadMs: number): void {
    const effectiveMs = Math.max(0, playheadMs + this.offsetMs);
    const sampled = this.sampleAt(effectiveMs);
    if (sampled) {
      this.latestFrame = sampled;
      this.emit({ type: 'PRESENCE_AVATAR_FRAME', frame: sampled });
    }
    this.emit({
      type: 'PRESENCE_SEEK_SYNCED',
      playheadMs: effectiveMs,
      offsetMs: this.offsetMs,
    });
  }

  onEvent(listener: (event: PresenceTrackEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export type CreatePresenceTrackOptions =
  | ({ mode?: 'v1_webrtc_pip' } & WebRTCPiPPresenceOptions)
  | ({ mode: 'v2_avatar_rig' } & AvatarRigPresenceOptions);

/**
 * Factory creating either the V1 WebRTC PiP track or the V2 Avatar Rig seam
 * behind the unified `ICreatorPresenceProvider` interface.
 */
export function createCreatorPresenceTrack(
  options: CreatePresenceTrackOptions = {}
): ICreatorPresenceProvider {
  const mode: PresenceTrackMode = options.mode ?? 'v1_webrtc_pip';
  if (mode === 'v2_avatar_rig') {
    return new AvatarRigPresenceTrack(options as AvatarRigPresenceOptions);
  }
  return new WebRTCPiPPresenceTrack(options as WebRTCPiPPresenceOptions);
}
