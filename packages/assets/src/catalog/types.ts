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

/**
 * Canonical seed dataset from PostgreSQL migration 20261010110001_kenney_asset_catalog.sql.
 * Used for in-memory resolution, offline testing, and initial cache hydration.
 */
export const SEED_CATALOG_ASSETS: readonly CatalogAsset[] = [
  // Avatar Studio: Modular Characters
  {
    app_scope: 'avatar-studio',
    category: 'avatar_base',
    asset_key: 'avatar-base-neutral',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/base/base_neutral.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'base' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_base',
    asset_key: 'avatar-base-pale',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/base/base_pale.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'base' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_base',
    asset_key: 'avatar-base-warm',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/base/base_warm.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'base' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_hair',
    asset_key: 'avatar-hair-curly-brown',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/hair/curly_brown.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'hair' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_hair',
    asset_key: 'avatar-hair-short-black',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/hair/short_black.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'hair' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_hair',
    asset_key: 'avatar-hair-spiky-blonde',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/hair/spiky_blonde.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'hair' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_hair',
    asset_key: 'avatar-hair-bob-red',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/hair/bob_red.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'hair' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_eyes',
    asset_key: 'avatar-eyes-round-blue',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/eyes/round_blue.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'eyes' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_eyes',
    asset_key: 'avatar-eyes-focused-green',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/eyes/focused_green.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'eyes' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_eyes',
    asset_key: 'avatar-eyes-sleepy-brown',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/eyes/sleepy_brown.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'eyes' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_mouth',
    asset_key: 'avatar-mouth-smile',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/mouth/smile.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'mouth' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_mouth',
    asset_key: 'avatar-mouth-grin',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/mouth/grin.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'mouth' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_mouth',
    asset_key: 'avatar-mouth-neutral',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/mouth/neutral.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'mouth' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_outfit',
    asset_key: 'avatar-outfit-hoodie-cyan',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/outfit/hoodie_cyan.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'outfit' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_outfit',
    asset_key: 'avatar-outfit-tunic-green',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/outfit/tunic_green.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'outfit' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_outfit',
    asset_key: 'avatar-outfit-jacket-dark',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/outfit/jacket_dark.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'outfit' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_hat',
    asset_key: 'avatar-hat-beanie-orange',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/hat/beanie_orange.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'hat' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_hat',
    asset_key: 'avatar-hat-cap-blue',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/hat/cap_blue.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'hat' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_accessory',
    asset_key: 'avatar-accessory-glasses-black',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/accessory/glasses_black.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'accessory' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_accessory',
    asset_key: 'avatar-accessory-scarf-red',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/modular-characters/accessory/scarf_red.png',
    metadata: { format: 'png', width: 128, height: 128, license: 'CC0-Kenney', layer: 'accessory' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_frame',
    asset_key: 'avatar-frame-bronze',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/fantasy-ui/frames/frame_bronze.png',
    metadata: { format: 'png', width: 160, height: 160, license: 'CC0-Kenney', layer: 'frame' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_frame',
    asset_key: 'avatar-frame-silver',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/fantasy-ui/frames/frame_silver.png',
    metadata: { format: 'png', width: 160, height: 160, license: 'CC0-Kenney', layer: 'frame' },
  },
  {
    app_scope: 'avatar-studio',
    category: 'avatar_frame',
    asset_key: 'avatar-frame-gold',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/fantasy-ui/frames/frame_gold.png',
    metadata: { format: 'png', width: 160, height: 160, license: 'CC0-Kenney', layer: 'frame' },
  },

  // Critterverse: Modular Splice Parts
  {
    app_scope: 'critterverse',
    category: 'critter_head',
    asset_key: 'critter-head-fuzzy-orange',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/critters/parts/head_fuzzy_orange.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'critterverse',
    category: 'critter_head',
    asset_key: 'critter-head-scaled-teal',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/critters/parts/head_scaled_teal.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'critterverse',
    category: 'critter_body',
    asset_key: 'critter-body-chubby-pink',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/critters/parts/body_chubby_pink.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'critterverse',
    category: 'critter_body',
    asset_key: 'critter-body-sleek-green',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/critters/parts/body_sleek_green.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'critterverse',
    category: 'critter_limbs',
    asset_key: 'critter-limbs-paws-brown',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/critters/parts/limbs_paws_brown.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'critterverse',
    category: 'critter_wings',
    asset_key: 'critter-wings-feathered-white',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/critters/parts/wings_feathered_white.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'critterverse',
    category: 'critter_tail',
    asset_key: 'critter-tail-fluffy-gold',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/critters/parts/tail_fluffy_gold.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'critterverse',
    category: 'critter_horns',
    asset_key: 'critter-horns-curved-ivory',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/critters/parts/horns_curved_ivory.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },

  // War: Second Wind (WSW) Cards
  {
    app_scope: 'wsw',
    category: 'card_back',
    asset_key: 'card-back-cyan',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/cards/backs/card_back_cyan.png',
    metadata: { format: 'png', width: 140, height: 190, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'wsw',
    category: 'card_back',
    asset_key: 'card-back-crimson',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/cards/backs/card_back_crimson.png',
    metadata: { format: 'png', width: 140, height: 190, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'wsw',
    category: 'card_face',
    asset_key: 'card-face-spades-ace',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/cards/faces/card_spades_A.png',
    metadata: { format: 'png', width: 140, height: 190, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'wsw',
    category: 'card_face',
    asset_key: 'card-face-hearts-king',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/cards/faces/card_hearts_K.png',
    metadata: { format: 'png', width: 140, height: 190, license: 'CC0-Kenney' },
  },

  // Puk Huk Physics Elements
  {
    app_scope: 'puk-huk',
    category: 'physics_puck',
    asset_key: 'puk-puck-standard',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/physics/pucks/puck_standard.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney', radius: 32 },
  },
  {
    app_scope: 'puk-huk',
    category: 'physics_bumper',
    asset_key: 'puk-bumper-wood',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/physics/bumpers/bumper_wood.png',
    metadata: { format: 'png', width: 128, height: 32, license: 'CC0-Kenney', restitution: 0.85 },
  },

  // Cozy Villages Isometric Assets
  {
    app_scope: 'cozy',
    category: 'isometric_building',
    asset_key: 'cozy-building-cottage',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/isometric/buildings/cottage.png',
    metadata: { format: 'png', width: 256, height: 256, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'cozy',
    category: 'isometric_tile',
    asset_key: 'cozy-tile-grass-meadow',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/isometric/tiles/grass_meadow.png',
    metadata: { format: 'png', width: 256, height: 128, license: 'CC0-Kenney' },
  },

  // Shared Tactile FX & Audio
  {
    app_scope: 'all',
    category: 'particle_fx',
    asset_key: 'fx-particle-starburst',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/particles/starburst.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'all',
    category: 'particle_fx',
    asset_key: 'fx-particle-dust-puff',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/particles/dust_puff.png',
    metadata: { format: 'png', width: 64, height: 64, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'all',
    category: 'ui_audio',
    asset_key: 'audio-ui-tap',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/audio/ui/tap_clean.ogg',
    metadata: { format: 'ogg', duration_ms: 85, license: 'CC0-Kenney' },
  },
  {
    app_scope: 'all',
    category: 'impact_audio',
    asset_key: 'audio-impact-wood-thud',
    cdn_url: 'https://cdn.sunshade.icu/assets/kenney/audio/impacts/wood_thud.ogg',
    metadata: { format: 'ogg', duration_ms: 140, license: 'CC0-Kenney' },
  },
];
