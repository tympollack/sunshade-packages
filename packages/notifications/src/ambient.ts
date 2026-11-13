import type { ActionableNotification, UrgencyTier } from './types';
import { isSafeActionUrl } from './url';

export type AmbientNotificationSource =
  | 'cozy'
  | 'patchwork'
  | 'valerie'
  | 'hub'
  | 'system';

export const AMBIENT_ORIGIN_APPS = [
  'COZY',
  'PATCHWORK',
  'VOTARY',
  'HUB',
  'SYSTEM',
] as const;

export type AmbientOriginApp = (typeof AMBIENT_ORIGIN_APPS)[number];

export const AMBIENT_PRIORITY_TIERS = [
  'PROXIMITY_HAZARD',
  'ADVOCATE_DISPATCH',
  'AMBIENT_PORCH',
] as const;

export type AmbientPriorityTier = (typeof AMBIENT_PRIORITY_TIERS)[number];

export interface AmbientNotification {
  id: string;
  user_id: string;
  origin_app: AmbientOriginApp;
  priority_tier: AmbientPriorityTier;
  headline: string;
  action_url: string;
  delivered_to_holding_pen: boolean;
  is_read: boolean;
  created_at: string;
}

export interface AmbientNotificationInsert {
  user_id: string;
  origin_app: AmbientOriginApp;
  priority_tier?: AmbientPriorityTier;
  headline: string;
  action_url: string;
}

export interface AmbientIngestResult {
  notification: AmbientNotification;
  delivered_to_holding_pen: true;
  trigger_external_push: boolean;
}

export interface SupabaseUpdateFilterBuilder {
  eq(column: string, value: unknown): SupabaseUpdateFilterBuilder;
  select(columns?: string): {
    single(): PromiseLike<{ data: unknown | null; error: { message: string } | null }>;
  };
}

