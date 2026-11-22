/**
 * Domain parsing, apex detection, and subdomain reputation firewall helpers.
 */

export const DEFAULT_ALLOWED_ALERT_SUBDOMAINS = ['mail.', 'drops.'] as const;

/**
 * Common two-label public suffixes so domains like `example.co.uk` are still
 * recognized as root apex domains rather than subdomains.
 */
const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'co.jp',
  'com.br',
]);

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

const ANGLE_ADDR_REGEX = /^(?:"?([^"]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/;
const SIMPLE_EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Parses either `"Display Name <user@domain.tld>"` or `"user@domain.tld"`.
 */
export function parseSenderAddress(sender: string): ParsedSender {
  if (typeof sender !== 'string' || !sender.trim()) {
    throw new EmailValidationError('Sender address must be a non-empty string.');
  }

  const trimmed = sender.trim();
  const angleMatch = trimmed.match(ANGLE_ADDR_REGEX);

  const displayName = angleMatch?.[1]?.trim() || undefined;
  const email = (angleMatch ? angleMatch[2] : trimmed).trim().toLowerCase();

  if (!SIMPLE_EMAIL_REGEX.test(email)) {
    throw new EmailValidationError(`Invalid sender email address: "${sender}".`);
  }

  const atIndex = email.lastIndexOf('@');
  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (!localPart || !domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    throw new EmailValidationError(`Invalid sender email domain in "${sender}".`);
  }

  return {
    raw: trimmed,
    displayName,
    email,
    localPart,
    domain,
  };
}

/**
 * Validates a recipient or standalone email string.
 */
export function validateEmailAddress(email: string, fieldName = 'email'): string {
  if (typeof email !== 'string' || !email.trim()) {
    throw new EmailValidationError(`${fieldName} must be a non-empty email address.`);
  }
  const parsed = parseSenderAddress(email);
  return parsed.email;
}

/**
 * Returns true if `domain` is a root apex domain (e.g., `sunshade.icu`, `madeintheshade.wtf`, `example.co.uk`)
 * with no subdomain label.
 */
export function isRootApexDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/\.$/, '');
  const labels = normalized.split('.').filter(Boolean);

  if (labels.length <= 2) {
    return true;
  }

  const lastTwo = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
  if (MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo) && labels.length === 3) {
    return true;
  }

  return false;
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
 * 2. Never permits a root apex domain (e.g. `sunshade.icu` or `madeintheshade.wtf`) for alert blasts.
 * 3. When a dedicated `mail.` / `drops.` subdomain is configured via `alertsFrom` or `defaultFrom`,
 *    rejects any override that sends from a root apex domain or outside the allowed alert subdomains.
 */
export function resolveAlertSender(options: ResolveAlertSenderOptions): string {
  const allowedPrefixes =
    options.allowedAlertSubdomains && options.allowedAlertSubdomains.length > 0
      ? options.allowedAlertSubdomains
      : DEFAULT_ALLOWED_ALERT_SUBDOMAINS;

  const candidate = (options.messageFrom ?? options.alertsFrom ?? options.defaultFrom).trim();
  const parsedCandidate = parseSenderAddress(candidate);

  if (isRootApexDomain(parsedCandidate.domain)) {
    throw new SubdomainFirewallError(
      `Subdomain firewall blocked alert blast from root apex domain "${parsedCandidate.domain}". Configure a dedicated subdomain (e.g. "mail." or "drops.").`,
      candidate,
      parsedCandidate.domain
    );
  }

  const dedicatedConfigured =
    (options.alertsFrom ? hasSubdomainPrefix(parseSenderAddress(options.alertsFrom).domain, allowedPrefixes) : false) ||
    hasSubdomainPrefix(parseSenderAddress(options.defaultFrom).domain, allowedPrefixes);

  if (dedicatedConfigured && !hasSubdomainPrefix(parsedCandidate.domain, allowedPrefixes)) {
    throw new SubdomainFirewallError(
      `Subdomain firewall blocked alert blast from "${parsedCandidate.domain}" because a dedicated alert subdomain (${allowedPrefixes.join(', ')}) is configured.`,
      candidate,
      parsedCandidate.domain
    );
  }

  return candidate;
}
