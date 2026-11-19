export class TelemetryCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelemetryCodecError';
    Object.setPrototypeOf(this, TelemetryCodecError.prototype);
  }
}

export class ByteWriter {
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

  writeFloat64(v: number): void {
    this.ensure(8);
    const view = new DataView(this.buf.buffer, this.buf.byteOffset + this.len, 8);
    view.setFloat64(0, v, false);
    this.len += 8;
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

export class ByteReader {
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

  readFloat64(): number {
    this.assertAvailable(8);
    const view = new DataView(
      this.data.buffer,
      this.data.byteOffset + this.offset,
      8
    );
    const val = view.getFloat64(0, false);
    this.offset += 8;
    return val;
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

const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Encodes raw telemetry bytes to portable URL-safe base64 without Node Buffer dependencies.
 */
export function telemetryBytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64URL_ALPHABET[(triplet >>> 18) & 0x3f];
    out += BASE64URL_ALPHABET[(triplet >>> 12) & 0x3f];
    if (hasB1) out += BASE64URL_ALPHABET[(triplet >>> 6) & 0x3f];
    if (hasB2) out += BASE64URL_ALPHABET[triplet & 0x3f];
  }
  return out;
}

/**
 * Decodes URL-safe base64 telemetry strings back to `Uint8Array`.
 */
export function base64UrlToTelemetryBytes(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '');
  if (clean.length % 4 === 1) {
    throw new TelemetryCodecError('Invalid base64url telemetry length.');
  }
  const lookup = new Map<string, number>();
  for (let i = 0; i < BASE64URL_ALPHABET.length; i++) {
    lookup.set(BASE64URL_ALPHABET[i], i);
  }

  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = lookup.get(clean[i]);
    const c1 = lookup.get(clean[i + 1]);
    if (c0 === undefined || c1 === undefined) {
      throw new TelemetryCodecError('Invalid base64url telemetry character.');
    }
    const hasC2 = i + 2 < clean.length;
    const hasC3 = i + 3 < clean.length;
    const c2 = hasC2 ? lookup.get(clean[i + 2]) : undefined;
    const c3 = hasC3 ? lookup.get(clean[i + 3]) : undefined;
    if ((hasC2 && c2 === undefined) || (hasC3 && c3 === undefined)) {
      throw new TelemetryCodecError('Invalid base64url telemetry character.');
    }

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
