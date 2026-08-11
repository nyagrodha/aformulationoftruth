import { assert, assertEquals, assertNotEquals, assertRejects } from '$std/assert/mod.ts';
import { isBotUserAgent, utcDay, visitorHash, withDeadline } from './qr-scans.ts';

const SALT_A = new Uint8Array(32).fill(1);
const SALT_B = new Uint8Array(32).fill(2);

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';

// --- utcDay ---------------------------------------------------------------

Deno.test('utcDay formats as YYYY-MM-DD', () => {
  assertEquals(utcDay(new Date('2026-08-11T14:32:00Z')), '2026-08-11');
});

// Local time would roll the bucket at the wrong moment and, worse, would move
// the boundary if the server's zone ever changed.
Deno.test('utcDay uses UTC, not the host timezone', () => {
  assertEquals(utcDay(new Date('2026-08-11T23:59:59Z')), '2026-08-11');
  assertEquals(utcDay(new Date('2026-08-12T00:00:00Z')), '2026-08-12');
});

// --- visitorHash ----------------------------------------------------------

Deno.test('the same visitor on the same day hashes identically', async () => {
  const a = await visitorHash(SALT_A, '203.0.113.7', PHONE);
  const b = await visitorHash(SALT_A, '203.0.113.7', PHONE);
  assertEquals(a, b);
});

Deno.test('a different user agent is a different visitor', async () => {
  const a = await visitorHash(SALT_A, '203.0.113.7', PHONE);
  const b = await visitorHash(SALT_A, '203.0.113.7', PHONE + ' Safari');
  assertNotEquals(a, b);
});

Deno.test('a different address is a different visitor', async () => {
  const a = await visitorHash(SALT_A, '203.0.113.7', PHONE);
  const b = await visitorHash(SALT_A, '203.0.113.8', PHONE);
  assertNotEquals(a, b);
});

// The unlinkability property the 48h salt policy exists to provide: the same
// person on two days must not produce the same hash, or the daily rotation
// would be decorative and every past day would stay correlatable.
Deno.test('the same visitor on a different day hashes differently', async () => {
  const a = await visitorHash(SALT_A, '203.0.113.7', PHONE);
  const b = await visitorHash(SALT_B, '203.0.113.7', PHONE);
  assertNotEquals(a, b);
});

// Without an unambiguous separator, an address ending in a newline could
// collide with a user agent beginning with one, letting a crafted UA
// impersonate another visitor's bucket.
Deno.test('the field separator cannot be forged across ip and user agent', async () => {
  const a = await visitorHash(SALT_A, '203.0.113.7\nEvil', '');
  const b = await visitorHash(SALT_A, '203.0.113.7', 'Evil');
  assertNotEquals(a, b);
});

Deno.test('the hash is hex and reveals nothing of its length', async () => {
  const short = await visitorHash(SALT_A, '1.1.1.1', 'x');
  const long = await visitorHash(SALT_A, '203.0.113.7', PHONE.repeat(4));
  assertEquals(short.length, long.length);
  assert(/^[0-9a-f]+$/.test(short), short);
});

// --- deadline -------------------------------------------------------------

Deno.test('work that finishes in time passes its value through', async () => {
  assertEquals(await withDeadline(Promise.resolve('done'), 1000), 'done');
});

// A rejection must stay a rejection rather than being flattened into the
// deadline case: the caller distinguishes them only by not caring, and a
// future caller might.
Deno.test('work that fails in time still rejects', async () => {
  await assertRejects(() => withDeadline(Promise.reject(new Error('boom')), 1000), Error, 'boom');
});

// The case the try/catch around recordScan cannot cover. A rejecting database
// is caught; a *stalled* one is not, and without this the handler waits on it
// and the scanner never receives the redirect.
Deno.test('work that stalls past the deadline rejects instead of hanging', async () => {
  const stalled = new Promise<never>(() => {}); // never settles
  await assertRejects(() => withDeadline(stalled, 20), Error, 'deadline');
});

// A timer left armed keeps the process alive and trips Deno's leak detector;
// this test fails outright if the timer is not cleared on the fast path.
Deno.test('the deadline timer is cleared when work wins', async () => {
  await withDeadline(Promise.resolve(1), 60_000);
});

// Promise.race attaches a handler to both, so a late rejection from abandoned
// work must not surface as an unhandled rejection and kill the process.
Deno.test('work rejecting after the deadline does not go unhandled', async () => {
  let failLate: (e: Error) => void = () => {};
  const late = new Promise<never>((_, reject) => {
    failLate = reject;
  });
  await assertRejects(() => withDeadline(late, 10), Error, 'deadline');
  failLate(new Error('too late'));
  await new Promise((r) => setTimeout(r, 20));
});

// --- bot detection --------------------------------------------------------

Deno.test('link unfurlers are flagged as bots', () => {
  for (
    const ua of [
      'Mozilla/5.0 (compatible; Slackbot-LinkExpanding 1.0; +https://api.slack.com/robots)',
      'WhatsApp/2.23.20.0 A',
      'facebookexternalhit/1.1',
      'Twitterbot/1.0',
      'TelegramBot (like TwitterBot)',
      'Mozilla/5.0 (compatible; Discordbot/2.0)',
      'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 Preview',
    ]
  ) {
    assert(isBotUserAgent(ua), `expected bot: ${ua}`);
  }
});

Deno.test('a real phone browser is not flagged', () => {
  assertEquals(isBotUserAgent(PHONE), false);
});

Deno.test('bot matching is case-insensitive', () => {
  assert(isBotUserAgent('slackbot-linkexpanding 1.0'));
});

// An absent user agent is suspicious but not identifiable as a bot; counting
// it as one would silently discard real scans from privacy-hardened browsers.
Deno.test('an empty user agent is not assumed to be a bot', () => {
  assertEquals(isBotUserAgent(''), false);
});
