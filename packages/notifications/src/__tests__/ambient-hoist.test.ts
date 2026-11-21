import { describe, expect, it, vi } from 'vitest';
import {
  type AmbientNotification,
  type SupabaseSchemaRpcClient,
  ambientOriginToSource,
  ambientPriorityToTriageTier,
  evaluatePushEliminationGate,
  fetchPorchHoldingPen,
  ingestAmbientNotification,
  mapAmbientToActionable,
  markPorchNotificationRead,
  shouldTriggerExternalPush,
} from '../ambient';
import {
  type HoistedBurden,
  canInitiateHoist,
  hoistSystemicBurden,
  isValidAdvocateStatusTransition,
  updateHoistedBurdenResearch,
} from '../hoist';
import { buildDigestRollup } from '../triage';

function createMockSupabaseClient(overrides?: {
  rpcResult?: { data: unknown | null; error: { message: string } | null };
  selectResult?: { data: unknown[] | null; error: { message: string } | null };
  updateResult?: { data: unknown | null; error: { message: string } | null };
}): {
  client: SupabaseSchemaRpcClient;
  rpcSpy: ReturnType<typeof vi.fn>;
  schemaSpy: ReturnType<typeof vi.fn>;
  updateEqSpies: Array<[string, unknown]>;
} {
  const rpcSpy = vi.fn().mockResolvedValue(
    overrides?.rpcResult ?? { data: null, error: null },
  );
  const orderSpy = vi.fn().mockResolvedValue(
    overrides?.selectResult ?? { data: [], error: null },
  );
  const singleSpy = vi.fn().mockResolvedValue(
    overrides?.updateResult ?? { data: null, error: null },
  );
  const updateEqSpies: Array<[string, unknown]> = [];

  const updateBuilder = {
    eq: vi.fn((col: string, val: unknown) => {
      updateEqSpies.push([col, val]);
      return updateBuilder;
    }),
    select: vi.fn().mockReturnValue({
      single: singleSpy,
    }),
  };

  const schemaSpy = vi.fn().mockReturnValue({
    rpc: rpcSpy,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: orderSpy,
        }),
      }),
      update: vi.fn().mockReturnValue(updateBuilder),
    }),
  });

  return {
    client: { schema: schemaSpy },
    rpcSpy,
    schemaSpy,
    updateEqSpies,
  };
}

