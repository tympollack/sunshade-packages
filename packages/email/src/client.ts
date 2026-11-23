import { Resend, type CreateBatchEmailOptions, type CreateEmailOptions } from 'resend';
import {
  BatchDispatchError,
  EmailConfigError,
  EmailDispatchError,
  EmailValidationError,
  parseSenderAddress,
  resolveAlertSender,
  validateEmailAddress,
} from './domain';
import {
  assertMessageContent,
  buildChunkIdempotencyKey,
  buildRenderOptions,
  buildRfc8058Headers,
  createDefaultLogger,
  extractErrorMessage,
  extractStatusCode,
  isContactAlreadyExistsError,
  normalizeContactProperties,
  normalizeRecipients,
  normalizeTags,
  throwWithResponseHeaders,
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
  SendBatchNotificationOptions,
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

async function enrollExistingContactInSegments(params: {
  resend: ResendLike;
  email: string;
  segmentIds: string[];
  maxRetries: number;
  initialRetryDelayMs: number;
}): Promise<void> {
  const { resend, email, segmentIds, maxRetries, initialRetryDelayMs } = params;
  if (segmentIds.length === 0) return;

  const addSegment = resend.contacts.segments?.add;
  if (typeof addSegment !== 'function') {
    throw new EmailDispatchError(
      'Existing contact cannot be added to segments because contacts.segments.add is unavailable on the Resend client.'
    );
  }

  for (const segmentId of segmentIds) {
    await withRateLimitRetry(
      async () => {
        const res = await addSegment.call(resend.contacts.segments, { email, segmentId });
        if (res.error) {
          if (isContactAlreadyExistsError(res.error)) {
            return res;
          }
          throwWithResponseHeaders(res.error, res.headers);
        }
        return res;
      },
      maxRetries,
      initialRetryDelayMs
    );
  }
}

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
  if (config.allowedAlertSubdomains !== undefined && config.allowedAlertSubdomains.length === 0) {
    throw new EmailConfigError('allowedAlertSubdomains cannot be an empty array.');
  }

  const dryRun = Boolean(config.dryRun);
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';

  if (!config.resendClient && !dryRun && !apiKey) {
    throw new EmailConfigError(
      'Resend apiKey is required unless resendClient or dryRun: true is provided.'
    );
  }

  const allowedAlertSubdomains = config.allowedAlertSubdomains;
  const maxRetries = Math.max(0, config.maxRetries ?? DEFAULT_MAX_RETRIES);
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
            if (res.error) throwWithResponseHeaders(res.error, res.headers);
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
      messages: readonly BatchNotificationMessage[],
      options?: SendBatchNotificationOptions
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

      const baseIdempotencyKey = options?.idempotencyKey?.trim();

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const requestOptions = baseIdempotencyKey
          ? { idempotencyKey: buildChunkIdempotencyKey(baseIdempotencyKey, chunkIndex) }
          : undefined;

        try {
          const response = await withRateLimitRetry(
            async () => {
              const res = await resend.batch.send(chunk, requestOptions);
              if (res.error) throwWithResponseHeaders(res.error, res.headers);
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
            completedChunks: batchResults.length,
            error: message,
          });
          throw new BatchDispatchError(message, {
            statusCode: extractStatusCode(err),
            cause: err,
            completedBatches: [...batchResults],
            completedIds: [...allIds],
            failedChunkIndex: chunkIndex,
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
      const segmentIds = Array.isArray(params.segmentIds)
        ? params.segmentIds.map((s) => s.trim()).filter(Boolean)
        : [];

      if (!audienceId && segmentIds.length === 0) {
        throw new EmailValidationError(
          'addAudienceContact requires either audienceId or at least one segmentId.'
        );
      }

      const email = validateEmailAddress(params.email, 'email');
      const properties = normalizeContactProperties(params.metadata);

      if (!resend) {
        const dryId = `dry_contact_${Date.now().toString(36)}`;
        logger.info('Dry-run audience contact staged', {
          id: dryId,
          ...(audienceId ? { audienceId } : {}),
          ...(segmentIds.length > 0 ? { segmentIds } : {}),
        });
        return {
          id: dryId,
          ...(audienceId ? { audienceId } : {}),
          ...(segmentIds.length > 0 ? { segmentIds } : {}),
          email,
          created: true,
          alreadyExists: false,
          dryRun: true,
        };
      }

      const payload =
        segmentIds.length > 0
          ? {
              email,
              segments: segmentIds.map((id) => ({ id })),
              ...(params.firstName !== undefined ? { firstName: params.firstName } : {}),
              ...(params.lastName !== undefined ? { lastName: params.lastName } : {}),
              ...(params.unsubscribed !== undefined ? { unsubscribed: params.unsubscribed } : {}),
              ...(properties ? { properties } : {}),
            }
          : {
              audienceId,
              email,
              ...(params.firstName !== undefined ? { firstName: params.firstName } : {}),
              ...(params.lastName !== undefined ? { lastName: params.lastName } : {}),
              ...(params.unsubscribed !== undefined ? { unsubscribed: params.unsubscribed } : {}),
              ...(properties ? { properties } : {}),
            };

      const finalizeExistingContact = async (): Promise<AddAudienceContactResult> => {
        try {
          if (segmentIds.length > 0) {
            await enrollExistingContactInSegments({
              resend,
              email,
              segmentIds,
              maxRetries,
              initialRetryDelayMs,
            });
            logger.info('Existing contact enrolled into requested segments', {
              segmentIds,
            });
          } else {
            logger.info('Audience contact already exists (idempotent no-op)', {
              ...(audienceId ? { audienceId } : {}),
            });
          }
          return {
            ...(audienceId ? { audienceId } : {}),
            ...(segmentIds.length > 0 ? { segmentIds } : {}),
            email,
            created: false,
            alreadyExists: true,
            dryRun: false,
          };
        } catch (segmentErr) {
          const segMessage = extractErrorMessage(
            segmentErr,
            'Failed to enroll existing Resend contact into segments.'
          );
          logger.error('Existing contact segment enrollment failed', {
            segmentIds,
            error: segMessage,
          });
          if (segmentErr instanceof EmailDispatchError) {
            throw segmentErr;
          }
          throw new EmailDispatchError(segMessage, {
            statusCode: extractStatusCode(segmentErr),
            cause: segmentErr,
          });
        }
      };

      try {
        const res = await withRateLimitRetry(
          async () => {
            const response = await resend.contacts.create(payload);
            if (response.error) {
              if (isContactAlreadyExistsError(response.error)) {
                return response;
              }
              throwWithResponseHeaders(response.error, response.headers);
            }
            return response;
          },
          maxRetries,
          initialRetryDelayMs
        );

        if (res.error && isContactAlreadyExistsError(res.error)) {
          return await finalizeExistingContact();
        }

        const id = res.data?.id;
        logger.info('Audience contact created', {
          id,
          ...(audienceId ? { audienceId } : {}),
          ...(segmentIds.length > 0 ? { segmentIds } : {}),
        });
        return {
          id,
          ...(audienceId ? { audienceId } : {}),
          ...(segmentIds.length > 0 ? { segmentIds } : {}),
          email,
          created: true,
          alreadyExists: false,
          dryRun: false,
        };
      } catch (err) {
        if (err instanceof EmailDispatchError) {
          throw err;
        }
        if (isContactAlreadyExistsError(err)) {
          return await finalizeExistingContact();
        }

        const message = extractErrorMessage(err, 'Failed to create Resend audience contact.');
        logger.error('Audience contact creation failed', {
          ...(audienceId ? { audienceId } : {}),
          ...(segmentIds.length > 0 ? { segmentIds } : {}),
          error: message,
        });
        throw new EmailDispatchError(message, {
          statusCode: extractStatusCode(err),
          cause: err,
        });
      }
    },
  };
}
