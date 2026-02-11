/**
 * API Route Tests
 *
 * Tests for untested API endpoints:
 * - GET  /api/health
 * - GET  /api/metrics
 * - POST /api/metrics/increment
 * - POST /api/gate
 * - POST /api/gate-submit
 * - POST /api/responses
 * - GET  /api/questions/next
 *
 * Run with: deno task test tests/api_routes_test.ts
 */

import {
  assertEquals,
  assertExists,
  assert,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';

const BASE_URL = Deno.env.get('TEST_BASE_URL') || 'http://localhost:8393';

console.log(`
===========================================
API Routes Test Suite
===========================================
Target: ${BASE_URL}
===========================================
`);

// ============================================================================
// GET /api/health
// ============================================================================

Deno.test({
  name: 'Health - Should return JSON with status field',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/health`);

    const contentType = response.headers.get('Content-Type');
    assertStringIncludes(contentType || '', 'application/json');

    const data = await response.json();
    assertExists(data.status);
    // status should be 'ok', 'degraded', or 'error'
    assert(
      ['ok', 'degraded', 'error'].includes(data.status),
      `Unexpected health status: ${data.status}`
    );
  },
});

Deno.test({
  name: 'Health - Should include databaseTime when healthy',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/health`);

    const data = await response.json();
    if (data.status === 'ok') {
      assertExists(data.databaseTime, 'Healthy response should include databaseTime');
      // Verify it's a valid ISO date string
      const parsed = new Date(data.databaseTime);
      assert(!isNaN(parsed.getTime()), 'databaseTime should be valid ISO date');
    }
  },
});

Deno.test({
  name: 'Health - Should only respond to GET',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/health`, {
      method: 'POST',
    });

    await response.body?.cancel();
    // Fresh returns 405 for wrong method or falls through to 404
    assert(response.status >= 400, `Expected 4xx, got ${response.status}`);
  },
});

// ============================================================================
// GET /api/metrics
// ============================================================================

Deno.test({
  name: 'Metrics - Should return JSON with currentHour and history',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/metrics`);

    assertEquals(response.status, 200);

    const contentType = response.headers.get('Content-Type');
    assertStringIncludes(contentType || '', 'application/json');

    const data = await response.json();
    assertExists(data.currentHour, 'Should include currentHour');
    assertExists(data.history, 'Should include history');
    assertExists(data._note, 'Should include privacy note');
  },
});

Deno.test({
  name: 'Metrics - Should set public cache headers',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/metrics`);

    await response.body?.cancel();
    const cacheControl = response.headers.get('Cache-Control');
    assertExists(cacheControl, 'Should have Cache-Control header');
    assertStringIncludes(cacheControl!, 'public');
    assertStringIncludes(cacheControl!, 'max-age=60');
  },
});

Deno.test({
  name: 'Metrics - Should only respond to GET',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/metrics`, {
      method: 'POST',
    });

    await response.body?.cancel();
    assert(response.status >= 400, `Expected 4xx, got ${response.status}`);
  },
});

// ============================================================================
// POST /api/metrics/increment
// ============================================================================

Deno.test({
  name: 'Metrics Increment - Should accept allowlisted metric',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/metrics/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: 'funnel.gate.viewed' }),
    });

    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.ok, true);
  },
});

Deno.test({
  name: 'Metrics Increment - Should silently accept disallowed metric (no leaking allowlist)',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/metrics/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: 'definitely.not.an.allowed.metric' }),
    });

    // Must return 200 to avoid leaking allowlist via status codes
    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.ok, true);
  },
});

Deno.test({
  name: 'Metrics Increment - Should handle missing metric field gracefully',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/metrics/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.ok, true);
  },
});

Deno.test({
  name: 'Metrics Increment - Should handle invalid JSON gracefully',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/metrics/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all',
    });

    // Should return 200 even on parse failure (security: don't reveal internals)
    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.ok, true);
  },
});

Deno.test({
  name: 'Metrics Increment - Should set no-store cache headers',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/metrics/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: 'funnel.gate.viewed' }),
    });

    await response.body?.cancel();
    const cacheControl = response.headers.get('Cache-Control');
    assertExists(cacheControl, 'Should have Cache-Control header');
    assertStringIncludes(cacheControl!, 'no-store');
  },
});

Deno.test({
  name: 'Metrics Increment - Should handle non-string metric type',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/metrics/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: 12345 }),
    });

    assertEquals(response.status, 200);

    const data = await response.json();
    assertEquals(data.ok, true);
  },
});

// ============================================================================
// POST /api/gate
// ============================================================================

Deno.test({
  name: 'Gate - Should reject invalid JSON',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid JSON');
  },
});

Deno.test({
  name: 'Gate - Should reject missing required fields',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid request format');
  },
});

Deno.test({
  name: 'Gate - Should reject empty gateToken',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gateToken: '',
        questionIndex: 0,
        answer: 'test',
        skipped: false,
      }),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid request format');
  },
});

