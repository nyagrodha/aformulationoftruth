/**
 * Tests for routes/questions.tsx
 *
 * GET /questions performs a temporary (307) redirect to the static
 * /questions.html page.
 *
 * Run with: deno task test
 */

import { assertEquals } from '$std/assert/mod.ts';
import { handler } from '../routes/questions.tsx';

Deno.test({
  name: 'questions: GET redirects with a 307 status code',
  async fn() {
    const req = new Request('http://localhost/questions');
    const response = await handler.GET!(req, {} as any);
    assertEquals(response.status, 307);
    await response.body?.cancel();
  },
});

Deno.test({
  name: 'questions: GET redirects to /questions.html on the same origin',
  async fn() {
    const req = new Request('http://localhost/questions');
    const response = await handler.GET!(req, {} as any);
    assertEquals(response.headers.get('location'), 'http://localhost/questions.html');
    await response.body?.cancel();
  },
});

Deno.test({
  name: 'questions: GET preserves the requesting origin (host/protocol) of a different host',
  async fn() {
    const req = new Request('https://aformulationoftruth.com/questions');
    const response = await handler.GET!(req, {} as any);
    assertEquals(response.headers.get('location'), 'https://aformulationoftruth.com/questions.html');
    await response.body?.cancel();
  },
});

Deno.test({
  name: 'questions: GET strips any query string or extra path segments from the original request',
  async fn() {
    const req = new Request('http://localhost/questions?ref=email&utm_source=x');
    const response = await handler.GET!(req, {} as any);
    assertEquals(response.headers.get('location'), 'http://localhost/questions.html');
    await response.body?.cancel();
  },
});

Deno.test({
  name: 'questions: redirect response has no body',
  async fn() {
    const req = new Request('http://localhost/questions');
    const response = await handler.GET!(req, {} as any);
    const text = await response.text();
    assertEquals(text, '');
  },
});