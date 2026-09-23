import { assert, assertEquals } from '$std/assert/mod.ts';
import { encodeBase64 } from '$std/encoding/base64.ts';
import { encodeCode } from './brooch_code.ts';
import { loadKek, unwrapBroochKey, wrapBroochKey } from './brooch_keys.ts';

const TEST_KEY = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));

function withKek(value: string | null, fn: () => Promise<void>) {
  return async () => {
    const prev = Deno.env.get('BROOCH_KEK');
    if (value === null) Deno.env.delete('BROOCH_KEK');
    else Deno.env.set('BROOCH_KEK', value);
    try {
      await fn();
    } finally {
      if (prev === undefined) Deno.env.delete('BROOCH_KEK');
      else Deno.env.set('BROOCH_KEK', prev);
    }
  };
}

Deno.test(
  'a wrapped brooch key unwraps to a key that still signs the spec vector',
  withKek(encodeBase64(new Uint8Array(32).fill(0xaa)), async () => {
    const kek = await loadKek();
    assert(kek);
    const enc = await wrapBroochKey(TEST_KEY, kek);
    assert(!enc.includes('AAECAwQF')); // not the key in the clear
    const key = await unwrapBroochKey(enc, kek);
    assert(key);
    assertEquals(await encodeCode(key, 1, 0), 'AAAAAQAAAACGBtUmZ8xVI_XW4S0');
  }),
);

Deno.test('loadKek fails closed when unset or not 32 bytes', async () => {
  await withKek(null, async () => assertEquals(await loadKek(), null))();
  await withKek(encodeBase64(new Uint8Array(16)), async () => assertEquals(await loadKek(), null))();
  await withKek('not base64 at all!', async () => assertEquals(await loadKek(), null))();
});

Deno.test(
  'unwrap under the wrong KEK is null, not a throw',
  withKek(encodeBase64(new Uint8Array(32).fill(1)), async () => {
    const kek = await loadKek();
    assert(kek);
    const enc = await wrapBroochKey(TEST_KEY, kek);
    Deno.env.set('BROOCH_KEK', encodeBase64(new Uint8Array(32).fill(2)));
    const other = await loadKek();
    assert(other);
    assertEquals(await unwrapBroochKey(enc, other), null);
  }),
);
