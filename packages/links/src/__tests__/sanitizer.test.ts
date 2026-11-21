import { describe, expect, it } from 'vitest';
import {
  hasSurveillanceTokens,
  INVASIVE_TRACKING_PARAMS,
  sanitizeUrl,
} from '../sanitizer';

describe('Privacy Sanitizer (sanitizeUrl & hasSurveillanceTokens)', () => {
  it('strips all major ad-tech and surveillance query parameters', () => {
    const dirtyUrl =
      'https://sunshade.icu/post?fbclid=12345&gclid=67890&msclkid=abc&ttclid=xyz&twclid=tw123&_hsenc=hs123&mc_eid=mc123&sc_campaign=sc123&igshid=ig123&dclid=dc123&gad_source=gad1&gbraid=gb1&wbraid=wb1&yclid=yc1';

    const cleaned = sanitizeUrl(dirtyUrl);
    expect(cleaned).toBe('https://sunshade.icu/post');
    expect(hasSurveillanceTokens(dirtyUrl)).toBe(true);
    expect(hasSurveillanceTokens(cleaned)).toBe(false);
  });

  it('preserves clean attribution and application query parameters', () => {
    const mixedUrl =
      'https://links.sunshade.icu/article?utm_source=bsky&utm_medium=social&utm_campaign=launch&utm_term=crypto&utm_content=v1&ch=direct&ref=hub&fbclid=strip_me&doc_id=987';

    const cleaned = sanitizeUrl(mixedUrl);
    const parsed = new URL(cleaned);

    expect(parsed.searchParams.get('fbclid')).toBeNull();
    expect(parsed.searchParams.get('utm_source')).toBe('bsky');
    expect(parsed.searchParams.get('utm_medium')).toBe('social');
    expect(parsed.searchParams.get('utm_campaign')).toBe('launch');
    expect(parsed.searchParams.get('utm_term')).toBe('crypto');
    expect(parsed.searchParams.get('utm_content')).toBe('v1');
    expect(parsed.searchParams.get('ch')).toBe('direct');
    expect(parsed.searchParams.get('ref')).toBe('hub');
    expect(parsed.searchParams.get('doc_id')).toBe('987');
  });

  it('preserves URL hash fragments', () => {
    const urlWithHash = 'https://sunshade.icu/docs?fbclid=bad#installation-guide';
    const cleaned = sanitizeUrl(urlWithHash);

    expect(cleaned).toBe('https://sunshade.icu/docs#installation-guide');
  });

  it('sanitizes relative URLs safely while preserving path traversals', () => {
    const relative = '/dashboard/overview?fbclid=strip_me&tab=analytics#summary';
    const cleaned = sanitizeUrl(relative);

    expect(cleaned).toBe('/dashboard/overview?tab=analytics#summary');
    expect(hasSurveillanceTokens(relative)).toBe(true);
    expect(hasSurveillanceTokens(cleaned)).toBe(false);

    // Parent-relative traversals
    expect(sanitizeUrl('../invite?gclid=bad&ref=sidebar')).toBe('../invite?ref=sidebar');
    expect(sanitizeUrl('../../settings?fbclid=123')).toBe('../../settings');
  });

  it('neutralizes dangerous executable URL schemes', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
    expect(sanitizeUrl('JAVASCRIPT:void(0)')).toBe('about:blank');
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('about:blank');
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank');
  });

  it('preserves protocol-relative external URLs', () => {
    const protoRelative = '//other.example/page?fbclid=bad&ref=shared#section';
    expect(sanitizeUrl(protoRelative)).toBe('//other.example/page?ref=shared#section');
  });

  it('handles relative paths without leading slash', () => {
    const relative = 'invite?gclid=bad&ref=friend';
    const cleaned = sanitizeUrl(relative);

    expect(cleaned).toBe('invite?ref=friend');
  });

  it('handles root domain URLs cleanly without lingering trailing questions', () => {
    const rootUrl = 'https://sunshade.icu?fbclid=bad_param';
    const cleaned = sanitizeUrl(rootUrl);

    expect(cleaned).toBe('https://sunshade.icu');
  });

  it('returns empty string for empty, null, or invalid non-string input', () => {
    expect(sanitizeUrl('')).toBe('');
    // @ts-expect-error test invalid inputs
    expect(sanitizeUrl(null)).toBe('');
    // @ts-expect-error test invalid inputs
    expect(sanitizeUrl(undefined)).toBe('');
  });

  it('verifies INVASIVE_TRACKING_PARAMS set contains key ad platforms', () => {
    expect(INVASIVE_TRACKING_PARAMS.has('fbclid')).toBe(true);
    expect(INVASIVE_TRACKING_PARAMS.has('gclid')).toBe(true);
    expect(INVASIVE_TRACKING_PARAMS.has('msclkid')).toBe(true);
    expect(INVASIVE_TRACKING_PARAMS.has('ttclid')).toBe(true);
    expect(INVASIVE_TRACKING_PARAMS.has('twclid')).toBe(true);
    expect(INVASIVE_TRACKING_PARAMS.has('_hsenc')).toBe(true);
    expect(INVASIVE_TRACKING_PARAMS.has('mc_eid')).toBe(true);
    expect(INVASIVE_TRACKING_PARAMS.has('sc_campaign')).toBe(true);
  });
});
