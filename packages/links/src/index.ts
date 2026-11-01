/**
 * @digitalcanopy/links
 * Universal Linking Client Library for SunShade Systems
 */

// Core types
export type {
  ClientConfig,
  ReputationTier,
  ShortLinkResult,
  ShortenUrlOptions,
  TrustFlags,
  TrustPillars,
  TrustScoreReport,
  TrustTier,
} from './types';

// URL & Privacy Sanitizer
export {
  INVASIVE_TRACKING_PARAMS,
  hasSurveillanceTokens,
  sanitizeUrl,
} from './sanitizer';

// Links Client SDK
export {
  LinksClient,
  SunshadeLinksClient,
  getDefaultClient,
  resolveTrustScore,
  setDefaultClient,
  shortenUrl,
} from './client';

// React Type Exports (Runtime components exported via '@digitalcanopy/links/react')
export type {
  SafeAnchorProps,
  TrustBadgeProps,
  UseTrackedLinkOptions,
  UseTrackedLinkResult,
} from './react';
