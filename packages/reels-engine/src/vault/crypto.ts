import type { DeterministicRoll } from '../types';
import { sha256Hex } from '../prng';

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

/**
 * Seals a `DeterministicRoll` into an authenticated / encrypted `sealedPayload` string
 * using Web Crypto AES-GCM (256-bit key derived from `vaultSecret`) with a deterministic
 * portable XOR-HMAC stream cipher fallback if `crypto.subtle.encrypt` is unavailable.
 */
export async function sealStubRollPayload(
  roll: DeterministicRoll,
  vaultSecret: string = 'sunshade-local-stub-vault-v1'
): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(roll));
  const keyHashHex = await sha256Hex(`reels:vault-key:v1:${vaultSecret}`);
  const ivHashHex = await sha256Hex(
    `reels:vault-iv:v1:${roll.baseSeedHash}:${roll.index}`
  );

  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(keyHashHex.slice(i * 2, i * 2 + 2), 16);
  }
  const ivBytes = new Uint8Array(12);
  for (let i = 0; i < 12; i++) {
    ivBytes[i] = parseInt(ivHashHex.slice(i * 2, i * 2 + 2), 16);
  }

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
      // Fallback below
    }
  }

  const cipher = new Uint8Array(plaintext.length);
  for (let i = 0; i < plaintext.length; i++) {
    cipher[i] =
      plaintext[i] ^ keyBytes[i % keyBytes.length] ^ ivBytes[i % ivBytes.length];
  }
  return `xorv1:${bytesToBase64(ivBytes)}:${bytesToBase64(cipher)}`;
}

/**
 * Unseals a `sealedPayload` string back into its original `DeterministicRoll`.
 */
export async function unsealStubRollPayload(
  sealedPayload: string,
  vaultSecret: string = 'sunshade-local-stub-vault-v1'
): Promise<DeterministicRoll> {
  const keyHashHex = await sha256Hex(`reels:vault-key:v1:${vaultSecret}`);
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(keyHashHex.slice(i * 2, i * 2 + 2), 16);
  }

  if (sealedPayload.startsWith('aesgcm:')) {
    const [, ivB64, cipherB64] = sealedPayload.split(':');
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

  if (sealedPayload.startsWith('xorv1:')) {
    const [, ivB64, cipherB64] = sealedPayload.split(':');
    const ivBytes = base64ToBytes(ivB64);
    const cipherBytes = base64ToBytes(cipherB64);
    const plain = new Uint8Array(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      plain[i] =
        cipherBytes[i] ^
        keyBytes[i % keyBytes.length] ^
        ivBytes[i % ivBytes.length];
    }
    const json = new TextDecoder().decode(plain);
    return JSON.parse(json) as DeterministicRoll;
  }

  return JSON.parse(sealedPayload) as DeterministicRoll;
}
