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
  type IStubStorageAdapter,
  type StoredStubRecord,
} from './index';
import { generateDeterministicRoll } from '../prng';
import type {
  BankedStub,
  BlindSkillSubmission,
  StubResolutionRecord,
} from '../types';

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
      if (existing && existing.status !== 'resolved') {
        existing.status = 'resolved';
        existing.resolution_json = resolution_json;
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    if (trimmed.startsWith('DELETE')) {
      const [stub_id] = params as [string];
      const existing = this.rows.get(stub_id);
      if (!existing) return { changes: 0 };
      if (trimmed.includes("STATUS != 'RESOLVED'") && existing.status === 'resolved') {
        return { changes: 0 };
      }
      this.rows.delete(stub_id);
      return { changes: 1 };
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

  async getFirstAsync<T>(
    _sql: string,
    params: unknown[] = []
  ): Promise<T | null> {
    const [stub_id] = params as [string];
    return (this.rows.get(stub_id) as unknown as T) ?? null;
  }
}

/**
 * Simulated browser IDBFactory implementation that exercises actual IndexedDB
 * version upgrades (`onupgradeneeded`), `objectStoreNames`, `transaction`,
 * `objectStore`, and `onversionchange` lifecycles.
 */
function createMockIdbFactory(): IDBFactory {
  const databases = new Map<
    string,
    {
      version: number;
      stores: Map<string, Map<string, StoredStubRecord>>;
      openConnections: Set<{
        version: number;
        onversionchange: (() => void) | null;
        close: () => void;
      }>;
    }
  >();

  return {
    open(name: string, requestedVersion?: number) {
      const req: Record<string, unknown> = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };

      queueMicrotask(() => {
        let dbEntry = databases.get(name);
        const isNew = !dbEntry;
        const currentVersion = dbEntry?.version ?? 0;
        const targetVersion = requestedVersion ?? (isNew ? 1 : currentVersion);

        if (targetVersion < currentVersion) {
          req.error = new Error('VersionError');
          if (typeof req.onerror === 'function') (req.onerror as () => void)();
          return;
        }

        const needsUpgrade = isNew || targetVersion > currentVersion;
        if (!dbEntry) {
          dbEntry = {
            version: targetVersion,
            stores: new Map(),
            openConnections: new Set(),
          };
          databases.set(name, dbEntry);
        } else if (needsUpgrade) {
          for (const conn of Array.from(dbEntry.openConnections)) {
            if (typeof conn.onversionchange === 'function') {
              conn.onversionchange();
            }
          }
          dbEntry.version = targetVersion;
        }

        const ref = dbEntry;
        const connection = {
          get version() {
            return ref.version;
          },
          onversionchange: null as (() => void) | null,
          objectStoreNames: {
            contains(storeName: string) {
              return ref.stores.has(storeName);
            },
          },
          createObjectStore(storeName: string) {
            if (!ref.stores.has(storeName)) {
              ref.stores.set(storeName, new Map());
            }
            return {};
          },
          close() {
            ref.openConnections.delete(connection);
          },
          transaction(storeName: string, _mode: string) {
            if (!ref.stores.has(storeName)) {
              throw new Error(`NotFoundError: store "${storeName}" not found`);
            }
            const storeMap = ref.stores.get(storeName)!;
            const tx: Record<string, unknown> = {
              oncomplete: null,
              onerror: null,
              error: null,
              objectStore() {
                return {
                  put(val: StoredStubRecord) {
                    storeMap.set(
                      val.stub.stubId,
                      JSON.parse(JSON.stringify(val))
                    );
                  },
                  get(key: string) {
                    const getReq: Record<string, unknown> = {
                      result: undefined,
                      onsuccess: null,
                      onerror: null,
                    };
                    queueMicrotask(() => {
                      const found = storeMap.get(key);
                      getReq.result = found
                        ? JSON.parse(JSON.stringify(found))
                        : undefined;
                      if (typeof getReq.onsuccess === 'function') {
                        (getReq.onsuccess as () => void)();
                      }
                    });
                    return getReq;
                  },
                  getAll() {
                    const allReq: Record<string, unknown> = {
                      result: [],
                      onsuccess: null,
                      onerror: null,
                    };
                    queueMicrotask(() => {
                      allReq.result = Array.from(storeMap.values()).map((v) =>
                        JSON.parse(JSON.stringify(v))
                      );
                      if (typeof allReq.onsuccess === 'function') {
                        (allReq.onsuccess as () => void)();
                      }
                    });
                    return allReq;
                  },
                  delete(key: string) {
                    storeMap.delete(key);
                  },
                };
              },
            };
            queueMicrotask(() => {
              queueMicrotask(() => {
                if (typeof tx.oncomplete === 'function') {
                  (tx.oncomplete as () => void)();
                }
              });
            });
            return tx;
          },
        };

        ref.openConnections.add(connection);
        req.result = connection;

        if (needsUpgrade && typeof req.onupgradeneeded === 'function') {
          (req.onupgradeneeded as () => void)();
        }
        if (typeof req.onsuccess === 'function') {
          (req.onsuccess as () => void)();
        }
      });

      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

describe('@digitalcanopy/reels-engine Bonus Stub Vault & Storage Adapters', () => {
  it('seals with fresh IVs per encryption call, rejects plaintext or tampered payloads, and unseals properly', async () => {
    const roll = await generateDeterministicRoll(
      'vault-secret-seed',
      'match-encrypt',
      3
    );
    const sealedA = await sealStubRollPayload(roll, 'custom-user-device-key');
    const sealedB = await sealStubRollPayload(roll, 'custom-user-device-key');

    // Fresh CSPRNG IV ensures sealing the same roll twice yields distinct ciphertexts/IVs
    expect(sealedA).not.toBe(sealedB);

    for (const subSeed of roll.candidateSubSeeds) {
      expect(sealedA).not.toContain(subSeed);
    }

    const unsealed = await unsealStubRollPayload(
      sealedA,
      'custom-user-device-key'
    );
    expect(unsealed).toEqual(roll);

    // Rejects unauthenticated plaintext JSON
    await expect(
      unsealStubRollPayload(JSON.stringify(roll), 'custom-user-device-key')
    ).rejects.toThrow(/plaintext payloads are rejected/i);
  });

  it('preserves unplayed BankedStub records across close/rehydration and prevents double-claim exploits (MemoryStubAdapter)', async () => {
    const sharedSecret = 'test-device-secret-key';
    const adapterA = new MemoryStubAdapter();
    const vaultA = new StubVault(adapterA, { vaultSecret: sharedSecret });

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
    const vaultB = new StubVault(adapterB, { vaultSecret: sharedSecret });

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

    expect(secondResolution).toEqual(firstResolution);

    await vaultB.putStub(stub1);
    const remainingActive = await vaultB.listActiveStubs(
      '2026-11-20T02:00:00.000Z'
    );
    expect(remainingActive).toHaveLength(1);
    expect(remainingActive[0].stubId).toBe(stub2.stubId);
  });

  it('rejects claiming an expired stub even before purgeExpired is called', async () => {
    const adapter = new MemoryStubAdapter();
    const vault = new StubVault(adapter);
    const roll = await generateDeterministicRoll('exp-seed', 'm-exp', 0);

    await vault.bankRollStub({
      stubId: 'expired-unpurged-stub',
      matchId: 'm-exp',
      cartridgeId: 'sector-smuggler',
      roll,
      expiresAt: '2026-11-10T00:00:00.000Z',
    });

    await expect(
      vault.resolveStub(
        'expired-unpurged-stub',
        undefined,
        '2026-11-15T00:00:00.000Z'
      )
    ).rejects.toThrow(/expired/i);
  });

  it('supports custom IStubStorageAdapter implementations that omit optional getStub', async () => {
    const activeMap = new Map<string, BankedStub>();
    const resolvedMap = new Map<string, StubResolutionRecord>();

    const customAdapter: IStubStorageAdapter = {
      async putStub(stub) {
        if (!resolvedMap.has(stub.stubId)) {
          activeMap.set(stub.stubId, { ...stub });
        }
      },
      async listActiveStubs() {
        return Array.from(activeMap.values());
      },
      async markStubResolved(stubId, resolution) {
        const existing = resolvedMap.get(stubId);
        if (existing) return existing;
        activeMap.delete(stubId);
        resolvedMap.set(stubId, { ...resolution });
        return { ...resolution };
      },
      async purgeExpired() {
        return 0;
      },
    };

    const vault = new StubVault(customAdapter);
    const roll = await generateDeterministicRoll('custom-seed', 'm-custom', 1);
    const banked = await vault.bankRollStub({
      stubId: 'custom-stub-1',
      matchId: 'm-custom',
      cartridgeId: 'sector-smuggler',
      roll,
    });

    const first = await vault.resolveStub(
      banked.stubId,
      undefined,
      '2026-11-19T12:00:00.000Z'
    );
    const second = await vault.resolveStub(
      banked.stubId,
      undefined,
      '2026-11-19T13:00:00.000Z'
    );
    expect(second).toEqual(first);
  });

  it('supports IndexedDbStubAdapter with real IDB transactions, multi-store version upgrades, and concurrent claim idempotency', async () => {
    const mockIdb = createMockIdbFactory();
    const dbName = 'test_reels_real_idb';
    const sharedSecret = 'idb-test-secret';

    const idbAdapterA = new IndexedDbStubAdapter({
      dbName,
      storeName: 'player_a_store',
      indexedDB: mockIdb,
    });
    const vaultA = new StubVault(idbAdapterA, { vaultSecret: sharedSecret });

    const rollActive = await generateDeterministicRoll('idb-seed', 'm-10', 1);
    const rollExpired = await generateDeterministicRoll('idb-seed', 'm-10', 2);

    await vaultA.bankRollStub({
      stubId: 'idb-stub-active',
      matchId: 'm-10',
      cartridgeId: 'VOID-RUNNER',
      roll: rollActive,
      expiresAt: '2026-12-01T00:00:00.000Z',
    });

    await vaultA.bankRollStub({
      stubId: 'idb-stub-expired',
      matchId: 'm-10',
      cartridgeId: 'VOID-RUNNER',
      roll: rollExpired,
      expiresAt: '2026-11-01T00:00:00.000Z',
    });

    await idbAdapterA.close();

    // Open a second storeName on the same database to test dynamic version upgrade
    const idbAdapterB = new IndexedDbStubAdapter({
      dbName,
      storeName: 'player_b_store',
      indexedDB: mockIdb,
    });
    const vaultB = new StubVault(idbAdapterB, { vaultSecret: sharedSecret });
    await vaultB.bankRollStub({
      stubId: 'idb-stub-player-b',
      matchId: 'm-10',
      cartridgeId: 'VOID-RUNNER',
      roll: rollActive,
    });
    expect(await vaultB.listActiveStubs()).toHaveLength(1);
    await idbAdapterB.close();

    // Reopen first store and verify concurrent claims return identical receipt
    const idbAdapterA2 = new IndexedDbStubAdapter({
      dbName,
      storeName: 'player_a_store',
      indexedDB: mockIdb,
    });
    const vaultA2 = new StubVault(idbAdapterA2, { vaultSecret: sharedSecret });

    const active = await vaultA2.listActiveStubs('2026-11-15T00:00:00.000Z');
    expect(active).toHaveLength(1);
    expect(active[0].stubId).toBe('idb-stub-active');

    const purgedCount = await vaultA2.purgeExpired('2026-11-15T00:00:00.000Z');
    expect(purgedCount).toBe(1);

    const [resA, resB] = await Promise.all([
      vaultA2.resolveStub(
        'idb-stub-active',
        {
          rollIndex: 1,
          minigameId: 'g1',
          rawScore: 10,
          maxScore: 100,
          clientSignature: 's1',
          submittedAt: '2026-11-15T01:00:00.000Z',
        },
        '2026-11-15T01:00:00.000Z'
      ),
      vaultA2.resolveStub(
        'idb-stub-active',
        {
          rollIndex: 1,
          minigameId: 'g1',
          rawScore: 99,
          maxScore: 100,
          clientSignature: 's2',
          submittedAt: '2026-11-15T01:00:05.000Z',
        },
        '2026-11-15T01:00:05.000Z'
      ),
    ]);
    expect(resB).toEqual(resA);
  });

  it('supports ExpoSqliteStubAdapter via createExpoSqliteStubAdapter with concurrent claim protection', async () => {
    const sqliteDb = new MockSqliteDb();
    const sharedSecret = 'sqlite-test-secret';
    const sqliteAdapter = createExpoSqliteStubAdapter(sqliteDb);
    expect(sqliteAdapter).toBeInstanceOf(ExpoSqliteStubAdapter);

    const vault = new StubVault(sqliteAdapter, { vaultSecret: sharedSecret });
    const roll = await generateDeterministicRoll('sqlite-seed', 'm-sqlite', 7);

    const banked = await vault.bankRollStub({
      stubId: 'sqlite-stub-7',
      matchId: 'm-sqlite',
      cartridgeId: 'dart-up',
      roll,
      expiresAt: null,
    });

    const reopenedVault = new StubVault(createExpoSqliteStubAdapter(sqliteDb), {
      vaultSecret: sharedSecret,
    });
    const listed = await reopenedVault.listActiveStubs();
    expect(listed).toHaveLength(1);
    expect(listed[0].stubId).toBe(banked.stubId);

    const [firstClaim, repeatClaim] = await Promise.all([
      reopenedVault.resolveStub(
        banked.stubId,
        undefined,
        '2026-11-19T10:00:00.000Z'
      ),
      reopenedVault.resolveStub(
        banked.stubId,
        undefined,
        '2026-11-19T11:00:00.000Z'
      ),
    ]);

    expect(repeatClaim).toEqual(firstClaim);
    expect(await reopenedVault.listActiveStubs()).toHaveLength(0);
  });

  it('requires an explicit vaultSecret for durable IndexedDB and SQLite adapters', () => {
    const idb = new IndexedDbStubAdapter({ indexedDB: createMockIdbFactory() });
    const sqlite = createExpoSqliteStubAdapter(new MockSqliteDb());

    expect(() => new StubVault(idb)).toThrow(/explicit non-empty vaultSecret/i);
    expect(() => new StubVault(sqlite, { vaultSecret: '   ' })).toThrow(
      /explicit non-empty vaultSecret/i
    );
  });

  it('does not purge already-resolved stubs during SQLite or IndexedDB expiry cleanup', async () => {
    const sqliteDb = new MockSqliteDb();
    const sqliteAdapter = createExpoSqliteStubAdapter(sqliteDb);
    const vault = new StubVault(sqliteAdapter, { vaultSecret: 'durable-key' });
    const roll = await generateDeterministicRoll('purge-seed', 'm-purge', 1);

    const banked = await vault.bankRollStub({
      stubId: 'sqlite-resolved-before-expiry',
      matchId: 'm-purge',
      cartridgeId: 'VOID-RUNNER',
      roll,
      expiresAt: '2026-11-10T00:00:00.000Z',
    });

    await vault.resolveStub(banked.stubId, undefined, '2026-11-09T12:00:00.000Z');

    const purged = await vault.purgeExpired('2026-11-15T00:00:00.000Z');
    expect(purged).toBe(0);
    expect((await sqliteAdapter.getStub(banked.stubId))?.status).toBe('resolved');
  });
});
