import type { SpriteBounds, AnchorPoint } from '../manifests/index';

/**
 * Standard metadata shape stored in catalog.assets (PostgreSQL JSONB).
 */
export interface CatalogAssetMetadata {
  format?: 'png' | 'svg' | 'ogg' | 'wav' | 'mp3' | string;
  width?: number;
  height?: number;
  license?: string;
  layer?: string;
  duration_ms?: number;
  radius?: number;
  restitution?: number;
  frame?: SpriteBounds;
  anchor?: AnchorPoint;
  pack?: string;
  [key: string]: unknown;
}

/**
 * Universal Game Asset Catalog Record.
 * Represents a row in the catalog.assets PostgreSQL table.
 */
export interface CatalogAsset {
  id?: string;
  app_scope: CatalogAppScope;
  category: CatalogCategory;
  asset_key: string;
  cdn_url: string;
  metadata: CatalogAssetMetadata;
  created_at?: string;
}

/**
 * Direct mapping to raw catalog.assets database row.
 */
export interface CatalogAssetRow {
  id: string;
  app_scope: string;
  category: string;
  asset_key: string;
  cdn_url: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type CatalogAssetInsert = Omit<CatalogAsset, 'id' | 'created_at'> & {
  id?: string;
};

export type CatalogAssetUpdate = Partial<Omit<CatalogAsset, 'id' | 'created_at'>>;

export type CatalogAppScope =
  | 'avatar-studio'
  | 'critterverse'
  | 'wsw'
  | 'puk-huk'
  | 'cozy'
  | 'all'
  | (string & {});

export type CatalogCategory =
  | 'avatar_base'
  | 'avatar_hair'
  | 'avatar_eyes'
  | 'avatar_mouth'
  | 'avatar_outfit'
  | 'avatar_hat'
  | 'avatar_accessory'
  | 'avatar_frame'
  | 'critter_head'
  | 'critter_body'
  | 'critter_limbs'
  | 'critter_wings'
  | 'critter_tail'
  | 'critter_horns'
  | 'card_back'
  | 'card_face'
  | 'physics_puck'
  | 'physics_bumper'
  | 'isometric_building'
  | 'isometric_tile'
  | 'particle_fx'
  | 'ui_audio'
  | 'impact_audio'
  | (string & {});

export * from './seed';

