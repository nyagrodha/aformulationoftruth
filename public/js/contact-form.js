// Contact form: secure messaging.
//
// Default path: POST plaintext to /api/contact; server age-encrypts at rest.
// PGP path: lazy-load openpgp.js, fetch the contact PGP key, encrypt in-
// browser, then POST the PGP armored block. Server still age-wraps it.
//
// On any PGP failure we surface an inline error and do NOT fall back to
// plaintext — the user opted in to PGP and a silent downgrade would defeat
// their intent.

const OPENPGP_URL = 'https://esm.sh/openpgp@5.11.2';
const PGP_KEY_URL = '/contact-pgp.asc';

const form = document.getElementById('secure-contact-form');
const messageEl = document.getElementById('secure-contact-message');
const pgpCheckbox = document.getElementById('secure-contact-pgp');
const submitButton = document.getElementById('secure-contact-submit');
const statusEl = document.getElementById('secure-contact-status');

if (form && messageEl && pgpCheckbox && submitButton && statusEl) {
  init();
}

function init() {
  // Disable the PGP toggle up front if the key isn't published yet.
  // HEAD is cheap and avoids surprising the user at submit time.
  fetch(PGP_KEY_URL, { method: 'HEAD' })
    .then((res) => {
      if (!res.ok) disablePgp('PGP option unavailable — admin key not yet published');
    })
    .catch(() => {
      disablePgp('PGP option unavailable — admin key not reachable');
    });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit().catch((err) => {
      console.error('[contact-form] unexpected error', err);
      setStatus('Something went wrong. Please try again.', 'error');
      setBusy(false);
    });
  });
}

function disablePgp(reason) {
  pgpCheckbox.checked = false;
  pgpCheckbox.disabled = true;
  pgpCheckbox.dataset.permanentlyDisabled = 'true';
  const label = pgpCheckbox.closest('label');
  if (label) {
    const note = document.createElement('span');
    note.className = 'secure-contact-help';
    note.style.display = 'block';
    note.style.marginTop = '0.25rem';
    note.textContent = reason;
    label.appendChild(note);
  }
}

async function submit() {
  const raw = messageEl.value.trim();
  if (raw.length === 0) {
    setStatus('Please write a message before sending.', 'error');
    return;
  }
  if (raw.length > 10000) {
    setStatus('Message is too long (10,000 character max).', 'error');
    return;
  }

  const pgpEncrypted = !!pgpCheckbox.checked;
  setBusy(true);
  setStatus(pgpEncrypted ? 'Encrypting with PGP…' : 'Sending…', 'info');

  let payload;
  try {
    payload = pgpEncrypted ? await pgpEncrypt(raw) : raw;
  } catch (err) {
    console.error('[contact-form] PGP encryption failed', err);
    setStatus(
      'PGP encryption failed; nothing was sent. Untick the PGP option or retry once your network can reach the key.',
      'error',
    );
    setBusy(false);
    return;
  }

  let response;
  try {
    response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: payload, pgpEncrypted }),
    });
  } catch (err) {
    console.error('[contact-form] network error', err);
    setStatus('Network error. Please try again.', 'error');
    setBusy(false);
    return;
  }

  if (response.status === 503) {
    setStatus(
      'The secure contact channel is being set up. Please use the email link above in the meantime.',
      'error',
    );
    setBusy(false);
    return;
  }
  if (response.status === 429) {
    const retry = response.headers.get('Retry-After');
    setStatus(
      retry
        ? `Too many submissions. Please try again in ~${Math.ceil(Number(retry) / 60)} minute(s).`
        : 'Too many submissions. Please try again later.',
      'error',
    );
    setBusy(false);
    return;
  }
  if (!response.ok) {
    let detail = 'Something went wrong.';
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string') detail = data.error;
    } catch {
      /* ignore */
    }
    setStatus(detail, 'error');
    setBusy(false);
    return;
  }

  messageEl.value = '';
  pgpCheckbox.checked = false;
  setStatus('Sent. Thank you.', 'success');
  setBusy(false);
}

async function pgpEncrypt(text) {
  const [openpgp, keyArmored] = await Promise.all([
    import(OPENPGP_URL),
    fetch(PGP_KEY_URL).then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch contact PGP key: ${r.status}`);
      return r.text();
    }),
  ]);

  const publicKey = await openpgp.readKey({ armoredKey: keyArmored });
  const message = await openpgp.createMessage({ text });
  const armored = await openpgp.encrypt({
    message,
    encryptionKeys: publicKey,
  });
  // openpgp returns a string when no `format` override is given.
  if (typeof armored !== 'string') {
    throw new Error('openpgp returned unexpected ciphertext format');
  }
  return armored;
}

function setBusy(busy) {
  submitButton.disabled = busy;
  messageEl.readOnly = busy;
  pgpCheckbox.disabled = busy || pgpCheckbox.dataset.permanentlyDisabled === 'true';
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}
