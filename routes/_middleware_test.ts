/**
 * Audience middleware: counting must never change what a visitor receives.
 *
 * The privacy claims live in lib/audience.ts and are tested there. This file
 * pins the request-path contract: monitoring endpoints are not visitors,
 * Global Privacy Control / DNT are honoured, static assets are not multiplied
 * into a dozen "visits", and a counting failure still returns the page.
 *
 *   deno test --allow-env --allow-read routes/_middleware_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import type { FreshContext } from '$fresh/server.ts';
import { _openKeyForTest, _resetForTest } from '../lib/audience.ts';
import { getCurrentHourMetrics } from '../lib/metrics.ts';
import { handler } from './_middleware.ts';

// Importing the middleware starts the audience flush timer (unref'd, so it
// does not hold the process). Clear it before any test so Deno's leak
// detector does not treat that pre-existing interval as a leak when the
// first test calls _resetForTest.
_resetForTest();

const MARKER = 'bookkeeping-must-not-touch-this';

function ctx(overrides: {
  destination?: FreshContext['destination'];
  hostname?: string;
} = {}): { context: FreshContext; page: Response } {
  const page = new Response('page', { status: 200, headers: { 'X-Marker': MARKER } });
  const context = {
    destination: overrides.destination ?? 'route',
    next: () => Promise.resolve(page),
    remoteAddr: { hostname: overrides.hostname ?? '203.0.113.7' },
  } as unknown as FreshContext;
  return { context, page };
}

function req(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://aformulationoftruth.com${path}`, { headers });
}

Deno.test({
  name: 'middleware: a static asset is not counted',
  async fn() {
    _resetForTest();
    try {
      const { context, page } = ctx({ destination: 'static' });
      const res = await handler(req('/css/main.css'), context);
      assertEquals(res, page);
      assertEquals(_openKeyForTest(), null, 'no window should have been minted');
    } finally {
      _resetForTest();
    }
  },
});

Deno.test({
  name: 'middleware: /api/health is excluded, so the monitor is not the busiest visitor',
  async fn() {
    _resetForTest();
    try {
      const { context, page } = ctx();
      const res = await handler(req('/api/health'), context);
      assertEquals(res, page);
      assertEquals(_openKeyForTest(), null);
    } finally {
      _resetForTest();
    }
  },
});

Deno.test({
  name: 'middleware: /api/metrics is excluded for the same reason',
  async fn() {
    _resetForTest();
    try {
      const { context, page } = ctx();
      const res = await handler(req('/api/metrics'), context);
      assertEquals(res, page);
      assertEquals(_openKeyForTest(), null);
    } finally {
      _resetForTest();
    }
  },
});

Deno.test({
  name: 'middleware: a real page visit mints a window',
  async fn() {
    _resetForTest();
    try {
      const { context, page } = ctx();
      const res = await handler(req('/'), context);
      assertEquals(res, page);
      assert(_openKeyForTest() !== null, 'a page request must be folded into the count');
    } finally {
      _resetForTest();
    }
  },
});

Deno.test({
  name: 'middleware: Global Privacy Control opts the request out of the count',
  async fn() {
    _resetForTest();
    const before = getCurrentHourMetrics()['visits.optout'] ?? 0;
    try {
      const { context, page } = ctx();
      const res = await handler(req('/', { 'sec-gpc': '1' }), context);
      assertEquals(res, page);
      assertEquals(_openKeyForTest(), null, 'GPC must not mint a pseudonym');
      assertEquals(getCurrentHourMetrics()['visits.optout'], before + 1);
    } finally {
      _resetForTest();
    }
  },
});

Deno.test({
  name: 'middleware: DNT opts the request out of the count',
  async fn() {
    _resetForTest();
    try {
      const { context, page } = ctx();
      const res = await handler(req('/', { dnt: '1' }), context);
      assertEquals(res, page);
      assertEquals(_openKeyForTest(), null);
    } finally {
      _resetForTest();
    }
  },
});

Deno.test({
  name: 'middleware: the page that went in is the page that comes out',
  async fn() {
    // THE LOAD-BEARING CLAIM. Counting is bookkeeping. If this fails, a
    // metrics regression can 500 a visitor or strip a header.
    _resetForTest();
    try {
      const { context, page } = ctx();
      const res = await handler(req('/questionnaire'), context);
      assertEquals(res, page);
      assertEquals(res.headers.get('X-Marker'), MARKER);
      assertEquals(res.status, 200);
    } finally {
      _resetForTest();
    }
  },
});
