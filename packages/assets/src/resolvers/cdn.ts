export const CDN_BASE_URL = 'https://cdn.sunshade.icu/assets/kenney';
export const KENNEY_CDN_BASE = CDN_BASE_URL;

/**
 * Resolves a Kenney asset pack and asset path to a Cloudflare R2 CDN URL.
 * Handles both full relative paths (e.g. 'base_01.png') and bare keys with optional extensions.
 *
 * @param pack - Asset pack slug (e.g. 'modular-characters', 'cards', 'ui-pack')
 * @param assetPath - Relative file path or bare asset key
 * @param ext - Optional extension override (e.g. 'png', 'svg', '.svg')
 */
export function getKenneyAssetUrl(pack: string, assetPath: string, ext?: string): string {
  const cleanPack = pack.replace(/^\/+|\/+$/g, '');
  const cleanPath = assetPath.replace(/^\/+|\/+$/g, '');

  if (ext) {
    const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
    if (cleanPath.toLowerCase().endsWith(`.${cleanExt.toLowerCase()}`)) {
      return `${CDN_BASE_URL}/${cleanPack}/${cleanPath}`;
    }
    return `${CDN_BASE_URL}/${cleanPack}/${cleanPath}.${cleanExt}`;
  }

  const hasExt = /\.[a-zA-Z0-9]+$/.test(cleanPath);
  const finalPath = hasExt ? cleanPath : `${cleanPath}.png`;
  return `${CDN_BASE_URL}/${cleanPack}/${finalPath}`;
}

function appendOrReplaceExtension(cleanKey: string, ext: string): string {
  const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
  if (cleanKey.toLowerCase().endsWith(`.${cleanExt.toLowerCase()}`)) {
    return cleanKey;
  }
  const baseKey = cleanKey.replace(/\.[a-zA-Z0-9]+$/, '');
  return `${baseKey}.${cleanExt}`;
}

export function getKenneyAudioUrl(
  soundName: string,
  ext: 'ogg' | 'wav' | 'mp3' | string = 'ogg'
): string {
  const cleanName = soundName.replace(/^\/+|\/+$/g, '');
  return `${CDN_BASE_URL}/ui-pack/sounds/${appendOrReplaceExtension(cleanName, ext)}`;
}

export function getKenneyCardUrl(cardKey: string, ext: string = 'png'): string {
  const cleanKey = cardKey.replace(/^\/+|\/+$/g, '');
  return `${CDN_BASE_URL}/cards/${appendOrReplaceExtension(cleanKey, ext)}`;
}

export function getKenneyCharacterUrl(
  category: 'face' | 'hair' | 'pants' | 'shirts' | 'shoes' | 'skin' | string,
  itemKey: string,
  ext: string = 'png'
): string {
  const cleanCategory = category.replace(/^\/+|\/+$/g, '');
  const cleanKey = itemKey.replace(/^\/+|\/+$/g, '');
  return `${CDN_BASE_URL}/modular-characters/${cleanCategory}/${appendOrReplaceExtension(cleanKey, ext)}`;
}
