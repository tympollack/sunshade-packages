import { Resend, type CreateBatchEmailOptions, type CreateEmailOptions } from 'resend';
import {
  DEFAULT_ALLOWED_ALERT_SUBDOMAINS,
  EmailConfigError,
  EmailDispatchError,
  EmailValidationError,
  parseSenderAddress,
  resolveAlertSender,
  validateEmailAddress,
} from './domain';
import {
  assertMessageContent,
  buildRenderOptions,
  buildRfc8058Headers,
  createDefaultLogger,
  extractErrorMessage,
  extractStatusCode,
  isContactAlreadyExistsError,
  normalizeContactProperties,
  normalizeRecipients,
  normalizeTags,
  withRateLimitRetry,
} from './helpers';
import type {
  AddAudienceContactParams,
  AddAudienceContactResult,
  BatchNotificationChunkResult,
  BatchNotificationMessage,
  EmailClient,
  EmailClientConfig,
  ResendLike,
  SendBatchNotificationResult,
  SendTransactionalParams,
  SendTransactionalResult,
  SunshadeAppId,
} from './types';

export const RESEND_BATCH_MAX_SIZE = 100;

const VALID_APP_IDS = new Set<SunshadeAppId>([
  'makerverse',
  'hub',
  'valerie',
  'cozy',
  'madeintheshade',
]);

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 500;

/**
 * Creates a standardized SunShade email client wrapping Resend with subdomain
 * reputation isolation, mandatory `app_id` / `channel` tagging, and automatic
 * 100-message batch chunking.
 */
