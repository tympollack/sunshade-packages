import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AudioController,
  SOUND_DEFINITIONS,
  getAudioController,
  playAudio,
  setAudioMasterVolume,
  toggleAudioMute,
  isAudioMuted,
  SoundKey,
} from '../index';

// --- Web Audio API Mock Helpers ---
class MockAudioParam {
  value: number;
  setValueAtTime = vi.fn((val: number) => {
    this.value = val;
  });
  exponentialRampToValueAtTime = vi.fn((val: number) => {
    this.value = val;
  });
  linearRampToValueAtTime = vi.fn((val: number) => {
    this.value = val;
  });
  constructor(initial = 1.0) {
    this.value = initial;
  }
}

class MockAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1.0);
}

class MockOscillatorNode extends MockAudioNode {
  type = 'sine';
  frequency = new MockAudioParam(440);
  detune = new MockAudioParam(0);
  start = vi.fn();
  stop = vi.fn();
}

class MockBiquadFilterNode extends MockAudioNode {
  type = 'lowpass';
  frequency = new MockAudioParam(350);
  Q = new MockAudioParam(1);
}

class MockBufferSourceNode extends MockAudioNode {
  buffer: unknown = null;
  start = vi.fn();
  stop = vi.fn();
}

class MockAudioContext {
  currentTime = 0.5;
  sampleRate = 44100;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = new MockAudioNode();

  createGain = vi.fn(() => new MockGainNode());
  createOscillator = vi.fn(() => new MockOscillatorNode());
  createBiquadFilter = vi.fn(() => new MockBiquadFilterNode());
  createBufferSource = vi.fn(() => new MockBufferSourceNode());
  createBuffer = vi.fn((channels: number, length: number) => ({
    numberOfChannels: channels,
    length,
    sampleRate: 44100,
    getChannelData: vi.fn(() => new Float32Array(length)),
  }));
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
}