describe('Ambient Notification Ingress & Push Elimination Gate (TASK-ECO-HOLDING-PEN-SCHEMA)', () => {
  it('enforces the Push Elimination Gate across priority tiers', () => {
    expect(shouldTriggerExternalPush('PROXIMITY_HAZARD')).toBe(true);
    expect(shouldTriggerExternalPush('ADVOCATE_DISPATCH')).toBe(true);
    expect(shouldTriggerExternalPush('AMBIENT_PORCH')).toBe(false);
  });

  it('defaults priority_tier to AMBIENT_PORCH, forces delivered_to_holding_pen=true, and suppresses push', () => {
    const gated = evaluatePushEliminationGate({
      user_id: '00000000-0000-0000-0000-000000000001',
      origin_app: 'COZY',
      headline: 'Porch circle warm check-in ready',
      action_url: '/cozy/porch',
    });

    expect(gated.triggerExternalPush).toBe(false);
    expect(gated.record).toEqual({
      user_id: '00000000-0000-0000-0000-000000000001',
      origin_app: 'COZY',
      priority_tier: 'AMBIENT_PORCH',
      headline: 'Porch circle warm check-in ready',
      action_url: '/cozy/porch',
      delivered_to_holding_pen: true,
      is_read: false,
    });
  });

  it('rejects unsafe action_url schemes and blank headlines', () => {
    expect(() =>
      evaluatePushEliminationGate({
        user_id: '00000000-0000-0000-0000-000000000001',
        origin_app: 'PATCHWORK',
        headline: 'Hazard alert',
        action_url: 'javascript:alert(1)',
      }),
    ).toThrow(/action_url/i);

    expect(() =>
      evaluatePushEliminationGate({
        user_id: '00000000-0000-0000-0000-000000000001',
        origin_app: 'VOTARY',
        headline: '   ',
        action_url: '/votary/polls',
      }),
    ).toThrow(/headline/i);
  });

  it('maps hub.ambient_notifications rows into ActionableNotification items for Porch digest rollup', () => {
    const rows: AmbientNotification[] = [
      {
        id: 'n-1',
        user_id: 'u-1',
        origin_app: 'COZY',
        priority_tier: 'AMBIENT_PORCH',
        headline: '3 neighbors shared garden notes',
        action_url: '/cozy/garden',
        delivered_to_holding_pen: true,
        is_read: false,
        created_at: '2026-11-13T10:00:00Z',
      },
      {
        id: 'n-2',
        user_id: 'u-1',
        origin_app: 'VOTARY',
        priority_tier: 'ADVOCATE_DISPATCH',
        headline: 'Your paired Advocate returned a 1-page zoning summary',
        action_url: '/votary/hoisted-burdens/b-1',
        delivered_to_holding_pen: true,
        is_read: false,
        created_at: '2026-11-13T11:00:00Z',
      },
      {
        id: 'n-3',
        user_id: 'u-1',
        origin_app: 'PATCHWORK',
        priority_tier: 'PROXIMITY_HAZARD',
        headline: 'Downed line reported 150m from your parcel',
        action_url: '/patchwork/hazards/h-9',
        delivered_to_holding_pen: true,
        is_read: false,
        created_at: '2026-11-13T12:00:00Z',
      },
    ];

    expect(ambientOriginToSource('VOTARY')).toBe('valerie');
    expect(ambientPriorityToTriageTier('PROXIMITY_HAZARD')).toBe('critical');

    const actionable = rows.map(mapAmbientToActionable);
    const rollup = buildDigestRollup(actionable);

    expect(rollup.total).toBe(3);
    expect(rollup.unread).toBe(3);
    expect(rollup.topTier).toBe('critical');
    expect(rollup.unreadByTier).toEqual({
      critical: 1,
      attention: 1,
      info: 1,
    });
  });

  it('ingests, lists, and marks read via hub schema RPC/queries and guards { error }', async () => {
    const sampleNotification: AmbientNotification = {
      id: 'amb-1',
      user_id: 'u-1',
      origin_app: 'VOTARY',
      priority_tier: 'ADVOCATE_DISPATCH',
      headline: 'Advocate summary ready',
      action_url: '/votary/hoisted/1',
      delivered_to_holding_pen: true,
      is_read: false,
      created_at: '2026-11-13T12:00:00Z',
    };

    const { client, rpcSpy, schemaSpy } = createMockSupabaseClient({
      rpcResult: {
        data: {
          notification: sampleNotification,
          delivered_to_holding_pen: true,
          trigger_external_push: true,
        },
        error: null,
      },
      selectResult: {
        data: [sampleNotification],
        error: null,
      },
      updateResult: {
        data: { ...sampleNotification, is_read: true },
        error: null,
      },
    });

    const ingestRes = await ingestAmbientNotification(client, {
      user_id: 'u-1',
      origin_app: 'VOTARY',
      priority_tier: 'ADVOCATE_DISPATCH',
      headline: 'Advocate summary ready',
      action_url: '/votary/hoisted/1',
    });

    expect(schemaSpy).toHaveBeenCalledWith('hub');
    expect(rpcSpy).toHaveBeenCalledWith('ingest_ambient_notification', {
      p_user_id: 'u-1',
      p_origin_app: 'VOTARY',
      p_priority_tier: 'ADVOCATE_DISPATCH',
      p_headline: 'Advocate summary ready',
      p_action_url: '/votary/hoisted/1',
    });
    expect(ingestRes.trigger_external_push).toBe(true);

    const listRes = await fetchPorchHoldingPen(client, 'u-1');
    expect(listRes).toHaveLength(1);

    const readRes = await markPorchNotificationRead(client, 'amb-1', 'u-1');
    expect(readRes.is_read).toBe(true);

    const failing = createMockSupabaseClient({
      rpcResult: { data: null, error: { message: 'RLS policy violation' } },
    });
    await expect(
      ingestAmbientNotification(failing.client, {
        user_id: 'u-1',
        origin_app: 'COZY',
        headline: 'Test',
        action_url: '/cozy',
      }),
    ).rejects.toThrow(/RLS policy violation/);
  });
});

