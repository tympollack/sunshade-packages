import playingCardsAtlasJson from './playing-cards.atlas.json';
import isometricTilesAtlasJson from './isometric-tiles.atlas.json';
import modularCharactersAtlasJson from './modular-characters.atlas.json';
import uiSpritesAtlasJson from './ui-sprites.atlas.json';

export * from './keys';

/**
 * Atlas and Sprite Sheet Coordinate Specifications
 * Compatible with Flame (Flutter) and HTML5 Canvas / Pixi / WebGL
 */
export interface SpriteBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnchorPoint {
  ax: number;
  ay: number;
}

export interface AtlasFrame {
  frame: SpriteBounds;
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: SpriteBounds;
  sourceSize?: { w: number; h: number };
  anchor?: AnchorPoint;
}

export interface AtlasManifest {
  meta: {
    app: string;
    version: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
    pack: string;
  };
  frames: Record<string, AtlasFrame>;
}

export interface AssetManifestMetadata {
  pack_id: string;
  name: string;
  category: string;
  license: string;
  total_assets: number;
  cdn_base: string;
}

export const playingCardsAtlas = playingCardsAtlasJson as AtlasManifest;
export const isometricTilesAtlas = isometricTilesAtlasJson as AtlasManifest;
export const modularCharactersAtlas = modularCharactersAtlasJson as AtlasManifest;
export const uiSpritesAtlas = uiSpritesAtlasJson as AtlasManifest;

/**
 * Retrieves frame coordinate data from an atlas manifest.
 */
export function getFrameCoordinates(
  manifest: AtlasManifest,
  frameKey: string
): AtlasFrame | undefined {
  return manifest.frames[frameKey];
}

/**
 * Formats coordinates for Flame (Flutter) SpriteComponent.fromFrame data mapping.
 */
export function toFlameSpriteData(manifest: AtlasManifest, frameKey: string) {
  const frameData = manifest.frames[frameKey];
  if (!frameData) return null;
  return {
    srcPosition: [frameData.frame.x, frameData.frame.y] as [number, number],
    srcSize: [frameData.frame.w, frameData.frame.h] as [number, number],
    anchor: [frameData.anchor?.ax ?? 0.5, frameData.anchor?.ay ?? 0.5] as [number, number],
  };
}
