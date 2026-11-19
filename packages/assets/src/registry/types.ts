import type { SpriteBounds, AnchorPoint } from '../manifests/index';

/**
 * Custom asset override definition for hot-swapping individual assets.
 */
export interface AssetOverride {
  /**
   * Target URL resolving this asset (can point to custom IP CDN, R2, S3, local, or data URL).
   */
  url: string;

  /**
   * Optional custom frame bounding box within an atlas or sprite sheet.
   */
  frame?: SpriteBounds;

  /**
   * Optional custom pivot anchor point (e.g. { ax: 0.5, ay: 0.8 }).
   */
  anchor?: AnchorPoint;

  /**
   * Optional application scope targeting this asset.
   */
  app_scope?: string;

  /**
   * Optional semantic category identifier.
   */
  category?: string;

  /**
   * Arbitrary extra metadata passed by custom IP providers.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Custom resolver function for dynamically resolving paths within a pack.
 */
export type PackResolver = (assetPath: string, ext?: string) => string;

/**
 * Pack override can be either a CDN base URL prefix or a custom resolver callback.
 */
export type PackOverride = string | PackResolver;

export interface FlameSpriteData {
  srcPosition: [number, number];
  srcSize: [number, number];
  anchor: [number, number];
}

export type HotSwapEventType =
  | 'override_registered'
  | 'override_removed'
  | 'pack_registered'
  | 'pack_removed'
  | 'catalog_loaded'
  | 'cleared'
  | 'reset';

export interface HotSwapEvent {
  type: HotSwapEventType;
  keys?: string[];
  pack?: string;
  app_scope?: string;
  timestamp: number;
}

export type HotSwapListener = (event: HotSwapEvent) => void;

export interface RegistrySnapshot {
  activeOverridesCount: number;
  activePacksCount: number;
  overriddenKeys: string[];
  overriddenPacks: string[];
}
