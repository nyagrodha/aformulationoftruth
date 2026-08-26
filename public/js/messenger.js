const enc = new TextEncoder();
const dec = new TextDecoder();
const passphraseEl = document.getElementById('passphrase');
const plainEl = document.getElementById('plain');
const cipherEl = document.getElementById('cipher');
const sealedEl = document.getElementById('sealed');
const openPassphraseEl = document.getElementById('openPassphrase');
const openedEl = document.getElementById('opened');
const b64 = (bytes) => {
  const arr = new Uint8Array(bytes);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < arr.length; i += CHUNK) {
    binary += String.fromCharCode(...arr.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/*
 * Everything below reaches these functions from somewhere untrusted: the
 * envelope is pasted in from whatever channel the message travelled through,
 * and the passphrase is whatever is in the box when the button is clicked.
 */
const DEFAULT_ITERATIONS = 250000;
const MAX_ITERATIONS = 1000000;

/*
 * deriveKey runs PBKDF2 on the main thread, so a hostile {"iterations":1e12}
 * freezes the tab with nothing to cancel and no error -- the page just stops.
 * Bound it instead of trusting it. The ceiling is 4x what this page writes, so
 * an envelope hardened elsewhere still opens while a hostile one fails fast
 * with a message. Absent stays 250000: v1 envelopes omit the field entirely.
 */
function checkedIterations(value) {
  if (value === undefined || value === null) return DEFAULT_ITERATIONS;
  if (!Number.isInteger(value) || value < 1 || value > MAX_ITERATIONS) {
    throw new Error(`iterations must be a whole number from 1 to ${MAX_ITERATIONS}, got ${value}`);
  }
  return value;
}

/*
 * An empty passphrase seals nothing: it derives a key anyone can rederive, and
 * the envelope still looks sealed, which is the failure the page's own promise
 * -- "only the holder of the passphrase should read" -- rules out.
 *
 * Validate on the trimmed value but derive from the raw one. Trimming before
 * derivation would silently change the key, so a passphrase with deliberate
 * leading or trailing spaces would seal envelopes it could never reopen.
 */
function checkedPassphrase(value) {
  if (!value || !value.trim()) throw new Error('a passphrase is required');
  return value;
}

async function keyFromPassphrase(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
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

document.getElementById('encrypt').onclick = async () => {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = DEFAULT_ITERATIONS;
    const key = await keyFromPassphrase(checkedPassphrase(passphraseEl.value), salt, iterations);
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plainEl.value),
    );
    cipherEl.textContent = JSON.stringify(
      {
        v: 1,
        kdf: 'PBKDF2-SHA256',
        iterations,
        cipher: 'AES-GCM',
        salt: b64(salt),
        iv: b64(iv),
        data: b64(data),
      },
      null,
      2,
    );
  } catch (err) {
    cipherEl.textContent = `encryption failed: ${err.message}`;
  }
};

document.getElementById('decrypt').onclick = async () => {
  try {
    const envelope = JSON.parse(sealedEl.value);
    const key = await keyFromPassphrase(
      checkedPassphrase(openPassphraseEl.value),
      unb64(envelope.salt),
      checkedIterations(envelope.iterations),
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(envelope.iv) },
      key,
      unb64(envelope.data),
    );
    openedEl.textContent = dec.decode(plaintext);
  } catch (err) {
    openedEl.textContent = `decryption failed: ${err.message}`;
  }
};
