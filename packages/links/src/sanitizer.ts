/**
 * Privacy Sanitizer for SunShade Links
 * Strips invasive surveillance and ad-tech tracking parameters while
 * preserving clean attribution parameters (UTM, ch, ref) and query payload.
 */

export const INVASIVE_TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'msclkid',
  'ttclid',
  'twclid',
  '_hsenc',
  'mc_eid',
  'sc_campaign',
  'igshid',
  'dclid',
  'gad_source',
  'gbraid',
  'wbraid',
  'yclid',
  '_openstat',
  's_kwcid',
]);

/**
 * Checks whether a URL contains invasive surveillance tokens.
 */
export function hasSurveillanceTokens(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const dummyBase = 'https://links.sunshade.icu';
    const parsed = new URL(rawUrl, dummyBase);
    for (const key of parsed.searchParams.keys()) {
      if (INVASIVE_TRACKING_PARAMS.has(key.toLowerCase())) {
        return true;
      }
    }
  } catch {
    // If URL parsing fails, perform regex check
    const queryIdx = rawUrl.indexOf('?');
    if (queryIdx !== -1) {
      const queryString = rawUrl.slice(queryIdx + 1);
      for (const param of INVASIVE_TRACKING_PARAMS) {
        const regex = new RegExp(`(?:^|[&?])${param}=`, 'i');
        if (regex.test(queryString)) return true;
      }
    }
  }
  return false;
}

/**
 * Strips known surveillance tokens and returns a sanitized clean URL.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '';
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const isRelative =
    trimmed.startsWith('/') ||
    (!trimmed.startsWith('http://') &&
      !trimmed.startsWith('https://') &&
      !trimmed.includes('://'));

  try {
    const dummyBase = 'https://links.sunshade.icu';
    const parsed = new URL(trimmed, dummyBase);

    // Identify keys to strip
    const keysToRemove: string[] = [];
    for (const key of parsed.searchParams.keys()) {
      if (INVASIVE_TRACKING_PARAMS.has(key.toLowerCase())) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      parsed.searchParams.delete(key);
    }

    if (isRelative) {
      const pathname = trimmed.startsWith('/')
        ? parsed.pathname
        : parsed.pathname.replace(/^\//, '');
      const search = parsed.search;
      const hash = parsed.hash;
      return `${pathname}${search}${hash}`;
    }

    // Absolute URL handling
    const hadNoPath =
      !trimmed.split('?')[0].split('#')[0].replace(/^https?:\/\/[^/]+/, '') ||
      trimmed.split('?')[0].split('#')[0].replace(/^https?:\/\/[^/]+/, '') === '';

    let result = parsed.toString();

    // If original URL didn't have path and query is now empty, remove trailing slash
    if (hadNoPath && !parsed.search && !parsed.hash && result.endsWith('/')) {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    // Fallback if URL constructor fails
    return trimmed;
  }
}
