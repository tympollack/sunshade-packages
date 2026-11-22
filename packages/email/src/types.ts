import type {
  CreateBatchEmailOptions,
  CreateBatchRequestOptions,
  CreateBatchResponse,
  CreateContactOptions,
  CreateContactRequestOptions,
  CreateContactResponse,
  CreateEmailOptions,
  CreateEmailRequestOptions,
  CreateEmailResponse,
  LegacyCreateContactOptions,
} from 'resend';

/**
 * Supported SunShade ecosystem application identifiers for mandatory Resend tagging.
 */
export type SunshadeAppId =
  | 'makerverse'
  | 'hub'
  | 'valerie'
  | 'cozy'
  | 'madeintheshade';

/**
 * Outbound delivery channel tag enforced across all @digitalcanopy/email sends.
 */
export type EmailChannel = 'transactional' | 'alerts';

/**
 * Key-value tag compatible with Resend's email tagging contract.
 */
export interface EmailTag {
  name: string;
  value: string;
}

/**
 * Tag input accepted by helper methods (either Resend array format or plain map).
 */
export type EmailTagsInput = EmailTag[] | Record<string, string>;

/**
 * Minimal structured logger interface compatible with console or @digitalcanopy/logging.
 */
export interface EmailLogger {
  debug?(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Structural Resend SDK interface enabling clean dependency injection in tests.
 */
export interface ResendLike {
  emails: {
    send(
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions
    ): Promise<CreateEmailResponse>;
  };
  batch: {
    send(
      payload: CreateBatchEmailOptions[],
      options?: CreateBatchRequestOptions
    ): Promise<CreateBatchResponse<CreateBatchRequestOptions>>;
  };
  contacts: {
    create(
      payload: CreateContactOptions | LegacyCreateContactOptions,
      options?: CreateContactRequestOptions
    ): Promise<CreateContactResponse>;
  };
}

/**
 * Configuration passed to `createEmailClient`.
 */
export interface EmailClientConfig {
  /**
   * Resend API key. Required unless `resendClient` or `dryRun: true` is provided.
   */
  apiKey: string;
  /**
   * Mandatory SunShade app identifier automatically attached as `app_id` tag.
   */
  appId: SunshadeAppId;
  /**
   * Default sender address (e.g. `"Makerverse <auth@madeintheshade.wtf>"`).
   */
  defaultFrom: string;
  /**
   * Optional dedicated sender address for marketing/drop alert batches
   * (e.g. `"Makerverse Drops <drops@mail.madeintheshade.wtf>"`).
   */
  alertsFrom?: string;
  /**
   * Subdomain prefixes permitted for alert/marketing blasts.
   * Defaults to `['mail.', 'drops.']`.
   */
  allowedAlertSubdomains?: readonly string[];
  /**
   * When true, skips live Resend network calls if `resendClient` is not provided
   * and returns deterministic mock IDs while emitting structured logs.
   */
  dryRun?: boolean;
  /**
   * Optional structured logger instance.
   */
  logger?: EmailLogger;
  /**
   * Optional pre-built Resend-compatible client (useful for unit tests).
   */
  resendClient?: ResendLike;
  /**
   * Maximum retry attempts on rate-limit responses (HTTP 429). Defaults to 3.
   */
  maxRetries?: number;
  /**
   * Initial exponential backoff delay in milliseconds on rate limits. Defaults to 500.
   */
  initialRetryDelayMs?: number;
}

/**
 * Parameters for sending a single high-priority transactional email.
 */
export interface SendTransactionalParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
  tags?: EmailTagsInput;
  idempotencyKey?: string;
}

/**
 * Result returned after dispatching a single transactional email.
 */
export interface SendTransactionalResult {
  id: string;
  appId: SunshadeAppId;
  channel: 'transactional';
  from: string;
  to: string[];
  dryRun: boolean;
}

/**
 * Single alert/notification message accepted by `sendBatchNotification`.
 */
export interface BatchNotificationMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  headers?: Record<string, string>;
  tags?: EmailTagsInput;
  /**
   * One-click HTTP(S) unsubscribe endpoint used to populate RFC 8058 headers.
   */
  unsubscribeUrl?: string;
  /**
   * Optional mailto unsubscribe address included alongside `unsubscribeUrl`.
   */
  unsubscribeMailto?: string;
}

/**
 * Result metadata for an individual chunk sent via `resend.batch.send()`.
 */
export interface BatchNotificationChunkResult {
  chunkIndex: number;
  size: number;
  ids: string[];
}

/**
 * Aggregated result returned by `sendBatchNotification`.
 */
export interface SendBatchNotificationResult {
  totalSent: number;
  batchCount: number;
  appId: SunshadeAppId;
  channel: 'alerts';
  ids: string[];
  batches: BatchNotificationChunkResult[];
  dryRun: boolean;
}

/**
 * Parameters for idempotently adding a contact to a Resend audience.
 */
export interface AddAudienceContactParams {
  audienceId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  unsubscribed?: boolean;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Result returned by `addAudienceContact`.
 */
export interface AddAudienceContactResult {
  id?: string;
  audienceId: string;
  email: string;
  created: boolean;
  alreadyExists: boolean;
  dryRun: boolean;
}

/**
 * Public email client interface returned by `createEmailClient`.
 */
export interface EmailClient {
  readonly appId: SunshadeAppId;
  readonly defaultFrom: string;
  readonly alertsFrom?: string;
  sendTransactional(params: SendTransactionalParams): Promise<SendTransactionalResult>;
  sendBatchNotification(
    messages: readonly BatchNotificationMessage[]
  ): Promise<SendBatchNotificationResult>;
  addAudienceContact(params: AddAudienceContactParams): Promise<AddAudienceContactResult>;
}