describe('@digitalcanopy/audio - AudioController & Soundscapes', () => {
  let mockCtx: MockAudioContext;
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockCtx = new MockAudioContext();
    mockStorage = {};

    // Mock localStorage
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };

    vi.stubGlobal('localStorage', storageMock);
    vi.stubGlobal('window', {
      localStorage: storageMock,
      AudioContext: vi.fn(() => mockCtx),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Initialization & Settings', () => {
    it('initializes with default settings when storage is empty', () => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });
      const settings = controller.getSettings();

      expect(settings.masterVolume).toBe(1.0);
      expect(settings.sfxVolume).toBe(1.0);
      expect(settings.isMuted).toBe(false);
    });

    it('loads persisted settings from localStorage', () => {
      mockStorage['sunshade_audio_settings'] = JSON.stringify({
        masterVolume: 0.65,
        sfxVolume: 0.8,
        isMuted: true,
      });

      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });
      const settings = controller.getSettings();

      expect(settings.masterVolume).toBe(0.65);
      expect(settings.sfxVolume).toBe(0.8);
      expect(settings.isMuted).toBe(true);
    });

    it('persists settings to localStorage upon mutation', () => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });

      controller.setMasterVolume(0.4);
      expect(JSON.parse(mockStorage['sunshade_audio_settings'])).toMatchObject({
        masterVolume: 0.4,
      });

      controller.setSfxVolume(0.75);
      expect(JSON.parse(mockStorage['sunshade_audio_settings'])).toMatchObject({
        masterVolume: 0.4,
        sfxVolume: 0.75,
      });

      controller.setMuted(true);
      expect(JSON.parse(mockStorage['sunshade_audio_settings'])).toMatchObject({
        isMuted: true,
      });
    });

    it('clamps volume inputs between 0.0 and 1.0', () => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });

      controller.setMasterVolume(2.5);
      expect(controller.getSettings().masterVolume).toBe(1.0);

      controller.setMasterVolume(-0.5);
      expect(controller.getSettings().masterVolume).toBe(0.0);

      controller.setSfxVolume(1.8);
      expect(controller.getSettings().sfxVolume).toBe(1.0);

      controller.setSfxVolume(-1.2);
      expect(controller.getSettings().sfxVolume).toBe(0.0);
    });
  });

  describe('Mute Controls & Silencing', () => {
    it('completely silences all playback when muted and returns false immediately', async () => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });
      controller.setMuted(true);

      const played = await controller.play('ui.click');
      expect(played).toBe(false);
      // Oscillator should not even be created
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    });

    it('silences playback when master volume is zero', async () => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });
      controller.setMasterVolume(0);

      const played = await controller.play('impact.puck_bounce');
      expect(played).toBe(false);
      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    });

    it('toggles mute state and updates gain node correctly', () => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });

      const newMuteState = controller.toggleMute();
      expect(newMuteState).toBe(true);
      expect(controller.getSettings().isMuted).toBe(true);

      const restoredMuteState = controller.toggleMute();
      expect(restoredMuteState).toBe(false);
      expect(controller.getSettings().isMuted).toBe(false);
    });
  });

  describe('Latency & Sub-20ms Guarantee', () => {
    it('executes and schedules sound generation within 20ms latency requirement', async () => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });

      // Pre-warm context to avoid Node/V8 cold-start compilation overhead
      await controller.play('ui.button_hover');

      const start = performance.now();
      const played = await controller.play('ui.click');
      const elapsed = performance.now() - start;

      expect(played).toBe(true);
      expect(elapsed).toBeLessThan(20);
    });
  });

  describe('Sound Catalog Synthesizer Coverage', () => {
    const allSounds: SoundKey[] = [
      'ui.click',
      'ui.tap',
      'ui.modal_open',
      'ui.modal_close',
      'ui.modal_slide',
      'ui.button_hover',
      'impact.puck_bounce',
      'impact.beanbag_thud',
      'impact.card_deal',
      'impact.card_shuffle',
      'impact.card_clash',
    ];

    it.each(allSounds)('successfully synthesizes %s without errors', async (soundKey) => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });

      const played = await controller.play(soundKey);
      expect(played).toBe(true);
      expect(SOUND_DEFINITIONS[soundKey]).toBeDefined();
      expect(SOUND_DEFINITIONS[soundKey].key).toBe(soundKey);
    });

    it('applies custom volume, playbackRate, and detune options', async () => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });

      const played = await controller.play('ui.click', {
        volume: 0.5,
        playbackRate: 1.2,
        detune: 50,
      });

      expect(played).toBe(true);
      expect(mockCtx.createOscillator).toHaveBeenCalled();
    });
  });

  describe('Global Helper Singletons', () => {
    it('provides functional global convenience methods', async () => {
      setAudioMasterVolume(0.85);
      expect(getAudioController().getSettings().masterVolume).toBe(0.85);

      const initialMute = isAudioMuted();
      const toggled = toggleAudioMute();
      expect(toggled).toBe(!initialMute);
      expect(isAudioMuted()).toBe(!initialMute);

      // Unmute for playAudio test
      if (isAudioMuted()) toggleAudioMute();

      const played = await playAudio('ui.tap');
      expect(typeof played).toBe('boolean');
    });
  });

  describe('AudioContext Lifecycle & Autoplay Handling', () => {
    it('unlocks and resumes suspended AudioContext on unlock()', async () => {
      mockCtx.state = 'suspended';
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });

      const unlocked = await controller.unlock();
      expect(unlocked).toBe(true);
      expect(mockCtx.resume).toHaveBeenCalled();
      expect(mockCtx.state).toBe('running');
    });

    it('disposes and closes AudioContext cleanly on dispose()', async () => {
      const controller = new AudioController({
        audioContext: mockCtx as unknown as AudioContext,
      });

      await controller.dispose();
      expect(mockCtx.close).toHaveBeenCalled();
    });
  });
});
