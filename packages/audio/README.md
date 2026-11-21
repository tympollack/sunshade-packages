# @digitalcanopy/audio

High-performance, zero-latency procedural Web Audio soundscapes and effects for SunShade games and applications.

## Features

- **Zero Network Lag (<20ms)**: Synthesizes Kenney-grade tactile UI and impact sound effects entirely on the client using the Web Audio API without requiring binary audio downloads.
- **Audio Controls & Persistence**: Master volume, SFX volume, and complete mute toggle persisted to `localStorage`.
- **Mute Guarantee**: Complete muting stops oscillator scheduling and silences output instantly with zero CPU overhead.
- **Autoplay Handling**: Built-in `unlock()` resolves iOS and mobile browser user gesture audio restrictions.

## Sound Catalog

### UI Sounds
- `ui.click`: Crisp tactile click for buttons, switches, and toggles.
- `ui.tap`: Warm, low-frequency pulse for touch targets and arcade stage interactions.
- `ui.modal_open`: Rising smooth chime for dialog and sheet appearances.
- `ui.modal_close`: Falling smooth tone for modal dismissals.
- `ui.modal_slide`: Subtle airy whoosh for drawers and sliding side panels.
- `ui.button_hover`: Ultra-short subtle tick for cursor hover states.

### Impact Sounds
- `impact.puck_bounce`: Resonant wooden rail bounce for air hockey and shuffleboard games (`puk_huk`).
- `impact.beanbag_thud`: Deep heavy fabric and sand thud on wood board for cornhole (`pocket_pitch`).
- `impact.card_deal`: Crisp paper flick for drawing and dealing playing cards.
- `impact.card_shuffle`: Multi-card riffle flutter for deck shuffling.
- `impact.card_clash`: Energetic metallic ring and sharp impact for card war events (`second_wind`).

## Installation

```bash
npm install @digitalcanopy/audio
```

## Usage

### Simple Global Helpers

```typescript
import { playAudio, setAudioMasterVolume, toggleAudioMute, isAudioMuted } from '@digitalcanopy/audio';

// Play a sound effect with zero latency
await playAudio('ui.click');

// Play physics impact with custom volume or pitch
await playAudio('impact.puck_bounce', {
  volume: 0.9,
  playbackRate: 1.1, // Pitch shifting
});

// Audio controls
setAudioMasterVolume(0.75); // 0.0 to 1.0
toggleAudioMute(); // Flips mute state and persists
console.log('Muted:', isAudioMuted());
```

### AudioController Instance

For custom configurations or isolated sound systems:

```typescript
import { AudioController } from '@digitalcanopy/audio';

const controller = new AudioController({
  storageKey: 'my_app_audio_settings',
  defaultSettings: {
    masterVolume: 0.8,
    isMuted: false,
  },
});

// Unlock audio context on first user click (optional, handled automatically)
await controller.unlock();

// Play sound
await controller.play('impact.beanbag_thud');

// Clean up
await controller.dispose();
```