export function createEmailClient(config: EmailClientConfig): EmailClient {
  if (!config || typeof config !== 'object') {
    throw new EmailConfigError('createEmailClient requires a configuration object.');
  }

  if (!VALID_APP_IDS.has(config.appId)) {
    throw new EmailConfigError(
      `Invalid appId "${String(config.appId)}". Expected one of: ${Array.from(VALID_APP_IDS).join(', ')}.`
    );
  }

  parseSenderAddress(config.defaultFrom);
  if (config.alertsFrom) {
    parseSenderAddress(config.alertsFrom);
  }

  const dryRun = Boolean(config.dryRun);
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';

  if (!config.resendClient && !dryRun && !apiKey) {
    throw new EmailConfigError(
      'Resend apiKey is required unless resendClient or dryRun: true is provided.'
    );
  }

  const allowedAlertSubdomains =
    config.allowedAlertSubdomains ?? DEFAULT_ALLOWED_ALERT_SUBDOMAINS;
  const maxRetries = Math.max(1, config.maxRetries ?? DEFAULT_MAX_RETRIES);
  const initialRetryDelayMs = Math.max(0, config.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS);
  const logger = config.logger ?? createDefaultLogger(config.appId);
  const resend: ResendLike | null =
    config.resendClient ?? (apiKey && !dryRun ? (new Resend(apiKey) as unknown as ResendLike) : null);

  return {
    appId: config.appId,
    defaultFrom: config.defaultFrom,
    alertsFrom: config.alertsFrom,

    async sendTransactional(params: SendTransactionalParams): Promise<SendTransactionalResult> {
      const from = (params.from ?? config.defaultFrom).trim();
      parseSenderAddress(from);
      const to = normalizeRecipients(params.to);
      assertMessageContent(params.subject, params.html, params.text);
      const tags = normalizeTags(params.tags, config.appId, 'transactional');

      if (!resend) {
        const dryId = `dry_tx_${Date.now().toString(36)}`;
        logger.info('Dry-run transactional email formatted', {
          id: dryId,
          channel: 'transactional',
          recipientCount: to.length,
        });
        return { id: dryId, appId: config.appId, channel: 'transactional', from, to, dryRun: true };
      }

      const payload: CreateEmailOptions = {
        from,
        to,
        subject: params.subject.trim(),
        ...buildRenderOptions(params.html, params.text),
        ...(params.replyTo ? { replyTo: params.replyTo } : {}),
        ...(params.cc ? { cc: params.cc } : {}),
        ...(params.bcc ? { bcc: params.bcc } : {}),
        ...(params.headers ? { headers: params.headers } : {}),
        tags,
      };

      const requestOptions = params.idempotencyKey
        ? { idempotencyKey: params.idempotencyKey }
        : undefined;

      try {
        const response = await withRateLimitRetry(
          async () => {
            const res = await resend.emails.send(payload, requestOptions);
            if (res.error) throw res.error;
            return res;
          },
          maxRetries,
          initialRetryDelayMs
        );

        const id = response.data?.id ?? '';
        logger.info('Transactional email dispatched', {
          id,
          channel: 'transactional',
          recipientCount: to.length,
        });

        return { id, appId: config.appId, channel: 'transactional', from, to, dryRun: false };
      } catch (err) {
        const message = extractErrorMessage(err, 'Failed to send transactional email.');
        logger.error('Transactional email dispatch failed', {
          channel: 'transactional',
          error: message,
        });
        throw new EmailDispatchError(message, {
          statusCode: extractStatusCode(err),
          cause: err,
        });
      }
    },

    async sendBatchNotification(
      messages: readonly BatchNotificationMessage[]
    ): Promise<SendBatchNotificationResult> {
      if (!Array.isArray(messages)) {
        throw new EmailValidationError('sendBatchNotification requires an array of messages.');
      }

      if (messages.length === 0) {
        return {
          totalSent: 0,
          batchCount: 0,
          appId: config.appId,
          channel: 'alerts',
          ids: [],
          batches: [],
          dryRun: !resend,
        };
      }

      const compiledMessages: CreateBatchEmailOptions[] = messages.map((msg, idx) => {
        const resolvedFrom = resolveAlertSender({
          messageFrom: msg.from,
          alertsFrom: config.alertsFrom,
          defaultFrom: config.defaultFrom,
          allowedAlertSubdomains,
        });

        const to = normalizeRecipients(msg.to);
        assertMessageContent(msg.subject, msg.html, msg.text);
        const headers = buildRfc8058Headers(msg);
        if (!headers?.['List-Unsubscribe']) {
          logger.warn('Batch notification message missing List-Unsubscribe header', {
            messageIndex: idx,
            channel: 'alerts',
          });
        }

        const tags = normalizeTags(msg.tags, config.appId, 'alerts');

        return {
          from: resolvedFrom,
          to,
          subject: msg.subject.trim(),
          ...buildRenderOptions(msg.html, msg.text),
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          ...(headers ? { headers } : {}),
          tags,
        };
      });

      const chunks: CreateBatchEmailOptions[][] = [];
      for (let i = 0; i < compiledMessages.length; i += RESEND_BATCH_MAX_SIZE) {
        chunks.push(compiledMessages.slice(i, i + RESEND_BATCH_MAX_SIZE));
      }

      const allIds: string[] = [];
      const batchResults: BatchNotificationChunkResult[] = [];

      if (!resend) {
        chunks.forEach((chunk, chunkIndex) => {
          const ids = chunk.map((_, idx) => `dry_batch_${chunkIndex}_${idx}`);
          allIds.push(...ids);
          batchResults.push({ chunkIndex, size: chunk.length, ids });
        });
        logger.info('Dry-run batch notifications formatted', {
          totalSent: compiledMessages.length,
          batchCount: chunks.length,
          channel: 'alerts',
        });
        return {
          totalSent: compiledMessages.length,
          batchCount: chunks.length,
          appId: config.appId,
          channel: 'alerts',
          ids: allIds,
          batches: batchResults,
          dryRun: true,
        };
      }

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        try {
          const response = await withRateLimitRetry(
            async () => {
              const res = await resend.batch.send(chunk);
              if (res.error) throw res.error;
              return res;
            },
            maxRetries,
            initialRetryDelayMs
          );

          const chunkIds = (response.data?.data ?? []).map((entry) => entry.id);
          allIds.push(...chunkIds);
          batchResults.push({ chunkIndex, size: chunk.length, ids: chunkIds });
        } catch (err) {
          const message = extractErrorMessage(err, `Resend batch chunk ${chunkIndex} failed.`);
          logger.error('Batch notification dispatch failed', {
            channel: 'alerts',
            chunkIndex,
            chunkSize: chunk.length,
            error: message,
          });
          throw new EmailDispatchError(message, {
            statusCode: extractStatusCode(err),
            cause: err,
          });
        }
      }

      logger.info('Batch notifications dispatched', {
        totalSent: compiledMessages.length,
        batchCount: chunks.length,
        channel: 'alerts',
      });

      return {
        totalSent: compiledMessages.length,
        batchCount: chunks.length,
        appId: config.appId,
        channel: 'alerts',
        ids: allIds,
        batches: batchResults,
        dryRun: false,
      };
    },

    async addAudienceContact(params: AddAudienceContactParams): Promise<AddAudienceContactResult> {
      const audienceId = typeof params.audienceId === 'string' ? params.audienceId.trim() : '';
      if (!audienceId) {
        throw new EmailValidationError('audienceId must be a non-empty string.');
      }

      const email = validateEmailAddress(params.email, 'email');
      const properties = normalizeContactProperties(params.metadata);

      if (!resend) {
        const dryId = `dry_contact_${Date.now().toString(36)}`;
        logger.info('Dry-run audience contact staged', { id: dryId, audienceId });
        return { id: dryId, audienceId, email, created: true, alreadyExists: false, dryRun: true };
      }

      try {
        const res = await withRateLimitRetry(
          () =>
            resend.contacts.create({
              audienceId,
              email,
              ...(params.firstName !== undefined ? { firstName: params.firstName } : {}),
              ...(params.lastName !== undefined ? { lastName: params.lastName } : {}),
              ...(params.unsubscribed !== undefined ? { unsubscribed: params.unsubscribed } : {}),
              ...(properties ? { properties } : {}),
            }),
          maxRetries,
          initialRetryDelayMs
        );

        if (res.error) {
          if (isContactAlreadyExistsError(res.error)) {
            logger.info('Audience contact already exists (idempotent no-op)', { audienceId });
            return { audienceId, email, created: false, alreadyExists: true, dryRun: false };
          }
          throw res.error;
        }

        const id = res.data?.id;
        logger.info('Audience contact created', { id, audienceId });
        return { id, audienceId, email, created: true, alreadyExists: false, dryRun: false };
      } catch (err) {
        if (isContactAlreadyExistsError(err)) {
          logger.info('Audience contact already exists (idempotent no-op)', { audienceId });
          return { audienceId, email, created: false, alreadyExists: true, dryRun: false };
        }

        const message = extractErrorMessage(err, 'Failed to create Resend audience contact.');
        logger.error('Audience contact creation failed', { audienceId, error: message });
        throw new EmailDispatchError(message, {
          statusCode: extractStatusCode(err),
          cause: err,
        });
      }
    },
  };
}
