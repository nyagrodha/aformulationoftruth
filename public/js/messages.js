/*
 * The messenger UI.
 *
 * Holds the unlocked private key in a module-level variable for the life of the
 * tab and nowhere else. Not localStorage, not sessionStorage, not IndexedDB:
 * lib/questionnaire-session.ts records that nothing in this app writes to
 * browser storage and the privacy page says so, with a test pinning the claim.
 * Persisting a key here would quietly make that page wrong. Closing the tab
 * locks; that is the trade, and the setup copy states it.
 */

import { createIdentity, openFrom, sealTo, unlockIdentity } from './messenger-crypto.js';

let privateKey = null;
let threads = [];
let current = null;
let poll = null;

const $ = (id) => document.getElementById(id);

function say(el, message, kind) {
  if (!el) return;
  el.textContent = message;
  el.className = kind ? `status ${kind}` : 'status';
}

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    /*
     * Same-origin so the session cookie rides along, and so a redirect to
     * another origin cannot carry the body somewhere else.
     */
    credentials: 'same-origin',
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    // A non-JSON body means something upstream of the handler answered.
  }

  if (!res.ok) throw new Error(body?.error || 'Something went wrong. Please try again.');
  return body;
}

/* ------------------------------------------------------------------- setup */

async function onCreate() {
  const status = $('setup-status');
  const pass = $('new-passphrase').value;
  const again = $('confirm-passphrase').value;

  if (pass !== again) return say(status, 'Those passphrases do not match.', 'err');

  const button = $('create');
  button.disabled = true;
  say(status, 'Generating your key…');

  try {
    const identity = await createIdentity(pass);

    await api('/api/messenger/identity', {
      method: 'POST',
      body: JSON.stringify({
        publicKey: identity.publicKey,
        wrappedPrivate: identity.wrappedPrivate,
        wrapIv: identity.wrapIv,
        kdfSalt: identity.kdfSalt,
        kdfIterations: identity.kdfIterations,
      }),
    });

    privateKey = identity.privateKey;
    $('setup').hidden = true;
    $('unlock').hidden = true;
    await enterApp();
  } catch (err) {
    say(status, err.message, 'err');
    button.disabled = false;
  }
}

async function onUnlock() {
  const status = $('unlock-status');
  const button = $('unlock-btn');
  button.disabled = true;
  say(status, 'Unlocking…');

  try {
    const { identity } = await api('/api/messenger/identity');
    if (!identity) throw new Error('No identity found. Set one up first.');

    privateKey = await unlockIdentity(identity, $('unlock-passphrase').value);
    $('unlock-passphrase').value = '';
    $('unlock').hidden = true;
    await enterApp();
  } catch (err) {
    say(status, err.message, 'err');
    button.disabled = false;
  }
}

/* ------------------------------------------------------------------ threads */

async function enterApp() {
  $('app').hidden = false;
  await loadThreads();
}

async function loadThreads() {
  const { threads: list } = await api('/api/messenger/threads');
  threads = list;

  const panel = $('threads');
  panel.textContent = '';

  if (!threads.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No conversations yet.';
    panel.append(empty);
    return;
  }

  for (const thread of threads) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thread-btn';
    button.setAttribute('aria-current', String(thread.id === current?.id));

    const who = document.createElement('span');
    who.className = 'who';

    const name = document.createElement('span');
    name.textContent = thread.label;

    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = thread.handle ? `@${thread.handle}` : 'no handle';

    who.append(name, sub);
    button.append(who);

    if (thread.unread > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(thread.unread);
      badge.setAttribute('aria-label', `${thread.unread} unread`);
      button.append(badge);
    }

    button.addEventListener('click', () => openThread(thread));
    panel.append(button);
  }
}

/* ------------------------------------------------------------- conversation */

async function openThread(thread) {
  current = thread;
  stopPolling();

  $('convo-empty').hidden = true;
  $('log').hidden = false;
  $('composer').hidden = false;
  $('log').textContent = '';

  await loadMessages({ replace: true });
  await loadThreads();
  startPolling();
}

