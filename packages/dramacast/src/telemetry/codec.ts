import type {
  EncodedTelemetryBundle,
  TelemetryFrame,
  TelemetryStreamHeader,
} from '../types';
import { ByteReader, ByteWriter, TelemetryCodecError } from './binary';

export {
  TelemetryCodecError,
  base64UrlToTelemetryBytes,
  telemetryBytesToBase64Url,
} from './binary';

export const TELEMETRY_MAGIC = 'DCAST1' as const;
export const TELEMETRY_CODEC_VERSION = 1;
export const DEFAULT_QUANTIZATION_SCALE = 1000;
export const MAX_VECTOR_DIMENSIONS = 4096;
export const MAX_FRAME_COUNT = 1_000_000;
export const MAX_STATE_DELTA_KEYS = 256;

export const TELEMETRY_FLAG_HIGH_STAKES = 1 << 0;
export const TELEMETRY_FLAG_MISFIRE = 1 << 1;
export const TELEMETRY_FLAG_BLIND_RECOVERY = 1 << 2;

const STATE_DELTA_TYPE_NUMBER = 0;
const STATE_DELTA_TYPE_BOOLEAN = 1;
const STATE_DELTA_TYPE_STRING = 2;

export interface EncodeTelemetryOptions {
  matchId: string;
  cartridgeId: string;
  rootSeedHash?: string;
  quantizationScale?: number;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function writeStateDelta(
  writer: ByteWriter,
  stateDelta: Record<string, number | boolean | string> | undefined
): void {
  if (!stateDelta) {
    writer.writeVarUint(0);
    return;
  }
  const entries = Object.entries(stateDelta);
  if (entries.length > MAX_STATE_DELTA_KEYS) {
    throw new TelemetryCodecError(
      `stateDelta key count (${entries.length}) exceeds maximum (${MAX_STATE_DELTA_KEYS}).`
    );
  }
  writer.writeVarUint(entries.length);
  for (const [key, val] of entries) {
    writer.writeUtf8(key);
    if (typeof val === 'number') {
      writer.writeUint8(STATE_DELTA_TYPE_NUMBER);
      writer.writeFloat64(val);
    } else if (typeof val === 'boolean') {
      writer.writeUint8(STATE_DELTA_TYPE_BOOLEAN);
      writer.writeUint8(val ? 1 : 0);
    } else if (typeof val === 'string') {
      writer.writeUint8(STATE_DELTA_TYPE_STRING);
      writer.writeUtf8(val);
    } else {
      throw new TelemetryCodecError(
        `Unsupported stateDelta value type for key "${key}".`
      );
    }
  }
}

function readStateDelta(
  reader: ByteReader
): Record<string, number | boolean | string> | undefined {
  const entryCount = reader.readVarUint();
  if (entryCount === 0) return undefined;
  if (entryCount > MAX_STATE_DELTA_KEYS || entryCount * 3 > reader.remaining) {
    throw new TelemetryCodecError(
      `Invalid stateDelta entry count (${entryCount}) for remaining stream bytes.`
    );
  }
  const delta: Record<string, number | boolean | string> = {};
  for (let i = 0; i < entryCount; i++) {
    const key = reader.readUtf8();
    const typeTag = reader.readUint8();
    if (typeTag === STATE_DELTA_TYPE_NUMBER) {
      delta[key] = reader.readFloat64();
    } else if (typeTag === STATE_DELTA_TYPE_BOOLEAN) {
      delta[key] = reader.readUint8() !== 0;
    } else if (typeTag === STATE_DELTA_TYPE_STRING) {
      delta[key] = reader.readUtf8();
    } else {
      throw new TelemetryCodecError(
        `Unsupported stateDelta type tag ${typeTag} for key "${key}".`
      );
    }
  }
  return delta;
}

/**
 * Encodes an ordered array of `TelemetryFrame`s into a compact delta-varint binary `EncodedTelemetryBundle`.
 */
export function encodeTelemetryBundle(
  frames: readonly TelemetryFrame[],
  options: EncodeTelemetryOptions
): EncodedTelemetryBundle {
  const sorted = [...frames].sort((a, b) => a.tMs - b.tMs || a.seq - b.seq);
  const quantizationScale = Math.max(
    1,
    Math.floor(options.quantizationScale ?? DEFAULT_QUANTIZATION_SCALE)
  );
  const vectorDimensions = sorted.reduce(
    (maxDim, f) => Math.max(maxDim, f.boardVector?.length ?? 0),
    0
  );
  if (vectorDimensions > MAX_VECTOR_DIMENSIONS) {
    throw new TelemetryCodecError(
      `Vector dimensions (${vectorDimensions}) exceed maximum (${MAX_VECTOR_DIMENSIONS}).`
    );
  }
  const durationMs =
    sorted.length > 0 ? Math.max(0, Math.round(sorted[sorted.length - 1].tMs)) : 0;

  const header: TelemetryStreamHeader = {
    magic: TELEMETRY_MAGIC,
    version: TELEMETRY_CODEC_VERSION,
    matchId: options.matchId,
    cartridgeId: options.cartridgeId,
    rootSeedHash: options.rootSeedHash ?? '',
    durationMs,
    frameCount: sorted.length,
    vectorDimensions,
    quantizationScale,
  };

  const writer = new ByteWriter();
  for (let i = 0; i < TELEMETRY_MAGIC.length; i++) {
    writer.writeUint8(TELEMETRY_MAGIC.charCodeAt(i));
  }
  writer.writeUint8(TELEMETRY_CODEC_VERSION);
  writer.writeUtf8(header.matchId);
  writer.writeUtf8(header.cartridgeId);
  writer.writeUtf8(header.rootSeedHash);
  writer.writeUint32(header.durationMs);
  writer.writeVarUint(header.frameCount);
  writer.writeVarUint(header.vectorDimensions);
  writer.writeVarUint(header.quantizationScale);

  let prevTMs = 0;
  let prevRollIndex = 0;
  let prevScore = 0;
  const prevVector =
    vectorDimensions > 0 ? new Array<number>(vectorDimensions).fill(0) : [];

  for (const frame of sorted) {
    const tMs = Math.max(prevTMs, Math.round(frame.tMs));
    const dtMs = tMs - prevTMs;
    prevTMs = tMs;

    const rollIndex = Math.trunc(frame.rollIndex);
    const dRoll = rollIndex - prevRollIndex;
    prevRollIndex = rollIndex;

    const score = Math.round(frame.score);
    const dScore = score - prevScore;
    prevScore = score;

    const winProbQ = Math.round(clamp(frame.winProbability, 0, 1) * 10000);
    const dramaQ = Math.round(clamp(frame.dramaIndex, 0, 100) * 100);
    const metaByte =
      ((frame.tierIndex & 0x03) | ((frame.flags & 0x3f) << 2)) & 0xff;

    writer.writeVarUint(dtMs);
    writer.writeVarSint(dRoll);
    writer.writeUint16(winProbQ);
    writer.writeUint16(dramaQ);
    writer.writeVarSint(dScore);
    writer.writeUint8(metaByte);

    for (let d = 0; d < vectorDimensions; d++) {
      const rawVal = frame.boardVector?.[d] ?? 0;
      const quantized = Math.round(
        (Number.isFinite(rawVal) ? rawVal : 0) * quantizationScale
      );
      writer.writeVarSint(quantized - prevVector[d]);
      prevVector[d] = quantized;
    }

    writeStateDelta(writer, frame.stateDelta);
  }

  const payload = writer.toUint8Array();
  const jsonBytes = new TextEncoder().encode(JSON.stringify(sorted)).length;
  const compressionRatioEstimate =
    payload.length > 0 ? Math.round((jsonBytes / payload.length) * 100) / 100 : 1;

  return {
    header,
    payload,
    byteLength: payload.length,
    compressionRatioEstimate,
  };
}

/**
 * Decodes a binary `DCAST1` telemetry payload back into its header and `TelemetryFrame[]`.
 */
export function decodeTelemetryBundle(payload: Uint8Array): {
  header: TelemetryStreamHeader;
  frames: TelemetryFrame[];
} {
  if (!(payload instanceof Uint8Array) || payload.length < 10) {
    throw new TelemetryCodecError('Invalid or empty telemetry payload.');
  }

  const reader = new ByteReader(payload);
  let magic = '';
  for (let i = 0; i < TELEMETRY_MAGIC.length; i++) {
    magic += String.fromCharCode(reader.readUint8());
  }
  if (magic !== TELEMETRY_MAGIC) {
    throw new TelemetryCodecError(`Invalid telemetry magic "${magic}".`);
  }

  const version = reader.readUint8();
  if (version !== TELEMETRY_CODEC_VERSION) {
    throw new TelemetryCodecError(`Unsupported telemetry codec version ${version}.`);
  }

  const matchId = reader.readUtf8();
  const cartridgeId = reader.readUtf8();
  const rootSeedHash = reader.readUtf8();
  const durationMs = reader.readUint32();
  const frameCount = reader.readVarUint();
  const vectorDimensions = reader.readVarUint();
  const quantizationScale = Math.max(1, reader.readVarUint());

  if (vectorDimensions > MAX_VECTOR_DIMENSIONS) {
    throw new TelemetryCodecError(
      `Header vectorDimensions (${vectorDimensions}) exceeds maximum allowed (${MAX_VECTOR_DIMENSIONS}).`
    );
  }
  if (frameCount > MAX_FRAME_COUNT) {
    throw new TelemetryCodecError(
      `Header frameCount (${frameCount}) exceeds maximum allowed (${MAX_FRAME_COUNT}).`
    );
  }
  const minBytesPerFrame = 9 + vectorDimensions;
  if (frameCount > 0 && frameCount * minBytesPerFrame > reader.remaining) {
    throw new TelemetryCodecError(
      `Truncated telemetry payload: ${frameCount} frame(s) require at least ${frameCount * minBytesPerFrame} bytes, but only ${reader.remaining} remain.`
    );
  }

  const header: TelemetryStreamHeader = {
    magic: TELEMETRY_MAGIC,
    version,
    matchId,
    cartridgeId,
    rootSeedHash,
    durationMs,
    frameCount,
    vectorDimensions,
    quantizationScale,
  };

  const frames: TelemetryFrame[] = [];
  let prevTMs = 0;
  let prevRollIndex = 0;
  let prevScore = 0;
  const prevVector =
    frameCount > 0 && vectorDimensions > 0
      ? new Array<number>(vectorDimensions).fill(0)
      : [];

  for (let seq = 0; seq < frameCount; seq++) {
    const dtMs = reader.readVarUint();
    const dRoll = reader.readVarSint();
    const winProbQ = reader.readUint16();
    const dramaQ = reader.readUint16();
    const dScore = reader.readVarSint();
    const metaByte = reader.readUint8();

    prevTMs += dtMs;
    prevRollIndex += dRoll;
    prevScore += dScore;

    let boardVector: number[] | undefined;
    if (vectorDimensions > 0) {
      boardVector = new Array<number>(vectorDimensions);
      for (let d = 0; d < vectorDimensions; d++) {
        prevVector[d] += reader.readVarSint();
        boardVector[d] = prevVector[d] / quantizationScale;
      }
    }

    const stateDelta = readStateDelta(reader);

    frames.push({
      seq,
      tMs: prevTMs,
      rollIndex: prevRollIndex,
      winProbability: winProbQ / 10000,
      dramaIndex: dramaQ / 100,
      score: prevScore,
      tierIndex: (metaByte & 0x03) as 0 | 1 | 2 | 3,
      flags: (metaByte >>> 2) & 0x3f,
      ...(boardVector ? { boardVector } : {}),
      ...(stateDelta ? { stateDelta } : {}),
    });
  }

  return { header, frames };
}
