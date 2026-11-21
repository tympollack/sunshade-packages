import type {
  ICreatorPresenceProvider,
  OpusAudioProfile,
  PresencePiPLayout,
  PresenceStreamCapabilities,
  PresenceTrackEvent,
} from '../types';

export const DEFAULT_PIP_LAYOUT: Readonly<PresencePiPLayout> = Object.freeze({
  corner: 'bottom_right',
  widthRatio: 0.28,
  aspectRatio: 1,
  marginPx: 16,
  borderRadiusPx: 20,
  opacity: 1,
  mirrorVideo: true,
  visible: true,
});

export const DEFAULT_OPUS_PROFILE: Readonly<OpusAudioProfile> = Object.freeze({
  codec: 'audio/opus',
  sampleRateHz: 48000,
  channels: 1,
  bitrateBps: 48000,
  dtx: true,
  fec: true,
  echoCancellation: true,
  noiseSuppression: true,
});

export interface PiPRect {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadiusPx: number;
  opacity: number;
  mirrorX: boolean;
}

export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

export interface PlaybackElementLike {
  currentTime: number;
  muted?: boolean;
}

export interface WebRTCPiPPresenceOptions {
  layout?: Partial<PresencePiPLayout>;
  opusProfile?: Partial<OpusAudioProfile>;
  mediaDevices?: MediaDevicesLike;
  playbackElement?: PlaybackElementLike;
  offsetMs?: number;
  stopTracksOnStop?: boolean;
  videoConstraints?: {
    width?: number;
    height?: number;
    frameRate?: number;
    facingMode?: 'user' | 'environment';
  };
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export function normalizePiPLayout(
  base: PresencePiPLayout,
  patch?: Partial<PresencePiPLayout>
): PresencePiPLayout {
  const merged = { ...base, ...(patch ?? {}) };
  return {
    corner: merged.corner,
    widthRatio: clamp(merged.widthRatio, 0.1, 0.5),
    aspectRatio: clamp(merged.aspectRatio, 0.5, 2.0),
    marginPx: Math.max(0, merged.marginPx),
    borderRadiusPx: Math.max(0, merged.borderRadiusPx),
    opacity: clamp(merged.opacity, 0, 1),
    mirrorVideo: Boolean(merged.mirrorVideo),
    visible: Boolean(merged.visible),
  };
}

/**
 * Computes deterministic pixel coordinates for rendering the creator PiP overlay inside a stage.
 */
export function computePiPRect(
  containerWidth: number,
  containerHeight: number,
  layout: PresencePiPLayout
): PiPRect {
  const safeW = Math.max(1, containerWidth);
  const safeH = Math.max(1, containerHeight);
  const width = Math.round(safeW * clamp(layout.widthRatio, 0.1, 0.5));
  const height = Math.round(width / clamp(layout.aspectRatio, 0.5, 2.0));
  const margin = Math.max(0, Math.round(layout.marginPx));

  const isRight =
    layout.corner === 'top_right' || layout.corner === 'bottom_right';
  const isBottom =
    layout.corner === 'bottom_left' || layout.corner === 'bottom_right';

  const x = isRight ? Math.max(0, safeW - width - margin) : margin;
  const y = isBottom ? Math.max(0, safeH - height - margin) : margin;

  return {
    x,
    y,
    width,
    height,
    borderRadiusPx: layout.borderRadiusPx,
    opacity: layout.visible ? layout.opacity : 0,
    mirrorX: layout.mirrorVideo,
  };
}

/**
 * Builds WebRTC `MediaStreamConstraints` aligned with the configured Opus audio profile.
 */
export function buildWebRTCMediaConstraints(
  opusProfile: OpusAudioProfile,
  video?: WebRTCPiPPresenceOptions['videoConstraints']
): MediaStreamConstraints {
  return {
    video: {
      width: { ideal: video?.width ?? 480 },
      height: { ideal: video?.height ?? 480 },
      frameRate: { ideal: video?.frameRate ?? 30 },
      facingMode: video?.facingMode ?? 'user',
    },
    audio: {
      sampleRate: opusProfile.sampleRateHz,
      channelCount: opusProfile.channels,
      echoCancellation: opusProfile.echoCancellation,
      noiseSuppression: opusProfile.noiseSuppression,
    },
  };
}

/**
 * Tunes WebRTC SDP `a=fmtp` lines for the Opus payload to enforce bitrate, FEC, and DTX.
 */
export function tuneOpusSdpFmtp(
  sdp: string,
  profile: OpusAudioProfile
): string {
  const lines = sdp.split('\r\n');
  let opusPayload: string | null = null;

  for (const line of lines) {
    const match = /^a=rtpmap:(\d+)\s+opus\/\d+/i.exec(line);
    if (match) {
      opusPayload = match[1];
      break;
    }
  }
  if (!opusPayload) return sdp;

  const params = [
    'minptime=10',
    `useinbandfec=${profile.fec ? 1 : 0}`,
    `usedtx=${profile.dtx ? 1 : 0}`,
    `maxaveragebitrate=${Math.max(6000, Math.round(profile.bitrateBps))}`,
    `stereo=${profile.channels === 2 ? 1 : 0}`,
  ].join(';');

  const fmtpPrefix = `a=fmtp:${opusPayload} `;
  let updated = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(fmtpPrefix)) {
      updated = true;
      return `${fmtpPrefix}${params}`;
    }
    return line;
  });

  if (!updated) {
    const rtpmapIdx = nextLines.findIndex((l) =>
      l.startsWith(`a=rtpmap:${opusPayload} `)
    );
    if (rtpmapIdx !== -1) {
      nextLines.splice(rtpmapIdx + 1, 0, `${fmtpPrefix}${params}`);
    }
  }

  return nextLines.join('\r\n');
}

