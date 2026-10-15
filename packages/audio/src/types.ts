export type UISoundKey =
  | 'ui.click'
  | 'ui.tap'
  | 'ui.modal_open'
  | 'ui.modal_close'
  | 'ui.modal_slide'
  | 'ui.button_hover';

export type ImpactSoundKey =
  | 'impact.puck_bounce'
  | 'impact.beanbag_thud'
  | 'impact.card_deal'
  | 'impact.card_shuffle'
  | 'impact.card_clash';

export type SoundKey = UISoundKey | ImpactSoundKey;

export interface AudioSettings {
  /** Master volume multiplier from 0.0 to 1.0 */
  masterVolume: number;
  /** Whether all audio playback is completely muted */
  isMuted: boolean;
  /** SFX volume multiplier from 0.0 to 1.0 (default: 1.0) */
  sfxVolume: number;
}

export interface PlaySoundOptions {
  /** Volume override from 0.0 to 1.0 (multiplied with master & sfx volume) */
  volume?: number;
  /** Playback rate / pitch multiplier (e.g. 0.8 - 1.2) */
  playbackRate?: number;
  /** Detune in cents */
  detune?: number;
}

export interface SoundDefinition {
  key: SoundKey;
  category: 'ui' | 'impact';
  description: string;
  defaultVolume: number;
}

export interface AudioControllerConfig {
  /** LocalStorage key for persisting audio settings. Defaults to 'sunshade_audio_settings'. */
  storageKey?: string;
  /** Custom AudioContext constructor or instance, primarily for testing/mocking */
  audioContext?: AudioContext | null;
  /** Default audio settings to use if none found in storage */
  defaultSettings?: Partial<AudioSettings>;
  /** Disable localStorage access if running in restricted environments */
  disableStorage?: boolean;
}
