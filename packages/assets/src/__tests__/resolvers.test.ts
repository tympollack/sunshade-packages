import { describe, it, expect } from 'vitest';
import {
  CDN_BASE_URL,
  KENNEY_CDN_BASE,
  getKenneyAssetUrl,
  getKenneyAudioUrl,
  getKenneyCardUrl,
  getKenneyCharacterUrl,
} from '../resolvers/cdn';

describe('@digitalcanopy/assets CDN Resolvers', () => {
  it('resolves base CDN URL correctly', () => {
    expect(CDN_BASE_URL).toBe('https://cdn.sunshade.icu/assets/kenney');
    expect(KENNEY_CDN_BASE).toBe('https://cdn.sunshade.icu/assets/kenney');
  });

  it('resolves asset url with assetPath including extension', () => {
    const url = getKenneyAssetUrl('modular-characters', 'base_01.png');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/modular-characters/base_01.png');
  });

  it('resolves bare asset keys by appending .png by default', () => {
    const url = getKenneyAssetUrl('cards', 'spades_10');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/cards/spades_10.png');
  });

  it('resolves bare asset key with explicit extension string', () => {
    const url = getKenneyAssetUrl('ui-pack', 'button-default', 'svg');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/button-default.svg');
  });

  it('resolves bare asset key with leading dot in extension cleanly', () => {
    const url = getKenneyAssetUrl('ui-pack', 'button-default', '.svg');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/button-default.svg');
  });

  it('does not duplicate extension if assetPath already has it matching ext', () => {
    const url1 = getKenneyAssetUrl('cards', 'card-spades-10.png');
    expect(url1).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-10.png');

    const url2 = getKenneyAssetUrl('cards', 'card-spades-10.png', 'png');
    expect(url2).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-10.png');
  });

  it('handles leading and trailing slashes cleanly', () => {
    const url = getKenneyAssetUrl('/ui-pack/', '/button-default.svg');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/button-default.svg');
  });

  it('resolves nested asset paths correctly', () => {
    const url = getKenneyAssetUrl('cards', 'subfolder/card-spades-10.png');
    expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/cards/subfolder/card-spades-10.png');
  });

  it('resolves audio sound effects correctly and normalizes dotted extension', () => {
    const ogg = getKenneyAudioUrl('click-a');
    expect(ogg).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/sounds/click-a.ogg');

    const wav = getKenneyAudioUrl('switch-b', 'wav');
    expect(wav).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/sounds/switch-b.wav');

    const dotted = getKenneyAudioUrl('switch-b', '.wav');
    expect(dotted).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/sounds/switch-b.wav');
  });

  it('resolves playing card URLs correctly and normalizes dotted extension', () => {
    const card = getKenneyCardUrl('card-spades-10');
    expect(card).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-10.png');

    const svgCard = getKenneyCardUrl('card-spades-10', '.svg');
    expect(svgCard).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-10.svg');
    expect(svgCard).not.toContain('..svg');
  });

  it('resolves character avatar component URLs correctly and normalizes dotted extension', () => {
    const face = getKenneyCharacterUrl('face', 'face-0');
    expect(face).toBe('https://cdn.sunshade.icu/assets/kenney/modular-characters/face/face-0.png');

    const dottedFace = getKenneyCharacterUrl('face', 'face-0', '.png');
    expect(dottedFace).toBe('https://cdn.sunshade.icu/assets/kenney/modular-characters/face/face-0.png');
    expect(dottedFace).not.toContain('..png');
  });
});
