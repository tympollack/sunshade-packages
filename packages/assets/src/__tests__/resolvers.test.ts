import { describe, it, expect } from 'vitest';
import {
  CDN_BASE_URL,
  getKenneyAssetUrl,
  getKenneyAudioUrl,
  getKenneyCardUrl,
  getKenneyCharacterUrl,
} from '../resolvers/cdn';

describe('@digitalcanopy/assets CDN Resolvers', () => {
  it('resolves base CDN URL correctly', () => {
    expect(CDN_BASE_URL).toBe('https://cdn.sunshade.icu/assets/kenney');
  });

  it('resolves asset url with assetPath', () => {
    const url = getKenneyAssetUrl('modular-characters', 'base_01.png');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/modular-characters/base_01.png');
  });

  it('handles leading and trailing slashes cleanly', () => {
    const url = getKenneyAssetUrl('/ui-pack/', '/button-default.svg');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/button-default.svg');
  });

  it('resolves nested asset paths correctly', () => {
    const url = getKenneyAssetUrl('cards', 'subfolder/card-spades-10.png');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/cards/subfolder/card-spades-10.png');
  });

  it('resolves audio sound effects correctly', () => {
    const ogg = getKenneyAudioUrl('click-a');
    expect(ogg).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/sounds/click-a.ogg');

    const wav = getKenneyAudioUrl('switch-b', 'wav');
    expect(wav).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/sounds/switch-b.wav');
  });

  it('resolves playing card URLs correctly', () => {
    const card = getKenneyCardUrl('card-spades-10');
    expect(card).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-10.png');
  });

  it('resolves character avatar component URLs correctly', () => {
    const face = getKenneyCharacterUrl('face', 'face-0');
    expect(face).toBe('https://cdn.sunshade.icu/assets/kenney/modular-characters/face/face-0.png');
  });
});
