import { SEED_CATALOG_ASSETS, type CatalogAsset, type CatalogAssetMetadata } from './types';
import { CATALOG_SCHEMA_NAME, CATALOG_TABLE_NAME, isCatalogAsset } from './schema';

/**
 * Minimal duck-typed interface matching Supabase PostgREST client queries.
 */
export interface SupabaseClientLike {
  schema?: (schemaName: string) => SupabaseClientLike;
  from: (table: string) => {
    select: (columns?: string) => any;
  };
}

export interface CatalogQueryOptions {
  /**
   * Filter by one or more app scopes (e.g. 'avatar-studio', 'wsw', 'all').
   */
  app_scope?: string | string[];

  /**
   * Filter by one or more asset categories (e.g. 'card_face', 'avatar_hair').
   */
  category?: string | string[];

  /**
   * Filter by explicit asset keys.
   */
  asset_keys?: string[];

  /**
   * Optional active Supabase client instance.
   * If omitted, the loader falls back to canonical SEED_CATALOG_ASSETS.
   */
  supabaseClient?: SupabaseClientLike;

  /**
   * Whether to fall back to in-memory SEED_CATALOG_ASSETS if the remote query fails or returns empty.
   * Default: true.
   */
  fallbackToSeed?: boolean;
}

/**
 * Filters an array of catalog assets in memory according to the specified criteria.
 */
export function filterCatalog(
  assets: readonly CatalogAsset[],
  filter: {
    app_scope?: string | string[];
    category?: string | string[];
    asset_keys?: string[];
  }
): CatalogAsset[] {
  let result = [...assets];

  if (filter.app_scope) {
    const scopes = Array.isArray(filter.app_scope) ? filter.app_scope : [filter.app_scope];
    result = result.filter(
      (a) => scopes.includes(a.app_scope) || scopes.includes('all') || a.app_scope === 'all'
    );
  }

  if (filter.category) {
    const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
    result = result.filter((a) => categories.includes(a.category));
  }

  if (filter.asset_keys && filter.asset_keys.length > 0) {
    const keySet = new Set(filter.asset_keys);
    result = result.filter((a) => keySet.has(a.asset_key));
  }

  return result;
}

/**
 * Filters catalog assets strictly by app_scope.
 */
export function filterCatalogByScope(
  assets: readonly CatalogAsset[],
  appScope: string
): CatalogAsset[] {
  return filterCatalog(assets, { app_scope: appScope });
}

/**
 * Filters catalog assets strictly by category.
 */
export function filterCatalogByCategory(
  assets: readonly CatalogAsset[],
  category: string
): CatalogAsset[] {
  return filterCatalog(assets, { category });
}

/**
 * Indexes an array of catalog assets into a Map keyed by asset_key.
 */
export function createCatalogMap(assets: readonly CatalogAsset[]): Map<string, CatalogAsset> {
  const map = new Map<string, CatalogAsset>();
  for (const asset of assets) {
    map.set(asset.asset_key, asset);
  }
  return map;
}

/**
 * Asynchronously loads catalog assets from Supabase PostgreSQL (catalog.assets table)
 * or falls back to in-memory canonical seed assets.
 */
export async function loadCatalogAssets(options: CatalogQueryOptions = {}): Promise<CatalogAsset[]> {
  const fallback = options.fallbackToSeed ?? true;

  if (options.supabaseClient) {
    try {
      const client = options.supabaseClient;
      // Handle either client.schema('catalog').from('assets') or client.from('catalog.assets')
      const queryBuilder =
        typeof client.schema === 'function'
          ? client.schema(CATALOG_SCHEMA_NAME).from(CATALOG_TABLE_NAME)
          : client.from(`${CATALOG_SCHEMA_NAME}.${CATALOG_TABLE_NAME}`);

      let query = queryBuilder.select('id, app_scope, category, asset_key, cdn_url, metadata, created_at');

      if (options.app_scope) {
        if (Array.isArray(options.app_scope)) {
          query = query.in('app_scope', options.app_scope);
        } else {
          query = query.eq('app_scope', options.app_scope);
        }
      }

      if (options.category) {
        if (Array.isArray(options.category)) {
          query = query.in('category', options.category);
        } else {
          query = query.eq('category', options.category);
        }
      }

      if (options.asset_keys && options.asset_keys.length > 0) {
        query = query.in('asset_key', options.asset_keys);
      }

      const { data, error } = await query;

      if (error) {
        if (!fallback) throw error;
        // Fall back on error
        return filterCatalog(SEED_CATALOG_ASSETS, options);
      }

      if (Array.isArray(data) && data.length > 0) {
        return data.filter(isCatalogAsset).map((row: any) => ({
          id: row.id,
          app_scope: row.app_scope,
          category: row.category,
          asset_key: row.asset_key,
          cdn_url: row.cdn_url,
          metadata: (row.metadata || {}) as CatalogAssetMetadata,
          created_at: row.created_at,
        }));
      }

      if (fallback) {
        return filterCatalog(SEED_CATALOG_ASSETS, options);
      }

      return [];
    } catch (err) {
      if (!fallback) throw err;
      return filterCatalog(SEED_CATALOG_ASSETS, options);
    }
  }

  // No remote client supplied; resolve from canonical in-memory catalog
  return filterCatalog(SEED_CATALOG_ASSETS, options);
}
