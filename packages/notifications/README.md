# @digitalcanopy/notifications

Universal notification triage state machine, AI digest contracts, and a collapsible `NotificationDigestCard`.

- `@digitalcanopy/notifications` – headless types, `triageReducer`, `buildDigestRollup`, `notificationKey`, `isSafeActionUrl` (no React required).
- `@digitalcanopy/notifications/react` – `useNotificationDigest` and `NotificationDigestCard` (requires `react`).

Notifications are identified by the composite key `source:id` (`notificationKey()`); `markRead`/`dismiss` take that key. Dismissed keys stay dismissed when re-ingested. Action URLs are rendered only if `isSafeActionUrl` allows them (http, https, mailto, relative).

## Tailwind

`NotificationDigestCard` uses Tailwind utility classes and ships no CSS. Add the package to your Tailwind `content` globs, e.g.:

```js
content: ['./src/**/*.{ts,tsx}', './node_modules/@digitalcanopy/notifications/dist/**/*.{js,mjs}']
```
