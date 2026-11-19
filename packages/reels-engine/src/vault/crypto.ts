import type { DeterministicRoll } from '../types';
import { sha256Hex, sha256HexSync } from '../prng';

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    const out = new Uint8Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      out[i] = buf[i];
    }
    return out;
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function hexToBytes(hex: string, byteLength: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

let cachedDefaultProcessSecret: string | null = null;

/**
 * Generates or returns an ephemeral CSPRNG per-process vault secret when no
 * explicit `vaultSecret` is supplied, ensuring no public hardcoded encryption key is used.
 */
export function getDefaultEphemeralVaultSecret(): string {
  if (cachedDefaultProcessSecret) {
    return cachedDefaultProcessSecret;
  }
  const randomBytes = new Uint8Array(32);
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(randomBytes);
    cachedDefaultProcessSecret = bytesToHex(randomBytes);
  } else {
    cachedDefaultProcessSecret = sha256HexSync(
      `reels:ephemeral:${Date.now()}:${Math.random()}`
    );
  }
  return cachedDefaultProcessSecret;
}

function generateFreshIvBytes(plaintextJson: string): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(12);
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(iv);
    return iv;
  }
  const digest = sha256HexSync(
    `reels:vault-iv:v2:${plaintextJson}:${Date.now()}:${Math.random()}`
  );
  return hexToBytes(digest, 12);
}

/**
 * Derives a non-repeating SHA-256 CTR keystream and encrypts/decrypts `input`.
 */
async function sha256CtrTransform(
  input: Uint8Array,
  encKeyHex: string,
  ivHex: string
): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Uint8Array(input.length);
  const blockCount = Math.ceil(input.length / 32);

  for (let block = 0; block < blockCount; block++) {
    const keystreamHex = await sha256Hex(
      `reels:ctr-block:v1:${encKeyHex}:${ivHex}:${block}`
    );
    const keystream = hexToBytes(keystreamHex, 32);
    const offset = block * 32;
    const limit = Math.min(32, input.length - offset);
    for (let i = 0; i < limit; i++) {
      out[offset + i] = input[offset + i] ^ keystream[i];
    }
  }

  return out;
}

async function computeMacTagHex(
  macKeyHex: string,
  ivB64: string,
  cipherB64: string
): Promise<string> {
  return sha256Hex(`reels:mac:v1:${macKeyHex}:${ivB64}:${cipherB64}`);
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Seals a `DeterministicRoll` into an authenticated & encrypted `sealedPayload` string
 * using Web Crypto AES-GCM (256-bit key + fresh 96-bit CSPRNG IV) or an authenticated
 * SHA-256-CTR + MAC fallback when `crypto.subtle` is unavailable.
 */
export async function sealStubRollPayload(
  roll: DeterministicRoll,
  vaultSecret: string = getDefaultEphemeralVaultSecret()
): Promise<string> {
  if (!vaultSecret || vaultSecret.trim().length === 0) {
    throw new Error('vaultSecret must be a non-empty secret string.');
  }

  const plaintextJson = JSON.stringify(roll);
  const plaintext = new TextEncoder().encode(plaintextJson);
  const encKeyHex = await sha256Hex(`reels:vault-enc-key:v2:${vaultSecret}`);
  const keyBytes = hexToBytes(encKeyHex, 32);
  const ivBytes = generateFreshIvBytes(plaintextJson);

  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto?.subtle &&
    typeof globalThis.crypto.subtle.importKey === 'function'
  ) {
    try {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );
      const encrypted = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes },
        cryptoKey,
        plaintext
      );
      return `aesgcm:${bytesToBase64(ivBytes)}:${bytesToBase64(
        new Uint8Array(encrypted)
      )}`;
    } catch {
      // Fallback to authenticated SHA-256-CTR + MAC below
    }
  }

  const macKeyHex = await sha256Hex(`reels:vault-mac-key:v2:${vaultSecret}`);
  const ivHex = bytesToHex(ivBytes);
  const cipher = await sha256CtrTransform(plaintext, encKeyHex, ivHex);
  const ivB64 = bytesToBase64(ivBytes);
  const cipherB64 = bytesToBase64(cipher);
  const tagHex = await computeMacTagHex(macKeyHex, ivB64, cipherB64);

  return `shactr1:${ivB64}:${cipherB64}:${tagHex}`;
}

/**
 * Unseals and authenticates a `sealedPayload` string back into its original `DeterministicRoll`.
 * Strictly rejects unauthenticated or plaintext payloads.
 */
export async function unsealStubRollPayload(
  sealedPayload: string,
  vaultSecret: string = getDefaultEphemeralVaultSecret()
): Promise<DeterministicRoll> {
  if (!vaultSecret || vaultSecret.trim().length === 0) {
    throw new Error('vaultSecret must be a non-empty secret string.');
  }

  const encKeyHex = await sha256Hex(`reels:vault-enc-key:v2:${vaultSecret}`);
  const keyBytes = hexToBytes(encKeyHex, 32);

  if (sealedPayload.startsWith('aesgcm:')) {
    const parts = sealedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed AES-GCM sealed stub payload.');
    }
    const [, ivB64, cipherB64] = parts;
    const ivBytes = base64ToBytes(ivB64);
    const cipherBytes = base64ToBytes(cipherB64);
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      cryptoKey,
      cipherBytes
    );
    const json = new TextDecoder().decode(new Uint8Array(decrypted));
    return JSON.parse(json) as DeterministicRoll;
  }

  if (sealedPayload.startsWith('shactr1:')) {
    const parts = sealedPayload.split(':');
    if (parts.length !== 4) {
      throw new Error('Malformed shactr1 sealed stub payload.');
    }
    const [, ivB64, cipherB64, tagHex] = parts;
    const macKeyHex = await sha256Hex(`reels:vault-mac-key:v2:${vaultSecret}`);
    const expectedTag = await computeMacTagHex(macKeyHex, ivB64, cipherB64);
    if (!constantTimeHexEqual(tagHex, expectedTag)) {
      throw new Error(
        'Stub payload authentication failed: MAC tag mismatch or tampered ciphertext.'
      );
    }

    const ivBytes = base64ToBytes(ivB64);
    const cipherBytes = base64ToBytes(cipherB64);
    const plainBytes = await sha256CtrTransform(
      cipherBytes,
      encKeyHex,
      bytesToHex(ivBytes)
    );
    const json = new TextDecoder().decode(plainBytes);
    return JSON.parse(json) as DeterministicRoll;
  }

  throw new Error(
    'Unauthenticated or unsupported stub payload format: plaintext payloads are rejected.'
  );
}
