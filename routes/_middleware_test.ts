/**
 * routes/_middleware.ts's fail-open guarantee and its wiring of
 * lib/visit-class.ts into lib/audience.ts.
 *
 * The classification rule itself (what counts as person/bot/unclassified/none)
 * is pinned in lib/visit-class_test.ts, which needs no server at all. These
 * tests are about the plumbing around it: that a throwing counter can never
 * change what a visitor receives, and that the right audience function gets
 * called for the right outcome.
 *
 *   deno test --allow-env --allow-read routes/_middleware_test.ts
 */

import { assertEquals, assertStrictEquals } from '$std/assert/mod.ts';
import { audience, handler } from './_middleware.ts';
import { getCurrentHourMetrics } from '../lib/metrics.ts';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const NAV_HEADERS: Record<string, string> = {
  'user-agent': CHROME_UA,
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
};

// deno-lint-ignore no-explicit-any
type Ctx = any;

function stubCtx(destination: string, next: () => Promise<Response>): Ctx {
  return {
    destination,
    remoteAddr: { hostname: '203.0.113.5' },
    next,
  };
}

function htmlResponse(status = 200): Response {
  return new Response('<html></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function req(path: string, headers: Record<string, string>, init: RequestInit = {}): Request {
  return new Request(`https://aformulationoftruth.com${path}`, { headers, ...init });
}

/** Record calls without touching Postgres or lib/audience.ts's real logic. */
function spy<A extends unknown[]>(): { calls: A[]; fn: (...args: A) => Promise<void> } {
  const calls: A[] = [];
  return {
    calls,
    fn: (...args: A) => {
      calls.push(args);
      return Promise.resolve();
    },
  };
}

const originalNoteRequest = audience.noteRequest;
const originalRecordVisit = audience.recordVisit;
const originalRecordOptOutNavigation = audience.recordOptOutNavigation;

function restoreAudience(): void {
  audience.noteRequest = originalNoteRequest;
  audience.recordVisit = originalRecordVisit;
  audience.recordOptOutNavigation = originalRecordOptOutNavigation;
}

function metricCount(name: string): number {
  return getCurrentHourMetrics()[name] ?? 0;
}

// --- destination gating ------------------------------------------------------

Deno.test('non-route destinations never reach the counter, including noteRequest', async () => {
  const note = spy<[string | null, Date?]>();
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.noteRequest = note.fn as typeof audience.noteRequest;
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    for (const destination of ['static', 'internal', 'notFound']) {
      const res = htmlResponse();
      const ctx = stubCtx(destination, () => Promise.resolve(res));
      const out = await handler(req('/whatever', NAV_HEADERS), ctx);
      assertStrictEquals(out, res);
    }
    assertEquals(note.calls.length, 0);
    assertEquals(visit.calls.length, 0);
  } finally {
    restoreAudience();
  }
});

// --- fail-open ---------------------------------------------------------------

Deno.test('a throwing counter leaves the response unchanged and is only ever a category count', async () => {
  audience.recordVisit = () => {
    throw new Error('boom');
  };
  try {
    const before = metricCount('errors.audience.record');
    const res = htmlResponse();
    const ctx = stubCtx('route', () => Promise.resolve(res));
    const out = await handler(req('/', NAV_HEADERS), ctx);
    assertStrictEquals(out, res); // fail-open: identical object, not just equal
    assertEquals(metricCount('errors.audience.record'), before + 1);
  } finally {
    restoreAudience();
  }
});

Deno.test('the response is the exact object ctx.next() produced, on every path', async () => {
  const cases: [string, Record<string, string>][] = [
    ['/', NAV_HEADERS], // person
    ['/api/brooch/status', NAV_HEADERS], // none, under /api/
    ['/', {}], // unclassified
  ];
  for (const [path, headers] of cases) {
    const res = htmlResponse();
    const ctx = stubCtx('route', () => Promise.resolve(res));
    const out = await handler(req(path, headers), ctx);
    assertStrictEquals(out, res, `response identity broke for ${path}`);
  }
});

// --- the brooch poll and other /api/ traffic ---------------------------------

// Ruling S17: the poll must still count toward `requests` (a plain integer,
// no pseudonym) even though it is excluded from `visitors` -- otherwise a
// window with nothing else in it gets no row at all, and the daily report
// reads that silence as an outage rather than as API traffic.
Deno.test('POST /api/brooch/status: requests +1, visitors +0', async () => {
  const note = spy<[string | null, Date?]>();
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.noteRequest = note.fn as typeof audience.noteRequest;
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    const res = new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    const ctx = stubCtx('route', () => Promise.resolve(res));
    await handler(req('/api/brooch/status', {}, { method: 'POST' }), ctx);
    assertEquals(note.calls.length, 1, 'requests should still be +1');
    assertEquals(visit.calls.length, 0, 'visitors should stay +0');
  } finally {
    restoreAudience();
  }
});

Deno.test('a GET under /api/ with full navigation headers still never reaches the counter', async () => {
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    const ctx = stubCtx('route', () => Promise.resolve(htmlResponse()));
    await handler(req('/api/metrics/increment', NAV_HEADERS), ctx);
    assertEquals(visit.calls.length, 0);
  } finally {
    restoreAudience();
  }
});

// --- classification reaching the right bucket --------------------------------

