# @digitalcanopy/email

Shared SunShade ecosystem email client wrapping the Resend SDK with:

- **Subdomain Reputation Firewalls**: Prevents marketing and drop alert blasts from sending off root apex domains when a dedicated `mail.` or `drops.` subdomain is configured.
- **Mandatory Telemetry Tagging**: Automatically injects `app_id` and `channel` (`transactional` | `alerts`) tags on every outbound message.
- **Automatic Batch Chunking**: Splits `sendBatchNotification()` arrays into 100-message chunks for `resend.batch.send()`, with exponential backoff retry on HTTP 429 rate limits.
- **RFC 8058 One-Click Unsubscribe**: Populates `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers from `unsubscribeUrl` / `unsubscribeMailto`.
- **Idempotent Audience Sync**: Wraps `resend.contacts.create()` via `addAudienceContact()` with safe handling for existing contacts.

## Usage

```ts
import { createEmailClient } from '@digitalcanopy/email';

const email = createEmailClient({
  apiKey: process.env.RESEND_API_KEY!,
  appId: 'makerverse',
  defaultFrom: 'Makerverse <auth@madeintheshade.wtf>',
  alertsFrom: 'Makerverse Drops <drops@mail.madeintheshade.wtf>',
});

// High-priority single email (tagged channel: 'transactional')
await email.sendTransactional({
  to: 'collector@example.com',
  subject: 'Your order is confirmed',
  html: '<p>Order confirmed.</p>',
});

// Batch alerts (auto-chunked at 100/batch, routed via alertsFrom, tagged channel: 'alerts')
await email.sendBatchNotification([
  {
    to: 'follower@example.com',
    subject: 'GET BENT Batch 002 is LIVE',
    html: '<p>Drop is live now.</p>',
    unsubscribeUrl: 'https://makerverse.sunshade.icu/api/unsubscribe?token=...',
  },
]);
```
