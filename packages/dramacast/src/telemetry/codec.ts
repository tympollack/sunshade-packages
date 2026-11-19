import type {
  EncodedTelemetryBundle,
  TelemetryFrame,
  TelemetryStreamHeader,
} from '../types';

export const TELEMETRY_MAGIC = 'DCAST1' as const;
export const TELEMETRY_CODEC_VERSION = 1;
export const DEFAULT_QUANTIZATION_SCALE = 1000;

export const TELEMETRY_FLAG_HIGH_STAKES = 1 << 0;
export const TELEMETRY_FLAG_MISFIRE = 1 << 1;
export const TELEMETRY_FLAG_BLIND_RECOVERY = 1 << 2;

export class TelemetryCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelemetryCodecError';
    Object.setPrototypeOf(this, TelemetryCodecError.prototype);
  }
}

export interface EncodeTelemetryOptions {
  matchId: string;
  cartridgeId: string;
  rootSeedHash?: string;
  quantizationScale?: number;
}

class ByteWriter {
  private buf: Uint8Array;
  private len = 0;

  constructor(initialCapacity = 256) {
    this.buf = new Uint8Array(initialCapacity);
  }

  private ensure(extra: number): void {
    if (this.len + extra <= this.buf.length) return;
    let nextCap = this.buf.length * 2;
    while (nextCap < this.len + extra) nextCap *= 2;
    const next = new Uint8Array(nextCap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  writeUint8(v: number): void {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }

  writeUint16(v: number): void {
    this.ensure(2);
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }

  writeUint32(v: number): void {
    this.ensure(4);
    this.buf[this.len++] = (v >>> 24) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }

  writeVarUint(v: number): void {
    let val = Math.max(0, Math.floor(v));
    while (val >= 0x80) {
      this.writeUint8((val % 0x80) | 0x80);
      val = Math.floor(val / 0x80);
    }
    this.writeUint8(val);
  }

  writeVarSint(v: number): void {
    const n = Math.trunc(v);
    const zigzag = n >= 0 ? n * 2 : -n * 2 - 1;
    this.writeVarUint(zigzag);
  }

  writeBytes(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.buf.set(bytes, this.len);
    this.len += bytes.length;
  }

  writeUtf8(str: string): void {
    const encoded = new TextEncoder().encode(str);
    this.writeVarUint(encoded.length);
    this.writeBytes(encoded);
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

class ByteReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  private assertAvailable(count: number): void {
    if (this.offset + count > this.data.length) {
      throw new TelemetryCodecError(
        `Unexpected end of telemetry stream at byte ${this.offset} (needed ${count} bytes).`
      );
    }
  }

  readUint8(): number {
    this.assertAvailable(1);
    return this.data[this.offset++];
  }

  readUint16(): number {
    this.assertAvailable(2);
    const hi = this.data[this.offset++];
    const lo = this.data[this.offset++];
    return (hi << 8) | lo;
  }

  readUint32(): number {
    this.assertAvailable(4);
    const b0 = this.data[this.offset++];
    const b1 = this.data[this.offset++];
    const b2 = this.data[this.offset++];
    const b3 = this.data[this.offset++];
    return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
  }

  readVarUint(): number {
    let result = 0;
    let multiplier = 1;
    for (let i = 0; i < 8; i++) {
      const byte = this.readUint8();
      result += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) return result;
      multiplier *= 128;
    }
    throw new TelemetryCodecError('VarUint exceeds maximum supported width.');
  }

  readVarSint(): number {
    const zigzag = this.readVarUint();
    return zigzag % 2 === 0 ? zigzag / 2 : -((zigzag + 1) / 2);
  }

  readUtf8(): string {
    const byteLen = this.readVarUint();
    this.assertAvailable(byteLen);
    const slice = this.data.subarray(this.offset, this.offset + byteLen);
    this.offset += byteLen;
    return new TextDecoder().decode(slice);
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
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
  const prevVector = new Array<number>(vectorDimensions).fill(0);

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
    const metaByte = ((frame.tierIndex & 0x03) | ((frame.flags & 0x3f) << 2)) & 0xff;

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
  const prevVector = new Array<number>(vectorDimensions).fill(0);

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
    });
  }

  return { header, frames };
}

/**
 * Encodes raw telemetry bytes to portable URL-safe base64 without Node Buffer dependencies.
 */
export function telemetryBytesToBase64Url(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += alphabet[(triplet >>> 18) & 0x3f];
    out += alphabet[(triplet >>> 12) & 0x3f];
    if (hasB1) out += alphabet[(triplet >>> 6) & 0x3f];
    if (hasB2) out += alphabet[triplet & 0x3f];
  }
  return out;
}

/**
 * Decodes URL-safe base64 telemetry strings back to `Uint8Array`.
 */
export function base64UrlToTelemetryBytes(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '');
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const lookup = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) lookup.set(alphabet[i], i);

  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = lookup.get(clean[i]);
    const c1 = lookup.get(clean[i + 1]);
    if (c0 === undefined || c1 === undefined) {
      throw new TelemetryCodecError('Invalid base64url telemetry character.');
    }
    const c2 = i + 2 < clean.length ? lookup.get(clean[i + 2]) : undefined;
    const c3 = i + 3 < clean.length ? lookup.get(clean[i + 3]) : undefined;

    bytes.push((c0 << 2) | (c1 >>> 4));
    if (c2 !== undefined) {
      bytes.push(((c1 & 0x0f) << 4) | (c2 >>> 2));
    }
    if (c3 !== undefined && c2 !== undefined) {
      bytes.push(((c2 & 0x03) << 6) | c3);
    }
  }
  return new Uint8Array(bytes);
}
