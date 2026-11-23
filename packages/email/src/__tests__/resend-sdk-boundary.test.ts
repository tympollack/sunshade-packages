import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailClient } from '../index';

describe('Resend SDK URL path escaping boundary', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('escapes reserved URL delimiters in email path segments when enrolling existing contacts', async () => {
    const requestedUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input.toString();
      requestedUrls.push(url);

      if (requestedUrls.length === 1) {
        return new Response(
          JSON.stringify({ name: 'already_exists', message: 'Contact already exists', statusCode: 409 }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ id: 'seg_vip' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const client = createEmailClient({
      apiKey: 're_boundary_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
    });

    const res = await client.addAudienceContact({
      email: 'sam#alerts?vip=1@example.com',
      segmentIds: ['seg_vip'],
    });

    expect(res.alreadyExists).toBe(true);
    expect(requestedUrls).toHaveLength(2);
    const parsedSegmentUrl = new URL(requestedUrls[1]);
    expect(parsedSegmentUrl.pathname).toBe('/contacts/sam%23alerts%3Fvip=1@example.com/segments/seg_vip');
    expect(parsedSegmentUrl.search).toBe('');
    expect(parsedSegmentUrl.hash).toBe('');
  });
});
