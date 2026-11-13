import type { SupabaseSchemaRpcClient } from './ambient';

export const BURDEN_TYPES = [
  'HEALTHCARE_DISPUTE',
  'MUNICIPAL_ZONING_CODE',
  'REGULATORY_AFFIDAVIT',
  'TECH_ACCESSIBILITY',
] as const;

export type BurdenType = (typeof BURDEN_TYPES)[number];

export const HOIST_STATUSES = [
  'HOISTED',
  'RESEARCHED',
  'SUMMARY_PREPARED',
  'RETURNED_TO_PILOT',
] as const;

export type HoistStatus = (typeof HOIST_STATUSES)[number];

export interface HoistedBurden {
  id: string;
  voter_id: string;
  advocate_id: string;
  burden_type: BurdenType;
  dossier_payload: Record<string, unknown>;
  advocate_notes: string | null;
  status: HoistStatus;
  created_at: string;
  updated_at?: string;
}

export interface HoistSystemicBurdenInput {
  burden_type: BurdenType;
  dossier_payload: Record<string, unknown>;
  advocate_id?: string | null;
}

export interface UpdateHoistedBurdenResearchInput {
  burdenId: string;
  advocateId: string;
  currentStatus: HoistStatus;
  nextStatus: Exclude<HoistStatus, 'HOISTED'>;
  advocateNotes?: string | null;
}

const VALID_ADVOCATE_TRANSITIONS: Record<HoistStatus, ReadonlyArray<HoistStatus>> = {
  HOISTED: ['RESEARCHED', 'SUMMARY_PREPARED'],
  RESEARCHED: ['SUMMARY_PREPARED', 'RETURNED_TO_PILOT'],
  SUMMARY_PREPARED: ['RETURNED_TO_PILOT'],
  RETURNED_TO_PILOT: [],
};

/**
 * Pull-Based Initiation Guardrail (Hoist-vs-Hover Protocol):
 * Only the voter (pilot) may initiate a systemic burden hoist. Advocates cannot
 * push unsolicited tasks onto a voter's desk, and a voter cannot hoist to themselves.
 */
export function canInitiateHoist(
  actorUserId: string,
  voterId: string,
  advocateId: string,
): boolean {
  if (!actorUserId || !voterId || !advocateId) return false;
  if (voterId === advocateId) return false;
  return actorUserId === voterId;
}

/**
 * Validates monotonic status progression by a paired Civic Advocate:
 * HOISTED -> RESEARCHED -> SUMMARY_PREPARED -> RETURNED_TO_PILOT.
 * Transitioning to RETURNED_TO_PILOT requires a non-empty 1-page action summary in `advocateNotes`.
 */
export function isValidAdvocateStatusTransition(
  fromStatus: HoistStatus,
  toStatus: HoistStatus,
  advocateNotes?: string | null,
): boolean {
  if (fromStatus === toStatus) {
    if (toStatus === 'RETURNED_TO_PILOT') {
      return typeof advocateNotes === 'string' && advocateNotes.trim().length > 0;
    }
    return true;
  }
  const allowed = VALID_ADVOCATE_TRANSITIONS[fromStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    return false;
  }
  if (toStatus === 'RETURNED_TO_PILOT') {
    return typeof advocateNotes === 'string' && advocateNotes.trim().length > 0;
  }
  return true;
}

/**
 * Invokes `valerie.hoist_systemic_burden` RPC so a voter can offload a complex systemic
 * burden to their paired Civic Advocate in one action.
 */
export async function hoistSystemicBurden(
  client: SupabaseSchemaRpcClient,
  input: HoistSystemicBurdenInput,
): Promise<HoistedBurden> {
  if (!BURDEN_TYPES.includes(input.burden_type)) {
    throw new Error(`Invalid burden_type: ${String(input.burden_type)}`);
  }
  if (
    !input.dossier_payload ||
    typeof input.dossier_payload !== 'object' ||
    Array.isArray(input.dossier_payload)
  ) {
    throw new Error('dossier_payload must be a non-null JSON object');
  }

  const { data, error } = await client
    .schema('valerie')
    .rpc<HoistedBurden>('hoist_systemic_burden', {
      p_burden_type: input.burden_type,
      p_dossier_payload: input.dossier_payload,
      p_advocate_id: input.advocate_id ?? null,
    });

  if (error) {
    throw new Error(`Failed to hoist systemic burden: ${error.message}`);
  }
  if (!data) {
    throw new Error('Empty response from valerie.hoist_systemic_burden');
  }
  return data;
}

/**
 * Updates research status and 1-page action summary notes on `valerie.hoisted_burdens`
 * (deployed via `sunshade-db-platform/supabase/migrations/20261113173659_valerie_hoist_protocol.sql`)
 * on behalf of the paired Civic Advocate with optimistic concurrency on `currentStatus`,
 * monotonic transition validation, and `{ error }` guards.
 */
export async function updateHoistedBurdenResearch(
  client: SupabaseSchemaRpcClient,
  input: UpdateHoistedBurdenResearchInput,
): Promise<HoistedBurden> {
  if (
    !isValidAdvocateStatusTransition(
      input.currentStatus,
      input.nextStatus,
      input.advocateNotes,
    )
  ) {
    throw new Error(
      `Invalid advocate status transition from ${input.currentStatus} to ${input.nextStatus}`,
    );
  }

  const payload: Record<string, unknown> = {
    status: input.nextStatus,
  };
  if (input.advocateNotes !== undefined) {
    payload.advocate_notes = input.advocateNotes;
  }

  const { data, error } = await client
    .schema('valerie')
    .from('hoisted_burdens')
    .update(payload)
    .eq('id', input.burdenId)
    .eq('advocate_id', input.advocateId)
    .eq('status', input.currentStatus)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update hoisted burden research: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      `Hoisted burden conflict: row not found or status already advanced from ${input.currentStatus}`,
    );
  }
  return data as HoistedBurden;
}
