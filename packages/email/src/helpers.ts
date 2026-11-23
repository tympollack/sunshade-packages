import { createHash } from 'node:crypto';
import { EmailValidationError, validateEmailAddress } from './domain';
import type {
  AddAudienceContactParams,
  BatchNotificationMessage,
  EmailChannel,
  EmailLogger,
  EmailTag,
  EmailTagsInput,
  SunshadeAppId,
} from './types';

export function createDefaultLogger(appId: SunshadeAppId): EmailLogger {
  const emit = (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>
  ) => {
    const payload = JSON.stringify({
      pkg: '@digitalcanopy/email',
      app_id: appId,
      level,
      message,
      ...(context ? { context } : {}),
    });
    if (level === 'error') {
      console.error(payload);
    } else if (level === 'warn') {
      console.warn(payload);
    } else {
      console.log(payload);
    }
  };

  return {
    debug: (msg, ctx) => emit('debug', msg, ctx),
    info: (msg, ctx) => emit('info', msg, ctx),
    warn: (msg, ctx) => emit('warn', msg, ctx),
    error: (msg, ctx) => emit('error', msg, ctx),
  };
}

function sanitizeTagToken(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256);
  return cleaned || 'unknown';
}

export function normalizeTags(
  input: EmailTagsInput | undefined,
  appId: SunshadeAppId,
  channel: EmailChannel
): EmailTag[] {
  const tagMap = new Map<string, string>();

  if (Array.isArray(input)) {
    for (const entry of input) {
      if (entry && typeof entry.name === 'string' && typeof entry.value === 'string') {
        const name = sanitizeTagToken(entry.name);
        if (name !== 'app_id' && name !== 'channel') {
          tagMap.set(name, sanitizeTagToken(entry.value));
        }
      }
    }
  } else if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      if (typeof v === 'string') {
        const name = sanitizeTagToken(k);
        if (name !== 'app_id' && name !== 'channel') {
          tagMap.set(name, sanitizeTagToken(v));
        }
      }
    }
  }

  return [
    { name: 'app_id', value: appId },
    { name: 'channel', value: channel },
    ...Array.from(tagMap.entries()).map(([name, value]) => ({ name, value })),
  ];
}

export function normalizeRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  const cleaned = list.map((addr) => validateEmailAddress(addr, 'to'));
  if (cleaned.length === 0) {
    throw new EmailValidationError('At least one recipient email address ("to") is required.');
  }
  return cleaned;
}

export function assertMessageContent(subject: string, html?: string, text?: string): void {
  if (typeof subject !== 'string' || !subject.trim()) {
    throw new EmailValidationError('Email "subject" must be a non-empty string.');
  }
  const hasHtml = typeof html === 'string' && html.trim().length > 0;
  const hasText = typeof text === 'string' && text.trim().length > 0;
  if (!hasHtml && !hasText) {
    throw new EmailValidationError('Email must provide at least one of "html" or "text".');
  }
}

export function validateHttpsUrl(rawUrl: string, fieldName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new EmailValidationError(`Invalid ${fieldName}: "${rawUrl}".`);
  }
  if (parsed.protocol !== 'https:') {
    throw new EmailValidationError(
      `RFC 8058 requires HTTPS for ${fieldName}: received "${parsed.protocol}".`
    );
  }
  return parsed.toString();
}

function headerContainsHttpsUri(headerValue: string): boolean {
  const matches = headerValue.matchAll(/<([^>]+)>/g);
  for (const match of matches) {
    try {
      const parsed = new URL(match[1].trim());
      if (parsed.protocol === 'https:') {
        return true;
      }
    } catch {
      // Ignore non-URL tokens
    }
  }
  return false;
}

const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

/**
 * Derives a deterministic Resend-safe idempotency key (<= 256 chars) per chunk.
 */
export function buildChunkIdempotencyKey(baseKey: string, chunkIndex: number): string {
  const suffix = `/chunk-${chunkIndex}`;
  const candidate = `${baseKey}${suffix}`;
  if (candidate.length <= MAX_IDEMPOTENCY_KEY_LENGTH) {
    return candidate;
  }

  const hash = createHash('sha256').update(baseKey).digest('hex').slice(0, 16);
  const maxPrefixLen = Math.max(0, MAX_IDEMPOTENCY_KEY_LENGTH - suffix.length - hash.length - 1);
  return `${baseKey.slice(0, maxPrefixLen)}-${hash}${suffix}`;
}

/**
 * Formats an email address into an RFC 6068 mailto URI, encoding reserved
 * address delimiters like `#`, `?`, `&`, and `%` in the local-part.
 */
export function formatMailtoUnsubscribeUri(rawEmail: string): string {
  const addr = validateEmailAddress(rawEmail, 'unsubscribeMailto');
  const atIdx = addr.lastIndexOf('@');
  const localPart = addr.slice(0, atIdx);
  const domain = addr.slice(atIdx + 1);
  const encodedLocal = encodeURIComponent(localPart).replace(/%2B/gi, '+');
  return `mailto:${encodedLocal}@${domain}`;
}

/**
 * Case-insensitively canonicalizes and builds RFC 8058 `List-Unsubscribe`
 * and `List-Unsubscribe-Post` headers.
 * Only emits `List-Unsubscribe-Post` when `unsubscribeUrl` is provided OR when
 * custom headers explicitly include both an `https:` `List-Unsubscribe` target and `List-Unsubscribe-Post`.
 */
