import type {
  BankedStub,
  BlindSkillSubmission,
  DeterministicRoll,
  StubResolutionRecord,
} from '../types';
import { resolveBlindCheckSubSeed, sha256Hex } from '../prng';
import {
  getDefaultEphemeralVaultSecret,
  sealStubRollPayload,
  unsealStubRollPayload,
} from './crypto';
import { isStubExpired, type IStubStorageAdapter } from './adapters';

export * from './crypto';
export * from './adapters';

export interface BankRollAsStubInput {
  stubId?: string;
  matchId: string;
  cartridgeId: string;
  roll: DeterministicRoll;
  expiresAt?: string | null;
}

export interface StubVaultOptions {
  vaultSecret?: string;
}

/**
 * High-level Bonus Stub Vault coordinator providing encrypted banking,
 * active stub querying, expiration purging, and idempotent double-claim-proof resolution.
 */
export class StubVault {
  private readonly adapter: IStubStorageAdapter;
  private readonly vaultSecret: string;
  private readonly resolutionCache = new Map<string, StubResolutionRecord>();
  private readonly inflightResolutions = new Map<
    string,
    Promise<StubResolutionRecord>
  >();

  constructor(adapter: IStubStorageAdapter, options?: StubVaultOptions) {
    this.adapter = adapter;
    this.vaultSecret =
      options?.vaultSecret ?? getDefaultEphemeralVaultSecret();
  }

  getStorageAdapter(): IStubStorageAdapter {
    return this.adapter;
  }

  async bankRollStub(input: BankRollAsStubInput): Promise<BankedStub> {
    const stubId =
      input.stubId ??
      `stub:${input.matchId}:${input.cartridgeId}:${input.roll.index}`;
    const sealedPayload = await sealStubRollPayload(
      input.roll,
      this.vaultSecret
    );

    const bankedStub: BankedStub = {
      stubId,
      matchId: input.matchId,
      cartridgeId: input.cartridgeId,
      rollIndex: input.roll.index,
      sealedPayload,
      expiresAt: input.expiresAt ?? null,
    };

    await this.adapter.putStub(bankedStub);
    return bankedStub;
  }

  async putStub(stub: BankedStub): Promise<void> {
    await this.adapter.putStub(stub);
  }

  async listActiveStubs(nowIso?: string): Promise<BankedStub[]> {
    return this.adapter.listActiveStubs(nowIso);
  }

  async purgeExpired(nowIso?: string): Promise<number> {
    return this.adapter.purgeExpired(nowIso);
  }

  async resolveStub(
    stubId: string,
    submission?: BlindSkillSubmission,
    resolvedAt: string = new Date().toISOString()
  ): Promise<StubResolutionRecord> {
    const existingInflight = this.inflightResolutions.get(stubId);
    if (existingInflight) {
      return existingInflight;
    }

    const task = this.executeResolveStub(stubId, submission, resolvedAt).finally(
      () => {
        this.inflightResolutions.delete(stubId);
      }
    );

    this.inflightResolutions.set(stubId, task);
    return task;
  }

  private async executeResolveStub(
    stubId: string,
    submission?: BlindSkillSubmission,
    resolvedAt: string = new Date().toISOString()
  ): Promise<StubResolutionRecord> {
    const existing = this.adapter.getStub
      ? await this.adapter.getStub(stubId)
      : null;

    if (existing && existing.status === 'resolved' && existing.resolution) {
      this.resolutionCache.set(stubId, { ...existing.resolution });
      return { ...existing.resolution };
    }

    const cachedReceipt = this.resolutionCache.get(stubId);
    if (cachedReceipt) {
      return { ...cachedReceipt };
    }

    const nowMs = Date.parse(resolvedAt);
    const effectiveNowMs = Number.isNaN(nowMs) ? Date.now() : nowMs;

    let targetStub = existing?.stub;
    if (!targetStub) {
      const active = await this.adapter.listActiveStubs(resolvedAt);
      targetStub = active.find((s) => s.stubId === stubId);
    }

    if (!targetStub) {
      throw new Error(`BankedStub "${stubId}" not found.`);
    }

    if (isStubExpired(targetStub.expiresAt, effectiveNowMs)) {
      throw new Error(
        `BankedStub "${stubId}" has expired (${targetStub.expiresAt}) and cannot be claimed.`
      );
    }

    const roll = await unsealStubRollPayload(
      targetStub.sealedPayload,
      this.vaultSecret
    );

    const effectiveSubmission: BlindSkillSubmission = submission ?? {
      rollIndex: roll.index,
      minigameId: 'auto-vault-claim',
      rawScore: 50,
      maxScore: 100,
      clientSignature: `vault-auto:${stubId}`,
      submittedAt: resolvedAt,
    };

    const checkResult = await resolveBlindCheckSubSeed(
      roll,
      effectiveSubmission
    );
    const outcomeHash = await sha256Hex(
      `reels:stub-outcome:v1:${stubId}:${checkResult.selectedSubSeed}:${checkResult.selectedTier}`
    );

    const resolution: StubResolutionRecord = {
      stubId: targetStub.stubId,
      matchId: targetStub.matchId,
      cartridgeId: targetStub.cartridgeId,
      rollIndex: targetStub.rollIndex,
      resolvedAt,
      selectedSubSeed: checkResult.selectedSubSeed,
      selectedTier: checkResult.selectedTier,
      outcomeHash,
      submission: effectiveSubmission,
    };

    const saved = await this.adapter.markStubResolved(stubId, resolution);
    this.resolutionCache.set(stubId, { ...saved });
    return { ...saved };
  }
}
