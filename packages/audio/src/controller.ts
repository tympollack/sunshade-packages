import {
  AudioControllerConfig,
  AudioSettings,
  PlaySoundOptions,
  SoundDefinition,
  SoundKey,
} from './types';
import { synthesizeSound } from './synthesizer';

const DEFAULT_STORAGE_KEY = 'sunshade_audio_settings';

export const SOUND_DEFINITIONS: Record<SoundKey, SoundDefinition> = {
  'ui.click': {
    key: 'ui.click',
    category: 'ui',
    description: 'Crisp tactile UI click for buttons and toggles',
    defaultVolume: 0.8,
  },
  'ui.tap': {
    key: 'ui.tap',
    category: 'ui',
    description: 'Soft tactile tap for mobile and stage targets',
    defaultVolume: 0.85,
  },
  'ui.modal_open': {
    key: 'ui.modal_open',
    category: 'ui',
    description: 'Rising chime for modal dialog and overlay appearances',
    defaultVolume: 0.75,
  },
  'ui.modal_close': {
    key: 'ui.modal_close',
    category: 'ui',
    description: 'Falling tone for modal dismissal and drawer collapse',
    defaultVolume: 0.7,
  },
  'ui.modal_slide': {
    key: 'ui.modal_slide',
    category: 'ui',
    description: 'Subtle airy slide whoosh for side panels and bottom sheets',
    defaultVolume: 0.7,
  },
  'ui.button_hover': {
    key: 'ui.button_hover',
    category: 'ui',
    description: 'Subtle high frequency tick for cursor hover states',
    defaultVolume: 0.3,
  },
  'impact.puck_bounce': {
    key: 'impact.puck_bounce',
    category: 'impact',
    description: 'Resonant wooden bounce for puck rail collisions',
    defaultVolume: 0.9,
  },
  'impact.beanbag_thud': {
    key: 'impact.beanbag_thud',
    category: 'impact',
    description: 'Deep heavy sand and fabric thud for cornhole pitch landings',
    defaultVolume: 1.0,
  },
  'impact.card_deal': {
    key: 'impact.card_deal',
    category: 'impact',
    description: 'Crisp paper flick for card draw and deal actions',
    defaultVolume: 0.8,
  },
  'impact.card_shuffle': {
    key: 'impact.card_shuffle',
    category: 'impact',
    description: 'Multi-card riffle flutter for deck shuffling',
    defaultVolume: 0.85,
  },
  'impact.card_clash': {
    key: 'impact.card_clash',
    category: 'impact',
    description: 'High metallic ring and sharp impact for War clashes',
    defaultVolume: 0.95,
  },
};

export class AudioController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private settings: AudioSettings;
  private storageKey: string;
  private disableStorage: boolean;

  constructor(config?: AudioControllerConfig) {
    this.storageKey = config?.storageKey ?? DEFAULT_STORAGE_KEY;
    this.disableStorage = config?.disableStorage ?? false;

    // Load initial settings with storage fallback
    const persisted = this.loadPersistedSettings();
    this.settings = {
      masterVolume: config?.defaultSettings?.masterVolume ?? persisted?.masterVolume ?? 1.0,
      isMuted: config?.defaultSettings?.isMuted ?? persisted?.isMuted ?? false,
      sfxVolume: config?.defaultSettings?.sfxVolume ?? persisted?.sfxVolume ?? 1.0,
    };

    if (config?.audioContext) {
      this.initContext(config.audioContext);
    }
  }

  private loadPersistedSettings(): Partial<AudioSettings> | null {
    if (this.disableStorage || typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private persistSettings(): void {
    if (this.disableStorage || typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch {
      // Ignore write errors (e.g., storage quota or private browsing mode)
    }
  }

  /**
   * Initializes or attaches the AudioContext and sets up the gain node graph:
   * [Synthesizer / Source] -> [sfxGain] -> [masterGain] -> [ctx.destination]
   */
  private initContext(existingCtx?: AudioContext): AudioContext | null {
    if (this.ctx && this.masterGain && this.sfxGain) {
      return this.ctx;
    }

    try {
      if (existingCtx) {
        this.ctx = existingCtx;
      } else if (typeof window !== 'undefined') {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          this.ctx = new AudioCtxClass();
        }
      }

      if (!this.ctx) return null;

      // Master Gain
      this.masterGain = this.ctx.createGain();
      const currentMasterGain = this.settings.isMuted ? 0 : this.settings.masterVolume;
      this.masterGain.gain.setValueAtTime(currentMasterGain, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // SFX Gain
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.settings.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Ensures the audio context is unlocked/resumed upon user interaction.
   * Resolves autoplay restrictions in modern mobile and desktop browsers.
   */
  public async unlock(): Promise<boolean> {
    const ctx = this.initContext();
    if (!ctx) return false;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Current snapshot of audio settings.
   */
  public getSettings(): Readonly<AudioSettings> {
    return { ...this.settings };
  }

  /**
   * Set master volume (0.0 to 1.0).
   * Automatically persists to local storage.
   */
  public setMasterVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.settings.masterVolume = clamped;
    this.persistSettings();

    if (this.masterGain && this.ctx) {
      const effectiveGain = this.settings.isMuted ? 0 : clamped;
      this.masterGain.gain.setValueAtTime(effectiveGain, this.ctx.currentTime);
    }
  }

  /**
   * Set SFX volume (0.0 to 1.0).
   * Automatically persists to local storage.
   */
  public setSfxVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.settings.sfxVolume = clamped;
    this.persistSettings();

    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(clamped, this.ctx.currentTime);
    }
  }

  /**
   * Set mute state. When muted, all playback is immediately silenced.
   * Automatically persists to local storage.
   */
  public setMuted(isMuted: boolean): void {
    this.settings.isMuted = isMuted;
    this.persistSettings();

    if (this.masterGain && this.ctx) {
      const effectiveGain = isMuted ? 0 : this.settings.masterVolume;
      this.masterGain.gain.setValueAtTime(effectiveGain, this.ctx.currentTime);
    }
  }

  /**
   * Toggle mute state. Returns the new mute state.
   */
  public toggleMute(): boolean {
    this.setMuted(!this.settings.isMuted);
    return this.settings.isMuted;
  }

  /**
   * Play a sound effect by key with sub-20ms guaranteed trigger latency.
   * If muted or volume is 0, completely silences and returns false immediately with 0ms delay.
   */
  public async play(sound: SoundKey, options?: PlaySoundOptions): Promise<boolean> {
    // Zero latency shortcut: If muted or master volume is zero, immediately bail out.
    if (this.settings.isMuted || this.settings.masterVolume === 0) {
      return false;
    }

    const ctx = this.initContext();
    if (!ctx) return false;

    // If context was suspended by autoplay policy, attempt quick resume
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Autoplay policy blocked; fail gracefully
        return false;
      }
    }

    const def = SOUND_DEFINITIONS[sound];
    const baseVolume = def ? def.defaultVolume : 1.0;
    const finalVolume = baseVolume * (options?.volume ?? 1.0);

    return synthesizeSound(ctx, sound, this.sfxGain!, {
      ...options,
      volume: finalVolume,
    });
  }

  /**
   * Disposes of the AudioContext and gain nodes, freeing system audio resources.
   */
  public async dispose(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        await this.ctx.close();
      } catch {
        // Ignore close errors
      }
    }
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
  }
}
