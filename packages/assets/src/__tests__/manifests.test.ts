import { describe, it, expect } from 'vitest';
import {
  playingCardsAtlas,
  isometricTilesAtlas,
  modularCharactersAtlas,
  uiSpritesAtlas,
  getFrameCoordinates,
  toFlameSpriteData,
  PLAYING_CARDS,
  ISOMETRIC_TILES,
  MODULAR_CHARACTERS,
  UI_SPRITES,
} from '../manifests/index';

describe('@digitalcanopy/assets Atlas Manifests', () => {
  describe('Playing Cards Atlas', () => {
    it('has valid metadata and image path', () => {
      expect(playingCardsAtlas.meta.pack).toBe('playing-cards');
      expect(playingCardsAtlas.meta.image).toBe(
        'https://cdn.sunshade.icu/assets/kenney/cards/playing-cards-atlas.png'
      );
      expect(playingCardsAtlas.meta.size.w).toBe(2048);
      expect(playingCardsAtlas.meta.size.h).toBeGreaterThan(0);
    });

    it('contains all cards defined in PLAYING_CARDS autocomplete keys', () => {
      expect(Object.keys(playingCardsAtlas.frames).length).toBe(PLAYING_CARDS.length);
      for (const cardKey of PLAYING_CARDS) {
        const frame = playingCardsAtlas.frames[cardKey];
        expect(frame).toBeDefined();
        expect(frame.frame.w).toBe(140);
        expect(frame.frame.h).toBe(190);
        expect(frame.frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.frame.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Isometric Tiles Atlas', () => {
    it('has valid metadata and image path', () => {
      expect(isometricTilesAtlas.meta.pack).toBe('isometric-tiles');
      expect(isometricTilesAtlas.meta.image).toBe(
        'https://cdn.sunshade.icu/assets/kenney/isometric-miniature-dungeon/isometric-tiles-atlas.png'
      );
      expect(isometricTilesAtlas.meta.size.w).toBe(2048);
      expect(isometricTilesAtlas.meta.size.h).toBe(384);
    });

    it('contains all isometric tiles defined in ISOMETRIC_TILES keys', () => {
      expect(Object.keys(isometricTilesAtlas.frames).length).toBe(ISOMETRIC_TILES.length);
      for (const tileKey of ISOMETRIC_TILES) {
        const frame = isometricTilesAtlas.frames[tileKey];
        expect(frame).toBeDefined();
        expect(frame.frame.w).toBe(256);
        expect(frame.frame.h).toBe(128);
        expect(frame.anchor).toEqual({ ax: 0.5, ay: 0.75 });
      }
    });
  });

  describe('Modular Characters Atlas', () => {
    it('has valid metadata and image path', () => {
      expect(modularCharactersAtlas.meta.pack).toBe('modular-characters');
      expect(modularCharactersAtlas.meta.image).toBe(
        'https://cdn.sunshade.icu/assets/kenney/modular-characters/modular-characters-atlas.png'
      );
    });

    it('contains all character parts defined in MODULAR_CHARACTERS keys', () => {
      expect(Object.keys(modularCharactersAtlas.frames).length).toBe(MODULAR_CHARACTERS.length);
      for (const charKey of MODULAR_CHARACTERS) {
        const frame = modularCharactersAtlas.frames[charKey];
        expect(frame).toBeDefined();
        expect(frame.frame.w).toBe(128);
        expect(frame.frame.h).toBe(128);
      }
    });
  });

  describe('UI Sprites Atlas', () => {
    it('has valid metadata and image path', () => {
      expect(uiSpritesAtlas.meta.pack).toBe('ui-sprites');
      expect(uiSpritesAtlas.meta.image).toBe(
        'https://cdn.sunshade.icu/assets/kenney/ui-pack/ui-sprites-atlas.png'
      );
    });

    it('contains all UI sprites defined in UI_SPRITES keys', () => {
      expect(Object.keys(uiSpritesAtlas.frames).length).toBe(UI_SPRITES.length);
      for (const uiKey of UI_SPRITES) {
        const frame = uiSpritesAtlas.frames[uiKey];
        expect(frame).toBeDefined();
        expect(frame.frame.w).toBeGreaterThan(0);
        expect(frame.frame.h).toBeGreaterThan(0);
      }
    });
  });

  describe('Helper Functions', () => {
    it('getFrameCoordinates returns correct frame or undefined', () => {
      const frame = getFrameCoordinates(playingCardsAtlas, 'card-spades-a');
      expect(frame).toBeDefined();
      expect(frame?.frame.x).toBe(0);
      expect(frame?.frame.y).toBe(0);

      const missing = getFrameCoordinates(playingCardsAtlas, 'non-existent-card');
      expect(missing).toBeUndefined();
    });

    it('toFlameSpriteData formats flame sprite component coordinates', () => {
      const cardData = toFlameSpriteData(playingCardsAtlas, 'card-spades-a');
      expect(cardData).toEqual({
        srcPosition: [0, 0],
        srcSize: [140, 190],
        anchor: [0.5, 0.5],
      });

      const tileData = toFlameSpriteData(isometricTilesAtlas, 'tile-isometric-grass');
      expect(tileData).toEqual({
        srcPosition: [0, 0],
        srcSize: [256, 128],
        anchor: [0.5, 0.75],
      });

      const nullData = toFlameSpriteData(playingCardsAtlas, 'non-existent');
      expect(nullData).toBeNull();
    });
  });
});
