/**
 * /contact.html -- hermetic: a stand-in `ctx`, no server (see routes/e/[code]_test.ts).
 *
 * The page moved from public/contact.html to pages/contact.html (task 5c); this
 * pins that the route serves it back out byte for byte, at the same URL, with
 * the same status and content type it had as a static file.
 */
import { assertEquals } from '$std/assert/mod.ts';
import { handler } from './contact.html.ts';

Deno.test('GET /contact.html returns the page byte for byte', async () => {
  const res = await handler.GET!(new Request('http://localhost/contact.html'), {} as never);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('content-type')?.startsWith('text/html'), true);
  const body = new Uint8Array(await res.arrayBuffer());
  assertEquals(body, Deno.readFileSync('pages/contact.html'));
});