Deno.test({
  name: 'Gate - Should reject out-of-range questionIndex',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // questionIndex must be 0 or 1
    for (const questionIndex of [-1, 2, 99]) {
      const response = await fetch(`${BASE_URL}/api/gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateToken: 'test-token-abc',
          questionIndex,
          answer: 'test answer',
          skipped: false,
        }),
      });

      assertEquals(response.status, 400, `Should reject questionIndex ${questionIndex}`);
      await response.body?.cancel();
    }
  },
});

Deno.test({
  name: 'Gate - Should reject answer exceeding 20000 chars',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gateToken: 'test-token-abc',
        questionIndex: 0,
        answer: 'x'.repeat(20001),
        skipped: false,
      }),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid request format');
  },
});

Deno.test({
  name: 'Gate - Should reject gateToken exceeding 128 chars',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gateToken: 'x'.repeat(129),
        questionIndex: 0,
        answer: 'test',
        skipped: false,
      }),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid request format');
  },
});

Deno.test({
  name: 'Gate - Should reject non-boolean skipped field',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gateToken: 'test-token-abc',
        questionIndex: 0,
        answer: 'test',
        skipped: 'yes',
      }),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid request format');
  },
});

// ============================================================================
// POST /api/gate-submit
// ============================================================================

Deno.test({
  name: 'Gate Submit - Should reject invalid JSON',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid JSON body');
  },
});

Deno.test({
  name: 'Gate Submit - Should reject missing email',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer1: 'test', answer2: 'test' }),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Email required');
  },
});

Deno.test({
  name: 'Gate Submit - Should reject empty email',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '' }),
    });

    assertEquals(response.status, 400);
    await response.body?.cancel();
  },
});

Deno.test({
  name: 'Gate Submit - Should reject invalid email format',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const invalidEmails = ['notanemail', '@no-local.com', 'spaces in@email.com'];

    for (const email of invalidEmails) {
      const response = await fetch(`${BASE_URL}/api/gate-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      assertEquals(response.status, 400, `Should reject email: ${email}`);
      await response.body?.cancel();
    }
  },
});

Deno.test({
  name: 'Gate Submit - Should reject XSS in email',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '<script>alert(1)</script>@example.com' }),
    });

    assertEquals(response.status, 400);
    await response.body?.cancel();
  },
});

Deno.test({
  name: 'Gate Submit - Should reject SQL injection in email',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: "'; DROP TABLE users; --@example.com" }),
    });

    assertEquals(response.status, 400);
    await response.body?.cancel();
  },
});

Deno.test({
  name: 'Gate Submit - Should return JSON content type',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/gate-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '' }),
    });

    const contentType = response.headers.get('Content-Type');
    await response.body?.cancel();
    assertStringIncludes(contentType || '', 'application/json');
  },
});

// ============================================================================
// POST /api/responses
// ============================================================================

Deno.test({
  name: 'Responses - Should reject invalid JSON',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid JSON body');
  },
});

Deno.test({
  name: 'Responses - Should reject missing email',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { q1: 'answer' } }),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid request format');
  },
});

Deno.test({
  name: 'Responses - Should reject invalid email format',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'notanemail', answers: {} }),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid request format');
  },
});

Deno.test({
  name: 'Responses - Should reject missing answers field',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid request format');
  },
});

Deno.test({
  name: 'Responses - Should reject empty request body',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assertEquals(response.status, 400);

    const data = await response.json();
    assertEquals(data.error, 'Invalid request format');
  },
});

// ============================================================================
// GET /api/questions/next
// ============================================================================

Deno.test({
  name: 'Questions Next - Should reject request without resume token',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/questions/next`);

    assertEquals(response.status, 401);

    const data = await response.json();
    assertStringIncludes(data.error, 'resume_token');
    assertExists(data.requestId);
  },
});

Deno.test({
  name: 'Questions Next - Should reject invalid resume token',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/questions/next`, {
      headers: { 'X-Resume-Token': 'completely-invalid-token' },
    });

    // Should be 404 (session not found) since the token won't hash to a valid session
    assertEquals(response.status, 404);

    const data = await response.json();
    assertStringIncludes(data.error, 'Session not found');
    assertExists(data.requestId);
  },
});

Deno.test({
  name: 'Questions Next - Should return JSON content type',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/questions/next`);

    const contentType = response.headers.get('Content-Type');
    await response.body?.cancel();
    assertStringIncludes(contentType || '', 'application/json');
  },
});

Deno.test({
  name: 'Questions Next - Should include X-Request-ID header',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await fetch(`${BASE_URL}/api/questions/next`);

    await response.body?.cancel();
    const requestId = response.headers.get('X-Request-ID');
    assertExists(requestId, 'Should include X-Request-ID header');
  },
});

// ============================================================================
// Cross-cutting: Method enforcement
// ============================================================================

Deno.test({
  name: 'Methods - POST-only endpoints should reject GET requests',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const postOnlyEndpoints = ['/api/gate', '/api/gate-submit', '/api/responses'];

    for (const endpoint of postOnlyEndpoints) {
      const response = await fetch(`${BASE_URL}${endpoint}`);

      await response.body?.cancel();
      assert(response.status >= 400, `GET ${endpoint} should be rejected, got ${response.status}`);
    }
  },
});

// ============================================================================
// Cross-cutting: Content-Type enforcement
// ============================================================================

Deno.test({
  name: 'Content-Type - All API responses should be JSON',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Test a sample of endpoints that should always return JSON
    const endpoints = [
      { url: `${BASE_URL}/api/health`, method: 'GET' },
      { url: `${BASE_URL}/api/metrics`, method: 'GET' },
    ];

    for (const { url, method } of endpoints) {
      const response = await fetch(url, { method });
      const contentType = response.headers.get('Content-Type');
      await response.body?.cancel();
      assertStringIncludes(
        contentType || '',
        'application/json',
        `${method} ${url} should return JSON`
      );
    }
  },
});

console.log(`
===========================================
API Routes Tests Complete
===========================================
`);
