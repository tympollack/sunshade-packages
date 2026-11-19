import type { AtlasFrame, AtlasManifest } from '../manifests/index';
import type { CatalogAsset } from '../catalog/types';
import type {
  AssetOverride,
  FlameSpriteData,
  HotSwapEvent,
  HotSwapListener,
  PackOverride,
  RegistrySnapshot,
} from './types';
import {
  resolveAssetPathWithOverrides,
  resolveCardUrlWithOverrides,
  resolveCharacterUrlWithOverrides,
  resolveAudioUrlWithOverrides,
  resolveFrameWithOverrides,
  resolveFlameDataWithOverrides,
} from './resolvers';

/**
 * Universal Hot-Swapping Asset Registry.
 * Enables dynamic drop-in custom IP replacement at runtime without breaking
 * coordinate conversions, canvas/Flame sprite mappings, or falling back
 * gracefully to canonical Kenney R2 assets when no override is registered.
 */
export class AssetRegistry {
  private overrides = new Map<string, AssetOverride>();
  private packOverrides = new Map<string, PackOverride>();
  private listeners = new Set<HotSwapListener>();

  public registerOverride(key: string, override: AssetOverride | string): this {
    const cleanKey = key.trim();
    const entry: AssetOverride =
      typeof override === 'string' ? { url: override } : { ...override };

    this.overrides.set(cleanKey, entry);
    this.emit({
      type: 'override_registered',
      keys: [cleanKey],
      timestamp: Date.now(),
    });
    return this;
  }

  public registerOverrides(
    overrides: Record<string, AssetOverride | string> | readonly CatalogAsset[]
  ): this {
    const affectedKeys: string[] = [];

    if (Array.isArray(overrides)) {
      for (const asset of overrides) {
        const cleanKey = asset.asset_key.trim();
        this.overrides.set(cleanKey, {
          url: asset.cdn_url,
          frame: asset.metadata?.frame,
          anchor: asset.metadata?.anchor,
          app_scope: asset.app_scope,
          category: asset.category,
          metadata: asset.metadata,
        });
        affectedKeys.push(cleanKey);
      }
    } else {
      for (const [key, value] of Object.entries(overrides)) {
        const cleanKey = key.trim();
        this.overrides.set(
          cleanKey,
          typeof value === 'string' ? { url: value } : { ...value }
        );
        affectedKeys.push(cleanKey);
      }
    }

    if (affectedKeys.length > 0) {
      this.emit({
        type: 'override_registered',
        keys: affectedKeys,
        timestamp: Date.now(),
      });
    }

    return this;
  }

  public registerPackOverride(pack: string, cdnBaseOrResolver: PackOverride): this {
    const cleanPack = pack.replace(/^\/+|\/+$/g, '').toLowerCase();
    this.packOverrides.set(cleanPack, cdnBaseOrResolver);
    this.emit({
      type: 'pack_registered',
      pack: cleanPack,
      timestamp: Date.now(),
    });
    return this;
  }

  public removePackOverride(pack: string): boolean {
    const cleanPack = pack.replace(/^\/+|\/+$/g, '').toLowerCase();
    const removed = this.packOverrides.delete(cleanPack);
    if (removed) {
      this.emit({
        type: 'pack_removed',
        pack: cleanPack,
        timestamp: Date.now(),
      });
    }
    return removed;
  }

  public loadCatalog(assets: readonly CatalogAsset[], appScope?: string): this {
    const filtered = appScope
      ? assets.filter((a) => a.app_scope === appScope || a.app_scope === 'all')
      : assets;

    this.registerOverrides(filtered);
    this.emit({
      type: 'catalog_loaded',
      app_scope: appScope,
      keys: filtered.map((f) => f.asset_key),
      timestamp: Date.now(),
    });
    return this;
  }

  public hasOverride(key: string): boolean {
    return this.overrides.has(key.trim());
  }

  public getOverride(key: string): AssetOverride | undefined {
    return this.overrides.get(key.trim());
  }

  public removeOverride(key: string): boolean {
    const cleanKey = key.trim();
    const existed = this.overrides.delete(cleanKey);
    if (existed) {
      this.emit({
        type: 'override_removed',
        keys: [cleanKey],
        timestamp: Date.now(),
      });
    }
    return existed;
  }

  public clearOverrides(): void {
    this.overrides.clear();
    this.emit({ type: 'cleared', timestamp: Date.now() });
  }

  public clearPackOverrides(): void {
    this.packOverrides.clear();
    this.emit({ type: 'cleared', timestamp: Date.now() });
  }

  public reset(): void {
    this.overrides.clear();
    this.packOverrides.clear();
    this.emit({ type: 'reset', timestamp: Date.now() });
  }

  public resolveUrl(key: string, defaultUrl: string = ''): string {
    const override = this.overrides.get(key.trim());
    return override ? override.url : defaultUrl;
  }

  public resolveAssetUrl(pack: string, assetPath: string, ext?: string): string {
    return resolveAssetPathWithOverrides(pack, assetPath, this.overrides, this.packOverrides, ext);
  }

  public resolveCardUrl(cardKey: string, ext: string = 'png'): string {
    return resolveCardUrlWithOverrides(cardKey, this.overrides, this.packOverrides, ext);
  }

  public resolveCharacterUrl(category: string, itemKey: string, ext: string = 'png'): string {
    return resolveCharacterUrlWithOverrides(category, itemKey, this.overrides, this.packOverrides, ext);
  }

  public resolveAudioUrl(soundName: string, ext: 'ogg' | 'wav' | 'mp3' | string = 'ogg'): string {
    return resolveAudioUrlWithOverrides(soundName, this.overrides, this.packOverrides, ext);
  }

  public resolveFrame(manifest: AtlasManifest, frameKey: string): AtlasFrame | undefined {
    return resolveFrameWithOverrides(manifest, frameKey, this.overrides);
  }

  public resolveFlameSpriteData(manifest: AtlasManifest, frameKey: string): FlameSpriteData | null {
    return resolveFlameDataWithOverrides(manifest, frameKey, this.overrides);
  }

  public subscribe(listener: HotSwapListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onSwap(listener: HotSwapListener): () => void {
    return this.subscribe(listener);
  }

  public getSnapshot(): RegistrySnapshot {
    return {
      activeOverridesCount: this.overrides.size,
      activePacksCount: this.packOverrides.size,
      overriddenKeys: Array.from(this.overrides.keys()),
      overriddenPacks: Array.from(this.packOverrides.keys()),
    };
  }

  private emit(event: HotSwapEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[AssetRegistry] Listener error:', err);
      }
    }
  }
}

export function createAssetRegistry(): AssetRegistry {
  return new AssetRegistry();
}

export const assetRegistry = createAssetRegistry();
