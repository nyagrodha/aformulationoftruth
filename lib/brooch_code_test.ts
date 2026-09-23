/**
 * A4OT-ENC1 encounter codes. The vectors are the spec's; the brooch firmware's
 * native tests pin the same three, so the two halves cannot drift.
 */
import { assert, assertEquals } from '$std/assert/mod.ts';
import { encodeCode, importBroochKey, parseCode, verifyCode } from './brooch_code.ts';

const TEST_KEY = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));

Deno.test('encodeCode reproduces the spec vectors', async () => {
  const key = await importBroochKey(TEST_KEY);
  assertEquals(await encodeCode(key, 1, 0), 'AAAAAQAAAACGBtUmZ8xVI_XW4S0');
  assertEquals(await encodeCode(key, 1, 1), 'AAAAAQAAAAFx9TXanbdHdONdZuM');
  assertEquals(await encodeCode(key, 0x0A4F0001, 4242), 'Ck8AAQAAEJIh_IXwnDbGNzCAlY4');
});

Deno.test('parseCode reads id and counter; verifyCode accepts the genuine code', async () => {
  const key = await importBroochKey(TEST_KEY);
  const p = parseCode('Ck8AAQAAEJIh_IXwnDbGNzCAlY4');
  assert(p);
  assertEquals(p.broochId, 0x0A4F0001);
  assertEquals(p.counter, 4242);
  assert(await verifyCode(key, p));
});

Deno.test('verifyCode rejects a one-character tamper and a different key', async () => {
  const key = await importBroochKey(TEST_KEY);
  // Last char M -> I: still canonical (low 2 bits zero), so only the MAC can catch it.
  const tampered = parseCode('AAAAAQAAAAFx9TXanbdHdONdZuI');
  assert(tampered);
  assertEquals(await verifyCode(key, tampered), false);

  const other = await importBroochKey(new Uint8Array(32).fill(7));
  const genuine = parseCode('AAAAAQAAAAFx9TXanbdHdONdZuM');
  assert(genuine);
  assertEquals(await verifyCode(other, genuine), false);
});

Deno.test('parseCode rejects malformed input', () => {
  assertEquals(parseCode(''), null);
  assertEquals(parseCode('AAAAAQAAAAFx9TXanbdHdONdZu'), null); // 26 chars
  assertEquals(parseCode('AAAAAQAAAAFx9TXanbdHdONdZuM1'), null); // 28 chars
  assertEquals(parseCode('AAAAAQAAAAFx9TXanbdHdONdZu+'), null); // not url-safe
});

Deno.test('parseCode rejects a non-canonical final character', () => {
  // 27 chars carry 162 bits for 160 bits of data; the last char's low 2 bits must be 0.
  assertEquals(parseCode('AAAAAQAAAACGBtUmZ8xVI_XW4S1'), null);
});