/**
 * V1 Creator Presence Track implementing WebRTC webcam PiP overlay + Opus voice audio.
 */
export class WebRTCPiPPresenceTrack implements ICreatorPresenceProvider {
  readonly mode = 'v1_webrtc_pip' as const;

  private layout: PresencePiPLayout;
  private readonly opusProfile: OpusAudioProfile;
  private readonly mediaDevices?: MediaDevicesLike;
  private playbackElement?: PlaybackElementLike;
  private readonly offsetMs: number;
  private readonly stopTracksOnStop: boolean;
  private readonly videoConstraints?: WebRTCPiPPresenceOptions['videoConstraints'];

  private stream: MediaStream | null = null;
  private ownsStream = false;
  private active = false;
  private lifecycleGeneration = 0;
  private pendingStart: Promise<void> | null = null;
  private listeners = new Set<(event: PresenceTrackEvent) => void>();

  constructor(options: WebRTCPiPPresenceOptions = {}) {
    this.layout = normalizePiPLayout(DEFAULT_PIP_LAYOUT, options.layout);
    this.opusProfile = {
      ...DEFAULT_OPUS_PROFILE,
      ...(options.opusProfile ?? {}),
    };
    this.mediaDevices = options.mediaDevices;
    this.playbackElement = options.playbackElement;
    this.offsetMs = options.offsetMs ?? 0;
    this.stopTracksOnStop = options.stopTracksOnStop ?? true;
    this.videoConstraints = options.videoConstraints;
  }

  private emit(event: PresenceTrackEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private stopStreamTracks(stream: MediaStream | null): void {
    if (!stream) return;
    const tracks = stream.getTracks?.() ?? [];
    for (const track of tracks) {
      track.stop?.();
    }
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

  getOpusProfile(): OpusAudioProfile {
    return { ...this.opusProfile };
  }

  getMediaStream(): MediaStream | null {
    return this.stream;
  }

  attachMediaStream(stream: MediaStream | null): void {
    if (stream === this.stream) {
      return;
    }
    this.lifecycleGeneration++;
    if (this.ownsStream && this.stream && this.stopTracksOnStop) {
      this.stopStreamTracks(this.stream);
    }
    this.stream = stream;
    this.ownsStream = false;
  }

  attachPlaybackElement(element: PlaybackElementLike | undefined): void {
    this.playbackElement = element;
  }

  isActive(): boolean {
    return this.active;
  }

  getCapabilities(): PresenceStreamCapabilities {
    const videoTracks = this.stream?.getVideoTracks?.() ?? [];
    const audioTracks = this.stream?.getAudioTracks?.() ?? [];
    const settings = videoTracks[0]?.getSettings?.();

    return {
      hasVideo: videoTracks.length > 0,
      hasAudio: audioTracks.length > 0,
      mode: this.mode,
      opusProfile: this.getOpusProfile(),
      ...(typeof settings?.width === 'number'
        ? { videoWidth: settings.width }
        : {}),
      ...(typeof settings?.height === 'number'
        ? { videoHeight: settings.height }
        : {}),
      ...(typeof settings?.frameRate === 'number'
        ? { frameRate: settings.frameRate }
        : {}),
    };
  }

  async start(): Promise<void> {
    if (this.active) return;
    if (this.pendingStart) {
      return this.pendingStart;
    }

    const startGeneration = this.lifecycleGeneration;
    const task = (async () => {
      if (!this.stream) {
        const devices =
          this.mediaDevices ??
          (typeof globalThis !== 'undefined' &&
          'navigator' in globalThis &&
          (globalThis as { navigator?: { mediaDevices?: MediaDevicesLike } })
            .navigator?.mediaDevices
            ? (globalThis as { navigator?: { mediaDevices?: MediaDevicesLike } })
                .navigator?.mediaDevices
            : undefined);

        if (!devices || typeof devices.getUserMedia !== 'function') {
          const message =
            'WebRTC mediaDevices.getUserMedia is unavailable in this environment.';
          this.emit({ type: 'PRESENCE_ERROR', message, recoverable: false });
          throw new Error(message);
        }

        const constraints = buildWebRTCMediaConstraints(
          this.opusProfile,
          this.videoConstraints
        );
        const acquiredStream = await devices.getUserMedia(constraints);

        if (this.lifecycleGeneration !== startGeneration) {
          this.stopStreamTracks(acquiredStream);
          return;
        }

        this.stream = acquiredStream;
        this.ownsStream = true;
      }

      if (this.lifecycleGeneration !== startGeneration) {
        return;
      }

      this.active = true;
      this.emit({
        type: 'PRESENCE_STARTED',
        mode: this.mode,
        timestampMs: Date.now(),
      });
    })();

    this.pendingStart = task;
    try {
      await task;
    } finally {
      if (this.pendingStart === task) {
        this.pendingStart = null;
      }
    }
  }

  async stop(): Promise<void> {
    const hadPendingStart = this.pendingStart !== null;
    this.lifecycleGeneration++;

    if (!this.active && !this.stream && !hadPendingStart) return;

    if (this.stopTracksOnStop && this.ownsStream && this.stream) {
      this.stopStreamTracks(this.stream);
      this.stream = null;
      this.ownsStream = false;
    }

    this.active = false;
    this.emit({
      type: 'PRESENCE_STOPPED',
      mode: this.mode,
      timestampMs: Date.now(),
    });
  }

  syncToTimeline(playheadMs: number): void {
    const clampedMs = Math.max(0, playheadMs + this.offsetMs);
    if (this.playbackElement) {
      this.playbackElement.currentTime = clampedMs / 1000;
    }
    this.emit({
      type: 'PRESENCE_SEEK_SYNCED',
      playheadMs: clampedMs,
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
