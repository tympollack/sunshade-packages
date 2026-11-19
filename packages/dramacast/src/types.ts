import type { RollTrajectoryStep, SubSeedTier } from '@digitalcanopy/reels-engine';

/**
 * Supported cartridge genres for DramaCast director pacing profiles.
 */
export type CartridgeGenre =
  | 'arcade'
  | 'strategy'
  | 'smuggler'
  | 'puzzle'
  | 'roguelike'
  | 'custom';

/**
 * Primary viewport framing strategy declared by a cartridge plugin.
 */
export type CartridgeCameraMode =
  | 'fixed'
  | 'follow_entity'
  | 'board_overview'
  | 'split_focus';

/**
 * Logical rendering viewport and camera metadata for a cartridge plugin.
 */
export interface CartridgeViewportSpec {
  width: number;
  height: number;
  aspectRatio: string;
  cameraMode: CartridgeCameraMode;
}

/**
 * Optional weighting overrides for scoring dramatic intensity in a cartridge.
 */
export interface CartridgeDramaWeights {
  comebackSwingWeight?: number;
  nearMissWeight?: number;
  miracleTierWeight?: number;
  misfireRecoveryWeight?: number;
  streakMomentumWeight?: number;
}

/**
 * Compact schema field definition used by the vector telemetry codec to pack
 * cartridge-specific state channels deterministically.
 */
export interface CartridgeTelemetrySchemaField {
  key: string;
  type: 'int16' | 'uint16' | 'float32' | 'bool' | 'enum';
  min?: number;
  max?: number;
  enumValues?: readonly string[];
}

/**
 * Declarative Cartridge Plugin Manifest contract registered with DramaCast.
 */
