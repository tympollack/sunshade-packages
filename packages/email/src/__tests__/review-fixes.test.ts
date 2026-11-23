import { describe, expect, it, vi } from 'vitest';
import {
  BatchDispatchError,
  EmailDispatchError,
  EmailValidationError,
  SubdomainFirewallError,
  createEmailClient,
  isRootApexDomain,
  parseSenderAddress,
  type ResendLike,
} from '../index';

function createStubResend(): {
  client: ResendLike;
  sendEmail: ReturnType<typeof vi.fn>;
  sendBatch: ReturnType<typeof vi.fn>;
  createContact: ReturnType<typeof vi.fn>;
} {
  const sendEmail = vi.fn();
  const sendBatch = vi.fn();
  const createContact = vi.fn();
  return {
    client: {
      emails: { send: sendEmail },
      batch: { send: sendBatch },
      contacts: { create: createContact },
    },
    sendEmail,
    sendBatch,
    createContact,
  };
}

describe('PR #27 review hardening', () => {
  it('preserves local-part case while lowercasing domain in parseSenderAddress', () => {
    const parsed = parseSenderAddress('Alice <Alice.Smith+Drops@Example.COM>');
    expect(parsed.localPart).toBe('Alice.Smith+Drops');
    expect(parsed.domain).toBe('example.com');
    expect(parsed.email).toBe('Alice.Smith+Drops@example.com');
  });

  it('uses Public Suffix List so regional apex domains like shop.co.in are blocked', async () => {
    expect(isRootApexDomain('shop.co.in')).toBe(true);
    expect(isRootApexDomain('store.com.mx')).toBe(true);
    expect(isRootApexDomain('drops.shop.co.in')).toBe(false);

    const stub = createStubResend();
    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'alerts@shop.co.in',
      resendClient: stub.client,
    });

    await expect(
      client.sendBatchNotification([
        {
          to: 'fan@example.com',
          subject: 'Drop Live',
          html: '<p>Hi</p>',
          unsubscribeUrl: 'https://shop.co.in/unsubscribe?t=1',
        },
      ])
    ).rejects.toThrow(SubdomainFirewallError);
  });

  it('enforces explicit allowedAlertSubdomains independently of defaultFrom', async () => {
    const stub = createStubResend();
    stub.sendBatch.mockResolvedValue({ data: { data: [{ id: 'em_1' }] }, error: null });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'auth@example.com',
      allowedAlertSubdomains: ['drops.'],
      resendClient: stub.client,
    });

    await expect(
      client.sendBatchNotification([
        {
          from: 'promo@app.example.com',
          to: 'fan@example.com',
          subject: 'Drop',
          html: '<p>Hi</p>',
          unsubscribeUrl: 'https://example.com/unsub',
        },
      ])
    ).rejects.toThrow(SubdomainFirewallError);

    const ok = await client.sendBatchNotification([
      {
        from: 'drops@drops.example.com',
        to: 'fan@example.com',
        subject: 'Drop',
        html: '<p>Hi</p>',
        unsubscribeUrl: 'https://example.com/unsub',
      },
    ]);
    expect(ok.ids).toEqual(['em_1']);
  });

  it('requires HTTPS for RFC 8058 one-click headers and canonicalizes header casing', async () => {
    const stub = createStubResend();
    stub.sendBatch.mockResolvedValue({ data: { data: [{ id: 'em_1' }] }, error: null });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: stub.client,
    });

    // Rejects plain http:// unsubscribeUrl
    await expect(
      client.sendBatchNotification([
        {
          to: 'fan@example.com',
          subject: 'Drop',
          html: '<p>Hi</p>',
          unsubscribeUrl: 'http://example.com/unsub',
        },
      ])
    ).rejects.toThrow(EmailValidationError);

    // Standalone mailto omits List-Unsubscribe-Post
    await client.sendBatchNotification([
      {
        to: 'fan@example.com',
        subject: 'Drop',
        html: '<p>Hi</p>',
        unsubscribeMailto: 'unsubscribe@example.com',
      },
    ]);
    expect(stub.sendBatch.mock.calls[0][0][0].headers).toEqual({
      'List-Unsubscribe': '<mailto:unsubscribe@example.com>',
    });

    // Case-insensitive custom headers do not leave duplicate keys
    await client.sendBatchNotification([
      {
        to: 'fan@example.com',
        subject: 'Drop',
        html: '<p>Hi</p>',
        headers: {
          'list-unsubscribe': '<https://example.com/old>',
          'X-Custom': '1',
        },
        unsubscribeUrl: 'https://example.com/new',
      },
    ]);
    expect(stub.sendBatch.mock.calls[1][0][0].headers).toEqual({
      'X-Custom': '1',
      'List-Unsubscribe': '<https://example.com/new>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('exposes completedBatches and failedChunkIndex on BatchDispatchError and derives chunk idempotency keys', async () => {
    const stub = createStubResend();
    stub.sendBatch
      .mockResolvedValueOnce({
        data: { data: Array.from({ length: 100 }, (_, i) => ({ id: `em_0_${i}` })) },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { name: 'daily_quota_exceeded', message: 'Daily quota reached', statusCode: 429 },
      });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: stub.client,
      maxRetries: 3,
      initialRetryDelayMs: 0,
    });

    const messages = Array.from({ length: 150 }, (_, i) => ({
      to: `u${i}@example.com`,
      subject: 'Drop',
      html: '<p>Go</p>',
      unsubscribeUrl: 'https://makerverse.sunshade.icu/api/unsubscribe?token=t1',
    }));

    let caught: unknown;
    try {
      await client.sendBatchNotification(messages, { idempotencyKey: 'campaign-1' });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BatchDispatchError);
    const batchErr = caught as BatchDispatchError;
    expect(batchErr.failedChunkIndex).toBe(1);
    expect(batchErr.completedBatches).toEqual([
      {
        chunkIndex: 0,
        size: 100,
        ids: expect.arrayContaining(['em_0_0', 'em_0_99']),
      },
    ]);
    expect(batchErr.completedIds).toHaveLength(100);
    // Daily quota errors are NOT retried
    expect(stub.sendBatch).toHaveBeenCalledTimes(2);
    expect(stub.sendBatch.mock.calls[0][1]).toEqual({ idempotencyKey: 'campaign-1/chunk-0' });
    expect(stub.sendBatch.mock.calls[1][1]).toEqual({ idempotencyKey: 'campaign-1/chunk-1' });
  });

  it('retries contact creation on rate_limit_exceeded and supports segmentIds', async () => {
    const stub = createStubResend();
    stub.createContact
      .mockResolvedValueOnce({
        data: null,
        error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 },
      })
      .mockResolvedValueOnce({
        data: { object: 'contact', id: 'ct_seg_1' },
        error: null,
      });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: stub.client,
      maxRetries: 3,
      initialRetryDelayMs: 0,
    });

    const res = await client.addAudienceContact({
      segmentIds: ['seg_123'],
      email: 'collector@example.com',
    });

    expect(stub.createContact).toHaveBeenCalledTimes(2);
    expect(stub.createContact.mock.calls[0][0]).toEqual({
      email: 'collector@example.com',
      segments: [{ id: 'seg_123' }],
    });
    expect(res).toEqual({
      id: 'ct_seg_1',
      segmentIds: ['seg_123'],
      email: 'collector@example.com',
      created: true,
      alreadyExists: false,
      dryRun: false,
    });

    // Quota exhaustion throws without retry
    stub.createContact.mockResolvedValueOnce({
      data: null,
      error: { name: 'monthly_quota_exceeded', message: 'Monthly quota exceeded', statusCode: 429 },
    });
    await expect(
      client.addAudienceContact({ audienceId: 'aud_1', email: 'other@example.com' })
    ).rejects.toThrow(EmailDispatchError);
    expect(stub.createContact).toHaveBeenCalledTimes(3);
  });
});
