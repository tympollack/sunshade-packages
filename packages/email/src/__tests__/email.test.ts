import { describe, expect, it, vi } from 'vitest';
import {
  EmailConfigError,
  EmailDispatchError,
  EmailValidationError,
  RESEND_BATCH_MAX_SIZE,
  SubdomainFirewallError,
  createEmailClient,
  isRootApexDomain,
  parseSenderAddress,
  resolveAlertSender,
  type EmailLogger,
  type ResendLike,
} from '../index';

function createMockResend(): {
  client: ResendLike;
  sendEmail: ReturnType<typeof vi.fn>;
  sendBatch: ReturnType<typeof vi.fn>;
  createContact: ReturnType<typeof vi.fn>;
} {
  const sendEmail = vi.fn().mockResolvedValue({ data: { id: 'em_tx_123' }, error: null });
  const sendBatch = vi.fn().mockImplementation(async (batch: unknown[]) => ({
    data: {
      data: batch.map((_, idx) => ({ id: `em_batch_${idx}` })),
    },
    error: null,
  }));
  const createContact = vi.fn().mockResolvedValue({
    data: { object: 'contact', id: 'ct_123' },
    error: null,
  });

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

function createMockLogger(): EmailLogger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('@digitalcanopy/email domain & sender helpers', () => {
  it('parses display-name and bare email senders', () => {
    expect(parseSenderAddress('Makerverse Drops <drops@mail.madeintheshade.wtf>')).toEqual({
      raw: 'Makerverse Drops <drops@mail.madeintheshade.wtf>',
      displayName: 'Makerverse Drops',
      email: 'drops@mail.madeintheshade.wtf',
      localPart: 'drops',
      domain: 'mail.madeintheshade.wtf',
    });

    expect(parseSenderAddress('auth@sunshade.icu')).toEqual({
      raw: 'auth@sunshade.icu',
      displayName: undefined,
      email: 'auth@sunshade.icu',
      localPart: 'auth',
      domain: 'sunshade.icu',
    });
  });

  it('detects root apex domains vs dedicated subdomains', () => {
    expect(isRootApexDomain('sunshade.icu')).toBe(true);
    expect(isRootApexDomain('madeintheshade.wtf')).toBe(true);
    expect(isRootApexDomain('example.co.uk')).toBe(true);

    expect(isRootApexDomain('mail.madeintheshade.wtf')).toBe(false);
    expect(isRootApexDomain('drops.sunshade.icu')).toBe(false);
    expect(isRootApexDomain('mail.example.co.uk')).toBe(false);
  });

  it('enforces subdomain firewall in resolveAlertSender', () => {
    expect(() =>
      resolveAlertSender({
        defaultFrom: 'Makerverse <noreply@madeintheshade.wtf>',
      })
    ).toThrow(SubdomainFirewallError);

    expect(
      resolveAlertSender({
        defaultFrom: 'Makerverse <auth@madeintheshade.wtf>',
        alertsFrom: 'Makerverse Drops <drops@mail.madeintheshade.wtf>',
      })
    ).toBe('Makerverse Drops <drops@mail.madeintheshade.wtf>');

    expect(() =>
      resolveAlertSender({
        defaultFrom: 'Makerverse <auth@madeintheshade.wtf>',
        alertsFrom: 'Makerverse Drops <drops@mail.madeintheshade.wtf>',
        messageFrom: 'Makerverse <auth@madeintheshade.wtf>',
      })
    ).toThrow(SubdomainFirewallError);

    expect(() =>
      resolveAlertSender({
        defaultFrom: 'Makerverse <auth@madeintheshade.wtf>',
        alertsFrom: 'Makerverse Drops <drops@mail.madeintheshade.wtf>',
        messageFrom: 'Makerverse <promo@app.madeintheshade.wtf>',
      })
    ).toThrow(SubdomainFirewallError);
  });
});

describe('createEmailClient validation', () => {
  it('validates required configuration fields', () => {
    expect(() =>
      createEmailClient({
        apiKey: '',
        appId: 'makerverse',
        defaultFrom: 'auth@madeintheshade.wtf',
      })
    ).toThrow(EmailConfigError);

    expect(() =>
      createEmailClient({
        apiKey: 're_test',
        appId: 'unknown' as 'makerverse',
        defaultFrom: 'auth@madeintheshade.wtf',
      })
    ).toThrow(EmailConfigError);

    expect(() =>
      createEmailClient({
        apiKey: 're_test',
        appId: 'hub',
        defaultFrom: 'not-an-email',
      })
    ).toThrow(EmailValidationError);
  });
});

describe('sendTransactional', () => {
  it('dispatches transactional emails with app_id and channel tags even on apex domains', async () => {
    const mock = createMockResend();
    const logger = createMockLogger();

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'hub',
      defaultFrom: 'SunShade Systems <auth@sunshade.icu>',
      resendClient: mock.client,
      logger,
    });

    const result = await client.sendTransactional({
      to: 'Citizen@SunShade.icu',
      subject: 'Your SSO Sign-In Link',
      html: '<p>Click to verify</p>',
      text: 'Click to verify',
      replyTo: 'support@sunshade.icu',
      tags: {
        app_id: 'spoofed',
        channel: 'alerts',
        flow: 'magic-link',
      },
    });

    expect(result).toEqual({
      id: 'em_tx_123',
      appId: 'hub',
      channel: 'transactional',
      from: 'SunShade Systems <auth@sunshade.icu>',
      to: ['citizen@sunshade.icu'],
      dryRun: false,
    });

    expect(mock.sendEmail).toHaveBeenCalledTimes(1);
    const payload = mock.sendEmail.mock.calls[0][0];
    expect(payload.from).toBe('SunShade Systems <auth@sunshade.icu>');
    expect(payload.to).toEqual(['citizen@sunshade.icu']);
    expect(payload.tags).toEqual([
      { name: 'app_id', value: 'hub' },
      { name: 'channel', value: 'transactional' },
      { name: 'flow', value: 'magic-link' },
    ]);
  });

  it('rejects empty content or subject and surfaces Resend errors as EmailDispatchError', async () => {
    const mock = createMockResend();
    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'receipts@madeintheshade.wtf',
      resendClient: mock.client,
      initialRetryDelayMs: 0,
    });

    await expect(
      client.sendTransactional({
        to: 'buyer@example.com',
        subject: 'Receipt',
      })
    ).rejects.toThrow(EmailValidationError);

    mock.sendEmail.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid domain', statusCode: 422 },
    });

    await expect(
      client.sendTransactional({
        to: 'buyer@example.com',
        subject: 'Receipt',
        text: 'Order #123',
      })
    ).rejects.toThrow(EmailDispatchError);
  });
});

