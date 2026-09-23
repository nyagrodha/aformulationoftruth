/**
 * Hermetic tests for provision-brooch.ts's pure serial-reply handling.
 * Importing this module never opens a port or touches a database: the CLI's
 * side effects live inside main(), gated by `if (import.meta.main)`.
 */
import { assertEquals } from '$std/assert/mod.ts';
import { findReplyLine, runGuarded, sanitizeReply } from './provision-brooch.ts';

Deno.test('findReplyLine: no match until the line is terminated', () => {
  // A PROV1-OK split across two reads must not match on the first, partial
  // half -- that was the bug: an early, wrong match rolled back the site's
  // rows while the brooch had already stored the key.
  assertEquals(findReplyLine('PROV1-OK Ck8A'), null);
  assertEquals(findReplyLine('PROV1-OK Ck8AAQAAEJIh_IXwnDbGNzCAlY4\n'), 'PROV1-OK Ck8AAQAAEJIh_IXwnDbGNzCAlY4');
});

Deno.test('findReplyLine: CRLF-terminated lines match', () => {
  assertEquals(findReplyLine('PROV1-ERR bad-key\r\n'), 'PROV1-ERR bad-key');
});

Deno.test('findReplyLine: boot chatter ahead of the reply is skipped', () => {
  const acc = 'booting...\nwifi: connecting\nPROV1-OK Ck8AAQAAEJIh_IXwnDbGNzCAlY4\n';
  assertEquals(findReplyLine(acc), 'PROV1-OK Ck8AAQAAEJIh_IXwnDbGNzCAlY4');
});

Deno.test('findReplyLine: an echo of the sent PROV1 line never matches', () => {
  // "PROV1 <id> <key>" starts with "PROV1 " (a space), not "PROV1-OK" or
  // "PROV1-ERR" -- a serial loopback or faulty firmware echo must not be
  // mistaken for a reply.
  const acc = 'PROV1 0000002a AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-A\n';
  assertEquals(findReplyLine(acc), null);
});

Deno.test('findReplyLine: only complete lines are considered even with trailing partial data', () => {
  const acc = 'PROV1-OK Ck8AAQAAEJIh_IXwnDbGNzCAlY4\nPROV1-O';
  assertEquals(findReplyLine(acc), 'PROV1-OK Ck8AAQAAEJIh_IXwnDbGNzCAlY4');
});

Deno.test('sanitizeReply: short status lines pass through unchanged', () => {
  assertEquals(sanitizeReply('PROV1-ERR already-provisioned'), 'PROV1-ERR already-provisioned');
  assertEquals(sanitizeReply('ERR bad-checksum'), 'ERR bad-checksum');
});

Deno.test('sanitizeReply: a reply carrying a long base64url run is withheld', () => {
  // 32 chars comfortably clears the 30-char threshold and could be a
  // fragment of K_brooch (43 chars base64url) or the sent key itself.
  const keyBearing = `ERR unexpected ${'A'.repeat(32)}`;
  assertEquals(sanitizeReply(keyBearing), '(unrecognised reply withheld)');
});

Deno.test('sanitizeReply: anything not shaped like PROV1-ERR/ERR is withheld', () => {
  assertEquals(sanitizeReply('PROV1-OK Ck8AAQAAEJIh_IXwnDbGNzCAlY4'), '(unrecognised reply withheld)');
  assertEquals(sanitizeReply('garbage'), '(unrecognised reply withheld)');
});

Deno.test('sanitizeReply: a timed-out (null) exchange gets an accurate, non-misleading message', () => {
  const msg = sanitizeReply(null);
  assertEquals(
    msg,
    'no reply (wrong port, different firmware, or another process holding the port; ' +
      'an already-provisioned brooch answers PROV1-ERR)',
  );
});

Deno.test('runGuarded: cleanup runs after a failure, not just on success', async () => {
  // This is the exact ordering bug the fix addresses: `catch { Deno.exit(1) }`
  // never reaches a `finally` because Deno.exit() kills the process first, so
  // the key buffer only got zeroed on the success path. Here onError() never
  // calls Deno.exit() (it just records that it ran, standing in for setting
  // Deno.exitCode) -- proving cleanup() is reachable after a failure at all.
  const order: string[] = [];
  const result = await runGuarded(
    () => {
      order.push('fn');
      throw new Error('boom');
    },
    () => order.push('onError'),
    () => order.push('cleanup'),
  );
  assertEquals(result, { ok: false });
  assertEquals(order, ['fn', 'onError', 'cleanup']);
});

Deno.test('runGuarded: cleanup also runs on success, after the value is captured', async () => {
  const order: string[] = [];
  const result = await runGuarded(
    () => {
      order.push('fn');
      return Promise.resolve(42);
    },
    () => order.push('onError'),
    () => order.push('cleanup'),
  );
  assertEquals(result, { ok: true, value: 42 });
  assertEquals(order, ['fn', 'cleanup']);
});
