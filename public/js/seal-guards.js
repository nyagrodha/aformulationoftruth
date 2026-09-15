/*
 * Envelope guards, shared by every surface that seals or opens a message.
 *
 * These began life inside public/js/messenger.js, which was a standalone
 * seal/open scratchpad -- you pasted plaintext in and carried a JSON envelope
 * out by hand. That page was removed: it was never a messenger, and keeping it
 * meant the nav pointed at a crypto demo while the site had no way for two
 * people to actually reach one another.
 *
 * The guards outlived it because they are the part that was worth keeping.
 * Every one of them exists because the input reaches it from somewhere
 * untrusted -- an envelope arrives from whatever channel it travelled through,
 * and a passphrase is whatever was in the box when the button was clicked.
 *
 * Exported as a module rather than lifted out of the source with a regex.
 * messenger_test.tsx used to slice the file between two string markers and
 * eval the result with `new Function`, because the old script called
 * getElementById at module scope and so could not be imported. Nothing here
 * touches the DOM, so the tests import it directly and reordering the file
 * can no longer silently test nothing.
 */

const MAX_SALT_BYTES = 64;
const MAX_IV_BYTES = 16;
const MAX_CIPHERTEXT_BYTES = 1048576;

export const DEFAULT_ITERATIONS = 250000;
export const MAX_ITERATIONS = 1000000;

export const FIELD_LIMITS = {
  salt: MAX_SALT_BYTES,
  iv: MAX_IV_BYTES,
  data: MAX_CIPHERTEXT_BYTES,
};

export function b64(bytes) {
  const arr = new Uint8Array(bytes);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < arr.length; i += CHUNK) {
    binary += String.fromCharCode(...arr.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function unb64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/*
 * unb64 allocates before anything inspects the input, so an envelope field is
 * decoded at whatever size it arrives. Bound each one first.
 *
 * Base64 carries 3 bytes per 4 characters, so the decoded size is known from
 * the string length alone -- checking it before atob is the whole point, since
 * checking after has already done the allocation being guarded against.
 *
 * Bounded by maximum rather than pinned to the exact 16 and 12 a sealer
 * writes: the envelope format is published, so an implementation that picks a
 * 32-byte salt is legitimate and should still open. The limit refuses what is
 * absurd, not what merely differs.
 */
export function decodeField(name, text, maxBytes) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error(`envelope is missing ${name}`);
  }
  if ((text.length * 3) / 4 > maxBytes + 3) {
    throw new Error(`envelope ${name} is larger than the ${maxBytes} bytes this page will decode`);
  }
  try {
    return unb64(text);
  } catch {
    /*
     * atob throws InvalidCharacterError, which names no field and reads as a
     * browser fault rather than a malformed envelope. Every other refusal here
     * says which field was wrong; this one was the exception, and the caller
     * displaying it had nothing to show the person.
     */
    throw new Error(`envelope ${name} is not valid base64`);
  }
}

/*
 * deriveKey runs PBKDF2 on the main thread, so a hostile {"iterations":1e12}
 * freezes the tab with nothing to cancel and no error -- the page just stops.
 * Bound it instead of trusting it. The ceiling is 4x what is written here, so
 * an envelope hardened elsewhere still opens while a hostile one fails fast
 * with a message. Absent stays DEFAULT_ITERATIONS: v1 envelopes omit the field.
 */
export function checkedIterations(value) {
  if (value === undefined || value === null) return DEFAULT_ITERATIONS;
  if (!Number.isInteger(value) || value < 1 || value > MAX_ITERATIONS) {
    throw new Error(`iterations must be a whole number from 1 to ${MAX_ITERATIONS}, got ${value}`);
  }
  return value;
}

/*
 * An empty passphrase seals nothing: it derives a key anyone can rederive, and
 * the envelope still looks sealed, which is the failure any "only the holder of
 * the passphrase can read this" promise rules out.
 *
 * Validate on the trimmed value but derive from the raw one. Trimming before
 * derivation would silently change the key, so a passphrase with deliberate
 * leading or trailing spaces would seal envelopes it could never reopen.
 */
export function checkedPassphrase(value) {
  if (!value || !value.trim()) throw new Error('a passphrase is required');
  return value;
}

export async function keyFromPassphrase(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/*
 * Validate every field before deriving. Deriving first would spend the full
 * PBKDF2 -- up to MAX_ITERATIONS of it -- before noticing that iv or data was
 * never going to be accepted, which hands back most of the work the bound
 * exists to prevent.
 */
export function checkedEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('envelope must be an object');
  }
  return {
    salt: decodeField('salt', envelope.salt, MAX_SALT_BYTES),
    iv: decodeField('iv', envelope.iv, MAX_IV_BYTES),
    data: decodeField('data', envelope.data, MAX_CIPHERTEXT_BYTES),
    iterations: checkedIterations(envelope.iterations),
  };
}
