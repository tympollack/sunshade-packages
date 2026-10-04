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
