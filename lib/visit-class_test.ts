/**
 * Pins the visit-counting rule (audit §3.1, task-5b-brief.md). Pure and
 * hermetic: no Fresh, no database, no clock.
 *
 *   deno test --allow-env --allow-read lib/visit-class_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import { classifyVisit, NOT_COUNTED, optedOut } from './visit-class.ts';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function h(entries: Record<string, string> = {}): Headers {
  return new Headers(entries);
}

/** A request/response pair shaped like a genuine top-level page load. */
const NAV_HEADERS = {
  'user-agent': CHROME_UA,
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
};

function classify(
  overrides: Partial<{
    method: string;
    pathname: string;
    headers: Record<string, string>;
    status: number;
    contentType: string | null;
  }> = {},
) {
  const {
    method = 'GET',
    pathname = '/',
    headers = NAV_HEADERS,
    status = 200,
    contentType = 'text/html; charset=utf-8',
  } = overrides;
  return classifyVisit(method, pathname, h(headers), status, contentType);
}

// --- the canonical case ----------------------------------------------------

Deno.test('a genuine top-level navigation is a person', () => {
  assertEquals(classify(), 'person');
});

// --- method -----------------------------------------------------------------

Deno.test('only GET can be a person; HEAD, POST, OPTIONS are excluded', () => {
  for (const method of ['HEAD', 'POST', 'OPTIONS', 'PUT', 'DELETE']) {
    assertEquals(classify({ method }), 'none', `expected none for ${method}`);
  }
});

// --- path --------------------------------------------------------------------

Deno.test('the brooch status poll is excluded: it is under /api/', () => {
  assertEquals(classify({ pathname: '/api/brooch/status' }), 'none');
});

Deno.test('every /api/ path is excluded, not just the brooch', () => {
  for (const pathname of ['/api/metrics/increment', '/api/profile', '/api']) {
    assertEquals(classify({ pathname }), 'none', `expected none for ${pathname}`);
  }
});

Deno.test('a GET under /api/ with full navigation headers is still none', () => {
  // The brooch's poll is a POST in practice, but the path exclusion must not
  // depend on that -- an /api/ route is never a page.
  assertEquals(classify({ method: 'GET', pathname: '/api/brooch/status' }), 'none');
});

Deno.test('a POST to /api/brooch/status is none (fails method and path both)', () => {
  assertEquals(classify({ method: 'POST', pathname: '/api/brooch/status', headers: {} }), 'none');
});

Deno.test('Fresh island chunks are excluded even if something reaches this function for one', () => {
  assertEquals(classify({ pathname: '/_frsh/js/abc123/main.js' }), 'none');
});

// --- response ----------------------------------------------------------------

Deno.test('redirects, 404s, 405s and 5xx are none -- a redirect chain counts once, at its destination', () => {
  for (const status of [302, 404, 405, 500]) {
    assertEquals(classify({ status }), 'none', `expected none for status ${status}`);
  }
});

Deno.test('a 200 JSON response is not a page view', () => {
  assertEquals(classify({ contentType: 'application/json' }), 'none');
});

Deno.test('a missing Content-Type is not a page view', () => {
  assertEquals(classify({ contentType: null }), 'none');
});

// --- Sec-Fetch-Dest ------------------------------------------------------------

Deno.test('a non-document destination (iframe, empty) is none even with Sec-Fetch-Mode: navigate', () => {
  for (const dest of ['iframe', 'empty']) {
    assertEquals(
      classify({ headers: { 'user-agent': CHROME_UA, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': dest } }),
      'none',
      `expected none for dest=${dest}`,
    );
  }
});

// --- Sec-Purpose / Purpose -------------------------------------------------

Deno.test('a speculative load (prefetch, prerender, the private prefetch proxy) is none', () => {
  const cases: Record<string, string>[] = [
    { ...NAV_HEADERS, 'sec-purpose': 'prefetch;prerender' },
    { ...NAV_HEADERS, 'sec-purpose': 'prefetch;anonymous-client-ip' },
    { ...NAV_HEADERS, purpose: 'prefetch' },
  ];
  for (const headers of cases) {
    assertEquals(classify({ headers }), 'none', `expected none for ${JSON.stringify(headers)}`);
  }
});

// --- bots --------------------------------------------------------------------

Deno.test('link unfurlers and known bots are flagged, not dropped or counted as a person', () => {
  const uas = [
    'facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0',
    'Mozilla/5.0 (compatible; Discordbot/2.0)',
    'Mastodon/4.3.0 (http.rb/5.1.1)',
    'Bluesky Cardyb/1.1',
  ];
  for (const ua of uas) {
    assertEquals(
      classify({ headers: { ...NAV_HEADERS, 'user-agent': ua } }),
      'bot',
      `expected bot for ${ua}`,
    );
  }
});

Deno.test('a brooch-shaped request (no Sec-Fetch headers, ESP32 UA) is a bot, not unclassified', () => {
  assertEquals(classify({ headers: { 'user-agent': 'ESP32HTTPClient/1.0' } }), 'bot');
});

Deno.test('the app self-fetching itself (Deno/) is a bot', () => {
  assertEquals(classify({ headers: { 'user-agent': 'Deno/2.1.4' } }), 'bot');
});

// --- unclassified --------------------------------------------------------------

Deno.test('no Sec-Fetch-* and a non-bot (or empty) UA is unclassified, never person', () => {
  assertEquals(classify({ headers: {} }), 'unclassified');
  assertEquals(classify({ headers: { 'user-agent': 'Mozilla/5.0 (some old webview)' } }), 'unclassified');
});

// --- opt-out -------------------------------------------------------------------

Deno.test('optedOut is true for Sec-GPC: 1', () => {
  assertEquals(optedOut(h({ 'sec-gpc': '1' })), true);
});

Deno.test('optedOut is true for DNT: 1', () => {
  assertEquals(optedOut(h({ dnt: '1' })), true);
});

Deno.test('optedOut is false when neither header is present, and false for DNT: 0', () => {
  assertEquals(optedOut(h()), false);
  assertEquals(optedOut(h({ dnt: '0' })), false);
});

// --- NOT_COUNTED -----------------------------------------------------------------

Deno.test('an explicit NOT_COUNTED path is excluded even outside /api/', () => {
  NOT_COUNTED.add('/not-a-real-path-for-this-test');
  try {
    assertEquals(classify({ pathname: '/not-a-real-path-for-this-test' }), 'none');
  } finally {
    NOT_COUNTED.delete('/not-a-real-path-for-this-test');
  }
});
