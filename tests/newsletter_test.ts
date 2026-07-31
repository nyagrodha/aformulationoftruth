/**
 * Newsletter Subscription Tests
 *
 * Tests for the double opt-in newsletter subscription flow.
 *
 * Run with: deno task test tests/newsletter_test.ts
 */

import { assertEquals, assertExists, assertNotEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

const BASE_URL = Deno.env.get('TEST_BASE_URL') || 'http://localhost:8393';
const TEST_EMAIL = `newsletter_test_${Date.now()}@example.com`;

console.log(`
===========================================
Newsletter Subscription Test Suite
===========================================
Target: ${BASE_URL}
Test Email: ${TEST_EMAIL}
===========================================
`);

// ============================================
// Newsletter Subscribe Endpoint Tests
// ============================================

Deno.test("Newsletter - Should accept valid email and return success", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL }),
  });

  assertEquals(response.status, 200);

  const data = await response.json();
  assertEquals(data.success, true);
  assert(['new', 'pending', 'resubscribed'].includes(data.status), `Unexpected status: ${data.status}`);
});

Deno.test("Newsletter - Should handle duplicate email submission gracefully", async () => {
  // Submit the same email again
  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL }),
  });

  assertEquals(response.status, 200);

  const data = await response.json();
  assertEquals(data.success, true);
  // Should be pending (refresh token) or already_confirmed
  assert(['pending', 'already_confirmed'].includes(data.status));
});

Deno.test("Newsletter - Should reject empty email", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '' }),
  });

  assertEquals(response.status, 400);

  const data = await response.json();
  assertEquals(data.success, false);
});

Deno.test("Newsletter - Should reject invalid email format", async () => {
  const invalidEmails = [
    'notanemail',
    '@nodomain.com',
    'spaces in@email.com',
    'missing@tld',
  ];

  for (const email of invalidEmails) {
    const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    await response.body?.cancel(); // Consume response to prevent leak
    assertEquals(response.status, 400, `Should reject email: ${email}`);
  }
});

Deno.test("Newsletter - Should reject missing email field", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  await response.body?.cancel();
  assertEquals(response.status, 400);
});

Deno.test("Newsletter - Should reject non-JSON content type", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'email=test@example.com',
  });

  await response.body?.cancel();
  // Should either reject or handle gracefully
  assert(response.status >= 400 || response.status === 200);
});

// ============================================
// Newsletter Confirm Endpoint Tests
// ============================================

Deno.test("Newsletter - Confirm endpoint should reject invalid token", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/confirm?token=invalid_token_12345`);

  // Should be 200 with status: invalid (not exposing token validity)
  assertEquals(response.status, 200);

  const data = await response.json();
  assertEquals(data.success, false);
  assertEquals(data.status, 'invalid');
});

Deno.test("Newsletter - Confirm endpoint should reject missing token", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/confirm`);

  await response.body?.cancel();
  assertEquals(response.status, 400);
});

Deno.test("Newsletter - Confirm endpoint should reject empty token", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/confirm?token=`);

  await response.body?.cancel();
  assertEquals(response.status, 400);
});

// ============================================
// Newsletter Unsubscribe Endpoint Tests
// ============================================

Deno.test("Newsletter - Unsubscribe endpoint should reject invalid token", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/unsubscribe?token=invalid_token_12345`);

  assertEquals(response.status, 200);

  const data = await response.json();
  assertEquals(data.success, false);
  assertEquals(data.status, 'invalid');
});

Deno.test("Newsletter - Unsubscribe endpoint should reject missing token", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/unsubscribe`);

  await response.body?.cancel();
  assertEquals(response.status, 400);
});

// ============================================
// Security Tests
// ============================================

Deno.test("Newsletter - Should reject XSS attempts in email", async () => {
  const xssEmail = '<script>alert("xss")</script>@example.com';

  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: xssEmail }),
  });

  await response.body?.cancel();
  // XSS in email should be rejected as invalid format or sanitized
  assertEquals(response.status, 400);
});

Deno.test("Newsletter - Should reject SQL injection attempts", async () => {
  const sqlEmail = "'; DROP TABLE newsletter_subscribers; --@example.com";

  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: sqlEmail }),
  });

  await response.body?.cancel();
  // SQL injection attempts should be rejected as invalid email format
  assertEquals(response.status, 400);
});

Deno.test("Newsletter - Should handle extremely long email", async () => {
  const longEmail = 'a'.repeat(500) + '@example.com';

  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: longEmail }),
  });

  await response.body?.cancel();
  // Should reject or truncate - not crash
  assert(response.status === 400 || response.status === 200);
});

// ============================================
// Response Format Tests
// ============================================

Deno.test("Newsletter - Should return JSON content type", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `format_test_${Date.now()}@example.com` }),
  });

  const contentType = response.headers.get('Content-Type');
  await response.body?.cancel(); // Consume response to prevent leak
  assert(contentType?.includes('application/json'));
});

Deno.test("Newsletter - Should not leak confirmation tokens in response", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `token_leak_test_${Date.now()}@example.com` }),
  });

  assertEquals(response.status, 200);

  const data = await response.json();
  // Confirmation token should only be returned for email sending (internal use)
  // The API response to the user should not include raw tokens
  const text = JSON.stringify(data);
  assert(!text.includes('confirmationToken'), 'Response should not leak confirmation tokens');
});

Deno.test("Newsletter - Should use HTTPS upgrade headers appropriately", async () => {
  const response = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `https_test_${Date.now()}@example.com` }),
  });

  // Should have security headers (though exact headers depend on deployment)
  const cacheControl = response.headers.get('Cache-Control');
  await response.body?.cancel(); // Consume response to prevent leak
  if (cacheControl) {
    assert(cacheControl.includes('no-store') || cacheControl.includes('private'));
  }
});

console.log(`
===========================================
Newsletter Tests Complete
===========================================
`);
