/**
 * @digitalcanopy/email
 * Shared SunShade email client wrapping Resend with subdomain reputation
 * firewalls, mandatory app_id/channel tagging, and 100-message batch chunking.
 */

export { createEmailClient, RESEND_BATCH_MAX_SIZE } from './client';

export {
  DEFAULT_ALLOWED_ALERT_SUBDOMAINS,
  EmailConfigError,
  EmailDispatchError,
  EmailValidationError,
  SubdomainFirewallError,
  hasSubdomainPrefix,
  isRootApexDomain,
  parseSenderAddress,
  resolveAlertSender,
  validateEmailAddress,
} from './domain';
export type { ParsedSender, ResolveAlertSenderOptions } from './domain';

export type {
  AddAudienceContactParams,
  AddAudienceContactResult,
  BatchNotificationChunkResult,
  BatchNotificationMessage,
  EmailChannel,
  EmailClient,
  EmailClientConfig,
  EmailLogger,
  EmailTag,
  EmailTagsInput,
  ResendLike,
  SendBatchNotificationResult,
  SendTransactionalParams,
  SendTransactionalResult,
  SunshadeAppId,
} from './types';
