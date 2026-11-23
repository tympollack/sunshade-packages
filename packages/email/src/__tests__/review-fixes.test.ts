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
  addSegment: ReturnType<typeof vi.fn>;
  updateContact: ReturnType<typeof vi.fn>;
} {
  const sendEmail = vi.fn();
  const sendBatch = vi.fn();
  const createContact = vi.fn();
  const addSegment = vi.fn();
  const updateContact = vi.fn();
  return {
    client: {
      emails: { send: sendEmail },
      batch: { send: sendBatch },
      contacts: {
        create: createContact,
        segments: { add: addSegment },
        update: updateContact,
      },
    },
    sendEmail,
    sendBatch,
    createContact,
    addSegment,
    updateContact,
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

describe('PR #29 review hardening', () => {
  it('enrolls existing contacts into requested segments via contacts.segments.add', async () => {
    const stub = createStubResend();
    stub.createContact.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Contact already exists', statusCode: 409 },
    });
    stub.addSegment
      .mockResolvedValueOnce({ data: { id: 'seg_drops' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'seg_vip' }, error: null });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: stub.client,
    });

    const res = await client.addAudienceContact({
      email: 'existing@example.com',
      segmentIds: ['seg_drops', 'seg_vip'],
    });

    expect(stub.addSegment).toHaveBeenNthCalledWith(1, {
      email: 'existing@example.com',
      segmentId: 'seg_drops',
    });
    expect(stub.addSegment).toHaveBeenNthCalledWith(2, {
      email: 'existing@example.com',
      segmentId: 'seg_vip',
    });
    expect(res).toEqual({
      email: 'existing@example.com',
      segmentIds: ['seg_drops', 'seg_vip'],
      created: false,
      alreadyExists: true,
      dryRun: false,
    });
  });

  it('escapes RFC 6068 mailto characters and avoids upgrading custom GET-only headers', async () => {
    const stub = createStubResend();
    stub.sendBatch.mockResolvedValue({ data: { data: [{ id: 'em_1' }] }, error: null });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: stub.client,
    });

    await client.sendBatchNotification([
      {
        to: 'fan@example.com',
        subject: 'Drop',
        html: '<p>Hi</p>',
        unsubscribeMailto: 'unsubscribe#alerts&vip@example.com',
      },
      {
        to: 'fan2@example.com',
        subject: 'Drop',
        html: '<p>Hi</p>',
        headers: {
          'List-Unsubscribe': '<https://example.com/preferences>',
        },
      },
      {
        to: 'fan3@example.com',
        subject: 'Drop',
        html: '<p>Hi</p>',
        headers: {
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      },
    ]);

    expect(stub.sendBatch.mock.calls[0][0][0].headers).toEqual({
      'List-Unsubscribe': '<mailto:unsubscribe%23alerts%26vip@example.com>',
    });
    expect(stub.sendBatch.mock.calls[0][0][1].headers).toEqual({
      'List-Unsubscribe': '<https://example.com/preferences>',
    });
    expect(stub.sendBatch.mock.calls[0][0][2].headers).toBeUndefined();
  });

  it('caps derived batch idempotency keys at 256 chars and preserves text="" opt-out', async () => {
    const stub = createStubResend();
    stub.sendBatch.mockImplementation(async (batch: unknown[]) => ({
      data: { data: batch.map((_, i) => ({ id: `em_${i}` })) },
      error: null,
    }));

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: stub.client,
    });

    const longKey = 'k'.repeat(250);
    const messages = Array.from({ length: 120 }, (_, i) => ({
      to: `u${i}@example.com`,
      subject: 'Drop',
      html: '<p>HTML Only</p>',
      text: '',
      unsubscribeUrl: 'https://makerverse.sunshade.icu/api/unsubscribe?token=t1',
    }));

    await client.sendBatchNotification(messages, { idempotencyKey: longKey });

    const key0 = stub.sendBatch.mock.calls[0][1].idempotencyKey as string;
    const key1 = stub.sendBatch.mock.calls[1][1].idempotencyKey as string;
    expect(key0.length).toBeLessThanOrEqual(256);
    expect(key1.length).toBeLessThanOrEqual(256);
    expect(key0).not.toBe(key1);
    expect(key0.endsWith('/chunk-0')).toBe(true);
    expect(key1.endsWith('/chunk-1')).toBe(true);
    expect(stub.sendBatch.mock.calls[0][0][0].text).toBe('');
  });

  it('performs 1 retry when maxRetries is 1 and honors Retry-After response headers', async () => {
    const stub = createStubResend();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    stub.sendBatch
      .mockResolvedValueOnce({
        data: null,
        error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 },
        headers: { 'Retry-After': '0.02' },
      })
      .mockResolvedValueOnce({
        data: { data: [{ id: 'em_ok_1' }] },
        error: null,
      });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: stub.client,
      maxRetries: 1,
      initialRetryDelayMs: 0,
    });

    const res = await client.sendBatchNotification([
      {
        to: 'fan@example.com',
        subject: 'Drop',
        html: '<p>Go</p>',
        unsubscribeUrl: 'https://makerverse.sunshade.icu/api/unsubscribe?token=t1',
      },
    ]);

    expect(res.ids).toEqual(['em_ok_1']);
    expect(stub.sendBatch).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 20);
    setTimeoutSpy.mockRestore();
  });
});

