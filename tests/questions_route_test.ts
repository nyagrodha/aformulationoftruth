/**
 * Questions Route Tests
 *
 * Tests routes/questions.tsx which:
 * GET /questions -> 307 redirect to /questions.html
 *
 * The redirect is a permanent-in-spirit but temporary (307) redirect so
 * that browsers preserve the request method if this route ever needs to
 * support more than GET in the future.
 */

import { assertEquals, assertExists, assertNotStrictEquals } from '$std/assert/mod.ts';
import { handler } from '../routes/questions.tsx';

Deno.test({
  name: 'questions route: only defines a GET handler',
  fn() {
    assertExists(handler.GET);
    assertEquals((handler as Record<string, unknown>).POST, undefined);
    assertEquals((handler as Record<string, unknown>).PUT, undefined);
    assertEquals((handler as Record<string, unknown>).DELETE, undefined);
  },
});

Deno.test({
  name: 'questions route: GET redirects to /questions.html with a 307 status',
  fn() {
    const req = new Request('http://localhost/questions');
    const response = handler.GET!(req, {} as any) as Response;

    assertEquals(response.status, 307);
    assertEquals(response.headers.get('location'), 'http://localhost/questions.html');
  },
});

Deno.test({
  name: 'questions route: redirect preserves the request origin (protocol + host + port)',
  fn() {
    const req = new Request('https://aformulationoftruth.com:8443/questions');
    const response = handler.GET!(req, {} as any) as Response;

    assertEquals(
      response.headers.get('location'),
      'https://aformulationoftruth.com:8443/questions.html',
    );
  },
});

Deno.test({
  name: 'questions route: redirect drops any query string and hash from the incoming request',
  fn() {
    const req = new Request('http://localhost/questions?ref=email&utm_source=x#anchor');
    const response = handler.GET!(req, {} as any) as Response;

    assertEquals(response.headers.get('location'), 'http://localhost/questions.html');
  },
});

Deno.test({
  name: 'questions route: redirect target is always /questions.html regardless of request pathname',
  fn() {
    // new URL('/questions.html', req.url) is resolved against the origin, so any
    // pathname on the incoming request still lands on the same absolute target.
    const req = new Request('http://localhost/some/nested/path');
    const response = handler.GET!(req, {} as any) as Response;

    assertEquals(response.headers.get('location'), 'http://localhost/questions.html');
  },
});

Deno.test({
  name: 'questions route: returns a distinct Response instance for every call',
  fn() {
    const req = new Request('http://localhost/questions');
    const first = handler.GET!(req, {} as any) as Response;
    const second = handler.GET!(req, {} as any) as Response;

    assertExists(first);
    assertExists(second);
    // Each call constructs a fresh redirect Response rather than reusing a cached one.
    assertNotStrictEquals(first, second);
  },
});