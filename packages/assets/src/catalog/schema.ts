import type { CatalogAsset } from './types';

export const CATALOG_SCHEMA_NAME = 'catalog';
export const CATALOG_TABLE_NAME = 'assets';
export const CATALOG_FULL_TABLE_NAME = `${CATALOG_SCHEMA_NAME}.${CATALOG_TABLE_NAME}`;

/**
 * Full PostgreSQL DDL specification for catalog.assets.
 * Matches sunshade-db-platform migration 20261010110001_kenney_asset_catalog.sql.
 */
export const CATALOG_ASSETS_SCHEMA_SQL = `
-- Schema Provisioning
CREATE SCHEMA IF NOT EXISTS catalog;

-- catalog.assets — Universal Game Asset Registry
CREATE TABLE IF NOT EXISTS catalog.assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_scope   TEXT NOT NULL,
    category    TEXT NOT NULL,
    asset_key   TEXT UNIQUE NOT NULL,
    cdn_url     TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for Rapid Querying
CREATE INDEX IF NOT EXISTS idx_catalog_assets_app_scope
    ON catalog.assets (app_scope);

CREATE INDEX IF NOT EXISTS idx_catalog_assets_category
    ON catalog.assets (category);

-- Role Grants
GRANT USAGE ON SCHEMA catalog TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA catalog TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA catalog TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA catalog TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO anon, authenticated;

-- Row Level Security & Access Policies
ALTER TABLE catalog.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.assets FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "catalog_assets_public_read" ON catalog.assets;
    CREATE POLICY "catalog_assets_public_read"
        ON catalog.assets
        FOR SELECT
        TO anon, authenticated
        USING (true);
END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "catalog_assets_service_role_all" ON catalog.assets;
    CREATE POLICY "catalog_assets_service_role_all"
        ON catalog.assets
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
END $$;
`.trim();

/**
 * Type guard to check if an unknown object conforms to the CatalogAsset interface.
 */
export function isCatalogAsset(value: unknown): value is CatalogAsset {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.app_scope === 'string' &&
    item.app_scope.length > 0 &&
    typeof item.category === 'string' &&
    item.category.length > 0 &&
    typeof item.asset_key === 'string' &&
    item.asset_key.length > 0 &&
    typeof item.cdn_url === 'string' &&
    item.cdn_url.length > 0 &&
    typeof item.metadata === 'object' &&
    item.metadata !== null
  );
}

/**
 * Detailed validator returning human-readable validation errors.
 */
export function validateCatalogAsset(asset: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!asset || typeof asset !== 'object') {
    return { valid: false, errors: ['Catalog asset must be a non-null object'] };
  }

  const item = asset as Record<string, unknown>;

  if (typeof item.app_scope !== 'string' || item.app_scope.trim() === '') {
    errors.push('app_scope must be a non-empty string');
  }

  if (typeof item.category !== 'string' || item.category.trim() === '') {
    errors.push('category must be a non-empty string');
  }

  if (typeof item.asset_key !== 'string' || item.asset_key.trim() === '') {
    errors.push('asset_key must be a non-empty string');
  }

  if (typeof item.cdn_url !== 'string' || !/^https?:\/\//i.test(item.cdn_url)) {
    errors.push('cdn_url must be a valid HTTP/HTTPS URL string');
  }

  if (typeof item.metadata !== 'object' || item.metadata === null || Array.isArray(item.metadata)) {
    errors.push('metadata must be a JSON object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a normalized asset key slug from parts.
 */
export function formatCatalogAssetKey(
  appScope: string,
  category: string,
  identifier: string
): string {
  const sanitize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `${sanitize(appScope)}-${sanitize(category)}-${sanitize(identifier)}`.replace(/-+/g, '-');
}
