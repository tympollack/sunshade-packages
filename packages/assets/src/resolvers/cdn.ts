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
  let cleanPath = assetPath.replace(/^\/+/, '');

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

export function getKenneyAudioUrl(
  soundName: string,
  ext: 'ogg' | 'wav' | 'mp3' | string = 'ogg'
): string {
  const cleanName = soundName.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
  return `${CDN_BASE_URL}/ui-pack/sounds/${cleanName}.${cleanExt}`;
}

export function getKenneyCardUrl(cardKey: string, ext: string = 'png'): string {
  const cleanKey = cardKey.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
  return `${CDN_BASE_URL}/cards/${cleanKey}.${cleanExt}`;
}

export function getKenneyCharacterUrl(
  category: 'face' | 'hair' | 'pants' | 'shirts' | 'shoes' | 'skin' | string,
  itemKey: string,
  ext: string = 'png'
): string {
  const cleanKey = itemKey.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
  return `${CDN_BASE_URL}/modular-characters/${category}/${cleanKey}.${cleanExt}`;
}
