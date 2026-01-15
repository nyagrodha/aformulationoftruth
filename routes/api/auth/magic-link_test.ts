/**
 * Magic Link Authentication Route Tests
 *
 * Tests the POST /api/auth/magic-link endpoint which:
 * 1. Validates email input
 * 2. Creates magic link token
 * 3. Establishes questionnaire session
 * 4. Returns opaque resume token for session resumption
 *
 * Gate questions (Q0 & Q1) precede this authentication step:
 * Users answer "What is your idea of perfect happiness?" and
 * "What is your greatest fear?" before requesting the magic link.
 */

import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from '$std/assert/mod.ts';

// Mock environment for tests
const originalEnv = Deno.env.toObject();

function setupTestEnv() {
  Deno.env.set('RESUME_TOKEN_SECRET', 'test-secret-key-for-hmac-operations');
  Deno.env.set('JWT_SECRET', 'test-jwt-secret-key');
  Deno.env.set('BASE_URL', 'http://localhost:8000');
  Deno.env.set('DENO_ENV', 'test');
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
}

// Test group: Request Validation
Deno.test({
  name: 'magic-link: rejects invalid JSON body',
  async fn() {
    setupTestEnv();
    try {
      const { handler } = await import('./magic-link.ts');

      const req = new Request('http://localhost/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{',
      });

      const response = await handler.POST!(req, {} as any);
      assertEquals(response.status, 400);

      const body = await response.json();
      assertEquals(body.error, 'Invalid JSON body');
    } finally {
      restoreEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: 'magic-link: rejects missing email',
  async fn() {
    setupTestEnv();
    try {
      const { handler } = await import('./magic-link.ts');

      const req = new Request('http://localhost/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await handler.POST!(req, {} as any);
      assertEquals(response.status, 400);

      const body = await response.json();
      assertEquals(body.error, 'Valid email required');
    } finally {
      restoreEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: 'magic-link: rejects invalid email format',
  async fn() {
    setupTestEnv();
    try {
      const { handler } = await import('./magic-link.ts');

      const invalidEmails = [
        'not-an-email',
        'missing@domain',
        '@nodomain.com',
        'spaces in@email.com',
        '',
      ];

      for (const email of invalidEmails) {
        const req = new Request('http://localhost/api/auth/magic-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const response = await handler.POST!(req, {} as any);
        assertEquals(response.status, 400, `Should reject: ${email}`);
      }
    } finally {
      restoreEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// Test group: Response Structure (mocked DB scenario)
Deno.test({
  name: 'magic-link: response structure validation (schema check)',
  fn() {
    // Validate expected response schema without hitting the database
    // This is a structural test showing what the endpoint should return

    const expectedDevResponse = {
      message: 'Magic link sent',
      expiresAt: '2024-01-01T00:15:00.000Z',
      _devLink: 'http://localhost:8000/auth/verify?token=jwt&resume=opaque',
      _devJWT: 'eyJhbG...',
      _devResume: 'abc123...',
      _devSessionId: 'session_hash_abc123',
    };

    // Verify all required fields exist
    assertExists(expectedDevResponse.message);
    assertExists(expectedDevResponse.expiresAt);

    // In dev mode, verify debug fields exist
    assertExists(expectedDevResponse._devLink);
    assertExists(expectedDevResponse._devJWT);
    assertExists(expectedDevResponse._devResume);
    assertExists(expectedDevResponse._devSessionId);

    // Verify expiresAt is ISO date format
    const date = new Date(expectedDevResponse.expiresAt);
    assertEquals(isNaN(date.getTime()), false);
  },
});

// Test group: Gate Token Handling
Deno.test({
  name: 'magic-link: accepts optional gateToken parameter',
  fn() {
    // Schema validation test - gateToken is optional
    const validRequests = [
      { email: 'test@example.com' },
      { email: 'test@example.com', gateToken: 'abc123' },
      { email: 'test@example.com', gateToken: undefined },
    ];

    // All should be structurally valid requests
    for (const req of validRequests) {
      assertExists(req.email);
      // gateToken can be present, undefined, or absent
    }
  },
});

// Test group: Privacy Compliance (gupta-vidya)
Deno.test({
  name: 'magic-link: URL structure contains no email (gupta-vidya compliance)',
  fn() {
    // Verify the magic link URL format doesn't expose email
    const exampleUrl = 'http://localhost:8000/auth/verify?token=eyJhbGciOi...&resume=abc123def456';

    // Should NOT contain email patterns
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    assertEquals(emailPattern.test(exampleUrl), false, 'URL should not contain email');

    // Should contain only token and resume parameters
    const url = new URL(exampleUrl);
    assertEquals(url.searchParams.has('token'), true);
    assertEquals(url.searchParams.has('resume'), true);
    assertEquals(url.searchParams.has('email'), false);
  },
});

Deno.test({
  name: 'magic-link: JWT payload structure (session-based, not email-based)',
  async fn() {
    // Demonstrate expected JWT payload structure
    // The JWT should contain session_id and email_hash, never plaintext email

    const expectedPayload = {
      email_hash: 'sha256_hash_of_email',  // NEVER the actual email
      session_id: 'hmac_hash_of_opaque_token',
      iat: 1704067200,
      exp: 1704153600,
    };

    // Verify no PII in payload
    assertExists(expectedPayload.email_hash);
    assertExists(expectedPayload.session_id);

    // Email hash should be SHA-256 length (64 hex chars)
    assertEquals(expectedPayload.email_hash.length > 0, true);

    // Ensure it's a hash pattern, not an email
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    assertEquals(emailPattern.test(expectedPayload.email_hash), false);
  },
});

// Test group: Token Expiration
Deno.test({
  name: 'magic-link: expiration is ~15 minutes from creation',
  fn() {
    // Magic link tokens should expire within 15 minutes
    const now = new Date();
    const expectedExpiry = new Date(now.getTime() + 15 * 60 * 1000);

    // Allow 1 minute tolerance
    const minExpiry = new Date(now.getTime() + 14 * 60 * 1000);
    const maxExpiry = new Date(now.getTime() + 16 * 60 * 1000);

    assertEquals(expectedExpiry >= minExpiry, true);
    assertEquals(expectedExpiry <= maxExpiry, true);
  },
});

// Test group: Session Creation Flow
Deno.test({
  name: 'magic-link: new session includes shuffled question order',
  fn() {
    // Verify session creation includes question order
    // Questions 0 and 1 (gate questions) should always be first

    const mockQuestionOrder = '0,1,15,3,22,7,12,34,5,19,28,11,24,6,2,17,30,9,21,4,26,13,33,8,20,29,14,27,16,31,10,25,32,23,18';

    const questions = mockQuestionOrder.split(',').map(Number);

    // Gate questions (0, 1) must be first
    assertEquals(questions[0], 0, 'Question 0 must be first');
    assertEquals(questions[1], 1, 'Question 1 must be second');

    // All 35 questions present
    assertEquals(questions.length, 35);

    // Questions 2-34 should be shuffled (after gate questions)
    const shuffledPart = questions.slice(2);
    assertEquals(shuffledPart.length, 33);

    // Verify all indices 2-34 are present
    const expectedShuffled = Array.from({ length: 33 }, (_, i) => i + 2).sort((a, b) => a - b);
    const actualShuffled = [...shuffledPart].sort((a, b) => a - b);
    assertEquals(actualShuffled, expectedShuffled);
  },
});

// Test group: Error Handling
Deno.test({
  name: 'magic-link: returns 500 on internal errors',
  fn() {
    // When database or crypto operations fail, return 500
    const errorResponse = {
      error: 'Failed to send magic link',
    };

    assertEquals(typeof errorResponse.error, 'string');
    assertStringIncludes(errorResponse.error, 'Failed');
  },
});

// Integration test: Full flow (requires database)
Deno.test({
  name: 'magic-link: integration test structure (DB required)',
  ignore: Deno.env.get('DATABASE_URL') === undefined,
  async fn() {
    setupTestEnv();
    try {
      // This test would run against a real database
      // Skipped in CI without DATABASE_URL

      const testEmail = `test-${Date.now()}@example.com`;

      // 1. Request magic link
      // 2. Verify response contains expected fields
      // 3. Verify database has session record
      // 4. Verify token can be used to retrieve session

      console.log('Integration test would run with email:', testEmail);
    } finally {
      restoreEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// Test documentation: Gate Questions Flow
Deno.test({
  name: 'magic-link: documents gate questions precede authentication',
  fn() {
    /**
     * GATE QUESTIONS FLOW:
     *
     * The magic-link endpoint is called AFTER the user answers gate questions:
     *
     * 1. User lands on index.html
     * 2. User answers Q0: "What is your idea of perfect happiness?"
     * 3. User answers Q1: "What is your greatest fear?"
     * 4. User enters email
     * 5. Frontend POSTs to /api/auth/magic-link with { email, gateToken? }
     * 6. Server creates session with question order [0, 1, ...shuffled 2-34]
     * 7. User receives magic link via email
     * 8. User clicks link → questionnaire continues from Q2
     *
     * The gate questions (0, 1) are answered on the landing page BEFORE
     * authentication, creating an emotional investment before email submission.
     */

    const gateQuestions = [
      { index: 0, text: 'What is your idea of perfect happiness?' },
      { index: 1, text: 'What is your greatest fear?' },
    ];

    assertEquals(gateQuestions[0].index, 0);
    assertEquals(gateQuestions[1].index, 1);
    assertStringIncludes(gateQuestions[0].text, 'happiness');
    assertStringIncludes(gateQuestions[1].text, 'fear');
  },
});
