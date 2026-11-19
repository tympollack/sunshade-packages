import { describe, it, expect, vi } from 'vitest';
import {
  SEED_CATALOG_ASSETS,
  CATALOG_SCHEMA_NAME,
  CATALOG_TABLE_NAME,
  CATALOG_FULL_TABLE_NAME,
  CATALOG_ASSETS_SCHEMA_SQL,
  isCatalogAsset,
  validateCatalogAsset,
  formatCatalogAssetKey,
  filterCatalog,
  filterCatalogByScope,
  filterCatalogByCategory,
  createCatalogMap,
  loadCatalogAssets,
} from '../catalog/index';

describe('@digitalcanopy/assets Catalog Schema & Data Layer', () => {
  describe('Schema Constants & DDL Specifications', () => {
    it('defines standard schema and table identifiers', () => {
      expect(CATALOG_SCHEMA_NAME).toBe('catalog');
      expect(CATALOG_TABLE_NAME).toBe('assets');
      expect(CATALOG_FULL_TABLE_NAME).toBe('catalog.assets');
    });

    it('contains valid PostgreSQL DDL matching sunshade-db-platform migration', () => {
      expect(CATALOG_ASSETS_SCHEMA_SQL).toContain('CREATE SCHEMA IF NOT EXISTS catalog;');
      expect(CATALOG_ASSETS_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS catalog.assets');
      expect(CATALOG_ASSETS_SCHEMA_SQL).toContain('idx_catalog_assets_app_scope');
      expect(CATALOG_ASSETS_SCHEMA_SQL).toContain('catalog_assets_public_read');
    });
  });

  describe('Validation & Type Guards', () => {
    it('validates a conformant catalog asset', () => {
      const asset = SEED_CATALOG_ASSETS[0];
      expect(isCatalogAsset(asset)).toBe(true);

      const res = validateCatalogAsset(asset);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('detects missing or invalid fields', () => {
      expect(isCatalogAsset(null)).toBe(false);
      expect(isCatalogAsset({})).toBe(false);

      const invalid = {
        app_scope: '',
        category: 'avatar_base',
        asset_key: '',
        cdn_url: 'not-a-url',
        metadata: 'bad-metadata',
      };

      const res = validateCatalogAsset(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors.some((e) => e.includes('app_scope'))).toBe(true);
      expect(res.errors.some((e) => e.includes('asset_key'))).toBe(true);
      expect(res.errors.some((e) => e.includes('cdn_url'))).toBe(true);
      expect(res.errors.some((e) => e.includes('metadata'))).toBe(true);
    });

    it('formats normalized asset key slugs', () => {
      const key = formatCatalogAssetKey('Avatar Studio', 'Hair', 'Spiky Blonde 01');
      expect(key).toBe('avatar-studio-hair-spiky-blonde-01');
    });
  });

  describe('Canonical Seed Data', () => {
    it('contains all 43 canonical seed items from migration 20261010110001', () => {
      expect(SEED_CATALOG_ASSETS.length).toBe(43);

      const map = createCatalogMap(SEED_CATALOG_ASSETS);
      expect(map.size).toBe(SEED_CATALOG_ASSETS.length);

      // Verify specific domains
      expect(map.has('avatar-base-neutral')).toBe(true);
      expect(map.has('avatar-frame-gold')).toBe(true);
      expect(map.has('critter-head-fuzzy-orange')).toBe(true);
      expect(map.has('card-back-cyan')).toBe(true);
      expect(map.has('card-face-spades-ace')).toBe(true);
      expect(map.has('puk-puck-standard')).toBe(true);
      expect(map.has('cozy-tile-grass-meadow')).toBe(true);
      expect(map.has('audio-ui-tap')).toBe(true);
    });

    it('has valid metadata and URLs on all seed items', () => {
      for (const item of SEED_CATALOG_ASSETS) {
        expect(item.cdn_url).toMatch(/^https:\/\/cdn\.sunshade\.icu\/assets\/kenney\//);
        expect(item.app_scope).toBeTruthy();
        expect(item.category).toBeTruthy();
        expect(item.asset_key).toBeTruthy();
        expect(typeof item.metadata).toBe('object');
      }
    });
  });

  describe('Filtering & In-Memory Lookups', () => {
    it('filters assets by app_scope', () => {
      const wswAssets = filterCatalogByScope(SEED_CATALOG_ASSETS, 'wsw');
      expect(wswAssets.length).toBeGreaterThanOrEqual(4);
      for (const asset of wswAssets) {
        expect(asset.app_scope === 'wsw' || asset.app_scope === 'all').toBe(true);
      }
    });

    it('filters assets by category', () => {
      const frames = filterCatalogByCategory(SEED_CATALOG_ASSETS, 'avatar_frame');
      expect(frames).toHaveLength(3);
      expect(frames.map((f) => f.asset_key)).toEqual([
        'avatar-frame-bronze',
        'avatar-frame-silver',
        'avatar-frame-gold',
      ]);
    });

    it('filters assets by multiple criteria including explicit keys', () => {
      const filtered = filterCatalog(SEED_CATALOG_ASSETS, {
        app_scope: 'avatar-studio',
        category: 'avatar_hat',
        asset_keys: ['avatar-hat-beanie-orange'],
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].asset_key).toBe('avatar-hat-beanie-orange');
    });
  });

  describe('Catalog Loader with Supabase Client Mocking', () => {
    it('loads fallback seed assets when no supabase client is provided', async () => {
      const assets = await loadCatalogAssets({ app_scope: 'cozy' });
      expect(assets.length).toBeGreaterThanOrEqual(2);
      expect(assets.some((a) => a.asset_key === 'cozy-tile-grass-meadow')).toBe(true);
    });

    it('queries Supabase client schema and table when provided', async () => {
      const mockRows = [
        {
          id: 'test-uuid-1',
          app_scope: 'custom-game',
          category: 'cards',
          asset_key: 'custom-card-ace',
          cdn_url: 'https://cdn.custom.com/card.png',
          metadata: { custom: true },
          created_at: '2026-11-19T00:00:00Z',
        },
      ];

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: mockRows, error: null }),
      });

      const fromMock = vi.fn().mockReturnValue({ select: selectMock });
      const schemaMock = vi.fn().mockReturnValue({ from: fromMock });

      const mockSupabase = {
        schema: schemaMock,
        from: fromMock,
      };

      const result = await loadCatalogAssets({
        supabaseClient: mockSupabase as any,
        app_scope: 'custom-game',
      });

      expect(schemaMock).toHaveBeenCalledWith('catalog');
      expect(fromMock).toHaveBeenCalledWith('assets');
      expect(result).toHaveLength(1);
      expect(result[0].asset_key).toBe('custom-card-ace');
      expect(result[0].cdn_url).toBe('https://cdn.custom.com/card.png');
    });

    it('gracefully falls back to seed data when Supabase query returns error', async () => {
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: null, error: new Error('Database connection failed') }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({ select: selectMock }),
      };

      const result = await loadCatalogAssets({
        supabaseClient: mockSupabase as any,
        app_scope: 'avatar-studio',
        fallbackToSeed: true,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((a) => a.asset_key === 'avatar-base-neutral')).toBe(true);
    });
  });
});
