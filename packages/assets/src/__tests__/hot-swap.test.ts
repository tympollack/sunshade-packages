import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAssetRegistry,
  playingCardsAtlas,
  isometricTilesAtlas,
  modularCharactersAtlas,
  toFlameSpriteData,
  PLAYING_CARDS,
  ISOMETRIC_TILES,
  type AssetRegistry,
} from '../index';

describe('@digitalcanopy/assets Drop-In Custom IP Hot-Swap Integration', () => {
  let registry: AssetRegistry;

  beforeEach(() => {
    registry = createAssetRegistry();
  });

  describe('Scenario 1: War: Second Wind (WSW) Card Deck Hot-Swap', () => {
    it('seamlessly swaps entire 52-card deck to custom IP cyberpunk theme', () => {
      // 1. Baseline verification: ace of spades resolves Kenney CDN
      const baselineAce = registry.resolveCardUrl('card-spades-a');
      expect(baselineAce).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-a.png');

      // 2. Custom IP drop-in: Cyberpunk Neon Deck hosted on custom IP CDN
      const customDeckBase = 'https://cdn.digitalcanopy.io/custom-ip/decks/cyberpunk-neon';
      registry.registerPackOverride('cards', customDeckBase);

      // 3. Resolve all 52 cards under custom IP
      for (const cardKey of PLAYING_CARDS) {
        const resolved = registry.resolveCardUrl(cardKey);
        expect(resolved).toBe(`${customDeckBase}/${cardKey}.png`);
      }

      // 4. Hot-swap a single legendary card with a holographic animated SVG
      registry.registerOverride('card-spades-a', {
        url: 'https://cdn.digitalcanopy.io/custom-ip/decks/holo/card-spades-a.svg',
        frame: { x: 0, y: 0, w: 280, h: 380 }, // Hi-DPI frame
        anchor: { ax: 0.5, ay: 0.5 },
      });

      expect(registry.resolveCardUrl('card-spades-a')).toBe(
        'https://cdn.digitalcanopy.io/custom-ip/decks/holo/card-spades-a.svg'
      );

      // Verify flame coordinate conversion respects custom high-DPI frame
      const flameData = registry.resolveFlameSpriteData(playingCardsAtlas, 'card-spades-a');
      expect(flameData?.srcSize).toEqual([280, 380]);

      // 5. Revert back to Kenney standard
      registry.reset();
      expect(registry.resolveCardUrl('card-spades-a')).toBe(baselineAce);
    });
  });

  describe('Scenario 2: Avatar Studio Modular Character Hot-Swap', () => {
    it('hot-swaps cosmetic slots with custom IP anime avatar pack', () => {
      // Baseline check
      const baselineHair = registry.resolveCharacterUrl('hair', 'curly-brown');
      expect(baselineHair).toBe(
        'https://cdn.sunshade.icu/assets/kenney/modular-characters/hair/curly-brown.png'
      );

      // Drop in custom anime cosmetics
      registry.registerOverrides({
        'hair/curly-brown': {
          url: 'https://cdn.digitalcanopy.io/avatars/anime/hair_curly_brown.png',
          frame: { x: 0, y: 0, w: 256, h: 256 },
          anchor: { ax: 0.5, ay: 0.7 },
        },
        'face/face-0': {
          url: 'https://cdn.digitalcanopy.io/avatars/anime/face_0.png',
          frame: { x: 0, y: 0, w: 256, h: 256 },
          anchor: { ax: 0.5, ay: 0.5 },
        },
      });

      expect(registry.resolveCharacterUrl('hair', 'curly-brown')).toBe(
        'https://cdn.digitalcanopy.io/avatars/anime/hair_curly_brown.png'
      );

      // Frame check
      const flameHair = registry.resolveFlameSpriteData(modularCharactersAtlas, 'hair/curly-brown');
      expect(flameHair).toEqual({
        srcPosition: [0, 0],
        srcSize: [256, 256],
        anchor: [0.5, 0.7],
      });

      // Unmodified slots fall back smoothly
      expect(registry.resolveCharacterUrl('pants', 'pants-0')).toBe(
        'https://cdn.sunshade.icu/assets/kenney/modular-characters/pants/pants-0.png'
      );
    });
  });

  describe('Scenario 3: Cozy Villages Isometric Tile Hot-Swap', () => {
    it('replaces 2.5D isometric tiles with custom biome without anchor drift', () => {
      const tileKey = ISOMETRIC_TILES[0]; // e.g. isometric-tile-00
      const standardFlame = toFlameSpriteData(isometricTilesAtlas, tileKey);
      expect(standardFlame?.anchor).toEqual([0.5, 0.75]);

      // Hot-swap with custom fantasy forest tile
      registry.registerOverride(tileKey, {
        url: 'https://cdn.digitalcanopy.io/cozy/biomes/fantasy-forest/tile-00.png',
        frame: { x: 0, y: 0, w: 512, h: 256 },
        anchor: { ax: 0.5, ay: 0.75 }, // Preserve isometric floor pivot
      });

      const flameData = registry.resolveFlameSpriteData(isometricTilesAtlas, tileKey);
      expect(flameData?.srcSize).toEqual([512, 256]);
      expect(flameData?.anchor).toEqual([0.5, 0.75]);
    });
  });
});
