import { describe, it, expect } from 'vitest';
import {
  KENNEY_CDN_BASE,
  getKenneyAssetUrl,
  getKenneyAudioUrl,
  getKenneyCardUrl,
  getKenneyCharacterUrl,
} from '../resolvers/index';

describe('@sunshade/assets CDN Resolvers', () => {
  it('resolves base CDN URL correctly', () => {
    expect(KENNEY_CDN_BASE).toBe('https://cdn.sunshade.icu/assets/kenney');
  });

  it('resolves standard asset url with default extension', () => {
    const url = getKenneyAssetUrl('modular-characters', 'base_01');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/modular-characters/base_01.png');
  });

  it('resolves asset url with explicit extension', () => {
    const url = getKenneyAssetUrl('ui-pack', 'button-default', 'svg');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/button-default.svg');
  });

  it('handles extensions with leading dot cleanly', () => {
    const url = getKenneyAssetUrl('ui-pack', 'button-default', '.svg');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/button-default.svg');
  });

  it('does not duplicate extension if key already contains it', () => {
    const url1 = getKenneyAssetUrl('cards', 'card-spades-10.png');
    expect(url1).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-10.png');

    const url2 = getKenneyAssetUrl('cards', 'card-spades-10.png', 'png');
    expect(url2).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-10.png');
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
