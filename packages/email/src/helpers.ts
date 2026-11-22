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

/**
 * Sanitizes Resend tag names/values to `[a-zA-Z0-9_-]` (max 256 chars) and
 * enforces mandatory `app_id` and `channel` tags.
 */
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

export function validateHttpUrl(rawUrl: string, fieldName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new EmailValidationError(`Invalid ${fieldName}: "${rawUrl}".`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new EmailValidationError(
      `Unsupported protocol for ${fieldName}: "${parsed.protocol}". Expected http: or https:.`
    );
  }
  return parsed.toString();
}

/**
 * Builds RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers.
 */
export function buildRfc8058Headers(
  msg: BatchNotificationMessage
): Record<string, string> | undefined {
  const headers: Record<string, string> = msg.headers ? { ...msg.headers } : {};
  const parts: string[] = [];

  if (msg.unsubscribeMailto) {
    const addr = validateEmailAddress(msg.unsubscribeMailto, 'unsubscribeMailto');
    parts.push(`<mailto:${addr}>`);
  }

  if (msg.unsubscribeUrl) {
    const safeUrl = validateHttpUrl(msg.unsubscribeUrl, 'unsubscribeUrl');
    parts.push(`<${safeUrl}>`);
  }

  if (parts.length > 0) {
    headers['List-Unsubscribe'] = parts.join(', ');
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  } else if (headers['List-Unsubscribe'] && !headers['List-Unsubscribe-Post']) {
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
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

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const record = err as Record<string, unknown>;
  const statusCode = extractStatusCode(err);
  const name = typeof record.name === 'string' ? record.name : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';

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
      if (isRateLimitError(err) && attempt < maxRetries - 1) {
        attempt++;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
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
    return typeof text === 'string' && text.trim().length > 0 ? { html, text } : { html };
  }
  return { text: text as string };
}