export interface CartridgePluginManifest {
  cartridgeId: string;
  version: string;
  title: string;
  genre: CartridgeGenre;
  minReelsEngineVersion: string;
  viewport: CartridgeViewportSpec;
  eventTags: readonly string[];
  dramaWeights?: CartridgeDramaWeights;
  telemetryFields: readonly CartridgeTelemetrySchemaField[];
  supportsPresencePiP: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Runtime cartridge adapter contract bridging game state snapshots and drama signals.
 */
export interface CartridgePluginAdapter<TState = Record<string, unknown>> {
  readonly manifest: CartridgePluginManifest;
  serializeStateSnapshot(state: TState): Record<string, unknown>;
  deserializeStateSnapshot(snapshot: Record<string, unknown>): TState;
  computeWinProbability?(state: TState): number;
  extractDramaSignals?(
    prevState: TState | null,
    nextState: TState,
    step: RollTrajectoryStep
  ): Partial<DramaSignalInput>;
}

/**
 * Narrative beat classification assigned to scored roll moments.
 */
export type DramaBeatType =
  | 'OPENING_HOOK'
  | 'TENSION_BUILD'
  | 'CLIMAX_SPIKE'
  | 'MISFIRE_SHOCK'
  | 'MIRACLE_CLUTCH'
  | 'COMEBACK_PIVOT'
  | 'FINALE_PAYOFF';

/**
 * Director camera cue emitted on keyframes for the 60-second highlight reel.
 */
export type DirectorCameraCue =
  | 'WIDE_ESTABLISH'
  | 'TIGHT_BOARD_ZOOM'
  | 'PIP_REACTION_FOCUS'
  | 'SLOW_MO_HIGHLIGHT'
  | 'SPLIT_CHALLENGE';

/**
 * Normalized telemetry and roll inputs evaluated by the Drama Index scorer.
 */
export interface DramaSignalInput {
  rollIndex: number;
  timestampMs: number;
  winProbability: number;
  prevWinProbability?: number;
  selectedTier: SubSeedTier;
  normalizedSkillRatio: number;
  isDoubleOneMisfire?: boolean;
  isBlindCheckRecovery?: boolean;
  scoreDelta?: number;
  totalScore?: number;
  hullIntegrity?: number;
  isHighStakes?: boolean;
  eventTag?: string;
  customTensionBoost?: number;
}

/**
 * Transparent breakdown of a single roll moment's Drama Index in [0, 100].
 */
export interface DramaScoreBreakdown {
  rollIndex: number;
  timestampMs: number;
  dramaIndex: number;
  beatType: DramaBeatType;
  cameraCue: DirectorCameraCue;
  components: {
    probabilitySwing: number;
    comebackTension: number;
    skillClutch: number;
    tierMultiplier: number;
    misfireDrama: number;
    highStakesBonus: number;
  };
}

/**
 * Transition directive between consecutive director keyframes.
 */
export type DirectorTransition = 'cut' | 'crossfade' | 'whip_pan' | 'glitch';

/**
 * Directed editorial keyframe within a paced highlight reel.
 */
export interface DirectorKeyframe {
  keyframeId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  sourceRollIndex: number;
  dramaIndex: number;
  beatType: DramaBeatType;
  cameraCue: DirectorCameraCue;
  playbackRate: number;
  captionOverlay?: string;
  transitionToNext: DirectorTransition;
}

/**
 * Complete 60-second (or configured target duration) director pacing plan.
 */
export interface DirectorTimelinePlan {
  matchId: string;
  cartridgeId: string;
  targetDurationMs: number;
  totalSourceDurationMs: number;
  keyframes: DirectorKeyframe[];
  peakDramaIndex: number;
  peakRollIndex: number;
  hookKeyframeId: string;
  climaxKeyframeId: string;
}

/**
 * Compact quantized telemetry frame for deterministic replay & timeline scrubbing.
 */
export interface TelemetryFrame {
  seq: number;
  tMs: number;
  rollIndex: number;
  winProbability: number;
  dramaIndex: number;
  score: number;
  tierIndex: 0 | 1 | 2 | 3;
  flags: number;
  boardVector?: number[];
  stateDelta?: Record<string, number | boolean | string>;
}

/**
 * Binary header metadata for an encoded DramaCast telemetry stream.
 */
export interface TelemetryStreamHeader {
  magic: 'DCAST1';
  version: number;
  matchId: string;
  cartridgeId: string;
  rootSeedHash: string;
  durationMs: number;
  frameCount: number;
  vectorDimensions: number;
  quantizationScale: number;
}

/**
 * Encoded binary telemetry bundle ready for storage or network transport.
 */
export interface EncodedTelemetryBundle {
  header: TelemetryStreamHeader;
  payload: Uint8Array;
  byteLength: number;
  compressionRatioEstimate: number;
}

/**
 * Synchronized state emitted by the Reaction Timeline Scrub Synchronizer.
 */
export interface ScrubSyncState {
  playheadMs: number;
  sourceTimeMs?: number;
  durationMs: number;
  activeFrame: TelemetryFrame | null;
  activeKeyframe: DirectorKeyframe | null;
  interpolatedWinProbability: number;
  interpolatedDramaIndex: number;
  interpolatedScore: number;
  presenceCueTimeMs: number;
  isPlaying: boolean;
  playbackRate: number;
}

/**
 * Presence track implementation generation: V1 WebRTC PiP or V2 Avatar Rig seam.
 */
export type PresenceTrackMode = 'v1_webrtc_pip' | 'v2_avatar_rig';

/**
 * Corner anchor for the V1 Creator PiP overlay.
 */
export type PresencePiPCorner =
  | 'top_left'
  | 'top_right'
  | 'bottom_left'
  | 'bottom_right';

/**
 * Normalized PiP layout descriptor for rendering creator webcam overlay.
 */
export interface PresencePiPLayout {
  corner: PresencePiPCorner;
  widthRatio: number;
  aspectRatio: number;
  marginPx: number;
  borderRadiusPx: number;
  opacity: number;
  mirrorVideo: boolean;
  visible: boolean;
}

/**
 * Opus audio encoding configuration for creator voice commentary.
 */
export interface OpusAudioProfile {
  codec: 'audio/opus';
  sampleRateHz: 48000 | 24000 | 16000;
  channels: 1 | 2;
  bitrateBps: number;
  dtx: boolean;
  fec: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
}

/**
 * V2 Avatar Rig blend-shape seam payload (reserved for V2 avatar puppeteering).
 */
export interface AvatarRigBlendShapeFrame {
  timestampMs: number;
  headRotationEuler: [number, number, number];
  jawOpen: number;
  blinkLeft: number;
  blinkRight: number;
  browInnerUp: number;
  mouthSmile: number;
  expressionTag?: string;
}

/**
 * Capability summary exposed by an active creator presence provider.
 */
export interface PresenceStreamCapabilities {
  hasVideo: boolean;
  hasAudio: boolean;
  mode: PresenceTrackMode;
  opusProfile: OpusAudioProfile;
  videoWidth?: number;
  videoHeight?: number;
  frameRate?: number;
}

/**
 * Lifecycle and synchronization events emitted by CreatorPresenceTrack.
 */
export type PresenceTrackEvent =
  | { type: 'PRESENCE_STARTED'; mode: PresenceTrackMode; timestampMs: number }
  | { type: 'PRESENCE_STOPPED'; mode: PresenceTrackMode; timestampMs: number }
  | { type: 'PRESENCE_LAYOUT_UPDATED'; layout: PresencePiPLayout }
  | { type: 'PRESENCE_SEEK_SYNCED'; playheadMs: number; offsetMs: number }
  | { type: 'PRESENCE_AVATAR_FRAME'; frame: AvatarRigBlendShapeFrame }
  | { type: 'PRESENCE_ERROR'; message: string; recoverable: boolean };

/**
 * Provider interface implemented by V1 WebRTC PiP and future V2 Avatar Rig tracks.
 */
export interface ICreatorPresenceProvider {
  readonly mode: PresenceTrackMode;
  getCapabilities(): PresenceStreamCapabilities;
  getLayout(): PresencePiPLayout;
  updateLayout(patch: Partial<PresencePiPLayout>): PresencePiPLayout;
  attachMediaStream(stream: MediaStream | null): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  syncToTimeline(playheadMs: number): void;
  onEvent(listener: (event: PresenceTrackEvent) => void): () => void;
}
