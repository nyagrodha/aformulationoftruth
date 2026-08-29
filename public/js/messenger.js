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
    const iterations = 250000;
    const key = await keyFromPassphrase(passphraseEl.value, salt, iterations);
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

    /*
     * The envelope is pasted in by whoever is holding it, so its iteration
     * count is attacker-chosen. PBKDF2 runs on the main thread here, and
     * {"iterations":1e12} freezes the tab with nothing to cancel and no error
     * -- the page simply stops. `|| 250000` only replaced a falsy value and
     * passed every other number straight through.
     *
     * This file is a classic script, not a module, so it cannot import
     * seal-guards' checkedIterations; the ceiling is restated to match its
     * MAX_ITERATIONS. Absent still means the default: v1 envelopes omit it.
     */
    const MAX_ITERATIONS = 1000000;
    const iterations = envelope.iterations ?? 250000;
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
      throw new Error(
        `iterations must be a whole number from 1 to ${MAX_ITERATIONS}, got ${envelope.iterations}`,
      );
    }

    const key = await keyFromPassphrase(
      openPassphraseEl.value,
      unb64(envelope.salt),
      iterations,
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
