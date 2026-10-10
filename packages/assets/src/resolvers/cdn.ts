export const CDN_BASE_URL = 'https://cdn.sunshade.icu/assets/kenney';
export const KENNEY_CDN_BASE = CDN_BASE_URL;

export function getKenneyAssetUrl(pack: string, assetPath: string): string {
  const cleanPack = pack.replace(/^\/+|\/+$/g, '');
  const cleanPath = assetPath.replace(/^\/+/, '');
  return `${CDN_BASE_URL}/${cleanPack}/${cleanPath}`;
}

export function getKenneyAudioUrl(
  soundName: string,
  ext: 'ogg' | 'wav' | 'mp3' = 'ogg'
): string {
  const cleanName = soundName.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  return `${CDN_BASE_URL}/ui-pack/sounds/${cleanName}.${ext}`;
}

export function getKenneyCardUrl(cardKey: string, ext: string = 'png'): string {
  const cleanKey = cardKey.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  return `${CDN_BASE_URL}/cards/${cleanKey}.${ext}`;
}

export function getKenneyCharacterUrl(
  category: 'face' | 'hair' | 'pants' | 'shirts' | 'shoes' | 'skin' | string,
  itemKey: string,
  ext: string = 'png'
): string {
  const cleanKey = itemKey.replace(/^\/+|\/+$/g, '').replace(/\.[a-zA-Z0-9]+$/, '');
  return `${CDN_BASE_URL}/modular-characters/${category}/${cleanKey}.${ext}`;
}
