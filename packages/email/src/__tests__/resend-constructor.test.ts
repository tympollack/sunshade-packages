import { describe, expect, it, vi } from 'vitest';

const { mockSend, mockBatchSend, mockContactCreate, mockResendCtor } = vi.hoisted(() => {
  const send = vi.fn().mockResolvedValue({ data: { id: 'em_sdk_1' }, error: null });
  const batchSend = vi.fn().mockResolvedValue({
    data: { data: [{ id: 'em_sdk_batch_1' }] },
    error: null,
  });
  const contactCreate = vi.fn().mockResolvedValue({
    data: { object: 'contact', id: 'ct_sdk_1' },
    error: null,
  });
  const ctor = vi.fn().mockImplementation(function MockResend(this: Record<string, unknown>, apiKey?: string) {
    this.key = apiKey;
    this.emails = { send };
    this.batch = { send: batchSend };
    this.contacts = { create: contactCreate };
  });

  return {
    mockSend: send,
    mockBatchSend: batchSend,
    mockContactCreate: contactCreate,
    mockResendCtor: ctor,
  };
});

vi.mock('resend', () => ({
  Resend: mockResendCtor,
}));

import { createEmailClient } from '../index';

describe('Resend SDK constructor integration', () => {
  it('instantiates Resend with apiKey and delegates sendTransactional, sendBatchNotification, and addAudienceContact', async () => {
    const client = createEmailClient({
      apiKey: 're_live_mock_key',
      appId: 'makerverse',
      defaultFrom: 'Makerverse <auth@madeintheshade.wtf>',
      alertsFrom: 'Makerverse Drops <drops@mail.madeintheshade.wtf>',
    });

    expect(mockResendCtor).toHaveBeenCalledWith('re_live_mock_key');

    const tx = await client.sendTransactional({
      to: 'buyer@example.com',
      subject: 'Auction Win',
      html: '<p>You won #001</p>',
    });
    expect(tx.id).toBe('em_sdk_1');
    expect(mockSend).toHaveBeenCalledTimes(1);

    const batch = await client.sendBatchNotification([
      {
        to: 'follower@example.com',
        subject: 'Drop Live',
        html: '<p>Go!</p>',
        unsubscribeUrl: 'https://makerverse.sunshade.icu/api/unsubscribe?token=xyz',
      },
    ]);
    expect(batch.ids).toEqual(['em_sdk_batch_1']);
    expect(mockBatchSend).toHaveBeenCalledTimes(1);

    const contact = await client.addAudienceContact({
      audienceId: 'aud_sdk',
      email: 'follower@example.com',
    });
    expect(contact.id).toBe('ct_sdk_1');
    expect(mockContactCreate).toHaveBeenCalledTimes(1);
  });
});