describe('sendBatchNotification', () => {
  it('returns empty summary when given zero messages', async () => {
    const mock = createMockResend();
    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'Makerverse <auth@madeintheshade.wtf>',
      alertsFrom: 'Makerverse Drops <drops@mail.madeintheshade.wtf>',
      resendClient: mock.client,
    });

    const result = await client.sendBatchNotification([]);
    expect(result).toEqual({
      totalSent: 0,
      batchCount: 0,
      appId: 'makerverse',
      channel: 'alerts',
      ids: [],
      batches: [],
      dryRun: false,
    });
    expect(mock.sendBatch).not.toHaveBeenCalled();
  });

  it('chunks arrays into batches of 100 and injects app_id, channel, and RFC 8058 headers', async () => {
    const mock = createMockResend();
    const logger = createMockLogger();

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'Makerverse <auth@madeintheshade.wtf>',
      alertsFrom: 'Makerverse Drops <drops@mail.madeintheshade.wtf>',
      resendClient: mock.client,
      logger,
    });

    const messages = Array.from({ length: 250 }, (_, idx) => ({
      to: `collector${idx}@example.com`,
      subject: `Drop #${idx} is LIVE`,
      html: `<p>Drop ${idx}</p>`,
      unsubscribeUrl: `https://makerverse.sunshade.icu/api/unsubscribe?token=tok-${idx}`,
      tags: [{ name: 'batch_id', value: 'batch-001' }],
    }));

    const result = await client.sendBatchNotification(messages);

    expect(RESEND_BATCH_MAX_SIZE).toBe(100);
    expect(result.totalSent).toBe(250);
    expect(result.batchCount).toBe(3);
    expect(result.ids).toHaveLength(250);
    expect(result.batches.map((b) => b.size)).toEqual([100, 100, 50]);

    expect(mock.sendBatch).toHaveBeenCalledTimes(3);
    expect(mock.sendBatch.mock.calls[0][0]).toHaveLength(100);
    expect(mock.sendBatch.mock.calls[1][0]).toHaveLength(100);
    expect(mock.sendBatch.mock.calls[2][0]).toHaveLength(50);

    const firstSent = mock.sendBatch.mock.calls[0][0][0];
    expect(firstSent.from).toBe('Makerverse Drops <drops@mail.madeintheshade.wtf>');
    expect(firstSent.tags).toEqual([
      { name: 'app_id', value: 'makerverse' },
      { name: 'channel', value: 'alerts' },
      { name: 'batch_id', value: 'batch-001' },
    ]);
    expect(firstSent.headers).toEqual({
      'List-Unsubscribe': '<https://makerverse.sunshade.icu/api/unsubscribe?token=tok-0>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('blocks batch blasts from root apex domains before sending any chunk', async () => {
    const mock = createMockResend();
    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'valerie',
      defaultFrom: 'The Votary <digest@votary.app>',
      resendClient: mock.client,
    });

    await expect(
      client.sendBatchNotification([
        {
          to: 'voter@example.com',
          subject: 'Weekly Digest',
          html: '<p>Digest</p>',
          unsubscribeUrl: 'https://votary.app/unsubscribe?token=abc',
        },
      ])
    ).rejects.toThrow(SubdomainFirewallError);

    expect(mock.sendBatch).not.toHaveBeenCalled();
  });

  it('rejects unsafe unsubscribe URLs', async () => {
    const mock = createMockResend();
    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'cozy',
      defaultFrom: 'Cozy <alerts@drops.sunshade.icu>',
      resendClient: mock.client,
    });

    await expect(
      client.sendBatchNotification([
        {
          to: 'user@example.com',
          subject: 'Update',
          text: 'Hello',
          unsubscribeUrl: 'javascript:alert(1)',
        },
      ])
    ).rejects.toThrow(EmailValidationError);
  });

  it('retries rate-limited batch sends with exponential backoff', async () => {
    const mock = createMockResend();
    mock.sendBatch
      .mockResolvedValueOnce({
        data: null,
        error: { name: 'rate_limit_exceeded', message: 'Rate limit reached', statusCode: 429 },
      })
      .mockResolvedValueOnce({
        data: { data: [{ id: 'em_retry_1' }] },
        error: null,
      });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'madeintheshade',
      defaultFrom: 'Made in the Shade <drops@mail.madeintheshade.wtf>',
      resendClient: mock.client,
      maxRetries: 3,
      initialRetryDelayMs: 0,
    });

    const res = await client.sendBatchNotification([
      {
        to: 'fan@example.com',
        subject: 'Fresh Drop',
        text: 'Now live!',
        unsubscribeUrl: 'https://madeintheshade.wtf/unsubscribe?t=1',
      },
    ]);

    expect(mock.sendBatch).toHaveBeenCalledTimes(2);
    expect(res.ids).toEqual(['em_retry_1']);
  });
});

