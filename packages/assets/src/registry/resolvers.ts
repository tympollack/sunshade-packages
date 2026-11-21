import {
  getKenneyAssetUrl,
  getKenneyAudioUrl,
  getKenneyCardUrl,
  getKenneyCharacterUrl,
} from '../resolvers/cdn';
import {
  getFrameCoordinates,
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
    const finalExt = ext
      ? (ext.startsWith('.') ? ext.slice(1) : ext)
      : (/\.[a-zA-Z0-9]+$/.test(cleanPath) ? undefined : 'png');
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
  if (packOverrides.has('ui-pack/sounds')) {
    return resolveAssetPathWithOverrides('ui-pack/sounds', cleanName, overrides, packOverrides, ext);
  }
  return resolveAssetPathWithOverrides('ui-pack', `sounds/${cleanName}`, overrides, packOverrides, ext);
}

/**
 * Resolves atlas frame coordinates with independent frame and anchor override merging.
 */
export function resolveFrameWithOverrides(
  manifest: AtlasManifest,
  frameKey: string,
  overrides: Map<string, AssetOverride>
): AtlasFrame | undefined {
  const cleanKey = frameKey.trim();
  const override = overrides.get(cleanKey);
  const baseFrame = getFrameCoordinates(manifest, cleanKey);

  if (!override || (!override.frame && !override.anchor)) {
    return baseFrame;
  }

  if (!baseFrame && !override.frame) {
    return undefined;
  }

  const mergedFrame = override.frame ?? baseFrame!.frame;
  const mergedAnchor = override.anchor ?? baseFrame?.anchor;

  return {
    frame: mergedFrame,
    ...(mergedAnchor ? { anchor: mergedAnchor } : {}),
    trimmed: baseFrame?.trimmed ?? false,
    rotated: baseFrame?.rotated ?? false,
    ...(baseFrame?.spriteSourceSize ? { spriteSourceSize: baseFrame.spriteSourceSize } : {}),
    ...(baseFrame?.sourceSize ? { sourceSize: baseFrame.sourceSize } : {}),
  };
}

/**
 * Resolves Flame sprite data deriving directly from merged frame and anchor coordinates.
 */
export function resolveFlameDataWithOverrides(
  manifest: AtlasManifest,
  frameKey: string,
  overrides: Map<string, AssetOverride>
): FlameSpriteData | null {
  const frame = resolveFrameWithOverrides(manifest, frameKey, overrides);
  if (!frame) return null;

  return {
    srcPosition: [frame.frame.x, frame.frame.y],
    srcSize: [frame.frame.w, frame.frame.h],
    anchor: [frame.anchor?.ax ?? 0.5, frame.anchor?.ay ?? 0.5],
  };
}
