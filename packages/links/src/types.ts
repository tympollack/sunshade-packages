/**
 * @digitalcanopy/links Types & Interfaces
 */

export type ReputationTier =
  | 'canonical'
  | 'trusted'
  | 'neutral'
  | 'warning'
  | 'danger'
  | 'unverified';

export type TrustTier = 'trusted' | 'warning' | 'danger';

export interface TrustFlags {
  verified_did: boolean;
  sanitized_trackers: boolean;
  redirect_count: number;
  reputation_tier: ReputationTier;
  is_flagged?: boolean;
  ssl_valid?: boolean;
}

export interface TrustPillars {
  /** Cryptographic provenance and DID verification score (0–35) */
  provenance: number;
  /** Destination hygiene, SSL validity, and redirect hop score (0–25) */
  hygiene: number;
  /** Privacy footprint and surveillance tracker stripping score (0–20) */
  privacy: number;
  /** Network corroboration and temporal decay score (0–20) */
  networkDecay: number;
}

export interface TrustScoreReport {
  url: string;
  slug?: string;
  score: number;
  tier: ReputationTier;
  status: TrustTier;
  flags: TrustFlags;
  pillars: TrustPillars;
  lastHygieneCheck?: string;
  did?: string;
  recommendation?: string;
}

export interface ShortenUrlOptions {
  destination: string;
  channel?: string;
  campaign?: string;
  tenantId?: string;
  slug?: string;
  metadata?: Record<string, unknown>;
}

export interface ShortLinkResult {
  id: string;
  slug: string;
  shortUrl: string;
  destinationUrl: string;
  channel: string;
  campaign?: string;
  tenantId?: string;
  trustScore?: number;
  createdAt: string;
}

export interface ClientConfig {
  baseUrl?: string;
  apiKey?: string;
  tenantId?: string;
  fetch?: typeof fetch;
  enableFallback?: boolean;
  timeoutMs?: number;
}
