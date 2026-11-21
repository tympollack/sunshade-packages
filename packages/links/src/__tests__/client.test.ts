import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LinksClient,
  SunshadeLinksClient,
  resolveTrustScore,
  shortenUrl,
} from '../client';

describe('LinksClient SDK', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('shortens a destination URL and sanitizes trackers before sending payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'lnk_123',
        slug: 'test-slug',
        short_url: 'https://links.sunshade.icu/test-slug/bsky',
        destination_url: 'https://sunshade.icu/blog/hello',
        channel: 'bsky',
        campaign: 'fall2026',
        trust_score: 95,
        created_at: '2026-10-31T20:00:00.000Z',
      }),
    });

    const client = new LinksClient({
      fetch: mockFetch as unknown as typeof fetch,
      apiKey: 'test-api-key',
      tenantId: 'pym-energy',
    });

    const result = await client.shortenUrl({
      destination: 'https://sunshade.icu/blog/hello?fbclid=bad_param&utm_source=bsky',
      channel: 'bsky',
      campaign: 'fall2026',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];

    expect(calledUrl).toBe('https://links.sunshade.icu/api/v1/links');
    expect(calledInit.method).toBe('POST');
    expect(calledInit.headers['Authorization']).toBe('Bearer test-api-key');
    expect(calledInit.headers['x-tenant-id']).toBe('pym-energy');

    const body = JSON.parse(calledInit.body as string);
    // Verified sanitized destination before request body sent
    expect(body.destination).toBe('https://sunshade.icu/blog/hello?utm_source=bsky');
    expect(body.channel).toBe('bsky');
    expect(body.campaign).toBe('fall2026');

    expect(result.id).toBe('lnk_123');
    expect(result.slug).toBe('test-slug');
    expect(result.shortUrl).toBe('https://links.sunshade.icu/test-slug/bsky');
    expect(result.trustScore).toBe(95);
  });

  it('rejects transmitting apiKey over plaintext HTTP transport', () => {
    expect(() => {
      new LinksClient({
        baseUrl: 'http://insecure-api.sunshade.icu',
        apiKey: 'secret_token_123',
      });
    }).toThrow(/Insecure transport: apiKey cannot be transmitted over plaintext HTTP/);

    // Allows http on localhost
    expect(() => {
      new LinksClient({
        baseUrl: 'http://localhost:3000',
        apiKey: 'secret_token_123',
      });
    }).not.toThrow();
  });

  it('gracefully falls back to sanitized destination URL on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network offline'));

    const client = new LinksClient({
      fetch: mockFetch as unknown as typeof fetch,
      enableFallback: true,
    });

    const dirtyUrl = 'https://sunshade.icu/docs?gclid=tracker123&doc=1';
    const result = await client.shortenUrl({
      destination: dirtyUrl,
      channel: 'direct',
    });

    expect(result.id).toMatch(/^fallback-/);
    expect(result.destinationUrl).toBe('https://sunshade.icu/docs?doc=1');
    expect(result.shortUrl).toBe('https://sunshade.icu/docs?doc=1');
    expect(result.channel).toBe('direct');
  });

  it('throws an error if enableFallback is false and network fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network offline'));

    const client = new LinksClient({
      fetch: mockFetch as unknown as typeof fetch,
      enableFallback: false,
    });

    await expect(
      client.shortenUrl({ destination: 'https://example.com' })
    ).rejects.toThrow('Network offline');
  });

  it('resolves remote Link Trust Score from auditor API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://sunshade.icu/manifesto',
        score: 96,
        tier: 'trusted',
        flags: {
          verified_did: true,
          sanitized_trackers: true,
          redirect_count: 0,
          reputation_tier: 'trusted',
          is_flagged: false,
          ssl_valid: true,
        },
        pillars: {
          provenance: 35,
          hygiene: 25,
          privacy: 20,
          networkDecay: 16,
        },
        did: 'did:key:z6MkhaXgBZDvotDkL5257faiz4898XnpGnxC65482357',
        last_hygiene_check: '2026-10-31T12:00:00Z',
      }),
    });

    const client = new LinksClient({
      fetch: mockFetch as unknown as typeof fetch,
    });

    const report = await client.resolveTrustScore('https://sunshade.icu/manifesto');

    expect(report.score).toBe(96);
    expect(report.status).toBe('trusted');
    expect(report.flags.verified_did).toBe(true);
    expect(report.pillars.provenance).toBe(35);
    expect(report.pillars.hygiene).toBe(25);
    expect(report.pillars.privacy).toBe(20);
  });

  it('falls back when audit response omits valid score data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}), // Missing score
    });

    const client = new LinksClient({
      fetch: mockFetch as unknown as typeof fetch,
      enableFallback: true,
    });

    const report = await client.resolveTrustScore('https://clean-site.org/page');
    expect(report.score).toBe(75);
    expect(report.status).toBe('warning');
  });

  it('computes deterministic local fallback when trust auditor is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Auditor offline'));

    const client = new LinksClient({
      fetch: mockFetch as unknown as typeof fetch,
      enableFallback: true,
    });

    // Test a clean HTTPS URL
    const reportClean = await client.resolveTrustScore('https://clean-site.org/page');
    expect(reportClean.score).toBe(75); // 10 provenance + 25 hygiene + 20 privacy + 20 decay
    expect(reportClean.status).toBe('warning'); // Baseline unverified is neutral/warning
    expect(reportClean.flags.ssl_valid).toBe(true);
    expect(reportClean.flags.sanitized_trackers).toBe(true);

    // Test an insecure HTTP URL with trackers
    mockFetch.mockRejectedValueOnce(new Error('Auditor offline'));
    const reportDirty = await client.resolveTrustScore('http://insecure-site.org/page?fbclid=bad');
    expect(reportDirty.score).toBe(45); // 10 provenance + 10 hygiene + 5 privacy + 20 decay
    expect(reportDirty.status).toBe('danger');
    expect(reportDirty.flags.ssl_valid).toBe(false);
    expect(reportDirty.flags.sanitized_trackers).toBe(false);
    expect(reportDirty.flags.is_flagged).toBe(true);
  });

  it('exports SunshadeLinksClient as alias of LinksClient', () => {
    expect(SunshadeLinksClient).toBe(LinksClient);
  });

  it('supports functional shortenUrl and resolveTrustScore helpers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'func_1',
        short_url: 'https://links.sunshade.icu/fn/bsky',
        destination_url: 'https://sunshade.icu',
        channel: 'bsky',
      }),
    });

    const result = await shortenUrl(
      { destination: 'https://sunshade.icu', channel: 'bsky' },
      { fetch: mockFetch as unknown as typeof fetch }
    );

    expect(result.shortUrl).toBe('https://links.sunshade.icu/fn/bsky');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: 'https://sunshade.icu',
        score: 92,
      }),
    });

    const report = await resolveTrustScore('https://sunshade.icu', {
      fetch: mockFetch as unknown as typeof fetch,
    });
    expect(report.score).toBe(92);
  });
});
