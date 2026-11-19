import { describe, it, expect } from 'vitest';
import {
  ExpoSqliteStubAdapter,
  IndexedDbStubAdapter,
  MemoryStubAdapter,
  StubVault,
  createExpoSqliteStubAdapter,
  sealStubRollPayload,
  unsealStubRollPayload,
  type ISqliteExecutor,
} from './index';
import { generateDeterministicRoll } from '../prng';
import type { BlindSkillSubmission } from '../types';

class MockSqliteDb implements ISqliteExecutor {
  private rows = new Map<
    string,
    {
      stub_id: string;
      match_id: string;
      cartridge_id: string;
      roll_index: number;
      sealed_payload: string;
      expires_at: string | null;
      status: 'active' | 'resolved' | 'expired';
      resolution_json: string | null;
    }
  >();

  async execAsync(_sql: string): Promise<void> {}

  async runAsync(
    sql: string,
    params: unknown[] = []
  ): Promise<{ changes?: number }> {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('INSERT OR REPLACE')) {
      const [
        stub_id,
        match_id,
        cartridge_id,
        roll_index,
        sealed_payload,
        expires_at,
      ] = params as [string, string, string, number, string, string | null];
      this.rows.set(stub_id, {
        stub_id,
        match_id,
        cartridge_id,
        roll_index,
        sealed_payload,
        expires_at,
        status: 'active',
        resolution_json: null,
      });
      return { changes: 1 };
    }
    if (trimmed.startsWith('UPDATE')) {
      const [resolution_json, stub_id] = params as [string, string];
      const existing = this.rows.get(stub_id);
      if (existing) {
        existing.status = 'resolved';
        existing.resolution_json = resolution_json;
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    if (trimmed.startsWith('DELETE')) {
      const [stub_id] = params as [string];
      const existed = this.rows.delete(stub_id);
      return { changes: existed ? 1 : 0 };
    }
    return { changes: 0 };
  }

  async getAllAsync<T>(sql: string): Promise<T[]> {
    const all = Array.from(this.rows.values());
    if (sql.includes("status = 'active'")) {
      return all
        .filter((r) => r.status === 'active')
        .sort((a, b) => a.roll_index - b.roll_index) as unknown as T[];
    }
    if (sql.includes("status != 'resolved'")) {
      return all.filter((r) => r.status !== 'resolved') as unknown as T[];
    }
    return all as unknown as T[];
  }

  async getFirstAsync<T>(_sql: string, params: unknown[] = []): Promise<T | null> {
    const [stub_id] = params as [string];
    return (this.rows.get(stub_id) as unknown as T) ?? null;
  }
}

describe('@digitalcanopy/reels-engine Bonus Stub Vault & Storage Adapters', () => {
  it('seals and unseals a DeterministicRoll without leaking plaintext candidate sub-seeds', async () => {
    const roll = await generateDeterministicRoll(
      'vault-secret-seed',
      'match-encrypt',
      3
    );
    const sealed = await sealStubRollPayload(roll, 'custom-user-device-key');

    for (const subSeed of roll.candidateSubSeeds) {
      expect(sealed).not.toContain(subSeed);
    }

    const unsealed = await unsealStubRollPayload(
      sealed,
      'custom-user-device-key'
    );
    expect(unsealed).toEqual(roll);
  });

  it('preserves unplayed BankedStub records across close/rehydration and prevents double-claim exploits (MemoryStubAdapter)', async () => {
    const adapterA = new MemoryStubAdapter();
    const vaultA = new StubVault(adapterA);

    const roll1 = await generateDeterministicRoll('seed-vault-1', 'match-1', 4);
    const roll2 = await generateDeterministicRoll('seed-vault-1', 'match-1', 9);

    const stub1 = await vaultA.bankRollStub({
      stubId: 'stub-boss-walked-in-1',
      matchId: 'match-1',
      cartridgeId: 'sector-smuggler',
      roll: roll1,
      expiresAt: '2026-12-31T23:59:59.000Z',
    });

    const stub2 = await vaultA.bankRollStub({
      stubId: 'stub-boss-walked-in-2',
      matchId: 'match-1',
      cartridgeId: 'sector-smuggler',
      roll: roll2,
      expiresAt: null,
    });

    // Simulate closing the app mid-trigger and rehydrating a brand new store instance
    const persistedSnapshot = adapterA.exportSnapshot();
    const adapterB = new MemoryStubAdapter(persistedSnapshot);
    const vaultB = new StubVault(adapterB);

    const activeAfterRehydrate = await vaultB.listActiveStubs(
      '2026-11-20T00:00:00.000Z'
    );
    expect(activeAfterRehydrate).toHaveLength(2);
    expect(activeAfterRehydrate.map((s) => s.stubId)).toEqual([
      stub1.stubId,
      stub2.stubId,
    ]);

    // First claim resolution
    const submissionFirst: BlindSkillSubmission = {
      rollIndex: 4,
      minigameId: 'hyperdrive-tune',
      rawScore: 20,
      maxScore: 100,
      clientSignature: 'sig-first',
      submittedAt: '2026-11-20T01:00:00.000Z',
    };

    const firstResolution = await vaultB.resolveStub(
      stub1.stubId,
      submissionFirst,
      '2026-11-20T01:00:01.000Z'
    );

    // Double-claim exploit attempt with a perfect 100/100 score and later timestamp
    const submissionExploit: BlindSkillSubmission = {
      rollIndex: 4,
      minigameId: 'hyperdrive-tune',
      rawScore: 100,
      maxScore: 100,
      clientSignature: 'sig-exploit-retry',
      submittedAt: '2026-11-20T01:05:00.000Z',
    };

    const secondResolution = await vaultB.resolveStub(
      stub1.stubId,
      submissionExploit,
      '2026-11-20T01:05:01.000Z'
    );

    // Must return the exact original resolution record without re-rolling
    expect(secondResolution).toEqual(firstResolution);

    // Attempting to re-put an already-resolved stubId is a no-op
    await vaultB.putStub(stub1);
    const remainingActive = await vaultB.listActiveStubs(
      '2026-11-20T02:00:00.000Z'
    );
    expect(remainingActive).toHaveLength(1);
    expect(remainingActive[0].stubId).toBe(stub2.stubId);
  });

  it('supports IndexedDbStubAdapter close/reopen lifecycle, idempotent resolution, and purgeExpired', async () => {
    const dbName = 'test_reels_idb_vault';
    const idbAdapter1 = new IndexedDbStubAdapter({ dbName });
    const vault1 = new StubVault(idbAdapter1);

    const rollActive = await generateDeterministicRoll('idb-seed', 'm-10', 1);
    const rollExpired = await generateDeterministicRoll('idb-seed', 'm-10', 2);

    await vault1.bankRollStub({
      stubId: 'idb-stub-active',
      matchId: 'm-10',
      cartridgeId: 'VOID-RUNNER',
      roll: rollActive,
      expiresAt: '2026-12-01T00:00:00.000Z',
    });

    await vault1.bankRollStub({
      stubId: 'idb-stub-expired',
      matchId: 'm-10',
      cartridgeId: 'VOID-RUNNER',
      roll: rollExpired,
      expiresAt: '2026-11-01T00:00:00.000Z',
    });

    await idbAdapter1.close();

    // Reopen a new IndexedDbStubAdapter pointing at the same database name
    const idbAdapter2 = new IndexedDbStubAdapter({ dbName });
    const vault2 = new StubVault(idbAdapter2);

    const active = await vault2.listActiveStubs('2026-11-15T00:00:00.000Z');
    expect(active).toHaveLength(1);
    expect(active[0].stubId).toBe('idb-stub-active');

    const purgedCount = await vault2.purgeExpired('2026-11-15T00:00:00.000Z');
    expect(purgedCount).toBe(1);

    const resA = await vault2.resolveStub(
      'idb-stub-active',
      undefined,
      '2026-11-15T01:00:00.000Z'
    );
    const resB = await vault2.resolveStub(
      'idb-stub-active',
      undefined,
      '2026-11-15T02:00:00.000Z'
    );
    expect(resB).toEqual(resA);
  });

  it('supports ExpoSqliteStubAdapter via createExpoSqliteStubAdapter interface hook', async () => {
    const sqliteDb = new MockSqliteDb();
    const sqliteAdapter = createExpoSqliteStubAdapter(sqliteDb);
    expect(sqliteAdapter).toBeInstanceOf(ExpoSqliteStubAdapter);

    const vault = new StubVault(sqliteAdapter);
    const roll = await generateDeterministicRoll('sqlite-seed', 'm-sqlite', 7);

    const banked = await vault.bankRollStub({
      stubId: 'sqlite-stub-7',
      matchId: 'm-sqlite',
      cartridgeId: 'dart-up',
      roll,
      expiresAt: null,
    });

    // Re-instantiate adapter over the same SQLite database to verify persistence
    const reopenedVault = new StubVault(createExpoSqliteStubAdapter(sqliteDb));
    const listed = await reopenedVault.listActiveStubs();
    expect(listed).toHaveLength(1);
    expect(listed[0].stubId).toBe(banked.stubId);

    const firstClaim = await reopenedVault.resolveStub(
      banked.stubId,
      undefined,
      '2026-11-19T10:00:00.000Z'
    );
    const repeatClaim = await reopenedVault.resolveStub(
      banked.stubId,
      undefined,
      '2026-11-19T11:00:00.000Z'
    );

    expect(repeatClaim).toEqual(firstClaim);
    expect(await reopenedVault.listActiveStubs()).toHaveLength(0);
  });
});
