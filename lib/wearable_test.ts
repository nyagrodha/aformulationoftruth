import { assertEquals } from '$std/assert/mod.ts';
import { encounterCookie, encounterFromCookie, wearableCookie } from './wearable.ts';

const HASH = 'a'.repeat(64);

Deno.test('wearableCookie is byte-identical to what /w/ has always set', () => {
  assertEquals(
    wearableCookie('tok_0123456789abcdef'),
    'wearable_token=tok_0123456789abcdef; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax',
  );
});

Deno.test('encounterCookie is Secure only when BASE_URL is https', () => {
  const prev = Deno.env.get('BASE_URL');
  try {
    Deno.env.set('BASE_URL', 'https://aformulationoftruth.com');
    assertEquals(encounterCookie(HASH), `encounter=${HASH}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure`);
    Deno.env.set('BASE_URL', 'http://192.168.1.50:8000');
    assertEquals(encounterCookie(HASH), `encounter=${HASH}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`);
  } finally {
    if (prev === undefined) Deno.env.delete('BASE_URL');
    else Deno.env.set('BASE_URL', prev);
  }
});

Deno.test('encounterFromCookie takes only a 64-hex value', () => {
  assertEquals(encounterFromCookie(`a=1; encounter=${HASH}; b=2`), HASH);
  assertEquals(encounterFromCookie(`encounter=${HASH}`), HASH);
  assertEquals(encounterFromCookie('encounter=xyz'), null);
  assertEquals(encounterFromCookie(`myencounter=${HASH}`), null);
  assertEquals(encounterFromCookie(null), null);
});
