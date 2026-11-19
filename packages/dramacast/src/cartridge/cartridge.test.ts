import { describe, it, expect } from 'vitest';
import {
  CartridgeManifestError,
  CartridgeRegistry,
  collectCartridgeManifestViolations,
  createDefaultCartridgeManifest,
  isVersionAtLeast,
  validateCartridgeManifest,
} from './index';
import type { CartridgePluginAdapter } from '../types';

describe('@digitalcanopy/dramacast Cartridge Plugin Manifest Contract', () => {
  it('validates and freezes a compliant cartridge manifest', () => {
    const manifest = createDefaultCartridgeManifest({
      cartridgeId: 'sector-smuggler',
      title: 'Sector Smuggler',
      genre: 'smuggler',
      version: '1.2.0',
    });

    expect(manifest.cartridgeId).toBe('sector-smuggler');
    expect(manifest.supportsPresencePiP).toBe(true);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.viewport)).toBe(true);
    expect(collectCartridgeManifestViolations(manifest)).toEqual([]);
  });

  it('rejects malformed cartridgeId, invalid semver, duplicate telemetry keys, and empty enumValues', () => {
    expect(() =>
      validateCartridgeManifest({
        cartridgeId: 'Invalid_ID!',
        version: 'bad',
        title: '',
        genre: 'smuggler',
        minReelsEngineVersion: '0.1.0',
        viewport: {
          width: 0,
          height: -10,
          aspectRatio: '',
          cameraMode: 'board_overview',
        },
        eventTags: [],
        telemetryFields: [
          { key: 'hull', type: 'uint16', min: 100, max: 10 },
          { key: 'hull', type: 'enum', enumValues: [] },
        ],
        dramaWeights: { comebackSwingWeight: -1 },
        supportsPresencePiP: true,
      })
    ).toThrow(CartridgeManifestError);
  });

  it('enforces minReelsEngineVersion compatibility in CartridgeRegistry and registers adapters', () => {
    const registry = new CartridgeRegistry('0.1.0');

    const incompatible = createDefaultCartridgeManifest({
      cartridgeId: 'future-cartridge',
      title: 'Future Cartridge',
      minReelsEngineVersion: '0.2.0',
    });

    expect(() => registry.registerManifest(incompatible)).toThrow(
      CartridgeManifestError
    );

    interface SmugglerState {
      hull: number;
      credits: number;
    }

    const adapter: CartridgePluginAdapter<SmugglerState> = {
      manifest: createDefaultCartridgeManifest({
        cartridgeId: 'sector-smuggler',
        title: 'Sector Smuggler',
        minReelsEngineVersion: '0.1.0',
      }),
      serializeStateSnapshot: (s) => ({ hull: s.hull, credits: s.credits }),
      deserializeStateSnapshot: (snap) => ({
        hull: Number(snap.hull ?? 100),
        credits: Number(snap.credits ?? 0),
      }),
      computeWinProbability: (s) => Math.max(0, Math.min(1, s.hull / 100)),
    };

    registry.registerAdapter(adapter);
    expect(registry.has('sector-smuggler')).toBe(true);
    expect(registry.listManifests()).toHaveLength(1);
    const resolved = registry.getAdapter<SmugglerState>('sector-smuggler');
    expect(resolved?.computeWinProbability?.({ hull: 42, credits: 500 })).toBeCloseTo(
      0.42
    );

    expect(isVersionAtLeast('1.0.0', '0.9.9')).toBe(true);
    expect(isVersionAtLeast('0.1.0', '0.1.0')).toBe(true);
    expect(isVersionAtLeast('0.1.0', '0.2.0')).toBe(false);
  });
});
