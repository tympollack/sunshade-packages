# @digitalcanopy/email

## 0.1.2

### Patch Changes

- c929699: Harden segment enrollment for existing contacts, opt-out propagation, RFC 6068 mailto escaping, idempotency key length bounds, single-retry budgeting, Retry-After handling, and whitespace plain-text fallback.

## 0.1.1

### Patch Changes

- Manual patch release for @digitalcanopy/email

## 0.1.0

### Minor Changes

- Initial release of `@digitalcanopy/email` with `createEmailClient`, `sendTransactional`, `sendBatchNotification` (100-message chunking + RFC 8058 `List-Unsubscribe`), `addAudienceContact`, mandatory `app_id` / `channel` tagging, and subdomain reputation firewall validation.
