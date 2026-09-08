/**
 * Default identity transport: what actually crosses ssh.
 *
 * lib/session-keys_test.ts (open on other coverage PRs) injects a fake
 * transport, which is the right way to pin allowlisting. It cannot see the
 * default ssh argv. These tests pin the production transport: the identity
 * travels on stdin, never argv; the remote command is quoted; host keys are
 * pinned; and no address is hardcoded after #99.
 *
 *   deno test --allow-read lib/session-keys_transport_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';

const src = await Deno.readTextFile(new URL('./session-keys.ts', import.meta.url));

Deno.test('the identity is written to ssh stdin, never interpolated into argv', () => {
  assert(src.includes("stdin: 'piped'"), 'the identity must travel on stdin');
  const command = src.slice(src.indexOf('const cmd = new Deno.Command'));
  const argsBlock = command.slice(command.indexOf('args: ['), command.indexOf(']'));
  assertEquals(argsBlock.includes('identity'), false, 'the private key must not appear in ssh argv');
  assert(
    src.includes('await w.write(new TextEncoder().encode(identity))'),
    'the identity must still be delivered',
  );
});

Deno.test('ssh refuses unknown hosts and never prompts', () => {
  assert(src.includes("'StrictHostKeyChecking=yes'"));
  assert(src.includes("'BatchMode=yes'"));
  assert(src.includes("'IdentitiesOnly=yes'"));
  assert(src.includes("'ConnectTimeout=10'"));
});

Deno.test('the remote command quotes the session id and the key path', () => {
  assert(
    src.includes("`umask 077 && cat > '${KEYBOX_KEY_DIR}/${sessionId}.key'`"),
    'a future charset widening must degrade to a wrong filename, not remote execution',
  );
  assert(
    src.includes("`rm -f '${KEYBOX_KEY_DIR}/${id}.key'`"),
    'withdrawal interpolates the same id into a remote shell command',
  );
});

Deno.test('the key box destination comes from the environment, not a baked-in address', () => {
  assert(src.includes("Deno.env.get('KEYBOX_SSH_DEST')"));
  assert(src.includes("Deno.env.get('KEYBOX_KEY_DIR')"));
  assert(src.includes("Deno.env.get('KEYBOX_SSH_PORT')"));
  // #99: a hardcoded VPN/VPS address here would be dialled even after the box moved.
  const dotted = src.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [];
  assertEquals(dotted, [], `session-keys.ts must not hardcode an IP, found ${dotted.join(', ')}`);
});
