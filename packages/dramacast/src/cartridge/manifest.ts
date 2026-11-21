import type {
  CartridgeGenre,
  CartridgePluginAdapter,
  CartridgePluginManifest,
  CartridgeTelemetrySchemaField,
} from '../types';

const CARTRIDGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const VALID_GENRES: ReadonlySet<CartridgeGenre> = new Set([
  'arcade',
  'strategy',
  'smuggler',
  'puzzle',
  'roguelike',
  'custom',
]);

const VALID_CAMERA_MODES = new Set([
  'fixed',
  'follow_entity',
  'board_overview',
  'split_focus',
]);

const VALID_FIELD_TYPES = new Set([
  'int16',
  'uint16',
  'float32',
  'bool',
  'enum',
]);

/**
 * Error thrown when a Cartridge Plugin Manifest fails schema or compatibility validation.
 */
export class CartridgeManifestError extends Error {
  readonly cartridgeId: string;
  readonly violations: readonly string[];

  constructor(cartridgeId: string, violations: readonly string[]) {
    super(
      `Invalid cartridge manifest "${cartridgeId}": ${violations.join('; ')}`
    );
    this.name = 'CartridgeManifestError';
    this.cartridgeId = cartridgeId;
    this.violations = [...violations];
    Object.setPrototypeOf(this, CartridgeManifestError.prototype);
  }
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

function parseSemverTuple(version: string): ParsedSemver | null {
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/**
 * Returns true if `currentVersion` satisfies `>= minVersion` using SemVer 2.0.0
 * major.minor.patch + prerelease precedence (build metadata ignored).
 */
export function isVersionAtLeast(
  currentVersion: string,
  minVersion: string
): boolean {
  const current = parseSemverTuple(currentVersion);
  const minimum = parseSemverTuple(minVersion);
  if (!current || !minimum) return false;

  const currentParts = [current.major, current.minor, current.patch];
  const minParts = [minimum.major, minimum.minor, minimum.patch];
  for (let i = 0; i < 3; i++) {
    if (currentParts[i] > minParts[i]) return true;
    if (currentParts[i] < minParts[i]) return false;
  }

  if (current.prerelease === null && minimum.prerelease !== null) return true;
  if (current.prerelease !== null && minimum.prerelease === null) return false;
  if (current.prerelease !== null && minimum.prerelease !== null) {
    return current.prerelease >= minimum.prerelease;
  }
  return true;
}

function validateTelemetryField(
  field: CartridgeTelemetrySchemaField,
  index: number,
  seenKeys: Set<string>,
  violations: string[]
): void {
  if (!field.key || typeof field.key !== 'string' || !field.key.trim()) {
    violations.push(`telemetryFields[${index}].key must be a non-empty string`);
  } else if (seenKeys.has(field.key)) {
    violations.push(`Duplicate telemetry field key "${field.key}"`);
  } else {
    seenKeys.add(field.key);
  }

  if (!VALID_FIELD_TYPES.has(field.type)) {
    violations.push(
      `telemetryFields[${index}].type "${String(field.type)}" is unsupported`
    );
  }

  if (field.type === 'enum') {
    if (!Array.isArray(field.enumValues) || field.enumValues.length === 0) {
      violations.push(
        `telemetryFields[${index}] (${field.key}) of type "enum" requires non-empty enumValues`
      );
    }
  }

  if (
    typeof field.min === 'number' &&
    typeof field.max === 'number' &&
    field.min > field.max
  ) {
    violations.push(
      `telemetryFields[${index}] (${field.key}) min (${field.min}) cannot exceed max (${field.max})`
    );
  }
}

/**
 * Validates a `CartridgePluginManifest` and returns a list of violation strings (empty if valid).
 */
export function collectCartridgeManifestViolations(
  manifest: CartridgePluginManifest
): string[] {
  const violations: string[] = [];

  if (
    typeof manifest.cartridgeId !== 'string' ||
    !CARTRIDGE_ID_PATTERN.test(manifest.cartridgeId)
  ) {
    violations.push(
      'cartridgeId must be a lowercase kebab-case slug (e.g., "sector-smuggler")'
    );
  }

  if (typeof manifest.version !== 'string' || !parseSemverTuple(manifest.version)) {
    violations.push('version must be a valid semver string (e.g., "1.0.0")');
  }

  if (
    typeof manifest.minReelsEngineVersion !== 'string' ||
    !parseSemverTuple(manifest.minReelsEngineVersion)
  ) {
    violations.push(
      'minReelsEngineVersion must be a valid semver string (e.g., "0.1.0")'
    );
  }

  if (typeof manifest.title !== 'string' || !manifest.title.trim()) {
    violations.push('title must be a non-empty string');
  }

  if (!VALID_GENRES.has(manifest.genre)) {
    violations.push(`genre "${String(manifest.genre)}" is not a supported CartridgeGenre`);
  }

  if (!manifest.viewport || typeof manifest.viewport !== 'object') {
    violations.push('viewport specification is required');
  } else {
    if (
      !Number.isFinite(manifest.viewport.width) ||
      manifest.viewport.width <= 0
    ) {
      violations.push('viewport.width must be a positive finite number');
    }
    if (
      !Number.isFinite(manifest.viewport.height) ||
      manifest.viewport.height <= 0
    ) {
      violations.push('viewport.height must be a positive finite number');
    }
    if (
      typeof manifest.viewport.aspectRatio !== 'string' ||
      !manifest.viewport.aspectRatio.trim()
    ) {
      violations.push('viewport.aspectRatio must be a non-empty string');
    }
    if (!VALID_CAMERA_MODES.has(manifest.viewport.cameraMode)) {
      violations.push(
        `viewport.cameraMode "${String(manifest.viewport.cameraMode)}" is unsupported`
      );
    }
  }

  if (!Array.isArray(manifest.eventTags) || manifest.eventTags.length === 0) {
    violations.push('eventTags must contain at least one event tag');
  }

  if (!Array.isArray(manifest.telemetryFields)) {
    violations.push('telemetryFields must be an array');
  } else {
    const seenKeys = new Set<string>();
    manifest.telemetryFields.forEach((field, idx) =>
      validateTelemetryField(field, idx, seenKeys, violations)
    );
  }

  if (manifest.dramaWeights) {
    for (const [key, val] of Object.entries(manifest.dramaWeights)) {
      if (val !== undefined && (!Number.isFinite(val) || val < 0)) {
        violations.push(`dramaWeights.${key} must be a non-negative finite number`);
      }
    }
  }

  if (typeof manifest.supportsPresencePiP !== 'boolean') {
    violations.push('supportsPresencePiP must be a boolean');
  }

  return violations;
}

/**
 * Validates a `CartridgePluginManifest`, throwing `CartridgeManifestError` if invalid,
 * and returns a shallow-frozen normalized copy.
 */
export function validateCartridgeManifest(
  manifest: CartridgePluginManifest
): CartridgePluginManifest {
  const violations = collectCartridgeManifestViolations(manifest);
  if (violations.length > 0) {
    throw new CartridgeManifestError(
      manifest?.cartridgeId ?? '<unknown>',
      violations
    );
  }
  return Object.freeze({
    ...manifest,
    viewport: Object.freeze({ ...manifest.viewport }),
    eventTags: Object.freeze([...manifest.eventTags]),
    telemetryFields: Object.freeze(
      manifest.telemetryFields.map((f) => Object.freeze({ ...f }))
    ),
    dramaWeights: manifest.dramaWeights
      ? Object.freeze({ ...manifest.dramaWeights })
      : undefined,
  });
}

/**
 * Convenience builder producing a valid baseline `CartridgePluginManifest` with sensible defaults.
 */
export function createDefaultCartridgeManifest(
  overrides: Partial<CartridgePluginManifest> & { cartridgeId: string; title: string }
): CartridgePluginManifest {
  return validateCartridgeManifest({
    version: '0.1.0',
    genre: 'arcade',
    minReelsEngineVersion: '0.1.0',
    viewport: {
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      cameraMode: 'board_overview',
    },
    eventTags: ['SECTOR_DRIFT', 'HIGH_STAKES_CLASH', 'CLIMAX_ROLL'],
    telemetryFields: [
      { key: 'score', type: 'int16', min: 0, max: 32767 },
      { key: 'hullIntegrity', type: 'uint16', min: 0, max: 100 },
    ],
    supportsPresencePiP: true,
    ...overrides,
  });
}

/**
 * In-memory registry managing validated cartridge manifests and runtime adapters.
 */
export class CartridgeRegistry {
  private readonly manifests = new Map<string, CartridgePluginManifest>();
  private readonly adapters = new Map<string, CartridgePluginAdapter<unknown>>();
  private readonly reelsEngineVersion: string;

  constructor(reelsEngineVersion: string = '0.1.0') {
    this.reelsEngineVersion = reelsEngineVersion;
  }

  registerManifest(manifest: CartridgePluginManifest): CartridgePluginManifest {
    const validated = validateCartridgeManifest(manifest);
    if (
      !isVersionAtLeast(
        this.reelsEngineVersion,
        validated.minReelsEngineVersion
      )
    ) {
      throw new CartridgeManifestError(validated.cartridgeId, [
        `requires @digitalcanopy/reels-engine >= ${validated.minReelsEngineVersion} (host is ${this.reelsEngineVersion})`,
      ]);
    }
    this.manifests.set(validated.cartridgeId, validated);
    return validated;
  }

  registerAdapter<TState>(
    adapter: CartridgePluginAdapter<TState>
  ): CartridgePluginManifest {
    const validated = this.registerManifest(adapter.manifest);
    this.adapters.set(
      validated.cartridgeId,
      adapter as CartridgePluginAdapter<unknown>
    );
    return validated;
  }

  has(cartridgeId: string): boolean {
    return this.manifests.has(cartridgeId);
  }

  getManifest(cartridgeId: string): CartridgePluginManifest | undefined {
    return this.manifests.get(cartridgeId);
  }

  getAdapter<TState = Record<string, unknown>>(
    cartridgeId: string
  ): CartridgePluginAdapter<TState> | undefined {
    return this.adapters.get(cartridgeId) as
      | CartridgePluginAdapter<TState>
      | undefined;
  }

  listManifests(): CartridgePluginManifest[] {
    return Array.from(this.manifests.values());
  }

  unregister(cartridgeId: string): boolean {
    this.adapters.delete(cartridgeId);
    return this.manifests.delete(cartridgeId);
  }
}
