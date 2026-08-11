import { assert, assertEquals, assertNotEquals } from '$std/assert/mod.ts';
import { isBotUserAgent, utcDay, visitorHash } from './qr-scans.ts';

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
