import { AudioController, SOUND_DEFINITIONS } from './controller';
import {
  AudioControllerConfig,
  AudioSettings,
  ImpactSoundKey,
  PlaySoundOptions,
  SoundDefinition,
  SoundKey,
  UISoundKey,
} from './types';

export * from './types';
export { AudioController, SOUND_DEFINITIONS } from './controller';
export { synthesizeSound } from './synthesizer';

let defaultController: AudioController | null = null;

/**
 * Get or initialize the shared singleton AudioController.
 */
export function getAudioController(config?: AudioControllerConfig): AudioController {
  if (!defaultController) {
    defaultController = new AudioController(config);
  }
  return defaultController;
}

/**
 * Global convenience helper to play a sound effect using the shared AudioController.
 * Zero playback lag (<20ms), completely silenced if muted.
 */
export function playAudio(sound: SoundKey, options?: PlaySoundOptions): Promise<boolean> {
  return getAudioController().play(sound, options);
}

/**
 * Global convenience helper to set master volume across all soundscapes.
 */
export function setAudioMasterVolume(volume: number): void {
  getAudioController().setMasterVolume(volume);
}

/**
 * Global convenience helper to toggle audio mute state.
 */
export function toggleAudioMute(): boolean {
  return getAudioController().toggleMute();
}

/**
 * Check whether audio is currently muted in the shared controller.
 */
export function isAudioMuted(): boolean {
  return getAudioController().getSettings().isMuted;
}
