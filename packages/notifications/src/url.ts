const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Returns true only for http(s)/mailto URLs and same-origin relative paths.
 * Rejects `javascript:`, `data:` and other script-capable schemes.
 */
export function isSafeActionUrl(url: string | undefined): url is string {
  if (!url) return false;
  // Strip control chars/whitespace browsers ignore inside schemes (e.g. "java\nscript:").
  const trimmed = url.replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  if (trimmed.startsWith('//')) return false;
  if (/^[/#?.]/.test(trimmed)) return true;
  try {
    return SAFE_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    // No scheme: treat as a relative path only if it has no colon before a slash.
    return !/^[^/?#]*:/.test(trimmed);
  }
}
