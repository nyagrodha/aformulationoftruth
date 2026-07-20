const enc = new TextEncoder();
const dec = new TextDecoder();
const $ = (id) => document.getElementById(id);
const b64 = (bytes) => {
  const arr = new Uint8Array(bytes);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < arr.length; i += CHUNK) {
    binary += String.fromCharCode(...arr.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function keyFromPassphrase(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

$("encrypt").onclick = async () => {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = 250000;
    const key = await keyFromPassphrase($("passphrase").value, salt, iterations);
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode($("plain").value),
    );
    $("cipher").textContent = JSON.stringify(
      {
        v: 1,
        kdf: "PBKDF2-SHA256",
        iterations,
        cipher: "AES-GCM",
        salt: b64(salt),
        iv: b64(iv),
        data: b64(data),
      },
      null,
      2,
    );
  } catch (err) {
    $("cipher").textContent = `encryption failed: ${err.message}`;
  }
};

$("decrypt").onclick = async () => {
  try {
    const envelope = JSON.parse($("sealed").value);
    const key = await keyFromPassphrase(
      $("openPassphrase").value,
      unb64(envelope.salt),
      envelope.iterations || 250000,
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(envelope.iv) },
      key,
      unb64(envelope.data),
    );
    $("opened").textContent = dec.decode(plaintext);
  } catch (err) {
    $("opened").textContent = `decryption failed: ${err.message}`;
  }
};
