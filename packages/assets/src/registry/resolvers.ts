import {
  getKenneyAssetUrl,
  getKenneyAudioUrl,
  getKenneyCardUrl,
  getKenneyCharacterUrl,
} from '../resolvers/cdn';
import {
  getFrameCoordinates,
  toFlameSpriteData,
  type AtlasFrame,
  type AtlasManifest,
} from '../manifests/index';
import type { AssetOverride, FlameSpriteData, PackOverride } from './types';

/**
 * Resolves an asset pack and asset path with override support.
 */
export function resolveAssetPathWithOverrides(
  pack: string,
  assetPath: string,
  overrides: Map<string, AssetOverride>,
  packOverrides: Map<string, PackOverride>,
  ext?: string
): string {
  const cleanPack = pack.replace(/^\/+|\/+$/g, '').toLowerCase();
  const cleanPath = assetPath.replace(/^\/+/, '');
  const bareKey = cleanPath.replace(/\.[a-zA-Z0-9]+$/, '');

  // 1. Direct asset key check
  if (overrides.has(bareKey)) {
    return overrides.get(bareKey)!.url;
  }
  if (overrides.has(cleanPath)) {
    return overrides.get(cleanPath)!.url;
  }

  // 2. Pack override check
  const packOverride = packOverrides.get(cleanPack);
  if (packOverride) {
    if (typeof packOverride === 'function') {
      return packOverride(cleanPath, ext);
    }
    const cleanBase = packOverride.replace(/\/+$/, '');
    const finalExt = ext ? (ext.startsWith('.') ? ext.slice(1) : ext) : undefined;
    const targetPath =
      finalExt && !cleanPath.endsWith(`.${finalExt}`)
        ? `${cleanPath.replace(/\.[a-zA-Z0-9]+$/, '')}.${finalExt}`
        : cleanPath;
    return `${cleanBase}/${targetPath}`;
  }

  // 3. Baseline Kenney CDN fallback
  return getKenneyAssetUrl(pack, assetPath, ext);
}

/**
 * Resolves playing card asset URL with override support.
 */
export function resolveCardUrlWithOverrides(
  cardKey: string,
  overrides: Map<string, AssetOverride>,
  packOverrides: Map<string, PackOverride>,
  ext: string = 'png'
): string {
  const cleanKey = cardKey.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  if (overrides.has(cleanKey)) {
    return overrides.get(cleanKey)!.url;
  }
  return resolveAssetPathWithOverrides('cards', cleanKey, overrides, packOverrides, ext);
}

/**
 * Resolves character avatar component URL with override support.
 */
export function resolveCharacterUrlWithOverrides(
  category: string,
  itemKey: string,
  overrides: Map<string, AssetOverride>,
  packOverrides: Map<string, PackOverride>,
  ext: string = 'png'
): string {
  const cleanKey = itemKey.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  if (overrides.has(cleanKey)) {
    return overrides.get(cleanKey)!.url;
  }
  const pathWithCat = `${category}/${cleanKey}`;
  if (overrides.has(pathWithCat)) {
    return overrides.get(pathWithCat)!.url;
  }
  return resolveAssetPathWithOverrides(
    'modular-characters',
    pathWithCat,
    overrides,
    packOverrides,
    ext
  );
}

/**
 * Resolves audio sound effect URL with override support.
 */
export function resolveAudioUrlWithOverrides(
  soundName: string,
  overrides: Map<string, AssetOverride>,
  packOverrides: Map<string, PackOverride>,
  ext: 'ogg' | 'wav' | 'mp3' | string = 'ogg'
): string {
  const cleanName = soundName.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  if (overrides.has(cleanName)) {
    return overrides.get(cleanName)!.url;
  }
  return resolveAssetPathWithOverrides('ui-pack/sounds', cleanName, overrides, packOverrides, ext);
}

/**
 * Resolves atlas frame coordinates with override support.
 */
export function resolveFrameWithOverrides(
  manifest: AtlasManifest,
  frameKey: string,
  overrides: Map<string, AssetOverride>
): AtlasFrame | undefined {
  const cleanKey = frameKey.trim();
  const override = overrides.get(cleanKey);

  if (override && override.frame) {
    return {
      frame: override.frame,
      anchor: override.anchor,
      trimmed: false,
      rotated: false,
    };
  }

  return getFrameCoordinates(manifest, cleanKey);
}

/**
 * Resolves Flame sprite data with override support.
 */
export function resolveFlameDataWithOverrides(
  manifest: AtlasManifest,
  frameKey: string,
  overrides: Map<string, AssetOverride>
): FlameSpriteData | null {
  const cleanKey = frameKey.trim();
  const override = overrides.get(cleanKey);

  if (override && override.frame) {
    return {
      srcPosition: [override.frame.x, override.frame.y],
      srcSize: [override.frame.w, override.frame.h],
      anchor: [override.anchor?.ax ?? 0.5, override.anchor?.ay ?? 0.5],
    };
  }

  return toFlameSpriteData(manifest, cleanKey);
}
