import { parse as parseHostname } from 'tldts';
import type { BatchNotificationChunkResult } from './types';

/**
 * Domain parsing, Public Suffix List apex detection, and subdomain reputation firewall helpers.
 */

export const DEFAULT_ALLOWED_ALERT_SUBDOMAINS = ['mail.', 'drops.'] as const;

export interface ParsedSender {
  raw: string;
  displayName?: string;
  email: string;
  localPart: string;
  domain: string;
}

export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigError';
  }
}

export class EmailValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailValidationError';
  }
}

export class SubdomainFirewallError extends Error {
  readonly domain: string;
  readonly sender: string;

  constructor(message: string, sender: string, domain: string) {
    super(message);
    this.name = 'SubdomainFirewallError';
    this.sender = sender;
    this.domain = domain;
  }
}

export class EmailDispatchError extends Error {
  readonly statusCode?: number;
  readonly causeError?: unknown;

  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message);
    this.name = 'EmailDispatchError';
    this.statusCode = options?.statusCode;
    this.causeError = options?.cause;
  }
}

export class BatchDispatchError extends EmailDispatchError {
  readonly completedBatches: BatchNotificationChunkResult[];
  readonly completedIds: string[];
  readonly failedChunkIndex: number;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      cause?: unknown;
      completedBatches: BatchNotificationChunkResult[];
      completedIds: string[];
      failedChunkIndex: number;
    }
  ) {
    super(message, { statusCode: options.statusCode, cause: options.cause });
    this.name = 'BatchDispatchError';
    this.completedBatches = options.completedBatches;
    this.completedIds = options.completedIds;
    this.failedChunkIndex = options.failedChunkIndex;
  }
}

const ANGLE_ADDR_REGEX = /^(?:"?([^"]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/;
const SIMPLE_EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Parses either `"Display Name <user@domain.tld>"` or `"user@domain.tld"`.
 * Preserves case of the local-part per RFC 5321 while normalizing the domain to lowercase.
 */
export function parseSenderAddress(sender: string): ParsedSender {
  if (typeof sender !== 'string' || !sender.trim()) {
    throw new EmailValidationError('Sender address must be a non-empty string.');
  }

  const trimmed = sender.trim();
  const angleMatch = trimmed.match(ANGLE_ADDR_REGEX);

  const displayName = angleMatch?.[1]?.trim() || undefined;
  const rawEmail = (angleMatch ? angleMatch[2] : trimmed).trim();

  if (!SIMPLE_EMAIL_REGEX.test(rawEmail)) {
    throw new EmailValidationError(`Invalid sender email address: "${sender}".`);
  }

  const atIndex = rawEmail.lastIndexOf('@');
  const localPart = rawEmail.slice(0, atIndex);
  const domain = rawEmail.slice(atIndex + 1).toLowerCase();

  if (!localPart || !domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    throw new EmailValidationError(`Invalid sender email domain in "${sender}".`);
  }

  return {
    raw: trimmed,
    displayName,
    email: `${localPart}@${domain}`,
    localPart,
    domain,
  };
}

/**
 * Validates a recipient or standalone email string (normalizing domain case while preserving local-part case).
 */
export function validateEmailAddress(email: string, fieldName = 'email'): string {
  if (typeof email !== 'string' || !email.trim()) {
    throw new EmailValidationError(`${fieldName} must be a non-empty email address.`);
  }
  const parsed = parseSenderAddress(email);
  return parsed.email;
}

/**
 * Returns true if `domain` is a root apex (registrable) domain with no subdomain
 * according to the Public Suffix List (e.g. `sunshade.icu`, `example.co.uk`, `shop.co.in`),
 * or if the hostname cannot be resolved to a valid registrable domain.
 */
export function isRootApexDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) return true;

  const parsed = parseHostname(normalized, { allowPrivateDomains: false });
  if (!parsed.domain || parsed.isIp) {
    return true;
  }

  return !parsed.subdomain;
}

/**
 * Returns true if `domain` starts with one of the configured subdomain prefixes (e.g. `mail.`, `drops.`).
 */
export function hasSubdomainPrefix(
  domain: string,
  prefixes: readonly string[] = DEFAULT_ALLOWED_ALERT_SUBDOMAINS
): boolean {
  const normalized = domain.trim().toLowerCase();
  return prefixes.some((prefix) => {
    const normPrefix = prefix.trim().toLowerCase();
    return normPrefix.length > 0 && normalized.startsWith(normPrefix);
  });
}

export interface ResolveAlertSenderOptions {
  messageFrom?: string;
  alertsFrom?: string;
  defaultFrom: string;
  allowedAlertSubdomains?: readonly string[];
}

/**
 * Enforces the Subdomain Reputation Firewall for marketing / drop alert blasts:
 * 1. Prefers `messageFrom`, then `alertsFrom`, then `defaultFrom`.
 * 2. Never permits a root apex domain (e.g. `sunshade.icu`, `shop.co.in`) for alert blasts.
 * 3. When an explicit `allowedAlertSubdomains` list is configured, enforces it unconditionally.
 * 4. Otherwise, when a dedicated `mail.` / `drops.` subdomain is configured via `alertsFrom` or `defaultFrom`,
 *    rejects any override outside those dedicated alert subdomains.
 */
export function resolveAlertSender(options: ResolveAlertSenderOptions): string {
  const candidate = (options.messageFrom ?? options.alertsFrom ?? options.defaultFrom).trim();
  const parsedCandidate = parseSenderAddress(candidate);

  if (isRootApexDomain(parsedCandidate.domain)) {
    throw new SubdomainFirewallError(
      `Subdomain firewall blocked alert blast from root apex domain "${parsedCandidate.domain}". Configure a dedicated subdomain (e.g. "mail." or "drops.").`,
      candidate,
      parsedCandidate.domain
    );
  }

  if (options.allowedAlertSubdomains !== undefined) {
    if (options.allowedAlertSubdomains.length === 0) {
      throw new EmailConfigError('allowedAlertSubdomains cannot be an empty array.');
    }
    if (!hasSubdomainPrefix(parsedCandidate.domain, options.allowedAlertSubdomains)) {
      throw new SubdomainFirewallError(
        `Subdomain firewall blocked alert blast from "${parsedCandidate.domain}". Permitted alert subdomain prefixes: ${options.allowedAlertSubdomains.join(', ')}.`,
        candidate,
        parsedCandidate.domain
      );
    }
    return candidate;
  }

  const dedicatedConfigured =
    (options.alertsFrom
      ? hasSubdomainPrefix(parseSenderAddress(options.alertsFrom).domain, DEFAULT_ALLOWED_ALERT_SUBDOMAINS)
      : false) ||
    hasSubdomainPrefix(parseSenderAddress(options.defaultFrom).domain, DEFAULT_ALLOWED_ALERT_SUBDOMAINS);

  if (dedicatedConfigured && !hasSubdomainPrefix(parsedCandidate.domain, DEFAULT_ALLOWED_ALERT_SUBDOMAINS)) {
    throw new SubdomainFirewallError(
      `Subdomain firewall blocked alert blast from "${parsedCandidate.domain}" because a dedicated alert subdomain (${DEFAULT_ALLOWED_ALERT_SUBDOMAINS.join(', ')}) is configured.`,
      candidate,
      parsedCandidate.domain
    );
  }

  return candidate;
}