describe('addAudienceContact', () => {
  it('creates a contact with normalized metadata properties', async () => {
    const mock = createMockResend();
    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: mock.client,
    });

    const res = await client.addAudienceContact({
      audienceId: 'aud_123',
      email: 'Collector@Example.COM',
      firstName: 'Ada',
      metadata: {
        brand: 'get-bent',
        vip: true,
        tier: 2,
      },
    });

    expect(res).toEqual({
      id: 'ct_123',
      audienceId: 'aud_123',
      email: 'collector@example.com',
      created: true,
      alreadyExists: false,
      dryRun: false,
    });

    expect(mock.createContact).toHaveBeenCalledWith({
      audienceId: 'aud_123',
      email: 'collector@example.com',
      firstName: 'Ada',
      properties: {
        brand: 'get-bent',
        vip: 'true',
        tier: 2,
      },
    });
  });

  it('handles duplicate/existing contact errors idempotently', async () => {
    const mock = createMockResend();
    mock.createContact.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Contact already exists in audience', statusCode: 409 },
    });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: mock.client,
    });

    const res = await client.addAudienceContact({
      audienceId: 'aud_123',
      email: 'collector@example.com',
    });

    expect(res).toEqual({
      audienceId: 'aud_123',
      email: 'collector@example.com',
      created: false,
      alreadyExists: true,
      dryRun: false,
    });
  });

  it('throws EmailDispatchError on unexpected contact API failures', async () => {
    const mock = createMockResend();
    mock.createContact.mockResolvedValueOnce({
      data: null,
      error: { name: 'application_error', message: 'Internal Resend failure', statusCode: 500 },
    });

    const client = createEmailClient({
      apiKey: 're_test',
      appId: 'makerverse',
      defaultFrom: 'drops@mail.madeintheshade.wtf',
      resendClient: mock.client,
      initialRetryDelayMs: 0,
    });

    await expect(
      client.addAudienceContact({
        audienceId: 'aud_123',
        email: 'collector@example.com',
      })
    ).rejects.toThrow(EmailDispatchError);
  });
});

describe('dryRun mode', () => {
  it('formats transactional, batch, and contact calls without requiring an API key', async () => {
    const logger = createMockLogger();
    const client = createEmailClient({
      apiKey: '',
      appId: 'makerverse',
      defaultFrom: 'Makerverse <auth@madeintheshade.wtf>',
      alertsFrom: 'Makerverse Drops <drops@mail.madeintheshade.wtf>',
      dryRun: true,
      logger,
    });

    const tx = await client.sendTransactional({
      to: 'buyer@example.com',
      subject: 'Order Confirmed',
      text: 'Thanks!',
    });
    expect(tx.dryRun).toBe(true);
    expect(tx.id).toMatch(/^dry_tx_/);

    const batch = await client.sendBatchNotification([
      {
        to: 'follower@example.com',
        subject: 'Drop Live',
        html: '<p>Live</p>',
        unsubscribeUrl: 'https://makerverse.sunshade.icu/api/unsubscribe?token=1',
      },
    ]);
    expect(batch.dryRun).toBe(true);
    expect(batch.totalSent).toBe(1);

    const contact = await client.addAudienceContact({
      audienceId: 'aud_1',
      email: 'follower@example.com',
    });
    expect(contact.dryRun).toBe(true);
    expect(contact.created).toBe(true);
    expect(logger.info).toHaveBeenCalledTimes(3);
  });
});