Deno.test('a genuine navigation records a person', async () => {
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    const ctx = stubCtx('route', () => Promise.resolve(htmlResponse()));
    await handler(req('/', NAV_HEADERS), ctx);
    assertEquals(visit.calls.length, 1);
    assertEquals(visit.calls[0][3], 'person');
  } finally {
    restoreAudience();
  }
});

Deno.test('a brooch-shaped navigation (ESP32 UA, no Sec-Fetch) records a bot', async () => {
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    const ctx = stubCtx('route', () => Promise.resolve(htmlResponse()));
    await handler(req('/', { 'user-agent': 'ESP32HTTPClient/1.0' }), ctx);
    assertEquals(visit.calls[0][3], 'bot');
  } finally {
    restoreAudience();
  }
});

Deno.test('the app self-fetching itself (Deno/) records a bot', async () => {
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    const ctx = stubCtx('route', () => Promise.resolve(htmlResponse()));
    await handler(req('/', { 'user-agent': 'Deno/2.1.4' }), ctx);
    assertEquals(visit.calls[0][3], 'bot');
  } finally {
    restoreAudience();
  }
});

Deno.test('no Sec-Fetch-* and no bot marker records unclassified, never person', async () => {
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    const ctx = stubCtx('route', () => Promise.resolve(htmlResponse()));
    await handler(req('/', {}), ctx);
    assertEquals(visit.calls[0][3], 'unclassified');
  } finally {
    restoreAudience();
  }
});

Deno.test('a prefetch (Sec-Purpose) never reaches the counter', async () => {
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    const ctx = stubCtx('route', () => Promise.resolve(htmlResponse()));
    await handler(req('/', { ...NAV_HEADERS, 'sec-purpose': 'prefetch;prerender' }), ctx);
    assertEquals(visit.calls.length, 0);
  } finally {
    restoreAudience();
  }
});

// --- a redirect chain counts at most once, at its destination ----------------

Deno.test('a redirect hop never counts; the destination it lands on does', async () => {
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    // Hop 1: /WillyStCoop -> 302
    const redirect = new Response(null, { status: 302, headers: { location: '/WillyStCo-op' } });
    await handler(req('/WillyStCoop', NAV_HEADERS), stubCtx('route', () => Promise.resolve(redirect)));
    assertEquals(visit.calls.length, 0);

    // Hop 2: the final page, 200 html.
    await handler(req('/WillyStCo-op', NAV_HEADERS), stubCtx('route', () => Promise.resolve(htmlResponse())));
    assertEquals(visit.calls.length, 1);
    assertEquals(visit.calls[0][3], 'person');
  } finally {
    restoreAudience();
  }
});

Deno.test('a 404 from a dynamic route: requests +1, but never a visitor', async () => {
  const note = spy<[string | null, Date?]>();
  const visit = spy<[string | null, string, string, string, Date?]>();
  audience.noteRequest = note.fn as typeof audience.noteRequest;
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  try {
    const ctx = stubCtx('route', () => Promise.resolve(htmlResponse(404)));
    await handler(req('/e/not-a-code', NAV_HEADERS), ctx);
    assertEquals(note.calls.length, 1, 'a 404 still counts toward requests');
    assertEquals(visit.calls.length, 0);
  } finally {
    restoreAudience();
  }
});

// --- opt-out -------------------------------------------------------------------

// Ruling S17: opting out still counts toward `requests` (a plain integer --
// noteRequest never touches a pseudonym), on top of the pre-existing
// optout_navigations count.
Deno.test('GPC/DNT: a navigation that would have been a person: requests +1, optout_navigations +1, no pseudonym', async () => {
  const note = spy<[string | null, Date?]>();
  const visit = spy<[string | null, string, string, string, Date?]>();
  const optOut = spy<[string | null, Date?]>();
  audience.noteRequest = note.fn as typeof audience.noteRequest;
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  audience.recordOptOutNavigation = optOut.fn as typeof audience.recordOptOutNavigation;
  try {
    const ctx = stubCtx('route', () => Promise.resolve(htmlResponse()));
    await handler(req('/', { ...NAV_HEADERS, 'sec-gpc': '1' }), ctx);
    assertEquals(note.calls.length, 1, 'requests should still be +1');
    assertEquals(visit.calls.length, 0, 'an opted-out person must never get a pseudonym');
    assertEquals(optOut.calls.length, 1);
  } finally {
    restoreAudience();
  }
});

Deno.test('GPC/DNT: a bot or unclassified opt-out reaches no pseudonym bucket, but still counts as a request', async () => {
  const note = spy<[string | null, Date?]>();
  const visit = spy<[string | null, string, string, string, Date?]>();
  const optOut = spy<[string | null, Date?]>();
  audience.noteRequest = note.fn as typeof audience.noteRequest;
  audience.recordVisit = visit.fn as typeof audience.recordVisit;
  audience.recordOptOutNavigation = optOut.fn as typeof audience.recordOptOutNavigation;
  try {
    // Bot UA, opted out.
    await handler(
      req('/', { 'user-agent': 'ESP32HTTPClient/1.0', dnt: '1' }),
      stubCtx('route', () => Promise.resolve(htmlResponse())),
    );
    // Unclassified, opted out.
    await handler(
      req('/', { 'sec-gpc': '1' }),
      stubCtx('route', () => Promise.resolve(htmlResponse())),
    );
    assertEquals(note.calls.length, 2, 'requests should still be +1 for each');
    assertEquals(visit.calls.length, 0);
    assertEquals(optOut.calls.length, 0);
  } finally {
    restoreAudience();
  }
});
