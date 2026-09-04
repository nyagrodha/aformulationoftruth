/**
 * Next-question auth: resume capability lives in a header or cookie, never
 * in a query string. A session_id or email in the URL would be the exact
 * privacy break the opaque-token design exists to prevent.
 *
 *   deno test --allow-env --allow-read routes/api/questions/next_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import { handler } from './next.ts';

Deno.test('next GET - refuses a request with no resume token', async () => {
  const req = new Request('http://localhost/api/questions/next');
  const response = await handler.GET!(req, {} as never);
  assertEquals(response.status, 401);
  assertEquals((await response.json()).error, 'X-Resume-Token header or resume_token cookie required');
});

Deno.test('next GET - a session_id query parameter is not a resume token', async () => {
  const req = new Request(
    'http://localhost/api/questions/next?session_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&email=person@example.com',
  );
  const response = await handler.GET!(req, {} as never);
  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.error, 'X-Resume-Token header or resume_token cookie required');
});