describe('Advocate Hoist-vs-Hover Protocol & Friction Shield (TASK-ECO-HOIST-DESK-RPC)', () => {
  it('enforces pull-only initiation (only voter can initiate, never advocate)', () => {
    const voterId = 'voter-111';
    const advocateId = 'advocate-222';

    expect(canInitiateHoist(voterId, voterId, advocateId)).toBe(true);
    // Advocate cannot push unsolicited tasks onto a voter's desk
    expect(canInitiateHoist(advocateId, voterId, advocateId)).toBe(false);
    // Voter and advocate must be distinct
    expect(canInitiateHoist(voterId, voterId, voterId)).toBe(false);
  });

  it('enforces monotonic advocate status progression and requires summary notes on RETURNED_TO_PILOT', () => {
    expect(isValidAdvocateStatusTransition('HOISTED', 'RESEARCHED')).toBe(true);
    expect(isValidAdvocateStatusTransition('HOISTED', 'SUMMARY_PREPARED')).toBe(true);
    expect(isValidAdvocateStatusTransition('HOISTED', 'RETURNED_TO_PILOT', 'Summary')).toBe(
      false,
    );
    expect(
      isValidAdvocateStatusTransition(
        'SUMMARY_PREPARED',
        'RETURNED_TO_PILOT',
        '1-page municipal zoning brief with 2 options.',
      ),
    ).toBe(true);
    // Missing summary notes when returning to pilot is rejected
    expect(
      isValidAdvocateStatusTransition('SUMMARY_PREPARED', 'RETURNED_TO_PILOT', '   '),
    ).toBe(false);
    // Cannot regress from RETURNED_TO_PILOT
    expect(
      isValidAdvocateStatusTransition('RETURNED_TO_PILOT', 'RESEARCHED', 'notes'),
    ).toBe(false);
  });

  it('invokes valerie.hoist_systemic_burden and updates advocate research with { error } guards', async () => {
    const sampleHoisted: HoistedBurden = {
      id: 'burden-1',
      voter_id: 'voter-111',
      advocate_id: 'advocate-222',
      burden_type: 'MUNICIPAL_ZONING_CODE',
      dossier_payload: { parcel_id: 'P-402', code_section: '14.08.020' },
      advocate_notes: null,
      status: 'HOISTED',
      created_at: '2026-11-13T14:00:00Z',
    };

    const { client, rpcSpy, schemaSpy, updateEqSpies } = createMockSupabaseClient({
      rpcResult: { data: sampleHoisted, error: null },
      updateResult: {
        data: {
          ...sampleHoisted,
          status: 'RETURNED_TO_PILOT',
          advocate_notes: '1-page zoning variance summary prepared for pilot.',
        },
        error: null,
      },
    });

    const hoisted = await hoistSystemicBurden(client, {
      burden_type: 'MUNICIPAL_ZONING_CODE',
      dossier_payload: { parcel_id: 'P-402', code_section: '14.08.020' },
      advocate_id: 'advocate-222',
    });

    expect(schemaSpy).toHaveBeenCalledWith('valerie');
    expect(rpcSpy).toHaveBeenCalledWith('hoist_systemic_burden', {
      p_burden_type: 'MUNICIPAL_ZONING_CODE',
      p_dossier_payload: { parcel_id: 'P-402', code_section: '14.08.020' },
      p_advocate_id: 'advocate-222',
    });
    expect(hoisted.status).toBe('HOISTED');

    const updated = await updateHoistedBurdenResearch(client, {
      burdenId: 'burden-1',
      advocateId: 'advocate-222',
      currentStatus: 'SUMMARY_PREPARED',
      nextStatus: 'RETURNED_TO_PILOT',
      advocateNotes: '1-page zoning variance summary prepared for pilot.',
    });
    expect(updated.status).toBe('RETURNED_TO_PILOT');
    expect(updateEqSpies).toEqual([
      ['id', 'burden-1'],
      ['advocate_id', 'advocate-222'],
      ['status', 'SUMMARY_PREPARED'],
    ]);

    // Stale write where stored status already advanced returns null data and throws conflict
    const staleClient = createMockSupabaseClient({
      updateResult: { data: null, error: null },
    });
    await expect(
      updateHoistedBurdenResearch(staleClient.client, {
        burdenId: 'burden-1',
        advocateId: 'advocate-222',
        currentStatus: 'HOISTED',
        nextStatus: 'RESEARCHED',
      }),
    ).rejects.toThrow(/status already advanced from HOISTED/);

    await expect(
      updateHoistedBurdenResearch(client, {
        burdenId: 'burden-1',
        advocateId: 'advocate-222',
        currentStatus: 'HOISTED',
        nextStatus: 'RETURNED_TO_PILOT',
        advocateNotes: '',
      }),
    ).rejects.toThrow(/Invalid advocate status transition/);
  });
});
