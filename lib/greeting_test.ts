import { assertEquals } from '$std/assert/mod.ts';
import { greetingFor } from './greeting.ts';

Deno.test('es-MX,es;q=0.9,en;q=0.8 -> Hola (primary subtag match)', () => {
  assertEquals(greetingFor('es-MX,es;q=0.9,en;q=0.8'), 'Hola');
});

Deno.test('ta-IN,ta;q=0.9,en;q=0.8 -> Vanakkam', () => {
  assertEquals(greetingFor('ta-IN,ta;q=0.9,en;q=0.8'), 'Vanakkam');
});

Deno.test('en-US,ta;q=0.5 -> Hi (English is preferred)', () => {
  assertEquals(greetingFor('en-US,ta;q=0.5'), 'Hi');
});

Deno.test('fr-CA -> Bonjour', () => {
  assertEquals(greetingFor('fr-CA'), 'Bonjour');
});

Deno.test('hi -> Namaste', () => {
  assertEquals(greetingFor('hi'), 'Namaste');
});

Deno.test('de-DE,de;q=0.9 -> Hi (no match, falls back)', () => {
  assertEquals(greetingFor('de-DE,de;q=0.9'), 'Hi');
});

Deno.test('* -> Hi', () => {
  assertEquals(greetingFor('*'), 'Hi');
});

Deno.test('es;q=0,fr -> Bonjour (q=0 is excluded)', () => {
  assertEquals(greetingFor('es;q=0,fr'), 'Bonjour');
});

Deno.test('ta;q=0.4,es;q=0.6 -> Hola (ordered by q, not position)', () => {
  assertEquals(greetingFor('ta;q=0.4,es;q=0.6'), 'Hola');
});

Deno.test('null, empty and garbled headers -> Hi', () => {
  assertEquals(greetingFor(null), 'Hi');
  assertEquals(greetingFor(''), 'Hi');
  assertEquals(greetingFor(';;;,,q=abc'), 'Hi');
});

Deno.test('case-insensitive primary subtag match: TA-in -> Vanakkam', () => {
  assertEquals(greetingFor('TA-in'), 'Vanakkam');
});

Deno.test('20 unmatched entries followed by a real match past the cap -> Hi (cap excludes it)', () => {
  const filler = Array.from({ length: 20 }, (_, i) => `xx${i};q=0.9`).join(',');
  assertEquals(greetingFor(`${filler},es;q=0.9`), 'Hi');
});

Deno.test('a 10 KB header still returns quickly and correctly', () => {
  const big = 'fr,' + 'zz;q=0.1,'.repeat(1200); // well over 10 KB
  const start = performance.now();
  const result = greetingFor(big);
  const elapsed = performance.now() - start;
  assertEquals(result, 'Bonjour');
  assertEquals(elapsed < 50, true);
});

// I1 (review fix round 1): GREETINGS is a plain object literal, so a naive
// `primary in GREETINGS` lookup also matches inherited Object.prototype
// members. Each of these tags names one, and each must fall through to the
// default greeting -- not to whatever inherited value that name resolves to.
Deno.test('a tag matching an inherited Object.prototype member never resolves through the prototype chain', () => {
  for (const tag of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const g = greetingFor(tag);
    assertEquals(typeof g, 'string');
    assertEquals(g, 'Hi');
  }
});

Deno.test('constructor,fr -> Bonjour (constructor is skipped, not matched)', () => {
  assertEquals(greetingFor('constructor,fr'), 'Bonjour');
});

// M1 (review fix round 1): q is clamped to [0, 1]. An explicitly malformed or
// negative q (anything that isn't a plain non-negative decimal) drops the
// WHOLE entry -- see the comment in greeting.ts for why. A q that parses but
// exceeds 1 is clamped down to 1 rather than being allowed to outrank a
// legitimate q=1 entry that appears later in the header.
Deno.test('en;q=1.5,es -> Hi (q>1 clamps to 1; ties keep header order)', () => {
  assertEquals(greetingFor('en;q=1.5,es'), 'Hi');
});

Deno.test('es;q=-1,fr -> Bonjour (an explicit negative q drops the entry)', () => {
  assertEquals(greetingFor('es;q=-1,fr'), 'Bonjour');
});
