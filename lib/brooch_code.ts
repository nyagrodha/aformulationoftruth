/**
 * Brooch encounter codes, format A4OT-ENC1.
 *
 *   payload = brooch_id (u32 BE) || counter (u32 BE)
 *   mac     = HMAC-SHA256(K_brooch, "A4OT-ENC1" || payload)[0:12]
 *   code    = base64url_nopad(payload || mac)                        27 chars
 *
 * The brooch mints one per QR it shows; the site checks it here. Pure: no DB,
 * no env. Spec: ~/Projects/ESP32/brooch/docs/superpowers/specs/
 * 2026-09-23-encounter-identity-design.md
 */
import { decodeBase64Url, encodeBase64Url } from '$std/encoding/base64url.ts';

export const TAG = 'A4OT-ENC1';
export const CODE_RE = /^[A-Za-z0-9_-]{27}$/;
const MAC_LEN = 12;

export interface ParsedCode {
  broochId: number;
  counter: number;
  mac: Uint8Array;
}

/** Non-extractable HMAC key: usable for signing, never readable back. */
export function importBroochKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function payload(broochId: number, counter: number): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(8);
  const v = new DataView(p.buffer);
  v.setUint32(0, broochId >>> 0);
  v.setUint32(4, counter >>> 0);
  return p;
}

async function macFor(key: CryptoKey, broochId: number, counter: number): Promise<Uint8Array> {
  const tag = new TextEncoder().encode(TAG);
  const msg = new Uint8Array(tag.length + 8);
  msg.set(tag);
  msg.set(payload(broochId, counter), tag.length);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, msg)).slice(0, MAC_LEN);
}

export async function encodeCode(key: CryptoKey, broochId: number, counter: number): Promise<string> {
  const raw = new Uint8Array(8 + MAC_LEN);
  raw.set(payload(broochId, counter));
  raw.set(await macFor(key, broochId, counter), 8);
  return encodeBase64Url(raw);
}

/** Structure only; says nothing about authenticity. Null for anything malformed or non-canonical. */
export function parseCode(code: string): ParsedCode | null {
  if (!CODE_RE.test(code)) return null;
  let raw: Uint8Array;
  try {
    raw = decodeBase64Url(code);
  } catch {
    return null;
  }
  // Canonical form only: re-encoding must give back the same text.
  if (raw.length !== 8 + MAC_LEN || encodeBase64Url(raw) !== code) return null;
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  return { broochId: v.getUint32(0), counter: v.getUint32(4), mac: raw.slice(8) };
}

/** Constant-time comparison of the truncated MAC. */
export async function verifyCode(key: CryptoKey, p: ParsedCode): Promise<boolean> {
  const expected = await macFor(key, p.broochId, p.counter);
  let diff = 0;
  for (let i = 0; i < MAC_LEN; i++) diff |= expected[i] ^ p.mac[i];
  return diff === 0;
}