describe('PR #30 review hardening', () => {
  it('propagates unsubscribed: true before enrolling existing contacts and aborts on update failure', async () => {
    const stub = createStubResend();
    const callOrder: string[] = [];

    stub.createContact.mockResolvedValue({
      data: null,
      error: { name: 'already_exists', message: 'Contact already exists', statusCode: 409 },
    });
    stub.updateContact.mockImplementation(async () => {
      callOrder.push('update');
      return { data: { id: 'ct_1', object: 'contact' }, error: null };
    });
    stub.addSegment.mockImplementation(async () => {
      callOrder.push('segment');
      return { data: { id: 'seg_vip' }, error: null };
    });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: stub.client,
    });

    await client.addAudienceContact({
      email: 'sam@example.com',
      segmentIds: ['seg_vip'],
      unsubscribed: true,
    });
    expect(callOrder).toEqual(['update', 'segment']);
    expect(stub.updateContact).toHaveBeenCalledWith({
      email: 'sam@example.com',
      unsubscribed: true,
    });

    // Does not clear opt-out when unsubscribed is false
    stub.updateContact.mockClear();
    stub.addSegment.mockClear();
    await client.addAudienceContact({
      email: 'sam@example.com',
      segmentIds: ['seg_vip'],
      unsubscribed: false,
    });
    expect(stub.updateContact).not.toHaveBeenCalled();
    expect(stub.addSegment).toHaveBeenCalledTimes(1);

    // Aborts before segment enrollment when contacts.update fails
    stub.addSegment.mockClear();
    stub.updateContact.mockResolvedValueOnce({
      data: null,
      error: { name: 'internal_server_error', message: 'Update failed', statusCode: 500 },
    });
    await expect(
      client.addAudienceContact({
        email: 'sam@example.com',
        segmentIds: ['seg_vip'],
        unsubscribed: true,
      })
    ).rejects.toThrow(EmailDispatchError);
    expect(stub.addSegment).not.toHaveBeenCalled();
  });

  it('omits whitespace-only text fallback and does not swallow 409 resource_locked on segments.add', async () => {
    const stub = createStubResend();
    stub.sendBatch.mockResolvedValue({ data: { data: [{ id: 'em_ws' }] }, error: null });
    stub.createContact.mockResolvedValueOnce({
      data: null,
      error: { name: 'already_exists', message: 'Contact already exists', statusCode: 409 },
    });
    stub.addSegment.mockResolvedValueOnce({
      data: null,
      error: { name: 'resource_locked', message: 'Segment locked', statusCode: 409 },
    });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: stub.client,
    });

    await client.sendBatchNotification([
      {
        to: 'fan@example.com',
        subject: 'Drop',
        html: '<p>HTML fallback test</p>',
        text: '   \n  ',
        unsubscribeUrl: 'https://makerverse.sunshade.icu/api/unsubscribe?token=t1',
      },
    ]);
    expect('text' in stub.sendBatch.mock.calls[0][0][0]).toBe(false);

    await expect(
      client.addAudienceContact({
        email: 'locked@example.com',
        segmentIds: ['seg_1'],
      })
    ).rejects.toThrow(EmailDispatchError);
  });
});