export function buildRfc8058Headers(
  msg: BatchNotificationMessage
): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  let customUnsubscribe: string | undefined;
  let customUnsubscribePost: string | undefined;

  if (msg.headers) {
    for (const [key, value] of Object.entries(msg.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'list-unsubscribe') {
        customUnsubscribe = value;
      } else if (lower === 'list-unsubscribe-post') {
        customUnsubscribePost = value;
      } else {
        headers[key] = value;
      }
    }
  }

  const parts: string[] = [];
  let hasHttpsTarget = false;

  if (msg.unsubscribeMailto) {
    parts.push(`<${formatMailtoUnsubscribeUri(msg.unsubscribeMailto)}>`);
  }

  if (msg.unsubscribeUrl) {
    const safeUrl = validateHttpsUrl(msg.unsubscribeUrl, 'unsubscribeUrl');
    parts.push(`<${safeUrl}>`);
    hasHttpsTarget = true;
  }

  if (parts.length > 0) {
    headers['List-Unsubscribe'] = parts.join(', ');
    if (hasHttpsTarget) {
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
  } else if (customUnsubscribe) {
    headers['List-Unsubscribe'] = customUnsubscribe;
    if (customUnsubscribePost && headerContainsHttpsUri(customUnsubscribe)) {
      headers['List-Unsubscribe-Post'] = customUnsubscribePost;
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function extractStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const record = err as Record<string, unknown>;
  if (typeof record.statusCode === 'number') return record.statusCode;
  if (typeof record.status === 'number') return record.status;
  return undefined;
}

export function throwWithResponseHeaders(
  err: unknown,
  headers?: Record<string, string> | null
): never {
  if (headers && err && typeof err === 'object') {
    const wrapped = err instanceof Error ? err : { ...(err as Record<string, unknown>) };
    Object.defineProperty(wrapped, 'headers', {
      value: headers,
      enumerable: false,
      configurable: true,
    });
    throw wrapped;
  }
  throw err;
}

export function extractRetryAfterMs(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const headers = (err as { headers?: Record<string, string> | Headers | null }).headers;
  if (!headers) return undefined;

  let rawValue: string | null | undefined;
  if (typeof (headers as Headers).get === 'function') {
    rawValue = (headers as Headers).get('retry-after');
  } else {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === 'retry-after' && typeof v === 'string') {
        rawValue = v;
        break;
      }
    }
  }

  if (!rawValue || !rawValue.trim()) return undefined;
  const trimmed = rawValue.trim();

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : undefined;
  }

  const parsedMs = Date.parse(trimmed);
  if (Number.isFinite(parsedMs)) {
    return Math.max(0, parsedMs - Date.now());
  }

  return undefined;
}

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

/**
 * Identifies transient per-second throttling errors while excluding daily/monthly
 * quota exhaustion errors that cannot recover within short retry backoff windows.
 */
export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const record = err as Record<string, unknown>;
  const statusCode = extractStatusCode(err);
  const name = typeof record.name === 'string' ? record.name.toLowerCase() : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';

  if (
    name === 'daily_quota_exceeded' ||
    name === 'monthly_quota_exceeded' ||
    message.includes('daily quota') ||
    message.includes('monthly quota') ||
    message.includes('quota exceeded')
  ) {
    return false;
  }

  return (
    statusCode === 429 ||
    name === 'rate_limit_exceeded' ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  );
}

export function isContactAlreadyExistsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const record = err as Record<string, unknown>;
  const statusCode = extractStatusCode(err);
  const name = typeof record.name === 'string' ? record.name.toLowerCase() : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';

  if (statusCode === 409) return true;
  if (
    message.includes('already exists') ||
    message.includes('already in') ||
    message.includes('duplicate')
  ) {
    return true;
  }
  return name === 'validation_error' && message.includes('contact') && message.includes('exist');
}

export function normalizeContactProperties(
  metadata: AddAudienceContactParams['metadata']
): Record<string, string | number | null> | undefined {
  if (!metadata) return undefined;
  const properties: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    if (value === null || typeof value === 'string' || typeof value === 'number') {
      properties[key] = value;
    } else if (typeof value === 'boolean') {
      properties[key] = value ? 'true' : 'false';
    } else {
      properties[key] = String(value);
    }
  }
  return Object.keys(properties).length > 0 ? properties : undefined;
}

export async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  initialDelayMs: number
): Promise<T> {
  let attempt = 0;
  let delayMs = initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (err) {
      if (isRateLimitError(err) && attempt < maxRetries) {
        attempt++;
        const retryAfterMs = extractRetryAfterMs(err);
        const waitMs = retryAfterMs !== undefined ? Math.max(delayMs, retryAfterMs) : delayMs;
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        if (delayMs > 0) {
          delayMs *= 2;
        }
        continue;
      }
      throw err;
    }
  }
}

export function buildRenderOptions(
  html?: string,
  text?: string
): { html: string; text?: string } | { text: string } {
  if (typeof html === 'string' && html.trim().length > 0) {
    return text !== undefined ? { html, text } : { html };
  }
  return { text: text as string };
}