export interface SupabaseSchemaRpcClient {
  schema(schemaName: string): {
    rpc<T = unknown>(
      fn: string,
      params?: Record<string, unknown>,
    ): PromiseLike<{ data: T | null; error: { message: string } | null }>;
    from(table: string): {
      select(columns?: string): {
        eq(
          column: string,
          value: unknown,
        ): {
          order(
            column: string,
            opts?: { ascending?: boolean },
          ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
      update(values: Record<string, unknown>): SupabaseUpdateFilterBuilder;
    };
  };
}

const ORIGIN_TO_SOURCE: Record<AmbientOriginApp, AmbientNotificationSource> = {
  COZY: 'cozy',
  PATCHWORK: 'patchwork',
  VOTARY: 'valerie',
  HUB: 'hub',
  SYSTEM: 'system',
};

const PRIORITY_TO_TRIAGE_TIER: Record<AmbientPriorityTier, UrgencyTier> = {
  PROXIMITY_HAZARD: 'critical',
  ADVOCATE_DISPATCH: 'attention',
  AMBIENT_PORCH: 'info',
};

/**
 * Push Elimination Gate:
 * External device push is strictly prohibited for AMBIENT_PORCH items (daily tasks,
 * room nudges, poll results). Only PROXIMITY_HAZARD and ADVOCATE_DISPATCH may trigger
 * an external push.
 */
export function shouldTriggerExternalPush(priorityTier: AmbientPriorityTier): boolean {
  return priorityTier === 'PROXIMITY_HAZARD' || priorityTier === 'ADVOCATE_DISPATCH';
}

export function ambientOriginToSource(originApp: AmbientOriginApp): AmbientNotificationSource {
  return ORIGIN_TO_SOURCE[originApp];
}

export function ambientPriorityToTriageTier(priorityTier: AmbientPriorityTier): UrgencyTier {
  return PRIORITY_TO_TRIAGE_TIER[priorityTier];
}

/**
 * Validates an incoming ambient notification envelope and applies the Push Elimination Gate.
 * Throws if `headline` is blank or `action_url` violates `isSafeActionUrl`.
 */
export function evaluatePushEliminationGate(input: AmbientNotificationInsert): {
  record: Omit<AmbientNotification, 'id' | 'created_at'>;
  triggerExternalPush: boolean;
} {
  if (!input.user_id || input.user_id.trim().length === 0) {
    throw new Error('user_id is required for ambient notification ingress');
  }
  if (!AMBIENT_ORIGIN_APPS.includes(input.origin_app)) {
    throw new Error(`Invalid origin_app: ${String(input.origin_app)}`);
  }
  const tier: AmbientPriorityTier = input.priority_tier ?? 'AMBIENT_PORCH';
  if (!AMBIENT_PRIORITY_TIERS.includes(tier)) {
    throw new Error(`Invalid priority_tier: ${String(tier)}`);
  }
  const headline = input.headline.trim();
  if (headline.length === 0) {
    throw new Error('headline must be a non-empty string');
  }
  if (!isSafeActionUrl(input.action_url)) {
    throw new Error('Unsafe or invalid action_url rejected by Push Elimination Gate');
  }

  return {
    record: {
      user_id: input.user_id,
      origin_app: input.origin_app,
      priority_tier: tier,
      headline,
      action_url: input.action_url,
      delivered_to_holding_pen: true,
      is_read: false,
    },
    triggerExternalPush: shouldTriggerExternalPush(tier),
  };
}

/**
 * Maps a `hub.ambient_notifications` row from the Porch Holding Pen into an
 * `ActionableNotification` compatible with `@digitalcanopy/notifications` digest rollup.
 */
export function mapAmbientToActionable(row: AmbientNotification): ActionableNotification {
  return {
    id: row.id,
    tier: ambientPriorityToTriageTier(row.priority_tier),
    title: row.headline,
    source: ambientOriginToSource(row.origin_app),
    actionUrl: isSafeActionUrl(row.action_url) ? row.action_url : undefined,
    createdAt: row.created_at,
    read: row.is_read,
    groupKey: `${row.origin_app.toLowerCase()}:${row.priority_tier.toLowerCase()}`,
  };
}

/**
 * Ingests an ambient notification via `hub.ingest_ambient_notification` RPC with `{ error }` guard.
 */
export async function ingestAmbientNotification(
  client: SupabaseSchemaRpcClient,
  input: AmbientNotificationInsert,
): Promise<AmbientIngestResult> {
  const { record } = evaluatePushEliminationGate(input);
  const { data, error } = await client
    .schema('hub')
    .rpc<AmbientIngestResult>('ingest_ambient_notification', {
      p_user_id: record.user_id,
      p_origin_app: record.origin_app,
      p_priority_tier: record.priority_tier,
      p_headline: record.headline,
      p_action_url: record.action_url,
    });

  if (error) {
    throw new Error(`Failed to ingest ambient notification: ${error.message}`);
  }
  if (!data) {
    throw new Error('Empty response from hub.ingest_ambient_notification');
  }
  return data;
}

/**
 * Fetches a user's Porch Holding Pen notifications from `hub.ambient_notifications`.
 */
export async function fetchPorchHoldingPen(
  client: SupabaseSchemaRpcClient,
  userId: string,
): Promise<AmbientNotification[]> {
  const { data, error } = await client
    .schema('hub')
    .from('ambient_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch Porch Holding Pen notifications: ${error.message}`);
  }
  return (data ?? []) as AmbientNotification[];
}

/**
 * Marks a notification in `hub.ambient_notifications` as read with `{ error }` guard.
 */
export async function markPorchNotificationRead(
  client: SupabaseSchemaRpcClient,
  notificationId: string,
  userId: string,
): Promise<AmbientNotification> {
  const { data, error } = await client
    .schema('hub')
    .from('ambient_notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to mark ambient notification as read: ${error.message}`);
  }
  if (!data) {
    throw new Error('Ambient notification not found');
  }
  return data as AmbientNotification;
}
