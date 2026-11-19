import type {
  BankedStub,
  StubResolutionRecord,
  StubResolutionStatus,
} from '../types';

/**
 * Persisted record format stored inside `IStubStorageAdapter` drivers.
 */
export interface StoredStubRecord {
  stub: BankedStub;
  status: StubResolutionStatus;
  resolution?: StubResolutionRecord;
}

/**
 * Storage adapter contract for offline-first Bonus Stub persistence.
 */
export interface IStubStorageAdapter {
  putStub(stub: BankedStub): Promise<void>;
  listActiveStubs(nowIso?: string): Promise<BankedStub[]>;
  markStubResolved(
    stubId: string,
    resolution: StubResolutionRecord
  ): Promise<StubResolutionRecord>;
  purgeExpired(nowIso?: string): Promise<number>;
  getStub?(stubId: string): Promise<StoredStubRecord | null>;
}

/**
 * Minimal Expo SQLite / generic SQL executor interface so mobile callers can
 * inject an `expo-sqlite` database without adding a native binary dependency to this package.
 */
export interface ISqliteExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<{ changes?: number }>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
}

function isExpired(expiresAt: string | null, nowMs: number): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return false;
  return parsed <= nowMs;
}

/**
 * In-memory storage adapter for unit tests, SSR, and ephemeral environments.
 * Supports snapshot export/rehydration to simulate closing and reopening the store.
 */
export class MemoryStubAdapter implements IStubStorageAdapter {
  private readonly store = new Map<string, StoredStubRecord>();

  constructor(initialSnapshot?: string | StoredStubRecord[]) {
    if (initialSnapshot) {
      this.rehydrate(initialSnapshot);
    }
  }

  async putStub(stub: BankedStub): Promise<void> {
    const existing = this.store.get(stub.stubId);
    if (existing && existing.status === 'resolved') {
      return;
    }
    this.store.set(stub.stubId, {
      stub: { ...stub },
      status: 'active',
    });
  }

  async listActiveStubs(nowIso?: string): Promise<BankedStub[]> {
    const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
    const active: BankedStub[] = [];
    for (const record of this.store.values()) {
      if (record.status === 'active' && !isExpired(record.stub.expiresAt, nowMs)) {
        active.push({ ...record.stub });
      }
    }
    return active.sort((a, b) => a.rollIndex - b.rollIndex);
  }

  async markStubResolved(
    stubId: string,
    resolution: StubResolutionRecord
  ): Promise<StubResolutionRecord> {
    const existing = this.store.get(stubId);
    if (!existing) {
      throw new Error(`BankedStub "${stubId}" not found in StubVault.`);
    }
    if (existing.status === 'resolved' && existing.resolution) {
      return { ...existing.resolution };
    }
    const frozenResolution: StubResolutionRecord = { ...resolution };
    this.store.set(stubId, {
      ...existing,
      status: 'resolved',
      resolution: frozenResolution,
    });
    return { ...frozenResolution };
  }

  async purgeExpired(nowIso?: string): Promise<number> {
    const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
    let purged = 0;
    for (const [stubId, record] of this.store.entries()) {
      if (
        record.status !== 'resolved' &&
        isExpired(record.stub.expiresAt, nowMs)
      ) {
        this.store.delete(stubId);
        purged++;
      }
    }
    return purged;
  }

  async getStub(stubId: string): Promise<StoredStubRecord | null> {
    const record = this.store.get(stubId);
    if (!record) return null;
    return {
      stub: { ...record.stub },
      status: record.status,
      resolution: record.resolution ? { ...record.resolution } : undefined,
    };
  }

  exportSnapshot(): string {
    return JSON.stringify(Array.from(this.store.values()));
  }

  rehydrate(snapshot: string | StoredStubRecord[]): void {
    const records: StoredStubRecord[] =
      typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    this.store.clear();
    for (const rec of records) {
      this.store.set(rec.stub.stubId, {
        stub: { ...rec.stub },
        status: rec.status,
        resolution: rec.resolution ? { ...rec.resolution } : undefined,
      });
    }
  }
}

const virtualIdbRegistry = new Map<string, Map<string, StoredStubRecord>>();

export interface IndexedDbStubAdapterOptions {
  dbName?: string;
  storeName?: string;
  indexedDB?: IDBFactory;
}

/**
 * Browser / PWA IndexedDB storage adapter for `BankedStub` persistence.
 */
