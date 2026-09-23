import { assertEquals } from '$std/assert/mod.ts';
import { codeState, decideEncounter, GRACE_MS } from './brooch_policy.ts';

const now = new Date('2026-09-23T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

Deno.test('a counter above last_counter is a new encounter — with no upper bound', () => {
  assertEquals(decideEncounter({ counter: 1, lastCounter: 0, firstSeen: null, now }), 'new');
  assertEquals(decideEncounter({ counter: 4_000_000, lastCounter: 3, firstSeen: null, now }), 'new');
});

Deno.test('a counter at or below last_counter with no row is refused', () => {
  assertEquals(decideEncounter({ counter: 5, lastCounter: 5, firstSeen: null, now }), 'reject');
  assertEquals(decideEncounter({ counter: 1, lastCounter: 5, firstSeen: null, now }), 'reject');
});

Deno.test('an existing code is grace within 15 min of first_seen, refused after', () => {
  assertEquals(decideEncounter({ counter: 5, lastCounter: 5, firstSeen: ago(GRACE_MS), now }), 'grace');
  assertEquals(decideEncounter({ counter: 5, lastCounter: 5, firstSeen: ago(GRACE_MS + 1), now }), 'reject');
});

Deno.test('codeState', () => {
  assertEquals(codeState({ counter: 6, lastCounter: 5, exists: false }), 'fresh');
  assertEquals(codeState({ counter: 5, lastCounter: 5, exists: true }), 'redeemed');
  assertEquals(codeState({ counter: 4, lastCounter: 5, exists: false }), 'stale');
  // a scanned code stays "redeemed" even after later codes advanced last_counter
  assertEquals(codeState({ counter: 4, lastCounter: 9, exists: true }), 'redeemed');
});
