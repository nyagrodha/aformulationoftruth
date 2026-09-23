/**
 * Brooch keys at rest. The site must hold K_brooch in the clear to verify a
 * code, so it cannot be hashed; it is AES-256-GCM encrypted under BROOCH_KEK
 * (base64 of 32 bytes). Everything here fails closed: no KEK, no brooch.
 */
import { decodeBase64 } from '$std/encoding/base64.ts';
import { decodeBase64Url, encodeBase64Url } from '$std/encoding/base64url.ts';
import { decrypt, encrypt } from './crypto.ts';
import { importBroochKey } from './brooch_code.ts';

export async function loadKek(): Promise<CryptoKey | null> {
  const b64 = Deno.env.get('BROOCH_KEK');
  if (!b64) return null;
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = decodeBase64(b64) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
  if (raw.length !== 32) return null;
  return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function wrapBroochKey(raw: Uint8Array, kek: CryptoKey): Promise<string> {
  return encrypt(encodeBase64Url(raw), kek);
}

export async function unwrapBroochKey(keyEnc: string, kek: CryptoKey): Promise<CryptoKey | null> {
  try {
    const raw = decodeBase64Url(await decrypt(keyEnc, kek)) as Uint8Array<ArrayBuffer>;
    return raw.length === 32 ? await importBroochKey(raw) : null;
  } catch {
    return null; // wrong KEK or corrupt row: GCM authentication fails
  }
}