export class IndexedDbStubAdapter implements IStubStorageAdapter {
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly idbFactory?: IDBFactory;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(options?: IndexedDbStubAdapterOptions) {
    this.dbName = options?.dbName ?? 'sunshade_reels_stub_vault';
    this.storeName = options?.storeName ?? 'banked_stubs';
    this.idbFactory =
      options?.indexedDB ??
      (typeof globalThis !== 'undefined' ? globalThis.indexedDB : undefined);
  }

  private getVirtualStore(): Map<string, StoredStubRecord> {
    const key = `${this.dbName}::${this.storeName}`;
    let store = virtualIdbRegistry.get(key);
    if (!store) {
      store = new Map<string, StoredStubRecord>();
      virtualIdbRegistry.set(key, store);
    }
    return store;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    if (!this.idbFactory) {
      return Promise.reject(new Error('IndexedDB is not available'));
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.idbFactory!.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'stub.stubId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to open IndexedDB'));
    });

    return this.dbPromise;
  }

  async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }

  async putStub(stub: BankedStub): Promise<void> {
    if (!this.idbFactory) {
      const vStore = this.getVirtualStore();
      const existing = vStore.get(stub.stubId);
      if (existing && existing.status === 'resolved') return;
      vStore.set(stub.stubId, { stub: { ...stub }, status: 'active' });
      return;
    }

    const existing = await this.getStub(stub.stubId);
    if (existing && existing.status === 'resolved') return;

    const db = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({
        stub: { ...stub },
        status: 'active',
      } satisfies StoredStubRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getStub(stubId: string): Promise<StoredStubRecord | null> {
    if (!this.idbFactory) {
      const rec = this.getVirtualStore().get(stubId);
      if (!rec) return null;
      return {
        stub: { ...rec.stub },
        status: rec.status,
        resolution: rec.resolution ? { ...rec.resolution } : undefined,
      };
    }

    const db = await this.openDatabase();
    return new Promise<StoredStubRecord | null>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(stubId);
      req.onsuccess = () => resolve((req.result as StoredStubRecord) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  private async getAllRecords(): Promise<StoredStubRecord[]> {
    if (!this.idbFactory) {
      return Array.from(this.getVirtualStore().values());
    }

    const db = await this.openDatabase();
    return new Promise<StoredStubRecord[]>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () =>
        resolve((req.result as StoredStubRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async listActiveStubs(nowIso?: string): Promise<BankedStub[]> {
    const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
    const all = await this.getAllRecords();
    return all
      .filter(
        (rec) =>
          rec.status === 'active' && !isExpired(rec.stub.expiresAt, nowMs)
      )
      .map((rec) => ({ ...rec.stub }))
      .sort((a, b) => a.rollIndex - b.rollIndex);
  }

  async markStubResolved(
    stubId: string,
    resolution: StubResolutionRecord
  ): Promise<StubResolutionRecord> {
    if (!this.idbFactory) {
      const vStore = this.getVirtualStore();
      const existing = vStore.get(stubId);
      if (!existing) {
        throw new Error(`BankedStub "${stubId}" not found in IndexedDbStubAdapter.`);
      }
      if (existing.status === 'resolved' && existing.resolution) {
        return { ...existing.resolution };
      }
      const frozen = { ...resolution };
      vStore.set(stubId, {
        ...existing,
        status: 'resolved',
        resolution: frozen,
      });
      return { ...frozen };
    }

    const existing = await this.getStub(stubId);
    if (!existing) {
      throw new Error(`BankedStub "${stubId}" not found in IndexedDbStubAdapter.`);
    }
    if (existing.status === 'resolved' && existing.resolution) {
      return { ...existing.resolution };
    }

    const frozen = { ...resolution };
    const db = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({
        ...existing,
        status: 'resolved',
        resolution: frozen,
      } satisfies StoredStubRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return { ...frozen };
  }

  async purgeExpired(nowIso?: string): Promise<number> {
    const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
    if (!this.idbFactory) {
      const vStore = this.getVirtualStore();
      let count = 0;
      for (const [id, rec] of vStore.entries()) {
        if (
          rec.status !== 'resolved' &&
          isExpired(rec.stub.expiresAt, nowMs)
        ) {
          vStore.delete(id);
          count++;
        }
      }
      return count;
    }

    const all = await this.getAllRecords();
    const expiredIds = all
      .filter(
        (rec) =>
          rec.status !== 'resolved' && isExpired(rec.stub.expiresAt, nowMs)
      )
      .map((rec) => rec.stub.stubId);

    if (expiredIds.length === 0) return 0;

    const db = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      for (const id of expiredIds) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return expiredIds.length;
  }
}

interface SqliteStubRow {
  stub_id: string;
  match_id: string;
  cartridge_id: string;
  roll_index: number;
  sealed_payload: string;
  expires_at: string | null;
  status: StubResolutionStatus;
  resolution_json: string | null;
}

/**
 * Expo SQLite / generic SQLite storage adapter implementing `IStubStorageAdapter`.
 */
export class ExpoSqliteStubAdapter implements IStubStorageAdapter {
  private readonly db: ISqliteExecutor;
  private readonly tableName: string;
  private initialized = false;

  constructor(db: ISqliteExecutor, tableName: string = 'reels_stub_vault') {
    this.db = db;
    this.tableName = tableName;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.db.execAsync(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (
        stub_id TEXT PRIMARY KEY NOT NULL,
        match_id TEXT NOT NULL,
        cartridge_id TEXT NOT NULL,
        roll_index INTEGER NOT NULL,
        sealed_payload TEXT NOT NULL,
        expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        resolution_json TEXT
      );`
    );
    this.initialized = true;
  }

  async putStub(stub: BankedStub): Promise<void> {
    await this.ensureInitialized();
    const existing = await this.getStub(stub.stubId);
    if (existing && existing.status === 'resolved') return;

    await this.db.runAsync(
      `INSERT OR REPLACE INTO ${this.tableName}
       (stub_id, match_id, cartridge_id, roll_index, sealed_payload, expires_at, status, resolution_json)
       VALUES (?, ?, ?, ?, ?, ?, 'active', NULL);`,
      [
        stub.stubId,
        stub.matchId,
        stub.cartridgeId,
        stub.rollIndex,
        stub.sealedPayload,
        stub.expiresAt,
      ]
    );
  }

  async getStub(stubId: string): Promise<StoredStubRecord | null> {
    await this.ensureInitialized();
    const row = await this.db.getFirstAsync<SqliteStubRow>(
      `SELECT * FROM ${this.tableName} WHERE stub_id = ?;`,
      [stubId]
    );
    if (!row) return null;
    return {
      stub: {
        stubId: row.stub_id,
        matchId: row.match_id,
        cartridgeId: row.cartridge_id,
        rollIndex: row.roll_index,
        sealedPayload: row.sealed_payload,
        expiresAt: row.expires_at,
      },
      status: row.status,
      resolution: row.resolution_json
        ? (JSON.parse(row.resolution_json) as StubResolutionRecord)
        : undefined,
    };
  }

  async listActiveStubs(nowIso?: string): Promise<BankedStub[]> {
    await this.ensureInitialized();
    const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
    const rows = await this.db.getAllAsync<SqliteStubRow>(
      `SELECT * FROM ${this.tableName} WHERE status = 'active' ORDER BY roll_index ASC;`
    );
    return rows
      .filter((row) => !isExpired(row.expires_at, nowMs))
      .map((row) => ({
        stubId: row.stub_id,
        matchId: row.match_id,
        cartridgeId: row.cartridge_id,
        rollIndex: row.roll_index,
        sealedPayload: row.sealed_payload,
        expiresAt: row.expires_at,
      }));
  }

  async markStubResolved(
    stubId: string,
    resolution: StubResolutionRecord
  ): Promise<StubResolutionRecord> {
    await this.ensureInitialized();
    const existing = await this.getStub(stubId);
    if (!existing) {
      throw new Error(`BankedStub "${stubId}" not found in ExpoSqliteStubAdapter.`);
    }
    if (existing.status === 'resolved' && existing.resolution) {
      return { ...existing.resolution };
    }

    const frozen = { ...resolution };
    await this.db.runAsync(
      `UPDATE ${this.tableName} SET status = 'resolved', resolution_json = ? WHERE stub_id = ?;`,
      [JSON.stringify(frozen), stubId]
    );
    return { ...frozen };
  }

  async purgeExpired(nowIso?: string): Promise<number> {
    await this.ensureInitialized();
    const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
    const rows = await this.db.getAllAsync<SqliteStubRow>(
      `SELECT * FROM ${this.tableName} WHERE status != 'resolved';`
    );
    let purged = 0;
    for (const row of rows) {
      if (isExpired(row.expires_at, nowMs)) {
        await this.db.runAsync(
          `DELETE FROM ${this.tableName} WHERE stub_id = ?;`,
          [row.stub_id]
        );
        purged++;
      }
    }
    return purged;
  }
}

export function createExpoSqliteStubAdapter(
  db: ISqliteExecutor,
  tableName?: string
): ExpoSqliteStubAdapter {
  return new ExpoSqliteStubAdapter(db, tableName);
}
