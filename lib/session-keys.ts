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
 * Default transport: ssh over the mesh, identity delivered on stdin so it never
 * touches Iceland's filesystem. StrictHostKeyChecking=yes is the point of the
 * exercise -- an unpinned host key would let anything on the mesh collect keys.
 */
const scpTransport: IdentityTransport = async (sessionId, identity) => {
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
      'ConnectTimeout=10',
      ROMANIA_SSH,
      `umask 077 && cat > ${ROMANIA_KEY_DIR}/${sessionId}.key`,
    ],
    stdin: 'piped',
    stdout: 'null',
    stderr: 'null',
  });
  const child = cmd.spawn();
  const w = child.stdin.getWriter();
  await w.write(new TextEncoder().encode(identity));
  await w.close();
  const out = await child.output();
  if (!out.success) {
    // No stderr, no identity, no session id in the message.
    throw new Error('identity transport failed');
  }
};

export async function pushIdentity(
  sessionId: string,
  identity: string,
  transport: IdentityTransport = scpTransport,
): Promise<void> {
  try {
    await transport(sessionId, identity);
  } catch {
    // Re-thrown as a bare category so no callee message can carry key material.
    throw new Error('identity transport failed');
  }
}
