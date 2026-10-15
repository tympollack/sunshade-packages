import { SoundKey, PlaySoundOptions } from './types';

// WeakMap cache for reusable noise buffers per AudioContext
const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  let buffer = noiseBufferCache.get(ctx);
  if (!buffer) {
    const sampleRate = ctx.sampleRate || 44100;
    const length = sampleRate; // 1 second of noise
    buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseBufferCache.set(ctx, buffer);
  }
  return buffer;
}

function createNoiseSource(ctx: AudioContext, detune?: number, startTime?: number): AudioBufferSourceNode {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  if (detune && 'detune' in noise && noise.detune) {
    noise.detune.setValueAtTime(detune, startTime ?? ctx.currentTime);
  }
  return noise;
}

/**
 * Synthesize and play a sound procedurally using Web Audio API nodes.
 * Latency is instantaneous (<5ms) as waveforms and noise envelopes are calculated in real time.
 */
export function synthesizeSound(
  ctx: AudioContext,
  sound: SoundKey,
  destination: AudioNode,
  options?: PlaySoundOptions
): boolean {
  const now = ctx.currentTime;
  const rate = options?.playbackRate ?? 1.0;
  const detune = options?.detune ?? 0;
  const volMultiplier = options?.volume ?? 1.0;

  switch (sound) {
    case 'ui.click': {
      // Crisp click / blip: sine sweep from 850Hz to 350Hz over 30ms
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(850 * rate, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, 350 * rate), now + 0.03);
      if (detune) osc.detune.setValueAtTime(detune, now);

      gain.gain.setValueAtTime(0.5 * volMultiplier, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(now);
      osc.stop(now + 0.04);
      return true;
    }

    case 'ui.tap': {
      // Tactile warm tap: low triangle pulse with lowpass filter
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240 * rate, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, 80 * rate), now + 0.04);
      if (detune) osc.detune.setValueAtTime(detune, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450 * rate, now);

      gain.gain.setValueAtTime(0.6 * volMultiplier, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      osc.start(now);
      osc.stop(now + 0.05);
      return true;
    }

    case 'ui.modal_open': {
      // Upward smooth chime / whoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320 * rate, now);
      osc.frequency.exponentialRampToValueAtTime(720 * rate, now + 0.09);
      if (detune) osc.detune.setValueAtTime(detune, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.4 * volMultiplier, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(now);
      osc.stop(now + 0.11);
      return true;
    }

    case 'ui.modal_close': {
      // Downward smooth chime / tuck
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(640 * rate, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, 260 * rate), now + 0.08);
      if (detune) osc.detune.setValueAtTime(detune, now);

      gain.gain.setValueAtTime(0.35 * volMultiplier, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(now);
      osc.stop(now + 0.1);
      return true;
    }

    case 'ui.modal_slide': {
      // Soft airy whoosh slide: filtered noise + low sine undertone
      const noise = createNoiseSource(ctx, detune, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(750 * rate, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(10, 280 * rate), now + 0.12);
      filter.Q.setValueAtTime(1.8, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35 * volMultiplier, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      noise.start(now);
      noise.stop(now + 0.14);
      return true;
    }

    case 'ui.button_hover': {
      // Ultra-short tick
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200 * rate, now);
      if (detune) osc.detune.setValueAtTime(detune, now);

      gain.gain.setValueAtTime(0.15 * volMultiplier, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(now);
      osc.stop(now + 0.02);
      return true;
    }

    case 'impact.puck_bounce': {
      // Wooden bounce: sharp click transient + dual resonant wood body tones
      // 1. Strike transient
      const noise = createNoiseSource(ctx, detune, now);
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(1400 * rate, now);
      noiseFilter.Q.setValueAtTime(2.5, now);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4 * volMultiplier, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(destination);
      noise.start(now);
      noise.stop(now + 0.025);

      // 2. Resonant wood body oscillation
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(210 * rate, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, 95 * rate), now + 0.06);
      if (detune) osc.detune.setValueAtTime(detune, now);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.7 * volMultiplier, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(oscGain);
      oscGain.connect(destination);
      osc.start(now);
      osc.stop(now + 0.08);
      return true;
    }

    case 'impact.beanbag_thud': {
      // Heavy fabric/sand thud: deep sub-frequency drop + low muffled slap
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130 * rate, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, 42 * rate), now + 0.08);
      if (detune) osc.detune.setValueAtTime(detune, now);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.8 * volMultiplier, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      // Low muffled cloth noise
      const noise = createNoiseSource(ctx, detune, now);
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(320 * rate, now);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35 * volMultiplier, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(destination);
      noise.start(now);
      noise.stop(now + 0.07);

      osc.connect(oscGain);
      oscGain.connect(destination);
      osc.start(now);
      osc.stop(now + 0.1);
      return true;
    }

    case 'impact.card_deal': {
      // Swift paper flick / card deal
      const noise = createNoiseSource(ctx, detune, now);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2600 * rate, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.55 * volMultiplier, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      noise.start(now);
      noise.stop(now + 0.045);
      return true;
    }

    case 'impact.card_shuffle': {
      // Multi-card flutter: 4 micro-flicks in rapid succession (0ms, 25ms, 55ms, 85ms)
      const offsets = [0, 0.025, 0.055, 0.085];
      offsets.forEach((offset, idx) => {
        const t = now + offset;
        const noise = createNoiseSource(ctx, detune, t);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime((2400 + idx * 250) * rate, t);
        filter.Q.setValueAtTime(2.0, t);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4 * volMultiplier, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.028);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        noise.start(t);
        noise.stop(t + 0.032);
      });
      return true;
    }

    case 'impact.card_clash': {
      // War event clash: high metallic chime + sharp snap
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const oscGain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880 * rate, now);
      osc1.frequency.exponentialRampToValueAtTime(Math.max(10, 440 * rate), now + 0.18);
      if (detune) osc1.detune.setValueAtTime(detune, now);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1320 * rate, now);
      osc2.frequency.exponentialRampToValueAtTime(Math.max(10, 660 * rate), now + 0.18);

      oscGain.gain.setValueAtTime(0.55 * volMultiplier, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

      osc1.connect(oscGain);
      osc2.connect(oscGain);
      oscGain.connect(destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.2);
      osc2.stop(now + 0.2);

      // Impact transient
      const noise = createNoiseSource(ctx, detune, now);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3400 * rate, now);
      filter.Q.setValueAtTime(3.5, now);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6 * volMultiplier, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(destination);
      noise.start(now);
      noise.stop(now + 0.05);
      return true;
    }

    default: {
      const _exhaustiveCheck: never = sound;
      return false;
    }
  }
}
