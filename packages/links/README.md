# @digitalcanopy/links

Universal TypeScript linking client and React hooks for the SunShade Systems ecosystem (`cozy`, `patchwork-web`, `valerie`, `sunshade-hub`).

Provides lightweight URL shortening, privacy surveillance parameter stripping, real-time 4-pillar Link Trust Score auditing, and telemetry hooks with minimal bundle footprint.

## Features

- **2-Line URL Shortening**: Easily generate tracked shortlinks with channel-based routing (`bsky`, `linkedin`, `x`, `direct`, `qr`).
- **Privacy Parameter Sanitization**: Purges invasive surveillance parameters (`fbclid`, `gclid`, `msclkid`, `ttclid`, etc.) while retaining clean UTM and attribution parameters.
- **4-Pillar Trust Score Engine**: Evaluates Provenance (DID verification), Target Hygiene (SSL, redirect chains), Privacy Footprint, and Network Corroboration.
- **React Hooks & SafeAnchor**: `useTrackedLink` hook and `<SafeAnchor>` component that automatically renders a miniature Trust Badge next to external links.
- **Zero External Dependencies**: Beyond browser/Node `fetch` and optional `react` peer dependency.
- **Ultra-Lightweight**: Under 15KB bundle footprint.

## Installation

```bash
npm install @digitalcanopy/links
```

## Quick Start

### 1. Shorten a URL

```typescript
import { shortenUrl } from '@digitalcanopy/links';

const link = await shortenUrl({
  destination: 'https://example.com/article?fbclid=xyz&utm_source=twitter',
  channel: 'bsky',
  campaign: 'fall-launch',
});

console.log(link.shortUrl);
// => "https://links.sunshade.icu/xyz/bsky"
```

### 2. Resolve Link Trust Score

```typescript
import { resolveTrustScore } from '@digitalcanopy/links';

const report = await resolveTrustScore('https://example.com/target');

console.log(`Trust Score: ${report.score}/100 (${report.status})`);
console.log(report.pillars);
// => { provenance: 35, hygiene: 25, privacy: 20, networkDecay: 20 }
```

### 3. Sanitize URL directly

```typescript
import { sanitizeUrl } from '@digitalcanopy/links';

const cleanUrl = sanitizeUrl('https://site.com/?fbclid=123&utm_source=newsletter');
// => "https://site.com/?utm_source=newsletter"
```

### 4. React Integration

```tsx
import { SafeAnchor, useTrackedLink } from '@digitalcanopy/links';

// Component that automatically shortens and renders a miniature Trust Badge
export function CommunityLink() {
  return (
    <SafeAnchor
      href="https://sunshade.icu/manifesto"
      telemetry={true}
      channel="bsky"
      trustScore={98}
    >
      Read the SunShade Manifesto
    </SafeAnchor>
  );
}

// Low-level hook for custom link rendering
export function CustomTrackedLink({ url }: { url: string }) {
  const { href, isLoading, isShortened } = useTrackedLink(url, {
    channel: 'direct',
    enabled: true,
  });

  return (
    <a href={href}>
      {isLoading ? 'Preparing link...' : 'Open Link'}
    </a>
  );
}
```

## Client Configuration

```typescript
import { LinksClient } from '@digitalcanopy/links';

const client = new LinksClient({
  baseUrl: 'https://links.sunshade.icu',
  apiKey: process.env.SUNSHADE_API_KEY,
  tenantId: 'pym-energy',
  enableFallback: true, // Gracefully falls back to raw sanitized URL if network is unreachable
});
```

## License

MIT © SunShade Systems