/*
 * Every message in a thread -- both halves -- is sealed under the one secret
 * shared with the correspondent, so their public key opens your own sent
 * messages too. That symmetry is what lets a sender re-read what they wrote
 * without the server keeping a second copy in the clear.
 */
/*
 * Only one loadMessages may be in flight.
 *
 * Three callers can start one -- the 8s poll, the visibilitychange handler, and
 * a send that reloads -- and they overlap in ordinary use: returning to a
 * backgrounded tab fires visibilitychange and the poll's next tick at
 * effectively the same moment. Both would read the same `current.cursor`, fetch
 * the same messages, and append them twice, because the cursor only advances
 * after the awaited decrypt loop finishes. The duplicates are in the DOM, not
 * the data, so a reload "fixes" it and the report is unreproducible.
 *
 * Later callers return rather than queue: every one of them is asking for the
 * same thing, and the call already running will deliver it.
 */
let loading = false;

async function loadMessages({ replace = false } = {}) {
  if (!current) return;
  if (loading) return;
  loading = true;
  try {
    await loadMessagesInner({ replace });
  } finally {
    loading = false;
  }
}

async function loadMessagesInner({ replace }) {
  const after = replace ? 0 : (current.cursor ?? 0);
  const { messages } = await api(
    `/api/messenger/threads?id=${encodeURIComponent(current.id)}${after ? `&after=${after}` : ''}`,
  );
  if (!messages.length) return;

  const log = $('log');
  for (const message of messages) {
    const text = await openFrom(privateKey, current.publicKey, message.ciphertext, message.iv);

    const bubble = document.createElement('div');
    bubble.className = `msg${message.mine ? ' mine' : ''}${text === null ? ' unreadable' : ''}`;
    bubble.textContent = text ?? 'This message cannot be opened with your current key.';

    const when = document.createElement('span');
    when.className = 'when';
    const at = new Date(message.createdAt);
    when.textContent = at.toLocaleString();
    bubble.append(when);

    log.append(bubble);
    current.cursor = Math.max(current.cursor ?? 0, message.id);
  }

  log.scrollTop = log.scrollHeight;
}

async function onSendReply() {
  if (!current) return;

  const status = $('convo-status');
  const field = $('reply');
  const text = field.value;

  if (!text.trim()) return say(status, 'There is nothing to send.', 'err');
  if (!current.handle) return say(status, 'That profile has no handle to send to.', 'err');

  const button = $('send-reply');
  button.disabled = true;
  say(status, 'Sealing…');

  try {
    const { ciphertext, iv } = await sealTo(privateKey, current.publicKey, text);
    await api('/api/messenger/send', {
      method: 'POST',
      body: JSON.stringify({ to: current.handle, ciphertext, iv }),
    });

    field.value = '';
    say(status, 'Sent.', 'ok');
    await loadMessages();
  } catch (err) {
    say(status, err.message, 'err');
  } finally {
    button.disabled = false;
  }
}

/* ------------------------------------------------------------------ polling */

/*
 * There is no realtime transport anywhere in this app -- no WebSocket, no SSE.
 * Polling on a cursor is the whole delivery mechanism. It stops while the tab is
 * hidden, so a backgrounded conversation is not a request every eight seconds
 * forever, and resumes on the way back.
 */
const POLL_MS = 8000;

function startPolling() {
  stopPolling();
  poll = setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      await loadMessages();
    } catch {
      // A failed poll is not worth interrupting a conversation over; the next
      // tick tries again and a genuine send still reports its own failure.
    }
  }, POLL_MS);
}

function stopPolling() {
  if (poll) clearInterval(poll);
  poll = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current) loadMessages().catch(() => {});
});

/* -------------------------------------------------------------------- wiring */

$('create')?.addEventListener('click', onCreate);
$('unlock-btn')?.addEventListener('click', onUnlock);
$('send-reply')?.addEventListener('click', onSendReply);

for (const id of ['new-passphrase', 'confirm-passphrase', 'unlock-passphrase']) {
  $(id)?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    (id === 'unlock-passphrase' ? $('unlock-btn') : $('create'))?.click();
  });
}
