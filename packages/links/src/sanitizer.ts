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

const DANGEROUS_PROTOCOLS = /^(javascript|vbscript|data):/i;
const CONTROL_AND_WHITESPACE_CHARS = /[\u0000-\u0020\u007f]+/g;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;

function isDangerousScheme(candidate: string): boolean {
  const collapsed = candidate.replace(CONTROL_AND_WHITESPACE_CHARS, '');
  if (DANGEROUS_PROTOCOLS.test(collapsed)) {
    return true;
  }
  try {
    const parsed = new URL(candidate, 'https://sanitizer.invalid');
    return DANGEROUS_PROTOCOLS.test(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Checks whether a URL contains invasive surveillance tokens.
 */
export function hasSurveillanceTokens(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const queryIdx = rawUrl.indexOf('?');
  if (queryIdx === -1) return false;

  const hashIdx = rawUrl.indexOf('#', queryIdx);
  const queryString =
    hashIdx !== -1
      ? rawUrl.slice(queryIdx + 1, hashIdx)
      : rawUrl.slice(queryIdx + 1);

  const searchParams = new URLSearchParams(queryString);
  for (const key of searchParams.keys()) {
    if (INVASIVE_TRACKING_PARAMS.has(key.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Strips known surveillance tokens and returns a sanitized clean URL.
 * Neutralizes dangerous executable URL schemes (e.g. javascript:).
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '';
  }

  const trimmed = rawUrl.replace(CONTROL_CHARS, '').trim();
  if (!trimmed) return '';

  // Neutralize executable / script injection schemes (including whitespace/control-obfuscated ones)
  if (isDangerousScheme(rawUrl) || isDangerousScheme(trimmed)) {
    return 'about:blank';
  }

  // Handle hash fragment
  const hashIdx = trimmed.indexOf('#');
  const hash = hashIdx !== -1 ? trimmed.slice(hashIdx) : '';
  const withoutHash = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;

  const queryIdx = withoutHash.indexOf('?');
  const pathPart = queryIdx !== -1 ? withoutHash.slice(0, queryIdx) : withoutHash;
  const queryPart = queryIdx !== -1 ? withoutHash.slice(queryIdx + 1) : '';

  // If there are no query parameters, return path + hash directly
  if (!queryPart) {
    return `${pathPart}${hash}`;
  }

  try {
    const searchParams = new URLSearchParams(queryPart);
    const keysToRemove: string[] = [];

    for (const key of searchParams.keys()) {
      if (INVASIVE_TRACKING_PARAMS.has(key.toLowerCase())) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      searchParams.delete(key);
    }

    if (keysToRemove.length === 0) {
      return `${pathPart}?${queryPart}${hash}`;
    }

    const cleanQuery = searchParams.toString();
    const cleanSearch = cleanQuery ? `?${cleanQuery}` : '';

    return `${pathPart}${cleanSearch}${hash}`;
  } catch {
    return trimmed;
  }
}
