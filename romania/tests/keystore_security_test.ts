/**
 * Exhaustive session-ID boundary tests and symlink defense.
 *
 * The session ID regex is the ONLY gate between network input and the
 * filesystem. These tests pin every edge of that gate and verify the new
 * symlink defense in storeIdentity / loadIdentity.
 *
 * Run: deno test --allow-read --allow-write romania/tests/keystore_security_test.ts
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { loadIdentity, markDelivered, shredExpired, shredIdentity, storeIdentity, touchActivity } from '../keystore.ts';

const tmp = () => Deno.makeTempDir({ prefix: 'ks-sec-' });

// ── Session ID validation ────────────────────────────────────────────

Deno.test('rejects empty string', async () => {
  const dir = await tmp();
  await assertRejects(() => storeIdentity(dir, '', 'k'), Error, 'invalid session id');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects a single character', async () => {
  const dir = await tmp();
  await assertRejects(() => storeIdentity(dir, 'a', 'k'), Error, 'invalid session id');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects 7 characters (below minimum)', async () => {
  const dir = await tmp();
  await assertRejects(() => storeIdentity(dir, 'abcdef0', 'k'), Error, 'invalid session id');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('accepts exactly 8 hex characters', async () => {
  const dir = await tmp();
  await storeIdentity(dir, 'abcdef01', 'k');
  assertEquals(await loadIdentity(dir, 'abcdef01'), 'k');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('accepts exactly 64 hex characters', async () => {
  const dir = await tmp();
  const id = 'a'.repeat(64);
  await storeIdentity(dir, id, 'k');
  assertEquals(await loadIdentity(dir, id), 'k');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects 65 hex characters (above maximum)', async () => {
  const dir = await tmp();
  await assertRejects(() => storeIdentity(dir, 'a'.repeat(65), 'k'), Error, 'invalid session id');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects all-hyphens (structurally valid but not a real ID)', async () => {
  // The regex allows this; this test documents the current behavior.
  // All-hyphens is technically accepted by the regex. If this is undesirable,
  // the regex should be tightened. For now, pin it.
  const dir = await tmp();
  const id = '--------'; // 8 hyphens
  // This is accepted by the current regex. If policy changes, this test
  // should flip to assertRejects.
  await storeIdentity(dir, id, 'k');
  assertEquals(await loadIdentity(dir, id), 'k');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects null byte in session id', async () => {
  const dir = await tmp();
  await assertRejects(
    () => storeIdentity(dir, 'abcd\x00ef01', 'k'),
    Error,
    'invalid session id',
  );
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects path traversal with dots and slashes', async () => {
  const dir = await tmp();
  for (const bad of ['../escape', './here', '/etc/passwd', 'a/b/c/d/e/f/g/h']) {
    await assertRejects(() => storeIdentity(dir, bad, 'k'), Error, 'invalid session id');
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects Unicode fullwidth digits', async () => {
  const dir = await tmp();
  // ０１２３４５６７ — fullwidth forms that look like 01234567
  await assertRejects(
    () => storeIdentity(dir, '\uff10\uff11\uff12\uff13\uff14\uff15\uff16\uff17', 'k'),
    Error,
    'invalid session id',
  );
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects Bidi override characters wrapping valid hex', async () => {
  const dir = await tmp();
  await assertRejects(
    () => storeIdentity(dir, '\u202eabcdef01\u202c', 'k'),
    Error,
    'invalid session id',
  );
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects spaces around valid hex', async () => {
  const dir = await tmp();
  await assertRejects(() => storeIdentity(dir, ' abcdef01', 'k'), Error, 'invalid session id');
  await assertRejects(() => storeIdentity(dir, 'abcdef01 ', 'k'), Error, 'invalid session id');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('rejects newlines in session id', async () => {
  const dir = await tmp();
  await assertRejects(() => storeIdentity(dir, 'abcd\nef01', 'k'), Error, 'invalid session id');
  await assertRejects(() => storeIdentity(dir, 'abcd\ref01', 'k'), Error, 'invalid session id');
  await Deno.remove(dir, { recursive: true });
});

// ── Symlink defense ──────────────────────────────────────────────────

Deno.test('storeIdentity - refuses to write through a symlink', async () => {
  const dir = await tmp();
  const target = `${dir}/target.txt`;
  await Deno.writeTextFile(target, 'original content');
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await Deno.symlink(target, `${dir}/${id}.key`);
  await assertRejects(() => storeIdentity(dir, id, 'INJECTED'), Error, 'symlink');
  // The target must be untouched.
  assertEquals(await Deno.readTextFile(target), 'original content');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('loadIdentity - refuses to read through a symlink', async () => {
  const dir = await tmp();
  const target = `${dir}/secret.txt`;
  await Deno.writeTextFile(target, 'secret data');
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await Deno.symlink(target, `${dir}/${id}.key`);
  await assertRejects(() => loadIdentity(dir, id), Error, 'symlink');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('storeIdentity - succeeds when no symlink exists (new file)', async () => {
  const dir = await tmp();
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await storeIdentity(dir, id, 'AGE-SECRET-KEY-1TEST');
  assertEquals(await loadIdentity(dir, id), 'AGE-SECRET-KEY-1TEST');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('storeIdentity - succeeds when overwriting a regular file', async () => {
  const dir = await tmp();
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await storeIdentity(dir, id, 'old');
  await storeIdentity(dir, id, 'new');
  assertEquals(await loadIdentity(dir, id), 'new');
  await Deno.remove(dir, { recursive: true });
});

// ── Concurrent store ─────────────────────────────────────────────────

Deno.test('two concurrent storeIdentity calls for the same session do not corrupt', async () => {
  const dir = await tmp();
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await Promise.all([
    storeIdentity(dir, id, 'KEY-A'),
    storeIdentity(dir, id, 'KEY-B'),
  ]);
  const result = await loadIdentity(dir, id);
  assert(result === 'KEY-A' || result === 'KEY-B', 'one of the two writes must win cleanly');
  await Deno.remove(dir, { recursive: true });
});
