/*
 * Profile-to-profile sealing, entirely in the browser.
 *
 * The server stores what comes out of here and can open none of it. It holds a
 * public key, a private key wrapped under a passphrase it never receives, and
 * ciphertext.
 *
 * SCHEME
 *
 *   identity     ECDH P-256 keypair, generated here, never leaving in the clear
 *   at rest      private key exported pkcs8, then AES-GCM under
 *                PBKDF2-SHA256(passphrase) -- the same KDF parameters
 *                seal-guards.js already defends
 *   per message  ECDH(my private, their public) -> AES-GCM-256 key, fresh IV
 *
 * P-256 and not the age x25519 used server-side, because this runs in a browser.
 * WebCrypto implements ECDH natively and implements no x25519 KEM, so age here
 * would mean shipping a bundled implementation -- and routes/index.tsx commits
 * this site to "no third-party requests of any kind". Using what the platform
 * already provides keeps that promise and leaves nothing to vendor or audit.
 *
 * A CONSEQUENCE WORTH KNOWING
 *
 * Static-static ECDH gives the same shared secret for a pair every time, so
 * there is no forward secrecy: someone who later obtains both passphrases can
 * read the whole history. Each message still gets a fresh IV, so the ciphertexts
 * do not repeat and nothing leaks between them. Ratcheting is the upgrade, and
 * it needs message ordering guarantees this does not yet have.
 *
 * The shared secret is symmetric, which is what lets a sender read their own
 * sent messages without the server keeping a second copy in the clear.
 */

import { b64, checkedPassphrase, DEFAULT_ITERATIONS, keyFromPassphrase, unb64 } from './seal-guards.js';

const KEY_ALGO = { name: 'ECDH', namedCurve: 'P-256' };

/*
 * A P-256 public key in raw form is an uncompressed point: 0x04 followed by two
 * 32-byte coordinates. Anything of another length is not one, and importKey's
 * failure on a malformed value is not always a clean throw, so check the length
 * before handing it over rather than after.
 */
const RAW_PUBLIC_KEY_BYTES = 65;

function requirePublicKeyBytes(bytes) {
  if (bytes.length !== RAW_PUBLIC_KEY_BYTES) {
    throw new Error('that is not a P-256 public key');
  }
  return bytes;
}

/** Import someone's published public key so it can be used to derive with. */
export async function importPublicKey(publicKeyB64) {
  const raw = requirePublicKeyBytes(unb64(publicKeyB64));
  return await crypto.subtle.importKey('raw', raw, KEY_ALGO, true, []);
}

/**
 * Mint a new identity and wrap its private half under a passphrase.
 *
 * Returns exactly what the server should store. The passphrase and the
 * unwrapped key are not among the returned values and never leave this function.
 */
export async function createIdentity(passphrase) {
  const pass = checkedPassphrase(passphrase);

  const pair = await crypto.subtle.generateKey(KEY_ALGO, true, ['deriveKey', 'deriveBits']);

  const rawPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));

  const kdfSalt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await keyFromPassphrase(pass, kdfSalt, DEFAULT_ITERATIONS);

  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, wrapKey, pkcs8);

  /*
   * Overwrite the exported private key. importKey may have copied the bytes
   * internally, so the honest claim is that we keep no readable copy, not that
   * none exists anywhere -- the same claim lib/audience.ts makes about its salt.
   */
  pkcs8.fill(0);

  return {
    publicKey: b64(rawPublic),
    wrappedPrivate: b64(new Uint8Array(wrapped)),
    wrapIv: b64(wrapIv),
    kdfSalt: b64(kdfSalt),
    kdfIterations: DEFAULT_ITERATIONS,
    privateKey: pair.privateKey,
  };
}

/**
 * Unwrap a stored identity.
 *
 * A wrong passphrase surfaces as AES-GCM authentication failure, which WebCrypto
 * reports as a bare OperationError with no message. Translated here, because
 * "OperationError" tells the person nothing about what they should do next.
 */
export async function unlockIdentity(record, passphrase) {
  const pass = checkedPassphrase(passphrase);

  const wrapKey = await keyFromPassphrase(
    pass,
    unb64(record.kdfSalt),
    record.kdfIterations || DEFAULT_ITERATIONS,
  );

  let pkcs8;
  try {
    pkcs8 = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(record.wrapIv) },
      wrapKey,
      unb64(record.wrappedPrivate),
    );
  } catch {
    throw new Error('that passphrase does not open this identity');
  }

  return await crypto.subtle.importKey('pkcs8', pkcs8, KEY_ALGO, false, ['deriveKey', 'deriveBits']);
}

/**
 * The AES key shared with one correspondent.
 *
 * Non-extractable: it is derived on demand from keys already held, so there is
 * never a reason to read it out, and marking it so means a bug cannot export it.
 */
async function sharedKey(myPrivateKey, theirPublicKey) {
  return await crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Seal a message to one correspondent. Returns what the server stores. */
export async function sealTo(myPrivateKey, theirPublicKeyB64, plaintext) {
  if (typeof plaintext !== 'string' || !plaintext.trim()) {
    throw new Error('there is nothing to send');
  }

  const theirKey = await importPublicKey(theirPublicKeyB64);
  const key = await sharedKey(myPrivateKey, theirKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return { ciphertext: b64(new Uint8Array(sealed)), iv: b64(iv) };
}

/**
 * Open a message from one correspondent.
 *
 * Returns null rather than throwing on a message that will not open. A thread
 * can legitimately contain one -- anything sealed to a key that was since
 * rotated -- and a single such message must not take down the render of every
 * other message around it.
 */
export async function openFrom(myPrivateKey, theirPublicKeyB64, ciphertextB64, ivB64) {
  try {
    const theirKey = await importPublicKey(theirPublicKeyB64);
    const key = await sharedKey(myPrivateKey, theirKey);
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(ivB64) },
      key,
      unb64(ciphertextB64),
    );
    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}
