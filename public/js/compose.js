/*
 * The compose box on a profile page.
 *
 * Sending needs the sender's private key, and the key is wrapped under a
 * passphrase, so a first message from this page necessarily asks for it. The
 * field stays hidden until the moment it is needed rather than greeting every
 * visitor with a password prompt on someone else's profile.
 *
 * The key is held for the life of this page and written nowhere. See
 * messages.js for why browser storage is not an option here.
 */

import { sealTo, unlockIdentity } from './messenger-crypto.js';

const compose = document.getElementById('compose');
if (compose) {
  const handle = compose.dataset.handle;
  const body = document.getElementById('body');
  const lockRow = document.getElementById('lock-row');
  const passphrase = document.getElementById('passphrase');
  const button = document.getElementById('send');
  const status = document.getElementById('status');

  let privateKey = null;

  const say = (message, kind) => {
    status.textContent = message;
    status.className = kind ? `status ${kind}` : 'status';
  };

  async function api(path, options) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
      credentials: 'same-origin',
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      // Non-JSON means something above the handler answered.
    }

    if (!res.ok) throw new Error(payload?.error || 'Something went wrong. Please try again.');
    return payload;
  }

  async function unlock() {
    if (privateKey) return privateKey;

    const { identity } = await api('/api/messenger/identity');
    if (!identity) {
      throw new Error('Set up messaging first, on your messages page.');
    }

    if (lockRow.hidden) {
      lockRow.hidden = false;
      passphrase.focus();
      throw new Error('Enter your passphrase to seal this message.');
    }
    if (!passphrase.value) {
      throw new Error('Enter your passphrase to seal this message.');
    }

    privateKey = await unlockIdentity(identity, passphrase.value);
    passphrase.value = '';
    return privateKey;
  }

  /*
   * Disabling the button was not enough: the Enter handler on the passphrase
   * field calls send() directly, so a keypress during an in-flight send starts
   * a second one past a control that is already disabled. Two sends seal the
   * same body twice and the recipient receives it twice.
   */
  let sending = false;

  async function send() {
    if (sending) return;
    if (!body.value.trim()) return say('There is nothing to send.', 'err');

    sending = true;
    button.disabled = true;
    try {
      say('Unlocking…');
      const key = await unlock();

      say('Sealing…');
      /*
       * The recipient's public key is fetched rather than embedded in the page:
       * serving it in the HTML would publish who has messaging set up to anyone
       * who loads a profile. This endpoint requires a proven caller.
       */
      const { publicKey } = await api(`/api/messenger/send?to=${encodeURIComponent(handle)}`);
      const { ciphertext, iv } = await sealTo(key, publicKey, body.value);

      await api('/api/messenger/send', {
        method: 'POST',
        body: JSON.stringify({ to: handle, ciphertext, iv }),
      });

      body.value = '';
      lockRow.hidden = true;
      say('Sent. It is in your messages.', 'ok');
    } catch (err) {
      say(err.message, 'err');
    } finally {
      sending = false;
      button.disabled = false;
    }
  }

  button.addEventListener('click', send);
  passphrase.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      send();
    }
  });
}
