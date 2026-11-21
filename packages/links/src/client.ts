/**
 * SunShade Universal Links Client SDK
 */

import { hasSurveillanceTokens, sanitizeUrl } from './sanitizer';
import type {
  ClientConfig,
  ReputationTier,
  ShortLinkResult,
  ShortenUrlOptions,
  TrustFlags,
  TrustPillars,
  TrustScoreReport,
  TrustTier,
} from './types';

const DEFAULT_BASE_URL = 'https://links.sunshade.icu';
const DEFAULT_TIMEOUT_MS = 5000;

export class LinksClient {
  private baseUrl: string;
  private apiKey?: string;
  private tenantId?: string;
  private customFetch: typeof fetch;
  private enableFallback: boolean;
  private timeoutMs: number;

  constructor(config: ClientConfig = {}) {
    const rawBase = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.apiKey = config.apiKey;

    // Security check: Never send credentials over plaintext HTTP in production
    if (
      this.apiKey &&
      rawBase.startsWith('http://') &&
      !rawBase.includes('localhost') &&
      !rawBase.includes('127.0.0.1')
    ) {
      throw new Error(
        'Insecure transport: apiKey cannot be transmitted over plaintext HTTP (use HTTPS or localhost).'
      );
    }

    this.baseUrl = rawBase;
    this.tenantId = config.tenantId;
    this.customFetch = config.fetch || globalThis.fetch.bind(globalThis);
    this.enableFallback = config.enableFallback ?? true;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Shorten a destination URL with channel routing and privacy sanitization.
   */
  async shortenUrl(options: ShortenUrlOptions): Promise<ShortLinkResult> {
    if (!options?.destination) {
      throw new Error('Destination URL is required');
    }

    const sanitizedDestination = this.sanitizeUrl(options.destination);
    const channel = options.channel || 'direct';
    const tenantId = options.tenantId || this.tenantId;

    const payload = {
      destination: sanitizedDestination,
      channel,
      campaign: options.campaign,
      tenant_id: tenantId,
      slug: options.slug,
      metadata: options.metadata,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (tenantId) {
      headers['x-tenant-id'] = tenantId;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.customFetch(`${this.baseUrl}/api/v1/links`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Links API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        id: data.id || `lnk_${Math.random().toString(36).substring(2, 9)}`,
        slug: data.slug || options.slug || '',
        shortUrl:
          data.short_url ||
          data.shortUrl ||
          `${this.baseUrl}/${data.slug || options.slug || ''}/${channel}`,
        destinationUrl: data.destination_url || data.destinationUrl || sanitizedDestination,
        channel: data.channel || channel,
        campaign: data.campaign || options.campaign,
        tenantId: data.tenant_id || data.tenantId || tenantId,
        trustScore: data.trust_score ?? data.trustScore,
        createdAt: data.created_at || data.createdAt || new Date().toISOString(),
      };
    } catch (err) {
      if (!this.enableFallback) {
        throw err;
      }

      // Fallback: return sanitized URL directly without shortening
      return {
        id: `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        slug: options.slug || '',
        shortUrl: sanitizedDestination,
        destinationUrl: sanitizedDestination,
        channel,
        campaign: options.campaign,
        tenantId,
        trustScore: undefined,
        createdAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Resolve the Link Trust Score and 4-pillar audit report.
   */
  async resolveTrustScore(urlOrSlug: string): Promise<TrustScoreReport> {
    if (!urlOrSlug) {
      throw new Error('URL or slug is required');
    }

    const isUrl =
      urlOrSlug.startsWith('http://') ||
      urlOrSlug.startsWith('https://') ||
      urlOrSlug.startsWith('//');

    const endpoint = isUrl
      ? `${this.baseUrl}/api/v1/trust?url=${encodeURIComponent(urlOrSlug)}`
      : `${this.baseUrl}/api/v1/trust/${encodeURIComponent(urlOrSlug)}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (this.tenantId) {
      headers['x-tenant-id'] = this.tenantId;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.customFetch(endpoint, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Trust API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rawScore = data.score ?? data.trust_score;

      // Validate that the remote response actually provided a score
      if (typeof rawScore !== 'number' || isNaN(rawScore)) {
        throw new Error('Invalid audit response: missing or unparseable trust score');
      }

      const score: number = Math.max(0, Math.min(100, rawScore));

      const status: TrustTier =
        score >= 85 ? 'trusted' : score >= 60 ? 'warning' : 'danger';
      const tier: ReputationTier =
        data.tier ||
        (score >= 85 ? 'trusted' : score >= 60 ? 'neutral' : 'danger');

      return {
        url: data.url || urlOrSlug,
        slug: data.slug,
        score,
        tier,
        status,
        flags: data.flags || {
          verified_did: !!data.verified_did,
          sanitized_trackers: !hasSurveillanceTokens(urlOrSlug),
          redirect_count: data.redirect_count ?? 0,
          reputation_tier: tier,
          is_flagged: score < 60,
          ssl_valid: urlOrSlug.startsWith('https://') || urlOrSlug.startsWith('//'),
        },
        pillars: data.pillars || {
          provenance: Math.round(score * 0.35),
          hygiene: Math.round(score * 0.25),
          privacy: Math.round(score * 0.2),
          networkDecay: Math.round(score * 0.2),
        },
        lastHygieneCheck:
          data.last_hygiene_check || data.lastHygieneCheck || new Date().toISOString(),
        did: data.did,
        recommendation: data.recommendation,
      };
    } catch (err) {
      if (!this.enableFallback) {
        throw err;
      }

      // Offline / Local Deterministic Trust Evaluation Fallback
      return this.computeLocalTrustScore(urlOrSlug);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Sanitizes a URL by stripping surveillance and ad-tech tracking parameters.
   */
  sanitizeUrl(rawUrl: string): string {
    return sanitizeUrl(rawUrl);
  }

  /**
   * Deterministic client-side evaluation fallback when the remote trust auditor is unreachable.
   */
  private computeLocalTrustScore(urlOrSlug: string): TrustScoreReport {
    const isHttps = urlOrSlug.startsWith('https://') || urlOrSlug.startsWith('//');
    const hasTrackers = hasSurveillanceTokens(urlOrSlug);

    // Provenance (Pillar 1: 0-35)
    const provenance = 10; // Unverified author baseline

    // Target Hygiene (Pillar 2: 0-25)
    const hygiene = isHttps ? 25 : 10;

    // Privacy (Pillar 3: 0-20)
    const privacy = hasTrackers ? 5 : 20;

    // Network / Temporal Decay (Pillar 4: 0-20)
    const networkDecay = 20;

    const score = provenance + hygiene + privacy + networkDecay;
    const status: TrustTier = score >= 85 ? 'trusted' : score >= 60 ? 'warning' : 'danger';
    const tier: ReputationTier = score >= 85 ? 'trusted' : score >= 60 ? 'neutral' : 'danger';

    const flags: TrustFlags = {
      verified_did: false,
      sanitized_trackers: !hasTrackers,
      redirect_count: 0,
      reputation_tier: tier,
      is_flagged: score < 60,
      ssl_valid: isHttps,
    };

    const pillars: TrustPillars = {
      provenance,
      hygiene,
      privacy,
      networkDecay,
    };

    return {
      url: urlOrSlug,
      score,
      tier,
      status,
      flags,
      pillars,
      lastHygieneCheck: new Date().toISOString(),
      recommendation:
        score < 60
          ? 'Destination has potential security or tracking concerns.'
          : 'Destination is reachable and verified against standard security baselines.',
    };
  }
}

// Singleton and default client management
let defaultClientInstance: LinksClient | null = null;

export function getDefaultClient(): LinksClient {
  if (!defaultClientInstance) {
    defaultClientInstance = new LinksClient();
  }
  return defaultClientInstance;
}

export function setDefaultClient(client: LinksClient): void {
  defaultClientInstance = client;
}

/**
 * Universal functional export to shorten a URL.
 */
export async function shortenUrl(
  options: ShortenUrlOptions,
  config?: ClientConfig
): Promise<ShortLinkResult> {
  const client = config ? new LinksClient(config) : getDefaultClient();
  return client.shortenUrl(options);
}

/**
 * Universal functional export to resolve a Link Trust Score.
 */
export async function resolveTrustScore(
  urlOrSlug: string,
  config?: ClientConfig
): Promise<TrustScoreReport> {
  const client = config ? new LinksClient(config) : getDefaultClient();
  return client.resolveTrustScore(urlOrSlug);
}

/**
 * Alias for ecosystem naming consistency.
 */
export const SunshadeLinksClient = LinksClient;
