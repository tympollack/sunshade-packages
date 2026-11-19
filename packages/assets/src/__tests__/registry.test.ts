import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AssetRegistry,
  createAssetRegistry,
  assetRegistry,
  playingCardsAtlas,
  toFlameSpriteData,
  SEED_CATALOG_ASSETS,
} from '../index';

describe('@digitalcanopy/assets Hot-Swapping Registry', () => {
  let registry: AssetRegistry;

  beforeEach(() => {
    registry = createAssetRegistry();
  });

  describe('Registry Instantiation & Singleton', () => {
    it('creates isolated instances with createAssetRegistry', () => {
      const regA = createAssetRegistry();
      const regB = createAssetRegistry();

      regA.registerOverride('test-key', 'https://custom.com/a.png');
      expect(regA.hasOverride('test-key')).toBe(true);
      expect(regB.hasOverride('test-key')).toBe(false);
    });

    it('exports a global singleton assetRegistry', () => {
      expect(assetRegistry).toBeInstanceOf(AssetRegistry);
      assetRegistry.reset();
      expect(assetRegistry.getSnapshot().activeOverridesCount).toBe(0);
    });
  });

  describe('Asset Overrides Registration & Removal', () => {
    it('registers string URL override', () => {
      registry.registerOverride('card-spades-10', 'https://custom-ip.com/spades-10.png');
      expect(registry.hasOverride('card-spades-10')).toBe(true);

      const resolved = registry.resolveCardUrl('card-spades-10');
      expect(resolved).toBe('https://custom-ip.com/spades-10.png');
    });

    it('registers full AssetOverride object with frame and anchor', () => {
      registry.registerOverride('card-spades-10', {
        url: 'https://custom-ip.com/custom-atlas.png',
        frame: { x: 100, y: 200, w: 150, h: 210 },
        anchor: { ax: 0.5, ay: 0.8 },
      });

      const frame = registry.resolveFrame(playingCardsAtlas, 'card-spades-10');
      expect(frame).toBeDefined();
      expect(frame?.frame).toEqual({ x: 100, y: 200, w: 150, h: 210 });
      expect(frame?.anchor).toEqual({ ax: 0.5, ay: 0.8 });

      const flameData = registry.resolveFlameSpriteData(playingCardsAtlas, 'card-spades-10');
      expect(flameData).toEqual({
        srcPosition: [100, 200],
        srcSize: [150, 210],
        anchor: [0.5, 0.8],
      });
    });

    it('registers batch overrides using dictionary', () => {
      registry.registerOverrides({
        'card-spades-a': 'https://custom.com/ace.png',
        'card-hearts-k': { url: 'https://custom.com/king.png' },
      });

      expect(registry.hasOverride('card-spades-a')).toBe(true);
      expect(registry.hasOverride('card-hearts-k')).toBe(true);
      expect(registry.resolveCardUrl('card-spades-a')).toBe('https://custom.com/ace.png');
      expect(registry.resolveCardUrl('card-hearts-k')).toBe('https://custom.com/king.png');
    });

    it('removes single override cleanly', () => {
      registry.registerOverride('temp-key', 'https://custom.com/temp.png');
      expect(registry.hasOverride('temp-key')).toBe(true);

      const removed = registry.removeOverride('temp-key');
      expect(removed).toBe(true);
      expect(registry.hasOverride('temp-key')).toBe(false);
    });

    it('clears all overrides while keeping pack overrides', () => {
      registry.registerOverride('key-1', 'https://custom.com/1.png');
      registry.registerPackOverride('cards', 'https://custom.com/cards');

      registry.clearOverrides();
      expect(registry.hasOverride('key-1')).toBe(false);

      // Pack override still active
      const card = registry.resolveCardUrl('card-spades-2');
      expect(card).toBe('https://custom.com/cards/card-spades-2.png');
    });

    it('resets all overrides and pack overrides', () => {
      registry.registerOverride('key-1', 'https://custom.com/1.png');
      registry.registerPackOverride('cards', 'https://custom.com/cards');

      registry.reset();
      const snapshot = registry.getSnapshot();
      expect(snapshot.activeOverridesCount).toBe(0);
      expect(snapshot.activePacksCount).toBe(0);

      // Falls back to Kenney CDN
      const card = registry.resolveCardUrl('card-spades-2');
      expect(card).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-2.png');
    });
  });

  describe('Pack-Level Hot-Swapping', () => {
    it('overrides entire pack with custom CDN base URL', () => {
      registry.registerPackOverride('cards', 'https://nft-decks.io/v1/cyberpunk');

      const card1 = registry.resolveCardUrl('card-spades-a');
      expect(card1).toBe('https://nft-decks.io/v1/cyberpunk/card-spades-a.png');

      const card2 = registry.resolveCardUrl('card-hearts-q', 'svg');
      expect(card2).toBe('https://nft-decks.io/v1/cyberpunk/card-hearts-q.svg');
    });

    it('overrides entire pack with custom resolver function', () => {
      registry.registerPackOverride('modular-characters', (assetPath, ext) => {
        return `https://avatar-cdn.custom.io/sprites/${assetPath.toUpperCase()}.${ext || 'png'}`;
      });

      const hair = registry.resolveCharacterUrl('hair', 'curly-brown');
      expect(hair).toBe('https://avatar-cdn.custom.io/sprites/HAIR/CURLY-BROWN.png');
    });

    it('prioritizes key-level overrides over pack-level overrides', () => {
      registry.registerPackOverride('cards', 'https://nft-decks.io/general');
      registry.registerOverride('card-spades-a', 'https://nft-decks.io/special/legendary-ace.png');

      expect(registry.resolveCardUrl('card-spades-a')).toBe(
        'https://nft-decks.io/special/legendary-ace.png'
      );
      expect(registry.resolveCardUrl('card-spades-k')).toBe(
        'https://nft-decks.io/general/card-spades-k.png'
      );
    });

    it('removes pack override cleanly', () => {
      registry.registerPackOverride('cards', 'https://nft-decks.io/temp');
      expect(registry.removePackOverride('cards')).toBe(true);

      expect(registry.resolveCardUrl('card-spades-a')).toBe(
        'https://cdn.sunshade.icu/assets/kenney/cards/card-spades-a.png'
      );
    });
  });

  describe('Database Catalog Hydration', () => {
    it('hydrates overrides directly from catalog assets', () => {
      registry.loadCatalog(SEED_CATALOG_ASSETS, 'wsw');

      // WSW assets should be overridden
      expect(registry.hasOverride('card-back-cyan')).toBe(true);
      expect(registry.hasOverride('card-face-spades-ace')).toBe(true);
      expect(registry.resolveCardUrl('card-back-cyan')).toBe(
        'https://cdn.sunshade.icu/assets/kenney/cards/backs/card_back_cyan.png'
      );

      // Non-WSW assets should not be registered when scoped to 'wsw'
      expect(registry.hasOverride('avatar-base-neutral')).toBe(false);
    });

    it('hydrates all assets when no appScope filter is passed', () => {
      registry.loadCatalog(SEED_CATALOG_ASSETS);
      expect(registry.hasOverride('avatar-base-neutral')).toBe(true);
      expect(registry.hasOverride('cozy-building-cottage')).toBe(true);
      expect(registry.hasOverride('audio-ui-tap')).toBe(true);
    });
  });

  describe('Fallback Resolution Guarantee', () => {
    it('falls back to default Kenney CDN when no override is present', () => {
      const url = registry.resolveCardUrl('card-spades-10');
      expect(url).toBe('https://cdn.sunshade.icu/assets/kenney/cards/card-spades-10.png');

      const char = registry.resolveCharacterUrl('face', 'face-0');
      expect(char).toBe('https://cdn.sunshade.icu/assets/kenney/modular-characters/face/face-0.png');

      const audio = registry.resolveAudioUrl('switch-b');
      expect(audio).toBe('https://cdn.sunshade.icu/assets/kenney/ui-pack/sounds/switch-b.ogg');
    });

    it('falls back to canonical Flame sprite coordinates when no frame override is present', () => {
      const flame = registry.resolveFlameSpriteData(playingCardsAtlas, 'card-spades-a');
      const standard = toFlameSpriteData(playingCardsAtlas, 'card-spades-a');
      expect(flame).toEqual(standard);
    });
  });

  describe('Hot-Swap Lifecycle Events & Subscriptions', () => {
    it('notifies listeners when overrides are registered', () => {
      const listener = vi.fn();
      const unsub = registry.subscribe(listener);

      registry.registerOverride('test-key', 'https://test.com/img.png');
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'override_registered',
          keys: ['test-key'],
        })
      );

      unsub();
      registry.registerOverride('another-key', 'https://test.com/another.png');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies listeners on clear and reset', () => {
      const listener = vi.fn();
      registry.onSwap(listener);

      registry.clearOverrides();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cleared' })
      );

      registry.reset();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'reset' })
      );
    });
  });
});
