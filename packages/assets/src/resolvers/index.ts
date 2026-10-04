/**
 * Cloudflare R2 Edge CDN Base URL for SunShade Kenney Assets
 */
export const KENNEY_CDN_BASE = 'https://cdn.sunshade.icu/assets/kenney';

/**
 * Resolves a Kenney asset pack, key, and optional extension to a Cloudflare R2 CDN URL.
 * Format: https://cdn.sunshade.icu/assets/kenney/{pack}/{key}.{ext}
 *
 * @param pack - Asset pack slug (e.g., 'modular-characters', 'cards', 'ui-pack')
 * @param key - Asset key or relative subpath (e.g., 'base_01', 'card-spades-10', 'click-a')
 * @param ext - Optional extension ('png', 'svg', 'ogg', etc.). Defaults to 'png' if not supplied and key lacks an extension.
 * @returns Fully qualified Cloudflare R2 public URL
 */
export function getKenneyAssetUrl(pack: string, key: string, ext?: string): string {
  const cleanPack = pack.replace(/^\/+|\/+$/g, '');
  const cleanKey = key.replace(/^\/+|\/+$/g, '');

  if (ext) {
    const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
    if (cleanKey.toLowerCase().endsWith(`.${cleanExt.toLowerCase()}`)) {
      return `${KENNEY_CDN_BASE}/${cleanPack}/${cleanKey}`;
    }
    return `${KENNEY_CDN_BASE}/${cleanPack}/${cleanKey}.${cleanExt}`;
  }

  const hasExt = /\.[a-zA-Z0-9]+$/.test(cleanKey);
  const finalKey = hasExt ? cleanKey : `${cleanKey}.png`;
  return `${KENNEY_CDN_BASE}/${cleanPack}/${finalKey}`;
}

/**
 * Resolves UI and game audio sound effects from the Kenney UI Audio pack.
 * Format: https://cdn.sunshade.icu/assets/kenney/ui-pack/sounds/{name}.{ext}
 */
export function getKenneyAudioUrl(
  soundName: string,
  ext: 'ogg' | 'wav' | 'mp3' = 'ogg'
): string {
  const cleanName = soundName.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  return `${KENNEY_CDN_BASE}/ui-pack/sounds/${cleanName}.${ext}`;
}

/**
 * Resolves playing card face and cardback textures.
 * Format: https://cdn.sunshade.icu/assets/kenney/cards/{cardKey}.png
 */
export function getKenneyCardUrl(cardKey: string, ext: string = 'png'): string {
  return getKenneyAssetUrl('cards', cardKey, ext);
}

/**
 * Resolves modular character cosmetic parts.
 * Format: https://cdn.sunshade.icu/assets/kenney/modular-characters/{category}/{itemKey}.png
 */
export function getKenneyCharacterUrl(
  category: 'face' | 'hair' | 'pants' | 'shirts' | 'shoes' | 'skin' | string,
  itemKey: string,
  ext: string = 'png'
): string {
  return getKenneyAssetUrl('modular-characters', `${category}/${itemKey}`, ext);
}
